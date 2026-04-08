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
          className="mt-6 max-w-2xl text-lg"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Conecta con medicos profesionales desde la comodidad de tu hogar.
          Consultas por videollamada, chat y recetas digitales, todo en un solo
          lugar.
        </p>
        <div className="mt-10 flex items-center gap-4">
          <Link
            href="/auth/register"
            className="rounded-[var(--radius-md)] px-6 py-3 text-sm font-semibold text-white active:scale-[0.97] transition-all duration-100"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            Comenzar ahora
          </Link>
          <Link
            href="/auth/login"
            className="rounded-[var(--radius-md)] px-6 py-3 text-sm font-semibold transition-colors"
            style={{
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-text-primary)",
            }}
          >
            Ya tengo cuenta
          </Link>
        </div>

        <div className="mt-20 grid max-w-4xl gap-8 sm:grid-cols-3">
          <div
            className="rounded-[var(--radius-lg)] p-6 text-left transition hover:shadow-[var(--shadow-xs)]"
            style={{ border: "1px solid var(--color-border-default)" }}
          >
            <Video size={32} strokeWidth={1.75} style={{ color: "var(--color-brand)" }} />
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
              Habla cara a cara con tu medico sin salir de casa.
            </p>
          </div>
          <div
            className="rounded-[var(--radius-lg)] p-6 text-left transition hover:shadow-[var(--shadow-xs)]"
            style={{ border: "1px solid var(--color-border-default)" }}
          >
            <MessageCircle size={32} strokeWidth={1.75} style={{ color: "var(--color-brand)" }} />
            <h3
              className="mt-4 text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Chat medico
            </h3>
            <p
              className="mt-2 text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Consulta dudas rapidas por mensaje en cualquier momento.
            </p>
          </div>
          <div
            className="rounded-[var(--radius-lg)] p-6 text-left transition hover:shadow-[var(--shadow-xs)]"
            style={{ border: "1px solid var(--color-border-default)" }}
          >
            <FileText size={32} strokeWidth={1.75} style={{ color: "var(--color-brand)" }} />
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
              Recibi tus recetas directamente en tu celular.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
