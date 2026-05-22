"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, ShieldX, AlertTriangle, Loader2 } from "lucide-react";

type VerificacionResponse = {
  verificada: boolean;
  alterada?: boolean;
  firmado_at?: string;
  algoritmo?: string;
  hash?: string;
  motivo?: string;
  medico?: {
    nombre: string;
    especialidad: string;
    matricula: string;
  } | null;
};

type Estado = "cargando" | "verificada" | "invalida" | "alterada" | "no_encontrada" | "error";

export default function VerificarRecetaClient({ recetaId }: { recetaId: string }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [data, setData] = useState<VerificacionResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function verificar() {
      try {
        const res = await fetch(`/api/verificar/${recetaId}`);

        if (res.status === 429) {
          setErrorMsg("Demasiadas consultas. Intentá en un minuto.");
          setEstado("error");
          return;
        }

        const json: VerificacionResponse = await res.json();
        setData(json);

        if (json.motivo) {
          setEstado("no_encontrada");
        } else if (json.alterada) {
          setEstado("alterada");
        } else if (json.verificada) {
          setEstado("verificada");
        } else {
          setEstado("invalida");
        }
      } catch {
        setErrorMsg("Error de conexión. Intentá de nuevo.");
        setEstado("error");
      }
    }

    verificar();
  }, [recetaId]);

  // ─── Cargando ──────────────────────────────────────────────────────
  if (estado === "cargando") {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm" style={{ border: "0.5px solid #e5e7eb" }}>
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#378ADD]" />
        <p className="mt-4 text-sm text-gray-500">Verificando receta...</p>
      </div>
    );
  }

  // ─── Error / Rate limit ────────────────────────────────────────────
  if (estado === "error") {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm" style={{ border: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#E24B4A]/10">
          <AlertTriangle className="h-7 w-7 text-[#E24B4A]" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Error</h2>
        <p className="mt-2 text-sm text-gray-600">{errorMsg}</p>
      </div>
    );
  }

  // ─── No encontrada ─────────────────────────────────────────────────
  if (estado === "no_encontrada") {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm" style={{ border: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          <ShieldX className="h-7 w-7 text-gray-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Receta no encontrada</h2>
        <p className="mt-2 text-sm text-gray-600">
          No se encontró una receta con este identificador. Verificá que la URL sea
          correcta.
        </p>
        <p className="mt-4 text-xs text-gray-400">
          Si creés que es un error, contactá a{" "}
          <a href="https://docto.com.ar" className="text-[#378ADD] hover:underline">
            docto.com.ar
          </a>
        </p>
      </div>
    );
  }

  // ─── Alterada ──────────────────────────────────────────────────────
  if (estado === "alterada") {
    return (
      <div className="rounded-2xl bg-[#E24B4A]/5 p-8 text-center shadow-sm" style={{ border: "1px solid #E24B4A" }}>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#E24B4A]/10">
          <AlertTriangle className="h-7 w-7 text-[#E24B4A]" />
        </div>
        <h2 className="text-lg font-semibold text-[#E24B4A]">
          Documento alterado
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          El contenido de esta receta fue modificado después de ser firmada. La
          firma electrónica ya no es válida.
        </p>
        {data?.medico && (
          <div className="mt-4 rounded-lg bg-white p-3 text-left">
            <p className="text-xs text-gray-400">Firmante original</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{data.medico.nombre}</p>
            <p className="text-xs text-gray-500">{data.medico.especialidad} — {data.medico.matricula}</p>
            {data.firmado_at && (
              <p className="mt-1 text-xs text-gray-500">
                Firmado: {new Date(data.firmado_at).toLocaleDateString("es-AR", {
                  day: "2-digit", month: "long", year: "numeric",
                  timeZone: "America/Argentina/Buenos_Aires",
                })} — {new Date(data.firmado_at).toLocaleTimeString("es-AR", {
                  hour: "2-digit", minute: "2-digit", hour12: false,
                  timeZone: "America/Argentina/Buenos_Aires",
                })} hs
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Inválida (firma no verifica) ──────────────────────────────────
  if (estado === "invalida") {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm" style={{ border: "1px solid #D85A30" }}>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#D85A30]/10">
          <ShieldX className="h-7 w-7 text-[#D85A30]" />
        </div>
        <h2 className="text-lg font-semibold text-[#D85A30]">
          Firma no válida
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          No se pudo verificar la autenticidad de esta receta. La firma
          electrónica no corresponde al contenido del documento.
        </p>
      </div>
    );
  }

  // ─── Verificada ────────────────────────────────────────────────────
  const fechaFirma = data?.firmado_at
    ? new Date(data.firmado_at).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "America/Argentina/Buenos_Aires",
      })
    : "";
  const horaFirma = data?.firmado_at
    ? new Date(data.firmado_at).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Argentina/Buenos_Aires",
      })
    : "";

  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm" style={{ border: "1px solid #1D9E75" }}>
      {/* Badge verificada */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#1D9E75]/10">
          <ShieldCheck className="h-7 w-7 text-[#1D9E75]" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">
          Receta verificada
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Esta receta fue firmada electrónicamente y su contenido no fue
          alterado.
        </p>
      </div>

      {/* Datos del firmante */}
      {data?.medico && (
        <div className="mt-6 rounded-lg bg-gray-50 p-4">
          <p className="text-xs font-medium tracking-wide text-gray-400">
            FIRMANTE
          </p>
          <p className="mt-2 text-sm font-semibold text-gray-900">
            {data.medico.nombre}
          </p>
          <p className="mt-0.5 text-sm text-gray-600">
            {data.medico.especialidad}
          </p>
          <p className="mt-0.5 text-sm text-gray-500">
            {data.medico.matricula}
          </p>
        </div>
      )}

      {/* Datos técnicos de la firma */}
      <div className="mt-4 space-y-2 rounded-lg bg-gray-50 p-4">
        <p className="text-xs font-medium tracking-wide text-gray-400">
          DATOS DE LA FIRMA
        </p>
        {fechaFirma && (
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Fecha</span>
            <span className="text-xs font-medium text-gray-700">
              {fechaFirma} — {horaFirma} hs
            </span>
          </div>
        )}
        {data?.algoritmo && (
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Algoritmo</span>
            <span className="text-xs font-medium text-gray-700">
              {data.algoritmo}
            </span>
          </div>
        )}
        {data?.hash && (
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Hash</span>
            <span className="truncate text-right font-mono text-xs text-gray-500">
              {data.hash.substring(0, 16).toUpperCase()}...
            </span>
          </div>
        )}
      </div>

      {/* Legal */}
      <p className="mt-4 text-center text-[11px] leading-relaxed text-gray-400">
        Firma electrónica conforme al Art. 5 de la Ley 25.506. Este documento
        no muestra información médica del paciente por razones de privacidad.
      </p>
    </div>
  );
}
