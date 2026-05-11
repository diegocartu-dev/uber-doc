"use client";

import { useState } from "react";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";

interface MpAccount {
  mp_user_id: string;
  estado: string;
  conectado_en: string;
  expires_at: string;
  public_key: string | null;
}

export default function TabCobros({
  mpAccount,
  errorParam,
}: {
  mpAccount: MpAccount | null;
  errorParam: string | null;
}) {
  if (errorParam === "mp_account_already_linked") {
    return <EstadoD />;
  }

  if (!mpAccount || mpAccount.estado === "revocado") {
    return <EstadoA />;
  }

  if (mpAccount.estado === "activo" && new Date(mpAccount.expires_at) > new Date()) {
    return <EstadoB mpAccount={mpAccount} />;
  }

  return <EstadoC />;
}

function EstadoA() {
  return (
    <div
      className="rounded-xl bg-white p-6"
      style={{ border: "0.5px solid #e5e7eb" }}
    >
      <p className="text-base font-semibold text-gray-900">
        Conectá tu cuenta de Mercado Pago
      </p>
      <p className="mt-2 text-sm text-gray-600" style={{ lineHeight: 1.6 }}>
        Para recibir pagos de tus consultas directamente en tu cuenta MP,
        necesitás conectarla. Docto nunca toca tu plata — los pagos van
        directo a vos.
      </p>
      <a
        href="/api/mp/oauth/start"
        className="mt-5 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
        style={{ backgroundColor: "#378ADD", minHeight: 44 }}
      >
        Conectar Mercado Pago
      </a>
      <p className="mt-3 text-xs text-gray-400">
        La conexión es segura y la podés desconectar cuando quieras.
      </p>
    </div>
  );
}

function EstadoB({ mpAccount }: { mpAccount: MpAccount }) {
  const [showModal, setShowModal] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDisconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/mp/oauth/disconnect", { method: "POST" });
      if (res.ok) {
        window.location.href = "/medico/perfil?tab=cobros&success=disconnected";
      } else {
        setError("No se pudo desconectar. Probá de nuevo en unos minutos.");
        setShowModal(false);
      }
    } catch {
      setError("Error de conexión. Verificá tu internet y probá de nuevo.");
      setShowModal(false);
    } finally {
      setDisconnecting(false);
    }
  }

  const conectadoFmt = new Date(mpAccount.conectado_en).toLocaleDateString(
    "es-AR",
    { day: "numeric", month: "long", year: "numeric" }
  );
  const expiraFmt = new Date(mpAccount.expires_at).toLocaleDateString(
    "es-AR",
    { day: "numeric", month: "long", year: "numeric" }
  );

  return (
    <>
      {error && (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-sm font-medium text-white"
          style={{ backgroundColor: "#E24B4A" }}
        >
          {error}
        </div>
      )}
      <div
        className="rounded-xl p-6"
        style={{ backgroundColor: "#E8F5F0", border: "0.5px solid #A3D9C4" }}
      >
        <div className="flex items-center gap-2">
          <CheckCircle size={20} strokeWidth={1.75} color="#1D9E75" />
          <p className="text-base font-semibold text-gray-900">
            Tu cuenta MP está conectada
          </p>
        </div>

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-gray-500">Cuenta MP</p>
            <p className="mt-0.5 text-gray-700">#{mpAccount.mp_user_id}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Conectada el</p>
            <p className="mt-0.5 text-gray-700">{conectadoFmt}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Próxima renovación</p>
            <p className="mt-0.5 text-gray-700">{expiraFmt}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-red-50"
            style={{
              borderColor: "#E24B4A",
              color: "#E24B4A",
              minHeight: 44,
            }}
          >
            Desconectar
          </button>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Si desconectás, no vas a poder recibir nuevos pagos hasta que vuelvas
          a conectar.
        </p>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/40 px-4"
          style={{ zIndex: 9999 }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <XCircle size={20} strokeWidth={1.75} color="#E24B4A" />
              <p className="text-base font-semibold text-gray-900">
                ¿Desconectar Mercado Pago?
              </p>
            </div>
            <p className="mt-3 text-sm text-gray-600">
              Si desconectás tu cuenta, no vas a poder recibir pagos de
              consultas hasta que vuelvas a conectar. ¿Estás seguro?
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "#E24B4A" }}
              >
                {disconnecting ? "Desconectando..." : "Sí, desconectar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EstadoC() {
  return (
    <div
      className="rounded-xl p-6"
      style={{ backgroundColor: "#FEF6E8", border: "0.5px solid #E8C98A" }}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={20} strokeWidth={1.75} color="#BA7517" />
        <p className="text-base font-semibold text-gray-900">
          Tu conexión con MP expiró
        </p>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Volvé a conectar para seguir recibiendo pagos.
      </p>
      <a
        href="/api/mp/oauth/start"
        className="mt-4 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
        style={{ backgroundColor: "#378ADD", minHeight: 44 }}
      >
        Reconectar
      </a>
    </div>
  );
}

function EstadoD() {
  return (
    <div
      className="rounded-xl p-6"
      style={{ backgroundColor: "#FEF6E8", border: "0.5px solid #E8C98A" }}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={20} strokeWidth={1.75} color="#BA7517" />
        <p className="text-base font-semibold text-gray-900">
          Cuenta ya vinculada
        </p>
      </div>
      <p className="mt-2 text-sm text-gray-600" style={{ lineHeight: 1.6 }}>
        Esta cuenta de Mercado Pago ya está vinculada a otro profesional en
        Docto. Conectá con una cuenta MP diferente, o si creés que es un error,
        escribinos a{" "}
        <a href="mailto:soporte@docto.com.ar" className="text-[#378ADD] underline">
          soporte@docto.com.ar
        </a>
        .
      </p>
      <a
        href="/api/mp/oauth/start"
        className="mt-4 inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
        style={{ backgroundColor: "#378ADD", minHeight: 44 }}
      >
        Intentar con otra cuenta
      </a>
    </div>
  );
}
