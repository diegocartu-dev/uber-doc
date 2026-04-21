import { createClient } from "@/lib/supabase/server";

export const ADMIN_EMAILS = ["diegocartu@gmail.com", "diegocartu@me.com"];

export async function verificarAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) return null;
  return user;
}
