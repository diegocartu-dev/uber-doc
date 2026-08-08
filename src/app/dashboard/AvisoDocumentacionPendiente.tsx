"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  descartarDocumentacionPendiente,
  horaCorta,
  leerDocumentacionPendiente,
  urlDeAtencion,
  type DocumentacionPendiente,
} from "@/lib/documentacion-pendiente";

// Cartel del dashboard del médico: "quedó documentación sin entregar".
//
// El guardado de documentos corre DESPUÉS del redirect al dashboard, así que
// cuando falla no hay pantalla donde avisar. El workspace deja una marca en el
// navegador (lib/documentacion-pendiente) y este cartel la levanta acá, que es
// exactamente adonde el médico llega. La campanita recibe además el aviso
// persistente, para cuando el médico vuelve desde otro equipo.
//
// Ámbar #BA7517: es un pendiente que el médico puede resolver, no un error roto.

export default function AvisoDocumentacionPendiente() {
  const [pendientes, setPendientes] = useState<DocumentacionPendiente[]>([]);

  // localStorage solo existe en el navegador, así que se lee después del montaje
  // (leerlo en el render daría hydration mismatch: el servidor no lo ve).
  // Es justamente el caso que la regla contempla — sincronizar con un sistema
  // externo —, pero el lint no puede distinguirlo, y corre una sola vez.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendientes(leerDocumentacionPendiente());
  }, []);

  function descartar(id: string) {
    descartarDocumentacionPendiente(id);
    setPendientes((prev) => prev.filter((p) => p.id !== id));
  }

  if (pendientes.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      {pendientes.map((p) => {
        const hora = horaCorta(p.hora);
        const cuando = hora ? `de las ${hora}` : "reciente";
        return (
          <div
            key={p.id}
            className="rounded-xl bg-[#BA7517]/10 p-4"
            style={{ border: "1px solid #BA7517" }}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-[#BA7517]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  Qued&oacute; documentaci&oacute;n sin entregar en tu consulta {cuando}
                </p>
                <p className="mt-1 text-sm text-gray-700">
                  {p.motivo === "cierre"
                    ? "El paciente recibió los documentos, pero no se pudo guardar la evolución."
                    : "El paciente NO recibió los documentos."}{" "}
                  Lo que escribiste no se perdi&oacute;: qued&oacute; guardado. Entr&aacute; y
                  toc&aacute; &laquo;Finalizar consulta&raquo; para completarla.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <a
                    href={urlDeAtencion(p)}
                    className="inline-flex items-center justify-center rounded-lg px-4 text-sm font-medium text-white transition active:scale-95"
                    style={{ backgroundColor: "#378ADD", minHeight: "44px" }}
                  >
                    Completar ahora
                  </a>
                  <button
                    type="button"
                    onClick={() => descartar(p.id)}
                    className="text-sm text-[#888780] underline underline-offset-2"
                    style={{ minHeight: "44px" }}
                  >
                    Ya lo resolv&iacute;
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
