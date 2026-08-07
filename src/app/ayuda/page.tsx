export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import FormularioAyuda from "./FormularioAyuda";

export const metadata: Metadata = {
  title: "Ayuda — Docto",
  description: "Escribinos y te respondemos por mail. Soporte de Docto.",
};

// Pantalla pública de ayuda: funciona con y sin sesión. Antes el botón “Ayuda”
// del menú era un `mailto:` — en un celular sin cliente de correo configurado
// no hacía absolutamente nada y el usuario quedaba sin canal.
export default async function AyudaPage({
  searchParams,
}: {
  searchParams: Promise<{ asunto?: string }>;
}) {
  let emailSesion: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    emailSesion = user?.email ?? null;
  } catch {
    // Sin sesión (o cookie rota): el formulario le pide un email de contacto.
    emailSesion = null;
  }

  const { asunto } = await searchParams;

  return (
    <FormularioAyuda
      emailSesion={emailSesion}
      asuntoInicial={(asunto ?? "").slice(0, 120)}
    />
  );
}
