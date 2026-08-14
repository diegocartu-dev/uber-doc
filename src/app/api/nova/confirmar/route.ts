import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/feature-flags";
import { crearAgendaModelo } from "@/lib/agenda/crear-agenda";
import { esInstitucional } from "@/lib/instancia";
import { profesionalSigueHabilitado } from "@/lib/institucional/demo-puerta";

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

    // ── LA PUERTA DEL PROFESIONAL INVITADO ────────────────────────────────
    // Nova ESCRIBE (crea agendas, bloquea períodos) y lee la agenda de la
    // institución. El enlace de una reunión se proyecta en una pared: revocarlo
    // cierra la sesión, pero el access token que el navegador ya tiene sigue
    // sirviendo cerca de una hora. Sin esto, el que fotografió el QR seguía
    // pudiendo pedirle cosas a Nova después de que lo echaran.
    if (!(await profesionalSigueHabilitado())) {
      return NextResponse.json(
        { exito: false, mensaje: "Este acceso ya no está activo." },
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

      // Duración: la del payload o, si no vino, la del perfil del médico.
      //
      // ── MODO INSTITUCIONAL: LA DURACIÓN NO SE NEGOCIA (R10) ────────────────
      // La define la INSTITUCIÓN, no el profesional, y `crearAgendaModelo`
      // RECHAZA cualquier otra. Sin este gate, un profesional que le dice a
      // Nova "abrime turnos de media hora" —o la propia Nova infiriendo una
      // duración del lenguaje natural— recibía un "en esta institución la
      // consulta es de N minutos" en vez de su agenda. En una demo, eso es la
      // escena de Nova fallando en vivo. Se fuerza al número del config y se
      // avisa en el mensaje de éxito.
      //
      // En B2C `esInstitucional()` es false y esto no ejecuta nada.
      let duracionMinutos = typeof duracion === "number" && duracion > 0 ? duracion : medico.duracion_consulta;
      let duracionPisada = false;
      if (esInstitucional()) {
        const { getConfigInstitucion } = await import("@/lib/institucional/config");
        const configInst = await getConfigInstitucion();
        duracionPisada = duracionMinutos !== configInst.slot_duracion_min;
        duracionMinutos = configInst.slot_duracion_min;
      }
      // Precio: el de ESTA agenda si el médico lo indicó; si no, su precio default.
      // Validación de rango: el precio lo provee el LLM desde lenguaje natural y se
      // cobra real al paciente vía MP → topamos contra valores absurdos (Roberto CRÍTICO-2).
      const PRECIO_MIN = 500;
      const PRECIO_MAX = 500000;
      if (typeof precio === "number" && precio > 0 && (precio < PRECIO_MIN || precio > PRECIO_MAX)) {
        return NextResponse.json({
          exito: false,
          mensaje: `Ese precio ($${precio.toLocaleString("es-AR")}) está fuera de rango. El valor de consulta debe estar entre $${PRECIO_MIN.toLocaleString("es-AR")} y $${PRECIO_MAX.toLocaleString("es-AR")}.`,
        });
      }
      const precioAgenda = typeof precio === "number" && precio > 0 ? precio : medico.precio_consulta;

      // Días de semana: nombres → números (1=lunes … 7=domingo). Vacío/omitido → todos los días del rango.
      const DIA_MAP: Record<string, number> = {
        lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7,
      };
      const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      let diasNum: number[];
      if (!Array.isArray(dias_semana) || dias_semana.length === 0) {
        // Sin d\u00edas expl\u00edcitos: si es UNA fecha puntual ("este viernes"), usamos el
        // d\u00eda de ESA fecha (no los 7). Si es un rango ("todos los d\u00edas de junio"),
        // s\u00ed todos. Antes defaulteaba siempre a los 7 \u2192 guardaba franjas Lun-Dom y
        // la grilla mostraba toda la semana aunque el turno fuera un solo d\u00eda.
        if (fecha_desde === fecha_hasta) {
          const js = new Date(fecha_desde + "T12:00:00").getDay(); // 0=domingo \u2026 6=s\u00e1bado
          diasNum = [js === 0 ? 7 : js]; // \u2192 1=lunes \u2026 7=domingo
        } else {
          diasNum = [1, 2, 3, 4, 5, 6, 7];
        }
      } else {
        diasNum = [...new Set(dias_semana.map((d) => DIA_MAP[normalizar(d)]).filter((n): n is number => !!n))];
      }
      if (diasNum.length === 0) {
        return NextResponse.json({ exito: false, mensaje: "No reconocí los días de la semana." }, { status: 400 });
      }

      let franjas = diasNum.map((dia_semana) => ({ dia_semana, hora_inicio, hora_fin }));

      // ── EL PEDIDO SE RECORTA CONTRA LO QUE YA ESTÁ PUESTO (institucional) ──
      // `crearAgendaModelo` rechaza ENTERA cualquier agenda que se pise con
      // turnos existentes. En una demo eso significa que el pedido más natural
      // del mundo —"lunes a viernes de 9 a 12 y también de 15 a 18"— falla, sin
      // importar cuál de las dos bandas haya llenado el escenario, porque
      // siempre se pisa con una.
      //
      // El contexto de Nova ahora dice qué está ocupado (ver
      // `agenda-ocupada.ts`), pero eso es una instrucción a un modelo: puede
      // no hacerle caso. Esto es el backstop determinístico — se le saca al
      // pedido la parte ocupada y se crea la libre, o se explica qué banda sí
      // se puede abrir. Nadie tiene que soplarle nada al participante.
      //
      // GATEADO POR MODO: en B2C no ejecuta una línea y el médico del
      // marketplace sigue recibiendo el rechazo duro de siempre, que es lo que
      // su pantalla espera.
      let recorteParcial = "";
      if (esInstitucional()) {
        const { getConfigInstitucion } = await import("@/lib/institucional/config");
        const {
          bandasOcupadasDelProfesional,
          recortarFranjas,
          huecosDelDia,
          frasePedidoTodoOcupado,
          fraseRecorteParcial,
        } = await import("@/lib/institucional/agenda-ocupada");
        const configInst = await getConfigInstitucion();
        const ocupadas = await bandasOcupadasDelProfesional({
          medicoId: medicoDbId,
          desde: fecha_desde,
          hasta: fecha_hasta,
        });
        const recorte = recortarFranjas(franjas, ocupadas, duracionMinutos);
        if (recorte.libres.length === 0 && recorte.choques.length > 0) {
          // Todo lo pedido estaba ocupado: en vez del "hay un conflicto" pelado
          // de la API, se ofrece el hueco real del primer día que pidió.
          const huecos = huecosDelDia(
            ocupadas,
            franjas[0].dia_semana,
            { inicio: configInst.ci_ventana_inicio.slice(0, 5), fin: configInst.ci_ventana_fin.slice(0, 5) },
            duracionMinutos
          );
          return NextResponse.json({
            exito: false,
            mensaje: frasePedidoTodoOcupado(recorte.choques, huecos),
          });
        }
        if (recorte.choques.length > 0) {
          franjas = recorte.libres;
          recorteParcial = fraseRecorteParcial(recorte.choques);
        }
      }

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
      // Lo que quedó afuera se DICE, en la misma respuesta y sin que el médico
      // tenga que preguntarlo. Un recorte silencioso es peor que un rechazo.
      mensaje += recorteParcial;
      if (duracionPisada) {
        mensaje += ` Los hice de ${duracionMinutos} minutos, que es la duración que define la institución.`;
      }
      if (resultado.agendasViejasBloqueadas > 0) {
        mensaje += ` Tenías una agenda anterior en esos días: bloqueé ${resultado.agendasViejasBloqueadas} turno${resultado.agendasViejasBloqueadas !== 1 ? "s" : ""} vacío${resultado.agendasViejasBloqueadas !== 1 ? "s" : ""} para no encimar. Revisala si querés.`;
      }
      return NextResponse.json({ exito: true, mensaje });
    }

    if (accion === "bloquear_periodo") {
      const { fecha_desde, fecha_hasta, hora_inicio, hora_fin } = datos as {
        fecha_desde: string;
        fecha_hasta: string;
        hora_inicio?: string;
        hora_fin?: string;
      };

      const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!fechaRegex.test(fecha_desde) || !fechaRegex.test(fecha_hasta) || fecha_desde > fecha_hasta) {
        return NextResponse.json({ exito: false, mensaje: "Rango de fechas inválido." }, { status: 400 });
      }

      const conHoras = !!hora_inicio && !!hora_fin;
      const aMin = (h: string) => {
        const [hh, mm] = h.split(":").map(Number);
        return hh * 60 + mm;
      };
      // Solape de intervalos para filtrar por hora (cuando se especifica una franja)
      const seSolapa = <T extends { hora_inicio: string; hora_fin: string }>(arr: T[]) => {
        if (!conHoras) return arr;
        const hi = aMin(hora_inicio!);
        const hf = aMin(hora_fin!);
        return arr.filter((t) => aMin(t.hora_inicio) < hf && hi < aMin(t.hora_fin));
      };

      // Turnos DISPONIBLES del rango → se bloquean
      const { data: disponibles } = await supabase
        .from("turnos")
        .select("id, hora_inicio, hora_fin")
        .eq("medico_id", medicoDbId)
        .eq("estado", "disponible")
        .gte("fecha", fecha_desde)
        .lte("fecha", fecha_hasta);

      const idsABloquear = seSolapa(disponibles ?? []).map((t) => t.id);

      // Turnos CON PACIENTE del rango → NO se tocan, solo se informan
      const { data: ocupados } = await supabase
        .from("turnos")
        .select("id, hora_inicio, hora_fin")
        .eq("medico_id", medicoDbId)
        .in("estado", ["reservado_pendiente", "confirmado", "en_espera", "en_curso"])
        .gte("fecha", fecha_desde)
        .lte("fecha", fecha_hasta);

      const pacientesEnRango = seSolapa(ocupados ?? []).length;

      for (let i = 0; i < idsABloquear.length; i += 500) {
        const { error } = await supabase
          .from("turnos")
          .update({ estado: "bloqueado" })
          .in("id", idsABloquear.slice(i, i + 500));
        if (error) {
          return NextResponse.json({ exito: false, mensaje: `Error al bloquear: ${error.message}` });
        }
      }

      let mensaje =
        idsABloquear.length > 0
          ? `Bloqueé ${idsABloquear.length} turno${idsABloquear.length !== 1 ? "s" : ""} disponible${idsABloquear.length !== 1 ? "s" : ""} en ese período.`
          : "No había turnos disponibles para bloquear en ese período.";
      if (pacientesEnRango > 0) {
        mensaje += ` Ojo: hay ${pacientesEnRango} turno${pacientesEnRango !== 1 ? "s" : ""} con paciente en ese período que NO toqué. Si los querés cancelar, decímelo.`;
      }
      return NextResponse.json({ exito: true, mensaje });
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

    if (accion === "reprogramar_turno") {
      // BLOQUEADO (decisión Diego 25/07): mover un turno pago exige la aceptación
      // del paciente, y ese flujo no existe todavía. Caso real 24/07: dos
      // reprogramaciones del médico el mismo día → la paciente llegó a su horario
      // original y terminó marcada "ausente" sin reembolso. La tool ya no existe
      // en el chat; esto queda como defensa en profundidad ante confirmaciones
      // pendientes o clientes viejos.
      return NextResponse.json({
        exito: false,
        mensaje:
          "No se pueden reprogramar turnos otorgados: el proceso de cobro ya está realizado. Solo el paciente puede reprogramar su turno. Si no podés atender, cancelá el turno (el paciente recibe el aviso y el reembolso completo) o escribí a soporte@docto.com.ar.",
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
