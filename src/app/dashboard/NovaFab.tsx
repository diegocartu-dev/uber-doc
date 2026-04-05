"use client";

import { useRouter } from "next/navigation";

export default function NovaFab() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push("/medico/nova")}
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#1D9E75] text-2xl text-white shadow-[0_4px_12px_rgba(29,158,117,0.3)] active:scale-[0.93] transition-all duration-150 lg:hidden"
    >
      🤖
    </button>
  );
}
