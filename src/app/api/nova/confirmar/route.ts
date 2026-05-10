import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/feature-flags";


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
    if (!(await getFlag("nova_ai"))) {
      return NextResponse.json({ exito: false, mensaje: "En este momento estoy en pausa actualizando mis habilidades. Volve en un rato." }, { status: 503 });
    }
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
      .select("id, duracion_consulta, precio_consulta")
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
      // 1. Extraer del payload
      const { fecha, hora_inicio, hora_fin, canal_origen } = datos as {
        fecha: string;
        hora_inicio: string;
        hora_fin: string;
        canal_origen: string;
      };

      // 2. Validaciones server-side
      const CANALES_VALIDOS = ["clinica_virtual", "consultorio_privado"] as const;
      if (!CANALES_VALIDOS.includes(canal_origen as typeof CANALES_VALIDOS[number])) {
        return NextResponse.json({ exito: false, mensaje: "Canal inválido" }, { status: 400 });
      }
      const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
      const horaRegex = /^\d{2}:\d{2}$/;
      if (!fechaRegex.test(fecha) || !horaRegex.test(hora_inicio) || !horaRegex.test(hora_fin)) {
        return NextResponse.json({ exito: false, mensaje: "Formato de fecha u hora inválido" }, { status: 400 });
      }
      if (hora_inicio >= hora_fin) {
        return NextResponse.json({ exito: false, mensaje: "hora_inicio debe ser anterior a hora_fin" }, { status: 400 });
      }

      // 3. Usar duracion_consulta del perfil del médico (no del payload)
      const duracionMinutos = medico.duracion_consulta;

      // 4. Idempotencia: verificar si ya existe modelo Nova para este médico/fecha
      const { data: modeloExistente } = await supabase
        .from("agenda_modelos")
        .select("id")
        .eq("medico_id", medicoDbId)
        .eq("fecha_inicio", fecha)
        .eq("creado_por_nova", true)
        .maybeSingle();

      if (modeloExistente) {
        return NextResponse.json({ exito: true, mensaje: "Turnos ya creados anteriormente" });
      }

      // 5. Generar nombre del modelo
      const [anio, mes, dia] = fecha.split("-");
      const canalLabel = canal_origen === "clinica_virtual" ? "Clínica Virtual" : "Consultorio";
      const nombreModelo = `Nova - ${canalLabel} ${dia}/${mes}`;

      // 6. INSERT en agenda_modelos
      const { data: nuevoModelo, error: errorModelo } = await supabase
        .from("agenda_modelos")
        .insert({
          medico_id: medicoDbId,
          nombre: nombreModelo,
          fecha_inicio: fecha,
          fecha_fin: fecha,
          duracion_turno: duracionMinutos,
          precio: medico.precio_consulta,
          canal_origen: canal_origen,
          activo: true,
          creado_por_nova: true,
        })
        .select("id")
        .single();

      if (errorModelo || !nuevoModelo) {
        return NextResponse.json({ exito: false, mensaje: "Error al crear el modelo de agenda" }, { status: 500 });
      }

      // 7. INSERT en agenda_franjas
      const diasSemana: Record<number, number> = { 0: 7, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
      const diaSemana = diasSemana[new Date(fecha + "T12:00:00").getDay()];

      // INSERT en agenda_franjas — no es bloqueante si falla; el modelo ya existe y los turnos se crean igual
      await supabase
        .from("agenda_franjas")
        .insert({
          modelo_id: nuevoModelo.id,
          dia_semana: diaSemana,
          hora_inicio: hora_inicio,
          hora_fin: hora_fin,
        });

      // 8. Generar y upsert turnos con modelo_id y canal_origen
      const slots = generarSlots(hora_inicio, hora_fin, duracionMinutos);
      if (slots.length === 0) {
        return NextResponse.json({
          exito: false,
          mensaje: "El rango horario no permite crear turnos con esa duración",
        });
      }

      const turnosParaInsertar = slots.map((slot) => ({
        medico_id: medicoDbId,
        fecha,
        hora_inicio: slot.hora_inicio,
        hora_fin: slot.hora_fin,
        estado: "disponible",
        monto: medico.precio_consulta,
        modelo_id: nuevoModelo.id,
        canal_origen: canal_origen,
      }));

      const { error: errorTurnos } = await supabase
        .from("turnos")
        .upsert(turnosParaInsertar, { onConflict: "medico_id,fecha,hora_inicio", ignoreDuplicates: true });

      if (errorTurnos) {
        return NextResponse.json({ exito: false, mensaje: "Error al crear los turnos" }, { status: 500 });
      }

      return NextResponse.json({ exito: true, mensaje: `${turnosParaInsertar.length} turnos creados correctamente` });
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
          mensaje: `Se bloquearon ${ids.length} turnos el ${fecha} de ${hora_inicio} a ${hora_fin}`,
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
      const { turno_id, motivo } = datos as { turno_id: string; motivo?: string };

      const { cancelarTurnoPorMedico } = await import("@/lib/cancelaciones");
      const resultado = await cancelarTurnoPorMedico(turno_id, medicoDbId, motivo);

      if (!resultado.ok) {
        return NextResponse.json({
          exito: false,
          mensaje: resultado.error ?? "Error al cancelar",
        });
      }

      return NextResponse.json({
        exito: true,
        mensaje: "Turno cancelado correctamente. El paciente fue notificado y tiene crédito para reprogramar.",
      });
    }

    if (accion === "cancelar_turnos_dia") {
      const { fecha, motivo } = datos as { fecha: string; motivo?: string };

      const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!fechaRegex.test(fecha)) {
        return NextResponse.json({ exito: false, mensaje: "Formato de fecha inválido" }, { status: 400 });
      }

      const { data: turnosDia } = await supabase
        .from("turnos")
        .select("id")
        .eq("medico_id", medicoDbId)
        .eq("fecha", fecha)
        .in("estado", ["confirmado", "en_espera"]);

      if (!turnosDia || turnosDia.length === 0) {
        return NextResponse.json({
          exito: true,
          mensaje: "No hay turnos con pacientes para cancelar ese día.",
        });
      }

      const { cancelarTurnoPorMedico } = await import("@/lib/cancelaciones");

      let cancelados = 0;
      const errores: string[] = [];

      for (const turno of turnosDia) {
        const resultado = await cancelarTurnoPorMedico(turno.id, medicoDbId, motivo);
        if (resultado.ok) {
          cancelados++;
        } else {
          errores.push(resultado.error ?? "Error desconocido");
        }
      }

      return NextResponse.json({
        exito: cancelados > 0,
        mensaje: errores.length > 0
          ? `${cancelados} turno${cancelados !== 1 ? "s" : ""} cancelado${cancelados !== 1 ? "s" : ""}. ${errores.length} error${errores.length !== 1 ? "es" : ""}.`
          : `${cancelados} turno${cancelados !== 1 ? "s" : ""} cancelado${cancelados !== 1 ? "s" : ""}. Cada paciente fue notificado y tiene crédito para reprogramar.`,
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
