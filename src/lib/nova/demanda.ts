// Cuándo le conviene a un profesional estar disponible.
//
// ── QUÉ PROBLEMA RESUELVE (decisión Diego, 20/09/2026) ───────────────────────
// La pregunta más frecuente que recibe Nova es alguna forma de "¿tengo
// pacientes?", y hasta hoy la contestaba bien y se quedaba ahí: un profesional
// la repitió media docena de veces y recibió media docena de "no". El dato sin
// una salida es la peor respuesta posible justo en el momento en que alguien se
// está preguntando si esto le sirve.
//
// Acá se calcula la única salida que tenemos con datos propios: en qué franja
// del día tiene más chances de que lo elijan.
//
// ── LAS DOS REGLAS DE LO QUE SE PUEDE DECIR (Diego, 20/09/2026) ──────────────
// Este módulo devuelve un ORDEN, nunca cifras, y es a propósito:
//
//   1. **Nunca se dan números de demanda.** Al volumen de hoy, la franja más
//      cargada recibe alrededor de una persona por día. Decirlo no informa: hace
//      perder la confianza en la plataforma. El objetivo es que el profesional
//      cierre más consultas, no que audite nuestro tamaño.
//   2. **Nunca se habla de los demás profesionales.** El ranking SÍ se calcula
//      con la oferta conectada —es lo que lo hace bueno, porque si no manda a
//      todo el mundo a la misma hora—, pero eso es mecánica interna. Hacia
//      afuera es "acá tiene más chances", nunca "hay pocos colegas a esa hora".
//
// Por eso el tipo que sale de acá no tiene un solo `number`: no es un descuido,
// es la garantía de que nadie pueda filtrar una cifra por accidente.

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/logger";

/** Las franjas en las que se parte el día, en castellano y como las diría una persona. */
const FRANJAS = [
  { clave: "manana", etiqueta: "de 9 a 12", desde: 9, hasta: 11 },
  { clave: "tarde", etiqueta: "de 14 a 17", desde: 14, hasta: 16 },
  { clave: "noche", etiqueta: "de 19 a 23", desde: 19, hasta: 22 },
] as const;

/** Sale un ORDEN, no cifras. Ver la regla 1 de arriba. */
export type FranjasPorChance = {
  /** De la que más chances da a la que menos. Siempre las tres. */
  orden: string[];
  /** La primera, aparte, que es la que Nova nombra. */
  mejor: string;
};

const VENTANA_DIAS = 60;
const CACHE_MS = 6 * 60 * 60 * 1000; // el ranking se mueve por semanas, no por minutos
let cache: { at: number; valor: FranjasPorChance | null } | null = null;

const horaAR = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).getUTCHours();
const diaAR = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10);

/**
 * El orden de las franjas por chance de que a este profesional lo elijan.
 *
 * Best-effort: si algo falla devuelve `null` y Nova simplemente no recomienda
 * nada. Una recomendación es un extra — nunca puede costarle una respuesta a
 * quien está trabajando.
 */
export async function franjasPorChance(): Promise<FranjasPorChance | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.valor;
  const valor = await calcular();
  cache = { at: Date.now(), valor };
  return valor;
}

async function calcular(): Promise<FranjasPorChance | null> {
  try {
    const admin = createAdminClient();
    const desde = new Date(Date.now() - VENTANA_DIAS * 86400_000).toISOString();

    const [{ data: vistas }, { data: pacsTest }, { data: log }] = await Promise.all([
      admin.from("eventos_funnel").select("paciente_id, created_at")
        .eq("evento", "clinica_vista").gte("created_at", desde),
      admin.from("pacientes").select("user_id").eq("es_cuenta_test", true),
      admin.from("disponibilidad_log").select("medico_id, online, at")
        .gte("at", desde).order("at", { ascending: true }),
    ]);
    if (!vistas?.length || !log?.length) return null;

    // Las cuentas de prueba NO se cuentan (Diego, 20/09). Una sola de ellas
    // acumula más vistas de clínica que TODOS los pacientes reales juntos: sin
    // este filtro el ranking lo dibuja QA, no los pacientes.
    const test = new Set((pacsTest ?? []).map((p: { user_id: string | null }) => p.user_id).filter(Boolean) as string[]);

    // DEMANDA: personas-día, no vistas. La misma persona entra muchas veces en
    // una tarde y contarlas sueltas inventa picos que no existen.
    const personas = new Map<string, Set<string>>();
    for (const v of vistas as { paciente_id: string | null; created_at: string }[]) {
      if (!v.paciente_id || test.has(v.paciente_id)) continue;
      const f = FRANJAS.find((f) => { const h = horaAR(v.created_at); return h >= f.desde && h <= f.hasta; });
      if (!f) continue;
      const set = personas.get(f.clave) ?? new Set<string>();
      set.add(`${v.paciente_id}|${diaAR(v.created_at)}`);
      personas.set(f.clave, set);
    }

    // OFERTA: profesionales en línea, reconstruida del log.
    //
    // ⚠️ LA TRAMPA: el `lead` va sobre TODAS las filas y recién después se
    // filtra por `online`. Al revés —filtrar y después encadenar— cada encendido
    // se estira hasta el SIGUIENTE encendido y se traga el apagado del medio:
    // da una oferta plana y enorme a las cuatro de la mañana. Pasó midiendo esto.
    const porMedico = new Map<string, { at: number; online: boolean }[]>();
    for (const l of log as { medico_id: string; online: boolean; at: string }[]) {
      const arr = porMedico.get(l.medico_id) ?? [];
      arr.push({ at: Date.parse(l.at), online: !!l.online });
      porMedico.set(l.medico_id, arr);
    }
    const tramos: { desde: number; hasta: number }[] = [];
    const ahora = Date.now();
    for (const arr of porMedico.values()) {
      arr.forEach((e, i) => {
        if (e.online) tramos.push({ desde: e.at, hasta: arr[i + 1]?.at ?? ahora });
      });
    }

    // Horas-profesional en línea dentro de cada franja, muestreando hora a hora.
    const horasOnline = new Map<string, number>();
    for (let t = Date.now() - VENTANA_DIAS * 86400_000; t < ahora; t += 3600_000) {
      const f = FRANJAS.find((f) => { const h = horaAR(new Date(t).toISOString()); return h >= f.desde && h <= f.hasta; });
      if (!f) continue;
      const n = tramos.filter((tr) => tr.desde < t + 3600_000 && tr.hasta > t).length;
      horasOnline.set(f.clave, (horasOnline.get(f.clave) ?? 0) + n);
    }

    // La chance es demanda POR profesional conectado, no demanda a secas: con la
    // demanda cruda la recomendación manda a todos a la misma franja, que es
    // justo donde ya están todos.
    const puntaje = FRANJAS.map((f) => {
      const dem = personas.get(f.clave)?.size ?? 0;
      const ofe = horasOnline.get(f.clave) ?? 0;
      return { etiqueta: f.etiqueta, valor: ofe > 0 ? dem / ofe : 0 };
    });
    if (puntaje.every((p) => p.valor === 0)) return null;

    const orden = [...puntaje].sort((a, b) => b.valor - a.valor).map((p) => p.etiqueta);
    return { orden, mejor: orden[0] };
  } catch (e) {
    logError("[nova-demanda]", "No se pudo calcular el orden de franjas", { error: String(e) });
    return null;
  }
}
