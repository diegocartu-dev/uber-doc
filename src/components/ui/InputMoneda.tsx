"use client";

import { useRef } from "react";

type Props = {
  /** Valor entero crudo (en pesos, sin decimales). 0 = vacío. */
  value: number;
  /** Devuelve el entero crudo ya limpio (sin ceros a la izquierda). */
  onChange: (value: number) => void;
  /**
   * Si se pasa, renderiza un <input type="hidden" name={name}> con el entero crudo,
   * para que un server action que lee FormData siga funcionando sin cambios.
   */
  name?: string;
  /** Clases extra para el <input> visible (layout por pantalla: h-11, min-h-[44px], etc.). */
  className?: string;
  /** Estilo inline para el <input> visible (ej. borde de la pantalla). */
  style?: React.CSSProperties;
  placeholder?: string;
  id?: string;
  required?: boolean;
  /** Mínimo lógico de validación nativa del form (no afecta el formateo). */
  min?: number;
};

const FORMATTER = new Intl.NumberFormat("es-AR");

/**
 * Input de moneda en pesos argentinos.
 * - Display formateado con separador de miles (1.000, 10.000).
 * - Guarda/emite el entero crudo, sin ceros a la izquierda.
 * - Prefijo $ absoluto a la izquierda. Foco azul #378ADD.
 * - Caret siempre al final tras reformatear (campo corto, simple beats clever).
 */
export default function InputMoneda({
  value,
  onChange,
  name,
  className = "",
  style,
  placeholder = "15.000",
  id,
  required,
  min,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const soloDigitos = e.target.value.replace(/\D/g, "");
    const entero = soloDigitos === "" ? 0 : parseInt(soloDigitos, 10);
    onChange(entero);
    // Caret al final tras el reformateo (el value se recalcula en el render).
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  }

  const display = value === 0 ? "" : FORMATTER.format(value);

  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm"
        style={{ color: "#888780" }}
      >
        $
      </span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        min={min}
        className={`pl-7 focus:outline-none focus:ring-1 focus:ring-[#378ADD] ${className}`}
        style={style}
      />
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}
