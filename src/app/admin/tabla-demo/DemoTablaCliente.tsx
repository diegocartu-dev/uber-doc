"use client";

import { useMemo } from "react";
import { BarraTabla, CabezaTabla, Historicos, useVistaTabla, type Columna } from "@/components/tabla/TablaDatos";
import { masNuevoPrimero } from "@/lib/tabla";

type Fila = {
  id: number;
  profesional: string;
  especialidad: string;
  provincia: string;
  estado: string;
  atenciones: number | null;
  precio: number | null;
  alta: string;
  activo: boolean;
};

// Datos inventados. Ver el comentario de page.tsx: ejercitan las cuatro trampas.
const DATOS: Fila[] = [
  { id: 1, profesional: "Atención Central", especialidad: "Clínica médica", provincia: "CABA", estado: "Disponible", atenciones: 12, precio: 45000, alta: "2026-07-22", activo: true },
  { id: 2, profesional: "Base 10", especialidad: "Dermatología", provincia: "Buenos Aires", estado: "En consulta", atenciones: 3, precio: 30000, alta: "2026-09-04", activo: true },
  { id: 3, profesional: "Base 2", especialidad: "Clínica médica", provincia: "Córdoba", estado: "Disponible", atenciones: null, precio: 20000, alta: "2026-08-11", activo: true },
  { id: 4, profesional: "Ñandú Peña", especialidad: "Cardiología", provincia: "Buenos Aires", estado: "Sin cuenta de cobros", atenciones: 40, precio: null, alta: "2026-08-11", activo: true },
  { id: 5, profesional: "ATENCION Nocturna", especialidad: "Clínica médica", provincia: "CABA", estado: "Disponible", atenciones: 7, precio: 45000, alta: "2026-05-30", activo: true },
  { id: 6, profesional: "Marisa Del Valle", especialidad: "Ginecología", provincia: "Santa Fe", estado: "En consulta", atenciones: 21, precio: 50000, alta: "2026-09-01", activo: true },
  { id: 7, profesional: "Oscar Iriarte", especialidad: "Dermatología", provincia: "Mendoza", estado: "Identidad pendiente", atenciones: null, precio: 35000, alta: "2026-08-28", activo: true },
  { id: 8, profesional: "Lucía Sandoval", especialidad: "Clínica médica", provincia: "CABA", estado: "Disponible", atenciones: 5, precio: 40000, alta: "2026-06-15", activo: false },
  { id: 9, profesional: "Rubén Ávalos", especialidad: "Cardiología", provincia: "Córdoba", estado: "Suspendido", atenciones: 2, precio: 38000, alta: "2026-04-02", activo: false },
];

// El ciclo de vida manda sobre el alfabeto: un estado no se ordena por su inicial.
const CICLO_ESTADO = ["Disponible", "En consulta", "Identidad pendiente", "Sin cuenta de cobros", "Suspendido"];

const COLUMNAS: Columna<Fila>[] = [
  { k: "profesional", t: "Profesional", val: (f) => f.profesional },
  { k: "especialidad", t: "Especialidad", val: (f) => f.especialidad },
  { k: "provincia", t: "Provincia", val: (f) => f.provincia },
  { k: "estado", t: "Estado", val: (f) => f.estado, rango: CICLO_ESTADO },
  { k: "atenciones", t: "Atenciones", val: (f) => f.atenciones, num: true },
  { k: "precio", t: "Precio", val: (f) => f.precio, num: true },
  // `porEvento`: la fecha la genera cada alta y crece sin techo → SOLO orden, sin embudo.
  { k: "alta", t: "Alta", val: (f) => f.alta, tipo: "fecha", porEvento: true },
  { k: "acc", t: "Acciones", val: () => "", sinOrden: true, num: true },
];

const ars = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v);

const COLOR_ESTADO: Record<string, string> = {
  "Disponible": "#1D9E75",
  "En consulta": "#BA7517",
  "Identidad pendiente": "#BA7517",
  "Sin cuenta de cobros": "#D85A30",
  "Suspendido": "#E24B4A",
};

export default function DemoTablaCliente() {
  const enUso = useMemo(() => DATOS.filter((f) => f.activo), []);
  const historicos = useMemo(() => DATOS.filter((f) => !f.activo), []);

  const vista = useVistaTabla(enUso, COLUMNAS, {
    clave: (f) => String(f.id),
    defecto: masNuevoPrimero<Record<string, unknown>>("alta", "id") as (a: Fila, b: Fila) => number,
  });

  const fila = (f: Fila, historica = false) => (
    <tr key={f.id} className={"border-b border-gray-50 " + (historica ? "opacity-75" : "")}>
      <td className="px-3 py-2.5 text-sm font-medium text-gray-900">{f.profesional}</td>
      <td className="px-3 py-2.5 text-sm text-gray-600">{f.especialidad}</td>
      <td className="px-3 py-2.5 text-sm text-gray-600">{f.provincia}</td>
      <td className="px-3 py-2.5 text-sm">
        {/* Estado = punto de color + texto, nunca color solo (regla 6). */}
        <span className="inline-flex items-center gap-1.5 text-gray-700">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLOR_ESTADO[f.estado] ?? "#888780" }} />
          {f.estado}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right text-sm tabular-nums text-gray-700">{f.atenciones ?? "—"}</td>
      <td className="px-3 py-2.5 text-right text-sm tabular-nums text-gray-700">{ars(f.precio)}</td>
      <td className="px-3 py-2.5 text-sm text-gray-500">{f.alta.split("-").reverse().join("/")}</td>
      <td className="px-3 py-2.5 text-right">
        <button className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50">
          {historica ? "Reactivar" : "Ver"}
        </button>
      </td>
    </tr>
  );

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900">Vista de tabla — demo</h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-500">
        Datos inventados, para validar el modelo antes de aplicarlo a las pantallas reales.
        Probá: escribir <strong>atencion</strong> sin acento, ordenar <strong>Atenciones</strong> (los vacíos
        quedan al final en los dos sentidos), ordenar <strong>Profesional</strong> (Base 2 antes que Base 10),
        el embudo de <strong>Especialidad</strong>, y buscar <strong>Sandoval</strong>, que está en Históricos
        y abre la sección sola. Todo queda escrito en la dirección de la página.
      </p>

      <div className="mt-5 rounded-xl bg-white p-4" style={{ border: "1px solid #e5e7eb" }}>
        <BarraTabla vista={vista} placeholder="Buscar profesional…" cuenta="profesionales" enHistoricos={historicos.length} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <CabezaTabla vista={vista} />
            <tbody>
              {vista.filas.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-gray-400">Nada coincide con lo buscado.</td></tr>
              )}
              {vista.filas.map((f) => fila(f))}
            </tbody>
            <Historicos filas={historicos} colSpan={8} buscando={!!vista.vista.texto}>
              {(f) => fila(f, true)}
            </Historicos>
          </table>
        </div>
      </div>
    </div>
  );
}
