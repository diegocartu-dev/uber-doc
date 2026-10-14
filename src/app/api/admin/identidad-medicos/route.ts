import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerDecisionDidit } from "@/lib/didit/client";
import { asegurarIdentidadMedico, identidadDeDecision } from "@/lib/medicos/identidad-didit";

// Completa `medicos_identidad` de los profesionales que YA verificaron su
// identidad (13/10/2026), leyendo la decisión que Didit tiene guardada. Corre en
// producción porque la clave de Didit no sale de ahí. GET solo mira, POST
// escribe. Responde solo conteos, nunca datos. Protegida con CRON_SECRET; no la
// llama ningún cron.

export const maxDuration = 300;
const DE_A = 5;
const PRESUPUESTO_MS = 240_000;

function autorizado(req: NextRequest): boolean {
  return !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

async function correr(aplicar: boolean) {
  const admin = createAdminClient();
  const { data: medicos, error } = await admin
    .from("medicos")
    .select("id, didit_session_id")
    .eq("identidad_validada", true)
    .not("didit_session_id", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const conteo: Record<string, number> = {};
  const sumar = (k: string) => (conteo[k] = (conteo[k] ?? 0) + 1);
  const uno = async (m: { id: string; didit_session_id: string | null }) => {
    if (aplicar) {
      const r = await asegurarIdentidadMedico(admin, m.id);
      sumar(r.ok ? `ok (${r.origen})` : `sin guardar: ${r.motivo.split(":")[0]}`);
    } else {
      try {
        const id = identidadDeDecision(await obtenerDecisionDidit(m.didit_session_id as string));
        sumar(`${id.fecha_nacimiento ? "con" : "sin"} fecha · ${id.sexo ? "con" : "sin"} sexo`);
      } catch {
        sumar("didit falló");
      }
    }
  };
  // De a 5 y con presupuesto de tiempo: si no alcanza, responde cuántos quedan
  // y se vuelve a llamar (el POST saltea a quien ya quedó guardado).
  const lista = medicos ?? [];
  const inicio = Date.now();
  let i = 0;
  while (i < lista.length && Date.now() - inicio < PRESUPUESTO_MS) {
    await Promise.all(lista.slice(i, i + DE_A).map(uno));
    i += DE_A;
  }
  return NextResponse.json({ aplicado: aplicar, verificados: lista.length, procesados: Math.min(i, lista.length), pendientes: Math.max(0, lista.length - i), conteo });
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return correr(false);
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return correr(true);
}
