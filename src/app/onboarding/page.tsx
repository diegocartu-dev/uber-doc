import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Stethoscope } from "lucide-react";
import { completarPerfil } from "./actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("nombre_completo, dni, fecha_nacimiento, telefono, sexo_dni")
    .eq("user_id", user.id)
    .maybeSingle();

  const { redirectTo, error } = await searchParams;

  const perfilCompleto =
    paciente?.nombre_completo?.trim() &&
    paciente?.dni?.trim() &&
    paciente?.fecha_nacimiento &&
    paciente?.sexo_dni;

  if (perfilCompleto) {
    const dest =
      redirectTo && redirectTo.startsWith("/") && !redirectTo.includes("://")
        ? redirectTo
        : "/";
    redirect(dest);
  }

  const inputClass =
    "mt-1 block w-full rounded-[var(--radius-md)] border px-3 text-[15px] shadow-sm focus:outline-none";
  const inputStyle = {
    height: 44,
    borderColor: "var(--color-border-strong)",
    color: "var(--color-text-primary)",
  } as React.CSSProperties;

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
          <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>docto</span>
        </div>

        <h1 className="text-center text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Complet&aacute; tu perfil para continuar
        </h1>
        <p className="mt-2 text-center text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Necesitamos estos datos para tu primera consulta.
        </p>

        {error && (
          <div
            className="mt-4 rounded-[var(--radius-md)] p-3 text-sm"
            style={{ backgroundColor: "var(--color-danger-soft)", color: "var(--color-danger)" }}
          >
            {error === "campos_requeridos"
              ? "Todos los campos son obligatorios."
              : "Ocurri\u00f3 un error. Intent\u00e1 de nuevo."}
          </div>
        )}

        <form action={completarPerfil} className="mt-8 space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo ?? "/"} />

          <div>
            <label htmlFor="nombre_completo" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Nombre completo
            </label>
            <input
              id="nombre_completo"
              name="nombre_completo"
              type="text"
              required
              defaultValue={paciente?.nombre_completo ?? ""}
              className={inputClass}
              style={inputStyle}
              placeholder="Juan P\u00e9rez"
            />
          </div>

          <div>
            <label htmlFor="dni" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              DNI
            </label>
            <input
              id="dni"
              name="dni"
              type="text"
              required
              defaultValue={paciente?.dni ?? ""}
              className={inputClass}
              style={inputStyle}
              placeholder="12345678"
            />
          </div>

          <div>
            <label htmlFor="fecha_nacimiento" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Fecha de nacimiento
            </label>
            <input
              id="fecha_nacimiento"
              name="fecha_nacimiento"
              type="date"
              required
              defaultValue={paciente?.fecha_nacimiento ?? ""}
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Sexo según DNI
            </label>
            <div className="mt-1 flex gap-3">
              {([
                { value: "masculino", label: "Masculino" },
                { value: "femenino", label: "Femenino" },
              ] as const).map((opt) => (
                <label
                  key={opt.value}
                  className="flex flex-1 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border px-3 text-[15px] font-medium transition-all has-[:checked]:border-[#378ADD] has-[:checked]:bg-[#378ADD]/5 has-[:checked]:text-[#378ADD]"
                  style={{ height: 44, borderColor: "var(--color-border-strong)", color: "var(--color-text-primary)" }}
                >
                  <input
                    type="radio"
                    name="sexo_dni"
                    value={opt.value}
                    required
                    defaultChecked={paciente?.sexo_dni === opt.value}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="telefono" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Teléfono <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <input
              id="telefono"
              name="telefono"
              type="tel"
              defaultValue={paciente?.telefono ?? ""}
              className={inputClass}
              style={inputStyle}
              placeholder="+54 9 11 1234 5678"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-[var(--radius-md)] text-sm font-semibold text-white shadow-sm active:scale-[0.97] transition-all duration-100"
            style={{ height: 44, backgroundColor: "#378ADD" }}
          >
            Continuar
          </button>
        </form>
      </div>
    </div>
  );
}
