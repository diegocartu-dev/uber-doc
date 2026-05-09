"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  UserPlus,
  Shield,
  ShieldOff,
  RotateCcw,
} from "lucide-react";
import StatusBadge from "../../components/StatusBadge";
import ConfirmDialog from "../../components/ConfirmDialog";

interface Admin {
  id: string;
  user_id: string;
  email: string;
  nivel: string;
  activo: boolean;
  creado_en: string;
  ultimo_login: string | null;
  desactivado_en: string | null;
  motivo_desactivacion: string | null;
}

export default function AdministradoresTab() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCrear, setShowCrear] = useState(false);
  const [email, setEmail] = useState("");
  const [nivel, setNivel] = useState<"admin" | "super_admin">("admin");
  const [procesando, setProcesando] = useState(false);
  const [confirmando, setConfirmando] = useState<{
    id: string;
    accion: string;
  } | null>(null);
  const [mensaje, setMensaje] = useState<{
    texto: string;
    tipo: "ok" | "error";
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/administradores")
      .then((r) => r.json())
      .then((data) => setAdmins(data.administradores ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function crearAdmin() {
    if (!email) return;
    setProcesando(true);
    setMensaje(null);
    try {
      const res = await fetch("/api/admin/administradores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, nivel }),
      });
      const data = await res.json();
      if (data.ok) {
        setMensaje({
          texto: data.reactivado
            ? "Admin reactivado"
            : "Admin creado exitosamente",
          tipo: "ok",
        });
        setShowCrear(false);
        setEmail("");
        // Recargar lista
        const res2 = await fetch("/api/admin/administradores");
        const data2 = await res2.json();
        setAdmins(data2.administradores ?? []);
      } else {
        setMensaje({ texto: data.error || "Error", tipo: "error" });
      }
    } catch {
      setMensaje({ texto: "Error de conexion", tipo: "error" });
    }
    setProcesando(false);
  }

  async function desactivarAdmin(adminId: string, motivo?: string) {
    setProcesando(true);
    try {
      const res = await fetch("/api/admin/administradores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId, accion: "desactivar", motivo }),
      });
      if (res.ok) {
        setAdmins((prev) =>
          prev.map((a) =>
            a.id === adminId ? { ...a, activo: false } : a
          )
        );
        setMensaje({ texto: "Admin desactivado", tipo: "ok" });
      }
    } catch {
      setMensaje({ texto: "Error de conexion", tipo: "error" });
    }
    setProcesando(false);
    setConfirmando(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  const activos = admins.filter((a) => a.activo);
  const inactivos = admins.filter((a) => !a.activo);

  return (
    <div className="space-y-6">
      {mensaje && (
        <p
          className={`text-center text-sm ${mensaje.tipo === "ok" ? "text-[#1D9E75]" : "text-[#E24B4A]"}`}
        >
          {mensaje.texto}
        </p>
      )}

      {/* Header + boton crear */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Administradores activos ({activos.length})
        </h2>
        <button
          onClick={() => setShowCrear(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#378ADD] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2d75c4]"
        >
          <UserPlus size={14} /> Agregar admin
        </button>
      </div>

      {/* Form crear */}
      {showCrear && (
        <div
          className="rounded-xl bg-white p-5"
          style={{ border: "1px solid #e5e7eb" }}
        >
          <h3 className="text-sm font-medium text-gray-900">
            Agregar administrador
          </h3>
          <p className="mt-1 text-xs text-gray-400">
            El email debe tener cuenta creada en la plataforma
          </p>
          <div className="mt-3 flex gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@ejemplo.com"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#378ADD] focus:outline-none"
            />
            <select
              value={nivel}
              onChange={(e) =>
                setNivel(e.target.value as "admin" | "super_admin")
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#378ADD] focus:outline-none"
            >
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={crearAdmin}
              disabled={procesando || !email}
              className="rounded-lg bg-[#378ADD] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {procesando ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                "Crear"
              )}
            </button>
            <button
              onClick={() => {
                setShowCrear(false);
                setEmail("");
              }}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista activos */}
      <div className="space-y-2">
        {activos.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between rounded-xl bg-white p-4"
            style={{ border: "1px solid #e5e7eb" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{
                  backgroundColor:
                    a.nivel === "super_admin" ? "#378ADD15" : "#88878015",
                }}
              >
                <Shield
                  size={16}
                  style={{
                    color:
                      a.nivel === "super_admin" ? "#378ADD" : "#888780",
                  }}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {a.email}
                </p>
                <p className="text-xs text-gray-400">
                  {a.nivel === "super_admin" ? "Super Admin" : "Admin"} ·
                  Desde{" "}
                  {new Date(a.creado_en).toLocaleDateString("es-AR")}
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                setConfirmando({ id: a.id, accion: "desactivar" })
              }
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-[#E24B4A]"
            >
              <ShieldOff size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Inactivos */}
      {inactivos.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
            Desactivados ({inactivos.length})
          </h2>
          <div className="space-y-2">
            {inactivos.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-xl bg-gray-50 p-4"
                style={{ border: "1px solid #e5e7eb" }}
              >
                <div>
                  <p className="text-sm text-gray-500">{a.email}</p>
                  <p className="text-xs text-gray-400">
                    {a.motivo_desactivacion || "Sin motivo"}
                  </p>
                </div>
                <StatusBadge status="desactivado" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={() => setConfirmando(null)}
        >
          <div
            className="mx-4 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <ConfirmDialog
              title="Desactivar administrador?"
              description="El admin no podra acceder al panel. Podes reactivarlo despues."
              confirmLabel="Si, desactivar"
              variant="danger"
              requireReason
              reasonPlaceholder="Motivo..."
              onConfirm={(motivo) =>
                desactivarAdmin(confirmando.id, motivo ?? undefined)
              }
              onCancel={() => setConfirmando(null)}
              isLoading={procesando}
            />
          </div>
        </div>
      )}
    </div>
  );
}
