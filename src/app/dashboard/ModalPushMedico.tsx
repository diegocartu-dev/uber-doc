"use client";

import { useState, useEffect } from "react";
import { Bell, Share, CheckCircle2 } from "lucide-react";
import { pushSoportado, pushYaActivo, pushRechazado, esIOSSinPWA, suscribirPush } from "@/lib/push-client";

type Estado =
  | "oculto"        // ya activo / no soportado / pospuesto esta sesión
  | "push-listo"    // puede activar con un toque
  | "ios-sin-pwa"   // iPhone sin la app instalada → instrucciones
  | "rechazado"     // permiso denegado → instrucciones para desbloquear
  | "exito";        // recién activado

const SKIP_KEY = "docto_push_modal_skip";

/**
 * Pop-up OBLIGATORIO de notificaciones para médicos (decisión Diego 11/06/2026).
 *
 * Un médico sin push en el celular no se entera de pacientes nuevos salvo que
 * esté mirando la app — inaceptable para consulta inmediata. Este modal aparece
 * en CADA visita al dashboard hasta que las notificaciones queden activas en el
 * dispositivo. "Ahora no" solo lo pospone para la sesión actual (vuelve a
 * aparecer en la próxima), para no dejar a nadie bloqueado si su dispositivo
 * tiene un problema.
 */
export default function ModalPushMedico() {
  const [estado, setEstado] = useState<Estado>("oculto");
  const [activando, setActivando] = useState(false);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SKIP_KEY) === "1") return;

    if (esIOSSinPWA()) {
      setEstado("ios-sin-pwa");
      return;
    }
    if (!pushSoportado()) return; // navegador raro: no bloquear
    if (pushRechazado()) {
      setEstado("rechazado");
      return;
    }
    if (pushYaActivo()) {
      // Permiso OK pero puede no haber suscripción local registrada
      navigator.serviceWorker?.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setEstado(sub ? "oculto" : "push-listo"))
        .catch(() => setEstado("push-listo"));
      return;
    }
    setEstado("push-listo");
  }, []);

  async function activar() {
    setActivando(true);
    setFallo(false);
    const ok = await suscribirPush("medico");
    setActivando(false);
    if (ok) {
      setEstado("exito");
      setTimeout(() => setEstado("oculto"), 2500);
    } else {
      if (pushRechazado()) setEstado("rechazado");
      else setFallo(true);
    }
  }

  function posponer() {
    sessionStorage.setItem(SKIP_KEY, "1");
    setEstado("oculto");
  }

  if (estado === "oculto") return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        {estado === "exito" ? (
          <div className="py-6 text-center">
            <CheckCircle2 size={48} strokeWidth={1.5} className="mx-auto" style={{ color: "#1D9E75" }} />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">¡Notificaciones activadas!</h2>
            <p className="mt-1.5 text-sm text-gray-500">
              Te va a sonar el teléfono cuando un paciente te espere — aunque tengas la app cerrada.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(55,138,221,0.1)" }}>
                <Bell size={22} strokeWidth={1.75} style={{ color: "#378ADD" }} />
              </div>
              <h2 className="text-lg font-semibold leading-snug text-gray-900">
                Activá las notificaciones para atender
              </h2>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Cuando un paciente pide una consulta, <strong>te avisamos al teléfono</strong> — no
              hace falta que estés mirando Docto. Sin esto, no te enterás de los pacientes
              que te esperan.
            </p>

            {estado === "ios-sin-pwa" && (
              <div className="mt-4 rounded-xl bg-[#f8f9fa] p-4" style={{ border: "0.5px solid #e5e7eb" }}>
                <p className="text-sm font-semibold text-gray-900">En iPhone, primero instalá Docto:</p>
                <ol className="mt-2 space-y-1.5 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <span className="font-semibold text-[#378ADD]">1.</span>
                    Tocá el botón <Share size={15} className="inline text-[#378ADD]" /> <strong>Compartir</strong> de Safari
                  </li>
                  <li><span className="font-semibold text-[#378ADD]">2.</span> Elegí <strong>"Agregar a pantalla de inicio"</strong></li>
                  <li><span className="font-semibold text-[#378ADD]">3.</span> Abrí Docto <strong>desde el ícono nuevo</strong> y volvé acá</li>
                </ol>
                <p className="mt-2 text-xs text-gray-400">
                  Apple solo permite notificaciones a apps instaladas en la pantalla de inicio.
                </p>
              </div>
            )}

            {estado === "rechazado" && (
              <div className="mt-4 rounded-xl p-4" style={{ backgroundColor: "rgba(226,75,74,0.08)", border: "0.5px solid rgba(226,75,74,0.3)" }}>
                <p className="text-sm font-semibold text-gray-900">Las notificaciones están bloqueadas en este dispositivo.</p>
                <p className="mt-1.5 text-sm text-gray-600">
                  Andá a los <strong>Ajustes</strong> de tu teléfono → <strong>Notificaciones</strong> → buscá{" "}
                  <strong>Docto</strong> y activalas. Después recargá esta página.
                </p>
              </div>
            )}

            {estado === "push-listo" && (
              <>
                {fallo && (
                  <p className="mt-3 text-sm" style={{ color: "#E24B4A" }}>
                    No se pudo activar. Probá de nuevo — si pedís permiso y no aparece nada, recargá la página.
                  </p>
                )}
                <button
                  type="button"
                  onClick={activar}
                  disabled={activando}
                  className="mt-5 w-full rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition-all duration-100 active:scale-[0.98] disabled:opacity-60"
                  style={{ backgroundColor: "#378ADD", minHeight: "52px" }}
                >
                  {activando ? "Activando…" : "Activar notificaciones"}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={posponer}
              className="mt-3 w-full text-center text-xs font-medium text-gray-400 hover:text-gray-600"
              style={{ minHeight: "40px" }}
            >
              Ahora no
            </button>
          </>
        )}
      </div>
    </div>
  );
}
