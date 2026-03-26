import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/app/dashboard/LogoutButton";
import GrillaEspecialidades from "./GrillaEspecialidades";

export default async function ClinicaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const fullName = user.user_metadata?.full_name || user.email;

  const { data: medicos } = await supabase
    .from("medicos")
    .select("especialidad, modalidad_atencion, nombre_completo");

  return (
    <div className="min-h-full bg-gray-50">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🩺</span>
            <span className="text-xl font-bold text-gray-900">Uber Doc</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Dashboard
            </Link>
            <span className="text-sm text-gray-600">Hola, {fullName}</span>
            <LogoutButton />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Clínica Virtual</h1>
          <p className="mt-2 text-gray-600">
            Elegí una especialidad para consultar con un médico.
          </p>
        </div>

        <GrillaEspecialidades medicos={medicos ?? []} />
      </main>
    </div>
  );
}
