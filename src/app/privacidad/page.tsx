import type { Metadata } from "next";
import PrivacidadContent from "./PrivacidadContent";

export const metadata: Metadata = {
  title: "Política de Privacidad — Docto",
  description: "Cómo tratamos tus datos personales en Docto.",
};

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <PrivacidadContent />
    </main>
  );
}
