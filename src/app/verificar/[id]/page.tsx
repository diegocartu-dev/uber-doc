import { Metadata } from "next";
import VerificarRecetaClient from "./VerificarRecetaClient";

export const metadata: Metadata = {
  title: "Verificar documento — Docto",
  description:
    "Verificá la autenticidad de un documento médico electrónico emitido por Docto.",
  robots: "noindex, nofollow",
};

export default async function VerificarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      {/* Header simple — público, sin auth */}
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto max-w-lg px-4">
          <div className="flex h-14 items-center">
            <span className="text-lg font-medium text-gray-900">Docto</span>
            <span className="ml-2 text-sm text-gray-400">Verificación de documento</span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-lg px-4 py-8">
        <VerificarRecetaClient recetaId={id} />
      </main>

      {/* Footer legal */}
      <footer className="border-t border-gray-100 bg-white px-4 py-6">
        <div className="mx-auto max-w-lg">
          <p className="text-[11px] leading-relaxed text-gray-400">
            Docto — Plataforma de telemedicina habilitada por Ley 27.553 y Decreto
            63/2024. Los documentos se firman electrónicamente en los términos del
            art. 5 de la Ley 25.506.
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            Esta página permite verificar la autenticidad de los documentos
            médicos emitidos electrónicamente. No se muestra información médica
            del paciente.
          </p>
        </div>
      </footer>
    </div>
  );
}
