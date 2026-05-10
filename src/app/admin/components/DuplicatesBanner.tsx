"use client";

import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";

interface DuplicateGroup {
  dni: string;
  cantidad: number;
  paciente_ids: string[];
}

export default function DuplicatesBanner({
  onFilter,
}: {
  onFilter?: () => void;
}) {
  const [duplicados, setDuplicados] = useState<DuplicateGroup[]>([]);

  useEffect(() => {
    fetch("/api/admin/duplicados")
      .then((r) => r.json())
      .then((data) => setDuplicados(data.duplicados ?? []))
      .catch(() => {});
  }, []);

  if (duplicados.length === 0) return null;

  const total = duplicados.reduce((sum, d) => sum + d.cantidad, 0);

  return (
    <div
      className="flex items-center justify-between rounded-xl p-4"
      style={{
        backgroundColor: "#BA751715",
        border: "1px solid #BA751730",
      }}
    >
      <div className="flex items-center gap-3">
        <AlertTriangle size={18} className="text-[#BA7517] shrink-0" />
        <p className="text-sm text-gray-700">
          <span className="font-medium">
            {duplicados.length} grupo{duplicados.length > 1 ? "s" : ""} de DNI
            duplicado
          </span>{" "}
          ({total} pacientes afectados)
        </p>
      </div>
      {onFilter && (
        <button
          onClick={onFilter}
          className="shrink-0 rounded-lg border border-[#BA7517] px-3 py-1.5 text-xs font-medium text-[#BA7517] transition hover:bg-[#BA751710]"
        >
          Ver duplicados
        </button>
      )}
    </div>
  );
}
