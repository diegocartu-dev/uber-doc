"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Link2, Copy, Check } from "lucide-react";
import LinkNav from "@/components/ui/LinkNav";
import ListaModelos from "@/app/medico/agenda/ListaModelos";

type Franja = { id: string; modelo_id: string; dia_semana: number; hora_inicio: string; hora_fin: string };
type Modelo = {
  id: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  activo: boolean;
  prioridad: number;
  canal_origen: string;
  duracion_turno: number | null;
  precio: number | null;
  created_at: string;
  franjas: Franja[];
};

// Consultorio particular — el link a NIVEL CONSULTORIO es el protagonista (un
// solo link para todo el canal privado, no uno por agenda — decisión registrada
// en la spec). Copiar + WhatsApp (la vía natural de un médico argentino).
export default function ConsultorioParticular({ slug, modelos, comisionPct }: { slug: string | null; modelos: Modelo[]; comisionPct: number }) {
  const [copiado, setCopiado] = useState(false);

  const url = slug ? `https://www.docto.com.ar/dr/${slug}` : null;
  const urlVisible = slug ? `docto.com.ar/dr/${slug}` : null;

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Clipboard bloqueado (permisos): el médico puede seleccionar el texto a mano.
    }
  }

  // Trato de usted y tono sobrio: el default habla por el médico (Martín, gate
  // 15/07 — "el mensaje me representa como profesional, no como promo de app").
  const textoWhatsApp = url
    ? encodeURIComponent(`Le comparto mi enlace para reservar una videoconsulta conmigo: ${url}`)
    : "";

  const cardBorder = { border: "0.5px solid #e5e7eb" };

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <Link href="/medico/como-atendes" className="inline-flex items-center gap-1 py-2 text-sm font-medium" style={{ color: "var(--color-text-link)" }}>
        <ChevronLeft size={16} /> Volver
      </Link>

      <div className="mt-2 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100">
          <Link2 size={18} className="text-gray-500" />
        </span>
        <div>
          <h1 className="text-[20px] font-semibold text-gray-900">Consultorio particular</h1>
          <p className="text-[13px] text-gray-500">Tu consultorio virtual privado. No aparece en la clínica de Docto.</p>
        </div>
      </div>

      {/* ── El link, protagonista ── */}
      <div className="mt-5 rounded-xl bg-white p-4 md:p-5" style={cardBorder}>
        <p className="text-[13px] font-medium text-gray-700">Link para compartir</p>
        {url ? (
          <>
            <p className="mt-1 select-all break-all rounded-lg bg-[#f8f9fa] px-3 py-2.5 text-[15px] font-semibold text-gray-900" style={cardBorder}>
              {urlVisible}
            </p>
            <div className="mt-3 flex flex-col gap-2 md:flex-row">
              <button
                onClick={copiar}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all duration-100 active:scale-[0.98]"
                style={{ backgroundColor: copiado ? "#1D9E75" : "#378ADD" }}
              >
                {copiado ? <><Check size={16} /> Copiado</> : <><Copy size={16} /> Copiar</>}
              </button>
              <a
                href={`https://wa.me/?text=${textoWhatsApp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all duration-100 active:scale-[0.98]"
                style={{ backgroundColor: "#25D366" }}
              >
                {/* Ícono WhatsApp */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Compartir por WhatsApp
              </a>
            </div>
            <p className="mt-3 text-[13px] text-gray-500">
              Solo quien tenga este link ve tus agendas de acá y puede reservar. Ideal para tus
              pacientes de siempre.
            </p>
            <p className="mt-1.5 text-[13px] text-gray-500">
              Docto descuenta una comisión del <strong className="text-gray-700">{comisionPct}%</strong> por
              consulta realizada; el resto va directo a tu Mercado Pago.
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-gray-500">
            Tu link se genera al completar tu perfil.{" "}
            <Link href="/medico/perfil" className="font-medium underline" style={{ color: "var(--color-text-link)" }}>
              Completalo acá.
            </Link>
          </p>
        )}
      </div>

      {/* ── Agendas privadas ── */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-gray-900">Tus agendas privadas</h2>
        </div>
        <LinkNav
          href="/medico/agenda?nuevo=1&canal=consultorio_privado"
          className="mt-3 mb-4 w-full justify-center rounded-xl bg-[#378ADD] px-5 min-h-[48px] md:min-h-0 md:py-3 text-center text-[14px] font-medium text-white hover:bg-[#2e6fb5]"
        >
          + Crear agenda
        </LinkNav>

        {modelos.length > 0 ? (
          <div className="space-y-4">
            {/* Reusa la lista con interruptor de pausa por agenda (patrón compartido
                con clínica virtual) + badge de vencida. */}
            <ListaModelos modelos={modelos} />
          </div>
        ) : (
          <div className="rounded-xl bg-white p-5 text-center" style={cardBorder}>
            <p className="text-sm text-gray-500">
              Sin agendas todavía. Creá la primera — cada agenda tiene su propio valor y horario.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
