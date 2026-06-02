import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/feature-flags";
import { crearAgendaModelo } from "@/lib/agenda/crear-agenda";

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

    if (accion === "crear_disponibilidad") {
      const { fecha_desde, fecha_hasta, dias_semana, hora_inicio, hora_fin, duracion, precio, canal_origen } = datos as {
        fecha_desde: string;
        fecha_hasta: string;
        dias_semana?: string[];
        hora_inicio: string;
        hora_fin: string;
        duracion?: number;
        precio?: number;
        canal_origen: string;
      };

      const CANALES_VALIDOS = ["clinica_virtual", "consultorio_privado"] as const;
      if (!CANALES_VALIDOS.includes(canal_origen as typeof CANALES_VALIDOS[number])) {
        return NextResponse.json({ exito: false, mensaje: "Canal inválido" }, { status: 400 });
      }

      // Duración: la del payload o, si no vino, la del perfil del médico
      const duracionMinutos = typeof duracion === "number" && duracion > 0 ? duracion : medico.duracion_consulta;
      // Precio: el de ESTA agenda si el médico lo indicó; si no, su precio default
      const precioAgenda = typeof precio === "number" && precio > 0 ? precio : medico.precio_consulta;

      // Días de semana: nombres → números (1=lunes … 7=domingo). Vacío/omitido → todos los días del rango.
      const DIA_MAP: Record<string, number> = {
        lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7,
      };
      const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      let diasNum: number[];
      if (!Array.isArray(dias_semana) || dias_semana.length === 0) {
        diasNum = [1, 2, 3, 4, 5, 6, 7];
      } else {
        diasNum = [...new Set(dias_semana.map((d) => DIA_MAP[normalizar(d)]).filter((n): n is number => !!n))];
      }
      if (diasNum.length === 0) {
        return NextResponse.json({ exito: false, mensaje: "No reconocí los días de la semana." }, { status: 400 });
      }

      const franjas = diasNum.map((dia_semana) => ({ dia_semana, hora_inicio, hora_fin }));

      // Idempotencia PRECISA: solo bloquea si ya existe una agenda Nova idéntica
      // (mismo rango + canal + franjas exactas). Así "miércoles de junio" y
      // "viernes de junio" (mismo rango/canal, días distintos) NO se bloquean
      // entre sí, pero el doble-toque del mismo pedido sí se evita.
      const firma = (dia: number, hi: string, hf: string) => `${dia}|${hi.slice(0, 5)}|${hf.slice(0, 5)}`;
      const nuevaFirma = new Set(franjas.map((f) => firma(f.dia_semana, f.hora_inicio, f.hora_fin)));
      const { data: modelosMismoRango } = await supabase
        .from("agenda_modelos")
        .select("id")
        .eq("medico_id", medicoDbId)
        .eq("fecha_inicio", fecha_desde)
        .eq("fecha_fin", fecha_hasta)
        .eq("canal_origen", canal_origen)
        .eq("creado_por_nova", true);
      if (modelosMismoRango && modelosMismoRango.length > 0) {
        const { data: franjasExist } = await supabase
          .from("agenda_franjas")
          .select("modelo_id, dia_semana, hora_inicio, hora_fin")
          .in("modelo_id", modelosMismoRango.map((m) => m.id));
        const porModelo = new Map<string, Set<string>>();
        for (const f of franjasExist ?? []) {
          const set = porModelo.get(f.modelo_id) ?? new Set<string>();
          set.add(firma(f.dia_semana, f.hora_inicio, f.hora_fin));
          porModelo.set(f.modelo_id, set);
        }
        const yaExiste = [...porModelo.values()].some(
          (set) => set.size === nuevaFirma.size && [...set].every((s) => nuevaFirma.has(s))
        );
        if (yaExiste) {
          return NextResponse.json({ exito: true, mensaje: "Esa agenda ya estaba creada." });
        }
      }

      const canalLabel = canal_origen === "clinica_virtual" ? "Clínica Virtual" : "Consultorio";
      const nombreModelo =
        fecha_desde === fecha_hasta
          ? `Nova - ${canalLabel} ${fecha_desde.split("-").reverse().slice(0, 2).join("/")}`
          : `Nova - ${canalLabel} ${fecha_desde} a ${fecha_hasta}`;

      const resultado = await crearAgendaModelo(supabase, {
        medicoId: medicoDbId,
        nombre: nombreModelo,
        fecha_inicio: fecha_desde,
        fecha_fin: fecha_hasta,
        duracion_turno: duracionMinutos,
        precio: precioAgenda,
        franjas,
        canal_origen: canal_origen as "clinica_virtual" | "consultorio_privado",
        creado_por_nova: true,
      });

      if (!resultado.ok) {
        return NextResponse.json({ exito: false, mensaje: resultado.mensaje });
      }

      let mensaje = `Listo, creé ${resultado.turnosCreados} turno${resultado.turnosCreados !== 1 ? "s" : ""} en ${resultado.dias} día${resultado.dias !== 1 ? "s" : ""}.`;
      if (resultado.agendasViejasBloqueadas > 0) {
        mensaje += ` Tenías una agenda anterior en esos días: bloqueé ${resultado.agendasViejasBloqueadas} turno${resultado.agendasViejasBloqueadas !== 1 ? "s" : ""} vacío${resultado.agendasViejasBloqueadas !== 1 ? "s" : ""} para no encimar. Revisala si querés.`;
      }
      return NextResponse.json({ exito: true, mensaje });
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
        mensaje: "Turno cancelado correctamente. El paciente fue notificado y se procesó su reembolso.",
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
          : `${cancelados} turno${cancelados !== 1 ? "s" : ""} cancelado${cancelados !== 1 ? "s" : ""}. Cada paciente fue notificado y se procesó su reembolso.`,
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
