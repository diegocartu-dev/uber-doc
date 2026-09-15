import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AppNavbar from "@/components/AppNavbar";
import { getComisionForMedico } from "@/lib/comisiones";
import { esInstitucional } from "@/lib/instancia";
import { VIDEOS_CAPACITACION, puedeVerCapacitacion } from "@/lib/capacitacion";
import VideosCapacitacion from "./VideosCapacitacion";
import { Zap, CalendarDays, Link2, ChevronRight, ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// Hub "Configurá cómo atendés" — spec aprobada 14/07 (impl 15/07). Tres modos:
// Consulta inmediata / Turnos en Clínica virtual / Turnos en Consultorio
// particular. La modalidad deja de ser una pregunta abstracta del registro y
// pasa a ser consecuencia de qué activa el médico acá.
export default async function ComoAtendesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const admin = createAdminClient();
  const { data: medico } = await admin
    .from("medicos")
    .select("id, disponible, disponible_desde, disponible_hasta, duracion_consulta, precio_consulta, slug, categoria")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!medico) redirect("/dashboard");

  const { data: modelos } = await admin
    .from("agenda_modelos")
    .select("canal_origen, activo, fecha_fin")
    .eq("medico_id", medico.id);

  // Hora ARGENTINA, no UTC del server: entre 21:00 y 00:00 ART el conteo de
  // agendas activas correría un día adelantado (Sofía R5 / Roberto, patrón #252).
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
  const activasPorCanal = (canal: string) =>
    (modelos ?? []).filter((m) => m.canal_origen === canal && m.activo && m.fecha_fin >= hoy).length;
  const agendasClinica = activasPorCanal("clinica_virtual");
  const agendasConsultorio = activasPorCanal("consultorio_privado");

  // Transparencia de comisión (Martín, gate 15/07): el % REAL del médico según
  // su categoría (founder/tradicional), nunca un número hardcodeado.
  const comisionPct = await getComisionForMedico(medico.id);

  const ciConfigurada =
    !!medico.precio_consulta && !!medico.duracion_consulta && !!medico.disponible_desde && !!medico.disponible_hasta;
  const resumenCI = ciConfigurada
    ? `$${Number(medico.precio_consulta).toLocaleString("es-AR")} · ${medico.duracion_consulta} min · ${String(medico.disponible_desde).slice(0, 5)}–${String(medico.disponible_hasta).slice(0, 5)}`
    : null;

  // ── Videos de capacitación: solo cuentas aprobadas (Diego, 15/09) ──
  // Query PROPIA, a propósito: el SELECT de arriba es el que arma la pantalla y
  // no se toca (mismo criterio que clinica/page.tsx). Si esta lectura falla, el
  // bloque simplemente no aparece y el resto de la pantalla sigue igual: nadie
  // que hoy entra deja de entrar. El mismo gate se repite en la ruta que firma
  // el link, porque esconder el bloque no protege el archivo.
  let puedeVerVideos = false;
  let marcaVideos = "";
  if (!esInstitucional()) {
    const { data: aprobacion, error: errAprobacion } = await admin
      .from("medicos")
      .select("verificado, estado_registro, dado_de_baja, nombre_completo")
      .eq("id", medico.id)
      .maybeSingle();
    if (!errAprobacion && puedeVerCapacitacion(aprobacion)) {
      puedeVerVideos = true;
      marcaVideos = (aprobacion?.nombre_completo ?? "").trim() || (user.email ?? "");
    }
  }

  const fullName = user.user_metadata?.full_name || user.email;
  const cardBorder = { border: "0.5px solid #e5e7eb" };

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa]">
      <AppNavbar userName={fullName} userRole="medico" />
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1 py-2 text-sm font-medium" style={{ color: "var(--color-text-link)" }}>
          <ChevronLeft size={16} /> Volver al panel
        </Link>

        <h1 className="mt-2 text-[22px] font-semibold text-gray-900">Configurá cómo atendés</h1>
        <p className="mt-1 text-sm text-gray-500">
          Elegí cómo querés recibir pacientes. Podés activar las que quieras.
        </p>

        {/* ── Consulta inmediata ── */}
        <Link
          href="/medico/como-atendes/consulta-inmediata"
          className="mt-5 flex items-center gap-3 rounded-xl bg-white p-4 transition hover:bg-gray-50 active:scale-[0.99]"
          style={cardBorder}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--color-primary-soft)" }}>
            <Zap size={19} style={{ color: "var(--color-primary)" }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-gray-900">Consulta inmediata</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-gray-500">
              Pacientes que te consultan ahora, sin turno. Te avisamos cuando hay uno esperando.
            </span>
            {resumenCI ? (
              <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-medium text-gray-700">{resumenCI}</span>
                <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: medico.disponible ? "#1D9E75" : "#888780" }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: medico.disponible ? "#1D9E75" : "#c4c3bd" }} />
                  {medico.disponible ? "Disponible ahora" : "Inactiva"}
                </span>
              </span>
            ) : (
              <span className="mt-1.5 block text-[13px] font-medium" style={{ color: "#BA7517" }}>Sin configurar</span>
            )}
          </span>
          <span className="flex items-center gap-1 text-sm font-medium" style={{ color: "var(--color-text-link)" }}>
            Configurar <ChevronRight size={16} />
          </span>
        </Link>

        {/* ── Turnos programados ── */}
        <div className="mt-5">
          <h2 className="text-[15px] font-semibold text-gray-900">Turnos programados</h2>
          <p className="mt-0.5 text-[13px] text-gray-500">
            Pacientes reservan día y hora. Armás una o varias agendas, cada una con su valor.
          </p>

          <div className="mt-3 space-y-3">
            {/* Clínica virtual */}
            <Link
              href={agendasClinica > 0 ? "/medico/agenda" : "/medico/agenda?nuevo=1"}
              className="flex items-center gap-3 rounded-xl bg-white p-4 transition hover:bg-gray-50 active:scale-[0.99]"
              style={cardBorder}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--color-primary-soft)" }}>
                <CalendarDays size={19} style={{ color: "var(--color-primary)" }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-gray-900">Clínica virtual</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-gray-500">
                  Todos los pacientes de Docto te ven y pueden reservar turno.
                </span>
                <span className="mt-1.5 block text-[13px] font-medium" style={{ color: agendasClinica > 0 ? "#374151" : "#BA7517" }}>
                  {agendasClinica > 0 ? `${agendasClinica} agenda${agendasClinica > 1 ? "s" : ""} activa${agendasClinica > 1 ? "s" : ""}` : "Sin agendas"}
                </span>
              </span>
              <span className="flex items-center gap-1 text-sm font-medium" style={{ color: "var(--color-text-link)" }}>
                {agendasClinica > 0 ? "Ver" : "Crear agenda"} <ChevronRight size={16} />
              </span>
            </Link>

            {/* Consultorio particular */}
            <Link
              href="/medico/como-atendes/consultorio"
              className="flex items-center gap-3 rounded-xl bg-white p-4 transition hover:bg-gray-50 active:scale-[0.99]"
              style={cardBorder}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
                <Link2 size={19} className="text-gray-500" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-gray-900">Consultorio particular</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-gray-500">
                  Tu consultorio virtual privado: solo te ven los pacientes a los que les compartís el link.
                </span>
                <span className="mt-1.5 block text-[13px] font-medium" style={{ color: agendasConsultorio > 0 ? "#374151" : "#BA7517" }}>
                  {agendasConsultorio > 0 ? `${agendasConsultorio} agenda${agendasConsultorio > 1 ? "s" : ""} activa${agendasConsultorio > 1 ? "s" : ""}` : "Sin agendas"}
                </span>
              </span>
              <span className="flex items-center gap-1 text-sm font-medium" style={{ color: "var(--color-text-link)" }}>
                {agendasConsultorio > 0 ? "Ver" : "Crear agenda"} <ChevronRight size={16} />
              </span>
            </Link>
          </div>
        </div>

        {/* ── Cómo se usa Docto ──
            DEBAJO de las tres tarjetas y no arriba: quien entra a prender la
            consulta inmediata la sigue teniendo como lo primero de la pantalla.
            Lo único que baja es texto informativo. El id es el destino del link
            del cierre del onboarding. */}
        {puedeVerVideos && (
          <section id="videos" className="mt-5 scroll-mt-20">
            <h2 className="text-[15px] font-semibold text-gray-900">Cómo se usa Docto</h2>
            <p className="mt-0.5 text-[13px] text-gray-500">
              Dos videos cortos para empezar. Los podés ver las veces que quieras.
            </p>
            <VideosCapacitacion videos={VIDEOS_CAPACITACION} marca={marcaVideos} />
          </section>
        )}

        <p className="mt-5 text-[13px] text-gray-500">
          El precio lo ponés en cada modo: uno para la consulta inmediata, y uno por cada agenda que crees.
        </p>
        {/* Founders ven la felicitación con su beneficio (pedido Diego 15/07). */}
        {medico.categoria === "founder" ? (
          <p className="mt-2 text-[13px] text-gray-500">
            <strong className="text-gray-700">¡Felicitaciones por tu categoría de Médico Fundador!</strong>{" "}
            Docto te descuenta una comisión de solo el <strong className="text-gray-700">{comisionPct}%</strong> por
            consulta realizada; el resto va directo a tu Mercado Pago.
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-gray-500">
            Docto descuenta una comisión del <strong className="text-gray-700">{comisionPct}%</strong> por
            consulta realizada; el resto va directo a tu Mercado Pago.
          </p>
        )}
      </div>
    </div>
  );
}
