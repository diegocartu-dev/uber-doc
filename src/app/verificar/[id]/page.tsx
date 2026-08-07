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
          {/*
            El pie NO puede afirmar en general lo que la tarjeta del medio niega
            para este documento en particular: se renderiza igual cuando arriba
            dice "Documento sin sello de verificación", y un farmacéutico leía
            las dos cosas a la vez. Se acota a los documentos que sí se sellan.
          */}
          <p className="text-[11px] leading-relaxed text-gray-400">
            Docto — Plataforma de telemedicina habilitada por Ley 27.553 y Decreto
            63/2024. Los documentos emitidos desde agosto de 2026 se firman
            electrónicamente en los términos del art. 5 de la Ley 25.506; los
            anteriores no llevan sello y esta página lo indica en cada caso.
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
