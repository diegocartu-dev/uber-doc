"use client";

// Banner de verificación de identidad (gate identidad_gate_activa SIN MURO —
// rediseño 13/07/2026). Antes, un médico sin identidad_validada veía
// PantallaIdentidad EN LUGAR de todo su dashboard: quedó gente presa 3 semanas
// cuando el webhook de Didit se rompió. Ahora el médico entra normal a su panel
// y el banner le dice la única consecuencia real. Naranja = alerta; CTA azul.
//
// Variante "rechazada" (Diego, 17/07): si Didit RECHAZÓ la verificación, la
// invitación a repetirla se muestra SIEMPRE, con o sin gate — reintentar no es
// un muro, es una puerta. Sin promesas de tiempo (regla de la casa).

import Link from "next/link";

export default function BannerIdentidad({ variante = "pendiente" }: { variante?: "pendiente" | "rechazada" }) {
  if (variante === "rechazada") {
    return (
      <div className="mb-4 rounded-xl p-5" style={{ border: "1px solid #D85A30", background: "rgba(216, 90, 48, 0.06)" }}>
        <p className="text-base font-semibold text-gray-900">
          Tenemos que repetir tu verificación de identidad
        </p>
        <p className="mt-1 text-sm text-gray-600">
          La verificación anterior no pudo completarse. Repetila cuando quieras —
          solo necesitás tu DNI y la cámara del teléfono.
        </p>
        <Link
          href="/registro-medico/identidad"
          className="mt-4 inline-flex items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold text-white"
          style={{ backgroundColor: "#378ADD" }}
        >
          Repetir verificación →
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl p-5" style={{ border: "1px solid #D85A30", background: "rgba(216, 90, 48, 0.06)" }}>
      <p className="text-base font-semibold text-gray-900">
        Verificá tu identidad para empezar a recibir pacientes
      </p>
      <p className="mt-1 text-sm text-gray-600">
        Por seguridad de los pacientes, necesitamos validar tu identidad (tu DNI y
        una selfie). Hasta completarla, tu perfil no se muestra en la clínica
        virtual y los pacientes no pueden reservar con vos.
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
