import { NextResponse } from "next/server";

// `sha`: qué commit está sirviendo este deploy. Lo usa el gate de Playwright
// lanzado a mano contra una vista previa, para no aprobar un PR probando otro
// código (12/10/2026). El repo es público: el SHA no es un secreto.
export async function GET() {
  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}
