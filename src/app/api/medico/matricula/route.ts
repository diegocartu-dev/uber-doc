import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";
import { cambiarMatriculaValidada } from "@/lib/medicos/cambiar-matricula-validada";
import { mensajeParaProfesional, ubicarEleccion } from "@/lib/medicos/matricula-perfil";
import { etiquetaMatricula } from "@/lib/medicos/matricula-refeps";

/**
 * El profesional, con la identidad ya validada, pasa a otra de las matrículas que
 * REFEPS le tiene habilitadas (Diego, 13/11/2026: "¿no debería poder hacerlo el
 * profesional de acuerdo a los números que le validó REFEPS?" · "solo puede
 * cambiar entre matrículas validadas por REFEPS").
 *
 * No recibe ningún número para escribir: recibe cuál de las que se le ofrecieron
 * eligió. Dos controles, en este orden:
 *   1. tiene que ser una de las que su ficha tiene guardadas de REFEPS (lo mismo
 *      que le mostró la pantalla): lo demás se rechaza sin consultar a nadie;
 *   2. la puerta (`cambiarMatriculaValidada`) confirma el DNI con la biometría y
 *      vuelve a consultar REFEPS en vivo: solo pasa una matrícula habilitada, de
 *      su profesión, para ese DNI. El DNI no se toca y su estado no cambia.
 *
 * La matrícula es una columna de confianza: la sesión del usuario no la puede
 * escribir. Se escribe con service role, sobre la ficha de `user.id`.
 * Solo B2C: en la instancia institucional la ficha la lleva la institución.
 */
// La biometría y REFEPS se consultan en cadena y el Bus puede tardar (mismo valor
// que la ruta del panel, que hace la misma cadena): sin esto Vercel corta antes.
export const maxDuration = 120;

const ELEGI_DE_LA_LISTA = "Elegí una de las matrículas de la lista. Si no la ves, recargá la página.";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Tu sesión venció. Volvé a ingresar." }, { status: 401 });
  if (esInstitucional()) {
    return NextResponse.json({ error: mensajeParaProfesional("no_disponible") }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as { tipo?: unknown; numero?: unknown; confirmado?: unknown } | null;
  const tipo = typeof body?.tipo === "string" ? body.tipo.trim() : "";
  const numero = typeof body?.numero === "string" ? body.numero.trim() : "";
  if (!tipo || !numero || body?.confirmado !== true) {
    return NextResponse.json({ error: ELEGI_DE_LA_LISTA }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: ficha, error } = await admin
    .from("medicos")
    .select(
      "id, tipo_matricula, numero_matricula, provincia_matricula, identidad_validada, didit_status, refeps_data, es_cuenta_test, profesion"
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("[medico/matricula] no se pudo leer la ficha:", error.message, { userId: user.id });
    return NextResponse.json({ error: mensajeParaProfesional("transitorio") }, { status: 500 });
  }
  if (!ficha) return NextResponse.json({ error: "No encontramos tu ficha de profesional." }, { status: 404 });

  // Sin consultar a nadie: lo que no es una de sus opciones se corta acá, y a cada
  // caso se le dice lo que es (no "REFEPS no la tiene" sin haberle preguntado).
  const eleccion = ubicarEleccion(ficha, false, { tipo, numero });
  if (eleccion.es === "no_disponible") {
    return NextResponse.json({ error: mensajeParaProfesional("no_disponible") }, { status: 409 });
  }
  if (eleccion.es === "la_suya") {
    return NextResponse.json({ error: mensajeParaProfesional("ya_es"), recargar: true }, { status: 409 });
  }
  if (eleccion.es === "fuera_de_lista") {
    return NextResponse.json({ error: ELEGI_DE_LA_LISTA, recargar: true }, { status: 409 });
  }
  const { opcion } = eleccion;

  const cambio = await cambiarMatriculaValidada(
    admin,
    ficha.id as string,
    { tipo: opcion.tipo, numero: opcion.numero },
    { adminUserId: null, motivo: "Elegida por el profesional desde Mi perfil", actor: "profesional" }
  );
  if (!cambio.ok) {
    console.warn("[medico/matricula] no se cambió:", cambio.codigo, { medicoId: ficha.id });
    // La lista que tiene en pantalla puede haber quedado vieja: que la vuelva a pedir.
    const recargar = cambio.codigo === "no_habilitada" || cambio.codigo === "ya_es" || cambio.codigo === "cambio_mientras";
    return NextResponse.json({ error: mensajeParaProfesional(cambio.codigo), recargar }, { status: cambio.status });
  }
  console.info("[medico/matricula] el profesional cambió su matrícula", { medicoId: ficha.id });
  return NextResponse.json({ ok: true, etiqueta: etiquetaMatricula(cambio.nueva) });
}
