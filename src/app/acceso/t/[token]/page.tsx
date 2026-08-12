export const dynamic = "force-dynamic";

// /acceso/t/[token] — STUB de aterrizaje del link de acceso del paciente.
//
// La landing REAL (interstitial "Estás por entrar como…" + validación del
// token contra accesos_link + minteo de sesión patrón impersonate) es trabajo
// de la ETAPA 3 (spec institucional §5.4). Este stub existe por el hallazgo de
// la revisión de Etapa 2: los avisos de asignación YA salen por WhatsApp/mail
// con URLs /acceso/t/<token> — sin esta ruta, cada paciente asignado recibía
// un link que daba 404. Hasta que la Etapa 3 abra la puerta, el link aterriza
// acá con un mensaje honesto y el teléfono de ayuda de la institución.
//
// A PROPÓSITO no valida ni consume el token (eso es Etapa 3): mostrar "token
// inválido" desde un stub sería mentirle al paciente sobre un sistema que
// todavía no existe. SOLO instancia institucional: en B2C es 404.

import { notFound } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { getBrandingInstitucion, getConfigInstitucion } from "@/lib/institucional/config";

export default async function AccesoStubPage() {
  if (!esInstitucional()) notFound();

  const [branding, config] = await Promise.all([getBrandingInstitucion(), getConfigInstitucion()]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F7F8FA",
        padding: 24,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          background: "#fff",
          border: "1px solid #E9EBEF",
          borderRadius: 12,
          boxShadow: "0 1px 2px rgba(16,24,40,.04)",
          padding: "32px 28px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "#9CA3AF" }}>
          {branding.nombre}
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "#111827", margin: "14px 0 10px" }}>
          Tu acceso se está preparando
        </h1>
        <p style={{ fontSize: 14, color: "#4B5563", lineHeight: 1.6, margin: 0 }}>
          Este link es tuyo y va a llevarte directo a tu consulta. Todavía estamos
          terminando de habilitar la entrada: guardá este mensaje y volvé a probar
          más tarde con el mismo link.
        </p>
        {config.telefono_ayuda && (
          <p style={{ fontSize: 14, color: "#4B5563", lineHeight: 1.6, marginTop: 12 }}>
            Si tu consulta es ahora, llamá a {branding.nombre} al{" "}
            <b style={{ color: "#111827" }}>{config.telefono_ayuda}</b> y te ayudan por teléfono.
          </p>
        )}
      </div>
    </main>
  );
}
