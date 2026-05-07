"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export default function PatologiaCronica({
  medicoUserId,
  pacienteId,
  perfilId,
  initialPatologias,
}: {
  medicoUserId: string;
  pacienteId: string;
  perfilId: string | null;
  initialPatologias: string[];
}) {
  const [patologias, setPatologias] = useState<string[]>(initialPatologias ?? []);
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState(false);
  const [currentPerfilId, setCurrentPerfilId] = useState(perfilId);
  const inputRef = useRef<HTMLInputElement>(null);

  async function guardar(nuevas: string[]) {
    const supabase = createClient();

    if (currentPerfilId) {
      await supabase
        .from("medico_paciente_perfil")
        .update({ patologia_cronica: nuevas, updated_at: new Date().toISOString() })
        .eq("id", currentPerfilId);
    } else {
      const { data } = await supabase
        .from("medico_paciente_perfil")
        .insert({
          medico_id: medicoUserId,
          paciente_id: pacienteId,
          patologia_cronica: nuevas,
        })
        .select("id")
        .single();
      if (data) setCurrentPerfilId(data.id);
    }
  }

  function agregar() {
    const val = input.trim();
    if (!val || patologias.includes(val)) return;
    const nuevas = [...patologias, val];
    setPatologias(nuevas);
    setInput("");
    guardar(nuevas);
    inputRef.current?.focus();
  }

  function eliminar(idx: number) {
    const nuevas = patologias.filter((_, i) => i !== idx);
    setPatologias(nuevas);
    guardar(nuevas);
  }

  if (!editing && patologias.length === 0) return null;

  return (
    <div className="mt-6 rounded-xl bg-white p-6" style={{ border: "0.5px solid #e5e7eb" }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-wide text-gray-400 uppercase">
          Patología crónica
        </p>
        <button
          type="button"
          onClick={() => {
            setEditing(!editing);
            if (!editing) setTimeout(() => inputRef.current?.focus(), 100);
          }}
          className="text-xs font-medium text-[#378ADD] hover:underline"
          style={{ minHeight: 44, minWidth: 44 }}
        >
          {editing ? "Listo" : "Editar"}
        </button>
      </div>

      {patologias.length === 0 && !editing && (
        <p className="mt-2 text-sm text-gray-400">
          Sin patologías crónicas registradas. Podés agregarlas si querés.
        </p>
      )}

      {patologias.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {patologias.map((p, i) => (
            <span
              key={p}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-700"
              style={{ border: "0.5px solid #e5e7eb" }}
            >
              {p}
              {editing && (
                <button
                  type="button"
                  onClick={() => eliminar(i)}
                  className="ml-1 text-gray-400 hover:text-[#E24B4A] transition-colors"
                  style={{ minWidth: 20, minHeight: 20 }}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {editing && (
        <div className="mt-3 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }}
            placeholder="Ej: Hipertensión, DBT tipo 2..."
            className="flex-1 rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
            style={{ border: "0.5px solid #e5e7eb", minHeight: 44 }}
          />
          <button
            type="button"
            onClick={agregar}
            disabled={!input.trim()}
            className="rounded-lg bg-[#378ADD] px-4 py-2 text-sm font-medium text-white transition disabled:opacity-40"
            style={{ minHeight: 44 }}
          >
            Agregar
          </button>
        </div>
      )}
    </div>
  );
}
