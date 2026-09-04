"use client";

import { useEffect, useRef } from "react";
import type { DatosTablero } from "@/lib/tablero/tipos";
import { montarTablero } from "./motor";
import "./tablero.css";

// El motor (el mock validado) dibuja dentro de este contenedor y escucha por
// delegación. React solo da el marco y la limpieza al desmontar.
export default function TableroClient({ datos }: { datos: DatosTablero }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return montarTablero(ref.current, datos);
  }, [datos]);
  return (
    <div className="tb" ref={ref}>
      <div className="tip" id="tip" />
      <div className="overlay" id="overlay" />
      <aside className="panel" id="panel" aria-label="Ficha" />
      <header className="cab" id="cab" />
      <div className="fija" id="fija" />
      <div className="franja-wrap" id="franja" />
      <main>
        <div className="wrap" id="app" />
      </main>
    </div>
  );
}
