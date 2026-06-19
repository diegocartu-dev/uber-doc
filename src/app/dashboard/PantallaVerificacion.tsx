"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Clock, ShieldX, ShieldAlert, Stethoscope } from "lucide-react";
import LogoutButton from "./LogoutButton";

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

        {estado.showContact && (
          <a
            href={`mailto:soporte@docto.com.ar?subject=${encodeURIComponent(`Registro ${estadoRegistro} — ${fullName}`)}`}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#378ADD] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2d75c4] active:scale-[0.97]"
          >
            Contactar soporte
          </a>
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
