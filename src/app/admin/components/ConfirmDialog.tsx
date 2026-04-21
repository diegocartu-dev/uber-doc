"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  confirmLabel: string;
  variant: "danger" | "warning";
  requireReason?: boolean;
  reasonPlaceholder?: string;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}

const variantStyles = {
  danger: {
    bg: "bg-red-50",
    border: "border-[#E24B4A]/30",
    btn: "bg-[#E24B4A] hover:bg-[#c9403f]",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-[#BA7517]/30",
    btn: "bg-[#D85A30] hover:bg-[#c04e28]",
  },
};

export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  variant,
  requireReason = false,
  reasonPlaceholder = "Motivo...",
  onConfirm,
  onCancel,
  isLoading,
}: Props) {
  const [reason, setReason] = useState("");
  const styles = variantStyles[variant];
  const canConfirm = !requireReason || reason.trim().length > 0;

  return (
    <div className={`mt-4 rounded-lg border ${styles.border} ${styles.bg} p-4`}>
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
      {requireReason && (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={reasonPlaceholder}
          rows={2}
          className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-[#378ADD] focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
        />
      )}
      <div className="mt-3 flex gap-3">
        <button
          onClick={() => onConfirm(reason.trim() || undefined)}
          disabled={isLoading || !canConfirm}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg ${styles.btn} px-4 py-2 text-sm font-medium text-white transition active:scale-[0.97] disabled:opacity-50`}
        >
          {isLoading && <Loader2 size={16} className="animate-spin" />}
          {confirmLabel}
        </button>
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
