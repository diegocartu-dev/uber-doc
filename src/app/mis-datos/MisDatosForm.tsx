"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PacienteData = {
  id: string;
  nombre_completo: string;
  dni: string | null;
  cuil: string | null;
  fecha_nacimiento: string | null;
  telefono: string | null;
  obra_social: string | null;
  nro_afiliado: string | null;
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

  // Paciente fields
  const [nombre, setNombre] = useState(
    role === "paciente" ? (paciente?.nombre_completo ?? "") : (medico?.nombre_completo ?? "")
  );
  const [telefono, setTelefono] = useState(paciente?.telefono ?? "");
  const [obraSocial, setObraSocial] = useState(paciente?.obra_social ?? "");
  const [nroAfiliado, setNroAfiliado] = useState(paciente?.nro_afiliado ?? "");
  const [fechaNac, setFechaNac] = useState(paciente?.fecha_nacimiento ?? "");

  // Medico fields
  const [domicilio, setDomicilio] = useState(medico?.domicilio ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const supabase = createClient();

    if (role === "paciente" && paciente) {
      const { error: err } = await supabase
        .from("pacientes")
        .update({
          nombre_completo: nombre,
          telefono,
          obra_social: obraSocial || null,
          nro_afiliado: nroAfiliado || null,
          fecha_nacimiento: fechaNac || null,
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
            <label style={labelStyle}>Telefono</label>
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
            <label style={labelStyle}>Obra social</label>
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
              <label style={labelStyle}>Numero de afiliado</label>
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
        </>
      )}

      {/* Medico-specific fields */}
      {role === "medico" && (
        <>
          <div>
            <label style={labelStyle}>Matricula</label>
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
              placeholder="Calle, numero, ciudad"
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

      <button
        type="submit"
        disabled={saving}
        className="w-full text-sm font-semibold text-white transition-all duration-100 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          height: 44,
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--color-primary)",
        }}
      >
        {saving ? "Guardando..." : "Guardar cambios"}
      </button>
    </form>
  );
}
