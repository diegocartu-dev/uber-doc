import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushAlMedico } from "@/lib/push";
import { withCron } from "@/lib/cron-guard";

// ─── Recordatorio al MÉDICO, 15 min antes del turno (pedido Diego, 20/09/2026) ─
//
// POR QUÉ EXISTE: hoy el médico solo se entera cuando el paciente ya entró a la
// sala, a la hora del turno (WhatsApp). Una profesional que estaba con un
// paciente presencial se lo perdió porque el aviso llegó justo a la hora. Este
// cron le manda un push 15 minutos antes para que llegue con tiempo. El push es
// gratis (a diferencia del WhatsApp de Twilio); solo llega si el médico tiene
// Docto agregado a la pantalla de inicio y las notificaciones activadas — por
// eso Nova y el mail de soporte recomiendan hacerlo.
//
// ZONA HORARIA — la trampa que tiene el cron de 10 min del paciente y que acá NO
// se repite: `turnos.fecha` y `hora_inicio` están en hora ARGENTINA, y el runtime
// de Vercel es UTC. Comparar `new Date().getHours()` (UTC) contra horas AR da 3
// horas de diferencia. Truco correcto (el mismo de lib/insights/fechas.ts y
// disponibilidad.ts): `new Date(x.toLocaleString("en-US",{timeZone: AR}))` da un
// Date cuyos campos LOCALES son la hora de pared argentina. Como el inicio del
// turno se arma igual (fecha+hora parseadas como locales), la RESTA entre los dos
// da los minutos reales que faltan, sin importar la zona del runtime.
//
// UNA SOLA ALERTA: la ventana es de un minuto ([15,16) min antes), así que con el
// cron corriendo cada minuto cada turno matchea en UNA corrida y suena UNA vez.
// Una ventana más ancha aguantaría mejor una corrida salteada, pero hacía que el
// teléfono volviera a sonar 2-3 veces (el `tag` colapsa lo que se VE, no el
// sonido, porque el service worker usa renotify). Para un médico de 70 años una
// sola alerta es mejor, y el respaldo real de "no perderse al paciente" es el
// WhatsApp del momento, que sigue disparando aunque este aviso previo se saltee.

const AR = "America/Argentina/Buenos_Aires";
const VENTANA_MIN_DESDE = 15;
const VENTANA_MIN_HASTA = 16;

async function handler(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // "Ahora" con los campos locales = hora de pared argentina.
  const arNow = new Date(new Date().toLocaleString("en-US", { timeZone: AR }));
  const fechaHoy = arNow.toLocaleDateString("sv-SE"); // YYYY-MM-DD (AR)
  // También mañana: un turno 00:10 con aviso 15 min antes cae el día anterior.
  const arManana = new Date(arNow.getTime() + 24 * 60 * 60 * 1000);
  const fechaManana = arManana.toLocaleDateString("sv-SE");

  // Ventana de 2 días y solo confirmados sin sala: el conjunto es chico. Si algún
  // día hubiera más de ~1000 confirmados en 48 h, PostgREST corta y algunos
  // quedarían sin aviso en silencio — hoy estamos lejísimos de eso.
  const { data: turnos, error } = await supabase
    .from("turnos")
    .select("id, fecha, hora_inicio, medico_id")
    .in("fecha", [fechaHoy, fechaManana])
    .eq("estado", "confirmado")
    .is("sala_video_url", null); // el médico todavía no entró

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!turnos || turnos.length === 0) return NextResponse.json({ ok: true, enviados: 0 });

  // Los que empiezan dentro de la ventana [14, 16] minutos.
  const porAvisar = turnos.filter((t) => {
    if (!t.medico_id || !t.hora_inicio) return false;
    // start armado con los mismos campos AR-de-pared que arNow: la resta da los
    // minutos reales que faltan.
    const start = new Date(`${t.fecha}T${t.hora_inicio}`);
    const min = (start.getTime() - arNow.getTime()) / 60000;
    // [15,16): media abierta arriba para que un turno caiga en una sola corrida.
    return min >= VENTANA_MIN_DESDE && min < VENTANA_MIN_HASTA;
  });

  if (porAvisar.length === 0) return NextResponse.json({ ok: true, enviados: 0 });

  // El aviso es para el propio médico, así que no lleva su nombre.
  let enviados = 0;
  for (const t of porAvisar) {
    const hora = String(t.hora_inicio).slice(0, 5);
    // verificarEnCurso: si ya está atendiendo a otro, no lo interrumpimos.
    const sent = await pushAlMedico(
      t.medico_id,
      {
        title: "🟡 Docto",
        body: `Tenés un turno a las ${hora}. En 15 minutos te va a estar esperando un paciente.`,
        url: "/dashboard",
        tag: `turno-15min-${t.id}`, // por si dos corridas caen en el borde: una sola visible
      },
      true,
    );
    if (sent) enviados++;
  }

  return NextResponse.json({ ok: true, revisados: turnos.length, enviados });
}

export const GET = withCron("recordatorio-medico-15min", handler);
