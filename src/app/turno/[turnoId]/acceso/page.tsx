export const dynamic = "force-dynamic";

// /turno/[turnoId]/acceso — LA pantalla del paciente institucional.
// Transplante del mock aprobado (mocks/02-paciente.html §2): un solo layout,
// seis estados. Acá aterriza el paciente después de tocar "Entrar" en el link.
//
// Por qué NO reusa /turno/[turnoId]/espera (la sala de espera del B2C): esa
// pantalla tiene barra con logo y un link "Inicio" — o sea, salidas de
// navegación. La regla de esta pantalla (03-spec §2.3) es que no las tenga:
// el paciente entró por un link, no tiene sesión que administrar, no hay
// ningún otro lugar del sitio al que deba ir. Lo que sí se reusa es lo que
// IMPORTA: el server action que lo mete en la sala de espera (mismo aviso al
// profesional que en el B2C) y, cuando el video arranca, /turno/[id]/sala tal
// cual está — el canal clínico no se toca.
//
// SOLO instancia institucional: en B2C es 404.

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esInstitucional } from "@/lib/instancia";
import { getBrandingInstitucion } from "@/lib/institucional/config";
import { pantallaDelTurno, instanteAR } from "@/lib/institucional/pantalla-turno";
import { fechaLabelAR } from "@/lib/institucional/avisos";
import { formatNombreMedico } from "@/lib/utils/texto";
import { LinkInactivo } from "@/components/institucional/PantallaPaciente";
import AccesoTurnoClient from "./AccesoTurnoClient";

const primerNombre = (n: string | null | undefined): string =>
  (n ?? "").trim().split(/\s+/)[0] || "";

function iniciales(nombre: string): string {
  const partes = nombre.replace(/^(Dra?\.|Lic\.)\s*/i, "").trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

export default async function AccesoTurnoPage({
  params,
}: {
  params: Promise<{ turnoId: string }>;
}) {
  if (!esInstitucional()) notFound();

  const { turnoId } = await params;
  const branding = await getBrandingInstitucion();

  // Toda salida por la puerta de atrás de esta pantalla es la MISMA pantalla:
  // "este enlace ya no está activo" + cómo pedir uno nuevo. Nunca un login,
  // nunca un dashboard — el paciente institucional no tiene ninguno de los dos.
  const inactivo = (
    <LinkInactivo
      institucion={branding.nombre}
      telefonoAyuda={branding.telefono_ayuda}
      hrefReenvio="/acceso/reenviar"
      cooldownMinutos={branding.reenvio_cooldown_minutos}
    />
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return inactivo;

  // Universo cerrado (spec §5.3): sesión sin fila de paciente NO es onboarding,
  // es un error. Acá nadie se auto-registra.
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("id, nombre_completo")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!paciente) return inactivo;

  const { data: turno } = await supabase
    .from("turnos")
    .select("id, fecha, hora_inicio, hora_fin, estado, medico_id")
    .eq("id", turnoId)
    .eq("paciente_id", paciente.id)
    .maybeSingle();
  if (!turno) return inactivo;

  // `titulo` ("Dr."/"Dra.") lo eligió el profesional en su registro: sin él la
  // pantalla lo trata en neutro en vez de adivinar. Estas tres columnas SÍ
  // tienen grant para authenticated; ninguna más (una sin grant hace fallar la
  // query entera y PostgREST devuelve null en silencio).
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, titulo, especialidad")
    .eq("id", turno.medico_id)
    .maybeSingle();

  const inicioMs = instanteAR(turno.fecha, turno.hora_inicio);
  const finMs = instanteAR(turno.fecha, turno.hora_fin ?? turno.hora_inicio);
  const pantalla = pantallaDelTurno({
    estado: turno.estado,
    inicioMs,
    finMs,
    ventanaEntradaMin: branding.ventana_entrada_min,
  });

  if (pantalla === "inactivo") return inactivo;

  // Estado E: los documentos que dejó el profesional. Se piden solo cuando el
  // encuentro terminó — en los otros estados no hay nada que mostrar y sería
  // una query al pedo en la pantalla más liviana del producto.
  let documentos: { id: string; tipo: string; fecha: string }[] = [];
  if (pantalla === "terminado") {
    const { data: docs } = await supabase
      .from("documentos")
      .select("id, tipo, created_at")
      .eq("turno_id", turno.id)
      .eq("paciente_id", paciente.id)
      .order("created_at", { ascending: false });
    documentos = (docs ?? []).map((d) => ({
      id: d.id,
      tipo: d.tipo,
      fecha: new Date(d.created_at).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }),
    }));
  }

  const profesional = formatNombreMedico(medico?.nombre_completo ?? "", medico?.titulo ?? null);

  return (
    <AccesoTurnoClient
      turnoId={turno.id}
      institucion={branding.nombre}
      telefonoAyuda={branding.telefono_ayuda}
      pantallaInicial={pantalla}
      primerNombre={primerNombre(paciente.nombre_completo)}
      especialidad={medico?.especialidad ?? ""}
      profesional={profesional}
      inicialesProfesional={iniciales(medico?.nombre_completo ?? "")}
      fechaLabel={fechaLabelAR(turno.fecha)}
      hora={turno.hora_inicio.slice(0, 5)}
      inicioMs={inicioMs}
      ventanaEntradaMin={branding.ventana_entrada_min}
      documentos={documentos}
    />
  );
}
