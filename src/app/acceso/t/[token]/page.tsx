export const dynamic = "force-dynamic";

// /acceso/t/[token] — LA PUERTA. Donde aterriza el link que el paciente recibe
// por WhatsApp o mail (spec institucional §5.2, mock 02-paciente §2).
//
// ── POR QUÉ ESTA PÁGINA NO CREA LA SESIÓN ────────────────────────────────────
// El bot de preview de WhatsApp hace un GET a todo link que se manda por el
// chat. Si el GET creara la sesión (o consumiera el token), el link llegaría
// quemado antes de que el paciente lo toque — que es exactamente lo que hundió
// a las opciones (A) y (B) evaluadas en la spec.
//
// Por eso el GET es un INTERSTICIAL mudo: valida el token para saber qué
// mostrar, pero no escribe NADA. La sesión se mintea en el POST del botón
// (`/acceso/entrar`, path fijo, con el token en un campo oculto), o sea después
// de un gesto del usuario — que además es lo que la regla iOS pide para todo lo
// que termina pidiendo cámara y micrófono.
//
// El token NO se consume: cada toque mintea una sesión fresca (multi-click
// gratis). Un link vencido/revocado/reprogramado muestra SIEMPRE el mismo
// estado F, sin decir cuál de los cuatro fue (nada de oráculos).
//
// SOLO instancia institucional: en B2C es 404.

import { notFound } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { validarTokenAcceso } from "@/lib/institucional/accesos";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatNombreMedico } from "@/lib/utils/texto";
import { fechaLabelAR } from "@/lib/institucional/avisos";
import { MarcoPaciente, LinkInactivo } from "@/components/institucional/PantallaPaciente";
import { metadataPacienteInstitucional } from "@/lib/institucional/metadata";

// Sin esto, el bot de preview de WhatsApp arma la tarjeta del chat con el
// título y la descripción del B2C — la marca de Docto sobre el mensaje de la
// institución. Ver src/lib/institucional/metadata.ts.
export const generateMetadata = metadataPacienteInstitucional;

const primerNombre = (n: string | null | undefined): string =>
  (n ?? "").trim().split(/\s+/)[0] || "";

interface Encabezado {
  saludo: string;
  titulo: string;
  cuando: string | null;
  profesional: string;
}

/**
 * Lo mínimo para que el paciente reconozca SU turno antes de tocar el botón.
 * Service role: acá todavía no hay sesión de nadie (esa es la gracia).
 * Nunca lanza — sin datos, el intersticial sale genérico y el botón sigue vivo.
 */
async function encabezadoDelAcceso(acceso: {
  pacienteId: string | null;
  medicoId: string | null;
  turnoId: string | null;
  consultaId: string | null;
}): Promise<Encabezado> {
  const generico: Encabezado = {
    saludo: "",
    titulo: "Tu consulta médica",
    cuando: null,
    profesional: "",
  };
  try {
    const admin = createAdminClient();

    // Sujeto PROFESIONAL (migración 026): su intersticial no habla de un turno
    // —no tiene— sino de lo que va a encontrar del otro lado.
    if (acceso.medicoId) {
      const { data: medico } = await admin
        .from("medicos")
        .select("nombre_completo, titulo, especialidad")
        .eq("id", acceso.medicoId)
        .maybeSingle();
      return {
        saludo: primerNombre(medico?.nombre_completo),
        titulo: "Tu espacio de trabajo",
        cuando: medico?.especialidad ?? null,
        profesional: "",
      };
    }

    const { data: paciente } = await admin
      .from("pacientes")
      .select("nombre_completo")
      .eq("id", acceso.pacienteId!)
      .maybeSingle();
    const saludo = primerNombre(paciente?.nombre_completo);

    // Paciente con enlace emitido antes de que le asignen el encuentro (demo):
    // se lo saluda y se le dice qué va a pasar, sin inventar una fecha.
    if (!acceso.turnoId && !acceso.consultaId) {
      return {
        saludo,
        titulo: "Tu consulta médica",
        cuando: null,
        profesional: "",
      };
    }

    const encuentro = acceso.turnoId
      ? await admin
          .from("turnos")
          .select("fecha, hora_inicio, medico_id")
          .eq("id", acceso.turnoId)
          .maybeSingle()
      : await admin
          .from("consultas")
          .select("medico_id")
          .eq("id", acceso.consultaId!)
          .maybeSingle();

    const medicoId = (encuentro.data as { medico_id?: string } | null)?.medico_id;
    let profesional = "";
    let especialidad = "";
    if (medicoId) {
      const { data: medico } = await admin
        .from("medicos")
        .select("nombre_completo, titulo, especialidad")
        .eq("id", medicoId)
        .maybeSingle();
      profesional = formatNombreMedico(medico?.nombre_completo ?? "", medico?.titulo ?? null);
      especialidad = medico?.especialidad ?? "";
    }

    if (acceso.turnoId) {
      const turno = encuentro.data as { fecha?: string; hora_inicio?: string } | null;
      const cuando =
        turno?.fecha && turno?.hora_inicio
          ? `${fechaLabelAR(turno.fecha)} — ${turno.hora_inicio.slice(0, 5)} hs`
          : null;
      return {
        saludo,
        titulo: especialidad ? `Tu turno de ${especialidad}` : "Tu turno médico",
        cuando,
        profesional,
      };
    }
    return {
      saludo,
      titulo: especialidad ? `Tu consulta de ${especialidad}` : "Tu consulta médica",
      cuando: "Podés entrar ahora",
      profesional,
    };
  } catch (err) {
    console.error("[acceso] No se pudo armar el intersticial:", err);
    return generico;
  }
}

export default async function AccesoLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!esInstitucional()) notFound();

  const { token } = await params;
  const config = await getConfigInstitucion();

  const validacion = await validarTokenAcceso(token);

  if (!validacion.ok) {
    // Estado F — una sola respuesta para los cuatro motivos (ver el módulo).
    return (
      <LinkInactivo
        telefonoAyuda={config.telefono_ayuda}
        hrefReenvio="/acceso/reenviar"
        cooldownMinutos={config.reenvio_cooldown_minutos}
      />
    );
  }

  const enc = await encabezadoDelAcceso(validacion.acceso);

  return (
    <MarcoPaciente>
      {enc.saludo && <div className="pac-hola">Hola, {enc.saludo}</div>}
      <div className="pac-titulo">{enc.titulo}</div>
      {enc.cuando && <div className="pac-fecha tnum">{enc.cuando}</div>}
      {enc.profesional && <div className="pac-prof nw">{enc.profesional}</div>}

      {/* El botón es un submit de un form nativo: sin JavaScript de por medio,
          funciona igual en el webview de WhatsApp que en el navegador.

          El token va en un campo OCULTO y el action es un path FIJO. En el GET
          no hay alternativa (el link es la URL), pero el POST que crea la
          sesión no tiene por qué llevar la credencial en el path: ahí la
          registran los logs de acceso de la plataforma, y cada redirect de
          fallo la devolvía además en el header `Location`. */}
      <form method="POST" action="/acceso/entrar">
        <input type="hidden" name="t" value={token} />
        <button type="submit" className="pac-cta">
          Entrar
        </button>
      </form>
      <div className="pac-micro">Sin usuario ni contraseña. Solo tocá el botón.</div>
    </MarcoPaciente>
  );
}
