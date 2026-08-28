import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefonoAR } from "@/lib/whatsapp";
import { cambiaMatricula } from "@/lib/medicos/matricula";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const admin = createAdminClient();
    const body = await req.json();
    const { telefono, domicilio_consultorio, tipo_matricula, numero_matricula, provincia, celular_personal, email_personal } = body;

    // Only allow updating specific fields
    const updates: Record<string, string | null> = {};
    if (telefono !== undefined) updates.telefono = telefono?.trim() || null;
    if (domicilio_consultorio !== undefined) updates.domicilio_consultorio = domicilio_consultorio?.trim() || null;
    if (tipo_matricula !== undefined) updates.tipo_matricula = tipo_matricula?.trim() || null;
    if (numero_matricula !== undefined) updates.numero_matricula = numero_matricula?.trim() || null;
    if (provincia !== undefined) updates.provincia = provincia?.trim() || null;
    if (celular_personal !== undefined) {
      const celularRaw = celular_personal?.trim() || null;
      if (celularRaw === null) {
        updates.celular_personal = null;
      } else {
        // El celular es el destino de los avisos WhatsApp. Un número que la
        // normalización no resuelve se guardaba igual y el aviso moría en
        // silencio al enviar — se valida acá, donde el médico puede corregirlo.
        const celularNormalizado = normalizarTelefonoAR(celularRaw);
        if (!celularNormalizado) {
          return NextResponse.json(
            {
              error:
                "Revisá el celular: tiene que ser un móvil argentino de 10 dígitos (código de área + número, ej: 11 4028 9141).",
            },
            { status: 400 }
          );
        }
        updates.celular_personal = celularNormalizado;
      }
    }
    if (email_personal !== undefined) updates.email_personal = email_personal?.trim() || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
    }

    // A1 (Roberto): la matrícula NO se puede cambiar una vez validada la
    // identidad. Si no, se rompe el cruce DNI↔matrícula (TOCTOU): el médico
    // podría validar con su matrícula real y luego cambiarla por la de otro.
    // El DNI no es editable acá, así que el titular verificado se mantiene.
    // El guard preguntaba si el campo VENÍA, no si CAMBIABA. Y el formulario
    // manda SIEMPRE el perfil entero, así que a todo profesional con identidad
    // validada le rebotaba con 403 cualquier guardado —incluso corregir solo el
    // celular— con un mensaje que le hablaba de su matrícula, que no había
    // tocado. Caso real (26/08): un profesional no podía arreglar su celular, y
    // ese celular es el destino de los avisos por WhatsApp: sin él no se entera
    // de que un paciente lo está esperando.
    //
    // Se comparan los valores contra los guardados: solo bloquea un cambio real.
    const { data: actual } = await admin
      .from("medicos")
      .select("identidad_validada, tipo_matricula, numero_matricula")
      .eq("user_id", user.id)
      .maybeSingle();

    if (cambiaMatricula(updates, actual) && actual?.identidad_validada) {
      return NextResponse.json(
        {
          error:
            "Tu matrícula está verificada y no se puede modificar. Escribinos a soporte@docto.com.ar para cambiarla.",
        },
        { status: 403 }
      );
    }

    // Service role para escribir la FILA PROPIA: `celular_personal` y
    // `email_personal` son PII con grants de columna y el cliente RLS no las
    // puede tocar (misma regla que ya obliga a leerlas así — ver CLAUDE.md).
    // El filtro por `user_id` sale de la sesión y la lista de campos es fija:
    // nadie puede escribir la fila de otro ni una columna fuera del whitelist.
    const { error } = await admin
      .from("medicos")
      .update(updates)
      .eq("user_id", user.id);

    if (error) {
      // El mensaje crudo de Postgres no le dice nada a un médico.
      console.error("[medico/perfil] update falló:", error.message, { userId: user.id });
      return NextResponse.json(
        { error: "No pudimos guardar tus datos. Probá de nuevo; si vuelve a fallar, escribinos a soporte@docto.com.ar." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
