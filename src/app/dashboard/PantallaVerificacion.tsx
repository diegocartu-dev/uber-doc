"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { comprimirImagenesDeFormData } from "@/lib/imagenes/comprimir";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Clock, ShieldX, ShieldAlert, Stethoscope, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import LogoutButton from "./LogoutButton";
import { resubirCredencial } from "./credencial-actions";

const estadoConfig = {
  pendiente_revision: {
    titulo: "Tu cuenta está siendo revisada",
    desc: "Estamos validando tu matrícula profesional. En menos de 24 horas te habilitamos para empezar a atender. Te avisamos por email cuando tu cuenta esté activa.",
    icon: Clock,
    color: "#BA7517",
    bgColor: "rgba(186, 117, 23, 0.1)",
    showContact: false,
  },
  rechazado: {
    titulo: "Tu registro fue rechazado",
    desc: "No pudimos verificar tu matrícula profesional. Si creés que es un error, contactanos para resolverlo.",
    icon: ShieldX,
    color: "#E24B4A",
    bgColor: "rgba(226, 75, 74, 0.1)",
    showContact: true,
  },
  suspendido: {
    titulo: "Tu cuenta está suspendida",
    desc: "Tu cuenta fue suspendida temporalmente. Contactanos para más información.",
    icon: ShieldAlert,
    color: "#E24B4A",
    bgColor: "rgba(226, 75, 74, 0.1)",
    showContact: true,
  },
} as const;

interface Props {
  fullName: string;
  email: string;
  estadoRegistro: string;
  especialidad: string;
  tipoMatricula: string;
  numeroMatricula: string;
  fotoCredencialUrl: string | null;
  userId: string;
}

export default function PantallaVerificacion({
  fullName,
  email,
  estadoRegistro,
  especialidad,
  tipoMatricula,
  numeroMatricula,
  fotoCredencialUrl,
  userId,
}: Props) {
  const router = useRouter();
  const estado = estadoConfig[estadoRegistro as keyof typeof estadoConfig] ?? estadoConfig.pendiente_revision;
  const IconComponent = estado.icon;

  const [mostrarResubir, setMostrarResubir] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [msgCredencial, setMsgCredencial] = useState<{ ok: boolean; text: string } | null>(null);

  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — mismo límite que valida el servidor.

  async function handleResubir(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    // Mismo fix que el registro (01/08): las fotos de celular superan el límite
    // de la plataforma y el envío moría con un error incomprensible.
    await comprimirImagenesDeFormData(fd, ["foto_credencial", "credencial"]);
    const f = fd.get("credencial");
    if (!(f instanceof File) || f.size === 0) {
      setMsgCredencial({ ok: false, text: "Elegí la credencial de tu matrícula." });
      return;
    }
    if (f.size > MAX_BYTES) {
      setMsgCredencial({ ok: false, text: "El archivo es muy grande (máximo 10 MB)." });
      return;
    }
    setSubiendo(true);
    setMsgCredencial(null);
    const res = await resubirCredencial(fd);
    setSubiendo(false);
    if (res.ok) {
      setMsgCredencial({
        ok: true,
        text: "¡Listo! Recibimos tu credencial. La revisamos y te avisamos por email cuando tu cuenta esté activa.",
      });
      form.reset();
      setNombreArchivo(null);
    } else {
      setMsgCredencial({
        ok: false,
        text: res.error ?? "No pudimos subir el archivo. Probá de nuevo o escribinos a hola@docto.com.ar",
      });
    }
  }

  useEffect(() => {
    const supabase = createClient();
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("medicos")
        .select("verificado, estado_registro")
        .eq("user_id", userId)
        .single();

      if (data?.verificado && data.estado_registro === "aprobado") {
        router.refresh();
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, [userId, router]);

  return (
    <div className="min-h-full bg-[#f8f9fa]">
      <nav className="bg-white" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto max-w-7xl px-4 lg:px-6">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope size={24} strokeWidth={2} color="#378ADD" />
              <span className="text-lg font-bold lowercase text-gray-900">docto</span>
            </div>
            <LogoutButton />
          </div>
        </div>
      </nav>
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: estado.bgColor }}
        >
          <IconComponent size={28} strokeWidth={1.75} style={{ color: estado.color }} />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">{estado.titulo}</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-500">{estado.desc}</p>

        {/* Antes era un `mailto:`: en un celular sin cliente de correo
            configurado no hacía nada y el médico quedaba sin canal. */}
        {estado.showContact && (
          <Link
            href={`/ayuda?asunto=${encodeURIComponent(`Registro ${estadoRegistro} — ${fullName}`)}`}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#378ADD] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2d75c4] active:scale-[0.97]"
          >
            Contactar soporte
          </Link>
        )}

        <div className="mt-8 rounded-xl bg-white p-5 text-left" style={{ border: "1px solid #e5e7eb" }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tu información registrada</p>
          <div className="mt-3 space-y-2 text-sm">
            <p><span className="text-gray-400">Nombre:</span> <span className="text-gray-700">{fullName}</span></p>
            <p><span className="text-gray-400">Email:</span> <span className="text-gray-700">{email}</span></p>
            <p><span className="text-gray-400">Especialidad:</span> <span className="text-gray-700">{especialidad ?? "—"}</span></p>
            <p><span className="text-gray-400">Matrícula:</span> <span className="text-gray-700">{tipoMatricula} {numeroMatricula}</span></p>
            {fotoCredencialUrl && (
              <p><span className="text-gray-400">Credencial:</span> <span className="text-[#1D9E75]">Recibida</span></p>
            )}
          </div>
        </div>

        {/* Re-subir credencial: colapsado por defecto para no alarmar a quien subió bien.
            El que se equivocó (ej. subió su CV) lo busca activamente y lo despliega. */}
        <div className="mt-4">
          {!mostrarResubir ? (
            <button
              type="button"
              onClick={() => setMostrarResubir(true)}
              className="text-sm font-medium text-[#378ADD] hover:underline"
            >
              ¿Subiste el documento equivocado? Cambiar credencial
            </button>
          ) : (
            <form onSubmit={handleResubir} className="rounded-xl bg-white p-5 text-left" style={{ border: "1px solid #e5e7eb" }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Credencial de matrícula</p>
              <p className="mt-2 text-sm text-gray-500">
                Volvé a subir la <strong>credencial de tu matrícula</strong> (el documento oficial que la acredita).
              </p>
              <label
                htmlFor="credencial-resubir"
                className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-4 text-sm font-medium text-[#378ADD] transition hover:bg-[#f8f9fa]"
                style={{ borderColor: "#378ADD" }}
              >
                <Upload size={16} strokeWidth={1.75} />
                <span className="truncate">{nombreArchivo ?? "Elegí un archivo (JPG, PNG o PDF)"}</span>
              </label>
              <input
                id="credencial-resubir"
                name="credencial"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => setNombreArchivo(e.target.files?.[0]?.name ?? null)}
              />
              {msgCredencial && (
                <p className="mt-3 flex items-center gap-1.5 text-sm" style={{ color: msgCredencial.ok ? "#1D9E75" : "#E24B4A" }}>
                  {msgCredencial.ok ? <CheckCircle2 size={16} strokeWidth={1.75} /> : <AlertCircle size={16} strokeWidth={1.75} />}
                  {msgCredencial.text}
                </p>
              )}
              <button
                type="submit"
                disabled={subiendo || !nombreArchivo}
                className="mt-3 w-full rounded-lg bg-[#378ADD] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#2d75c4] active:scale-[0.97] disabled:opacity-50"
              >
                {subiendo ? "Subiendo…" : "Subir credencial"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-sm text-gray-400">
          ¿Preguntas? Escribinos a{" "}
          <a href="mailto:hola@docto.com.ar" className="text-[#378ADD] hover:underline">
            hola@docto.com.ar
          </a>
        </p>
      </div>
    </div>
  );
}
