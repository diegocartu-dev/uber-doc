// POST /acceso/reenviar/enviar — recibe el form del reenvío self-service.
//
// Es una ruta pública que dispara un envío: lo único que hace acá es frenar el
// abuso por IP y delegar. La decisión de si corresponde mandar algo, a quién y
// por dónde vive en src/lib/institucional/reenvio.ts.
//
// SIEMPRE termina en la misma pantalla, pase lo que pase adentro. El resultado
// no puede depender de si el DNI existe: esta ruta es anónima y sin esa
// disciplina se convierte en un oráculo del padrón provincial.
//
// SOLO instancia institucional: en B2C es 404.

import { NextResponse, type NextRequest } from "next/server";
import { esInstitucional } from "@/lib/instancia";
import { esPostDelMismoSitio } from "@/lib/institucional/origen";
import { permitirIntentoAcceso } from "@/lib/institucional/accesos";
import { reenviarAccesoSelfService } from "@/lib/institucional/reenvio";

export async function POST(request: NextRequest) {
  if (!esInstitucional()) {
    return new NextResponse(null, { status: 404 });
  }

  // Igual que el minteo: es un POST público que dispara trabajo (y un mensaje
  // al celular de una persona). Una página ajena no lo va a usar de disparador.
  if (!esPostDelMismoSitio(request)) {
    console.warn("[reenvio] POST rechazado: no salió de nuestra pantalla");
    return new NextResponse(null, { status: 403 });
  }

  const { origin } = new URL(request.url);
  // 303: el navegador sigue con GET y no repite el POST si el paciente recarga.
  const listo = NextResponse.redirect(`${origin}/acceso/reenviar?enviado=1`, 303);

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "sin-ip";
  // Freno por IP (el mismo bucket que la landing, con su propia clave): sin
  // esto, un script podría barrer DNIs a mano alzada. El paciente igual ve la
  // pantalla de siempre — ni se entera del freno.
  if (!(await permitirIntentoAcceso(ip, "reenvio-self-service"))) {
    console.warn("[reenvio] Freno por IP en el reenvío self-service");
    return listo;
  }

  try {
    const form = await request.formData();
    await reenviarAccesoSelfService({
      dni: String(form.get("dni") ?? ""),
      celular: String(form.get("celular") ?? ""),
    });
  } catch (err) {
    console.error("[reenvio] Form ilegible:", err);
  }

  return listo;
}
