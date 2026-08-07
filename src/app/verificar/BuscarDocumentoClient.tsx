"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/**
 * El identificador del documento es un UUID. Se acepta pegado suelto o dentro de
 * la URL completa que el documento trae impresa al pie: el que llega acá suele
 * venir copiando de un papel, no tecleando un id prolijo.
 */
const UUID_RE =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

export default function BuscarDocumentoClient() {
  const router = useRouter();
  const [valor, setValor] = useState("");
  const [error, setError] = useState("");

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const id = valor.match(UUID_RE)?.[0];

    if (!id) {
      setError(
        "No encontramos un código de documento válido en lo que ingresaste. " +
          "Copiá la dirección completa que figura al pie del documento."
      );
      return;
    }

    setError("");
    router.push(`/verificar/${id.toLowerCase()}`);
  }

  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm" style={{ border: "1px solid #378ADD" }}>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#378ADD]/10">
        <Search className="h-7 w-7 text-[#378ADD]" />
      </div>

      <h2 className="text-center text-lg font-semibold text-gray-900">
        Verificar un documento médico
      </h2>
      <p className="mt-2 text-center text-sm text-gray-600">
        Escaneá el código QR del documento, o pegá acá abajo la dirección que
        figura impresa al pie.
      </p>

      <form onSubmit={buscar} className="mt-6">
        <label htmlFor="documento" className="text-xs font-medium tracking-wide text-gray-400">
          DIRECCIÓN O CÓDIGO DEL DOCUMENTO
        </label>
        <input
          id="documento"
          type="text"
          inputMode="text"
          autoComplete="off"
          value={valor}
          onChange={(e) => {
            setValor(e.target.value);
            if (error) setError("");
          }}
          placeholder="docto.com.ar/verificar/…"
          className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#378ADD]"
        />

        {error && (
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "#E24B4A" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          className="mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white"
          style={{ backgroundColor: "#378ADD" }}
        >
          Verificar
        </button>
      </form>

      <p className="mt-6 text-xs leading-relaxed text-gray-500">
        Esta página no busca por nombre del paciente ni por número de matrícula:
        solo confirma que el documento que tenés en la mano es el que emitió el
        profesional y que su contenido no fue modificado.
      </p>
    </div>
  );
}
