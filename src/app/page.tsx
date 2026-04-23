import Link from "next/link";
import { Stethoscope, User } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Footer from "@/components/Footer";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  if (code) redirect(`/auth/callback?code=${code}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: medico } = await supabase
      .from("medicos")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (medico) redirect("/dashboard");

    const admin = createAdminClient();
    const { data: paciente } = await admin
      .from("pacientes")
      .select("nombre_completo, dni, fecha_nacimiento, sexo_dni")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!paciente) {
      const fullName = user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "";
      await admin.from("pacientes").insert({
        user_id: user.id,
        nombre_completo: fullName,
        email: user.email ?? null,
      });
      redirect("/onboarding");
    }

    const perfilCompleto =
      paciente.nombre_completo?.trim() &&
      paciente.dni?.trim() &&
      paciente.fecha_nacimiento &&
      paciente.sexo_dni;

    redirect(perfilCompleto ? "/clinica" : "/onboarding");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fff" }}>
      {/* Nav — solo logo */}
      <nav style={{
        padding: "14px 24px",
        borderBottom: "1px solid var(--color-border-default)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
              <path d="M13 8 L13 18 Q13 25 20 25 Q27 25 27 18 L27 8" stroke="#3F7A52" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
              <line x1="20" y1="25" x2="20" y2="30" stroke="#3F7A52" strokeWidth="2.4" strokeLinecap="round"/>
              <circle cx="13" cy="7" r="2.6" fill="#378ADD"/>
              <circle cx="27" cy="7" r="2.6" fill="#378ADD"/>
              <circle cx="20" cy="33" r="3.2" fill="#E88B6A"/>
            </svg>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#111827", letterSpacing: "-0.02em" }}>docto</span>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ textAlign: "center", maxWidth: 640 }}>
          <h1 style={{
            fontSize: "clamp(36px, 5vw, 56px)",
            fontWeight: 700,
            letterSpacing: "-0.035em",
            lineHeight: 1.08,
            margin: "0 0 16px",
            color: "var(--color-text-primary)",
          }}>
            Medicina sin barreras.
          </h1>

          <p style={{
            fontSize: "clamp(16px, 2vw, 20px)",
            lineHeight: 1.5,
            color: "var(--color-text-secondary)",
            margin: "0 0 48px",
          }}>
            El médico que necesitás. El paciente que te necesita.
          </p>

          <div className="entry-buttons" style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            <Link
              href="/medicos"
              className="entry-btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                background: "#D85A30",
                color: "#fff",
                padding: "16px 32px",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <Stethoscope size={20} />
              Soy médico
            </Link>
            <Link
              href="/pacientes"
              className="entry-btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                background: "#378ADD",
                color: "#fff",
                padding: "16px 32px",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <User size={20} />
              Soy paciente
            </Link>
          </div>
        </div>
      </main>

      <Footer />

      <style>{`
        @media (max-width: 560px) {
          .entry-buttons {
            flex-direction: column !important;
          }
          .entry-btn {
            width: 100% !important;
            justify-content: center !important;
          }
        }
      `}</style>
    </div>
  );
}
