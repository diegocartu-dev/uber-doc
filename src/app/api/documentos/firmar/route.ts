// POST /api/documentos/firmar
//
// Sella electrónicamente los documentos que el médico acaba de emitir al
// finalizar una consulta o un turno.
//
// Por qué existe: cuando los documentos se insertan, el médico ya fue redirigido
// al dashboard (el guardado es fire-and-forget). La firma no puede depender de
// que siga en pantalla, así que se ejecuta del lado del SERVIDOR, atribuida a la
// sesión autenticada con la que tocó "Finalizar consulta" — que es el acto de
// voluntad sobre el contenido que tenía a la vista (dictamen legal 07/08/2026,
// art. 5 Ley 25.506).
//
// REGLA DURA: este endpoint jamás bloquea ni revierte la entrega del documento.
// Si la firma falla, el documento ya está guardado y visible para el paciente;
// queda sin sello y el PDF lo dice explícitamente. Los fallos se loguean.
//
// LO QUE ESTE ENDPOINT NO ES: una máquina de sellar el pasado. Solo alcanza
// documentos clínicos (`TIPOS_FIRMABLES`), del médico de la sesión, sin sello y
// emitidos dentro de `VENTANA_FIRMA_MS`. Los 114 históricos quedan "sin sello"
// a propósito: re-emitirlos exige que el médico revise y reafirme el contenido
// (dictamen 07/08/2026, punto 4), no un POST.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { firmarDocumentoPorSesion, TIPOS_FIRMABLES } from "@/lib/firma/documento";
import { provisionarClaves, tieneClaves } from "@/lib/firma/claves";

// Techo defensivo: una consulta emite como mucho 4 documentos (receta,
// indicaciones, certificado, orden).
const MAX_DOCUMENTOS = 10;

/**
 * Ventana de recencia. Este endpoint sella lo que el médico ACABA de emitir:
 * los documentos se insertan y la firma sale segundos después, en el mismo
 * cierre. Sin ventana, un POST con `documentoIds` sellaría hoy cualquier
 * documento histórico del médico — exactamente lo que el dictamen prohíbe
 * (punto 4: los certificados solo se re-emiten "por el mismo médico, que revise
 * y reafirme el contenido"). 30 minutos cubre con holgura una pestaña lenta o
 * un keepalive demorado, y deja fuera los 114 históricos.
 */
const VENTANA_FIRMA_MS = 30 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = {
  consultaId?: string;
  tipo?: "consulta" | "turno";
  documentoIds?: string[];
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  // Solo columnas con GRANT para authenticated (ver regla de grants en CLAUDE.md).
  const { data: medico } = await supabase
    .from("medicos")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!medico) {
    return NextResponse.json({ ok: false, error: "No es médico" }, { status: 403 });
  }

  // Gate de estado del firmante. La firma se atribuye a la matrícula del médico:
  // un médico rechazado o suspendido no puede seguir sellando documentos con
  // ella. `refeps_validado` y `estado_registro` se leen con service role porque
  // `medicos` no tiene GRANT de esas columnas para `authenticated` (CLAUDE.md).
  // Cuentas de test quedan exentas de REFEPS, igual que el constraint de DB.
  const admin = createAdminClient();
  const { data: estadoMedico, error: errorEstado } = await admin
    .from("medicos")
    .select("estado_registro, refeps_validado, es_cuenta_test")
    .eq("id", medico.id)
    .maybeSingle();

  const habilitadoParaFirmar =
    !!estadoMedico &&
    estadoMedico.estado_registro === "aprobado" &&
    (estadoMedico.refeps_validado === true || estadoMedico.es_cuenta_test === true);

  if (!habilitadoParaFirmar) {
    // 200 a propósito: el documento ya está guardado y entregado. Este endpoint
    // NUNCA escala un error al médico ni bloquea nada; queda "sin sello".
    console.error(
      `[firmar-docs] médico ${medico.id} no habilitado para firmar (estado=${estadoMedico?.estado_registro ?? "?"}, refeps=${estadoMedico?.refeps_validado ?? "?"}${errorEstado ? `, error=${errorEstado.message}` : ""})`
    );
    return NextResponse.json({ ok: false, error: "Médico no habilitado para firmar", firmados: 0 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "no-informada";
  const userAgent = req.headers.get("user-agent") || "no-informado";

  try {
    const { ids, error: errorBusqueda } = await resolverDocumentos(medico.id, body);

    if (errorBusqueda) {
      // "No pude buscar" ≠ "no había nada que firmar". Antes las dos cosas
      // devolvían {ok:true, firmados:0} y una regresión de query era invisible.
      console.error("[firmar-docs] no se pudieron resolver los documentos:", errorBusqueda);
      return NextResponse.json({
        ok: false,
        error: "No se pudieron resolver los documentos a firmar",
        detalle: errorBusqueda,
        firmados: 0,
      });
    }

    if (ids.length === 0) {
      return NextResponse.json({ ok: true, firmados: 0, resultados: [] });
    }

    // Médicos anteriores al provisionamiento automático pueden no tener par de
    // claves. Se genera acá antes de firmar (idempotente).
    if (!(await tieneClaves(medico.id))) {
      await provisionarClaves(medico.id);
    }

    const resultados: { id: string; ok: boolean; error?: string }[] = [];
    for (const documentoId of ids) {
      const r = await firmarDocumentoPorSesion(documentoId, medico.id, {
        userId: user.id,
        ip,
        userAgent,
      });
      if (r.ok) {
        resultados.push({ id: documentoId, ok: true });
      } else {
        resultados.push({ id: documentoId, ok: false, error: r.error });
        console.error(`[firmar-docs] documento ${documentoId} sin firmar: ${r.error}`);
      }
    }

    return NextResponse.json({
      ok: true,
      firmados: resultados.filter((r) => r.ok).length,
      resultados,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error desconocido";
    // El documento ya está entregado: este fallo no puede escalar al usuario.
    console.error("[firmar-docs] fallo general de firma:", msg);
    return NextResponse.json({ ok: false, error: "No se pudo firmar", detalle: msg }, { status: 200 });
  }
}

/**
 * Resuelve qué documentos hay que firmar, siempre acotado a:
 *   - el médico de la sesión (control de autorización),
 *   - documentos clínicos revisados (`TIPOS_FIRMABLES`, ver más abajo),
 *   - sin sello previo,
 *   - emitidos dentro de la ventana de recencia (no se sella lo histórico).
 *
 * Devuelve el error de la query en vez de tragárselo: "no pude buscar" y "no
 * había nada" no pueden ser la misma respuesta.
 */
async function resolverDocumentos(
  medicoId: string,
  body: Body
): Promise<{ ids: string[]; error?: string }> {
  const admin = createAdminClient();
  const desde = new Date(Date.now() - VENTANA_FIRMA_MS).toISOString();

  // Se firma SOLO lo que el médico redactó y tuvo a la vista. `documentos`
  // también recibe filas de tracking de otros caminos (p. ej.
  // /api/consulta/enviar-documento-medico inserta tipo 'documento_medico' con
  // contenido "Documento enviado: archivo.pdf"): sellar eso haría que
  // /verificar diga "Documento verificado" sobre un nombre de archivo.
  const tipos = [...TIPOS_FIRMABLES];

  if (Array.isArray(body.documentoIds) && body.documentoIds.length > 0) {
    const pedidos = body.documentoIds.filter((id) => typeof id === "string" && UUID_RE.test(id)).slice(0, MAX_DOCUMENTOS);
    if (pedidos.length === 0) return { ids: [] };

    // El filtro por medico_id es el control de autorización: nadie firma
    // documentos ajenos aunque mande el id.
    const { data, error } = await admin
      .from("documentos")
      .select("id")
      .in("id", pedidos)
      .eq("medico_id", medicoId)
      .in("tipo", tipos)
      .is("firma_digital", null)
      .gte("created_at", desde);

    if (error) return { ids: [], error: error.message };
    return { ids: (data ?? []).map((d) => d.id) };
  }

  const anclaId = body.consultaId;
  if (!anclaId || !UUID_RE.test(anclaId)) return { ids: [] };

  const columna = body.tipo === "turno" ? "turno_id" : "consulta_id";
  const { data, error } = await admin
    .from("documentos")
    .select("id")
    .eq(columna, anclaId)
    .eq("medico_id", medicoId)
    .in("tipo", tipos)
    .is("firma_digital", null)
    .gte("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(MAX_DOCUMENTOS);

  if (error) return { ids: [], error: error.message };
  return { ids: (data ?? []).map((d) => d.id) };
}
