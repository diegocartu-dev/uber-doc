import Link from "next/link";
import { Stethoscope, UserRound } from "lucide-react";

export default function RegisterPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
          <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>docto</span>
        </Link>

        <h2 className="text-center text-xl font-medium" style={{ color: "var(--color-text-primary)" }}>
          Como queres usar Docto?
        </h2>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href="/auth/registro-medico"
            className="rounded-[var(--radius-lg)] bg-white p-6 text-center transition hover:shadow-[var(--shadow-xs)]"
            style={{ border: "1px solid var(--color-border-default)" }}
          >
            <div className="flex items-center justify-center">
              <Stethoscope size={48} strokeWidth={1.5} color="var(--color-success)" />
            </div>
            <p className="mt-4 text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Soy medico</p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Ofrece consultas online a tus pacientes
            </p>
          </Link>

          <Link
            href="/auth/registro-paciente"
            className="rounded-[var(--radius-lg)] bg-white p-6 text-center transition hover:shadow-[var(--shadow-xs)]"
            style={{ border: "1px solid var(--color-border-default)" }}
          >
            <div className="flex items-center justify-center">
              <UserRound size={48} strokeWidth={1.5} color="var(--color-brand)" />
            </div>
            <p className="mt-4 text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Soy paciente</p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Consulta medicos desde tu casa
            </p>
          </Link>
        </div>

        <p className="mt-8 text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Ya tenes cuenta?{" "}
          <Link href="/auth/login" className="font-medium" style={{ color: "var(--color-text-link)" }}>
            Inicia sesion
          </Link>
        </p>
      </div>
    </div>
  );
}
