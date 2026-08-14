// Tab "Consultas" del panel — el detalle de la semana, encuentro por
// encuentro, con la documentación que dejó cada uno.
//
// En el mock esta tab está dibujada pero vacía. Acá es un placeholder DIGNO y
// no un cartel de "próximamente": muestra datos reales y resuelve la escena 5
// de la demo ("la historia clínica queda disponible para la institución",
// R26). Lo que todavía NO es: un buscador, un filtro por profesional ni una
// exportación masiva. Eso llega cuando alguien lo pida con un caso de uso.
//
// Cada documento se baja por `/api/panel/hc/[id]`, que registra QUIÉN lo bajó.

import type { EncuentroDelPanel } from "@/lib/metering/panel";

const NOMBRE_DOC: Record<string, string> = {
  receta: "Receta",
  orden: "Orden",
  certificado: "Certificado",
  indicaciones: "Indicaciones",
  derivacion: "Derivación",
};

const ETIQUETA_CLASIFICACION: Record<string, { texto: string; clase: string }> = {
  facturable: { texto: "Facturable", clase: "b-verde" },
  ausente_paciente: { texto: "Faltó el paciente", clase: "b-gris" },
  ausente_profesional: { texto: "Faltó el profesional", clase: "b-gris" },
  no_facturable_corta: { texto: "No facturable", clase: "b-gris" },
  falla_tecnica: { texto: "Falla técnica", clase: "b-ama" },
};

/** "2026-10-20" → "20/10" */
function diaCorto(fechaAr: string): string {
  return `${fechaAr.slice(8, 10)}/${fechaAr.slice(5, 7)}`;
}

export default function TabConsultas({
  encuentros,
  total,
}: {
  encuentros: EncuentroDelPanel[];
  /** Cuántas hubo en la semana. Puede ser mayor que las que se muestran. */
  total: number;
}) {
  if (encuentros.length === 0) {
    return (
      <section className="card">
        <div className="vacio">
          <b>Todavía no hay consultas registradas en esta semana.</b>
          Cuando se atienda la primera, va a aparecer acá con su documentación.
        </div>
      </section>
    );
  }

  return (
    <section className="card enc">
      <div className="tabla-head">
        <span className="cat-titulo">Consultas de la semana</span>
      </div>

      <div className="enc-fila enc-th">
        <span className="label">Fecha</span>
        <span className="label">Profesional</span>
        <span className="label">Paciente</span>
        <span className="label">Resultado</span>
        <span className="label">Documentación</span>
      </div>

      {encuentros.map((e) => {
        const etiqueta = ETIQUETA_CLASIFICACION[e.clasificacion] ?? {
          texto: e.clasificacion,
          clase: "b-gris",
        };
        return (
          <div className="enc-fila enc-tr" key={`${e.tipo}-${e.recursoId}`}>
            <span className="celda tnum">{diaCorto(e.fechaAr)}</span>
            <div className="prof-quien">
              <div className="prof-nombre">
                {e.profesional}
                {/* La fila de una reunión de venta se muestra —es la escena 6—
                    pero jamás sin decir qué es: no entra en ningún KPI de
                    arriba ni en la factura, y si nadie la marca, el panel de la
                    provincia estaría contando una consulta que no ocurrió. */}
                {e.esDemo && (
                  <span className="badge b-ama" style={{ marginLeft: 8 }}>
                    Demostración
                  </span>
                )}
              </div>
              <div className="prof-esp">
                {e.especialidad ?? ""} · {e.tipo === "turno" ? "Turno" : "Consulta inmediata"}
              </div>
            </div>
            <span className="celda" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {e.paciente || "—"}
            </span>
            <span className={`badge ${etiqueta.clase}`}>{etiqueta.texto}</span>
            <div>
              {e.documentos.length === 0 ? (
                <span className="sin-docs">Sin documentación</span>
              ) : (
                e.documentos.map((d) => (
                  <a key={d.id} className="doc-link" href={`/api/panel/hc/${d.id}`} download>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-11z" />
                      <path d="M14 2.5v6h6" />
                    </svg>
                    {NOMBRE_DOC[d.tipo] ?? d.tipo}
                  </a>
                ))
              )}
            </div>
          </div>
        );
      })}

      <div className="pag">
        {encuentros.length < total
          ? `Mostrando las primeras ${encuentros.length} de ${total} consultas de la semana.`
          : `Mostrando ${encuentros.length} consulta${encuentros.length === 1 ? "" : "s"} de la semana.`}{" "}
        Cada descarga de documentación queda registrada.
      </div>
    </section>
  );
}
