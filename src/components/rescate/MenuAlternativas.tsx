"use client";

// El MENÚ DE RESCATE (sprint 31/08): la respuesta a "¿y ahora quién me
// atiende?" cuando una atención se cae. UN componente con varias puertas
// (pedido de CI vencido, CI paga con profesional ausente, turno plantado) para
// que la regla de qué se ofrece viva en un solo lugar.
//
// Reglas que esta pantalla respeta (decisiones Diego 31/08 + panel):
// - SOLO se muestra lo vivo en este instante: si no hay nada, el bloque no
//   existe — nunca un cascarón vacío ni una promesa genérica.
// - La especialidad se dice SIEMPRE: un profesional de otra especialidad va
//   rotulado ("puede orientarte"), jamás como equivalente silencioso.
// - El profesional que falló no aparece (lo excluye el servidor).
// - Si hay OTRA atención con plata comprometida, no se pintan CTAs que van a
//   rebotar: se lleva al paciente a retomarla (regla del Uber).
// - El tap se registra (`rescate_elegido`) pero el éxito se mide por pago.

import { useEffect, useState } from "react";
import { trackFunnel } from "@/lib/funnel-client";
import { formatNombreMedico } from "@/lib/utils/texto";

type CardCI = {
  medicoId: string; nombre: string; titulo: string | null; especialidad: string;
  precio: number | null; duracionMin: number; fotoUrl: string | null; mismaEspecialidad: boolean;
};
type CardTurno = {
  medicoId: string; nombre: string; titulo: string | null; especialidad: string;
  precio: number | null; fecha: string; horaInicio: string; mismaEspecialidad: boolean;
};
type Respuesta = {
  alternativas?: { ciAhora: CardCI[]; turnos: CardTurno[] };
  especialidadPedida?: string | null;
  bloqueado?: { href: string; medicoNombre: string };
};

const precioAR = (v: number | null) =>
  v == null ? null : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v);

function fechaCorta(fecha: string, hora: string): string {
  const d = new Date(`${fecha}T12:00:00`);
  const dia = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "numeric" });
  return `${dia} · ${hora.slice(0, 5)} h`;
}

export default function MenuAlternativas({
  consultaId,
  turnoId,
  titulo = "¿Necesitás atenderte hoy?",
}: {
  consultaId?: string;
  turnoId?: string;
  titulo?: string;
}) {
  const [data, setData] = useState<Respuesta | null>(null);

  useEffect(() => {
    const qs = consultaId ? `consultaId=${consultaId}` : `turnoId=${turnoId}`;
    // One-shot al entrar al estado terminal, NUNCA dentro del poll de 5s de la
    // sala: computar la oferta son varias queries con service role.
    fetch(`/api/rescate/alternativas?${qs}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, [consultaId, turnoId]);

  if (!data) return null;

  // Regla del Uber: hay otra atención con plata comprometida — retomarla.
  if (data.bloqueado) {
    return (
      <div className="mt-6 rounded-xl border border-[#378ADD]/30 bg-[#378ADD]/5 p-4 text-left">
        <p className="text-sm font-semibold text-gray-900">Ya tenés una atención en curso</p>
        <p className="mt-1 text-sm text-gray-600">
          Tenés una consulta activa con {data.bloqueado.medicoNombre}. Retomala antes de pedir otra.
        </p>
        <a
          href={data.bloqueado.href}
          className="mt-3 block w-full rounded-xl bg-[#378ADD] px-6 py-3 text-center text-sm font-semibold text-white active:scale-[0.97] transition-all duration-100"
        >
          Volver a mi consulta
        </a>
      </div>
    );
  }

  const ci = data.alternativas?.ciAhora ?? [];
  const turnos = data.alternativas?.turnos ?? [];
  if (ci.length === 0 && turnos.length === 0) return null;

  const pedida = data.especialidadPedida ?? null;
  const ningunaMismaCI = !!pedida && ci.length > 0 && ci.every((c) => !c.mismaEspecialidad);
  const recurso = consultaId ? { recursoTipo: "consulta", recursoId: consultaId } : { recursoTipo: "turno", recursoId: turnoId };

  const elegir = (tipo: "ci" | "turno", card: { medicoId: string; mismaEspecialidad: boolean }) =>
    trackFunnel("rescate_elegido", { tipo, medicoId: card.medicoId, mismaEspecialidad: card.mismaEspecialidad, ...recurso });

  return (
    <div className="mt-8 text-left">
      <h2 className="text-base font-bold text-gray-900">{titulo}</h2>

      {ci.length > 0 && (
        <div className="mt-3">
          <p className="text-[13px] font-medium text-gray-500">
            {ningunaMismaCI
              ? `No hay ${pedida} en línea ahora. Estos profesionales pueden orientarte y derivarte si hace falta:`
              : "Disponibles ahora"}
          </p>
          {ci.map((c) => (
            <a
              key={c.medicoId}
              href={`/triage?medicoId=${encodeURIComponent(c.medicoId)}&especialidad=${encodeURIComponent(c.especialidad)}`}
              onClick={() => elegir("ci", c)}
              className="mt-2 flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 active:scale-[0.99] transition-all duration-100"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-gray-900">{formatNombreMedico(c.nombre, c.titulo)}</p>
                  {/* Verde SOLO como indicador de estado (design system) */}
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "#1D9E75" }} />
                </div>
                <p className="truncate text-[13px] text-gray-500">
                  {c.especialidad} · Disponible ahora
                  {precioAR(c.precio) ? ` · ${precioAR(c.precio)} · ${c.duracionMin} min` : ""}
                </p>
              </div>
              <span className="shrink-0 rounded-lg bg-[#378ADD] px-4 py-2 text-[13px] font-semibold text-white">
                Consultar ahora
              </span>
            </a>
          ))}
        </div>
      )}

      {turnos.length > 0 && (
        <div className="mt-4">
          <p className="text-[13px] font-medium text-gray-500">
            {turnos.some((t) => t.mismaEspecialidad) ? "El turno más próximo de tu especialidad" : "El turno más próximo"}
          </p>
          {turnos.map((t) => (
            <a
              key={`${t.medicoId}-${t.fecha}-${t.horaInicio}`}
              href={`/clinica/${t.medicoId}/turnos`}
              onClick={() => elegir("turno", t)}
              className="mt-2 flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 active:scale-[0.99] transition-all duration-100"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{formatNombreMedico(t.nombre, t.titulo)}</p>
                <p className="truncate text-[13px] text-gray-500">
                  {t.especialidad} · <span className="whitespace-nowrap">{fechaCorta(t.fecha, t.horaInicio)}</span>
                  {precioAR(t.precio) ? ` · ${precioAR(t.precio)}` : ""}
                </p>
              </div>
              <span className="shrink-0 rounded-lg border border-[#378ADD] px-4 py-2 text-[13px] font-semibold text-[#378ADD]">
                Reservar
              </span>
            </a>
          ))}
        </div>
      )}

      <a href="/clinica" className="mt-4 block text-center text-[13px] font-medium text-[#888780] underline">
        Ver todos los profesionales
      </a>
    </div>
  );
}
