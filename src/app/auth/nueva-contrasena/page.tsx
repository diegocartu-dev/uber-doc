import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NuevaContrasena from "./NuevaContrasena";

export const dynamic = "force-dynamic";

// Paso 2 de la recuperación de contraseña: el usuario llegó desde el link del
// mail (/auth/callback lo logueó) y define su clave nueva. Exige sesión: sin
// login no hay a quién cambiarle la contraseña.
export default async function NuevaContrasenaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return <NuevaContrasena />;
}
