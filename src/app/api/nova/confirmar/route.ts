import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function generarSlots(
  horaInicio: string,
  horaFin: string,
  duracion: number
): { hora_inicio: string; hora_fin: string }[] {
  const slots: { hora_inicio: string; hora_fin: string }[] = [];
  const [hI, mI] = horaInicio.split(":").map(Number);
  const [hF, mF] = horaFin.split(":").map(Number);
  let minActual = hI * 60 + mI;
  const minFin = hF * 60 + mF;

  while (minActual + duracion <= minFin) {
    const inicio = `${Math.floor(minActual / 60).toString().padStart(2, "0")}:${(minActual % 60).toString().padStart(2, "0")}`;
    const finSlot = minActual + duracion;
    const fin = `${Math.floor(finSlot / 60).toString().padStart(2, "0")}:${(finSlot % 60).toString().padStart(2, "0")}`;
    slots.push({ hora_inicio: inicio, hora_fin: fin });
    minActual = finSlot;
  }

  return slots;
}

export async function POST(req: NextRequest) {
  try {
    const { accion, datos, medico_id } = await req.json();

    if (!accion || !datos || !medico_id) {
      return NextResponse.json(
        { exito: false, mensaje: "Faltan campos requeridos" },
        { status: 400 }
      );
    }

    // Verificar autenticación con el client normal (respeta RLS)
    const supabaseAuth = await createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user || user.id !== medico_id) {
      return NextResponse.json(
        { exito: false, mensaje: "No autenticado" },
        { status: 401 }
      );
    }

    // Usar admin client para bypass RLS en mutaciones
    const supabase = createAdminClient();

    // Lookup medicos.id desde auth user_id (turnos FK apunta a medicos.id, no a auth.users.id)
    const { data: medico, error: medicoErr } = await supabase
      .from("medicos")
      .select("id")
      .eq("user_id", medico_id)
      .single();

    if (medicoErr || !medico) {
      return NextResponse.json(
        { exito: false, mensaje: "Perfil de médico no encontrado" },
        { status: 404 }
      );
    }

    const medicoDbId = medico.id;

    if (accion === "crear_slots") {
      const { fecha, hora_inicio, hora_fin, duracion } = datos as {
        fecha: string;
        hora_inicio: string;
        hora_fin: string;
        duracion: number;
      };

      const slots = generarSlots(hora_inicio, hora_fin, duracion);
      if (slots.length === 0) {
        return NextResponse.json({
          exito: false,
          mensaje: "El rango horario no permite crear slots con esa duración",
        });
      }

      const rows = slots.map((s) => ({
        medico_id: medicoDbId,
        fecha,
        hora_inicio: s.hora_inicio,
        hora_fin: s.hora_fin,
        estado: "disponible",
      }));

      // upsert con ignoreDuplicates = ON CONFLICT (medico_id, fecha, hora_inicio) DO NOTHING
      const { data: insertados, error } = await supabase
        .from("turnos")
        .upsert(rows, {
          onConflict: "medico_id,fecha,hora_inicio",
          ignoreDuplicates: true,
        })
        .select("id");

      if (error) {
        return NextResponse.json({
          exito: false,
          mensaje: `Error al crear slots: ${error.message}`,
        });
      }

      const creados = insertados?.length ?? 0;
      if (creados === 0) {
        return NextResponse.json({
          exito: true,
          mensaje: `Esos horarios ya estaban disponibles para ${fecha}`,
        });
      }

      const omitidos = slots.length - creados;
      const msgOmitidos = omitidos > 0 ? ` (${omitidos} ya existían)` : "";

      return NextResponse.json({
        exito: true,
        mensaje: `Se crearon ${creados} slots para ${fecha}${msgOmitidos}`,
      });
    }

    if (accion === "bloquear_agenda") {
      const { fecha, hora_inicio, hora_fin } = datos as {
        fecha: string;
        hora_inicio: string;
        hora_fin: string;
      };

      // Bloquear slots existentes disponibles en ese rango
      const { data: slotsExistentes } = await supabase
        .from("turnos")
        .select("id")
        .eq("medico_id", medicoDbId)
        .eq("fecha", fecha)
        .eq("estado", "disponible")
        .gte("hora_inicio", hora_inicio)
        .lte("hora_fin", hora_fin);

      if (slotsExistentes && slotsExistentes.length > 0) {
        const ids = slotsExistentes.map((s) => s.id);
        const { error } = await supabase
          .from("turnos")
          .update({ estado: "bloqueado" })
          .in("id", ids)
          .eq("medico_id", medicoDbId);

        if (error) {
          return NextResponse.json({
            exito: false,
            mensaje: `Error al bloquear: ${error.message}`,
          });
        }

        return NextResponse.json({
          exito: true,
          mensaje: `Se bloquearon ${ids.length} slots el ${fecha} de ${hora_inicio} a ${hora_fin}`,
        });
      }

      // Si no hay slots existentes, crear uno bloqueado
      const { error } = await supabase.from("turnos").insert({
        medico_id: medicoDbId,
        fecha,
        hora_inicio,
        hora_fin,
        estado: "bloqueado",
      });

      if (error) {
        return NextResponse.json({
          exito: false,
          mensaje: `Error al bloquear: ${error.message}`,
        });
      }

      return NextResponse.json({
        exito: true,
        mensaje: `Agenda bloqueada el ${fecha} de ${hora_inicio} a ${hora_fin}`,
      });
    }

    if (accion === "cancelar_turno") {
      const { turno_id } = datos as { turno_id: string };

      const { data: turno, error: fetchErr } = await supabase
        .from("turnos")
        .select("id, estado")
        .eq("id", turno_id)
        .eq("medico_id", medicoDbId)
        .single();

      if (fetchErr || !turno) {
        return NextResponse.json({
          exito: false,
          mensaje: "Turno no encontrado o no pertenece a este médico",
        });
      }

      const { error } = await supabase
        .from("turnos")
        .update({ estado: "cancelado_medico" })
        .eq("id", turno_id)
        .eq("medico_id", medicoDbId);

      if (error) {
        return NextResponse.json({
          exito: false,
          mensaje: `Error al cancelar: ${error.message}`,
        });
      }

      return NextResponse.json({
        exito: true,
        mensaje: `Turno cancelado correctamente`,
      });
    }

    return NextResponse.json(
      { exito: false, mensaje: "Acción no reconocida" },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { exito: false, mensaje: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
