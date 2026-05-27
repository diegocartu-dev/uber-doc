"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import ModalBaja from "./ModalBaja";
import TabCobros from "./TabCobros";
import FirmaManuscrita from "./FirmaManuscrita";

interface MpAccount {
  mp_user_id: string;
  estado: string;
  conectado_en: string;
  expires_at: string;
  public_key: string | null;
}

interface Medico {
  id: string;
  nombre_completo: string;
  especialidad: string;
  numero_matricula: string;
  tipo_matricula: string;
  email: string;
  provincia: string | null;
  precio_consulta: number | null;
  duracion_consulta: number | null;
  modalidad_atencion: string | null;
  nova_evolucion_activa: boolean | null;
  telefono: string | null;
  domicilio_consultorio: string | null;
  foto_url: string | null;
  perfil_completo: boolean;
  firma_manuscrita_url: string | null;
  celular_personal: string | null;
  email_personal: string | null;
}

export default function PerfilClient({
  medico,
  mpAccount,
  userEmail,
}: {
  medico: Medico;
  mpAccount: MpAccount | null;
  userEmail: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "error" } | null>(null);
  const [stickyError, setStickyError] = useState<string | null>(null);
  const [showBaja, setShowBaja] = useState(false);

  // Form state
  const [telefono, setTelefono] = useState(medico.telefono ?? "");
  const [domicilio, setDomicilio] = useState(medico.domicilio_consultorio ?? "");
  const [tipoMatricula, setTipoMatricula] = useState(medico.tipo_matricula ?? "");
  const [numeroMatricula, setNumeroMatricula] = useState(medico.numero_matricula ?? "");
  const [provincia, setProvincia] = useState(medico.provincia ?? "");
  const [fotoUrl, setFotoUrl] = useState(medico.foto_url ?? "");
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [celularPersonal, setCelularPersonal] = useState(medico.celular_personal ?? "");
  const [emailPersonal, setEmailPersonal] = useState(medico.email_personal ?? "");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Dirty tracking
  const isDirty =
    telefono !== (medico.telefono ?? "") ||
    domicilio !== (medico.domicilio_consultorio ?? "") ||
    tipoMatricula !== (medico.tipo_matricula ?? "") ||
    numeroMatricula !== (medico.numero_matricula ?? "") ||
    provincia !== (medico.provincia ?? "") ||
    celularPersonal !== (medico.celular_personal ?? "") ||
    emailPersonal !== (medico.email_personal ?? "") ||
    fotoFile !== null;

  // Handle MP OAuth callback params
  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success === "connected") {
      setToast({ msg: "¡Cuenta MP conectada con éxito!", type: "ok" });
    } else if (success === "disconnected") {
      setToast({ msg: "Tu cuenta de Mercado Pago fue desconectada.", type: "ok" });
    } else if (error === "mp_account_already_linked") {
      setStickyError("mp_account_already_linked");
    } else if (error === "credentials_mismatch") {
      setStickyError("credentials_mismatch");
    } else if (error) {
      setToast({ msg: "Algo salió mal con la conexión a Mercado Pago.", type: "error" });
    }

    if (success || error) {
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      url.searchParams.delete("error");
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Upload foto first if changed
      if (fotoFile) {
        const formData = new FormData();
        formData.append("foto", fotoFile);
        const res = await fetch("/api/medico/foto", { method: "POST", body: formData });
        const data = await res.json();
        if (res.ok && data.foto_url) {
          setFotoUrl(data.foto_url);
          setFotoFile(null);
          setFotoPreview(null);
        } else {
          setToast({ msg: data.error || "Error al subir foto", type: "error" });
          setSaving(false);
          return;
        }
      }

      // Save other fields
      const res = await fetch("/api/medico/perfil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telefono,
          domicilio_consultorio: domicilio,
          tipo_matricula: tipoMatricula,
          numero_matricula: numeroMatricula,
          provincia,
          celular_personal: celularPersonal || null,
          email_personal: emailPersonal || null,
        }),
      });

      if (res.ok) {
        setToast({ msg: "Perfil actualizado", type: "ok" });
        router.refresh();
      } else {
        const data = await res.json();
        setToast({ msg: data.error || "Error al guardar", type: "error" });
      }
    } catch {
      setToast({ msg: "Error al guardar", type: "error" });
    }
    setSaving(false);
  }

  const mpConectado = mpAccount?.estado === "active";
  const errorParam = stickyError || searchParams.get("error");
  const displayFoto = fotoPreview || fotoUrl;
  const initials = medico.nombre_completo.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  // Indicadores inline de perfil (spec Sofía 27/05)
  // Bloqueantes = rojo, Recomendados = amarillo
  const COLOR_BLOQUEANTE = "#E24B4A";
  const COLOR_RECOMENDADO = "#BA7517";

  function borderStyle(value: string, blocking: boolean) {
    if (value.trim()) return {};
    return { borderColor: blocking ? COLOR_BLOQUEANTE : COLOR_RECOMENDADO };
  }

  function MicroCopy({ value, blocking }: { value: string; blocking: boolean }) {
    if (value.trim()) return null;
    return (
      <p className="mt-1 text-xs" style={{ color: blocking ? COLOR_BLOQUEANTE : COLOR_RECOMENDADO }}>
        {blocking ? "Obligatorio para atender consultas" : "Recomendado para generar confianza"}
      </p>
    );
  }

  // Scroll al anchor con smooth center cuando viene del panel
  useEffect(() => {
    const hash = window.location.hash?.replace("#", "");
    if (hash) {
      const el = document.getElementById(hash);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
      }
    }
  }, []);

  return (
    <>
      <main className="mx-auto max-w-2xl px-6 py-6 pb-28">
        {/* Toast */}
        {toast && (
          <div
            className="mb-4 rounded-lg px-4 py-3 text-sm font-medium text-white"
            style={{ backgroundColor: toast.type === "ok" ? "#1D9E75" : "#E24B4A" }}
          >
            {toast.msg}
          </div>
        )}

        {/* Back + title */}
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          ← Volver
        </Link>
        <p className="mt-4 text-xs font-medium tracking-wide text-gray-400">MI PERFIL</p>

        {/* Foto section */}
        <div id="foto" className="mt-5 flex flex-col items-center rounded-xl bg-white p-6" style={{ border: "0.5px solid #e5e7eb" }}>
          <div
            className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-lg font-medium text-gray-500"
            style={{
              border: displayFoto ? "2px solid #e5e7eb" : `2px dashed ${COLOR_RECOMENDADO}`,
            }}
          >
            {displayFoto ? (
              <img src={displayFoto} alt="Foto" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <p className="mt-2 text-base font-medium text-gray-900">{medico.nombre_completo}</p>
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-1 text-sm font-medium text-[#378ADD]"
          >
            {displayFoto ? "Cambiar foto" : "Subir foto"}
          </button>
          {!displayFoto && (
            <p className="mt-1 text-xs" style={{ color: COLOR_RECOMENDADO }}>
              Recomendado para generar confianza
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFotoChange}
          />
        </div>

        {/* Datos profesionales */}
        <div id="datos" className="mt-4 rounded-xl bg-white p-6" style={{ border: "0.5px solid #e5e7eb" }}>
          <p className="text-xs font-medium tracking-wide text-gray-400 uppercase">DATOS PROFESIONALES DEL CONSULTORIO</p>
          <p className="mt-1 text-xs text-gray-400">
            Estos datos aparecen en recetas, certificados y son visibles para el paciente.
          </p>

          <div className="mt-5 space-y-4">
            {/* Especialidad (read-only) */}
            <div id="especialidad">
              <label className="text-xs text-gray-400">Especialidad</label>
              <input
                type="text"
                value={medico.especialidad}
                readOnly
                className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-500"
              />
            </div>

            {/* Tipo matrícula */}
            <div id="matricula">
              <label className="text-xs text-gray-400">Tipo matrícula</label>
              <select
                value={tipoMatricula}
                onChange={(e) => setTipoMatricula(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#378ADD]/40"
              >
                <option value="MN">MN (Nacional)</option>
                <option value="MP">MP (Provincial)</option>
              </select>
            </div>

            {/* Número matrícula */}
            <div>
              <label className="text-xs text-gray-400">Número de matrícula</label>
              <input
                type="text"
                value={numeroMatricula}
                onChange={(e) => setNumeroMatricula(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#378ADD]/40"
              />
            </div>

            {/* Provincia */}
            <div>
              <label className="text-xs text-gray-400">Provincia</label>
              <input
                type="text"
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                placeholder="Buenos Aires"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#378ADD]/40"
              />
            </div>

            {/* Domicilio consultorio */}
            <div id="domicilio">
              <label className="text-xs text-gray-400">Domicilio del consultorio</label>
              <input
                type="text"
                value={domicilio}
                onChange={(e) => setDomicilio(e.target.value)}
                placeholder="Av. Corrientes 1234, CABA"
                className="mt-1 w-full rounded-lg border px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#378ADD]/40"
                style={borderStyle(domicilio, true)}
              />
              <MicroCopy value={domicilio} blocking={true} />
            </div>

            {/* Teléfono */}
            <div id="telefono">
              <label className="text-xs text-gray-400">Teléfono profesional</label>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="11-4567-8900"
                className="mt-1 w-full rounded-lg border px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#378ADD]/40"
                style={borderStyle(telefono, true)}
              />
              <MicroCopy value={telefono} blocking={true} />
            </div>
          </div>
        </div>

        {/* Contacto privado */}
        <div className="mt-4 rounded-xl bg-white p-6" style={{ border: "0.5px solid #e5e7eb" }}>
          <p className="text-xs font-medium tracking-wide text-gray-400 uppercase">CONTACTO PRIVADO</p>
          <p className="mt-1 text-xs text-gray-400">
            Celular personal y email — solo para registro y contacto en Docto. Esta información es personal y no aparece en documentos ni se comparte con pacientes.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="text-xs text-gray-400">Celular personal</label>
              <input
                type="tel"
                value={celularPersonal}
                onChange={(e) => setCelularPersonal(e.target.value)}
                placeholder="11-2345-6789"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#378ADD]/40"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Email personal</label>
              <input
                type="email"
                value={emailPersonal}
                onChange={(e) => setEmailPersonal(e.target.value)}
                placeholder="tu@email.com"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#378ADD]/40"
              />
            </div>
          </div>
        </div>

        {/* Firma Manuscrita */}
        <FirmaManuscrita firmaUrl={medico.firma_manuscrita_url} />

        {/* Mercado Pago */}
        <div className="mt-4 rounded-xl bg-white p-6" style={{ border: "0.5px solid #e5e7eb" }}>
          <p className="text-xs font-medium tracking-wide text-gray-400 uppercase">MERCADO PAGO</p>
          <div className="mt-4">
            <TabCobros
              mpAccount={mpAccount}
              errorParam={errorParam}
              medicoId={medico.id}
            />
          </div>
        </div>

        {/* Cuenta */}
        <div className="mt-4 rounded-xl bg-white p-6" style={{ border: "0.5px solid #e5e7eb" }}>
          <p className="text-xs font-medium tracking-wide text-gray-400 uppercase">CUENTA</p>
          <div className="mt-4">
            <p className="text-xs text-gray-400">Email</p>
            <p className="mt-0.5 text-sm text-gray-700">{userEmail}</p>
          </div>
          <button
            onClick={() => setShowBaja(true)}
            className="mt-5 text-sm font-medium text-[#E24B4A]"
          >
            Darme de baja
          </button>
        </div>
      </main>

      {/* Sticky save button */}
      <div className="fixed inset-x-0 bottom-0 bg-white px-6 py-3 shadow-[0_-1px_3px_rgba(0,0,0,0.1)]" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto max-w-2xl">
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="w-full rounded-lg bg-[#378ADD] py-3.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>

      <ModalBaja open={showBaja} onClose={() => setShowBaja(false)} medicoId={medico.id} />
    </>
  );
}
