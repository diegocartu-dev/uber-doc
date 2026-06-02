import { NextRequest, NextResponse } from "next/server";
import { crearSesionDidit, obtenerDecisionDidit } from "@/lib/didit/client";

// ⚠️ TEMPORAL — endpoint de smoke-test de la integración Didit.
// SACAR antes del merge a main. Solo corre en preview con un token random.
// Sirve para validar empíricamente que el API de Didit responde con la API key
// real (que es sensible y no se puede pullear localmente).

const SMOKE_TOKEN = "4a2815b3db47111f55c9057c847edbb1327b9157c05db467";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== SMOKE_TOKEN) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const envCheck = {
    DIDIT_API_KEY_len: (process.env.DIDIT_API_KEY ?? "").trim().length,
    DIDIT_WORKFLOW_ID_len: (process.env.DIDIT_WORKFLOW_ID ?? "").trim().length,
  };

  try {
    const sesion = await crearSesionDidit({
      vendorData: "smoke-test",
      callbackUrl: "https://docto.com.ar/dashboard?identidad=verificada",
      language: "es",
    });

    let decisionStatus: string | null = null;
    let idVerifsPresent = false;
    try {
      const decision = await obtenerDecisionDidit(sesion.session_id);
      decisionStatus = decision.status;
      idVerifsPresent = (decision.id_verifications?.length ?? 0) > 0;
    } catch {
      /* la decisión puede no estar lista todavía */
    }

    return NextResponse.json({
      ok: true,
      envCheck,
      session: {
        session_id: sesion.session_id,
        status: sesion.status,
        workflow_id: sesion.workflow_id,
        url: sesion.url,
      },
      decisionStatus,
      idVerifsPresent,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        envCheck,
        error: e instanceof Error ? e.message : "error",
      },
      { status: 500 }
    );
  }
}
