import { NextRequest, NextResponse } from "next/server";
import { withCron } from "@/lib/cron-guard";
import { esInstitucional } from "@/lib/instancia";
import { revisarCaidas } from "@/lib/consultas/caidas";

/**
 * El revisor de caídas (Diego, 06/10/2026): etiqueta cada consulta inmediata y cada turno pago que
 * se cerró sin atenderse y suena SOLO si falló un proceso. Regla en
 * `@/lib/consultas/diagnostico`. Cada 5 minutos.
 *
 * `?prueba=<id>` revisa esa sola consulta (incluso de una cuenta de prueba) y
 * manda el mail marcado [PRUEBA]: es lo que permite comprobar que la alarma suena.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(req: NextRequest) {
  // La instancia institucional no cobra por Mercado Pago ni tiene esta escalera.
  if (esInstitucional()) return NextResponse.json({ ok: true, mensaje: "modo institucional: no aplica" });
  const prueba = req.nextUrl.searchParams.get("prueba");
  const valida = prueba && /^[0-9a-f-]{36}$/i.test(prueba) ? prueba : undefined;
  const resultado = await revisarCaidas({ prueba: valida });
  return NextResponse.json({ ok: true, ...resultado });
}

export const GET = withCron("revisar-caidas", handler);
