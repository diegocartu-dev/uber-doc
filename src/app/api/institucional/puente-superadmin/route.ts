// POST /api/institucional/puente-superadmin — SOLO instancia institucional.
//
// El extremo que atiende el puente descrito en `lib/institucional/puente-superadmin.ts`.
// Lo llama el BACKEND del `/admin` de Docto, nunca un navegador: por eso el
// secreto va en un header y la respuesta es JSON con una URL de un solo uso.
//
// Todo lo que no sea exactamente la llamada esperada devuelve 404 y no 401 ni
// 403: desde afuera, esta ruta no existe. Un 401 confirmaría que acá hay una
// puerta y sobre qué proyecto probar el secreto.

import { NextResponse, type NextRequest } from "next/server";
import {
  HEADER_PUENTE,
  emitirPasajeSuperadmin,
  secretoValido,
} from "@/lib/institucional/puente-superadmin";
import { esInstitucional } from "@/lib/instancia";

export const dynamic = "force-dynamic";

const NO_EXISTE = NextResponse.json({ error: "No encontrado" }, { status: 404 });

export async function POST(request: NextRequest) {
  if (!esInstitucional()) return NO_EXISTE;
  if (!secretoValido(request.headers.get(HEADER_PUENTE))) {
    // Se registra el intento sin el secreto recibido (sería escribir en los logs
    // el material del ataque) y sin IP: alcanza con saber que alguien probó.
    console.warn("[puente] intento de acuñar sesión con secreto inválido");
    return NO_EXISTE;
  }

  // La base de la URL sale del propio pedido, no de una env var: la instancia
  // puede vivir en su dominio de Vercel o en el de la provincia, y el pasaje
  // tiene que aterrizar en el mismo host desde el que se está sirviendo.
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return NO_EXISTE;

  const resultado = await emitirPasajeSuperadmin(`${proto}://${host}`);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.estado });
  }
  return NextResponse.json({ url: resultado.url });
}
