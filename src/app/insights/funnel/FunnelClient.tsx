"use client";

export default function FunnelClient() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-white">Funnel de conversión</h1>

      <div
        className="flex flex-col items-center justify-center rounded-xl bg-[#1E293B] px-8 py-20"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex flex-col items-center gap-1 opacity-40">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 10h36L30 28v10l-12 4V28L6 10z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="none" />
          </svg>
        </div>
        <p className="mt-6 text-base font-medium text-white/50">Acumulando datos</p>
        <p className="mt-2 max-w-sm text-center text-sm text-white/30">
          El funnel de conversión estará disponible cuando tengamos suficiente volumen
          para que las métricas sean representativas.
        </p>
        <div className="mt-8 flex gap-6 text-xs text-white/20">
          <span>Registro → Perfil</span>
          <span>→</span>
          <span>Perfil → 1ra consulta</span>
          <span>→</span>
          <span>1ra → 2da consulta</span>
        </div>
      </div>
    </div>
  );
}
