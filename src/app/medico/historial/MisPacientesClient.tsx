"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ChevronRight, Users } from "lucide-react";

export type PacienteResumen = {
  id: string;
  nombre: string;
  edad: number | null;
  nAtenciones: number;
  ultimoMotivo: string | null;
  ultimaFecha: string; // ISO
  tieneCronica: boolean;
};

function tiempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff)) return "";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const dias = Math.floor(hrs / 24);
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
  const anios = Math.floor(meses / 12);
  return `hace ${anios} ${anios === 1 ? "año" : "años"}`;
}

function lineaSecundaria(p: PacienteResumen): string {
  const partes: string[] = [];
  if (p.edad != null) partes.push(`${p.edad} años`);
  partes.push(`${p.nAtenciones} consulta${p.nAtenciones === 1 ? "" : "s"}`);
  if (p.ultimoMotivo && p.ultimoMotivo.trim()) partes.push(p.ultimoMotivo.trim());
  return partes.join(" · ");
}

function ChipCronica() {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: "#f3f4f6", color: "#888780" }}
    >
      Crónico
    </span>
  );
}

export default function MisPacientesClient({ pacientes }: { pacientes: PacienteResumen[] }) {
  const [q, setQ] = useState("");

  const mostrarSearch = pacientes.length > 8;

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return pacientes;
    return pacientes.filter((p) => p.nombre.toLowerCase().includes(term));
  }, [q, pacientes]);

  if (pacientes.length === 0) {
    return (
      <div className="rounded-xl bg-white px-6 py-12 text-center" style={{ border: "0.5px solid #e5e7eb" }}>
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: "#f3f4f6" }}
        >
          <Users size={22} strokeWidth={1.75} style={{ color: "#888780" }} />
        </div>
        <p className="mt-4 text-base font-medium text-gray-900">
          Todavía no atendiste pacientes
        </p>
        <p className="mx-auto mt-2 max-w-xs text-sm text-gray-500">
          Cuando termines tu primera consulta, tus pacientes aparecen acá. Vas a poder
          entrar a cada uno y ver sus evoluciones.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block text-sm font-medium hover:underline"
          style={{ color: "#378ADD" }}
        >
          Ir al inicio
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Mis pacientes</h1>
        <span className="text-xs text-gray-400">
          {pacientes.length} paciente{pacientes.length === 1 ? "" : "s"}
        </span>
      </div>

      {mostrarSearch && (
        <div className="sticky top-0 z-10 -mx-6 mb-3 bg-[#f8f9fa] px-6 py-2">
          <div className="relative">
            <Search
              size={16}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "#888780" }}
            />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar paciente"
              className="w-full rounded-lg bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
              style={{ border: "0.5px solid #e5e7eb", minHeight: 44 }}
            />
          </div>
        </div>
      )}

      {filtrados.length === 0 ? (
        <p className="rounded-xl bg-white px-6 py-8 text-center text-sm text-gray-500" style={{ border: "0.5px solid #e5e7eb" }}>
          No hay pacientes que coincidan con “{q.trim()}”.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white" style={{ border: "0.5px solid #e5e7eb" }}>
          {filtrados.map((p, i) => (
            <Link
              key={p.id}
              href={`/medico/paciente/${p.id}`}
              className="flex items-center gap-3 px-4 transition-colors hover:bg-gray-50"
              style={{
                minHeight: 64,
                borderTop: i === 0 ? undefined : "0.5px solid #f0f0f0",
              }}
            >
              <div className="min-w-0 flex-1 py-3">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-gray-900">{p.nombre}</p>
                  {p.tieneCronica && <ChipCronica />}
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500">{lineaSecundaria(p)}</p>
              </div>
              <span className="shrink-0 text-xs text-gray-400">{tiempoRelativo(p.ultimaFecha)}</span>
              <ChevronRight size={16} strokeWidth={1.75} className="shrink-0" style={{ color: "#d1d5db" }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
