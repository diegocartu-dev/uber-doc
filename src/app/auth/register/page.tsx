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
            <span className="text-4xl">🧑‍⚕��</span>
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
            <span className="text-4xl">👤</span>
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
