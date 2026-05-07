import { Suspense } from "react";
import { Space_Grotesk } from "next/font/google";
import BetaAccessForm from "./BetaAccessForm";

export const metadata = {
  title: "Muy pronto — Docto",
  description: "Estamos preparando algo increíble para médicos y pacientes.",
  robots: { index: false, follow: false },
};

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
});

export default function BetaAccessPage() {
  return (
    <main
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #EBF4FF 0%, #F0FFF8 100%)" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-10 text-center shadow-lg">
        <div className="mb-8">
          <img
            src="/logo-docto.svg"
            alt="Docto"
            className="mx-auto mb-6 h-10"
          />
          <h1
            className={`text-3xl font-bold leading-tight text-gray-900 ${spaceGrotesk.className}`}
          >
            Muy pronto,
            <br />
            el mejor.
          </h1>
          <p className="mt-3 text-sm text-gray-500">
            Estamos preparando algo increíble para médicos y pacientes.
          </p>
        </div>

        <Suspense fallback={<div className="h-[140px]" />}>
          <BetaAccessForm />
        </Suspense>

        <p className="mt-6 text-xs text-gray-400">docto.com.ar</p>
      </div>
    </main>
  );
}
