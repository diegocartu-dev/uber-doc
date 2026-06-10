"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import LoadingButton from "@/components/ui/LoadingButton";

type PacienteData = {
  id: string;
  nombre_completo: string;
  dni: string | null;
  cuil: string | null;
  fecha_nacimiento: string | null;
  telefono: string | null;
  tiene_cobertura: boolean | null;
  obra_social: string | null;
  obra_social_id: string | null;
  obra_social_otra: string | null;
  // Nombre ya resuelto (FK > otra > legacy) para mostrar/prefilear.
  obra_social_resuelta: string | null;
  nro_afiliado: string | null;
  plan_obra_social: string | null;
} | null;

type MedicoData = {
  id: string;
  nombre_completo: string;
  especialidad: string;
  numero_matricula: string;
  tipo_matricula: string;
  domicilio: string | null;
  precio_consulta: number;
  duracion_consulta: number;
  slug: string | null;
} | null;

type Props = {
  role: "paciente" | "medico";
  email: string;
  paciente: PacienteData;
  medico: MedicoData;
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--color-text-secondary)",
  marginBottom: 6,
  display: "block",
};

const inputStyle: React.CSSProperties = {
  height: 44,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border-strong)",
  padding: "0 12px",
  fontSize: 15,
  color: "var(--color-text-primary)",
  backgroundColor: "var(--color-bg-primary)",
  width: "100%",
  outline: "none",
};

const disabledInputStyle: React.CSSProperties = {
  ...inputStyle,
  backgroundColor: "var(--color-bg-tertiary)",
  color: "var(--color-text-secondary)",
  cursor: "not-allowed",
};

export default function MisDatosForm({ role, email, paciente, medico }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);

  // Paciente fields
  const [nombre, setNombre] = useState(
    role === "paciente" ? (paciente?.nombre_completo ?? "") : (medico?.nombre_completo ?? "")
  );
  const [telefono, setTelefono] = useState(paciente?.telefono ?? "");
  // Prefilear con el nombre RESUELTO (FK/otra/legacy), no solo el legacy.
  const [obraSocial, setObraSocial] = useState(paciente?.obra_social_resuelta ?? "");
  const [nroAfiliado, setNroAfiliado] = useState(paciente?.nro_afiliado ?? "");
  const [planObraSocial, setPlanObraSocial] = useState(paciente?.plan_obra_social ?? "");
  const [fechaNac, setFechaNac] = useState(paciente?.fecha_nacimiento ?? "");
  const [cuil, setCuil] = useState(paciente?.cuil ?? "");

  // Medico fields
  const [domicilio, setDomicilio] = useState(medico?.domicilio ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const supabase = createClient();

    if (role === "paciente" && paciente) {
      const tieneOS = !!obraSocial.trim();
      // Escribir en las columnas que la app realmente lee (obra_social_otra está
      // en la cadena de resolución FK > otra > legacy). Como acá editamos texto
      // libre, limpiamos el FK (obra_social_id) y sincronizamos el legacy.
      const { error: err } = await supabase
        .from("pacientes")
        .update({
          nombre_completo: nombre,
          telefono,
          cuil: cuil || null,
          fecha_nacimiento: fechaNac || null,
          tiene_cobertura: tieneOS,
          obra_social: tieneOS ? obraSocial.trim() : null,
          obra_social_otra: tieneOS ? obraSocial.trim() : null,
          obra_social_id: null,
          nro_afiliado: tieneOS ? (nroAfiliado.trim() || null) : null,
          plan_obra_social: tieneOS ? (planObraSocial.trim() || null) : null,
        })
        .eq("id", paciente.id);

      if (err) {
        setError("No se pudieron guardar los cambios: " + err.message);
        setSaving(false);
        return;
      }
    }

    if (role === "medico" && medico) {
      const { error: err } = await supabase
        .from("medicos")
        .update({
          nombre_completo: nombre,
          domicilio: domicilio || null,
        })
        .eq("id", medico.id);

      if (err) {
        setError("No se pudieron guardar los cambios: " + err.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      {error && (
        <div
          className="rounded-[var(--radius-md)] p-3 text-sm"
          style={{
            backgroundColor: "var(--color-danger-soft)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      {saved && (
        <div
          className="rounded-[var(--radius-md)] p-3 text-sm"
          style={{
            backgroundColor: "var(--color-success-soft)",
            color: "var(--color-success)",
          }}
        >
          Cambios guardados correctamente
        </div>
      )}

      {/* Email - always read-only */}
      <div>
        <label style={labelStyle}>Email</label>
        <input type="email" value={email} disabled style={disabledInputStyle} />
      </div>

      {/* Nombre */}
      <div>
        <label style={labelStyle}>Nombre completo</label>
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--color-primary)";
            e.currentTarget.style.boxShadow = "var(--shadow-focus)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border-strong)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
      </div>

      {/* Paciente-specific fields */}
      {role === "paciente" && (
        <>
          <div>
            <label style={labelStyle}>DNI</label>
            <input type="text" value={paciente?.dni ?? ""} disabled style={disabledInputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Fecha de nacimiento</label>
            <input
              type="date"
              value={fechaNac}
              onChange={(e) => setFechaNac(e.target.value)}
              style={inputStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-primary)";
                e.currentTarget.style.boxShadow = "var(--shadow-focus)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          <div>
            <label style={labelStyle}>Teléfono</label>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              style={inputStyle}
              placeholder="11 2345-6789"
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-primary)";
                e.currentTarget.style.boxShadow = "var(--shadow-focus)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          <div>
            <label style={labelStyle}>
              CUIL
              {!cuil && (
                <span
                  className="inline-block h-2 w-2 rounded-full ml-1.5 align-middle"
                  style={{ backgroundColor: "#D85A30" }}
                />
              )}
            </label>
            <input
              type="text"
              value={cuil}
              onChange={(e) => setCuil(e.target.value)}
              style={inputStyle}
              placeholder="20-12345678-9"
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-primary)";
                e.currentTarget.style.boxShadow = "var(--shadow-focus)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Obra social
              {!obraSocial && (
                <span
                  className="inline-block h-2 w-2 rounded-full ml-1.5 align-middle"
                  style={{ backgroundColor: "#D85A30" }}
                />
              )}
            </label>
            <input
              type="text"
              value={obraSocial}
              onChange={(e) => setObraSocial(e.target.value)}
              style={inputStyle}
              placeholder="Ej: OSDE, Swiss Medical"
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-primary)";
                e.currentTarget.style.boxShadow = "var(--shadow-focus)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {obraSocial && (
            <div>
              <label style={labelStyle}>
                N&uacute;mero de afiliado
                {!nroAfiliado && (
                  <span
                    className="inline-block h-2 w-2 rounded-full ml-1.5 align-middle"
                    style={{ backgroundColor: "#D85A30" }}
                  />
                )}
              </label>
              <input
                type="text"
                value={nroAfiliado}
                onChange={(e) => setNroAfiliado(e.target.value)}
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-primary)";
                  e.currentTarget.style.boxShadow = "var(--shadow-focus)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border-strong)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
          )}

          {obraSocial && (
            <div>
              <label style={labelStyle}>Plan (opcional)</label>
              <input
                type="text"
                value={planObraSocial}
                onChange={(e) => setPlanObraSocial(e.target.value)}
                style={inputStyle}
                placeholder="Ej: 210, Plata, Plan 4000"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-primary)";
                  e.currentTarget.style.boxShadow = "var(--shadow-focus)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border-strong)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
          )}
        </>
      )}

      {/* Medico-specific fields */}
      {role === "medico" && (
        <>
          <div>
            <label style={labelStyle}>Matrícula</label>
            <input
              type="text"
              value={`${medico?.tipo_matricula ?? ""} ${medico?.numero_matricula ?? ""}`.trim()}
              disabled
              style={disabledInputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Especialidad</label>
            <input
              type="text"
              value={medico?.especialidad ?? ""}
              disabled
              style={disabledInputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Domicilio profesional</label>
            <input
              type="text"
              value={domicilio}
              onChange={(e) => setDomicilio(e.target.value)}
              style={inputStyle}
              placeholder="Calle, número, ciudad"
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-primary)";
                e.currentTarget.style.boxShadow = "var(--shadow-focus)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>
        </>
      )}

      <LoadingButton
        type="submit"
        isLoading={saving}
        className="w-full text-sm font-semibold text-white transition-all duration-100 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          height: 44,
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--color-primary)",
        }}
      >
        Guardar cambios
      </LoadingButton>

      {/* Mi link — solo médicos con slug */}
      {role === "medico" && medico?.slug && (
        <div
          className="mt-8 rounded-[var(--radius-lg)] p-5"
          style={{
            border: "1px solid var(--color-border-default)",
            backgroundColor: "var(--color-bg-primary)",
          }}
        >
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Mi consultorio virtual
          </p>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Compartí este link con tus pacientes para que te consulten directamente por Docto.
          </p>

          <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : "https://docto.com.ar"}/dr/${medico.slug}`}
              style={{
                ...disabledInputStyle,
                fontSize: 13,
                cursor: "text",
              }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}/dr/${medico.slug}`;
                navigator.clipboard.writeText(url);
                setLinkCopiado(true);
                setTimeout(() => setLinkCopiado(false), 2000);
              }}
              className="shrink-0 w-full sm:w-auto rounded-[var(--radius-md)] px-4 text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
              style={{
                height: 44,
                backgroundColor: linkCopiado ? "var(--color-success)" : "var(--color-primary)",
              }}
            >
              {linkCopiado ? "Copiado!" : "Copiar link"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
