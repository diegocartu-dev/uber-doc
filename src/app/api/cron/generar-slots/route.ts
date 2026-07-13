import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logInfo, logError } from "@/lib/logger";
import { withCron } from "@/lib/cron-guard";
import { insertarSlotsSinDuplicar } from "@/lib/agenda/insertar-slots";

function getHoyAR(): string {
  const ar = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
  );
  return `${ar.getFullYear()}-${(ar.getMonth() + 1).toString().padStart(2, "0")}-${ar.getDate().toString().padStart(2, "0")}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

// dia_semana en DB: 1=lunes ... 7=domingo
// JS getDay(): 0=domingo, 1=lunes ... 6=sabado
function jsDayToDbDay(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

function generarSlotsParaFranja(
  fecha: string,
  horaInicio: string,
  horaFin: string,
  duracionMinutos: number
): { hora_inicio: string; hora_fin: string }[] {
  const slots: { hora_inicio: string; hora_fin: string }[] = [];
  const [hi, mi] = horaInicio.split(":").map(Number);
  const [hf, mf] = horaFin.split(":").map(Number);
  const inicioMin = hi * 60 + mi;
  const finMin = hf * 60 + mf;

  let cursor = inicioMin;
  while (cursor + duracionMinutos <= finMin) {
    const slotInicio = `${Math.floor(cursor / 60).toString().padStart(2, "0")}:${(cursor % 60).toString().padStart(2, "0")}:00`;
    const slotFin = `${Math.floor((cursor + duracionMinutos) / 60).toString().padStart(2, "0")}:${((cursor + duracionMinutos) % 60).toString().padStart(2, "0")}:00`;
    slots.push({ hora_inicio: slotInicio, hora_fin: slotFin });
    cursor += duracionMinutos;
  }
  return slots;
}

async function handler(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const hoy = getHoyAR();
  const horizonte = addDays(hoy, 30);

  // 1. Obtener modelos activos
  const { data: modelos, error: errModelos } = await supabase
    .from("agenda_modelos")
    .select("id, medico_id, fecha_inicio, fecha_fin, duracion_turno, precio")
    .eq("activo", true);

  if (errModelos) {
    return NextResponse.json(
      { error: "Error leyendo modelos", detail: errModelos.message },
      { status: 500 }
    );
  }

  if (!modelos || modelos.length === 0) {
    return NextResponse.json({
      message: "No hay modelos activos",
      slots_generados: 0,
    });
  }

  // 2. Obtener franjas de todos los modelos activos
  const modeloIds = modelos.map((m) => m.id);
  const { data: franjas, error: errFranjas } = await supabase
    .from("agenda_franjas")
    .select("id, modelo_id, dia_semana, hora_inicio, hora_fin")
    .in("modelo_id", modeloIds);

  if (errFranjas) {
    return NextResponse.json(
      { error: "Error leyendo franjas", detail: errFranjas.message },
      { status: 500 }
    );
  }

  const franjasPorModelo = new Map<string, typeof franjas>();
  for (const f of franjas ?? []) {
    const arr = franjasPorModelo.get(f.modelo_id) ?? [];
    arr.push(f);
    franjasPorModelo.set(f.modelo_id, arr);
  }

  // 3. Generar slots por modelo
  const resumen: { medico_id: string; modelo_id: string; slots: number }[] =
    [];
  let totalInsertados = 0;

  for (const modelo of modelos) {
    const modeloFranjas = franjasPorModelo.get(modelo.id);
    if (!modeloFranjas || modeloFranjas.length === 0) continue;

    const rangoInicio = modelo.fecha_inicio > hoy ? modelo.fecha_inicio : hoy;
    const rangoFin = modelo.fecha_fin < horizonte ? modelo.fecha_fin : horizonte;

    if (rangoInicio > rangoFin) continue;

    const duracion = modelo.duracion_turno ?? 20;
    const turnosAInsertar: {
      medico_id: string;
      modelo_id: string;
      fecha: string;
      hora_inicio: string;
      hora_fin: string;
      estado: string;
      monto: number | null;
    }[] = [];

    // Iterar cada dia del rango
    let cursor = rangoInicio;
    while (cursor <= rangoFin) {
      const d = new Date(cursor + "T00:00:00");
      const dbDay = jsDayToDbDay(d.getDay());

      for (const franja of modeloFranjas) {
        if (franja.dia_semana !== dbDay) continue;

        const slots = generarSlotsParaFranja(
          cursor,
          franja.hora_inicio,
          franja.hora_fin,
          duracion
        );

        for (const slot of slots) {
          turnosAInsertar.push({
            medico_id: modelo.medico_id,
            modelo_id: modelo.id,
            fecha: cursor,
            hora_inicio: slot.hora_inicio,
            hora_fin: slot.hora_fin,
            estado: "disponible",
            monto: modelo.precio ?? null,
          });
        }
      }

      cursor = addDays(cursor, 1);
    }

    if (turnosAInsertar.length === 0) continue;

    // Insert vía helper compartido (src/lib/agenda/insertar-slots.ts): dedup
    // contra slots ACTIVOS + insert con degradación 23505. Sin upsert/onConflict
    // (incompatible con el índice parcial 20260713 — ver comentario del helper).
    // Bonus: los slots cuya única fila es terminal (cancelado/ausente/completado)
    // se REGENERAN si siguen dentro del horizonte del modelo — backstop del
    // horario perdido al cancelar.
    const { insertados, errorLectura } = await insertarSlotsSinDuplicar(
      supabase,
      modelo.medico_id,
      turnosAInsertar,
      (msg, detalle) => logError("[CRON/SLOTS]", msg, { modeloId: modelo.id, ...detalle })
    );
    if (errorLectura) {
      // Fail-safe del helper: no insertó a ciegas.
      logError("[CRON/SLOTS]", "Error leyendo slots existentes — se saltea el modelo", {
        modeloId: modelo.id,
        error: errorLectura,
      });
      continue;
    }

    resumen.push({
      medico_id: modelo.medico_id,
      modelo_id: modelo.id,
      slots: insertados,
    });
    totalInsertados += insertados;
  }

  logInfo("[CRON/SLOTS]", "Ejecución completada", {
    fecha: hoy,
    slotsGenerados: totalInsertados,
    modelosProcesados: resumen.length,
  });

  return NextResponse.json({
    ok: true,
    fecha: hoy,
    horizonte,
    modelos_procesados: resumen.length,
    slots_generados: totalInsertados,
    detalle: resumen,
  });
}

export const GET = withCron("generar-slots", handler);
