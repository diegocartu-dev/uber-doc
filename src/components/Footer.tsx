import Link from "next/link";

export default function Footer() {
  return (
    <footer
      className="mt-20 w-full flex items-center justify-center"
      style={{
        backgroundColor: "var(--color-bg-tertiary)",
        minHeight: "48px",
        padding: "12px 24px",
      }}
    >
      <div
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center"
        style={{
          fontSize: "12px",
          color: "var(--color-text-tertiary)",
        }}
      >
        <span
          className="font-semibold"
          style={{ color: "var(--color-text-secondary)" }}
        >
          docto
        </span>
        <span aria-hidden="true">|</span>
        <span>Docto Telemedicina S.A.S. - CUIT 30-71654321-0</span>
        <span aria-hidden="true">|</span>
        <Link
          href="#"
          className="underline-offset-2 transition-colors hover:underline"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Términos
        </Link>
        <span aria-hidden="true">|</span>
        <Link
          href="#"
          className="underline-offset-2 transition-colors hover:underline"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Privacidad
        </Link>
        <span aria-hidden="true">|</span>
        <a
          href="mailto:soporte@docto.com.ar"
          className="underline-offset-2 transition-colors hover:underline"
          style={{ color: "var(--color-text-secondary)" }}
        >
          soporte@docto.com.ar
        </a>
      </div>
    </footer>
  );
}
