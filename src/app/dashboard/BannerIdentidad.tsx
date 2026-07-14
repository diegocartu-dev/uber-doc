"use client";

// Banner de verificación de identidad pendiente (gate identidad_gate_activa SIN
// MURO — rediseño 13/07/2026). Antes, un médico sin identidad_validada veía
// PantallaIdentidad EN LUGAR de todo su dashboard: quedó gente presa 3 semanas
// cuando el webhook de Didit se rompió. Ahora el médico entra normal a su panel
// y este banner le dice la única consecuencia real: no aparece en la clínica
// hasta validar. Naranja = alerta (design system); CTA azul.

import Link from "next/link";

export default function BannerIdentidad() {
  return (
    <div className="mb-4 rounded-xl p-5" style={{ border: "1px solid #D85A30", background: "rgba(216, 90, 48, 0.06)" }}>
      <p className="text-base font-semibold text-gray-900">
        Verificá tu identidad para empezar a recibir pacientes
      </p>
      <p className="mt-1 text-sm text-gray-600">
        Por seguridad de los pacientes, necesitamos validar tu identidad (DNI y
        una selfie, ~3 minutos). Hasta completarla, tu perfil no se muestra en la
        clínica virtual y los pacientes no pueden reservar con vos.
      </p>
      <Link
        href="/medico/identidad"
        className="mt-4 inline-flex items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold text-white"
        style={{ backgroundColor: "#378ADD" }}
      >
        Verificar mi identidad →
      </Link>
    </div>
  );
}
