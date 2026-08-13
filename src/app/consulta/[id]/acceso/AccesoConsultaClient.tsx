"use client";

// Los estados del paciente institucional en una CONSULTA INMEDIATA. Mismo
// layout y mismas clases que la pantalla del turno (mock 02-paciente §2): una
// card, sin menú, sin salidas de navegación.
//
// Lo que NO está acá, igual que en el turno:
//   · El permiso de cámara y micrófono definitivo lo pide el pre-join del
//     canal clínico (`SalaConsultaPaciente`). Acá se pide DENTRO DEL GESTO del
//     botón para que iOS no lo deniegue en silencio, y nada más.
//   · El estado "enlace inactivo" lo resuelve el server component.
//
// Reglas del repo que mandan en este archivo:
//   · La transición "el profesional abrió la sala" se detecta por POLLING,
//     nunca solo por Realtime.
//   · El flag de "ya navegué" va en un ref y NUNCA en las dependencias del
//     useEffect: si el estado estuviera en las deps, el intervalo se destruiría
//     justo cuando más se lo necesita.

import { useCallback, useEffect, useRef, useState } from "react";
import { instruccionesPermiso } from "@/lib/media/permisos";
import { MarcoPaciente } from "@/components/institucional/PantallaPaciente";
import type { PantallaConsulta } from "@/lib/institucional/pantalla-consulta";
import { entrarAConsultaInmediata } from "./actions";

interface DocumentoItem {
  id: string;
  tipo: string;
  fecha: string;
}

interface Props {
  consultaId: string;
  institucion: string;
  dominio: string;
  telefonoAyuda: string | null;
  pantallaInicial: PantallaConsulta;
  primerNombre: string;
  especialidad: string;
  profesional: string;
  inicialesProfesional: string;
  documentos: DocumentoItem[];
}

const NOMBRE_DOC: Record<string, string> = {
  receta: "Receta médica",
  orden: "Orden médica",
  certificado: "Certificado",
  indicaciones: "Indicaciones",
  derivacion: "Derivación",
};

function IconoDoc() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-11z" />
      <path d="M14 2.5v6h6" />
    </svg>
  );
}

export default function AccesoConsultaClient(props: Props) {
  const [pantalla, setPantalla] = useState<PantallaConsulta>(props.pantallaInicial);
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conPreview, setConPreview] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const yaNavegoRef = useRef(false);

  const engancharPreview = useCallback(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, []);
  useEffect(engancharPreview, [engancharPreview, pantalla, conPreview]);

  const soltarStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setConPreview(false);
  }, []);
  useEffect(() => () => soltarStream(), [soltarStream]);

  /**
   * Pide cámara + micrófono DENTRO del gesto del toque (regla de iOS: fuera
   * del toque se deniega en silencio y WebKit se acuerda toda la sesión). Cae
   * a solo audio si no hay cámara: para la consulta alcanza.
   */
  const pedirDispositivos = useCallback(async (): Promise<boolean> => {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setConPreview(true);
      return true;
    } catch {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        setConPreview(streamRef.current.getVideoTracks().length > 0);
        return true;
      } catch {
        setConPreview(false);
        return false;
      }
    }
  }, []);

  // ── El profesional abrió la sala → al video (canal clínico intacto) ───────
  useEffect(() => {
    if (pantalla === "sala" && !yaNavegoRef.current) {
      yaNavegoRef.current = true;
      window.location.href = `/consulta/${props.consultaId}/sala`;
    }
  }, [pantalla, props.consultaId]);

  // ── Espera: polling al mismo endpoint que usa el B2C ──────────────────────
  useEffect(() => {
    if (pantalla !== "espera") return;
    let vivo = true;

    async function mirar() {
      try {
        const res = await fetch(`/api/consulta-estado?consultaId=${props.consultaId}`, {
          credentials: "include",
        });
        if (!res.ok || !vivo) return;
        const data = (await res.json()) as { estado?: string; sala_video_url?: string | null };
        if (!data.estado || yaNavegoRef.current) return;

        // `sala_video_url` y no el estado: una CI puede figurar en curso sin
        // que el profesional haya entrado, y mandar al paciente al video antes
        // de que exista la sala es dejarlo mirando una pantalla negra.
        if (data.sala_video_url) {
          yaNavegoRef.current = true;
          window.location.href = `/consulta/${props.consultaId}/sala`;
          return;
        }
        if (["completada", "no_show_paciente", "medico_ausente", "cancelada", "rechazada"].includes(data.estado)) {
          // Recarga en vez de setState: el server component es el que sabe qué
          // documentos quedaron, y esta pantalla no los tiene en memoria.
          yaNavegoRef.current = true;
          window.location.reload();
        }
      } catch {
        // Un blip de red no rompe nada: el próximo tick vuelve a preguntar.
      }
    }

    mirar();
    const id = setInterval(mirar, 5000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [pantalla, props.consultaId]);

  async function entrar() {
    if (entrando) return;
    setEntrando(true);
    setError(null);
    const permitio = await pedirDispositivos();
    const r = await entrarAConsultaInmediata(props.consultaId);
    setEntrando(false);
    if (!r.ok) {
      setError(r.error ?? "No pudimos abrirte la consulta. Probá de nuevo en un momento.");
      return;
    }
    if (!permitio) {
      // Se entra igual —la sala de espera no necesita cámara— pero se le dice
      // cómo desbloquearla, con la marca de SU institución y no la de Docto.
      setError(instruccionesPermiso("micrófono", { nombre: props.institucion, dominio: props.dominio }));
    }
    setPantalla("espera");
  }

  // ── ESTADO: el profesional no llegó ───────────────────────────────────────
  if (pantalla === "ausente-profesional") {
    return (
      <MarcoPaciente>
        <div className="pac-centro">
          <div className="pac-titulo">No pudimos atenderte</div>
          <p className="pac-parrafo-sec">
            {props.primerNombre ? `${props.primerNombre}, l` : "L"}amentablemente el profesional no pudo
            conectarse. Lo sentimos.
          </p>
          <p className="pac-parrafo-sec" style={{ marginTop: 10 }}>
            {props.telefonoAyuda ? (
              <>
                Llamanos al <span className="nw tnum">{props.telefonoAyuda}</span> y te damos una nueva
                consulta.
              </>
            ) : (
              <>Comunicate con tu centro de salud para que te den una nueva consulta.</>
            )}
          </p>
        </div>
      </MarcoPaciente>
    );
  }

  // ── ESTADO: el tiempo pasó sin que registráramos su ingreso ───────────────
  if (pantalla === "ausente-paciente") {
    return (
      <MarcoPaciente>
        <div className="pac-centro">
          <div className="pac-titulo">Tu consulta venció</div>
          <p className="pac-parrafo-sec">
            No registramos tu ingreso a la consulta, así que la cerramos.
          </p>
          <p className="pac-parrafo-sec" style={{ marginTop: 10 }}>
            {props.telefonoAyuda ? (
              <>
                Si querés otra, llamanos al <span className="nw tnum">{props.telefonoAyuda}</span>.
              </>
            ) : (
              <>Si querés otra, comunicate con tu centro de salud.</>
            )}
          </p>
        </div>
      </MarcoPaciente>
    );
  }

  // ── ESTADO: terminó; quedan los documentos ────────────────────────────────
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
              Estos documentos también quedan guardados acá. Volvé a este enlace cuando los necesites.
            </p>
          </>
        ) : (
          <p className="pac-parrafo-sec">
            No quedó documentación cargada para esta consulta.
            {props.telefonoAyuda ? (
              <>
                {" "}
                Si esperabas una receta, llamanos al <span className="nw tnum">{props.telefonoAyuda}</span>.
              </>
            ) : null}
          </p>
        )}
      </MarcoPaciente>
    );
  }

  // ── ESTADO: esperando al profesional ──────────────────────────────────────
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
          {error && <p className="pac-error">{error}</p>}
          <div style={{ marginTop: 18 }}>
            <div className="pac-link-ter">Tengo un problema</div>
            <p style={{ fontSize: 13, color: "#4b5563", marginTop: 8 }}>
              {props.telefonoAyuda ? (
                <>
                  Llamanos al <span className="nw tnum">{props.telefonoAyuda}</span> y te ayudamos.
                </>
              ) : (
                <>Cerrá esta pantalla y volvé a tocar el enlace que te mandamos.</>
              )}
            </p>
          </div>
        </div>
      </MarcoPaciente>
    );
  }

  // ── ESTADO: puede entrar ahora ────────────────────────────────────────────
  return (
    <MarcoPaciente>
      {props.primerNombre && <div className="pac-hola">Hola, {props.primerNombre}</div>}
      <div className="pac-titulo">Tu consulta de {props.especialidad || "salud"}</div>
      <div className="pac-prof nw">{props.profesional}</div>
      <p className="pac-parrafo">Te está esperando. Podés entrar ahora.</p>
      <button type="button" className="pac-cta" onClick={entrar} disabled={entrando}>
        {entrando ? "Abriendo…" : "Entrar a la consulta"}
      </button>
      <div className="pac-micro">Sin usuario ni contraseña. Solo tocá el botón.</div>
      {error && <p className="pac-error">{error}</p>}
    </MarcoPaciente>
  );
}
