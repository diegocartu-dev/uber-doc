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
  const [dictando, setDictando] = useState<string | null>(null);

  const iniciar = useCallback(
    (campo: string, setter: (fn: (prev: string) => string) => void) => {
      if (typeof window === "undefined") return;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;

      const rec = new SR();
      rec.lang = "es-AR";
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (e: any) => {
        let transcript = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript;
        }
        if (e.results[e.results.length - 1].isFinal) {
          setter((prev) => (prev ? prev + " " : "") + transcript);
        }
      };

      rec.onerror = () => detener();
      rec.onend = () => setDictando(null);

      recRef.current = rec;
      setDictando(campo);
      rec.start();
    },
    []
  );

  const detener = useCallback(() => {
    if (recRef.current) { recRef.current.stop(); recRef.current = null; }
    setDictando(null);
  }, []);

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
          {activo ? "🔴 Dictando..." : "🎙️ Dictar"}
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

type Props = {
  consultaId: string;
  medicoId: string;
  consulta: {
    especialidad: string;
    motivo_consulta: string | null;
    sintomas: string[] | null;
    paciente_nombre: string;
    paciente_nacimiento: string | null;
    paciente_id: string;
  };
};

export default function CompletarConsulta({ consultaId, medicoId, consulta }: Props) {
  const [diagnostico, setDiagnostico] = useState("");
  const [receta, setReceta] = useState("");
  const [indicaciones, setIndicaciones] = useState("");
  const [certificado, setCertificado] = useState("");
  const [finalizando, setFinalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { dictando, iniciar: iniciarDictado, detener: detenerDictado } = useDictado();
  const edad = calcularEdad(consulta.paciente_nacimiento);

  async function finalizar(conDocumentos: boolean) {
    if (conDocumentos && !diagnostico.trim()) {
      setError("El diagnóstico es obligatorio para generar documentos.");
      return;
    }

    setFinalizando(true);
    setError(null);

    try {
      const supabase = createClient();

      if (conDocumentos) {
        // Obtener paciente.id (tabla id, no auth id)
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

          if (docs.length > 0) {
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
        }
      }

      await supabase.from("consultas").update({ estado: "completada" }).eq("id", consultaId);
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("[Completar]", err);
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

      {consulta.sintomas && consulta.sintomas.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {consulta.sintomas.map((s) => (
            <span key={s} className="rounded-lg bg-white px-2.5 py-1 text-xs text-gray-600" style={{ border: "0.5px solid #e5e7eb" }}>
              {s}
            </span>
          ))}
        </div>
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
      <div className="mt-8 space-y-3">
        <button
          disabled={finalizando}
          onClick={() => finalizar(true)}
          className="w-full rounded-xl bg-[#1D9E75] px-6 py-3.5 text-sm font-medium text-white transition hover:bg-[#178a64] disabled:opacity-50"
        >
          {finalizando ? "Finalizando..." : "Finalizar y generar documentos"}
        </button>
        <button
          disabled={finalizando}
          onClick={() => finalizar(false)}
          className="w-full rounded-xl px-6 py-3 text-sm text-gray-500 transition hover:bg-gray-100 disabled:opacity-50"
          style={{ border: "0.5px solid #e5e7eb" }}
        >
          Saltar — no generar documentos
        </button>
      </div>
    </main>
  );
}
