import Link from "next/link";
import { Stethoscope } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      {/* Logo + badge */}
      <div className="flex items-center gap-2 mb-10">
        <Stethoscope size={28} strokeWidth={2} color="#1D9E75" />
        <span className="text-2xl font-bold lowercase" style={{ color: "#1a1a1a" }}>
          docto
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold text-white uppercase tracking-wide"
          style={{ background: "#D85A30" }}
        >
          BETA
        </span>
      </div>

      {/* Headline */}
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-bold" style={{ color: "#1a1a1a" }}>
          Consultas médicas al instante
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "#6b7280" }}>
          Conectamos pacientes con médicos para consultas virtuales inmediatas y programadas.
        </p>
      </div>

      {/* CTA */}
      <div className="mt-10">
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all active:scale-[0.98] hover:opacity-90"
          style={{ background: "#1D9E75" }}
        >
          Iniciar sesión
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
