"use client";

// Tab NOVA del panel institucional — el "momento Nova" del guion (03-spec §5,
// mock docto-institucional/mocks/05-nova.html). Escena 7 de la demo.
//
// ── LO QUE ESTA PANTALLA PROMETE, Y CUMPLE ───────────────────────────────────
// 1. La propuesta NO toca la agenda. Se pide con `dry_run: true` y hasta que el
//    operador aprieta "Confirmar y avisar a todos" no se escribe una fila.
// 2. Lo que no se pudo resolver se muestra, no se esconde: la fila naranja de
//    "gestión manual" es una feature. Un 100 % mágico frente a un ministerio es
//    menos creíble que una propuesta que dice qué le falta.
// 3. El checklist de avisos es REAL. Cada línea se pinta con el resultado del
//    envío que devolvió la API (el mismo que queda en `asignaciones.detalle`),
//    no con un temporizador. Por eso los ítems se ejecutan de a uno: así el
//    checklist se llena de verdad mientras pasa.
//
// ── DESVÍO CONSCIENTE DEL MOCK ───────────────────────────────────────────────
// El mock dibuja un botón de micrófono junto al campo. No se implementa en V1:
// el dictado que anda en producción vive dentro de `src/app/medico/nova/page.tsx`
// (hook `useDictado`, con las cicatrices de Android y de iOS adentro) y sacarlo
// de ahí para reusarlo es un trabajo aparte. Un micrófono que no dicta es peor
// que no tenerlo.

import { useCallback, useRef, useState } from "react";
import type { PlanReprogramacion } from "@/lib/otorgador/reprogramar-masivo";
// El copy vive en la lib y está testeado ahí (`nova.test.ts`): la pantalla no
// escribe su propia versión de las mismas frases. `nova.ts` es puro y no
// importa nada del server, así que viaja al cliente sin arrastrar cola.
import { CHIP_SUGERENCIA, textoCierre } from "@/lib/otorgador/nova";

const SALUDO =
  "Hola. Puedo reprogramar el día de un profesional que no puede atender: te armo la propuesta, " +
  "vos la revisás y recién ahí aviso a todos.";

type FilaAviso = {
  clave: string;
  nombre: string;
  /** El paciente se avisa por turno; el profesional, una vez. */
  estado: "pendiente" | "enviando" | "enviado" | "fallado";
  detalle: string;
  hora: string;
};

type Burbuja =
  | { tipo: "nova"; texto: string }
  | { tipo: "user"; texto: string }
  | { tipo: "propuesta"; plan: PlanReprogramacion; excluidos: string[]; congelada: boolean }
  // `id` propio y no la posición en el hilo: las líneas del checklist se
  // repintan mientras la corrida avanza y el hilo puede crecer en el medio.
  | { tipo: "avisos"; id: string; filas: FilaAviso[]; terminado: boolean };

type ResultadoItem = {
  turno_id: string;
  ok: boolean;
  avisos?: {
    paciente: { canal: string; destino: string; ok: boolean } | null;
    medico: { canal: string; destino: string; ok: boolean } | null;
  };
  error?: string;
};

const horaAhora = () =>
  new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });

const etiquetaCanal = (canal: string | undefined) =>
  canal === "whatsapp" ? "WhatsApp enviado" : canal === "mail" ? "Mail enviado" : "Aviso registrado";

export default function Nova() {
  const [hilo, setHilo] = useState<Burbuja[]>([{ tipo: "nova", texto: SALUDO }]);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const finRef = useRef<HTMLDivElement | null>(null);

  const bajar = useCallback(() => {
    requestAnimationFrame(() => finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
  }, []);

  const enviar = useCallback(
    async (mensaje: string) => {
      const limpio = mensaje.trim();
      if (!limpio || ocupado) return;
      setTexto("");
      setOcupado(true);
      setHilo((h) => [...h, { tipo: "user", texto: limpio }]);
      bajar();
      try {
        const res = await fetch("/api/panel/nova", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensaje: limpio }),
        });
        const data = await res.json();
        const respuesta: Burbuja[] = [
          {
            tipo: "nova",
            texto:
              data.texto ??
              "Algo se me trabó de este lado. Probá de nuevo en un minuto; si sigue igual, avisale a Docto.",
          },
        ];
        if (data.ok && data.plan) {
          respuesta.push({ tipo: "propuesta", plan: data.plan, excluidos: [], congelada: false });
        }
        setHilo((h) => [...h, ...respuesta]);
      } catch {
        setHilo((h) => [
          ...h,
          { tipo: "nova", texto: "No pude conectarme. Revisá la conexión y probá de nuevo." },
        ]);
      } finally {
        setOcupado(false);
        bajar();
      }
    },
    [ocupado, bajar]
  );

  /** Marcar/desmarcar una fila de la propuesta (desmarcar = gestión manual). */
  const alternar = useCallback((indice: number, turnoId: string) => {
    setHilo((h) =>
      h.map((b, i) => {
        if (i !== indice || b.tipo !== "propuesta" || b.congelada) return b;
        const excluidos = b.excluidos.includes(turnoId)
          ? b.excluidos.filter((t) => t !== turnoId)
          : [...b.excluidos, turnoId];
        return { ...b, excluidos };
      })
    );
  }, []);

  const descartar = useCallback((indice: number) => {
    setHilo((h) => [
      ...h.filter((_, i) => i !== indice),
      { tipo: "nova", texto: "Listo, la descarté. No cambié nada en la agenda." },
    ]);
  }, []);

  const confirmar = useCallback(
    async (indice: number) => {
      const burbuja = hilo[indice];
      if (!burbuja || burbuja.tipo !== "propuesta" || burbuja.congelada || ocupado) return;
      const aMover = burbuja.plan.items.filter(
        (i) => i.propuesta && !burbuja.excluidos.includes(i.turno_id)
      );
      if (aMover.length === 0) return;

      setOcupado(true);
      // La propuesta se congela: a partir de acá es el registro de lo que se
      // decidió, no un formulario.
      setHilo((h) => h.map((b, i) => (i === indice && b.tipo === "propuesta" ? { ...b, congelada: true } : b)));

      // El checklist arranca con TODOS los destinatarios en "pendiente" —
      // pacientes y profesionales que reciben turnos, sin repetir.
      const filas: FilaAviso[] = [];
      for (const item of aMover) {
        filas.push({
          clave: `pac:${item.turno_id}`,
          nombre: item.paciente.nombre || "Paciente",
          estado: "pendiente",
          detalle: "pendiente",
          hora: "",
        });
      }
      for (const medicoId of [...new Set(aMover.map((i) => i.propuesta!.medico_id))]) {
        const nombre = aMover.find((i) => i.propuesta!.medico_id === medicoId)!.propuesta!.medico_nombre;
        filas.push({
          clave: `med:${medicoId}`,
          nombre,
          estado: "pendiente",
          detalle: "pendiente",
          hora: "",
        });
      }
      const idAvisos = `avisos-${burbuja.plan.medico.id}-${burbuja.plan.fecha}-${Date.now()}`;
      setHilo((h) => [...h, { tipo: "avisos", id: idAvisos, filas, terminado: false }]);
      bajar();

      const pintar = (clave: string, cambio: Partial<FilaAviso>) =>
        setHilo((h) =>
          h.map((b) =>
            b.tipo === "avisos" && b.id === idAvisos
              ? { ...b, filas: b.filas.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)) }
              : b
          )
        );

      let reasignados = 0;
      const medicosQueRecibieron = new Set<string>();
      const fallados: string[] = [];
      for (const item of aMover) {
        const clavePac = `pac:${item.turno_id}`;
        const claveMed = `med:${item.propuesta!.medico_id}`;
        pintar(clavePac, { estado: "enviando", detalle: "enviando…" });
        try {
          const res = await fetch("/api/otorgador/reprogramar-masivo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: [{ turno_id: item.turno_id, turno_nuevo_id: item.propuesta!.turno_id }],
              motivo: `Reprogramación del ${burbuja.plan.fecha_label} de ${burbuja.plan.medico.nombre}`,
            }),
          });
          const data = await res.json();
          const r: ResultadoItem | undefined = data?.resultados?.[0];
          if (!r?.ok) {
            fallados.push(item.paciente.nombre || "un paciente");
            pintar(clavePac, {
              estado: "fallado",
              detalle: r?.error ?? "No se pudo reprogramar",
              hora: horaAhora(),
            });
            continue;
          }
          reasignados++;
          medicosQueRecibieron.add(item.propuesta!.medico_id);
          const avisoPac = r.avisos?.paciente ?? null;
          pintar(clavePac, {
            estado: avisoPac?.ok ? "enviado" : "fallado",
            detalle: avisoPac?.ok ? etiquetaCanal(avisoPac.canal) : "No se pudo enviar el aviso",
            hora: horaAhora(),
          });
          const avisoMed = r.avisos?.medico ?? null;
          pintar(claveMed, {
            estado: avisoMed?.ok ? "enviado" : "fallado",
            detalle: avisoMed?.ok ? etiquetaCanal(avisoMed.canal) : "No se pudo enviar el aviso",
            hora: horaAhora(),
          });
        } catch {
          fallados.push(item.paciente.nombre || "un paciente");
          pintar(clavePac, { estado: "fallado", detalle: "No se pudo enviar", hora: horaAhora() });
        }
      }

      // ── Lo irresoluble queda REGISTRADO, no solo pintado ─────────────────
      // Los ítems sin propuesta y los que el operador desmarcó se filtraban de
      // `aMover` y ahí terminaba todo: ninguna llamada, ninguna escritura. El
      // turno seguía en `confirmado` con el profesional que acaba de avisar que
      // no va a atender, indistinguible de cualquier otro turno sano, y cerrada
      // la pestaña el rastro desaparecía.
      const paraElCallCenter = burbuja.plan.items
        .filter((i) => !i.propuesta || burbuja.excluidos.includes(i.turno_id))
        .map((i) => ({
          turno_id: i.turno_id,
          motivo: i.propuesta ? "excluido_por_operador" : "sin_lugar",
        }));
      if (paraElCallCenter.length > 0) {
        try {
          await fetch("/api/otorgador/reprogramar-masivo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              gestion_manual: paraElCallCenter,
              motivo: `Reprogramación del ${burbuja.plan.fecha_label} de ${burbuja.plan.medico.nombre}`,
            }),
          });
        } catch {
          // Queda en el log del server; no voltea una corrida ya avisada.
        }
      }

      // ── El día del profesional queda MARCADO ─────────────────────────────
      // Los slots suyos de ese día que nadie tomó siguen en `disponible`, y
      // `disponible` cuenta como hora puesta a disposición en la bolsa: el día
      // entero le entraría al número que se le factura a la institución, justo
      // el día en que avisó que no iba a atender. Va al final de la corrida y
      // sin bloquear el cierre: si falla, queda en el log del server.
      try {
        await fetch("/api/otorgador/reprogramar-masivo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cerrar_dia: { medico_id: burbuja.plan.medico.id, fecha: burbuja.plan.fecha },
          }),
        });
      } catch {
        // El cierre del día no puede voltear una corrida ya hecha y avisada.
      }

      setHilo((h) =>
        h.map((b) => (b.tipo === "avisos" && b.id === idAvisos ? { ...b, terminado: true } : b))
      );

      const manuales = burbuja.plan.items
        .filter((i) => !i.propuesta || burbuja.excluidos.includes(i.turno_id))
        .map((i) => i.paciente.nombre || "un paciente");
      const pacientes = reasignados;
      const profesionales = medicosQueRecibieron.size;

      let cierre = textoCierre({ reasignados, pacientes, profesionales, manuales });
      if (fallados.length > 0) {
        cierre += ` No pude mover el turno de ${fallados.join(", ")}: revisalo en el turnero.`;
      }
      setHilo((h) => [...h, { tipo: "nova", texto: cierre }]);
      setOcupado(false);
      bajar();
    },
    [hilo, ocupado, bajar]
  );

  return (
    <section className="nova">
      <div className="chat">
        {hilo.map((b, i) => {
          if (b.tipo === "user") {
            return (
              <div className="b-user" key={i}>
                {b.texto}
              </div>
            );
          }
          if (b.tipo === "nova") {
            return (
              <div className="b-nova" key={i}>
                <div className="quien">Nova</div>
                {b.texto}
              </div>
            );
          }
          if (b.tipo === "propuesta") {
            const seleccionados = b.plan.items.filter(
              (it) => it.propuesta && !b.excluidos.includes(it.turno_id)
            );
            const profesionales = new Set(seleccionados.map((it) => it.propuesta!.medico_id)).size;
            return (
              <div className="card prop" key={i}>
                <div className="prop-head">
                  <span className="label">Propuesta</span>
                  <span className="prop-titulo tnum">
                    {b.plan.fecha_label} · {b.plan.medico.nombre} ({b.plan.medico.especialidad})
                  </span>
                </div>

                <div className="trow thead">
                  <span />
                  <span className="label">Paciente</span>
                  <span className="label">Turno actual</span>
                  <span className="label">Propuesta</span>
                </div>

                {b.plan.items.map((it) => {
                  const excluido = b.excluidos.includes(it.turno_id);
                  if (!it.propuesta) {
                    return (
                      <div className="trow manual" key={it.turno_id}>
                        <span className="sin-chk">—</span>
                        <span className="t-pac">{it.paciente.nombre}</span>
                        <span className="t-act tnum">{it.actual.etiqueta}</span>
                        <span className="t-prop">
                          Sin lugar esta semana — queda para gestión manual del call center
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div className={`trow${excluido ? " excluida" : ""}`} key={it.turno_id}>
                      <button
                        type="button"
                        className={excluido ? "chk off" : "chk"}
                        onClick={() => alternar(i, it.turno_id)}
                        disabled={b.congelada}
                        aria-pressed={!excluido}
                        aria-label={
                          excluido
                            ? `Incluir a ${it.paciente.nombre} en la propuesta`
                            : `Excluir a ${it.paciente.nombre} de la propuesta`
                        }
                      >
                        {excluido ? "" : "✓"}
                      </button>
                      <span className="t-pac">{it.paciente.nombre}</span>
                      <span className="t-act tnum">{it.actual.etiqueta}</span>
                      <span className="t-prop tnum">
                        <span className="flecha">→</span>
                        <span className="prof">{it.propuesta.medico_nombre}</span>
                        <span className="sep">—</span>
                        {it.propuesta.etiqueta}
                        {it.propuesta.cambia_dia && <span className="subnota">⚠ Cambia de día</span>}
                        {excluido && <span className="subnota">Excluido — gestión manual</span>}
                      </span>
                    </div>
                  );
                })}

                {!b.congelada && (
                  <div className="pie-prop">
                    <p>
                      {seleccionados.length === 0
                        ? "No queda ningún turno seleccionado: no hay nada que confirmar."
                        : `Al confirmar, avisamos a ${seleccionados.length === 1 ? "1 paciente" : `los ${seleccionados.length} pacientes`} y a ${profesionales === 1 ? "1 profesional que recibe turnos" : `los ${profesionales} profesionales que reciben turnos`}.`}
                    </p>
                    <div className="botones">
                      <button type="button" className="btn-ghost" onClick={() => descartar(i)} disabled={ocupado}>
                        Descartar
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => confirmar(i)}
                        disabled={ocupado || seleccionados.length === 0}
                      >
                        Confirmar y avisar a todos
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          }
          return (
            <div className="card avisos" key={i}>
              <div className="avisos-head">
                {!b.terminado && <span className="spin" />}
                <span className="avisos-titulo">{b.terminado ? "Avisos enviados" : "Avisando a todos…"}</span>
              </div>
              {b.filas.map((f) => (
                <div className="av-row" key={f.clave}>
                  {f.estado === "enviado" ? (
                    <span className="ok">✓</span>
                  ) : f.estado === "enviando" ? (
                    <span className="spin" />
                  ) : f.estado === "fallado" ? (
                    <span className="falla">!</span>
                  ) : (
                    <span className="pend" />
                  )}
                  <span className="av-quien">
                    <span className="nombre">{f.nombre}</span>
                    <span className="sep">—</span>
                    <span className={f.estado === "fallado" ? "estado alerta" : "estado"}>{f.detalle}</span>
                  </span>
                  <span className="av-hora tnum">{f.hora}</span>
                </div>
              ))}
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      <div className="composer">
        <button
          type="button"
          className="chip-sug"
          onClick={() => setTexto(CHIP_SUGERENCIA)}
          disabled={ocupado}
        >
          {CHIP_SUGERENCIA}
        </button>
        <form
          className="campo"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(texto);
          }}
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribí una instrucción…"
            maxLength={500}
            disabled={ocupado}
            aria-label="Instrucción para Nova"
          />
          <button type="submit" className="btn" disabled={ocupado || !texto.trim()}>
            {ocupado ? "…" : "Enviar"}
          </button>
        </form>
      </div>
    </section>
  );
}
