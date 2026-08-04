"use client";

import { useState, useRef } from "react";
import { comprimirImagenesDeFormData, pesoTotal } from "@/lib/imagenes/comprimir";
import { Stethoscope, X, Upload, CheckCircle, ChevronLeft, Camera, Lightbulb } from "lucide-react";
import { completarRegistroMedico } from "@/app/auth/registro-medico/actions";
import FirmaCanvas, { type FirmaCanvasHandle } from "@/components/firma/FirmaCanvas";
import LoadingButton from "@/components/ui/LoadingButton";
import ModalTerminos from "@/components/ModalTerminos";

const ESPECIALIDADES = [
  "Alergia e inmunología",
  "Anatomía patológica",
  "Anestesiología",
  "Cardiología",
  "Cirugía cardiovascular",
  "Cirugía general",
  "Cirugía pediátrica",
  "Cirugía plástica y reparadora",
  "Cirugía torácica",
  "Clínica médica",
  "Coloproctología",
  "Dermatología",
  "Diagnóstico por imágenes",
  "Endocrinología",
  "Farmacología clínica",
  "Fisiatría",
  "Gastroenterología",
  "Genética médica",
  "Geriatría",
  "Ginecología",
  "Hematología",
  "Hemoterapia e inmunohematología",
  "Hepatología",
  "Infectología",
  "Mastología",
  "Medicina del deporte",
  "Medicina del trabajo",
  "Medicina familiar",
  "Medicina legal",
  "Medicina nuclear",
  "Nefrología",
  "Neonatología",
  "Neumonología",
  "Neurocirugía",
  "Neurología",
  "Nutrición",
  "Obstetricia",
  "Oftalmología",
  "Oncología",
  "Ortopedia y traumatología",
  "Otorrinolaringología",
  "Patología",
  "Pediatría",
  "Psiquiatría",
  "Radioterapia",
  "Reumatología",
  "Terapia intensiva",
  "Toxicología",
  "Urología",
];

const PROVINCIAS = [
  "Buenos Aires",
  "CABA",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Encabezado de bloque — SIN número: los números quedan reservados para la barra
// de progreso (pasos 1·2·3). Acento azul a la izquierda para jerarquía, sin badge
// circular que el ojo confunda con un "paso".
function BloqueHeader({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <div className="mb-1 border-l-2 border-[#378ADD] pl-3">
      <p className="text-[15px] font-semibold text-gray-900">{titulo}</p>
      <p className="mt-0.5 text-[13px] text-gray-500">{subtitulo}</p>
    </div>
  );
}

// Rediseño 14/07/2026 — FASE B del registro médico. El médico ya creó su cuenta
// (Fase A) y confirmó el mail → llega acá YA LOGUEADO. Completa datos + credencial
// → se crea la ficha de `medicos` → biometría (/registro-medico/identidad).
// La cuenta (nombre/email/password) ya existe: acá NO se pide de nuevo.
export default function ContinuarRegistro({ nombre }: { nombre: string }) {
  const [paso, setPaso] = useState(1);
  const [tipoMatricula, setTipoMatricula] = useState(""); // nada prellenado
  const [tieneMatriculaExtra, setTieneMatriculaExtra] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkTerminos, setCheckTerminos] = useState(false);
  const [checkMatricula, setCheckMatricula] = useState(false);
  const [modalTerminos, setModalTerminos] = useState(false);
  const [modalMatricula, setModalMatricula] = useState(false);
  const [fotoCredencial, setFotoCredencial] = useState<File | null>(null);
  const [fotoPerfil, setFotoPerfil] = useState<File | null>(null);
  const [numeroMatricula, setNumeroMatricula] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const firmaRef = useRef<FirmaCanvasHandle>(null);

  // Paso 1 — "Completá tus datos": valida los 3 bloques. Teléfono profesional y
  // foto de perfil son OPCIONALES. La cuenta (email/password/nombre) ya existe.
  function validarPaso1(): boolean {
    const form = formRef.current;
    if (!form) return false;
    const requeridos: { name: string; label: string }[] = [
      { name: "titulo", label: "Título profesional" },
      { name: "especialidad", label: "Especialidad" },
      { name: "tipo_matricula", label: "Tipo de matrícula" },
      { name: "numero_matricula", label: "Número de matrícula" },
      { name: "dni", label: "DNI" },
      { name: "cuit", label: "CUIT" },
      { name: "domicilio_consultorio", label: "Domicilio del consultorio" },
      { name: "celular_personal", label: "Celular personal" },
    ];
    for (const { name, label } of requeridos) {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
      if (!el || !el.value.trim()) {
        setError(`Completá el campo "${label}".`);
        el?.focus();
        return false;
      }
    }
    if (tipoMatricula === "MP") {
      const prov = (form.elements.namedItem("provincia") as HTMLSelectElement)?.value;
      if (!prov) {
        setError("Seleccioná la provincia de tu matrícula.");
        return false;
      }
    }
    const dni = (form.elements.namedItem("dni") as HTMLInputElement).value;
    if (!/^\d{7,8}$/.test(dni)) {
      setError("El DNI debe tener 7 u 8 dígitos numéricos.");
      return false;
    }
    return true;
  }

  // Paso 2 — credencial obligatoria + ambos checks legales, ANTES de avanzar
  // al paso de firma (spec Sofía 20/07: el submit real ocurre en el paso 3).
  function validarPaso2(): boolean {
    if (!fotoCredencial) {
      setError("Subí la foto de tu credencial médica para continuar.");
      return false;
    }
    if (!checkTerminos || !checkMatricula) {
      setError("Aceptá los términos y la declaración de matrícula para continuar.");
      return false;
    }
    return true;
  }

  function siguiente() {
    setError(null);
    if (paso === 1 && validarPaso1()) {
      setPaso(2);
      // El paso 1 es largo: al cambiar de paso el scroll queda al pie y el
      // médico ve el paso nuevo "desde abajo" (bug reportado por Diego 15/07).
      window.scrollTo(0, 0);
      return;
    }
    if (paso === 2 && validarPaso2()) {
      setPaso(3);
      window.scrollTo(0, 0);
    }
  }

  function anterior() {
    setError(null);
    setPaso((p) => Math.max(1, p - 1));
    window.scrollTo(0, 0);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (paso < 3) { siguiente(); return; }
    // Firma OBLIGATORIA (Diego 20/07, "todo de un tirón"): sin ficha creada
    // todavía, el blob viaja en el MISMO FormData del registro y la action lo
    // sube con service role (insert atómico — patrón credencial).
    if (firmaRef.current?.isEmpty()) {
      // El mensaje habla del gesto que el médico está intentando: decirle
      // "dibujá" a quien está subiendo una imagen era un callejón sin salida
      // (caso Davide 03/08 — la foto >2MB se rechazaba y esto lo confundía más).
      setError(
        firmaRef.current.modo() === "subir"
          ? "Subí la imagen de tu firma (o dibujala en el recuadro) para continuar."
          : "Dibujá tu firma para continuar."
      );
      window.scrollTo(0, 0); // el banner de error vive arriba del form
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      const firmaBlob = await firmaRef.current?.getBlob();
      if (!firmaBlob) {
        setError(
          firmaRef.current?.modo() === "subir"
            ? "Subí la imagen de tu firma (o dibujala en el recuadro) para continuar."
            : "Dibujá tu firma para continuar."
        );
        setLoading(false);
        window.scrollTo(0, 0);
        return;
      }
      formData.append("firma_manuscrita", firmaBlob, "firma.png");

      // Achicar las fotos ACÁ, en el teléfono del médico: Vercel rechaza los
      // envíos de más de ~4,5 MB con un error que el usuario no entiende, y era
      // la causa de que ~la mitad de los registros murieran en este paso
      // (hallazgo 01/08). Una credencial de 5 MB queda en ~600 KB legibles.
      await comprimirImagenesDeFormData(formData, ["foto_credencial", "foto_perfil"]);

      // Red de contención: si aun comprimido el envío sigue siendo enorme, se lo
      // decimos en criollo en vez de dejar que la plataforma lo corte en silencio.
      if (pesoTotal(formData) > 4 * 1024 * 1024) {
        setError("Las fotos son demasiado pesadas. Probá sacarlas de nuevo con menos zoom o subir una imagen más liviana.");
        setLoading(false);
        window.scrollTo(0, 0);
        return;
      }

      const result = await completarRegistroMedico(formData);
      // Éxito = redirect server-side a /registro-medico/identidad (no vuelve).
      if (result?.error) {
        setError(result.error);
        setLoading(false);
        window.scrollTo(0, 0);
      }
    } catch {
      setError("Error al enviar el registro. Recargá la página e intentá de nuevo.");
      setLoading(false);
      window.scrollTo(0, 0);
    }
  }

  const inputClass =
    "mt-1 block w-full h-11 rounded-[var(--radius-md)] border border-gray-300 px-3 text-[15px] shadow-sm focus:outline-none focus:border-[#378ADD] focus:ring-2 focus:ring-[#378ADD]/30";
  const labelClass = "block text-[13px] font-medium text-gray-700";
  const hintClass = "mt-1 text-[13px] text-gray-500";
  const pasoTitulos = ["Completá tus datos", "Tu credencial", "Tu firma", "Verificá tu identidad"];

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
          <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>docto</span>
        </div>

        {/* Progreso — 4 pasos: datos, credencial, firma, identidad (este form cubre 1-3). */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  n === paso
                    ? "bg-[#378ADD] text-white"
                    : n < paso
                      ? "bg-[#378ADD]/20 text-[#378ADD]"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {n < paso ? "✓" : n}
              </div>
              {n < 4 && (
                <div className={`h-0.5 w-6 rounded transition-colors ${n < paso ? "bg-[#378ADD]/40" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        {paso === 1 && nombre && (
          <p className="mb-1 text-center text-sm text-gray-500">
            Hola, <strong className="text-gray-800">{nombre}</strong> 👋 Tu cuenta ya está creada.
          </p>
        )}
        <h2 className="text-center text-xl font-semibold text-gray-900">
          {pasoTitulos[paso - 1]}
        </h2>
        <p className="mt-1 text-center text-sm text-gray-500">Paso {paso} de 4</p>

        <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: "rgba(226,75,74,0.08)", color: "#E24B4A" }}>
              {error}
            </div>
          )}

          {/* ═══ PASO 1: Completá tus datos (3 bloques por propósito) ═══ */}
          <div className={paso === 1 ? "space-y-6" : "hidden"}>
            {/* 1 · Tus datos profesionales */}
            <div className="space-y-3">
              <BloqueHeader titulo="Tus datos profesionales" subtitulo="Con esto validamos tu matrícula y te mostramos a los pacientes." />
              <div>
                <label htmlFor="titulo" className={labelClass}>Título profesional</label>
                <select id="titulo" name="titulo" required className={inputClass} defaultValue="">
                  <option value="" disabled>Elegí tu título</option>
                  <option value="Dr.">Dr.</option>
                  <option value="Dra.">Dra.</option>
                </select>
              </div>
              <div>
                <label htmlFor="especialidad" className={labelClass}>Especialidad</label>
                <select id="especialidad" name="especialidad" required className={inputClass} defaultValue="">
                  <option value="" disabled>Seleccioná tu especialidad</option>
                  {ESPECIALIDADES.map((esp) => (
                    <option key={esp} value={esp}>{esp}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="w-40">
                  <label htmlFor="tipo_matricula" className={labelClass}>Matrícula</label>
                  <select
                    id="tipo_matricula"
                    name="tipo_matricula"
                    required
                    className={inputClass}
                    value={tipoMatricula}
                    onChange={(e) => {
                      setTipoMatricula(e.target.value);
                      if (e.target.value === "MP") setTieneMatriculaExtra(false);
                    }}
                  >
                    <option value="" disabled>Elegí</option>
                    <option value="MN">MN — Nacional</option>
                    <option value="MP">MP — Provincial</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label htmlFor="numero_matricula" className={labelClass}>Número</label>
                  <input id="numero_matricula" name="numero_matricula" type="text" required className={inputClass} placeholder="123456" value={numeroMatricula} onChange={(e) => setNumeroMatricula(e.target.value)} />
                </div>
              </div>
              {tipoMatricula === "MP" && (
                <div>
                  <label htmlFor="provincia" className={labelClass}>Provincia de la matrícula</label>
                  <select id="provincia" name="provincia" required className={inputClass} defaultValue="">
                    <option value="" disabled>Seleccioná tu provincia</option>
                    {PROVINCIAS.map((prov) => (
                      <option key={prov} value={prov}>{prov}</option>
                    ))}
                  </select>
                </div>
              )}
              {tipoMatricula === "MN" && (
                <div>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={tieneMatriculaExtra}
                      onChange={(e) => setTieneMatriculaExtra(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    También tengo matrícula provincial
                  </label>
                  {tieneMatriculaExtra && (
                    <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3">
                      <div>
                        <label htmlFor="matricula_provincial" className={labelClass}>Número de matrícula provincial</label>
                        <input id="matricula_provincial" name="matricula_provincial" type="text" className={inputClass} placeholder="MP 45678" />
                      </div>
                      <div>
                        <label htmlFor="provincia_matricula" className={labelClass}>Provincia</label>
                        <select id="provincia_matricula" name="provincia_matricula" className={inputClass} defaultValue="">
                          <option value="">Seleccioná</option>
                          {PROVINCIAS.map((prov) => (
                            <option key={prov} value={prov}>{prov}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label htmlFor="dni" className={labelClass}>DNI</label>
                  <input id="dni" name="dni" type="text" required inputMode="numeric" pattern="\d{7,8}" maxLength={8} className={inputClass} placeholder="25086458" />
                </div>
                <div className="flex-1">
                  <label htmlFor="cuit" className={labelClass}>CUIT</label>
                  <input id="cuit" name="cuit" type="text" required className={inputClass} placeholder="27-25086458-4" />
                </div>
              </div>
            </div>

            {/* 2 · Tu consultorio */}
            <div className="space-y-3">
              <BloqueHeader titulo="Tu consultorio" subtitulo="Estos datos aparecen impresos en tus recetas." />
              <div>
                <label htmlFor="domicilio_consultorio" className={labelClass}>Domicilio del consultorio</label>
                <input id="domicilio_consultorio" name="domicilio_consultorio" type="text" required className={inputClass} placeholder="Av. Rivadavia 4500, CABA" />
                <p className={hintClass}>Va en el pie de tus recetas, como pide la normativa.</p>
              </div>
              <div>
                <label htmlFor="telefono" className={labelClass}>Teléfono profesional <span className="font-normal text-gray-400">(opcional)</span></label>
                <input id="telefono" name="telefono" type="tel" className={inputClass} placeholder="11 4000-0000" />
                <p className={hintClass}>Este teléfono sí aparece en tus recetas.</p>
              </div>
              <div>
                <label htmlFor="foto_perfil" className={labelClass}>Foto de perfil <span className="font-normal text-gray-400">(opcional)</span></label>
                <label
                  htmlFor="foto_perfil"
                  className="mt-1 flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 transition hover:border-gray-400 hover:bg-gray-50"
                >
                  {fotoPerfil ? (
                    <>
                      <CheckCircle size={20} className="text-[#1D9E75]" />
                      <span className="text-gray-700">{fotoPerfil.name}</span>
                    </>
                  ) : (
                    <>
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#378ADD]/10 text-[#378ADD]"><Camera size={18} /></span>
                      <span>Subir foto</span>
                    </>
                  )}
                </label>
                <input
                  id="foto_perfil"
                  name="foto_perfil"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > MAX_FILE_SIZE) {
                      setError("La foto no puede superar 5 MB.");
                      e.target.value = "";
                      return;
                    }
                    setError(null);
                    setFotoPerfil(file);
                  }}
                />
                <p className={hintClass}>La ven los pacientes en tu bio. Distinta de la credencial (próximo paso).</p>
              </div>
            </div>

            {/* 3 · Cómo te avisamos */}
            <div className="space-y-3">
              <BloqueHeader titulo="Cómo te avisamos" subtitulo="Solo uso interno administrativo." />
              <div>
                <label htmlFor="celular_personal" className={labelClass}>Celular personal</label>
                <input id="celular_personal" name="celular_personal" type="tel" required className={inputClass} placeholder="11 2345-6789" />
                <p className={hintClass}>Te avisamos acá cuando un paciente te está esperando. Los pacientes no ven este teléfono.</p>
              </div>
            </div>
          </div>

          {/* ═══ PASO 2: Tu credencial + términos ═══ */}
          <div className={paso === 2 ? "space-y-4" : "hidden"}>
            <p className="text-sm text-gray-500">
              Así confirmamos que la matrícula{" "}
              <strong className="text-gray-700">{tipoMatricula} {numeroMatricula || "…"}</strong> es tuya.
            </p>
            <div>
              <label
                htmlFor="foto_credencial"
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 transition hover:border-gray-400 hover:bg-gray-50"
              >
                {fotoCredencial ? (
                  <>
                    <CheckCircle size={22} className="text-[#1D9E75]" />
                    <span className="text-gray-700">{fotoCredencial.name}</span>
                  </>
                ) : (
                  <>
                    <Upload size={22} />
                    <span className="font-medium text-gray-700">Sacale una foto o subila</span>
                    <span className="text-xs text-gray-400">JPG, PNG o PDF · hasta 5 MB</span>
                  </>
                )}
              </label>
              <input
                id="foto_credencial"
                name="foto_credencial"
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file && file.size > MAX_FILE_SIZE) {
                    setError("El archivo no puede superar 5 MB.");
                    e.target.value = "";
                    return;
                  }
                  setError(null);
                  setFotoCredencial(file);
                }}
              />
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
              <p className="font-medium text-gray-900">¿Qué es la credencial?</p>
              <ul className="mt-2 space-y-1.5">
                <li className="flex items-start gap-2 text-gray-600"><CheckCircle size={16} className="mt-0.5 shrink-0 text-[#1D9E75]" /><span>El carnet o certificado de tu matrícula profesional (el que emite el Ministerio o el Colegio Médico).</span></li>
                <li className="flex items-start gap-2 text-gray-600"><X size={16} className="mt-0.5 shrink-0 text-[#E24B4A]" /><span>No es tu DNI ni tu CV ni tu título.</span></li>
                <li className="flex items-start gap-2 text-gray-600"><Lightbulb size={16} className="mt-0.5 shrink-0 text-[#BA7517]" /><span>Que se lea completa: tu nombre y el número de matrícula, sin reflejos.</span></li>
              </ul>
            </div>

            {/* Términos y declaración — antes de crear la ficha */}
            <div className="space-y-3 border-t border-gray-100 pt-3">
              <label className="flex cursor-pointer items-start gap-3 py-1">
                <input
                  type="checkbox"
                  checked={checkTerminos}
                  onChange={(e) => setCheckTerminos(e.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">
                  Leí y acepto los{" "}
                  <button type="button" onClick={() => setModalTerminos(true)} className="font-medium underline" style={{ color: "#378ADD" }}>
                    términos y condiciones
                  </button>{" "}
                  de Docto
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 py-1">
                <input
                  type="checkbox"
                  checked={checkMatricula}
                  onChange={(e) => setCheckMatricula(e.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">
                  Declaro que la información de mi matrícula profesional es
                  verídica y que soy responsable de mis actos médicos como{" "}
                  <button type="button" onClick={() => setModalMatricula(true)} className="font-medium underline" style={{ color: "#378ADD" }}>
                    profesional independiente
                  </button>
                </span>
              </label>
            </div>
            {checkTerminos && <input type="hidden" name="terminos_aceptados" value="true" />}
            {checkMatricula && <input type="hidden" name="declaracion_matricula" value="true" />}
          </div>

          {/* ── Paso 3: Tu firma (spec Sofía 20/07 — "todo de un tirón") ── */}
          <div className={paso === 3 ? "space-y-4" : "hidden"}>
            <p className="text-sm text-gray-600">
              Aparece impresa en cada receta, certificado e indicación que
              emitas. Firmá en el recuadro como lo hacés en papel.
            </p>
            <FirmaCanvas ref={firmaRef} activo={paso === 3} altura={200} />
          </div>

          {/* Navegación */}
          <div className="flex gap-3 pt-2">
            {paso > 1 && (
              <button
                type="button"
                onClick={anterior}
                className="flex h-11 items-center gap-1 rounded-[var(--radius-md)] border border-gray-200 px-4 text-sm font-medium text-gray-600 transition hover:bg-gray-50 active:scale-[0.97]"
              >
                <ChevronLeft size={16} />
                Atrás
              </button>
            )}

            {paso < 3 ? (
              <button
                type="button"
                onClick={siguiente}
                className="flex-1 h-11 rounded-[var(--radius-md)] bg-[#378ADD] text-sm font-semibold text-white shadow-sm transition hover:bg-[#2d75c4] active:scale-[0.97]"
              >
                Siguiente
              </button>
            ) : (
              <LoadingButton
                type="submit"
                isLoading={loading}
                className="flex-1 h-11 rounded-[var(--radius-md)] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-all duration-100"
                style={{ backgroundColor: "#378ADD" }}
              >
                Continuar a la verificación
              </LoadingButton>
            )}
          </div>
        </form>

        <ModalTerminos open={modalTerminos} onClose={() => setModalTerminos(false)} perfil="medico" />

        {modalMatricula && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Declaración de responsabilidad profesional
                </h2>
                <button onClick={() => setModalMatricula(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} strokeWidth={1.75} />
                </button>
              </div>
              <div className="mt-4 h-72 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
                <h3 className="font-semibold">Declaración jurada de responsabilidad profesional</h3>
                <p className="mt-2">Al aceptar esta declaración, el profesional médico certifica que:</p>
                <p className="mt-2"><strong>1.</strong> La información de matrícula profesional proporcionada es verídica, se encuentra vigente y corresponde a su persona. Cualquier falsedad constituye un delito penal conforme al artículo 292 del Código Penal Argentino.</p>
                <p className="mt-2"><strong>2.</strong> Actúa como profesional independiente conforme a la Ley 17.132 de Ejercicio de la Medicina. Es el único responsable de sus actos profesionales, diagnósticos, indicaciones y prescripciones realizadas a través de la plataforma.</p>
                <p className="mt-2"><strong>3.</strong> Se compromete a ejercer la telemedicina dentro de los límites de su especialidad y competencia, derivando a atención presencial cuando la situación clínica lo requiera.</p>
                <p className="mt-2"><strong>4.</strong> Docto no interviene en las decisiones médicas del profesional ni asume responsabilidad por las mismas. La plataforma actúa exclusivamente como intermediaria tecnológica.</p>
                <p className="mt-2"><strong>5.</strong> Se compromete a mantener actualizada su información profesional y a informar inmediatamente cualquier cambio en el estado de su matrícula.</p>
              </div>
              <button
                onClick={() => setModalMatricula(false)}
                className="mt-4 w-full rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
                style={{ backgroundColor: "#378ADD" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
