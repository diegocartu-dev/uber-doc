// POST /api/otorgador/asignar-turno — {paciente_id, turno_id} → UPDATE atómico
// (spec institucional §4.3/§4.5) + auditoría en `asignaciones`. 409 si perdió
// la carrera contra otro operador (banner "Ese horario se acaba de ocupar").
// SOLO instancia institucional; operador por sesión o API key.

import { NextRequest, NextResponse } from "next/server";
import { identificarOperador } from "@/lib/otorgador/auth";
import { asignarTurno, type ErrorAsignacion } from "@/lib/otorgador/asignar-turno";

export const dynamic = "force-dynamic";

const STATUS: Record<ErrorAsignacion, number> = {
  validacion: 422,
  no_encontrado: 404,
  sin_canal: 422,
  paciente_ocupado: 409,
  conflicto_slot: 409,
  interno: 500,
};

export async function POST(req: NextRequest) {
  const identidad = await identificarOperador(req);
  if (!identidad) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: { paciente_id?: string; turno_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  if (!body.paciente_id || !body.turno_id) {
    return NextResponse.json({ error: "Faltan paciente_id y/o turno_id." }, { status: 422 });
  }

  const res = await asignarTurno({
    pacienteId: body.paciente_id,
    turnoId: body.turno_id,
    operadorId: identidad.operador.id,
    via: identidad.via,
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.error, codigo: res.codigo }, { status: STATUS[res.codigo] });
  }

  return NextResponse.json({
    ok: true,
    turno: res.turno,
    medico: res.medico,
    paciente: {
      id: res.paciente.id,
      nombre: res.paciente.nombre,
      celular: res.paciente.celular,
      email: res.paciente.email,
    },
    // Resultado de los avisos (spec §8): la pantalla de éxito muestra el del
    // paciente ("Le enviamos el acceso por WhatsApp al …"); `avisos` trae
    // ambos para clientes API (operador IA / Nova).
    aviso: res.avisos.paciente,
    avisos: res.avisos,
  });
}
