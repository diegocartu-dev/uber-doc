import { NextRequest, NextResponse } from "next/server";
import { enviarPush } from "@/lib/push";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { userId, title, body, url, tag } = await req.json();
  if (!userId || !title || !body) {
    return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
  }

  const sent = await enviarPush(userId, { title, body, url, tag });
  return NextResponse.json({ ok: true, sent });
}
