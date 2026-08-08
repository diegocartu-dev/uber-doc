"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  EVENTO_DOCUMENTACION_PENDIENTE,
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
// DOS COSAS QUE NO SON OBVIAS Y SON EL 90% DE ESTE ARCHIVO:
//
// 1. El cartel tiene que aparecer en ESTA visita, no en la próxima. La falla
//    ocurre medio segundo DESPUÉS de que el dashboard montó (el guardado corre
//    en background tras el `router.push`). Leer localStorage una sola vez al
//    montar encontraba siempre vacío, y el evento `storage` del navegador NO se
//    dispara en la pestaña que escribe. Por eso se escucha un CustomEvent
//    propio, que la marca emite al escribirse.
//
// 2. El cartel se verifica contra el servidor antes de creerle a la marca local.
//    Sin eso puede mentir de dos maneras: quedarse mostrando un aviso de algo
//    que ya se entregó, y ofrecer "Completar ahora" hacia una pantalla que
//    rechaza la atención ya cerrada y devuelve al dashboard — un loop con un
//    cartel imposible de resolver. Si el chequeo no responde (offline, que es
//    justo el escenario que causa la falla), se muestra igual: la marca local es
//    la mitad offline del aviso y vale más que el silencio.
//
// Ámbar #BA7517: es un pendiente que el médico puede resolver, no un error roto.

/** `reabrible` en null = todavía no se verificó (o el chequeo no respondió). */
type EstadoServidor = { entregado: boolean; reabrible: boolean };

export default function AvisoDocumentacionPendiente() {
  const [pendientes, setPendientes] = useState<DocumentacionPendiente[]>([]);
  const [estados, setEstados] = useState<Record<string, EstadoServidor>>({});
  // Qué combinación de atenciones ya se verificó, para no repetir el chequeo en
  // cada re-render.
  const verificadoRef = useRef<string>("");

  const releer = useCallback(() => {
    setPendientes(leerDocumentacionPendiente());
  }, []);

  // localStorage solo existe en el navegador, así que se lee después del montaje
  // (leerlo en el render daría hydration mismatch: el servidor no lo ve).
  // Es justamente el caso que la regla contempla — sincronizar con un sistema
  // externo —, pero el lint no puede distinguirlo.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    releer();
    // CustomEvent: misma pestaña (la falla ocurre acá mismo, después del redirect).
    window.addEventListener(EVENTO_DOCUMENTACION_PENDIENTE, releer);
    // `storage`: otras pestañas del mismo médico.
    window.addEventListener("storage", releer);
    return () => {
      window.removeEventListener(EVENTO_DOCUMENTACION_PENDIENTE, releer);
      window.removeEventListener("storage", releer);
    };
  }, [releer]);

  // Verificación contra el servidor de las marcas que hay ahora.
  useEffect(() => {
    if (pendientes.length === 0) return;
    const clave = pendientes.map((p) => `${p.tipo}:${p.id}`).join("|");
    if (verificadoRef.current === clave) return;
    verificadoRef.current = clave;

    let cancelado = false;
    fetch("/api/medico/documentos-pendientes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accion: "estado",
        items: pendientes.map((p) => ({ id: p.id, tipo: p.tipo })),
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { estados?: { id: string; entregado: boolean; reabrible: boolean }[] } | null) => {
        if (cancelado || !d?.estados) return;
        const mapa: Record<string, EstadoServidor> = {};
        for (const e of d.estados) {
          mapa[e.id] = { entregado: !!e.entregado, reabrible: !!e.reabrible };
        }
        setEstados(mapa);
        // Auto-curación: lo que el servidor dice que ya está entregado deja de
        // ser un pendiente. Sin esto el cartel quedaba pegado para siempre
        // aunque el médico ya hubiera reenviado todo.
        for (const e of d.estados) {
          if (e.entregado) descartarDocumentacionPendiente(e.id);
        }
      })
      .catch(() => {
        // Sin red no se puede verificar. El cartel se muestra igual (con el CTA
        // optimista): perder el aviso es peor que un CTA que quizá no aplique.
      });

    return () => {
      cancelado = true;
    };
  }, [pendientes]);

  function descartar(id: string) {
    descartarDocumentacionPendiente(id);
    setPendientes((prev) => prev.filter((p) => p.id !== id));
  }

  const visibles = pendientes.filter((p) => !estados[p.id]?.entregado);
  if (visibles.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      {visibles.map((p) => {
        const hora = horaCorta(p.hora);
        const cuando = hora ? `de las ${hora}` : "reciente";
        // Sin respuesta del servidor todavía → se asume que puede volver a
        // entrar (es el caso normal: la consulta quedó abierta a propósito).
        const puedeVolver = estados[p.id] ? estados[p.id].reabrible : true;
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
                  Lo que escribiste no se perdi&oacute;: qued&oacute; guardado.{" "}
                  {puedeVolver
                    ? "Entrá y tocá «Finalizar consulta» para completarla."
                    : "La consulta ya figura cerrada y no vas a poder volver a entrar: escribinos y la reenviamos nosotros."}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <a
                    href={puedeVolver ? urlDeAtencion(p) : "/ayuda"}
                    className="inline-flex items-center justify-center rounded-lg px-4 text-sm font-medium text-white transition active:scale-95"
                    style={{ backgroundColor: "#378ADD", minHeight: "44px" }}
                  >
                    {puedeVolver ? "Completar ahora" : "Escribirnos"}
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
