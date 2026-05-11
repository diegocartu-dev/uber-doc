"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { User, Wallet } from "lucide-react";
import NovaToggle from "./NovaToggle";
import TabCobros from "./TabCobros";

type Tab = "datos" | "cobros";

const TABS: { key: Tab; label: string; icon: typeof User }[] = [
  { key: "datos", label: "Mis datos", icon: User },
  { key: "cobros", label: "Cobros", icon: Wallet },
];

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
}

export default function PerfilClient({
  medico,
  mpAccount,
}: {
  medico: Medico;
  mpAccount: MpAccount | null;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(tabParam === "cobros" ? "cobros" : "datos");
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "error" } | null>(null);

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success === "connected") {
      setToast({ msg: "¡Cuenta MP conectada con éxito!", type: "ok" });
      setTab("cobros");
    } else if (success === "disconnected") {
      setToast({ msg: "Tu cuenta de Mercado Pago fue desconectada correctamente.", type: "ok" });
      setTab("cobros");
    } else if (error === "invalid_state") {
      setToast({ msg: "La conexión expiró o es inválida. Probá de nuevo.", type: "error" });
      setTab("cobros");
    } else if (error === "token_exchange_failed") {
      setToast({ msg: "Mercado Pago rechazó la conexión. Probá de nuevo en unos minutos.", type: "error" });
      setTab("cobros");
    } else if (error === "mp_account_already_linked") {
      setTab("cobros");
    } else if (error) {
      setToast({ msg: "Algo salió mal con la conexión a Mercado Pago. Probá de nuevo.", type: "error" });
      setTab("cobros");
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

  function handleTabChange(key: Tab) {
    setTab(key);
    const url = new URL(window.location.href);
    if (key === "cobros") {
      url.searchParams.set("tab", "cobros");
    } else {
      url.searchParams.delete("tab");
    }
    url.searchParams.delete("success");
    url.searchParams.delete("error");
    router.replace(url.pathname + url.search, { scroll: false });
  }

  const errorParam = searchParams.get("error");

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      {toast && (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-sm font-medium text-white"
          style={{ backgroundColor: toast.type === "ok" ? "#1D9E75" : "#E24B4A" }}
        >
          {toast.msg}
        </div>
      )}

      <p className="text-xs font-medium tracking-wide text-gray-400">MI PERFIL</p>
      <p className="mt-3 text-2xl font-medium text-gray-900">{medico.nombre_completo}</p>
      <p className="mt-1 text-sm text-gray-500">{medico.especialidad}</p>

      <div className="mt-5 flex gap-1 border-b border-gray-200">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key
                ? "text-[#378ADD] border-b-2 border-[#378ADD]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "datos" && <TabDatos medico={medico} />}
        {tab === "cobros" && (
          <TabCobros
            mpAccount={mpAccount}
            errorParam={errorParam}
          />
        )}
      </div>
    </main>
  );
}

function TabDatos({ medico }: { medico: Medico }) {
  return (
    <>
      <div
        className="rounded-xl bg-white p-6"
        style={{ border: "0.5px solid #e5e7eb" }}
      >
        <p className="text-xs font-medium tracking-wide text-gray-400">
          DATOS PROFESIONALES
        </p>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-gray-400">Matrícula</p>
            <p className="mt-0.5 text-gray-700">
              {medico.tipo_matricula} {medico.numero_matricula}
            </p>
          </div>
          {medico.provincia && (
            <div>
              <p className="text-xs text-gray-400">Provincia</p>
              <p className="mt-0.5 text-gray-700">{medico.provincia}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400">Email</p>
            <p className="mt-0.5 text-gray-700">{medico.email}</p>
          </div>
          {medico.precio_consulta && (
            <div>
              <p className="text-xs text-gray-400">Precio consulta</p>
              <p className="mt-0.5 text-gray-700">${medico.precio_consulta}</p>
            </div>
          )}
          {medico.duracion_consulta && (
            <div>
              <p className="text-xs text-gray-400">Duración</p>
              <p className="mt-0.5 text-gray-700">{medico.duracion_consulta} min</p>
            </div>
          )}
          {medico.modalidad_atencion && (
            <div>
              <p className="text-xs text-gray-400">Modalidad</p>
              <p className="mt-0.5 text-gray-700 capitalize">
                {medico.modalidad_atencion}
              </p>
            </div>
          )}
        </div>
      </div>

      <div
        className="mt-6 rounded-xl bg-white p-6"
        style={{ border: "0.5px solid #e5e7eb" }}
      >
        <NovaToggle
          medicoId={medico.id}
          initialValue={medico.nova_evolucion_activa ?? false}
        />
      </div>
    </>
  );
}
