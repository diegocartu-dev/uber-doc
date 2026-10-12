export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/admin";
import { esRuidoBandeja } from "@/lib/bandeja/ruido";
import type { ContactoSara } from "@/lib/bandeja/sara";
import BandejaClient from "./BandejaClient";

// Bandeja de correo (contacto@docto.com.ar) y buzón de Sara. /admin/layout ya gatea isAdmin.
export default async function BandejaPage({ searchParams }: { searchParams: Promise<{ buzon?: string }> }) {
  const { buzon } = await searchParams;
  const admin = createAdminClient();
  const CAMPOS = "id, creado_en, direccion, de, para, asunto, leido, atendido, error_envio, en_respuesta_a, sistema, origen, datos";
  // Correo y Sara se piden por separado, cada uno con su tope: si Sara entrara en un
  // loop, sus contactos no pueden empujar a los mails viejos fuera de la lista.
  const [{ data: correos }, { data: deSara }] = await Promise.all([
    admin
      .from("correos")
      .select(CAMPOS)
      .eq("origen", "correo")
      .order("creado_en", { ascending: false })
      // El buscador, el orden y el embudo de la vista de tabla trabajan sobre lo que llega
      // acá: con el tope viejo de 200, un correo más antiguo era INENCONTRABLE. Hoy son 165.
      // DEUDA: pasados unos miles hay que paginar del lado del servidor y llevarse la
      // búsqueda con ella.
      .limit(2000),
    admin.from("correos").select(CAMPOS).eq("origen", "sara").order("creado_en", { ascending: false }).limit(500),
  ]);

  const lista = [...(correos ?? []), ...(deSara ?? [])].map((c) => ({
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
    // Los contactos que deja Sara van en su propia pestaña, nunca mezclados con soporte.
    origen: (c.origen === "sara" ? "sara" : "correo") as "correo" | "sara",
    sara: c.origen === "sara" ? (c.datos as ContactoSara | null) : null,
    // Ruido (LinkedIn, servicios externos, cuentas de prueba, automáticos): se
    // pliega en "Otros" para no ocupar la vista de gente real (Diego 18/09).
    // Solo cuenta para los entrantes; una salida nuestra nunca es ruido.
    ruido: c.direccion === "entrada" && c.origen !== "sara" && esRuidoBandeja({ de: (c.de as string) ?? "", sistema: !!c.sistema }),
  }));

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-xl font-bold text-gray-900">Bandeja</h1>
      <p className="mt-1 text-sm text-gray-500">
        Correo de contacto@docto.com.ar: lo que llega, lo que sale, y redactar. Pocos mails
        por día y personalizados — el volumen masivo quema la reputación del dominio.
      </p>
      <div className="mt-6">
        <BandejaClient correos={lista} tabInicial={buzon === "sara" ? "sara" : "entrada"} />
      </div>
    </div>
  );
}
