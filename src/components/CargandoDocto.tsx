// Loader de pantalla completa con la marca. Se usa como loading.tsx (fallback de
// Suspense del App Router) para que el ingreso a Docto NUNCA muestre una pantalla
// blanca estática — el médico siempre ve que algo está pasando.
export default function CargandoDocto({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white">
      <span className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">Docto</span>
      <div
        className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#378ADD33] border-t-[#378ADD]"
        role="status"
        aria-label="Cargando"
      />
      <span className="text-sm text-gray-400">{texto}</span>
    </div>
  );
}
