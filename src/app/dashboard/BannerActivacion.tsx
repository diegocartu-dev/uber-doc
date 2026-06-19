"use client";

// Tarjeta única de activación pendiente en el dashboard del médico. Reemplaza el
// collage de 3 superficies (perfil + MP + firma) por UN solo CTA al wizard guiado
// de /medico/onboarding. Se muestra mientras el onboarding está incompleto; el
// gate de "disponible" (perfil-medico.ts) impide atender hasta completarlo.

import Link from "next/link";

export default function BannerActivacion({ faltan }: { faltan: number }) {
  return (
    <div className="mb-4 rounded-xl p-5" style={{ border: "1px solid #378ADD", background: "#F5F9FE" }}>
      <p className="text-base font-semibold text-gray-900">
        Activá tu cuenta para empezar a atender
      </p>
      <p className="mt-1 text-sm text-gray-600">
        {faltan > 0
          ? `Te ${faltan === 1 ? "falta" : "faltan"} ${faltan} ${faltan === 1 ? "paso" : "pasos"} para poder atender pacientes en Docto.`
          : "Completá los últimos datos para empezar a atender en Docto."}
      </p>
      <Link
        href="/medico/onboarding"
        className="mt-4 inline-flex items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold text-white"
        style={{ backgroundColor: "#378ADD" }}
      >
        Continuar →
      </Link>
    </div>
  );
}
