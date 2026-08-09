"use client";

import { useState } from "react";
import { FileText, ChevronDown, Download } from "lucide-react";
import OrigenBadge from "@/components/OrigenBadge";
import { formatNombreMedico } from "@/lib/utils/texto";

type DocItem = {
  id: string;
  tipo: string;
  diagnostico: string | null;
  contenido: string;
};

type ConsultaItem = {
  id: string;
  type: "consulta" | "turno";
  date: string;
  estado: string;
  medicoNombre: string;
  /**
   * Título profesional elegido por el médico en su registro (`medicos.titulo`:
   * "Dr." o "Dra."). Lo arma la page al cruzar cada consulta/turno con su
   * médico. Si falta, el historial muestra el nombre pelado — mejor eso que un
   * "Dr." puesto por default sobre una médica.
   */
  medicoTitulo?: string | null;
  especialidad: string;
  canalOrigen: string | null;
  documentos: DocItem[];
};

type Props = {
  items: ConsultaItem[];
};

const estadoConfig: Record<string, { color: string; bg: string; label: string }> = {
  completada: { color: "var(--color-success)", bg: "var(--color-success-soft)", label: "Completada" },
  completado: { color: "var(--color-success)", bg: "var(--color-success-soft)", label: "Completado" },
  en_curso: { color: "var(--color-brand)", bg: "var(--color-primary-soft)", label: "En curso" },
  aceptada: { color: "var(--color-success)", bg: "var(--color-success-soft)", label: "Aceptada" },
  pagada: { color: "var(--color-info)", bg: "var(--color-info-soft)", label: "Pagada" },
  esperando: { color: "var(--color-pending)", bg: "var(--color-pending-soft)", label: "Esperando" },
  confirmado: { color: "var(--color-info)", bg: "var(--color-info-soft)", label: "Confirmado" },
  en_espera: { color: "var(--color-pending)", bg: "var(--color-pending-soft)", label: "En espera" },
  cancelada: { color: "var(--color-danger)", bg: "var(--color-danger-soft)", label: "Cancelada" },
  cancelado_paciente: { color: "var(--color-danger)", bg: "var(--color-danger-soft)", label: "Cancelado" },
  cancelado_medico: { color: "var(--color-danger)", bg: "var(--color-danger-soft)", label: "Cancelado" },
  ausente_paciente: { color: "var(--color-muted)", bg: "var(--color-muted-soft)", label: "Ausente" },
  ausente_medico: { color: "var(--color-muted)", bg: "var(--color-muted-soft)", label: "Ausente" },
};

const tipoDocLabel: Record<string, string> = {
  receta: "Receta",
  indicaciones: "Indicaciones",
  certificado: "Certificado",
  orden: "Orden médica",
};

function getMonthKey(dateStr: string) {
  const d = new Date(dateStr);
  const month = d.toLocaleDateString("es-AR", { month: "long", timeZone: "America/Argentina/Buenos_Aires" }).toUpperCase();
  const year = d.getFullYear();
  return `${month} ${year}`;
}

function formatExactDate(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const time = d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return `${day}, ${time} hs`;
}

export default function MisConsultasList({ items }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="mt-16 text-center">
        <FileText
          size={48}
          strokeWidth={1.5}
          style={{ color: "var(--color-text-tertiary)", margin: "0 auto" }}
        />
        <p
          className="mt-4 text-sm leading-relaxed"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Todavía no tenés consultas. Cuando hagas tu primera consulta, vas a ver el historial acá.
        </p>
      </div>
    );
  }

  // Group by month
  const groups = new Map<string, ConsultaItem[]>();
  for (const item of items) {
    const key = getMonthKey(item.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  return (
    <div className="mt-6 space-y-6">
      {[...groups.entries()].map(([monthKey, groupItems]) => (
        <div key={monthKey}>
          <p
            className="text-xs font-semibold tracking-wide"
            style={{ color: "var(--color-text-tertiary)", letterSpacing: "0.06em" }}
          >
            {monthKey}
          </p>

          <div className="mt-3 space-y-2">
            {groupItems.map((item) => {
              const isExpanded = expandedId === item.id;
              const cfg = estadoConfig[item.estado] ?? {
                color: "var(--color-muted)",
                bg: "var(--color-muted-soft)",
                label: item.estado,
              };

              return (
                <div
                  key={item.id}
                  className="rounded-[var(--radius-lg)] bg-white transition-shadow"
                  style={{ border: "1px solid var(--color-border-default)" }}
                >
                  {/* Header - clickable */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="flex w-full items-center gap-3 p-4 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {formatNombreMedico(item.medicoNombre, item.medicoTitulo)}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <p
                          className="text-xs truncate"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          {item.especialidad} — {formatExactDate(item.date)}
                        </p>
                        <OrigenBadge canalOrigen={item.canalOrigen} />
                      </div>
                    </div>

                    {/* Chip de estado — texto + color (legible y accesible, no solo un dot) */}
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ color: cfg.color, backgroundColor: cfg.bg }}
                    >
                      {cfg.label}
                    </span>

                    {item.documentos.length > 0 && (
                      <ChevronDown
                        size={16}
                        strokeWidth={1.75}
                        className="shrink-0 transition-transform duration-200"
                        style={{
                          color: "var(--color-text-tertiary)",
                          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                      />
                    )}
                  </button>

                  {/* Expanded content */}
                  {isExpanded && item.documentos.length > 0 && (
                    <div
                      className="px-4 pb-4"
                      style={{ borderTop: "1px solid var(--color-border-subtle)" }}
                    >
                      <div className="mt-3 space-y-2">
                        {item.documentos.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center gap-3 rounded-[var(--radius-md)] p-3"
                            style={{ backgroundColor: "var(--color-bg-tertiary)" }}
                          >
                            <FileText
                              size={16}
                              strokeWidth={1.75}
                              style={{ color: "var(--color-text-secondary)" }}
                              className="shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className="text-sm font-medium truncate"
                                style={{ color: "var(--color-text-primary)" }}
                              >
                                {tipoDocLabel[doc.tipo] ?? doc.tipo}
                                {doc.diagnostico && ` - ${doc.diagnostico}`}
                              </p>
                            </div>
                            <a
                              href={`/documentos#${doc.id}`}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--color-bg-secondary)]"
                            >
                              <Download
                                size={16}
                                strokeWidth={1.75}
                                style={{ color: "var(--color-text-link)" }}
                              />
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
