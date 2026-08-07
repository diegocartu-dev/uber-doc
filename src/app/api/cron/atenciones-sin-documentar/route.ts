import { NextResponse } from "next/server";
import { withCron } from "@/lib/cron-guard";
import { revisarAtencionesSinDocumentar } from "@/lib/atenciones-sin-documentar";

/**
 * Vigía de atenciones cobradas que se cerraron sin documentación (caso Hugo,
 * consulta d9293d23 del 01/08: pagó $50.000, la médica nunca tocó "Finalizar",
 * cero documentos, cero evolución — y nos enteramos CINCO DÍAS después porque
 * el paciente escribió enojado).
 *
 * Corre cada 30 min y mira los últimos 30 días. Eso hace dos cosas de una:
 *  - la PRIMERA corrida es el barrido inicial (junta todo lo ya cerrado sin
 *    documentar y lo manda en UNA sola alerta, no una por atención);
 *  - de ahí en más, levanta cualquier cierre nuevo — el manual del médico
 *    incluido — sin tocar el camino del médico ni el del paciente.
 *
 * La lógica vive en lib/atenciones-sin-documentar (la comparte con el cron
 * cerrar-huerfanas, que la invoca apenas cierra lo que quedó abierto). SOLO
 * OBSERVA: no cambia estados ni bloquea ningún cierre.
 */

export const maxDuration = 60;

export const GET = withCron("atenciones-sin-documentar", async () => {
  const resultado = await revisarAtencionesSinDocumentar();

  if (resultado.alertadas.length > 0) {
    console.log("[cron/sin-documentar]", JSON.stringify(resultado));
  }

  // `revisarAtencionesSinDocumentar` nunca lanza; si algo falló lo devuelve en
  // `error`. Se responde 500 para que la corrida figure FALLIDA en Vercel y
  // cron-guard mande el mail rojo — un vigía roto en silencio es peor que nada.
  if (!resultado.ok) {
    console.error("[cron/sin-documentar] falló:", resultado.error);
    return NextResponse.json(resultado, { status: 500 });
  }

  return NextResponse.json(resultado);
});
