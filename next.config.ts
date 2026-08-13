import type { NextConfig } from "next";

// ── Headers de las pantallas del paciente institucional ──────────────────────
// Desde la Etapa 3, `/acceso` está FUERA del matcher del middleware (para que
// el bot de preview de WhatsApp no dispare un refresh de sesión sobre alguien
// que todavía no es nadie). Efecto colateral: se quedó sin el único lugar
// donde el repo pone `X-Robots-Tag`, y nunca tuvo `Referrer-Policy`.
//
// Las dos cosas importan justo acá y en ninguna otra parte:
//   · `Referrer-Policy: no-referrer` — la URL de la landing LLEVA el token
//     adentro (es un link: no hay otra forma). Hoy la página no carga ni un
//     recurso externo (Inter va self-hosted por next/font, no hay analytics ni
//     Sentry), así que el riesgo es latente, no explotable. Se fija ahora para
//     que no dependa de que nadie agregue un script mañana.
//   · `X-Robots-Tag: noindex` — son URLs públicas que muestran el nombre del
//     paciente y el del profesional.
//
// REGLA DE ORO: el bloque solo existe si el deploy es institucional. En B2C
// (donde estas rutas son 404) la config queda idéntica, sin una regla de más.
const headersInstitucional =
  process.env.INSTITUCIONAL === "true"
    ? [
        {
          source: "/acceso/:path*",
          headers: [
            { key: "Referrer-Policy", value: "no-referrer" },
            { key: "X-Robots-Tag", value: "noindex, nofollow" },
          ],
        },
        {
          source: "/turno/:turnoId/acceso",
          headers: [
            { key: "Referrer-Policy", value: "no-referrer" },
            { key: "X-Robots-Tag", value: "noindex, nofollow" },
          ],
        },
      ]
    : [];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit", "sharp"],
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return headersInstitucional;
  },
};

export default nextConfig;
