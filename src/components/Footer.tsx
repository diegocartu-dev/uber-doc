import Link from "next/link";
import { Stethoscope, ShieldCheck } from "lucide-react";

const linkMap: Record<string, string> = {
  "Buscar médico": "/clinica",
  "Consulta inmediata": "/clinica",
  "Mis consultas": "/mis-consultas",
  "Sumate a Docto": "/auth/registro-medico",
  "Términos": "/terminos",
  "Privacidad": "/privacidad",
};

const footerCols = [
  { title: "Pacientes", links: ["Buscar médico", "Consulta inmediata", "Mis consultas"] },
  { title: "Médicos", links: ["Sumate a Docto"] },
  { title: "Legal", links: ["Términos", "Privacidad"] },
];

export default function Footer() {
  return (
    <footer style={{
      background: "var(--color-bg-tertiary)",
      padding: "64px 24px 32px",
      borderTop: "1px solid var(--color-border-default)",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          className="landing-footer-grid"
          style={{ display: "grid", gridTemplateColumns: "1.6fr repeat(3, 1fr)", gap: 40, marginBottom: 48 }}
        >
          <div>
            <div className="flex items-center gap-2">
              <Stethoscope size={24} strokeWidth={2} color="var(--color-brand)" />
              <span style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em" }} className="lowercase">
                docto
              </span>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--color-text-secondary)", margin: "16px 0 20px", maxWidth: 280 }}>
              Plataforma de telemedicina argentina. Conectamos pacientes con médicos para consultas virtuales.
            </p>
          </div>
          {footerCols.map((c) => (
            <div key={c.title}>
              <div style={{
                fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
                textTransform: "uppercase", color: "var(--color-text-tertiary)", marginBottom: 14,
              }}>
                {c.title}
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {c.links.map((l) => {
                  const href = linkMap[l];
                  return (
                    <li key={l}>
                      {href ? (
                        <Link href={href} style={{ fontSize: 13.5, color: "var(--color-text-secondary)", textDecoration: "none" }}>{l}</Link>
                      ) : (
                        <span style={{ fontSize: 13.5, color: "var(--color-text-tertiary)" }}>{l}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div style={{
          borderTop: "1px solid var(--color-border-default)", paddingTop: 22,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 14,
        }}>
          <div style={{ fontSize: 12.5, color: "var(--color-text-tertiary)" }}>
            © 2026 Docto — Hecho en Argentina
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", display: "flex", gap: 14, alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ShieldCheck size={13} strokeWidth={1.75} />
              AAIP RL-2026-36086505
            </span>
            <span>·</span>
            <span>ReNaPDiS Plataforma 0270</span>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .landing-footer-grid { grid-template-columns: 1fr 1fr !important; gap: 32px !important; }
        }
        @media (max-width: 560px) {
          .landing-footer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </footer>
  );
}
