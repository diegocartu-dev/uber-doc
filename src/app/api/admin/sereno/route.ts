import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/admin-auth";

export async function GET() {
  const user = await verificarAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sereno_runs")
    .select("*")
    .order("fecha", { ascending: false })
    .limit(7);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ runs: data ?? [] });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const expectedToken = process.env.SERENO_API_TOKEN;

  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json();
  const { passed, failed, total, duration_ms, status, details } = body;

  if (typeof passed !== "number" || typeof failed !== "number" || typeof total !== "number") {
    return NextResponse.json({ error: "Campos requeridos: passed, failed, total" }, { status: 400 });
  }

  const admin = createAdminClient();
  const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

  const { data, error } = await admin
    .from("sereno_runs")
    .insert({
      fecha,
      passed,
      failed,
      total,
      duration_ms: duration_ms ?? 0,
      status: status ?? (failed > 0 ? "fail" : "ok"),
      details: details ?? [],
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: data.id });
}
