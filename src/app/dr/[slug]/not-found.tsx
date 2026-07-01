import Link from "next/link";
import { Stethoscope } from "lucide-react";

export default function ConsultorioNotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <Link href="/" className="mb-10 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
          <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>docto</span>
        </Link>

        <h1
          className="text-lg font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          No pudimos abrir este consultorio
        </h1>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Puede que el link esté incompleto o que este consultorio no esté disponible. Encontrá otros médicos en la clínica.
        </p>

        <Link
          href="/clinica"
          className="mt-8 inline-block rounded-[var(--radius-md)] px-6 py-2.5 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--color-brand)" }}
        >
          Ver médicos disponibles
        </Link>
      </div>
    </div>
  );
}
