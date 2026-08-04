// DEPRECATED: reemplazado por /medico/consulta/[id]/workspace
"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

import { useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAutoSaveBorrador } from "@/hooks/useAutoSaveBorrador";
import LoadingButton from "@/components/ui/LoadingButton";

function calcularEdad(fechaNac: string | null): string {
  if (!fechaNac) return "";
  const hoy = new Date();
  const nac = new Date(fechaNac);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return `${edad} años`;
}

function useDictado() {
  const recRef = useRef<any>(null);
  // Modo DISCRETO (continuous=false): con continuous=true, Chrome-Android emite finales
  // ACUMULATIVOS → cascada. Una frase por sesión + reinicio en onend para soportar pausas.
  // Bug del motor (Chromium 40324711), no nuestro.
  const detenidoManual = useRef(false);
  const acumuladoRef = useRef("");
  const ultimoFinalRef = useRef("");
  const [dictando, setDictando] = useState<string | null>(null);

  const detener = useCallback(() => {
    detenidoManual.current = true;
    if (recRef.current) { try { recRef.current.stop(); } catch { /* ya detenido */ } recRef.current = null; }
    setDictando(null);
  }, []);

  const iniciar = useCallback(
    (campo: string, setter: (fn: (prev: string) => string) => void) => {
      if (typeof window === "undefined") return;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;

      // Cambio de campo sin "Detener": cerramos y neutralizamos el rec previo para que
      // no reinicie ni contamine el nuevo campo (refs compartidas). Hallazgo de Roberto.
      if (recRef.current) {
        const viejo = recRef.current;
        viejo.onresult = null; viejo.onend = null; viejo.onerror = null;
        try { viejo.stop(); } catch { /* ya detenido */ }
        recRef.current = null;
      }

      const rec = new SR();
      rec.lang = "es-AR";
      rec.continuous = false; // ← clave: una frase por sesión (anti-cascada Android)
      rec.interimResults = true;
      detenidoManual.current = false;
      setter((prev) => { acumuladoRef.current = prev; ultimoFinalRef.current = ""; return prev; });

      rec.onresult = (e: any) => {
        // Final/interim MÁS LARGO del evento (no concatenar) → inmune a la cascada acumulativa.
        let finalSesion = "";
        let interim = "";
        for (let i = 0; i < e.results.length; i++) {
          const t = (e.results[i][0]?.transcript || "").trim();
          if (!t) continue;
          if (e.results[i].isFinal) { if (t.length > finalSesion.length) finalSesion = t; }
          else if (t.length > interim.length) interim = t;
        }
        ultimoFinalRef.current = finalSesion;
        const conf = acumuladoRef.current;
        setter(() => (conf ? conf + " " : "") + (finalSesion || interim));
      };

      rec.onerror = (ev: any) => {
        const err = ev?.error;
        if (err === "not-allowed" || err === "service-not-allowed" || err === "audio-capture") detener();
      };

      rec.onend = () => {
        if (ultimoFinalRef.current) {
          acumuladoRef.current = (acumuladoRef.current ? acumuladoRef.current + " " : "") + ultimoFinalRef.current;
          ultimoFinalRef.current = "";
        }
        if (!detenidoManual.current && recRef.current === rec) {
          setTimeout(() => {
            if (!detenidoManual.current && recRef.current === rec) {
              try { rec.start(); } catch { /* ya corriendo */ }
            }
          }, 120);
        } else {
          setDictando(null);
        }
      };

      recRef.current = rec;
      setDictando(campo);
      rec.start();
    },
    [detener]
  );

  return { dictando, iniciar, detener };
}

function CampoDictado({
  label, campo, value, setter, placeholder, rows = 3, required = false,
  dictando, onIniciar, onDetener,
}: {
  label: string; campo: string; value: string; setter: (v: string) => void;
  placeholder: string; rows?: number; required?: boolean;
  dictando: string | null; onIniciar: () => void; onDetener: () => void;
}) {
  const activo = dictando === campo;
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-wide text-gray-400">
          {label}{required && " *"}
        </p>
        <button
          type="button"
          onMouseDown={onIniciar} onMouseUp={onDetener}
          onTouchStart={onIniciar} onTouchEnd={onDetener}
          className={`rounded-md px-2 py-1 text-xs transition ${
            activo ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          {activo ? "Dictando..." : "Dictar"}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => setter(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="mt-1.5 w-full resize-none rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1D9E75]"
        style={{ border: "0.5px solid #e5e7eb" }}
      />
    </div>
  );
}

type DocBorrador = {
  diagnostico?: string;
  receta?: string;
  indicaciones?: string;
  certificado?: string;
  updated_at?: string;
} | null;

type Props = {
  consultaId: string;
  medicoId: string;
  consulta: {
    especialidad: string;
    motivo_consulta: string | null;
    sintomas: string[] | null;
    tiempo_sintomas: string | null;
    paciente_nombre: string;
    paciente_nacimiento: string | null;
    paciente_cuil: string | null;
    paciente_id: string;
    doc_borrador?: DocBorrador;
  };
};

export default function CompletarConsulta({ consultaId, medicoId, consulta }: Props) {
  const borrador = consulta.doc_borrador;
  const [diagnostico, setDiagnostico] = useState(borrador?.diagnostico ?? "");
  const [receta, setReceta] = useState(borrador?.receta ?? "");
  const [indicaciones, setIndicaciones] = useState(borrador?.indicaciones ?? "");
  const [certificado, setCertificado] = useState(borrador?.certificado ?? "");
  const [finalizando, setFinalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { estado: estadoBorrador } = useAutoSaveBorrador(
    consultaId,
    "consulta",
    { diagnostico, receta, indicaciones, certificado }
  );

  const { dictando, iniciar: iniciarDictado, detener: detenerDictado } = useDictado();
  const edad = calcularEdad(consulta.paciente_nacimiento);

  async function finalizar() {
    if (!diagnostico.trim()) {
      setError("El diagnóstico es obligatorio para finalizar la consulta.");
      return;
    }

    setFinalizando(true);
    setError(null);

    try {
      const supabase = createClient();

      const { data: paciente } = await supabase
        .from("pacientes")
        .select("id")
        .eq("user_id", consulta.paciente_id)
        .single();

      if (paciente) {
        const docs: { tipo: string; contenido: string }[] = [];
        if (receta.trim()) docs.push({ tipo: "receta", contenido: receta.trim() });
        if (indicaciones.trim()) docs.push({ tipo: "indicaciones", contenido: indicaciones.trim() });
        if (certificado.trim()) docs.push({ tipo: "certificado", contenido: certificado.trim() });
        if (docs.length === 0) docs.push({ tipo: "indicaciones", contenido: diagnostico.trim() });

        await supabase.from("documentos").insert(
          docs.map((d) => ({
            consulta_id: consultaId,
            paciente_id: paciente.id,
            medico_id: medicoId,
            tipo: d.tipo,
            diagnostico: diagnostico.trim(),
            contenido: d.contenido,
          }))
        );
      }

      await supabase.from("consultas").update({ estado: "completada", doc_borrador: null, completada_at: new Date().toISOString(), cierre_origen: "paciente" }).eq("id", consultaId);
      window.location.href = "/dashboard";
    } catch {
      setError("Error al finalizar. Intentá de nuevo.");
      setFinalizando(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-8">
      {/* Header */}
      <div>
        <p className="text-xs font-medium tracking-wide text-gray-400">COMPLETAR CONSULTA</p>
        <p className="mt-2 text-xl font-medium text-gray-900">{consulta.paciente_nombre}</p>
        <p className="mt-0.5 text-sm text-gray-500">
          {[edad, consulta.especialidad].filter(Boolean).join(" · ")}
        </p>
      </div>

      {/* Motivo y síntomas */}
      {consulta.motivo_consulta && (
        <div className="mt-4 rounded-lg bg-white p-4" style={{ border: "0.5px solid #e5e7eb" }}>
          <p className="text-xs text-gray-400">Motivo de consulta</p>
          <p className="mt-1 text-sm text-gray-700">{consulta.motivo_consulta}</p>
        </div>
      )}

      {consulta.tiempo_sintomas && (
        <p className="mt-2 text-xs text-gray-500">Tiempo: {consulta.tiempo_sintomas}</p>
      )}

      {consulta.sintomas && consulta.sintomas.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {consulta.sintomas.map((s) => (
            <span key={s} className="rounded-lg bg-white px-2.5 py-1 text-xs text-gray-600" style={{ border: "0.5px solid #e5e7eb" }}>
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Estado borrador */}
      {estadoBorrador !== "idle" && (
        <p className={`mt-4 text-xs ${
          estadoBorrador === "saving" ? "text-gray-400" :
          estadoBorrador === "saved" ? "text-[#1D9E75]" :
          "text-[#E24B4A]"
        }`}>
          {estadoBorrador === "saving" && "Guardando borrador..."}
          {estadoBorrador === "saved" && "Borrador guardado"}
          {estadoBorrador === "error" && "Error al guardar borrador"}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {/* Campos */}
      <div className="mt-6">
        <CampoDictado label="DIAGNÓSTICO" campo="diagnostico" value={diagnostico} setter={setDiagnostico} placeholder="Diagnóstico del paciente..." required dictando={dictando} onIniciar={() => iniciarDictado("diagnostico", setDiagnostico)} onDetener={detenerDictado} />
        <CampoDictado label="RECETA" campo="receta" value={receta} setter={setReceta} placeholder="Medicamentos, dosis, frecuencia..." dictando={dictando} onIniciar={() => iniciarDictado("receta", setReceta)} onDetener={detenerDictado} />
        <CampoDictado label="INDICACIONES" campo="indicaciones" value={indicaciones} setter={setIndicaciones} placeholder="Reposo, estudios, derivaciones..." dictando={dictando} onIniciar={() => iniciarDictado("indicaciones", setIndicaciones)} onDetener={detenerDictado} />
        <CampoDictado label="CERTIFICADO" campo="certificado" value={certificado} setter={setCertificado} placeholder="Certificado médico..." dictando={dictando} onIniciar={() => iniciarDictado("certificado", setCertificado)} onDetener={detenerDictado} />
      </div>

      {/* Acciones */}
      <div className="mt-8">
        <LoadingButton
          isLoading={finalizando}
          onClick={() => finalizar()}
          className="w-full rounded-xl bg-[#378ADD] px-6 py-3.5 text-sm font-medium text-white transition-all duration-100 hover:bg-[#2e6fb5] active:scale-95 active:opacity-80 disabled:opacity-50"
        >
          Finalizar y generar documentos
        </LoadingButton>
      </div>
    </main>
  );
}
