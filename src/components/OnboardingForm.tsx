"use client";

import { useState, useRef, useEffect } from "react";
import { completarPerfil } from "@/app/onboarding/actions";
import ModalTerminos from "@/components/ModalTerminos";
import { separarNombreCompleto } from "@/lib/pacientes/nombre";

type ObraSocialOption = {
  id: string;
  nombre: string;
  planes: { id: string; nombre: string }[];
};

type ObrasSocialesData = {
  prepagas: ObraSocialOption[];
  obras_sociales: ObraSocialOption[];
};

type PacienteData = {
  nombre_completo: string | null;
  // Partidos desde el 23/08/2026. NULL en filas anteriores: se prefilean
  // partiendo el compuesto y la persona confirma.
  nombre?: string | null;
  apellido?: string | null;
  dni: string | null;
  fecha_nacimiento: string | null;
  sexo_dni: string | null;
  tiene_cobertura: boolean | null;
  obra_social: string | null;
  obra_social_id: string | null;
  obra_social_otra: string | null;
  nro_afiliado: string | null;
  plan_obra_social: string | null;
  telefono: string | null;
};

type Props = {
  paciente: PacienteData | null;
  redirectTo: string;
  error?: string | null;
};

type FieldErrors = {
  nombre?: string;
  apellido?: string;
  dni?: string;
  fecha_nacimiento?: string;
  sexo_dni?: string;
  telefono?: string;
  nro_afiliado?: string;
};

// Special values for the select
const VALOR_PARTICULAR = "__particular__";
const VALOR_OTRA = "__otra__";

export default function OnboardingForm({ paciente, redirectTo, error: serverError }: Props) {
  // Determine initial cobertura state from existing data
  const initialObraId = paciente?.obra_social_id ?? null;
  const initialObraOtra = paciente?.obra_social_otra ?? null;
  const initialTieneCobertura = paciente?.tiene_cobertura ?? false;

  // Select value: obra_social_id, "__otra__", "__particular__", or ""
  const initialSelectValue = initialObraId
    ? initialObraId
    : initialObraOtra
      ? VALOR_OTRA
      : initialTieneCobertura
        ? VALOR_OTRA // tiene_cobertura=true but no ID = legacy "otra"
        : VALOR_PARTICULAR;

  const [obrasSociales, setObrasSociales] = useState<ObrasSocialesData | null>(null);
  const [selectValue, setSelectValue] = useState(initialSelectValue);
  const [planesDisponibles, setPlanesDisponibles] = useState<{ id: string; nombre: string }[]>([]);
  const [planValue, setPlanValue] = useState(paciente?.plan_obra_social ?? "");
  const [obraOtraNombre, setObraOtraNombre] = useState(initialObraOtra ?? paciente?.obra_social ?? "");
  const [obraOtraPlan, setObraOtraPlan] = useState("");
  const [nroAfiliado, setNroAfiliado] = useState(paciente?.nro_afiliado ?? "");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [checkTerminos, setCheckTerminos] = useState(false);
  const [checkDatosSensibles, setCheckDatosSensibles] = useState(false);
  const [modalTerminos, setModalTerminos] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Fetch obras sociales on mount
  useEffect(() => {
    fetch("/api/obras-sociales")
      .then((r) => r.json())
      .then((data: ObrasSocialesData) => {
        setObrasSociales(data);
        // If paciente already has an obra_social_id, find its planes
        if (initialObraId) {
          const all = [...data.prepagas, ...data.obras_sociales];
          const found = all.find((os) => os.id === initialObraId);
          if (found?.planes.length) {
            setPlanesDisponibles(found.planes);
          }
        }
      })
      .catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived state
  const tieneCobertura = selectValue !== VALOR_PARTICULAR;
  const esOtra = selectValue === VALOR_OTRA;
  const esObraConcreto = tieneCobertura && !esOtra;

  function handleObraChange(value: string) {
    setSelectValue(value);
    setPlanValue("");
    setPlanesDisponibles([]);

    if (value !== VALOR_PARTICULAR && value !== VALOR_OTRA && obrasSociales) {
      const all = [...obrasSociales.prepagas, ...obrasSociales.obras_sociales];
      const found = all.find((os) => os.id === value);
      if (found?.planes.length) {
        setPlanesDisponibles(found.planes);
      }
    }
  }

  // DD/MM/AAAA → ISO, o null si no es una fecha real. La fuente de verdad es
  // el campo VISIBLE: el espejo oculto solo se sincronizaba en onChange, así que
  // autocompletar de Safari o volver-atrás (el navegador restaura lo visible
  // pero no lo oculto) dejaban la fecha en rojo con un valor perfecto a la
  // vista, y había que "tocar algún número" para despertarla (bug Diego 21/07).
  function parseFechaDisplay(v: string): string | null {
    const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (
      d.getDate() === Number(dd) &&
      d.getMonth() === Number(mm) - 1 &&
      d.getFullYear() === Number(yyyy) &&
      d <= new Date() &&
      d.getFullYear() > 1900
    ) {
      return `${yyyy}-${mm}-${dd}`;
    }
    return null;
  }

  function validate(): FieldErrors {
    const form = formRef.current;
    if (!form) return {};

    const errs: FieldErrors = {};
    const nombre = (form.elements.namedItem("nombre") as HTMLInputElement)?.value?.trim();
    const apellido = (form.elements.namedItem("apellido") as HTMLInputElement)?.value?.trim();
    const dni = (form.elements.namedItem("dni") as HTMLInputElement)?.value?.trim();
    const sexo = (form.elements.namedItem("sexo_dni") as RadioNodeList)?.value;

    // Los dos obligatorios (Diego, 22/08/2026): con un solo campo "nombre
    // completo" una paciente se registró con el nombre de pila y sus documentos
    // salieron —y se sellaron— sin apellido.
    if (!nombre) errs.nombre = "Ingresá tu nombre.";
    if (!apellido) errs.apellido = "Ingresá tu apellido.";
    if (!dni) {
      errs.dni = "Ingresá tu DNI.";
    } else if (!/^\d{7,8}$/.test(dni)) {
      errs.dni = "El DNI debe tener 7 u 8 números, sin puntos.";
    }
    // Fecha: parsear LO QUE SE VE y sincronizar el oculto acá mismo — cualquier
    // camino que haya llenado el visible sin onChange queda cubierto.
    const displayEl = document.getElementById("fecha_nacimiento_display") as HTMLInputElement | null;
    const hidden = document.getElementById("fecha_nacimiento") as HTMLInputElement | null;
    const fechaIso = parseFechaDisplay(displayEl?.value ?? "");
    if (fechaIso && hidden) hidden.value = fechaIso;
    if (!fechaIso) {
      errs.fecha_nacimiento = displayEl?.value?.trim()
        ? "Revisá la fecha: tiene que ser una fecha real en formato DD/MM/AAAA."
        : "Ingresá tu fecha de nacimiento (DD/MM/AAAA).";
    }
    if (!sexo) errs.sexo_dni = "Seleccioná tu sexo según DNI.";

    const telefono = (form.elements.namedItem("telefono") as HTMLInputElement)?.value?.trim();
    if (!telefono) {
      errs.telefono = "Ingresá tu teléfono de contacto.";
    } else if (telefono.replace(/\D/g, "").length < 8) {
      errs.telefono = "Ingresá un teléfono válido (al menos 8 dígitos).";
    }

    // Si declaró cobertura (no es particular), el nro de afiliado es obligatorio.
    if (tieneCobertura && !nroAfiliado.trim()) {
      errs.nro_afiliado = "Ingresá tu número de afiliado.";
    }

    return errs;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const errs = validate();
    setErrors(errs);

    if (Object.keys(errs).length > 0) {
      e.preventDefault();
      // El error puede quedar fuera de pantalla (form largo en mobile) y el
      // toque parece "muerto" → llevar al usuario al primer campo con error.
      const anclas: Record<string, string> = {
        nombre: "nombre",
        apellido: "apellido",
        dni: "dni",
        fecha_nacimiento: "fecha_nacimiento_display",
        sexo_dni: "fecha_nacimiento_display",
        telefono: "telefono",
        nro_afiliado: "nro_afiliado",
      };
      const primera = Object.keys(anclas).find((k) => k in errs);
      const el = primera ? document.getElementById(anclas[primera]) : null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSubmitting(true);
    setTimeout(() => setSubmitting(false), 15000);
  }

  const inputClass =
    "mt-1 block w-full rounded-xl border px-3 text-[15px] shadow-sm focus:outline-none focus:border-[#378ADD] focus:ring-1 focus:ring-[#378ADD]/30";
  const inputStyle = {
    height: 44,
    borderColor: "#e5e7eb",
    color: "#1a1a1a",
  } as React.CSSProperties;
  const inputErrorStyle = {
    ...inputStyle,
    borderColor: "#E24B4A",
  };

  return (
    <>
      {serverError && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-[#E24B4A]">
          {serverError === "campos_requeridos"
            ? "Completá todos los campos: nombre, DNI, fecha de nacimiento, sexo, teléfono y —si tenés cobertura— el número de afiliado."
            : serverError === "dni_duplicado"
              ? "No pudimos guardar tu información. Si el problema persiste, escribinos a soporte@docto.com.ar."
              : "Ocurrió un error. Intentá de nuevo."}
        </div>
      )}

      <form
        ref={formRef}
        action={completarPerfil}
        onSubmit={handleSubmit}
        className="mt-8 space-y-4"
      >
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <input type="hidden" name="tiene_cobertura" value={tieneCobertura ? "true" : "false"} />
        {/* Hidden fields for the server action */}
        {esObraConcreto && <input type="hidden" name="obra_social_id" value={selectValue} />}
        {esOtra && <input type="hidden" name="obra_social_otra" value={obraOtraNombre} />}
        {esOtra && obraOtraPlan && <input type="hidden" name="plan_obra_social" value={obraOtraPlan} />}
        {esObraConcreto && planValue && <input type="hidden" name="plan_obra_social" value={planValue} />}

        {/* ── Nombre y apellido, por separado y los dos obligatorios ──
            Si la ficha es anterior y no los tiene partidos, se prefilea
            partiendo el compuesto: la persona confirma o corrige. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="nombre" className="block text-[13px] font-medium text-gray-500">
              Nombre
            </label>
            <input
              id="nombre"
              name="nombre"
              type="text"
              required
              autoComplete="given-name"
              defaultValue={paciente?.nombre ?? separarNombreCompleto(paciente?.nombre_completo).nombre}
              className={inputClass}
              style={errors.nombre ? inputErrorStyle : inputStyle}
              placeholder="Juan"
              onChange={() => errors.nombre && setErrors((e) => ({ ...e, nombre: undefined }))}
            />
            {errors.nombre && (
              <p className="mt-1 text-[13px] text-[#E24B4A]">{errors.nombre}</p>
            )}
          </div>
          <div>
            <label htmlFor="apellido" className="block text-[13px] font-medium text-gray-500">
              Apellido
            </label>
            <input
              id="apellido"
              name="apellido"
              type="text"
              required
              autoComplete="family-name"
              defaultValue={paciente?.apellido ?? separarNombreCompleto(paciente?.nombre_completo).apellido}
              className={inputClass}
              style={errors.apellido ? inputErrorStyle : inputStyle}
              placeholder="Pérez"
              onChange={() => errors.apellido && setErrors((e) => ({ ...e, apellido: undefined }))}
            />
            {errors.apellido && (
              <p className="mt-1 text-[13px] text-[#E24B4A]">{errors.apellido}</p>
            )}
          </div>
        </div>

        {/* ── DNI ── */}
        <div>
          <label htmlFor="dni" className="block text-[13px] font-medium text-gray-500">
            DNI
          </label>
          <input
            id="dni"
            name="dni"
            type="text"
            required
            inputMode="numeric"
            pattern="\d{7,8}"
            maxLength={8}
            defaultValue={paciente?.dni ?? ""}
            className={inputClass}
            style={errors.dni ? inputErrorStyle : inputStyle}
            placeholder="12345678"
            onChange={() => errors.dni && setErrors((e) => ({ ...e, dni: undefined }))}
          />
          {errors.dni && (
            <p className="mt-1 text-[13px] text-[#E24B4A]">{errors.dni}</p>
          )}
        </div>

        {/* ── Fecha de nacimiento ── */}
        <div>
          <label htmlFor="fecha_nacimiento_display" className="block text-[13px] font-medium text-gray-500">
            Fecha de nacimiento
          </label>
          <input
            id="fecha_nacimiento_display"
            type="text"
            inputMode="numeric"
            placeholder="DD/MM/AAAA"
            defaultValue={
              paciente?.fecha_nacimiento
                ? (() => {
                    const [y, m, d] = paciente.fecha_nacimiento.split("-");
                    return `${d}/${m}/${y}`;
                  })()
                : ""
            }
            className={inputClass}
            style={errors.fecha_nacimiento ? inputErrorStyle : inputStyle}
            onChange={(e) => {
              if (errors.fecha_nacimiento) setErrors((prev) => ({ ...prev, fecha_nacimiento: undefined }));
              // Auto-format: add slashes as user types
              let v = e.target.value.replace(/[^\d/]/g, "");
              const digits = v.replace(/\//g, "");
              if (digits.length >= 2 && !v.includes("/")) {
                v = digits.slice(0, 2) + "/" + digits.slice(2);
              }
              if (digits.length >= 4 && v.split("/").length < 3) {
                const parts = v.split("/");
                v = parts[0] + "/" + (parts[1] || "").slice(0, 2) + "/" + (parts[1] || "").slice(2);
              }
              if (v.length > 10) v = v.slice(0, 10);
              e.target.value = v;
              // Update hidden field with ISO format
              const hidden = document.getElementById("fecha_nacimiento") as HTMLInputElement;
              if (hidden && /^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
                const [dd, mm, yyyy] = v.split("/");
                const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
                if (d.getDate() === Number(dd) && d.getMonth() === Number(mm) - 1 && d.getFullYear() === Number(yyyy) && d <= new Date() && d.getFullYear() > 1900) {
                  hidden.value = `${yyyy}-${mm}-${dd}`;
                } else {
                  hidden.value = "";
                }
              } else if (hidden) {
                hidden.value = "";
              }
            }}
          />
          <input type="hidden" id="fecha_nacimiento" name="fecha_nacimiento" defaultValue={paciente?.fecha_nacimiento ?? ""} />
          {errors.fecha_nacimiento && (
            <p className="mt-1 text-[13px] text-[#E24B4A]">{errors.fecha_nacimiento}</p>
          )}
        </div>

        {/* ── Sexo según DNI ── */}
        <div>
          <label className="block text-[13px] font-medium text-gray-500">
            Sexo (según DNI)
          </label>
          <div className="mt-1 grid grid-cols-2 gap-3">
            {(["femenino", "masculino"] as const).map((opt) => (
              <label
                key={opt}
                className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border px-3 text-[15px] font-medium text-gray-500 transition-all has-[:checked]:border-[#378ADD] has-[:checked]:bg-[#378ADD]/10 has-[:checked]:text-[#378ADD]"
                style={{
                  height: 44,
                  borderColor: errors.sexo_dni ? "#E24B4A" : "#e5e7eb",
                }}
              >
                <input
                  type="radio"
                  name="sexo_dni"
                  value={opt}
                  required
                  defaultChecked={paciente?.sexo_dni === opt}
                  className="sr-only"
                  onChange={() => errors.sexo_dni && setErrors((e) => ({ ...e, sexo_dni: undefined }))}
                />
                {opt === "femenino" ? "Femenino" : "Masculino"}
              </label>
            ))}
          </div>
          {errors.sexo_dni && (
            <p className="mt-1 text-[13px] text-[#E24B4A]">{errors.sexo_dni}</p>
          )}
        </div>

        {/* ── Teléfono ── */}
        <div>
          <label htmlFor="telefono" className="block text-[13px] font-medium text-gray-500">
            Teléfono
          </label>
          <input
            id="telefono"
            name="telefono"
            type="tel"
            inputMode="tel"
            required
            defaultValue={paciente?.telefono ?? ""}
            className={inputClass}
            style={errors.telefono ? inputErrorStyle : inputStyle}
            placeholder="11 2345-6789"
            onChange={() => errors.telefono && setErrors((e) => ({ ...e, telefono: undefined }))}
          />
          {errors.telefono && (
            <p className="mt-1 text-[13px] text-[#E24B4A]">{errors.telefono}</p>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* ── COBERTURA MÉDICA (PR2) ── */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="pt-2">
          <label htmlFor="obra_social_select" className="block text-[13px] font-medium text-gray-500">
            Obra social o prepaga
          </label>
          <p className="mt-1 mb-1.5 text-[12px] leading-snug text-gray-400">
            Estos datos figuran en tu receta y te sirven para gestionar un reintegro si tu obra social lo permite. La consulta se abona de forma particular.
          </p>
          <select
            id="obra_social_select"
            value={selectValue}
            onChange={(e) => handleObraChange(e.target.value)}
            className={inputClass}
            style={{
              ...inputStyle,
              appearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
              paddingRight: 36,
            }}
          >
            <option value={VALOR_PARTICULAR}>No tengo / No incluir</option>
            {obrasSociales ? (
              <>
                <optgroup label="Prepagas">
                  {obrasSociales.prepagas.map((os) => (
                    <option key={os.id} value={os.id}>
                      {os.nombre}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Obras Sociales">
                  {obrasSociales.obras_sociales.map((os) => (
                    <option key={os.id} value={os.id}>
                      {os.nombre}
                    </option>
                  ))}
                </optgroup>
              </>
            ) : (
              <option disabled>Cargando...</option>
            )}
            <option value={VALOR_OTRA}>Otra (no está en la lista)</option>
          </select>

          {/* ── Campos condicionales: Plan (si la OOSS tiene planes) ── */}
          <div
            className="overflow-hidden transition-all duration-200"
            style={{
              maxHeight: esObraConcreto && planesDisponibles.length > 0 ? 80 : 0,
              opacity: esObraConcreto && planesDisponibles.length > 0 ? 1 : 0,
            }}
          >
            <div className="mt-3">
              <label className="mb-1.5 block text-[13px] text-gray-500">Plan</label>
              <select
                value={planValue}
                onChange={(e) => setPlanValue(e.target.value)}
                className={inputClass}
                style={{
                  ...inputStyle,
                  appearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                  paddingRight: 36,
                }}
              >
                <option value="">Sin especificar</option>
                {planesDisponibles.map((p) => (
                  <option key={p.id} value={p.nombre}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Campos condicionales: Nro Afiliado (siempre si tiene cobertura) ── */}
          <div
            className="overflow-hidden transition-all duration-200"
            style={{
              maxHeight: tieneCobertura ? (errors.nro_afiliado ? 120 : 80) : 0,
              opacity: tieneCobertura ? 1 : 0,
            }}
          >
            <div className="mt-3">
              <label className="mb-1.5 block text-[13px] text-gray-500">Nro. de afiliado</label>
              <input
                type="text"
                id="nro_afiliado"
            name="nro_afiliado"
                value={nroAfiliado}
                onChange={(e) => { setNroAfiliado(e.target.value); if (errors.nro_afiliado) setErrors((er) => ({ ...er, nro_afiliado: undefined })); }}
                placeholder="Número de afiliado"
                className={inputClass}
                style={errors.nro_afiliado ? inputErrorStyle : inputStyle}
              />
              {errors.nro_afiliado && (
                <p className="mt-1 text-[13px] text-[#E24B4A]">{errors.nro_afiliado}</p>
              )}
            </div>
          </div>

          {/* ── Campos "Otra": nombre libre + plan libre ── */}
          <div
            className="overflow-hidden transition-all duration-200"
            style={{
              maxHeight: esOtra ? 170 : 0,
              opacity: esOtra ? 1 : 0,
            }}
          >
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1.5 block text-[13px] text-gray-500">Nombre de la obra social</label>
                <input
                  type="text"
                  value={obraOtraNombre}
                  onChange={(e) => setObraOtraNombre(e.target.value)}
                  placeholder="Ej: OSECAC, OSPRERA..."
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] text-gray-500">Plan (opcional)</label>
                <input
                  type="text"
                  value={obraOtraPlan}
                  onChange={(e) => setObraOtraPlan(e.target.value)}
                  placeholder="Ej: Plan 1000, Oro..."
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Términos y condiciones ── */}
        <div className="pt-2">
          <label className="flex items-start gap-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={checkTerminos}
              onChange={(e) => setCheckTerminos(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">
              Leí y acepto los{" "}
              <button type="button" onClick={() => setModalTerminos(true)} className="font-medium underline" style={{ color: "#378ADD" }}>
                Términos y Condiciones
              </button>{" "}
              de Docto
            </span>
          </label>
        </div>

        {/* ── Consentimiento datos sensibles (Ley 25.326) ── */}
        <div>
          <label className="flex items-start gap-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={checkDatosSensibles}
              onChange={(e) => setCheckDatosSensibles(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">
              Autorizo a Docto a tratar mis datos de salud (motivos de consulta, diagnósticos, recetas, historia clínica) conforme a la{" "}
              <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="font-medium underline" style={{ color: "#378ADD" }}>
                Política de Privacidad
              </a>
            </span>
          </label>
        </div>

        {checkTerminos && (
          <input type="hidden" name="terminos_aceptados" value="true" />
        )}
        {checkDatosSensibles && (
          <input type="hidden" name="datos_sensibles_aceptados" value="true" />
        )}

        <button
          type="submit"
          disabled={submitting || !checkTerminos || !checkDatosSensibles}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#378ADD] py-3.5 text-sm font-semibold text-white active:scale-[0.97] transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting && (
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          {submitting ? "Guardando..." : "Guardar y continuar"}
        </button>

        {submitting && (
          <p className="mt-3 text-center text-xs text-gray-400">
            Guardando tus datos, esperá un momento...
          </p>
        )}
      </form>

      <ModalTerminos open={modalTerminos} onClose={() => setModalTerminos(false)} />
    </>
  );
}
