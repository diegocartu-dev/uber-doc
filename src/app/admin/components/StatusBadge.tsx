"use client";

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  aprobado: { bg: "bg-emerald-100", text: "text-[#1D9E75]", label: "Aprobado" },
  activo: { bg: "bg-emerald-100", text: "text-[#1D9E75]", label: "Activo" },
  pendiente_revision: { bg: "bg-[#BA7517]/15", text: "text-[#BA7517]", label: "Pendiente" },
  rechazado: { bg: "bg-red-100", text: "text-[#E24B4A]", label: "Rechazado" },
  suspendido: { bg: "bg-orange-100", text: "text-[#D85A30]", label: "Suspendido" },
  pausado: { bg: "bg-orange-100", text: "text-[#D85A30]", label: "Pausado" },
  bloqueado: { bg: "bg-red-100", text: "text-[#E24B4A]", label: "Bloqueado" },
  completada: { bg: "bg-emerald-100", text: "text-[#1D9E75]", label: "Completada" },
  cancelada: { bg: "bg-red-100", text: "text-[#E24B4A]", label: "Cancelada" },
  en_curso: { bg: "bg-blue-100", text: "text-[#378ADD]", label: "En curso" },
  esperando: { bg: "bg-[#BA7517]/15", text: "text-[#BA7517]", label: "Esperando" },
};

export default function StatusBadge({ status, label }: { status: string; label?: string }) {
  const style = statusStyles[status] ?? { bg: "bg-gray-100", text: "text-gray-600", label: status };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      {label ?? style.label}
    </span>
  );
}
