import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl">
          Tu doctor, a un click de distancia
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-gray-600">
          Conectá con médicos profesionales desde la comodidad de tu hogar.
          Consultas por videollamada, chat y recetas digitales, todo en un solo
          lugar.
        </p>
        <div className="mt-10 flex items-center gap-4">
          <Link
            href="/auth/register"
            className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Comenzar ahora
          </Link>
          <Link
            href="/auth/login"
            className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            Ya tengo cuenta
          </Link>
        </div>

        <div className="mt-20 grid max-w-4xl gap-8 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 p-6 text-left">
            <div className="text-3xl">📹</div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              Videoconsultas
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Hablá cara a cara con tu médico sin salir de casa.
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 p-6 text-left">
            <div className="text-3xl">💬</div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              Chat médico
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Consultá dudas rápidas por mensaje en cualquier momento.
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 p-6 text-left">
            <div className="text-3xl">📋</div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">
              Recetas digitales
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Recibí tus recetas directamente en tu celular.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
