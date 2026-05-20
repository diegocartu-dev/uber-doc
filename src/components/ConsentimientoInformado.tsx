"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  consultaId?: string;
  turnoId?: string;
  redirect: string;
};

const TEXTO_VERSION = "v1";

export default function ConsentimientoInformado({ consultaId, turnoId, redirect }: Props) {
  const router = useRouter();
  const [aceptado, setAceptado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scrollCompleto, setScrollCompleto] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const threshold = el.scrollHeight - el.clientHeight - 40;
      if (el.scrollTop >= threshold) setScrollCompleto(true);
    };
    el.addEventListener("scroll", handleScroll);
    if (el.scrollHeight <= el.clientHeight) setScrollCompleto(true);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  async function handleAceptar() {
    if (!aceptado || enviando) return;
    setEnviando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/consentimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consultaId: consultaId ?? null,
          turnoId: turnoId ?? null,
          textoVersion: TEXTO_VERSION,
        }),
      });
      if (!res.ok) {
        setErrorMsg("No se pudo registrar el consentimiento. Intentá de nuevo.");
        setEnviando(false);
        return;
      }
      router.push(redirect);
    } catch {
      setErrorMsg("Error de conexión. Verificá tu internet e intentá de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <div className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#378ADD]/10">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#378ADD" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4" />
              <path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9" />
            </svg>
          </div>
          <h1 className="mt-4 text-lg font-medium text-gray-900">Consentimiento informado</h1>
          <p className="mt-1.5 text-sm text-gray-400">Leé el siguiente texto antes de iniciar tu consulta.</p>
        </div>

        <div
          ref={scrollRef}
          className="mt-6 overflow-y-auto rounded-xl bg-[#f8f9fa] p-5 text-sm leading-relaxed text-gray-700"
          style={{ maxHeight: "45vh", border: "0.5px solid #e5e7eb" }}
        >
          <p className="font-semibold text-gray-900 mb-3">
            Consentimiento informado para teleconsulta médica
          </p>

          <p className="mb-3">Antes de iniciar tu consulta, es importante que leas y aceptes lo siguiente:</p>

          <p className="mb-2"><strong>Modalidad de atención.</strong> La consulta que estás por realizar se lleva a cabo a distancia, mediante videollamada, a través de la plataforma Docto. No implica la presencia física del profesional de la salud.</p>

          <p className="mb-2"><strong>Limitaciones de la telemedicina.</strong> La teleconsulta tiene limitaciones propias de la atención remota: el profesional no puede realizar examen físico directo, tomar signos vitales ni efectuar procedimientos que requieran contacto presencial. Esto puede afectar el alcance del diagnóstico y las indicaciones.</p>

          <p className="mb-2"><strong>Derivación a atención presencial.</strong> El profesional puede determinar, según su criterio clínico, que tu situación requiere atención presencial. En ese caso, te lo indicará durante la consulta y podrá orientarte sobre los pasos a seguir.</p>

          <p className="mb-2"><strong>Registro de datos.</strong> Los datos de la consulta — incluyendo diagnóstico, indicaciones, recetas y cualquier documentación clínica generada — se almacenarán en la plataforma conforme a la Ley 25.326 de Protección de Datos Personales. Los datos de salud son tratados como datos sensibles con las máximas medidas de seguridad. Docto se encuentra inscripto ante la Agencia de Acceso a la Información Pública (AAIP) bajo el legajo RL-2026-36086505-APN-DNPDP#AAIP y ante el Registro Nacional de Plataformas Digitales de Salud (ReNaPDiS) como Plataforma 0270.</p>

          <p className="mb-2"><strong>Derecho a interrumpir.</strong> Podés interrumpir o abandonar la teleconsulta en cualquier momento, sin necesidad de justificación.</p>

          <p className="mb-2 rounded-lg bg-blue-50 p-3 text-sm font-medium text-gray-800"><strong>Esto NO es un servicio de emergencias.</strong> Docto es una plataforma de telemedicina electiva. Ante una emergencia o urgencia médica, llamá al SAME (107) o dirigite al centro de salud más cercano.</p>

          <p className="mb-2"><strong>Videollamada no grabada.</strong> La videollamada no es grabada ni almacenada por Docto.</p>

          <p className="mb-0 text-xs text-gray-500">Marco legal: Ley 27.553 (art. 7), Ley 26.529 (arts. 5 y 6), Resolución 581/2022 de la Secretaría de Calidad en Salud.</p>
        </div>

        <label className={`mt-5 flex items-start gap-3 cursor-pointer ${!scrollCompleto ? "opacity-40 pointer-events-none" : ""}`}>
          <input
            type="checkbox"
            checked={aceptado}
            onChange={(e) => setAceptado(e.target.checked)}
            disabled={!scrollCompleto}
            className="mt-0.5 h-5 w-5 rounded border-gray-300 text-[#378ADD] focus:ring-[#378ADD]"
          />
          <span className="text-sm text-gray-700">
            Declaro que comprendí las condiciones de esta teleconsulta y presto mi consentimiento informado para realizarla.
          </span>
        </label>
        {!scrollCompleto && (
          <p className="mt-2 text-xs text-gray-400">Desplazá hacia abajo para leer el texto completo.</p>
        )}

        {errorMsg && (
          <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 bg-white px-6 pb-6 pt-4" style={{ boxShadow: "0 -4px 12px rgba(0,0,0,0.04)" }}>
        <button
          onClick={handleAceptar}
          disabled={!aceptado || enviando}
          className="w-full rounded-xl bg-[#378ADD] py-3.5 text-sm font-medium text-white active:scale-[0.97] transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {enviando ? "Registrando..." : "Acepto y continuar"}
        </button>
      </div>
    </div>
  );
}
