export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ArrowLeft, Stethoscope, User, FileText, CircleDollarSign, Clock } from "lucide-react";

// Ficha de detalle de una atención (pedido Diego 04/08, caso Hugo): toda la
// línea de tiempo, la plata, los documentos y los DATOS DE MÉDICO Y PACIENTE
// en un solo lugar — sin bucear en la base. /admin/layout ya gatea isAdmin.

const CIERRE_LABEL: Record<string, string> = {
  medico: "el médico tocó Finalizar",
  paciente: "el paciente cerró su pantalla final",
  webhook_video: "la sala de video quedó vacía (cierre automático)",
  desconexion: "desconexión sin retorno (cierre automático)",
  cierre_automatico: "cierre nocturno automático (quedó abierta)",
  admin_forzado: "cerrada a mano desde el panel admin",
};

const fmtHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-AR", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        hour12: false, timeZone: "America/Argentina/Buenos_Aires",
      })
    : null;

const fmtARS = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(n));

export default async function DetalleAtencionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { id } = await params;
  const { tipo } = await searchParams;
  const esTurno = tipo === "turno";
  const admin = createAdminClient();

  const tabla = esTurno ? "turnos" : "consultas";
  const { data: at } = await admin.from(tabla).select("*").eq("id", id).maybeSingle();
  if (!at) notFound();

  const [{ data: medico }, { data: docs }, { data: refund }] = await Promise.all([
    admin
      .from("medicos")
      .select("id, nombre_completo, especialidad, email_personal, celular_personal, telefono, jurisdicciones, estado_registro, disponible")
      .eq("id", at.medico_id)
      .maybeSingle(),
    admin.from("documentos").select("tipo, created_at").eq(esTurno ? "turno_id" : "consulta_id", id),
    admin.from("refunds_pendientes").select("estado, neto_medico, application_fee").eq("tipo", esTurno ? "turno" : "consulta").eq("recurso_id", id).maybeSingle(),
  ]);

  // consultas.paciente_id = user_id; turnos.paciente_id = pacientes.id → doble intento.
  let paciente = null as null | Record<string, unknown>;
  if (at.paciente_id) {
    const porUser = await admin.from("pacientes").select("id, user_id, nombre_completo, email, telefono, dni, provincia, obra_social, nro_afiliado, tiene_cobertura, fecha_nacimiento").eq("user_id", at.paciente_id).maybeSingle();
    paciente = porUser.data ?? (await admin.from("pacientes").select("id, user_id, nombre_completo, email, telefono, dni, provincia, obra_social, nro_afiliado, tiene_cobertura, fecha_nacimiento").eq("id", at.paciente_id).maybeSingle()).data;
  }

  const timeline: { hora: string | null; label: string }[] = esTurno
    ? [
        { hora: fmtHora(at.mp_payment_created_at), label: `Reserva pagada (${fmtARS(at.monto)})` },
        { hora: at.fecha ? `${String(at.fecha).split("-").reverse().slice(0, 2).join("/")} ${String(at.hora_inicio).slice(0, 5)}` : null, label: "Cita programada" },
        { hora: fmtHora(at.en_curso_at), label: "Video iniciado" },
        { hora: fmtHora(at.desconectado_at), label: "Corte de conexión (sin retorno)" },
        { hora: fmtHora(at.completada_at), label: `Cierre — ${CIERRE_LABEL[at.cierre_origen as string] ?? "sin firma (anterior al 04/08)"}` },
      ]
    : [
        { hora: fmtHora(at.created_at), label: `Solicitada y pagada (${fmtARS(at.monto)})` },
        { hora: fmtHora(at.aceptada_at), label: "Aceptada por el médico" },
        { hora: fmtHora(at.en_curso_at), label: "Video iniciado" },
        { hora: fmtHora(at.desconectado_at), label: "Corte de conexión (sin retorno)" },
        { hora: fmtHora(at.completada_at), label: `Cierre — ${CIERRE_LABEL[at.cierre_origen as string] ?? "sin firma (anterior al 04/08)"}` },
      ];

  const duracionMin =
    at.en_curso_at && at.completada_at
      ? Math.max(1, Math.round((new Date(at.completada_at).getTime() - new Date(at.en_curso_at).getTime()) / 60000))
      : null;

  const neto = at.mp_net_amount_medico ?? (at.monto && at.mp_application_fee ? Number(at.monto) - Number(at.mp_application_fee) : null);

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <Link href="/admin/consultas" className="inline-flex items-center gap-1.5 text-sm text-[#378ADD] hover:underline">
        <ArrowLeft size={15} /> Volver a Consultas
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          {esTurno ? "Turno" : "Consulta inmediata"}
          <span className="ml-3 rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-600">{String(at.estado)}</span>
        </h1>
        {duracionMin && (
          <span className="inline-flex items-center gap-1 text-sm text-gray-500"><Clock size={14} /> {duracionMin} min</span>
        )}
      </div>
      {"motivo_consulta" in at && at.motivo_consulta ? (
        <p className="mt-1 text-sm text-gray-500">Motivo: {String(at.motivo_consulta)}</p>
      ) : null}

      {/* Línea de tiempo */}
      <div className="mt-6 rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-400">Línea de tiempo</h2>
        <div className="mt-3 space-y-2">
          {timeline.map((t, i) =>
            t.hora ? (
              <div key={i} className="flex items-baseline gap-3 text-sm">
                <span className="w-28 shrink-0 font-mono text-gray-500">{t.hora}</span>
                <span className="text-gray-800">{t.label}</span>
              </div>
            ) : null
          )}
        </div>
      </div>

      {/* Plata */}
      <div className="mt-4 rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-gray-400"><CircleDollarSign size={14} /> Plata</h2>
        <div className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm text-gray-700">
          <span>Pagado: <strong>{fmtARS(at.monto)}</strong> ({String(at.mp_status ?? "sin pago")})</span>
          <span>Comisión Docto: {fmtARS(at.mp_application_fee)}</span>
          <span>Neto médico: {fmtARS(neto)}</span>
          {refund && <span className="font-medium text-[#E24B4A]">Reembolso: {String(refund.estado)}</span>}
          {"reintegro_estado" in at && at.reintegro_estado ? (
            <span className="font-medium text-[#BA7517]">Reintegro: {String(at.reintegro_estado)}</span>
          ) : null}
        </div>
      </div>

      {/* Documentos + evolución */}
      <div className="mt-4 rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-gray-400"><FileText size={14} /> Documentación</h2>
        <div className="mt-2 text-sm text-gray-700">
          {docs && docs.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {docs.map((d, i) => (
                <span key={i} className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{d.tipo}</span>
              ))}
            </div>
          ) : (
            <p className="font-medium text-[#D85A30]">Sin documentos emitidos</p>
          )}
          {"evolucion" in at && at.evolucion ? (
            <p className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-[13px] text-gray-600">{String(at.evolucion)}</p>
          ) : (
            <p className="mt-2 text-[13px] text-gray-400">Sin evolución registrada.</p>
          )}
        </div>
      </div>

      {/* Médico y paciente lado a lado */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-gray-400"><Stethoscope size={14} /> Médico</h2>
          {medico ? (
            <div className="mt-2 space-y-1 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">{medico.nombre_completo}</p>
              <p className="text-gray-500">{medico.especialidad} · {((medico.jurisdicciones as string[] | null) ?? []).join(", ") || "sin jurisdicción"}</p>
              {medico.email_personal && <p><a className="text-[#378ADD] hover:underline" href={`mailto:${medico.email_personal}`}>{medico.email_personal}</a></p>}
              {medico.celular_personal && <p>Cel: <a className="text-[#378ADD] hover:underline" href={`tel:${medico.celular_personal}`}>{String(medico.celular_personal)}</a></p>}
              <p className="pt-1">
                <Link href="/admin/medicos" className="text-[13px] text-[#378ADD] hover:underline">Ver en Médicos →</Link>
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-400">No encontrado</p>
          )}
        </div>
        <div className="rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-gray-400"><User size={14} /> Paciente</h2>
          {paciente ? (
            <div className="mt-2 space-y-1 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">{String(paciente.nombre_completo)}</p>
              <p className="text-gray-500">
                {paciente.provincia ? String(paciente.provincia) : "sin provincia"}
                {paciente.dni ? ` · DNI ${paciente.dni}` : ""}
              </p>
              {paciente.email ? <p><a className="text-[#378ADD] hover:underline" href={`mailto:${paciente.email}`}>{String(paciente.email)}</a></p> : null}
              {paciente.telefono ? <p>Tel: <a className="text-[#378ADD] hover:underline" href={`tel:${paciente.telefono}`}>{String(paciente.telefono)}</a></p> : null}
              <p className="text-gray-500">
                {paciente.tiene_cobertura ? `${paciente.obra_social ?? "Obra social"}${paciente.nro_afiliado ? ` · ${paciente.nro_afiliado}` : ""}` : "Sin cobertura declarada"}
              </p>
              <p className="pt-1">
                <Link href="/admin/pacientes" className="text-[13px] text-[#378ADD] hover:underline">Ver en Pacientes →</Link>
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-400">Sin paciente (slot de agenda)</p>
          )}
        </div>
      </div>
    </div>
  );
}
