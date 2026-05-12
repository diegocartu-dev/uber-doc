import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackEvent } from "@/lib/funnel";

const EVENTOS_PERMITIDOS_CLIENTE = [
  "mp_oauth_view_tab",
  "mp_oauth_start_click",
  "session_expired_detected",
  "session_expired_background",
] as const;

const EVENTOS_SIN_AUTH = [
  "session_expired_detected",
  "session_expired_background",
] as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { evento, metadata } = body;

    if (!EVENTOS_PERMITIDOS_CLIENTE.includes(evento)) {
      return NextResponse.json({ ok: true });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && !(EVENTOS_SIN_AUTH as readonly string[]).includes(evento)) {
      return NextResponse.json({ ok: true });
    }

    let medicoId: string | null = null;
    if (user) {
      const admin = createAdminClient();
      const { data: medico } = await admin
        .from("medicos")
        .select("id")
        .eq("user_id", user.id)
        .single();
      medicoId = medico?.id ?? null;
    }

    await trackEvent({
      evento,
      medicoId,
      metadata: metadata ?? {},
    });
  } catch {
    // Never break the client
  }

  return NextResponse.json({ ok: true });
}
