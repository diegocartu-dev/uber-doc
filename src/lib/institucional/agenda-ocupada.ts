// src/lib/institucional/agenda-ocupada.ts
// QUÉ FRANJAS TIENE OCUPADAS EL PROFESIONAL, Y CÓMO SE LO CUENTA A NOVA.
// SOLO instancia institucional.
//
// ── QUÉ PROBLEMA RESUELVE ────────────────────────────────────────────────────
// `crearAgendaModelo` rechaza cualquier agenda que se pise en horario con
// turnos que ya existen (R1, y está bien: nadie atiende dos cosas a la vez).
// Nova, en cambio, no sabía nada de eso: su contexto llevaba la duración y el
// precio de la institución y nada más. Entonces armaba el pedido a ciegas, la
// API lo rechazaba con `conflicto_agenda`, y en la reunión eso se ve como la
// asistente fallando en vivo.
//
// El escenario de la demo lo tapaba a medias dejando UNA banda libre y pidiendo
// que alguien le soplara al participante cuál era. Pero el pedido más natural de
// todos —"lunes a viernes de 9 a 12 y también de 15 a 18"— se pisa con la banda
// llena en CUALQUIERA de las dos configuraciones, así que fallaba igual. Y una
// demo que depende de que nadie improvise no es una demo: es un libreto.
//
// Acá vive el fix de raíz: se lee qué tiene ocupado, se le cuenta a Nova en su
// contexto, y —como backstop determinístico, que no depende de que el modelo
// haga caso— el confirmador RECORTA el pedido contra lo ocupado y crea la parte
// libre en vez de fallar entera.
//
// ── B2C ──────────────────────────────────────────────────────────────────────
// Todo lo de acá es aditivo y gateado por modo: en B2C `bandasOcupadasDelProfesional`
// devuelve `[]` sin tocar la base y el confirmador ni entra al bloque. El
// comportamiento del médico del marketplace —que ante un choque recibe el
// rechazo duro de siempre— no cambia en nada.

import { createAdminClient } from "@/lib/supabase/admin";
import { esInstitucional } from "@/lib/instancia";

/** Franja pedida o libre, en el mismo formato que `crearAgendaModelo`. */
export type Franja = { dia_semana: number; hora_inicio: string; hora_fin: string };

/** Una banda que YA está ocupada, con el motor que la puso. */
export type BandaOcupada = Franja & {
  /** `acordado` (la levantó la institución) | `ofrecido` (la publicó él) | otro. */
  canal: string;
};

const DIAS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/**
 * Estados que hacen que un turno OCUPE su horario, o sea los mismos que miran
 * los dos frenos de `crearAgendaModelo`: el freno duro por turnos con paciente
 * y el R1 por agendas que se pisan. Si esta lista se desalinea de allá, Nova
 * vuelve a proponer algo que la API rechaza.
 */
export const ESTADOS_QUE_OCUPAN = [
  "disponible",
  "reservado_pendiente",
  "confirmado",
  "en_espera",
  "en_curso",
];

function aMin(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function aHora(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

/** "2026-08-13" → 1=lunes … 7=domingo (pivot T12:00 para no caer en el drift UTC). */
export function diaSemanaDe(fecha: string): number {
  const js = new Date(fecha + "T12:00:00").getDay();
  return js === 0 ? 7 : js;
}

/**
 * De filas sueltas de `turnos` a BANDAS: por día de semana y canal, los slots
 * contiguos se funden en un solo intervalo.
 *
 * Función pura: es lo que se puede probar sin base, y es donde vive el único
 * razonamiento no trivial (un lunes con 6 turnos de 20' de 09:00 a 11:00 tiene
 * que contarse como "lunes 09:00-11:00", no como seis líneas en el prompt).
 */
export function fusionarBandas(
  filas: { fecha: string; hora_inicio: string; hora_fin: string; canal_origen?: string | null }[]
): BandaOcupada[] {
  const porClave = new Map<string, { dia: number; canal: string; tramos: [number, number][] }>();
  for (const f of filas) {
    if (!f.fecha || !f.hora_inicio || !f.hora_fin) continue;
    const dia = diaSemanaDe(f.fecha);
    const canal = f.canal_origen ?? "";
    const clave = `${dia}|${canal}`;
    const entrada = porClave.get(clave) ?? { dia, canal, tramos: [] };
    entrada.tramos.push([aMin(f.hora_inicio), aMin(f.hora_fin)]);
    porClave.set(clave, entrada);
  }

  const bandas: BandaOcupada[] = [];
  for (const { dia, canal, tramos } of porClave.values()) {
    tramos.sort((a, b) => a[0] - b[0]);
    let actual: [number, number] | null = null;
    for (const t of tramos) {
      if (actual && t[0] <= actual[1]) {
        actual[1] = Math.max(actual[1], t[1]);
        continue;
      }
      if (actual) bandas.push({ dia_semana: dia, hora_inicio: aHora(actual[0]), hora_fin: aHora(actual[1]), canal });
      actual = [t[0], t[1]];
    }
    if (actual) bandas.push({ dia_semana: dia, hora_inicio: aHora(actual[0]), hora_fin: aHora(actual[1]), canal });
  }
  return bandas.sort((a, b) => a.dia_semana - b.dia_semana || aMin(a.hora_inicio) - aMin(b.hora_inicio));
}

/** "lunes a viernes", "lunes y jueves", "martes". */
export function resumirDias(dias: number[]): string {
  const orden = [...new Set(dias)].sort((a, b) => a - b);
  if (orden.length === 0) return "";
  if (orden.length === 1) return DIAS[orden[0]];
  const contiguos = orden.every((d, i) => i === 0 || d === orden[i - 1] + 1);
  if (contiguos && orden.length >= 3) return `${DIAS[orden[0]]} a ${DIAS[orden[orden.length - 1]]}`;
  const nombres = orden.map((d) => DIAS[d]);
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** De dónde salió esa banda, dicho como se lo diría a un profesional. */
export function motivoDeCanal(canal: string): string {
  if (canal === "acordado") return "turnos que levantó la institución";
  if (canal === "ofrecido") return "turnos que abrió usted";
  return "turnos ya abiertos";
}

/**
 * El texto que viaja en el contexto de Nova. Compacto a propósito: entra en el
 * bloque dinámico del system prompt y se lee en cada request.
 */
export function describirOcupadas(bandas: BandaOcupada[]): string {
  if (bandas.length === 0) return "Ninguna: tiene la agenda libre.";
  const porTramo = new Map<string, { dias: number[]; b: BandaOcupada }>();
  for (const b of bandas) {
    const clave = `${b.hora_inicio}|${b.hora_fin}|${b.canal}`;
    const e = porTramo.get(clave) ?? { dias: [], b };
    e.dias.push(b.dia_semana);
    porTramo.set(clave, e);
  }
  return [...porTramo.values()]
    .map(({ dias, b }) => `${resumirDias(dias)} de ${b.hora_inicio} a ${b.hora_fin} (${motivoDeCanal(b.canal)})`)
    .join("; ");
}

// ─── El recorte: la parte del pedido que SÍ se puede crear ───────────────────

export type Choque = { pedida: Franja; con: BandaOcupada };

export interface Recorte {
  /** Lo que queda del pedido después de sacarle lo ocupado. Puede ser vacío. */
  libres: Franja[];
  /** Qué se sacó y contra qué chocaba. Es lo que Nova tiene que poder contar. */
  choques: Choque[];
}

/**
 * Le saca al pedido las bandas que ya están ocupadas y devuelve lo que queda.
 *
 * `duracionMin` importa: un resto de 10 minutos con slots de 20 no produce
 * ningún turno, y crear un modelo que genera cero es peor que no crearlo (la
 * API lo rechaza con "el rango y la duración no permiten crear ningún turno",
 * que en la reunión se lee como otro fallo).
 */
export function recortarFranjas(
  pedidas: Franja[],
  ocupadas: BandaOcupada[],
  duracionMin: number
): Recorte {
  const libres: Franja[] = [];
  const choques: Choque[] = [];

  for (const p of pedidas) {
    const delDia = ocupadas.filter((o) => o.dia_semana === p.dia_semana);
    let restos: [number, number][] = [[aMin(p.hora_inicio), aMin(p.hora_fin)]];
    for (const o of delDia) {
      const oi = aMin(o.hora_inicio);
      const of = aMin(o.hora_fin);
      const siguientes: [number, number][] = [];
      let pisó = false;
      for (const [ri, rf] of restos) {
        if (of <= ri || oi >= rf) {
          siguientes.push([ri, rf]); // no se tocan
          continue;
        }
        pisó = true;
        if (ri < oi) siguientes.push([ri, Math.min(oi, rf)]);
        if (of < rf) siguientes.push([Math.max(of, ri), rf]);
      }
      if (pisó) choques.push({ pedida: p, con: o });
      restos = siguientes;
    }
    for (const [ri, rf] of restos) {
      if (rf - ri >= duracionMin) {
        libres.push({ dia_semana: p.dia_semana, hora_inicio: aHora(ri), hora_fin: aHora(rf) });
      }
    }
  }

  return { libres, choques };
}

/**
 * Los huecos que quedan en un día dentro de la ventana de la institución. Es lo
 * que Nova ofrece cuando el pedido entero se pisaba: "le abro de 12 a 15".
 */
export function huecosDelDia(
  ocupadas: BandaOcupada[],
  diaSemana: number,
  ventana: { inicio: string; fin: string },
  duracionMin: number
): { hora_inicio: string; hora_fin: string }[] {
  const pedido: Franja = { dia_semana: diaSemana, hora_inicio: ventana.inicio, hora_fin: ventana.fin };
  return recortarFranjas([pedido], ocupadas, duracionMin).libres.map((f) => ({
    hora_inicio: f.hora_inicio,
    hora_fin: f.hora_fin,
  }));
}

/**
 * La frase que se le devuelve al profesional cuando TODO lo que pidió estaba
 * ocupado. Dice las tres cosas: qué se pisa, por qué, y qué sí se puede — que
 * es lo que faltaba, porque un "hay un conflicto" a secas deja al participante
 * (y a Nova) sin salida delante de la sala.
 */
export function frasePedidoTodoOcupado(
  choques: Choque[],
  huecos: { hora_inicio: string; hora_fin: string }[]
): string {
  const primero = choques[0];
  const donde = primero
    ? `de ${primero.con.hora_inicio} a ${primero.con.hora_fin} ya tiene ${motivoDeCanal(primero.con.canal)}`
    : "ese horario ya está ocupado";
  if (huecos.length === 0) {
    return `No abro turnos ahí porque ${donde}. Ese día no le queda ningún hueco libre: elija otro horario o revise esa agenda.`;
  }
  // Se ofrece el hueco MÁS GRANDE, no el primero. Con la mañana llena, el
  // primero es la hora suelta que queda antes (08:00-09:00) y ofrecer eso es
  // ofrecer casi nada: lo que le sirve es la tarde entera.
  const h = [...huecos].sort(
    (a, b) => aMin(b.hora_fin) - aMin(b.hora_inicio) - (aMin(a.hora_fin) - aMin(a.hora_inicio))
  )[0];
  return `No abro turnos ahí porque ${donde}. Le puedo abrir de ${h.hora_inicio} a ${h.hora_fin}, ¿va?`;
}

/** La frase para cuando se creó una parte y quedó otra afuera. */
export function fraseRecorteParcial(choques: Choque[]): string {
  if (choques.length === 0) return "";
  const c = choques[0];
  return ` Dejé afuera de ${c.con.hora_inicio} a ${c.con.hora_fin} porque ahí ya tiene ${motivoDeCanal(c.con.canal)}.`;
}

// ─── La lectura (solo instancia institucional) ────────────────────────────────

/**
 * Las bandas que el profesional ya tiene ocupadas en el rango, fusionadas.
 *
 * Service role: se lee `turnos` sin depender del cliente RLS del request (lo
 * llaman tanto el chat de Nova como el confirmador, que ya corre con admin).
 * Ante un error devuelve `[]` — sin bandas, Nova se comporta como antes y la
 * API sigue siendo la autoridad que rechaza el choque. Callarse de más nunca
 * crea nada indebido.
 */
export async function bandasOcupadasDelProfesional(params: {
  medicoId: string;
  desde: string;
  hasta: string;
}): Promise<BandaOcupada[]> {
  if (!esInstitucional()) return [];
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("turnos")
      .select("fecha, hora_inicio, hora_fin, canal_origen")
      .eq("medico_id", params.medicoId)
      .gte("fecha", params.desde)
      .lte("fecha", params.hasta)
      .in("estado", ESTADOS_QUE_OCUPAN);
    if (error) {
      console.error("[agenda-ocupada] No se pudo leer la agenda del profesional:", error.message);
      return [];
    }
    return fusionarBandas(
      (data ?? []) as { fecha: string; hora_inicio: string; hora_fin: string; canal_origen: string | null }[]
    );
  } catch (err) {
    console.error("[agenda-ocupada] bandasOcupadasDelProfesional falló:", err);
    return [];
  }
}
