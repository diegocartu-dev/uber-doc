"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="flex min-h-[44px] min-w-[44px] items-center justify-center text-xs text-gray-400 transition hover:text-gray-600"
    >
      Salir
    </button>
  );
}
