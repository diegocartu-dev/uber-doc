"use client";

// Los estados del paciente institucional (mock 02-paciente §2, estados A/B/D/E
// + la prueba de cámara y micrófono del estado A).
//
// Lo que NO está acá, a propósito:
//   · El estado C (permisos antes de entrar al video) es el pre-join del canal
//     clínico, que ya vive en SalaConsultaPaciente. Cuando el profesional abre
//     la sala, esta pantalla navega a /turno/[id]/sala y ese pre-join hace su
//     trabajo. No se reimplementa.
//   · El estado F (link inactivo) lo resuelve el server component: si el turno
//     no lleva a ningún lado, esta pantalla no llega a montarse.
//
// Regla de proyecto que manda acá: la transición "el profesional abrió la
// sala" se detecta por POLLING, nunca solo por Realtime. Y el flag de "ya
// navegué" va en un ref, jamás en las dependencias del useEffect — si el
// estado estuviera en las deps, el intervalo se destruiría justo cuando más se
// lo necesita (aprendizaje escrito en CLAUDE.md).

import { useCallback, useEffect, useRef, useState } from "react";
import { instruccionesPermiso } from "@/lib/media/permisos";
import { MarcoPaciente, EncabezadoTurno } from "@/components/institucional/PantallaPaciente";
import type { PantallaTurno } from "@/lib/institucional/pantalla-turno";
import { abreLaPuertaMs } from "@/lib/institucional/pantalla-turno";
import { entrarASalaDeEspera } from "./actions";

interface DocumentoItem {
  id: string;
  tipo: string;
  fecha: string;
}

interface Props {
  turnoId: string;
  institucion: string;
  telefonoAyuda: string | null;
  pantallaInicial: PantallaTurno;
  primerNombre: string;
  especialidad: string;
  profesional: string;
  inicialesProfesional: string;
  fechaLabel: string;
  hora: string;
  inicioMs: number;
  ventanaEntradaMin: number;
  documentos: DocumentoItem[];
}

const NOMBRE_DOC: Record<string, string> = {
  receta: "Receta médica",
  orden: "Orden médica",
  certificado: "Certificado",
  derivacion: "Derivación",
};

function horaDe(ms: number): string {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(ms));
}

function IconoLugar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4z" /><path d="m22 9-6 6" /><path d="m16 9 6 6" />
    </svg>
  );
}
function IconoSenal() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 18v-4" /><path d="M9 18v-8" /><path d="M14 18V7" /><path d="M19 18V3" />
    </svg>
  );
}
function IconoDni() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="5" width="19" height="14" rx="2" /><circle cx="8" cy="11" r="2" />
      <path d="M5 17c.5-1.8 1.6-2.6 3-2.6s2.5.8 3 2.6" /><path d="M14.5 9.5H19" /><path d="M14.5 13H19" />
    </svg>
  );
}
function IconoCamara({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="2.5" y="7" width="13" height="10" rx="2.5" /><path d="M15.5 10.5l5-2.5v8l-5-2.5z" />
    </svg>
  );
}
function IconoDoc() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-11z" /><path d="M14 2.5v6h6" />
    </svg>
  );
}

export default function AccesoTurnoClient(props: Props) {
  const [pantalla, setPantalla] = useState<PantallaTurno>(props.pantallaInicial);
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarAyuda, setMostrarAyuda] = useState(false);
  // Prueba de cámara y micrófono (CTA secundaria del estado A).
  const [prueba, setPrueba] = useState<"cerrada" | "pidiendo" | "ok" | "falla">("cerrada");
  const [pruebaError, setPruebaError] = useState<string | null>(null);
  // El stream vive en un ref (no re-renderiza), pero "¿hay preview?" sí tiene
  // que pintar: por eso el booleano aparte.
  const [conPreview, setConPreview] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const yaNavegoRef = useRef(false);

  const abre = abreLaPuertaMs(props.inicioMs, props.ventanaEntradaMin);

  // Enganchar el stream al <video> cada vez que aparece uno (prueba o sala de
  // espera): el elemento se monta después de pedir el permiso.
  const engancharPreview = useCallback(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, []);
  useEffect(engancharPreview, [engancharPreview, pantalla, prueba, conPreview]);

  const soltarStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setConPreview(false);
  }, []);
  useEffect(() => () => soltarStream(), [soltarStream]);

  /**
   * Pide cámara + micrófono DENTRO del gesto del toque. Es la regla de iOS: un
   * getUserMedia fuera del toque se deniega en silencio y WebKit se acuerda de
   * esa negativa para toda la sesión. Cae a solo audio si no hay cámara.
   * Devuelve true si consiguió algo.
   */
  const pedirDispositivos = useCallback(async (): Promise<boolean> => {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setConPreview(true);
      return true;
    } catch {
      try {
        // Sin cámara (o cámara bloqueada) alcanza con audio para la consulta:
        // se entra igual, solo que sin verse a uno mismo.
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        setConPreview(streamRef.current.getVideoTracks().length > 0);
        return true;
      } catch {
        setConPreview(false);
        return false;
      }
    }
  }, []);

  // ── Estado A → B: la puerta se abre sola, sin recargar ────────────────────
  useEffect(() => {
    if (pantalla !== "falta") return;
    const id = setInterval(() => {
      if (Date.now() >= abre) setPantalla("ventana");
    }, 15_000);
    return () => clearInterval(id);
  }, [pantalla, abre]);

  // ── El profesional abrió la sala → al video (canal clínico intacto) ───────
  useEffect(() => {
    if (pantalla === "sala" && !yaNavegoRef.current) {
      yaNavegoRef.current = true;
      window.location.href = `/turno/${props.turnoId}/sala`;
    }
  }, [pantalla, props.turnoId]);

  // ── Estado D: polling. NUNCA solo Realtime, y el flag va en un ref ────────
  useEffect(() => {
    if (pantalla !== "espera") return;
    let vivo = true;

    async function mirar() {
      try {
        const res = await fetch(`/api/turno-estado?turnoId=${props.turnoId}`, {
          credentials: "include",
        });
        if (!res.ok || !vivo) return;
        const data = (await res.json()) as { estado?: string; sala_video_url?: string | null };
        if (!data.estado || yaNavegoRef.current) return;

        if (data.estado === "en_curso" && data.sala_video_url) {
          yaNavegoRef.current = true;
          window.location.href = `/turno/${props.turnoId}/sala`;
          return;
        }
        if (["completado", "ausente_paciente", "ausente_medico"].includes(data.estado)) {
          // Recarga en vez de setState: el server component es el que sabe qué
          // documentos quedaron, y esta pantalla no los tiene en memoria.
          yaNavegoRef.current = true;
          window.location.reload();
          return;
        }
        if (["cancelado_medico", "cancelado_paciente", "reprogramado"].includes(data.estado)) {
          yaNavegoRef.current = true;
          window.location.reload(); // el server lo manda al estado F
        }
      } catch {
        // Un blip de red no rompe nada: el próximo tick vuelve a preguntar.
      }
    }

    mirar();
    const id = setInterval(mirar, 3000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
    // `pantalla` está en las deps solo para ARRANCAR el intervalo al entrar a
    // la sala de espera; el que corta el polling es yaNavegoRef, no un estado.
  }, [pantalla, props.turnoId]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  async function entrar() {
    if (entrando) return;
    setEntrando(true);
    setError(null);
    // Dentro del gesto: si el paciente permite ahora, el pre-join del video no
    // le vuelve a preguntar después. Si no permite, entra igual — la sala de
    // espera no necesita cámara.
    await pedirDispositivos();
    const r = await entrarASalaDeEspera(props.turnoId);
    setEntrando(false);
    if (!r.ok) {
      setError(
        r.error === "Este turno no está confirmado."
          ? "Tu turno ya está en curso o cambió de estado. Actualizá la pantalla."
          : "No pudimos abrirte la sala de espera. Probá de nuevo en un momento."
      );
      return;
    }
    setPantalla("espera");
  }

  async function probarDispositivos() {
    setPrueba("pidiendo");
    setPruebaError(null);
    const ok = await pedirDispositivos();
    if (!ok) {
      setPruebaError(instruccionesPermiso("micrófono"));
      setPrueba("falla");
      return;
    }
    setPrueba("ok");
  }

  function cerrarPrueba() {
    soltarStream();
    setPrueba("cerrada");
    setPruebaError(null);
  }

  // ── Pantallas ─────────────────────────────────────────────────────────────

  // Prueba de cámara y micrófono — mismo layout que el pre-join del video, en
  // modo ensayo: se pide el permiso dentro del toque y se suelta al cerrar.
  if (prueba !== "cerrada") {
    return (
      <MarcoPaciente>
        <div className="pac-centro">
          {prueba === "ok" ? (
            <>
              <div className="pac-preview">
                {conPreview ? (
                  <video ref={videoRef} playsInline muted autoPlay />
                ) : (
                  <span>Micrófono listo (sin cámara)</span>
                )}
              </div>
              <div className="pac-titulo">Todo listo</div>
              <p className="pac-parrafo-sec" style={{ marginBottom: 18 }}>
                Si te ves en la pantalla, el día del turno vas a poder entrar sin problemas.
              </p>
            </>
          ) : (
            <>
              <div className="pac-ico-estado">
                <IconoCamara />
              </div>
              <div className="pac-titulo">Para que te vean y te escuchen</div>
              <p className="pac-parrafo-sec" style={{ marginBottom: 18 }}>
                Tu celular te va a pedir permiso para usar la cámara y el micrófono. Tocá{" "}
                <b>Permitir</b>.
              </p>
              {pruebaError && <p className="pac-error">{pruebaError}</p>}
            </>
          )}
          <button type="button" className="pac-cta-sec" onClick={cerrarPrueba}>
            Volver
          </button>
        </div>
      </MarcoPaciente>
    );
  }

  // ESTADO E — el encuentro terminó; quedan los documentos.
  if (pantalla === "terminado") {
    return (
      <MarcoPaciente>
        <div className="pac-titulo">Tu consulta terminó</div>
        {props.documentos.length > 0 ? (
          <>
            <p className="pac-parrafo-sec">
              {props.primerNombre ? `Gracias, ${props.primerNombre}. ` : "Gracias. "}
              Te dejaron documentación:
            </p>
            {props.documentos.map((doc) => (
              <div className="pac-doc" key={doc.id}>
                <div className="pac-doc-top">
                  <div className="pac-doc-ico">
                    <IconoDoc />
                  </div>
                  <div className="pac-doc-quien">
                    <b>{NOMBRE_DOC[doc.tipo] ?? "Documento médico"}</b>
                    <span className="tnum">
                      {props.profesional ? `${props.profesional} — ` : ""}
                      {doc.fecha}
                    </span>
                  </div>
                </div>
                {/* <a> nativo, jamás window.open después de un await: en Safari
                    iOS eso queda fuera del gesto y no abre nada (regla del repo). */}
                <a
                  className="pac-btn-doc"
                  href={`/api/documentos/${doc.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Descargar
                </a>
              </div>
            ))}
            <p style={{ fontSize: 13, color: "#4b5563", marginTop: 14, lineHeight: 1.5 }}>
              Estos documentos también quedan guardados acá. Volvé a este enlace cuando los
              necesites.
            </p>
          </>
        ) : (
          <p className="pac-parrafo-sec">
            No quedó documentación cargada para este turno.
            {props.telefonoAyuda ? (
              <>
                {" "}
                Si esperabas una receta, llamanos al{" "}
                <span className="nw tnum">{props.telefonoAyuda}</span>.
              </>
            ) : null}
          </p>
        )}
      </MarcoPaciente>
    );
  }

  // ESTADO D — sala de espera.
  if (pantalla === "espera" || pantalla === "sala") {
    return (
      <MarcoPaciente>
        <div className="pac-centro">
          <div className="pac-preview">
            {conPreview ? (
              <video ref={videoRef} playsInline muted autoPlay />
            ) : (
              <span>Tu cámara se enciende cuando arranca la consulta</span>
            )}
          </div>
          {props.inicialesProfesional && <div className="pac-avatar">{props.inicialesProfesional}</div>}
          <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.4 }}>
            Ya le avisamos a <span className="nw">{props.profesional || "tu profesional"}</span>
          </div>
          <p className="pac-parrafo-sec" style={{ margin: "6px 0 12px" }}>
            Te atiende en unos minutos.
            <br />
            No cierres esta pantalla.
          </p>
          <div className="pac-conectado">
            <span className="pac-dot-verde" /> Conectado
          </div>
          {props.telefonoAyuda && (
            <div style={{ marginTop: 18 }}>
              <button type="button" className="pac-link-ter" onClick={() => setMostrarAyuda(true)}>
                Tengo un problema
              </button>
              {mostrarAyuda && (
                <p style={{ fontSize: 13, color: "#4b5563", marginTop: 8 }}>
                  Llamanos al <span className="nw tnum">{props.telefonoAyuda}</span> y te ayudamos.
                </p>
              )}
            </div>
          )}
        </div>
      </MarcoPaciente>
    );
  }

  // ESTADOS A y B — comparten encabezado; cambia lo que se puede hacer.
  return (
    <MarcoPaciente>
      <EncabezadoTurno
        primerNombre={props.primerNombre}
        especialidad={props.especialidad || "consulta"}
        fechaLabel={props.fechaLabel}
        hora={props.hora}
        profesional={props.profesional}
      />

      {pantalla === "ventana" ? (
        <>
          <button type="button" className="pac-cta" onClick={entrar} disabled={entrando}>
            {entrando ? "Abriendo…" : "Entrar a la consulta"}
          </button>
          <div className="pac-micro">Sin usuario ni contraseña. Solo tocá el botón.</div>
          {error && <p className="pac-error">{error}</p>}
        </>
      ) : (
        <>
          {/* Ningún botón muerto (regla del mock): mientras no se pueda entrar,
              lo que hay es información y una prueba que sirve de verdad. */}
          <p className="pac-parrafo">
            Vas a poder entrar a partir de las <b className="tnum">{horaDe(abre)}</b>.
          </p>
          <div className="pac-prep">
            <div className="pac-prep-item">
              <IconoLugar /> Buscá un lugar tranquilo
            </div>
            <div className="pac-prep-item">
              <IconoSenal /> Fijate que tengas buena señal
            </div>
            <div className="pac-prep-item">
              <IconoDni /> Tené tu DNI a mano
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <button type="button" className="pac-cta-sec" onClick={probarDispositivos}>
              Probar cámara y micrófono
            </button>
          </div>
        </>
      )}
    </MarcoPaciente>
  );
}
