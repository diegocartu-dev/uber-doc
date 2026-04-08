import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Video, MessageCircle, FileText } from "lucide-react";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <h1
          className="text-5xl font-bold tracking-tight sm:text-6xl"
          style={{ color: "var(--color-text-primary)" }}
        >
          Tu doctor, a un click de distancia
        </h1>
        <p
          className="mt-6 max-w-2xl"
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "15px",
            lineHeight: "1.6",
          }}
        >
          Conectá con médicos profesionales desde la comodidad de tu hogar.
          Consultas por videollamada, chat y recetas digitales, todo en un solo
          lugar.
        </p>
        <div className="mt-10 flex items-center gap-4">
          <Link
            href="/auth/register"
            className="btn-primary px-6 py-3 text-sm font-semibold text-white active:scale-[0.97] transition-all duration-100"
            style={{
              borderRadius: "var(--radius-md)",
            }}
          >
            Comenzar ahora
          </Link>
          <Link
            href="/auth/login"
            className="px-6 py-3 text-sm font-semibold transition-colors"
            style={{
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-text-primary)",
              borderRadius: "var(--radius-md)",
            }}
          >
            Ya tengo cuenta
          </Link>
        </div>

        <div className="mt-20 grid max-w-4xl gap-8 sm:grid-cols-3">
          <div
            className="p-6 text-left transition hover:shadow-[var(--shadow-sm)]"
            style={{
              border: "1px solid var(--color-border-default)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <Video
              size={32}
              strokeWidth={1.75}
              style={{ color: "var(--color-brand)" }}
            />
            <h3
              className="mt-4 text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Videoconsultas
            </h3>
            <p
              className="mt-2 text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Hablá cara a cara con tu médico sin salir de casa.
            </p>
          </div>
          <div
            className="p-6 text-left transition hover:shadow-[var(--shadow-sm)]"
            style={{
              border: "1px solid var(--color-border-default)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <MessageCircle
              size={32}
              strokeWidth={1.75}
              style={{ color: "var(--color-brand)" }}
            />
            <h3
              className="mt-4 text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Chat médico
            </h3>
            <p
              className="mt-2 text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Consultá dudas rápidas por mensaje en cualquier momento.
            </p>
          </div>
          <div
            className="p-6 text-left transition hover:shadow-[var(--shadow-sm)]"
            style={{
              border: "1px solid var(--color-border-default)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <FileText
              size={32}
              strokeWidth={1.75}
              style={{ color: "var(--color-brand)" }}
            />
            <h3
              className="mt-4 text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Recetas digitales
            </h3>
            <p
              className="mt-2 text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Recibí tus recetas directamente en tu celular.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
