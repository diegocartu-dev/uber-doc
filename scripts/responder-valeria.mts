// Respuesta única a Valeria Coiro (26/09/2026). Se responde al hilo MÁS RECIENTE
// de los dos que abrió, porque ese trae el reclamo completo.
//
// Decisión de Diego: se le devuelven las DOS consultas; la profesional no pierde
// nada (Docto absorbe). No se dispara refund de Mercado Pago — sacaría la plata
// de la cuenta de ella, que es justo lo que se evita.
import fs from "node:fs";
import path from "node:path";
for (const archivo of [".env.production.check", ".env.local"]) {
  const ruta = path.resolve(process.cwd(), archivo);
  if (!fs.existsSync(ruta)) continue;
  for (const linea of fs.readFileSync(ruta, "utf8").split("\n")) {
    const i = linea.indexOf("=");
    if (i < 1 || linea.trim().startsWith("#")) continue;
    const k = linea.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = linea.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
  }
}
const { enviarDesdeBandeja } = await import("../src/lib/correo");

const CUERPO = `Hola Valeria, ¿cómo estás?

Antes que nada, perdón. Tuviste dos consultas y te fuiste de las dos sin la receta que necesitabas. Eso no tendría que haber pasado.

Te lo cuento con claridad para que no pierdas más tiempo: hoy Docto no puede emitir recetas para ese tipo de medicación. No fue una decisión de la profesional ni algo que hayas hecho mal vos, es un límite de la plataforma. Y es importante que lo sepas antes de intentar de nuevo: tampoco lo resolvería un psiquiatra dentro de Docto, porque la restricción es igual para todas las especialidades. Esa receta sí la vas a poder obtener en una consulta presencial.

Sobre la plata: te devolvemos las dos consultas, $30.000 en total. No una sola. Pagaste dos veces por algo que no te pudimos dar.

Para transferirte, ¿me pasás tu alias o CVU? Con eso lo mandamos enseguida.

Y quedate tranquila respecto de la Dra.: hizo bien su trabajo, el bloqueo no dependía de ella.

Cualquier cosa, respondeme por acá.

Un saludo,
Valentina — Docto`;

const r = await enviarDesdeBandeja({
  para: "valeriacoiro@gmail.com",
  asunto: "Re: [Ayuda] Problemas",
  cuerpo: CUERPO,
  desde: "soporte",
  enRespuestaA: "0e24efd7-ba1b-41cd-aa7a-d10682c61122",
  enviadoPor: null,
});
console.log(r.ok ? "ENVIADO" : "FALLÓ: " + r.error);
process.exit(r.ok ? 0 : 1);
