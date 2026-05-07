import { NextResponse } from "next/server";

const BETA_COOKIE = "docto_beta_access";

export async function POST(request: Request) {
  const correct = process.env.BETA_PASSWORD;
  if (!correct) {
    // Guard desactivado — permitir entrar y setear cookie noop por consistencia.
    return NextResponse.json({ ok: true });
  }

  let password: string | undefined;
  try {
    const body = await request.json();
    password = body?.password;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!password || password !== correct) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(BETA_COOKIE, correct, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 días
    path: "/",
  });
  return response;
}
