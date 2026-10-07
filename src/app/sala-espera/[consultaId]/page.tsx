import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SalaEsperaCliente from "./SalaEsperaCliente";
import DoctoLogo from "@/components/DoctoLogo";
import { getReturnUrl } from "@/lib/consultorio-url";
import { capitalizarNombre } from "@/lib/utils/texto";
import { registrarEntradaSala } from "@/lib/sala-espera";
import { pushAlMedico } from "@/lib/push";
import { waitUntil } from "@vercel/functions";
import { headers } from "next/headers";
import { trackEvent } from "@/lib/funnel";
import { origenDispositivo, esRobotDeVistaPrevia } from "@/lib/pagos/origen-dispositivo";

// Estados en los que el paciente está de verdad en la sala. Una consulta
// cancelada o terminada que se vuelve a abrir (el link del WhatsApp, Safari
// que recarga la pestaña) NO registra entrada ni avisa: hasta el 05/10/2026 lo
// hacía, le mandaba "paciente esperando" al profesional por una consulta
// muerta y dejaba una fila zombie que después se le reprochaba.
const ESTADOS_VIVOS = new Set(["esperando", "aceptada", "pagada", "en_curso"]);

export default async function SalaEsperaPage({
  params,
  searchParams,
}: {
  params: Promise<{ consultaId: string }>;
  searchParams: Promise<{ pago?: string }>;
}) {
  const { consultaId } = await params;
  // Mercado Pago vuelve acá con ?pago=error o ?pago=pendiente cuando el checkout
  // no salió bien. Hasta ahora la pantalla lo ignoraba por completo.
  const { pago: resultadoPago } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Llegada CON sesión (06/10/2026). La sin sesión la registra el middleware.
  // Junto con `sala_abierta` (la manda la pantalla) separa "llegó y la pantalla
  // funcionó" de "llegó y no pasó nada" de "nunca llegó".
  {
    const ua = (await headers()).get("user-agent") ?? "";
    const origen = origenDispositivo(ua, false);
    waitUntil(
      trackEvent({
        evento: "sala_llegada",
        pacienteId: user.id,
        metadata: { consultaId, sesion: true, robot: esRobotDeVistaPrevia(ua), plataforma: origen.plataforma, navegador: origen.navegador },
      })
    );
  }

  // Traer la consulta con datos del médico
  const { data: consulta, error } = await supabase
    .from("consultas")
    // `mp_status` (verificado en prod: columna existente y con GRANT SELECT para
    // `authenticated`) es lo que distingue "aceptada sin pagar" de "ya pagada".
    // `resolucion_motivo`, `motivo_consulta`, `sintomas` y `tiempo_sintomas`:
    // columnas con GRANT SELECT para authenticated (las 35 de consultas lo tienen,
    // verificado en prod). El motivo de cierre viaja desde acá para que la
    // pantalla no le diga al paciente "no llegó a tomar tu consulta" antes del
    // primer poll; los datos del pedido sirven para volver a pedir con un toque.
    .select("id, especialidad, estado, created_at, medico_id, canal_origen, mp_status, resolucion_motivo, motivo_consulta, sintomas, tiempo_sintomas")
    .eq("id", consultaId)
    .eq("paciente_id", user.id)
    .single();

  if (error || !consulta) {
    redirect("/clinica");
  }

  const returnUrl = await getReturnUrl(consulta.medico_id, consulta.canal_origen);

  // Traer datos del médico.
  // `titulo` ("Dr."/"Dra.") es lo que usa SalaEsperaCliente para el tratamiento y el
  // artículo del copy; sin él la pantalla queda sin tratamiento. Tiene GRANT SELECT
  // para `authenticated` (verificado en prod). NO sumar otras columnas de `medicos`:
  // una sola sin grant hace fallar el SELECT entero y devuelve null en silencio.
  const { data: medico } = await supabase
    .from("medicos")
    .select("id, nombre_completo, titulo, precio_consulta, duracion_consulta, disponible")
    .eq("id", consulta.medico_id)
    .single();

  if (!medico) {
    redirect("/clinica");
  }

  // Registrar entrada en sala de espera (idempotente, fire-and-forget)
  const { data: paciente } = await supabase
    .from("pacientes").select("id, nombre_completo").eq("user_id", user.id).maybeSingle();
  if (paciente && ESTADOS_VIVOS.has(consulta.estado)) {
    // waitUntil: en Vercel el trabajo disparado sin esperar puede no correr una
    // vez enviada la respuesta. Registrar la entrada y avisar son justo lo que
    // no puede perderse.
    waitUntil(
      registrarEntradaSala({
        pacienteId: paciente.id,
        medicoId: consulta.medico_id,
        consultaId: consulta.id,
        canalOrigen: consulta.canal_origen,
      }).catch((e) => console.error("[sala-espera] Error registrando entrada:", e))
    );

    // SIN skip por en_curso (decisión Diego 11/06): el médico debe enterarse de un
    // paciente nuevo AUNQUE esté en otra llamada — antes se salteaba y el siguiente
    // paciente quedaba invisible hasta volver al dashboard.
    waitUntil(
      pushAlMedico(consulta.medico_id, {
        title: "🟢 Docto",
        body: `${paciente.nombre_completo ?? "Un paciente"} está esperando una consulta inmediata`,
        url: "/dashboard",
        tag: `espera-ci-${consulta.id}`,
      }).catch(() => {})
    );
  }

  // Contar posición en la cola (consultas esperando antes que esta)
  const { count } = await supabase
    .from("consultas")
    .select("id", { count: "exact", head: true })
    .eq("medico_id", consulta.medico_id)
    .eq("estado", "esperando")
    .lt("created_at", consulta.created_at);

  const posicion = (count ?? 0) + 1;
  const tiempoEstimado = posicion * medico.duracion_consulta;

  return (
    <div className="min-h-full" style={{ backgroundColor: "var(--color-bg-secondary)" }}>
      <nav
        className="sticky top-0 z-50 bg-white"
        style={{ borderBottom: "1px solid var(--color-border-default)", height: 56 }}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 lg:px-6">
          <DoctoLogo />
          <Link
            href={returnUrl}
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {returnUrl.startsWith("/dr/") ? "Volver al consultorio" : "Volver a la clínica"}
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-4 py-16">
        <SalaEsperaCliente
          consultaId={consulta.id}
          estado={consulta.estado}
          mpStatus={consulta.mp_status}
          medicoNombre={capitalizarNombre(medico.nombre_completo)}
          medicoTitulo={medico.titulo ?? null}
          precio={medico.precio_consulta}
          duracion={medico.duracion_consulta}
          especialidad={consulta.especialidad}
          posicion={posicion}
          tiempoEstimado={tiempoEstimado}
          createdAt={consulta.created_at}
          motivoCierreInicial={consulta.resolucion_motivo ?? null}
          medicoId={consulta.medico_id}
          medicoDisponible={medico.disponible === true}
          pedido={{
            motivo: consulta.motivo_consulta ?? "",
            sintomas: Array.isArray(consulta.sintomas) ? (consulta.sintomas as string[]) : [],
            tiempoSintomas: consulta.tiempo_sintomas ?? "",
            canal: consulta.canal_origen === "consultorio_privado" ? "consultorio_privado" : "clinica_virtual",
          }}
          resultadoPago={resultadoPago ?? null}
          isDev={process.env.NODE_ENV === "development"}
        />
      </main>
    </div>
  );
}
