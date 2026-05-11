import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackEvent } from "@/lib/funnel";

const EVENTOS_PERMITIDOS_CLIENTE = [
  "mp_oauth_view_tab",
  "mp_oauth_start_click",
] as const;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: true });
    }

    const body = await req.json();
    const { evento, metadata } = body;

    if (!EVENTOS_PERMITIDOS_CLIENTE.includes(evento)) {
      return NextResponse.json({ ok: true });
    }

    const admin = createAdminClient();
    const { data: medico } = await admin
      .from("medicos")
      .select("id")
      .eq("user_id", user.id)
      .single();

    await trackEvent({
      evento,
      medicoId: medico?.id ?? null,
      metadata: metadata ?? {},
    });
  } catch {
    // Never break the client
  }

  return NextResponse.json({ ok: true });
}
