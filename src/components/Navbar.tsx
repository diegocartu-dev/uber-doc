import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🩺</span>
            <span className="text-xl font-bold text-gray-900">Uber Doc</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/auth/login"
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/auth/register"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Registrarse
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
