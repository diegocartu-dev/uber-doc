export const dynamic = "force-dynamic";

// /consulta/[id]/acceso — LA pantalla del paciente institucional para la
// CONSULTA INMEDIATA. Hermana de /turno/[turnoId]/acceso, mismo mock
// (02-paciente.html §2) y mismas reglas.
//
// Cierra el pendiente declarado al terminar la Etapa 3 (spec §11.19): hasta
// ahora el link de una CI aterrizaba en `/consulta/[id]/confirmacion`, el clon
// del B2C — con la marca de Docto, copy de pagos que en la instancia no
// existen, y links a `/documentos` y `/mis-consultas` que el propio modo
// institucional bloquea con 404.
//
// Lo que se reusa sin tocar: el canal clínico (`/consulta/[id]/sala`), el
// endpoint de estado del B2C y el registro de entrada a la sala de espera.
//
// SOLO instancia institucional: en B2C es 404.

import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { accesoSigueVivo, COOKIE_ACCESO } from "@/lib/institucional/accesos";
import { esInstitucional } from "@/lib/instancia";
import { getBrandingInstitucion, dominioLimpio } from "@/lib/institucional/config";
import { pantallaDeLaConsulta } from "@/lib/institucional/pantalla-consulta";
import { formatNombreMedico } from "@/lib/utils/texto";
import { LinkInactivo } from "@/components/institucional/PantallaPaciente";
import { metadataPacienteInstitucional } from "@/lib/institucional/metadata";
import { yaEntroALaSala } from "./actions";
import AccesoConsultaClient from "./AccesoConsultaClient";

// La pestaña dice el nombre de la institución, no el del marketplace.
export const generateMetadata = metadataPacienteInstitucional;

const primerNombre = (n: string | null | undefined): string =>
  (n ?? "").trim().split(/\s+/)[0] || "";

function iniciales(nombre: string): string {
  const partes = nombre.replace(/^(Dra?\.|Lic\.)\s*/i, "").trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

export default async function AccesoConsultaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!esInstitucional()) notFound();

  const { id: consultaId } = await params;
  const branding = await getBrandingInstitucion();

  // Toda salida por la puerta de atrás es la MISMA pantalla: "este enlace ya
  // no está activo" + cómo pedir uno nuevo. Nunca un login, nunca un
  // dashboard — el paciente institucional no tiene ninguno de los dos.
  const inactivo = (
    <LinkInactivo
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

  // El enlace que abrió esta sesión tiene que seguir vivo Y ser el de ESTA
  // consulta: sin este chequeo la sesión minteada serviría para cualquier otro
  // encuentro del paciente y sobreviviría a la revocación (teléfono robado).
  const accesoId = (await cookies()).get(COOKIE_ACCESO)?.value;
  if (!(await accesoSigueVivo({ accesoId, pacienteId: paciente.id, consultaId }))) return inactivo;

  // ⚠ Asimetría heredada del B2C (spec §3): `consultas.paciente_id` apunta a
  // auth.users.id, NO a pacientes.id.
  const { data: consulta } = await supabase
    .from("consultas")
    .select("id, estado, medico_id, especialidad, sala_video_url")
    .eq("id", consultaId)
    .eq("paciente_id", user.id)
    .maybeSingle();
  if (!consulta) return inactivo;

  // Estas tres columnas de `medicos` SÍ tienen grant para authenticated;
  // ninguna más (una sin grant hace fallar la query entera y PostgREST
  // devuelve null en silencio — outage 19-24/06).
  const { data: medico } = await supabase
    .from("medicos")
    .select("nombre_completo, titulo, especialidad")
    .eq("id", consulta.medico_id)
    .maybeSingle();

  const pantalla = pantallaDeLaConsulta({
    estado: consulta.estado,
    salaVideoUrl: consulta.sala_video_url,
    // Si ya entró una vez, refrescar no puede devolverle el botón "Entrar"
    // como si no hubiera hecho nada.
    yaEntro: await yaEntroALaSala(consultaId),
  });

  if (pantalla === "inactivo") return inactivo;

  // Los documentos se piden SOLO cuando la consulta terminó: en los otros
  // estados no hay nada que mostrar y sería una query al pedo en la pantalla
  // más liviana del producto.
  let documentos: { id: string; tipo: string; fecha: string }[] = [];
  if (pantalla === "terminado") {
    const { data: docs } = await supabase
      .from("documentos")
      .select("id, tipo, created_at")
      .eq("consulta_id", consulta.id)
      .eq("paciente_id", paciente.id)
      .order("created_at", { ascending: false });
    documentos = (docs ?? []).map((d) => ({
      id: d.id,
      tipo: d.tipo,
      fecha: new Date(d.created_at).toLocaleDateString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
      }),
    }));
  }

  return (
    <AccesoConsultaClient
      consultaId={consulta.id}
      institucion={branding.nombre}
      dominio={dominioLimpio(branding.dominio)}
      telefonoAyuda={branding.telefono_ayuda}
      pantallaInicial={pantalla}
      primerNombre={primerNombre(paciente.nombre_completo)}
      especialidad={consulta.especialidad || medico?.especialidad || ""}
      profesional={formatNombreMedico(medico?.nombre_completo ?? "", medico?.titulo ?? null)}
      inicialesProfesional={iniciales(medico?.nombre_completo ?? "")}
      documentos={documentos}
    />
  );
}
