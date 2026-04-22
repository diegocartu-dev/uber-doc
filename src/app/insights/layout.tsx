export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAILS } from "@/lib/admin";
import InsightsNav from "./InsightsNav";

export default async function InsightsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !ADMIN_EMAILS.includes((user.email ?? "").toLowerCase())) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#0F172A]">
      <InsightsNav />
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
