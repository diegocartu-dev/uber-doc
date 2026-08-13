// src/components/institucional/InstitucionTheme.tsx
// Theming institucional a nivel LAYOUT (chrome, no componentes) — spec §2.1.
//
// Server component montado en src/app/layout.tsx. En B2C (INSTITUCIONAL
// apagado) devuelve null ANTES de tocar nada: cero cambio de comportamiento.
//
// Bajo flag inyecta:
//   1. <style> que pisa los tokens --inst-* de globals.css con los colores
//      del config (marca blanca: el color del cliente vive en la DB, no acá).
//   2. La franja superior de 4px + nombre de la institución — el único chrome
//      compartido de la Etapa 1; los headers por pantalla llegan con las
//      pantallas (otorgador, panel) en etapas siguientes.
//
// ⚠ ENTREGABLE PARCIAL (registrado a propósito): la spec §2.1 pide "franja +
// logo/nombre" y acá `logo_path` NO se renderiza todavía — el bucket
// `institucion-assets` llega recién en la Etapa 5. Cuando exista, hay que
// volver a ESTE componente (no solo al PDF) y sumar el logo junto al nombre.
//
// Frontera del theming (regla #1 del lenguaje aprobado): --inst-* es SOLO
// identidad (franja, logo, acentos de PDF). El azul #378ADD sigue siendo la
// acción y los semánticos no se tocan. Nada de --inst-* en controles.

import { esInstitucional } from "@/lib/instancia";
import { getBrandingInstitucion } from "@/lib/institucional/config";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";

// Los colores vienen de la DB (editable en /admin): se validan antes de
// interpolarse en un <style> para que un valor roto no inyecte CSS arbitrario.
const HEX = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
function hexSeguro(valor: string | null | undefined, fallback: string): string {
  return valor && HEX.test(valor) ? valor : fallback;
}

export default async function InstitucionTheme() {
  if (!esInstitucional()) return null; // B2C: idéntico byte a byte

  let nombre: string;
  let subnombre: string | null;
  let primary: string;
  let primaryDark: string;
  let primarySoft: string;

  try {
    const branding = await getBrandingInstitucion();
    nombre = branding.nombre;
    subnombre = branding.subnombre;
    // Placeholder violeta de tokens.css como fallback si un hex está roto.
    primary = hexSeguro(branding.color_primary, "#4A3F8C");
    primaryDark = hexSeguro(branding.color_primary_dark, "#37306B");
    primarySoft = hexSeguro(branding.color_primary_soft, "#EEECF7");
  } catch (err) {
    // Fail-safe explícito: instancia sin fila de config (o DB caída sin cache).
    // No se inventa una marca — se muestra el problema, bien visible. Pero el
    // DETALLE operativo (con la ruta interna /admin/institucion) es SOLO para
    // admins de Docto: un paciente que entra por link durante una ventana de
    // mala provisión o un blip de DB ve un mensaje neutro, sin rutas internas.
    console.error("[InstitucionTheme]", err);

    let esAdminDocto = false;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      esAdminDocto = !!user && (await isAdmin(user.id));
    } catch {
      // Sin sesión legible (o contexto sin cookies) → mensaje neutro.
    }

    return (
      <div
        role="alert"
        style={{
          background: esAdminDocto ? "#E24B4A" : "#F4F4F3",
          color: esAdminDocto ? "#fff" : "#4B5563",
          fontSize: 13,
          fontWeight: 600,
          padding: "8px 16px",
        }}
      >
        {esAdminDocto
          ? "Instancia institucional sin provisionar: falta la configuración de la institución. Un administrador de Docto debe crearla en /admin/institucion."
          : "Servicio en configuración. Volvé a intentar en unos minutos."}
      </div>
    );
  }

  const css = `:root{--inst-primary:${primary};--inst-primary-dark:${primaryDark};--inst-primary-soft:${primarySoft};}`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {/* Franja institucional de 4px — identidad, nunca interacción */}
      <div aria-hidden style={{ height: 4, background: "var(--inst-primary)" }} />
      {/* Banda con el nombre. La necesitan las pantallas que NO tienen header
          propio (las del paciente, que a propósito borraron su `pac-marca`
          para no duplicarlo). Las que sí lo traen —el panel y el otorgador—
          la apagan desde su CSS con `.inst-banda`: en el mock hay franja +
          UN solo bloque de identidad, y con el logo real (Etapa 5) la
          duplicación se vería peor. */}
      <div
        className="inst-banda"
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          padding: "6px 16px",
          background: "var(--inst-primary-soft)",
          borderBottom: "1px solid #E9EBEF",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--inst-primary-dark)" }}>
          {nombre}
        </span>
        {subnombre && (
          <span style={{ fontSize: 12, color: "var(--inst-primary-dark)", opacity: 0.75 }}>
            {subnombre}
          </span>
        )}
      </div>
    </>
  );
}
