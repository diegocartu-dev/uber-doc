export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/admin";
import BandejaClient from "./BandejaClient";

// Bandeja de correo (contacto@docto.com.ar). /admin/layout ya gatea isAdmin.
export default async function BandejaPage() {
  const admin = createAdminClient();
  const { data: correos } = await admin
    .from("correos")
    .select("id, creado_en, direccion, de, para, asunto, leido, atendido, error_envio, en_respuesta_a, sistema")
    .order("creado_en", { ascending: false })
    .limit(200);

  const lista = (correos ?? []).map((c) => ({
    id: c.id as string,
    creadoEn: c.creado_en as string,
    direccion: c.direccion as "entrada" | "salida",
    de: (c.de as string) ?? "",
    para: (c.para as string) ?? "",
    asunto: (c.asunto as string) ?? "(sin asunto)",
    leido: !!c.leido,
    sistema: !!c.sistema,
    atendido: !!c.atendido,
    errorEnvio: (c.error_envio as string) ?? null,
    esRespuesta: !!c.en_respuesta_a,
  }));

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-xl font-bold text-gray-900">Bandeja</h1>
      <p className="mt-1 text-sm text-gray-500">
        Correo de contacto@docto.com.ar: lo que llega, lo que sale, y redactar. Pocos mails
        por día y personalizados — el volumen masivo quema la reputación del dominio.
      </p>
      <div className="mt-6">
        <BandejaClient correos={lista} />
      </div>
    </div>
  );
}
