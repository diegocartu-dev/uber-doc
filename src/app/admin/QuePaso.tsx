import Link from "next/link";
import type { Ahora, ResumenDia, AtencionQuePaso } from "@/lib/consultas/que-paso";
import { ESTADO_LAB } from "@/lib/tablero/vista";
import { esPsicologia } from "@/lib/medicos/vocabulario";
import { formatNombreMedico } from "@/lib/utils/texto";

/**
 * «Qué pasó»: la primera tarjeta de /admin y del Tablero (Diego, 23/10/2026).
 * Hoy va siempre primero. Una línea por atención: hora · profesional →
 * paciente · desenlace con su punto de color · el porqué. Es la fila del
 * Historial, compactada; los datos vienen de `lib/consultas/que-paso.ts`.
 *
 * No tiene estado ni hooks: la renderiza igual un server component (Tablero)
 * que el cliente del Dashboard.
 */

// Punto de color por clase del porqué. Verde solo para indicar estado (design
// system); rojo = falla de un proceso; gris = lo que alguien decidió; naranja =
// sin datos (como COLOR_PORQUE del Historial).
const COLOR: Record<string, string> = {
  atendida: "#1D9E75",
  en_curso: "#378ADD",
  falla: "#E24B4A",
  suceso: "#888780",
  sin_datos: "#D85A30",
};

const ars = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;
const horaAR = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });
const diaLargo = (fecha: string) =>
  new Date(`${fecha}T12:00:00-03:00`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const nombreProfesional = (a: AtencionQuePaso) =>
  esPsicologia(a.profesion) && a.medico && a.medico !== "—" ? formatNombreMedico(a.medico, "Lic.") : a.medico;

// Etiqueta corta del estado, la misma palabra que usa el Tablero (`ESTADO_LAB`).
// Una reserva viva ('reservado_pendiente') es "Pendiente de pago", nunca "Pagado".
const etiqueta = (a: AtencionQuePaso) =>
  a.estado === "reservado_pendiente" ? "Pendiente de pago" : ESTADO_LAB[a.estado] ?? a.estado;

function Fila({ a }: { a: AtencionQuePaso }) {
  const detalle = a.porque.clase !== "atendida" && a.porque.clase !== "en_curso" ? a.porque.texto : null;
  return (
    <div className="grid grid-cols-[52px_1fr] items-start gap-x-3 border-t border-gray-100 py-2 text-sm lg:grid-cols-[52px_minmax(0,1.3fr)_170px_minmax(0,1fr)]">
      <span className="tabular-nums text-gray-400">{horaAR(a.inicio)}</span>
      <span className="text-gray-900">
        {nombreProfesional(a)} <span className="text-gray-400">→</span> {a.paciente}
        <span className="ml-2 text-xs text-gray-400">{a.tipo === "CI" ? "CI" : "Turno"}{a.especialidad ? ` · ${a.especialidad}` : ""}</span>
      </span>
      <span className="col-start-2 inline-flex items-center gap-1.5 whitespace-nowrap lg:col-start-3">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLOR[a.porque.clase] ?? "#888780" }} />
        <span className="font-medium text-gray-800">{etiqueta(a)}</span>
      </span>
      {detalle && <span className="col-start-2 text-[13px] text-gray-500 lg:col-start-4">{detalle}</span>}
    </div>
  );
}

function Resumen({ r }: { r: ResumenDia }) {
  const partes: string[] = [];
  if (r.atendidas) partes.push(plural(r.atendidas, "atendida", "atendidas"));
  if (r.enCurso) partes.push(plural(r.enCurso, "en curso", "en curso"));
  if (r.caidas) partes.push(plural(r.caidas, "caída", "caídas"));
  return (
    <div className="mt-1 mb-2 flex flex-wrap items-baseline gap-x-2">
      <span className="text-2xl font-semibold text-gray-900">{plural(r.total, "atención", "atenciones")}</span>
      {partes.length > 0 && <span className="text-sm text-gray-500">{partes.join(" · ")}</span>}
    </div>
  );
}

function Motivos({ r }: { r: ResumenDia }) {
  if (r.motivos.length === 0) return null;
  return (
    <p className="mt-2 text-[13px] text-gray-500">
      Caídas: {r.motivos.map((m) => `${m.n} ${m.texto.charAt(0).toLowerCase()}${m.texto.slice(1)}`).join(" · ")}
    </p>
  );
}

function Tarjeta({ titulo, derecha, children }: { titulo: string; derecha?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-5" style={{ border: "1px solid #e5e7eb" }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
        {derecha && <span className="text-xs text-gray-400">{derecha}</span>}
      </div>
      {children}
    </div>
  );
}

function AhoraLinea({ ahora }: { ahora: Ahora }) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 border-b border-gray-100 pb-3 text-sm">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: ahora.esperando.length ? "#BA7517" : "#888780" }} />
        <span className="text-gray-500">Esperando que alguien acepte:</span>
        {ahora.esperando.length === 0 ? (
          <span className="text-gray-700">nadie</span>
        ) : (
          <span className="text-gray-900">
            {ahora.esperando.map((e) => `${e.paciente} → ${e.medico} · hace ${e.minutos} min`).join(" · ")}
          </span>
        )}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: ahora.enCurso.length ? "#378ADD" : "#888780" }} />
        <span className="text-gray-500">En curso:</span>
        {ahora.enCurso.length === 0 ? (
          <span className="text-gray-700">ninguna</span>
        ) : (
          <span className="text-gray-900">
            {ahora.enCurso.map((c) => `${c.medico} → ${c.paciente} · ${ESTADO_LAB[c.estado] ?? c.estado}`).join(" · ")}
          </span>
        )}
      </span>
    </div>
  );
}

export type QuePasoProps = {
  hoy: ResumenDia;
  ayer: ResumenDia;
  /** Los últimos 7 días, hoy incluido. */
  semana: ResumenDia;
  ahora: Ahora;
};

export default function QuePaso({ hoy, ayer, semana, ahora }: QuePasoProps) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <Tarjeta titulo={`Hoy, ${diaLargo(hoy.fecha)}`} derecha={hoy.cobrado ? `${ars(hoy.cobrado)} cobrado` : undefined}>
        <div className="mt-3">
          <AhoraLinea ahora={ahora} />
        </div>
        <Resumen r={hoy} />
        {hoy.atenciones.length === 0 ? (
          <p className="text-sm text-gray-500">Ninguna atención todavía.</p>
        ) : (
          hoy.atenciones.map((a) => <Fila key={`${a.tipo}-${a.id}`} a={a} />)
        )}
      </Tarjeta>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta titulo={`Ayer, ${diaLargo(ayer.fecha)}`} derecha={ayer.cobrado ? `${ars(ayer.cobrado)} cobrado` : undefined}>
          <Resumen r={ayer} />
          {ayer.atenciones.length === 0 ? (
            <p className="text-sm text-gray-500">Ninguna atención.</p>
          ) : (
            ayer.atenciones.map((a) => <Fila key={`${a.tipo}-${a.id}`} a={a} />)
          )}
        </Tarjeta>

        <Tarjeta titulo="Últimos 7 días" derecha={semana.cobrado ? `${ars(semana.cobrado)} cobrado` : undefined}>
          <Resumen r={semana} />
          <Motivos r={semana} />
          <Link href="/admin/consultas" className="mt-3 inline-block text-sm text-[#378ADD] hover:underline">
            Ver Consultas →
          </Link>
        </Tarjeta>
      </div>
    </div>
  );
}
