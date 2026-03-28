import Link from "next/link";

export default function RegisterPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="text-3xl">🩺</span>
          <span className="text-2xl font-bold text-gray-900">Uber Doc</span>
        </Link>

        <h2 className="text-center text-xl font-medium text-gray-900">
          ¿Cómo querés usar Uber Doc?
        </h2>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href="/auth/registro-medico"
            className="rounded-xl bg-white p-6 text-center transition hover:shadow-md"
            style={{ border: "0.5px solid #e5e7eb" }}
          >
            <div className="flex items-center justify-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2v4a6 6 0 0 0 12 0V2"/>
                <path d="M6 2H4a2 2 0 0 0-2 2v1a6 6 0 0 0 6 6"/>
                <path d="M18 2h2a2 2 0 0 1 2 2v1a6 6 0 0 1-6 6"/>
                <path d="M12 11v4"/>
                <path d="M12 15a4 4 0 0 0 4 4h0a4 4 0 0 0 4-4v-2"/>
                <circle cx="20" cy="13" r="1.5" fill="#1D9E75"/>
              </svg>
            </div>
            <p className="mt-4 text-sm font-medium text-gray-900">Soy médico</p>
            <p className="mt-1 text-xs text-gray-500">
              Ofrecé consultas online a tus pacientes
            </p>
          </Link>

          <Link
            href="/auth/registro-paciente"
            className="rounded-xl bg-white p-6 text-center transition hover:shadow-md"
            style={{ border: "0.5px solid #e5e7eb" }}
          >
            <div className="flex items-center justify-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0C447C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="7" r="3"/>
                <path d="M4 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/>
                <line x1="19" y1="2" x2="19" y2="12"/>
                <circle cx="19" cy="13.5" r="1.5" fill="#0C447C" stroke="#0C447C"/>
                <line x1="21" y1="5" x2="23" y2="5"/>
                <line x1="21" y1="8" x2="23" y2="8"/>
              </svg>
            </div>
            <p className="mt-4 text-sm font-medium text-gray-900">Soy paciente</p>
            <p className="mt-1 text-xs text-gray-500">
              Consultá médicos desde tu casa
            </p>
          </Link>
        </div>

        <p className="mt-8 text-center text-sm text-gray-600">
          ¿Ya tenés cuenta?{" "}
          <Link href="/auth/login" className="font-medium text-blue-600 hover:text-blue-500">
            Iniciá sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
