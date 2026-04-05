"use client";

import { useRouter } from "next/navigation";

function getSaludo(): string {
  const hora = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
  ).getHours();

  if (hora >= 6 && hora < 12) return "Buenos dias";
  if (hora >= 12 && hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default function NovaWidget({
  nombreMedico,
  turnosHoy,
}: {
  nombreMedico: string;
  turnosHoy: number;
}) {
  const router = useRouter();
  const saludo = getSaludo();

  return (
    <div
      className="mb-6 rounded-xl bg-white p-4 md:p-5 md:px-6"
      style={{
        border: "0.5px solid #e5e7eb",
        borderLeft: "3px solid #1D9E75",
      }}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-base font-medium text-[#1a1a1a] lg:text-lg">
            {saludo}, Dr. {nombreMedico}
          </p>
          <p className="mt-1 text-sm text-[#6b7280]">
            Hoy tenes{" "}
            <span className="font-semibold text-[#1a1a1a]">{turnosHoy}</span>{" "}
            turno{turnosHoy !== 1 ? "s" : ""} programado
            {turnosHoy !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => router.push("/medico/nova")}
          className="mt-3 w-full min-h-[44px] rounded-lg bg-[#1D9E75] px-4 py-2 text-sm font-medium text-white active:scale-95 transition-transform lg:mt-0 lg:w-auto"
        >
          Hablar con Nova
        </button>
      </div>
    </div>
  );
}
