export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";
import ReembolsosClient from "./ReembolsosClient";

export default async function AdminReembolsosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/admin");

  return <ReembolsosClient />;
}
