import Link from "next/link";

export default function Footer() {
  return (
    <footer
      className="mt-20 w-full py-8"
      style={{ backgroundColor: "var(--color-bg-tertiary)" }}
    >
      <div className="mx-auto max-w-4xl px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
          {/* Company info */}
          <div>
            <p
              className="text-xs font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Docto Telemedicina S.A.S.
            </p>
            <p
              className="mt-1 text-xs leading-relaxed"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              CUIT 30-71654321-0
              <br />
              Av. Corrientes 1234, CABA
              <br />
              soporte@docto.com.ar
              <br />
              0800-222-DOCTO
            </p>
            <p
              className="mt-2 text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              ReNaPDiS: En tramite
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-col gap-2">
            <Link
              href="#"
              className="text-xs transition-colors hover:underline"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Terminos y condiciones
            </Link>
            <Link
              href="#"
              className="text-xs transition-colors hover:underline"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Politica de privacidad
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
