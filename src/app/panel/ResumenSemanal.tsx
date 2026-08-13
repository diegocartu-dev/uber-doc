// El Resumen semanal del panel — transplante FIEL del mock aprobado
// (docto-institucional/mocks/04-panel-admin.html). Server component puro: sin
// estado, sin JS de cliente. Toda la interacción del mock es navegación
// (semana anterior / siguiente, tabs, export), así que son links.
//
// Lo que el mock decide y acá se respeta al pie:
//   · Orden ALFABÉTICO por defecto en la tabla de cumplimiento. No hay ranking
//     ni ordenamiento por peor-a-mejor: el panel informa, no escracha (R23).
//   · El rojo no existe en esta pantalla.
//   · "En curso" mientras la semana está abierta, jamás "incompleto" un
//     miércoles (R30 — la regla vive en `badgeCumplimiento`, no acá).
//   · La definición contractual se muestra A LA VISTA, dos veces: en el
//     tooltip del KPI y en la franja debajo. Es lo que la institución va a
//     leer cuando discuta un número, y no puede estar escondida.

import type { ResumenSemanal } from "@/lib/metering/panel";
import { lecturaDelChart } from "@/lib/metering/panel";
import { etiquetaHoras, etiquetaSemana, semanaAnterior, semanaSiguiente } from "@/lib/metering/bolsa";
import { nombreDePeriodo } from "@/lib/metering/facturacion";

export const DEFINICION_CONTRACTUAL =
  "Se factura la consulta con ambos participantes en sala al menos 60 segundos y/o documento emitido. Las ausencias no se facturan.";

const CLASE_BADGE: Record<string, string> = {
  Cumplido: "b-verde",
  "En curso": "b-ama",
  Incompleto: "b-ama",
  "Sin actividad": "b-gris",
};

function Flecha({ hacia }: { hacia: "izq" | "der" }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {hacia === "izq" ? <path d="m15 5-7 7 7 7" /> : <path d="m9 5 7 7-7 7" />}
    </svg>
  );
}

/** Micro-barras del progreso: un segmento por bloque de consulta comprometido. */
function CupoBarra({ minutosCumplidos, minutosComprometidos, duracionSlotMin }: {
  minutosCumplidos: number;
  minutosComprometidos: number;
  duracionSlotMin: number;
}) {
  const total = Math.max(1, Math.min(12, Math.round(minutosComprometidos / duracionSlotMin) || 1));
  const llenos = Math.min(total, Math.floor(minutosCumplidos / duracionSlotMin));
  return (
    <span className="cupo-barra" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`cupo-seg${i < llenos ? " lleno" : ""}`} />
      ))}
    </span>
  );
}

export default function ResumenSemanalVista({
  resumen,
  duracionSlotMin,
  facturacion,
  periodo,
  hastaLabel,
}: {
  resumen: ResumenSemanal;
  duracionSlotMin: number;
  /** `null` = no se pudo calcular (la card lo dice; no se muestra un 0 falso). */
  facturacion: { consultas: number } | null;
  periodo: string;
  /** "al 25/10" — hasta qué día llega el conteo del período. */
  hastaLabel: string;
}) {
  const maxDia = Math.max(1, ...resumen.chart.map((d) => d.total));
  const alto = (n: number) => Math.round((n / maxDia) * 118);
  const horas = (min: number) => (Math.round((min / 60) * 10) / 10).toString().replace(".", ",");

  return (
    <>
      {/* ── selector de semana ── */}
      <div className="semana">
        <a className="semana-btn" href={`/panel?semana=${semanaAnterior(resumen.semanaAr)}`} aria-label="Semana anterior">
          <Flecha hacia="izq" />
        </a>
        <span className="semana-titulo tnum">Semana del {etiquetaSemana(resumen.semanaAr)}</span>
        <a className="semana-btn" href={`/panel?semana=${semanaSiguiente(resumen.semanaAr)}`} aria-label="Semana siguiente">
          <Flecha hacia="der" />
        </a>
        {!resumen.cerrada && <span className="badge b-ama">En curso</span>}
      </div>

      {/* ── KPIs ── */}
      <section className="kpis">
        <div className="card kpi">
          <span className="label">
            Consultas facturables{" "}
            <span className="info" title={DEFINICION_CONTRACTUAL}>
              i
            </span>
          </span>
          <div className="kpi-num tnum">{resumen.facturables}</div>
          <div className="kpi-sub tnum">del {etiquetaSemana(resumen.semanaAr)}</div>
        </div>

        <div className="card kpi">
          <span className="label">Cumplimiento del acuerdo</span>
          <div className="kpi-num tnum">{resumen.bolsa.porcentaje}%</div>
          <div className="kpi-sub tnum">
            {horas(resumen.bolsa.minutosCumplidos)} de {horas(resumen.bolsa.minutosComprometidos)} hs comprometidas
          </div>
        </div>

        <div className="card kpi">
          <span className="label">Ausencias</span>
          <div className="kpi-num tnum">{resumen.ausenciasPaciente + resumen.ausenciasProfesional}</div>
          <div className="kpi-sub tnum">
            {resumen.ausenciasPaciente} de pacientes · {resumen.ausenciasProfesional} de profesionales — no se facturan
          </div>
        </div>

        <div className="card kpi">
          <span className="label">Profesionales que atendieron</span>
          <div className="kpi-num tnum">
            {resumen.profesionalesQueAtendieron} <span className="den">de {resumen.profesionalesDelPiloto}</span>
          </div>
          <div className="kpi-sub">esta semana</div>
        </div>
      </section>

      {/* ── definición contractual ── */}
      <div className="def">
        <span className="def-ico">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <path d="M12 8h.01" />
          </svg>
        </span>
        <span>
          <b>Definición contractual:</b> {DEFINICION_CONTRACTUAL}
        </span>
      </div>

      {/* ── consultas por motor ── */}
      <section className="card b-chart">
        <div className="chart-head">
          <span className="cat-titulo">Consultas por motor</span>
          <div className="leyenda tnum">
            <span>
              <i style={{ background: "var(--accion)" }} />
              Acordado · {resumen.porMotor.acordado}
            </span>
            <span>
              <i style={{ background: "var(--serie-celeste)" }} />
              Espontáneo · {resumen.porMotor.espontaneo}
            </span>
            <span>
              <i style={{ background: "var(--serie-indigo)" }} />
              Ofrecido · {resumen.porMotor.ofrecido}
            </span>
          </div>
        </div>
        <div className="chart">
          {resumen.chart.map((d) => (
            <div className="col" key={d.fecha_ar}>
              <div className="barra-ap">
                <div className="seg-a" style={{ height: alto(d.acordado) }} />
                <div className="seg-e" style={{ height: alto(d.espontaneo) }} />
                <div className="seg-o" style={{ height: alto(d.ofrecido) }} />
              </div>
            </div>
          ))}
        </div>
        <div className="chart-labs">
          {resumen.chart.map((d) => (
            <div className="col" key={d.fecha_ar}>
              <div className="chart-dia tnum">{d.etiqueta}</div>
              <div className="chart-tot tnum">{d.total}</div>
            </div>
          ))}
        </div>
        <div className="lectura">{lecturaDelChart(resumen.porMotor, resumen.facturables)}</div>
      </section>

      {/* ── cumplimiento del acuerdo ── */}
      <section className="card b-tabla">
        <div className="tabla-head">
          <span className="cat-titulo">Cumplimiento del acuerdo de servicio</span>
        </div>

        <div className="fila fila-th">
          <span className="label">Profesional</span>
          <span className="label">Comprometido</span>
          <span className="label">Cumplido</span>
          <span className="label">Progreso</span>
          <span className="label">Motores</span>
          <span className="label" style={{ justifySelf: "end" }}>
            Estado
          </span>
        </div>

        {resumen.cumplimiento.length === 0 ? (
          <div className="vacio">
            <b>Todavía no hay profesionales con acuerdo cargado.</b>
            Los acuerdos de servicio se cargan al dar de alta a cada profesional del piloto.
          </div>
        ) : (
          resumen.cumplimiento.map((c) => (
            <div className="fila fila-tr" key={c.medicoId}>
              <div className="prof-quien">
                <div className="prof-nombre">{c.nombre}</div>
                <div className="prof-esp">{c.especialidad}</div>
              </div>
              <span className="celda tnum">{etiquetaHoras(c.minutosComprometidos)}</span>
              <span className={`celda tnum${c.minutosCumplidos > 0 ? "" : " mudo"}`}>
                {etiquetaHoras(c.minutosCumplidos)}
              </span>
              <CupoBarra
                minutosCumplidos={c.minutosCumplidos}
                minutosComprometidos={c.minutosComprometidos}
                duracionSlotMin={duracionSlotMin}
              />
              {c.motores.acordado + c.motores.espontaneo + c.motores.ofrecido > 0 ? (
                <span className="motores tnum">
                  A {c.motores.acordado} · E {c.motores.espontaneo} · O {c.motores.ofrecido}
                </span>
              ) : (
                <span className="motores mudo">—</span>
              )}
              <span className={`badge ${CLASE_BADGE[c.badge] ?? "b-gris"}`}>{c.badge}</span>
            </div>
          ))
        )}

        {resumen.cumplimiento.length > 0 && (
          <div className="pag tnum">
            Mostrando {resumen.cumplimiento.length} de {resumen.cumplimiento.length} profesionales · orden alfabético
          </div>
        )}
      </section>

      {/* ── facturación + ausentismo ── */}
      <section className="dosc">
        <div className="card b-fact">
          <span className="cat-titulo">Facturación del período</span>
          <div className="fact-linea tnum">
            {facturacion ? (
              <>
                {nombreDePeriodo(periodo)} — <b>{facturacion.consultas} consultas facturables</b> {hastaLabel}
              </>
            ) : (
              <>
                {nombreDePeriodo(periodo)} — <b>no se pudo calcular</b>. Probá de nuevo en un momento.
              </>
            )}
          </div>
          {/* Descarga directa: es un archivo, no una acción con efectos. */}
          <a className="btn-sec" href={`/api/panel/facturacion/csv?periodo=${periodo}`} download>
            Exportar CSV
          </a>
          <div className="micro">{DEFINICION_CONTRACTUAL}</div>
        </div>

        <div className="card b-aus">
          <span className="cat-titulo">Ausentismo de pacientes — esta semana</span>
          {resumen.ausentismo.length === 0 ? (
            <div className="micro" style={{ paddingTop: 0 }}>
              Ningún paciente faltó a su turno esta semana.
            </div>
          ) : (
            <ul className="aus">
              {resumen.ausentismo.map((a) => (
                <li key={a.especialidad}>
                  <span className="esp-nombre">{a.especialidad}</span>
                  <b className="tnum">{a.cantidad}</b>
                </li>
              ))}
            </ul>
          )}
          <div className="micro">Las ausencias no se facturan. Se informan para gestión de la institución.</div>
        </div>
      </section>
    </>
  );
}
