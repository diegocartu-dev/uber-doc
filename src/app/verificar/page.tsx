import { Metadata } from "next";
import BuscarDocumentoClient from "./BuscarDocumentoClient";
import PieLegal from "./PieLegal";

/**
 * `/verificar` sin id. Existe porque el pie de todo documento firmado invita a
 * verificarlo "escaneando el QR o en docto.com.ar/verificar/…": el que no puede
 * escanear tipea, y tipear de un papel se corta o se equivoca. Antes esta ruta
 * devolvía 404 y el documento quedaba pareciendo menos verificable que antes.
 */
export const metadata: Metadata = {
  title: "Verificar documento — Docto",
  description:
    "Verificá la autenticidad de un documento médico electrónico emitido por Docto.",
  robots: "noindex, nofollow",
};

export default function VerificarIndexPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto max-w-lg px-4">
          <div className="flex h-14 items-center">
            <span className="text-lg font-medium text-gray-900">Docto</span>
            <span className="ml-2 text-sm text-gray-400">Verificación de documento</span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-4 py-8">
        <BuscarDocumentoClient />
      </main>

      <PieLegal />
    </div>
  );
}
