// Un profesional que no está en condiciones de atender no atiende ni oferta
// (Diego, 08/10/2026). Acá: el que no recibe nuestros WhatsApp porque WhatsApp
// rechaza su número. Sin el aviso no se entera de que lo esperan, y el paciente
// espera a la nada (caso del 05/10).
//
// · Se bloquea SOLO cuando Twilio devuelve un error de destinatario inválido
//   (el número no tiene WhatsApp activo, no existe o no es un celular). Un
//   corte de red o un aviso demorado no bloquea a nadie.
// · Bloquear = no aparece en la clínica, ni en su link propio, y la consulta
//   inmediata se apaga y no se puede volver a prender. Se guardan los valores
//   previos de visibilidad para devolverlos tal cual.
// · Se levanta solo cuando el profesional (o el equipo) cambia el celular. Si
//   el número nuevo también falla, el próximo aviso lo vuelve a bloquear.
// · Solo el servidor toca esto (service role). Nunca bloquea cuentas de prueba.

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Códigos de Twilio que dicen "este número no puede recibir WhatsApp":
 * 63024 destinatario inválido (sin WhatsApp activo), 63003 no se encuentra el
 * destinatario, 21211 número inválido, 21614 no es un celular.
 */
const DESTINATARIO_INVALIDO = new Set(["63024", "63003", "21211", "21614"]);

export function esDestinatarioInvalido(codigo: string | null | undefined): boolean {
  return Boolean(codigo) && DESTINATARIO_INVALIDO.has(String(codigo));
}

export function motivoDeCodigo(codigo: string | null | undefined): string {
  if (String(codigo) === "63024") return "WhatsApp rechaza tu número: no tiene WhatsApp activo";
  if (String(codigo) === "21614") return "El número cargado no es un celular";
  return "WhatsApp no encuentra tu número";
}

export type BloqueoActivo = { motivo: string; creado_at: string };

export async function bloqueoActivo(medicoId: string): Promise<BloqueoActivo | null> {
  const { data } = await createAdminClient()
    .from("medicos_bloqueos")
    .select("motivo, creado_at")
    .eq("medico_id", medicoId)
    .eq("tipo", "whatsapp")
    .is("levantado_at", null)
    .maybeSingle();
  return (data as BloqueoActivo | null) ?? null;
}

/** Bloquea. Idempotente: si ya hay un bloqueo activo no hace nada. Devuelve true si bloqueó ahora. */
export async function bloquearPorWhatsApp(medicoId: string, codigo: string | null): Promise<boolean> {
  const admin = createAdminClient();
  const { data: m } = await admin
    .from("medicos")
    .select("oculto_clinica, visible_consultorio_particular, disponible, es_cuenta_test")
    .eq("id", medicoId)
    .maybeSingle();
  if (!m || m.es_cuenta_test) return false;
  if (await bloqueoActivo(medicoId)) return false;

  const { error } = await admin.from("medicos_bloqueos").insert({
    medico_id: medicoId,
    tipo: "whatsapp",
    motivo: motivoDeCodigo(codigo),
    codigo,
    previo: { oculto_clinica: m.oculto_clinica, visible_consultorio_particular: m.visible_consultorio_particular },
  });
  // Otro proceso bloqueó entre medio (índice único): ya está bloqueado.
  if (error) return false;
  await admin
    .from("medicos")
    .update({ oculto_clinica: true, visible_consultorio_particular: false, disponible: false })
    .eq("id", medicoId);
  return true;
}

/** Levanta el bloqueo y devuelve la visibilidad que tenía antes. Devuelve true si había uno. */
export async function levantarBloqueoWhatsApp(medicoId: string, por: "cambio_celular" | "admin"): Promise<boolean> {
  const admin = createAdminClient();
  const { data: b } = await admin
    .from("medicos_bloqueos")
    .update({ levantado_at: new Date().toISOString(), levantado_por: por })
    .eq("medico_id", medicoId)
    .eq("tipo", "whatsapp")
    .is("levantado_at", null)
    .select("previo")
    .maybeSingle();
  if (!b) return false;
  const previo = (b.previo ?? {}) as { oculto_clinica?: boolean; visible_consultorio_particular?: boolean };
  await admin
    .from("medicos")
    .update({
      oculto_clinica: previo.oculto_clinica ?? false,
      visible_consultorio_particular: previo.visible_consultorio_particular ?? true,
    })
    .eq("id", medicoId);
  return true;
}
