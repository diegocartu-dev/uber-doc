import type { Metadata } from "next";
import Link from "next/link";
import { Stethoscope } from "lucide-react";
import TerminosContent from "./TerminosContent";

export const metadata: Metadata = {
  title: "Términos y Condiciones — Docto",
  description: "Términos y Condiciones de Uso de la plataforma de telemedicina Docto.",
};

export default function TerminosPage() {
  return (
    <div className="min-h-full bg-white px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
          <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>docto</span>
        </Link>

        <TerminosContent />

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-block rounded-xl px-6 py-2.5 text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
            style={{ backgroundColor: "#378ADD" }}
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
