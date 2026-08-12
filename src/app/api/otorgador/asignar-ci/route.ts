// POST /api/otorgador/asignar-ci — {paciente_id, medico_id, motivo?} → guards
// server-side (ventana del config, médico disponible y libre, regla del Uber)
// → INSERT de la CI en estado 'pagada' (decisión spec §4.5 — ver
// src/lib/otorgador/asignar-ci.ts) + auditoría. SOLO instancia institucional;
// operador por sesión o API key.

import { NextRequest, NextResponse } from "next/server";
import { identificarOperador } from "@/lib/otorgador/auth";
import { asignarCI, type ErrorAsignacionCI } from "@/lib/otorgador/asignar-ci";

export const dynamic = "force-dynamic";

const STATUS: Record<ErrorAsignacionCI, number> = {
  validacion: 422,
  no_encontrado: 404,
  sin_canal: 422,
  paciente_ocupado: 409,
  conflicto_slot: 409,
  acuerdo_completo: 409,
  fuera_de_ventana: 422,
  medico_no_disponible: 409,
  interno: 500,
};

export async function POST(req: NextRequest) {
  const identidad = await identificarOperador(req);
  if (!identidad) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: { paciente_id?: string; medico_id?: string; motivo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  if (!body.paciente_id || !body.medico_id) {
    return NextResponse.json({ error: "Faltan paciente_id y/o medico_id." }, { status: 422 });
  }

  const res = await asignarCI({
    pacienteId: body.paciente_id,
    medicoId: body.medico_id,
    motivo: body.motivo,
    operadorId: identidad.operador.id,
    via: identidad.via,
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.error, codigo: res.codigo }, { status: STATUS[res.codigo] });
  }

  return NextResponse.json({
    ok: true,
    consulta_id: res.consultaId,
    medico: res.medico,
    paciente: {
      id: res.paciente.id,
      nombre: res.paciente.nombre,
      celular: res.paciente.celular,
      email: res.paciente.email,
    },
    // Resultado de los avisos (spec §8): el del paciente para el éxito de la
    // pantalla; `avisos` completo para clientes API (operador IA / Nova).
    aviso: res.avisos.paciente,
    avisos: res.avisos,
  });
}
