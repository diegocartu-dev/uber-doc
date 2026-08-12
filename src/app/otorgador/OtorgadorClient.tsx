"use client";

// La pantalla del otorgador — transplante FIEL del mock aprobado
// (docto-institucional/mocks/01-otorgador.html + 01b-otorgador-estados.html)
// contra la API real de asignación. Regla madre (04-spec §1.4): la pantalla
// PINTA, la API ordena — acá no hay ningún sort(): la lista se renderiza en el
// orden exacto que devuelve GET /api/otorgador/oferta.
//
// Estados cubiertos (galería 01b): búsqueda con dropdown (01), sin resultados
// (02), dato faltante + edición inline (03), fila CI seleccionada con link
// "¿No puede ahora?" (04), éxito turno/CI (05/07), fila expandida con primer
// slot preseleccionado (06), conflicto de slot (08), especialidad sin oferta
// (09), categoría vacía colapsada + acuerdo completo (10), barra sticky en 3
// estados (11), turno ofrecido con oferta (12).
//
// TODO (con referencia a 01b / 04-spec — quedan para próximas pasadas; backlog
// VISIBLE del sprint: docs/sprints/2026-08-12-institucional-etapa-2-backlog-otorgador.md):
//   - "Ver la semana completa →" del acordeón de slots (01: .slots-mas) — hoy
//     se listan todos los días de la semana AR corriente, sin paginado.
//   - Buscadores compactos "Buscar especialidad" / "Buscar profesional"
//     (01: .buscar-compacto en b-esp y of-head).
//   - "Reenviar aviso" del éxito (04-spec §1.7): necesita el token del
//     link-sesión (accesos_link, Etapa 3) — botón deshabilitado hasta entonces.
//   - "Registrale el pedido" de especialidad sin oferta (04-spec §1.5.6): el
//     registro del pedido de oferta no existe todavía — se muestra sin acción.
//   - Lápiz de edición sobre dato EXISTENTE con hover fino (01b §1.2.3): hoy
//     el lápiz está siempre visible (sin estado hover), mismo patrón inline.

import { useCallback, useEffect, useRef, useState } from "react";
import "./otorgador.css";
import type { PacientePadron } from "@/app/api/otorgador/padron/route";
import type { OfertaEspecialidad, ProfesionalOferta } from "@/lib/otorgador/oferta";

interface Props {
  instNombre: string;
  instSubnombre: string | null;
  operadorNombre: string;
  operadorRol: string;
}

interface EspecialidadChip {
  nombre: string;
  ci_activa_ahora: boolean;
}

type Seleccion =
  | { tipo: "ci"; profesional: ProfesionalOferta }
  | { tipo: "turno"; profesional: ProfesionalOferta; slot: { turno_id: string; fecha: string; hora: string } };

interface Exito {
  tipo: "turno" | "ci";
  pacienteNombre: string;
  medicoNombre: string;
  especialidad: string;
  fechaLabel: string | null; // solo turno
  aviso: { canal: "whatsapp" | "mail"; destino: string; ok: boolean } | null;
  /** Link de acceso emitido SIEMPRE (fallback manual si el aviso no salió). */
  accesoUrl: string | null;
}

const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function hoyISO(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "12345678" → "12.345.678" — el padrón guarda solo dígitos; el mock los
 * presenta con puntos (01-otorgador.html §1.2.1). Presentación, no dato. */
function formatearDNI(dni: string | null): string {
  if (!dni) return "—";
  const limpio = dni.replace(/\D/g, "");
  if (!limpio) return dni;
  return limpio.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "Hoy 17:15" / "Mar 20/10 · 16:30" (04-spec §1.5.3). */
function labelProximo(p: ProfesionalOferta): string {
  if (!p.proximo) return "";
  if (p.proximo.fecha === hoyISO()) return `Hoy ${p.proximo.hora}`;
  const d = new Date(p.proximo.fecha + "T12:00:00");
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} · ${p.proximo.hora}`;
}

function labelFechaLarga(fecha: string, hora: string): string {
  const d = new Date(fecha + "T12:00:00");
  return `${DIAS_LARGOS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} · ${hora} hs`;
}

function iniciales(nombre: string): string {
  const partes = nombre.replace(/^Dra?\.\s*/i, "").trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[partes.length - 1]?.[0] ?? "")).toUpperCase() || "·";
}

function MicroBarra({ x, y }: { x: number; y: number }) {
  const segs = Math.max(y, 1);
  return (
    <span className="cupo-barra">
      {Array.from({ length: Math.min(segs, 12) }, (_, i) => (
        <span key={i} className={`cupo-seg${i < x ? " lleno" : ""}`} />
      ))}
    </span>
  );
}

const IconoLupa = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const Chevron = ({ arriba }: { arriba?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={arriba ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} />
  </svg>
);

export default function OtorgadorClient({ instNombre, instSubnombre, operadorNombre, operadorRol }: Props) {
  // ── Bloque 1: paciente ──
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<PacientePadron[] | null>(null); // null = sin búsqueda
  const [paciente, setPaciente] = useState<PacientePadron | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bloque1Ref = useRef<HTMLElement>(null);

  // Edición inline de contacto
  const [editando, setEditando] = useState<"celular" | "mail" | null>(null);
  const [valorEdit, setValorEdit] = useState("");
  const [errorEdit, setErrorEdit] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [checkBreve, setCheckBreve] = useState<"celular" | "mail" | null>(null);

  // ── Bloque 2: especialidad ──
  const [chips, setChips] = useState<EspecialidadChip[]>([]);
  const [ventanaCI, setVentanaCI] = useState("");
  const [especialidad, setEspecialidad] = useState<string | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  // ── Bloque 3: oferta ──
  const [oferta, setOferta] = useState<OfertaEspecialidad | null>(null);
  const [cargandoOferta, setCargandoOferta] = useState(false);
  const [errorOferta, setErrorOferta] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null); // medico_id
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [conflictoEn, setConflictoEn] = useState<string | null>(null); // medico_id con banner

  // ── Barra / asignación ──
  const [asignando, setAsignando] = useState(false);
  const [errorAsignar, setErrorAsignar] = useState<string | null>(null);
  const [exito, setExito] = useState<Exito | null>(null);

  const sinCanal = !!paciente && !paciente.celular && !paciente.email;

  // Especialidades al montar
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/otorgador/especialidades");
        if (!r.ok) return;
        const data = await r.json();
        setChips(data.especialidades ?? []);
        setVentanaCI(data.ventana_ci ?? "");
      } catch {
        /* la pantalla sigue; los chips quedan vacíos */
      }
    })();
  }, []);

  // Autofocus inicial
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Búsqueda con debounce (≥3 chars)
  useEffect(() => {
    if (paciente) return;
    const q = query.trim();
    if (q.length < 3) {
      setResultados(null);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        try {
          const r = await fetch(`/api/otorgador/padron?q=${encodeURIComponent(q)}`);
          if (!r.ok) return;
          const data = await r.json();
          setResultados(data.resultados ?? []);
        } catch {
          /* silencio: el dropdown simplemente no aparece */
        }
      })();
    }, 250);
    return () => clearTimeout(t);
  }, [query, paciente]);

  const resetTodo = useCallback(() => {
    setPaciente(null);
    setQuery("");
    setResultados(null);
    setEspecialidad(null);
    setOferta(null);
    setErrorOferta(null);
    setExpandido(null);
    setSeleccion(null);
    setConflictoEn(null);
    setErrorAsignar(null);
    setEditando(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // Esc con paciente fijado = cambiar paciente (04-spec §1.2.2)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (exito || editando) return;
      if (paciente) resetTodo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paciente, exito, editando, resetTodo]);

  function fijarPaciente(p: PacientePadron) {
    setPaciente(p);
    setQuery("");
    setResultados(null);
  }

  // Un ERROR de la API NO es una oferta vacía (hallazgo revisión Etapa 2): el
  // estado vacío del 04-spec §1.5.6 ("no tiene horarios esta semana") es una
  // afirmación que la operadora repite en voz alta — pintarla sobre un 500
  // era mentirle al vecino. El error tiene su propio estado y su reintento.
  const cargarOferta = useCallback(async (esp: string) => {
    setCargandoOferta(true);
    setErrorOferta(null);
    try {
      const r = await fetch(`/api/otorgador/oferta?especialidad=${encodeURIComponent(esp)}`);
      if (!r.ok) {
        let msj = "No se pudo leer la oferta. Probá de nuevo.";
        try {
          const data = await r.json();
          if (typeof data?.error === "string" && data.error) msj = data.error;
        } catch {
          /* respuesta sin JSON: queda el mensaje genérico */
        }
        setOferta(null);
        setErrorOferta(msj);
        return;
      }
      setOferta((await r.json()) as OfertaEspecialidad);
    } catch {
      setOferta(null);
      setErrorOferta("No se pudo leer la oferta. Revisá la conexión y probá de nuevo.");
    } finally {
      setCargandoOferta(false);
    }
  }, []);

  function elegirEspecialidad(esp: string) {
    setEspecialidad(esp);
    // Cambiar de especialidad descarta SOLO lo incompatible (profesional y
    // horario); el paciente queda intacto (04-spec §1.5.4).
    setSeleccion(null);
    setExpandido(null);
    setConflictoEn(null);
    setErrorAsignar(null);
    void cargarOferta(esp);
  }

  function clickFilaTurno(p: ProfesionalOferta) {
    if (!p.seleccionable) return;
    if (expandido === p.medico_id) {
      // Colapsar NO pierde la selección (chip resumen en la fila).
      setExpandido(null);
      return;
    }
    setExpandido(p.medico_id);
    setConflictoEn(null);
    // Al expandir, el primer slot queda PRESELECCIONADO (04-spec §1.5.4).
    const primerDia = p.slots_semana[0];
    const primerHora = primerDia?.horas[0];
    if (primerHora) {
      setSeleccion({
        tipo: "turno",
        profesional: p,
        slot: { turno_id: primerHora.turno_id, fecha: primerDia.fecha, hora: primerHora.hora },
      });
    }
  }

  function clickFilaCI(p: ProfesionalOferta) {
    if (!p.seleccionable) return;
    setSeleccion({ tipo: "ci", profesional: p });
    setExpandido(null);
    setConflictoEn(null);
  }

  function elegirSlot(p: ProfesionalOferta, fecha: string, hora: string, turno_id: string) {
    setSeleccion({ tipo: "turno", profesional: p, slot: { turno_id, fecha, hora } });
  }

  async function guardarContacto() {
    if (!paciente || !editando) return;
    setGuardando(true);
    setErrorEdit(null);
    try {
      const body = editando === "celular" ? { celular: valorEdit } : { email: valorEdit };
      const r = await fetch(`/api/otorgador/padron/${paciente.id}/contacto`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setErrorEdit(data.error ?? "No se pudo guardar.");
        return;
      }
      setPaciente({ ...paciente, celular: data.celular ?? paciente.celular, email: data.email ?? paciente.email });
      const campo = editando;
      setEditando(null);
      setValorEdit("");
      setCheckBreve(campo);
      setTimeout(() => setCheckBreve(null), 400);
    } catch {
      setErrorEdit("No se pudo guardar. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  async function asignar() {
    if (!paciente || !seleccion || sinCanal || asignando) return;
    setAsignando(true);
    setErrorAsignar(null);
    try {
      const esCI = seleccion.tipo === "ci";
      const r = await fetch(esCI ? "/api/otorgador/asignar-ci" : "/api/otorgador/asignar-turno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          esCI
            ? { paciente_id: paciente.id, medico_id: seleccion.profesional.medico_id }
            : { paciente_id: paciente.id, turno_id: seleccion.tipo === "turno" ? seleccion.slot.turno_id : "" }
        ),
      });
      const data = await r.json();
      if (!r.ok) {
        if (data.codigo === "conflicto_slot" && seleccion.tipo === "turno") {
          // Banner DENTRO de la fila expandida + slots refrescados. Paciente,
          // especialidad y profesional intactos (04-spec §1.7).
          setConflictoEn(seleccion.profesional.medico_id);
          setExpandido(seleccion.profesional.medico_id);
          setSeleccion(null);
          if (especialidad) void cargarOferta(especialidad);
        } else if (data.codigo === "medico_no_disponible" || data.codigo === "fuera_de_ventana") {
          setErrorAsignar(data.error ?? "No se pudo asignar.");
          if (especialidad) void cargarOferta(especialidad);
        } else {
          setErrorAsignar(data.error ?? "No se pudo asignar. Probá de nuevo.");
        }
        return;
      }
      setExito({
        tipo: esCI ? "ci" : "turno",
        pacienteNombre: paciente.nombre_completo,
        medicoNombre: data.medico?.nombre ?? seleccion.profesional.nombre,
        especialidad: data.medico?.especialidad ?? seleccion.profesional.especialidad,
        fechaLabel:
          !esCI && seleccion.tipo === "turno"
            ? labelFechaLarga(seleccion.slot.fecha, seleccion.slot.hora)
            : null,
        aviso: data.aviso ?? null,
        // Emitido SIEMPRE que la asignación se concreta (hallazgo revisión
        // Etapa 2): si el aviso automático no salió, el operador lo tiene acá
        // como fallback manual (copiar y mandarlo él, o dictarlo).
        accesoUrl: data.avisos?.acceso_url ?? null,
      });
    } catch {
      setErrorAsignar("No se pudo asignar. Revisá la conexión y probá de nuevo.");
    } finally {
      setAsignando(false);
    }
  }

  // ── Render de la lista priorizada (la API ordena; acá SOLO se agrupa) ──
  const profesionales = oferta?.profesionales ?? [];
  const activos = profesionales.filter((p) => !p.acuerdo_completo);
  const completos = profesionales.filter((p) => p.acuerdo_completo);
  const porCategoria = (cat: ProfesionalOferta["categoria"]) => activos.filter((p) => p.categoria === cat);

  const seleccionDe = (p: ProfesionalOferta) =>
    seleccion && seleccion.profesional.medico_id === p.medico_id ? seleccion : null;

  function renderSlots(p: ProfesionalOferta) {
    const sel = seleccionDe(p);
    return (
      <div className="slots">
        {conflictoEn === p.medico_id && (
          <div className="banner-conflicto">Ese horario se acaba de ocupar. Elegí otro.</div>
        )}
        {p.slots_semana.map((dia) => (
          <div className="slots-dia" key={dia.fecha}>
            <span className="slots-dia-label tnum">
              {dia.dia}
              {dia.fecha === hoyISO() ? " · Hoy" : ""}
            </span>
            <div className="slots-chips">
              {dia.horas.map((h) => (
                <button
                  key={h.turno_id}
                  className={`slot tnum${sel?.tipo === "turno" && sel.slot.turno_id === h.turno_id ? " sel" : ""}`}
                  onClick={() => elegirSlot(p, dia.fecha, h.hora, h.turno_id)}
                >
                  {h.hora}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderFila(p: ProfesionalOferta) {
    const sel = seleccionDe(p);
    const esCI = p.categoria === "ci_activa";
    const estaExpandido = expandido === p.medico_id;
    const ciSeleccionada = esCI && sel?.tipo === "ci";
    const clase = `prof${estaExpandido ? " exp" : ""}${ciSeleccionada ? " sel-ci" : ""}${p.acuerdo_completo ? " lleno-sem" : ""}`;

    return (
      <div className={clase} key={p.medico_id}>
        <div
          className="prof-fila"
          role="button"
          tabIndex={p.seleccionable ? 0 : -1}
          onClick={() => (esCI ? clickFilaCI(p) : clickFilaTurno(p))}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (esCI) clickFilaCI(p);
              else clickFilaTurno(p);
            }
          }}
        >
          <div className="avatar">{iniciales(p.nombre)}</div>
          <div className="prof-quien">
            <div className="prof-nombre">{p.nombre}</div>
            <div className="prof-esp">
              {p.especialidad}
              {esCI && p.activa_desde && <span className="desde"> · activa desde las {p.activa_desde}</span>}
            </div>
          </div>
          <div className="cupo">
            <MicroBarra x={p.asignados} y={p.acuerdo} />
            <span className="cupo-txt tnum">
              {p.asignados} de {p.acuerdo} asignados esta semana
            </span>
          </div>
          {sel?.tipo === "turno" && !estaExpandido ? (
            <div className="chip-resumen tnum">{labelProximo({ ...p, proximo: { fecha: sel.slot.fecha, hora: sel.slot.hora } })}</div>
          ) : esCI ? (
            <div className="prof-cuando">Ahora</div>
          ) : p.proximo ? (
            <div className="prof-cuando tnum">
              <span className="pfx">Próximo:</span> {labelProximo(p)}
            </div>
          ) : (
            <div />
          )}
          <div className="chev">{p.acuerdo_completo ? null : <Chevron arriba={estaExpandido} />}</div>
        </div>

        {/* CI seleccionada: el matiz "recomendación, no jaula" (04-spec §1.5.4) */}
        {ciSeleccionada && !estaExpandido && p.slots_semana.length > 0 && (
          <div className="ci-link">
            <a onClick={() => setExpandido(p.medico_id)}>¿No puede ahora? Ver horarios de la semana</a>
          </div>
        )}
        {estaExpandido && p.slots_semana.length > 0 && renderSlots(p)}
      </div>
    );
  }

  function renderCategoriaCI() {
    const filas = porCategoria("ci_activa");
    if (filas.length === 0) {
      return (
        <div className="cat-colapsada sin-borde">
          <strong>Puede atender ahora</strong> — nadie activo en este momento ·{" "}
          <span className="tnum">Ventana: {ventanaCI}</span>
        </div>
      );
    }
    return (
      <>
        <div className="cat-head">
          <span className="dot-verde dot-pulso" />
          <span className="cat-titulo">Puede atender ahora</span>
          <span className="chip-info tnum">Consulta inmediata · Ventana: {ventanaCI}</span>
        </div>
        {filas.map(renderFila)}
      </>
    );
  }

  function renderCategoriaTurnos(cat: "turno_acordado" | "turno_ofrecido") {
    const filas = porCategoria(cat);
    const titulo = cat === "turno_acordado" ? "Turno acordado" : "Turno ofrecido";
    const sub = cat === "turno_acordado" ? "— agenda asignada por la institución" : "— horarios que publicó el profesional";
    if (filas.length === 0) {
      return (
        <div className="cat-colapsada">
          <strong>{titulo}</strong> — sin horarios {cat === "turno_ofrecido" ? "publicados " : ""}esta semana.
        </div>
      );
    }
    return (
      <>
        <div className="cat-head">
          <span className="cat-titulo">{titulo}</span>
          <span className="cat-sub">{sub}</span>
        </div>
        {filas.map(renderFila)}
      </>
    );
  }

  // ── Barra sticky (04-spec §1.6) ──
  const miga = (() => {
    if (!paciente) return null;
    const partes: React.ReactNode[] = [<b key="p">{paciente.nombre_completo}</b>];
    if (!especialidad) {
      partes.push(<span className="sep" key="s1">→</span>, <span className="falta" key="f1">elegí especialidad</span>);
      return partes;
    }
    partes.push(<span className="sep" key="s1">→</span>, <span key="e">{especialidad}</span>);
    if (!seleccion) {
      partes.push(<span className="sep" key="s2">→</span>, <span className="falta" key="f2">elegí profesional</span>);
      return partes;
    }
    partes.push(<span className="sep" key="s2">→</span>, <b key="m">{seleccion.profesional.nombre}</b>);
    partes.push(
      <span className="sep" key="s3">→</span>,
      <b className="tnum" key="h">
        {seleccion.tipo === "ci"
          ? "Ahora"
          : labelProximo({ ...seleccion.profesional, proximo: { fecha: seleccion.slot.fecha, hora: seleccion.slot.hora } })}
      </b>
    );
    return partes;
  })();

  const botonListo = !!paciente && !!seleccion && !sinCanal && !asignando;
  const labelBoton = seleccion?.tipo === "ci" ? "Asignar consulta" : "Asignar turno";

  const especialidadesConCI = chips.filter((c) => c.ci_activa_ahora).map((c) => c.nombre);

  return (
    <div className="otg">
      {/* Header institucional del mock (la franja de 4px la pinta el layout
          global vía InstitucionTheme — no se duplica acá). */}
      <header className="header">
        <div className="header-izq">
          {/* logo_path llega con el bucket institucion-assets (Etapa 5) */}
          <div className="logo-ph">LOGO INSTITUCIÓN</div>
          <div>
            <div className="inst-nombre">{instNombre}</div>
            {instSubnombre && <div className="inst-sub">{instSubnombre}</div>}
          </div>
        </div>
        <div className="header-der">
          <div className="quien">
            <div className="op-nombre">{operadorNombre}</div>
            <div className="op-centro">{operadorRol}</div>
          </div>
          <div className="op-avatar">{iniciales(operadorNombre)}</div>
        </div>
      </header>

      <main className="trabajo">
        {/* ── BLOQUE 1 · PACIENTE ── */}
        <section className="card b-paciente" ref={bloque1Ref}>
          <span className="label">Paciente</span>
          {!paciente ? (
            <div className="buscar">
              {IconoLupa}
              <input
                ref={inputRef}
                type="text"
                placeholder="DNI o apellido del paciente"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && resultados && resultados.length > 0) fijarPaciente(resultados[0]);
                  if (e.key === "Escape") {
                    setQuery("");
                    setResultados(null);
                  }
                }}
              />
              <span className="hint">
                <kbd>⏎</kbd> primer resultado
              </span>
              {resultados !== null && (
                <div className="dropdown">
                  {resultados.length === 0 ? (
                    <div className="dd-vacio">
                      <div className="dd-vacio-titulo">No está en el padrón de la institución.</div>
                      <div className="dd-vacio-cuerpo">
                        El alta de pacientes la gestiona {instNombre}. Verificá el DNI con el paciente antes de derivar.
                      </div>
                    </div>
                  ) : (
                    resultados.map((r, i) => (
                      <div key={r.id} className={`dd-fila${i === 0 ? " hl" : ""}`} onClick={() => fijarPaciente(r)}>
                        <span className="dd-nombre">{r.nombre_completo}</span>
                        <span className="dd-meta tnum">
                          {r.dni ? `DNI ${formatearDNI(r.dni)}` : "sin DNI"}
                          {r.edad !== null ? ` · ${r.edad} años` : ""}
                          {r.localidad ? ` · ${r.localidad}` : ""}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="paciente-fijado">
              <div className="pf-fila1">
                <span className="pf-nombre">{paciente.nombre_completo}</span>
                <span className="pf-cambiar">
                  <a onClick={resetTodo}>Cambiar paciente</a>
                  <kbd>Esc</kbd>
                </span>
              </div>
              <div className="pf-grid">
                <div className="pf-par">
                  <span className="label">DNI</span>
                  <span className="pf-valor tnum">{formatearDNI(paciente.dni)}</span>
                </div>
                <div className="pf-par">
                  <span className="label">Fecha de nacimiento</span>
                  <span className="pf-valor tnum">
                    {paciente.fecha_nacimiento
                      ? paciente.fecha_nacimiento.split("-").reverse().join("/")
                      : "—"}{" "}
                    {paciente.edad !== null && <span className="sec">({paciente.edad} años)</span>}
                  </span>
                </div>
                <div className="pf-par">
                  <span className="label">Sexo</span>
                  <span className="pf-valor">
                    {paciente.sexo_dni ? paciente.sexo_dni[0].toUpperCase() + paciente.sexo_dni.slice(1) : "—"}
                  </span>
                </div>
                <div className="pf-par">
                  <span className="label">Localidad</span>
                  <span className="pf-valor">{paciente.localidad ?? "—"}</span>
                </div>
                {/* Celular */}
                <div className="pf-par">
                  <span className="label">Celular</span>
                  {editando === "celular" ? (
                    <div>
                      <div className="edit-inline">
                        <input
                          autoFocus
                          placeholder="+54 9 ..."
                          value={valorEdit}
                          onChange={(e) => setValorEdit(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void guardarContacto();
                            if (e.key === "Escape") {
                              setEditando(null);
                              setErrorEdit(null);
                            }
                          }}
                        />
                        <button className="btn-guardar" onClick={() => void guardarContacto()} disabled={guardando}>
                          {guardando ? "…" : "Guardar"}
                        </button>
                      </div>
                      {errorEdit ? (
                        <div className="error-inline">{errorEdit}</div>
                      ) : (
                        <div className="microcopy">Queda guardado en el padrón para las próximas veces.</div>
                      )}
                    </div>
                  ) : paciente.celular ? (
                    <span className="pf-valor tnum">
                      {paciente.celular} {checkBreve === "celular" ? <span style={{ color: "#1D9E75" }}>✓</span> : <span className="dot-verde" />}
                      <span className="sec">recibe WhatsApp</span>
                      <button
                        className="lapiz"
                        title="Editar celular"
                        onClick={() => {
                          setEditando("celular");
                          setValorEdit(paciente.celular ?? "");
                          setErrorEdit(null);
                        }}
                      >
                        ✎
                      </button>
                    </span>
                  ) : (
                    <button
                      className="chip-pendiente"
                      onClick={() => {
                        setEditando("celular");
                        setValorEdit("");
                        setErrorEdit(null);
                      }}
                    >
                      ＋ Agregar celular
                    </button>
                  )}
                </div>
                {/* Mail */}
                <div className="pf-par">
                  <span className="label">Mail</span>
                  {editando === "mail" ? (
                    <div>
                      <div className="edit-inline">
                        <input
                          autoFocus
                          placeholder="nombre@ejemplo.com"
                          value={valorEdit}
                          onChange={(e) => setValorEdit(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void guardarContacto();
                            if (e.key === "Escape") {
                              setEditando(null);
                              setErrorEdit(null);
                            }
                          }}
                        />
                        <button className="btn-guardar" onClick={() => void guardarContacto()} disabled={guardando}>
                          {guardando ? "…" : "Guardar"}
                        </button>
                      </div>
                      {errorEdit ? (
                        <div className="error-inline">{errorEdit}</div>
                      ) : (
                        <div className="microcopy">Queda guardado en el padrón para las próximas veces.</div>
                      )}
                    </div>
                  ) : paciente.email ? (
                    <span className="pf-valor">
                      {paciente.email} {checkBreve === "mail" && <span style={{ color: "#1D9E75" }}>✓</span>}
                      <button
                        className="lapiz"
                        title="Editar mail"
                        onClick={() => {
                          setEditando("mail");
                          setValorEdit(paciente.email ?? "");
                          setErrorEdit(null);
                        }}
                      >
                        ✎
                      </button>
                    </span>
                  ) : (
                    <button
                      className="chip-pendiente"
                      onClick={() => {
                        setEditando("mail");
                        setValorEdit("");
                        setErrorEdit(null);
                      }}
                    >
                      ＋ Agregar mail
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── BLOQUE 2 · ESPECIALIDAD ── */}
        <section className={`card b-esp${!paciente ? " atenuado" : ""}`}>
          <div className="esp-head">
            <span className="label">Especialidad</span>
          </div>
          <div className="chips-clip">
            <div className="chips-fila" ref={chipsRef}>
              {chips.map((c) => (
                <button
                  key={c.nombre}
                  className={`chip-esp${especialidad === c.nombre ? " sel" : ""}`}
                  onClick={() => elegirEspecialidad(c.nombre)}
                >
                  {c.ci_activa_ahora && <span className="dot-verde dot-pulso" />}
                  {c.nombre}
                </button>
              ))}
            </div>
            <div className="chips-mask" />
            <div
              className="chips-chevron"
              onClick={() => chipsRef.current?.scrollBy({ left: 240, behavior: "smooth" })}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 5 7 7-7 7" />
              </svg>
            </div>
          </div>
        </section>

        {/* ── BLOQUE 3 · OFERTA ── */}
        <section className={`card b-oferta${!paciente ? " atenuado" : ""}`}>
          {!paciente ? (
            <div className="sin-oferta">
              <div className="sin-oferta-cuerpo">Buscá un paciente para empezar.</div>
            </div>
          ) : !especialidad ? (
            <div className="sin-oferta">
              <div className="sin-oferta-titulo">
                Elegí una especialidad para ver quién puede atender a {paciente.nombre_completo.split(" ")[0]}.
              </div>
              {especialidadesConCI.length > 0 && (
                <div className="sin-oferta-cuerpo">
                  Ahora mismo hay profesionales con consulta inmediata activa en:{" "}
                  {especialidadesConCI.join(", ").replace(/, ([^,]*)$/, " y $1")}.
                </div>
              )}
            </div>
          ) : cargandoOferta ? (
            <div className="sin-oferta">
              <div className="sin-oferta-cuerpo">Buscando la oferta de {especialidad}…</div>
            </div>
          ) : errorOferta ? (
            <div className="sin-oferta">
              <div className="sin-oferta-titulo">{errorOferta}</div>
              <div className="sin-oferta-cuerpo">
                <a style={{ color: "#378ADD", cursor: "pointer" }} onClick={() => void cargarOferta(especialidad)}>
                  Reintentar
                </a>
              </div>
            </div>
          ) : !oferta || profesionales.length === 0 ? (
            <div className="sin-oferta">
              <div className="sin-oferta-titulo">{especialidad} no tiene horarios esta semana.</div>
              <div className="sin-oferta-cuerpo">
                Podés elegir otra especialidad, o registrale el pedido a {instNombre} para la próxima semana.
              </div>
            </div>
          ) : (
            <>
              <div className="of-head">
                <div>
                  <span className="label">Oferta · {especialidad}</span>
                  <span className="of-caption">
                    Orden sugerido: primero quien puede atender ahora; entre agendas, quien menos asignaciones lleva esta semana.
                  </span>
                </div>
              </div>
              {renderCategoriaCI()}
              {renderCategoriaTurnos("turno_acordado")}
              {renderCategoriaTurnos("turno_ofrecido")}
              {completos.length > 0 && (
                <>
                  <div className="sep-acuerdo">
                    <span>Con el acuerdo de esta semana completo</span>
                  </div>
                  {completos.map(renderFila)}
                </>
              )}
            </>
          )}
        </section>

        {errorAsignar && (
          <div className="card" style={{ padding: "12px 16px", borderColor: "#F3C9B8", background: "#FDF1EC", color: "#D85A30", fontSize: 13, fontWeight: 500 }}>
            {errorAsignar}
          </div>
        )}
      </main>

      {/* ── BARRA STICKY ── */}
      <footer className="barra">
        <div className="barra-in">
          <div className="miga">{miga ?? <span className="falta">Buscá un paciente para empezar.</span>}</div>
          {paciente && seleccion && sinCanal && (
            <button
              className="aviso-contacto"
              onClick={() => {
                bloque1Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                setEditando("celular");
                setValorEdit("");
                setErrorEdit(null);
              }}
            >
              Falta un celular o mail para enviarle el acceso
            </button>
          )}
          <button className={`btn-asignar${botonListo ? "" : " dis"}`} disabled={!botonListo} onClick={() => void asignar()}>
            {asignando ? "Asignando…" : labelBoton}
          </button>
        </div>
      </footer>

      {/* ── ÉXITO (overlay) ── */}
      {exito && (
        <div className="overlay">
          <div className="card exito">
            <div className="check-verde">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </div>
            <div className="exito-titulo">{exito.tipo === "ci" ? "Consulta asignada" : "Turno asignado"}</div>
            <div className="exito-quien">
              {exito.pacienteNombre} — {exito.medicoNombre}, {exito.especialidad}
            </div>
            {exito.fechaLabel && <div className="exito-cuando tnum">{exito.fechaLabel}</div>}
            <div className="exito-aviso">
              {exito.aviso?.ok
                ? `Le enviamos el acceso por ${exito.aviso.canal === "whatsapp" ? "WhatsApp" : "mail"} a ${exito.aviso.destino}.`
                : "No pudimos enviarle el acceso automáticamente todavía: avisale por teléfono."}
              {exito.tipo === "ci" && exito.aviso?.ok ? " Ya puede entrar a la sala de espera." : ""}
            </div>
            {/* Aviso automático fallido o sin canal → el link de acceso igual
                existe (se emite SIEMPRE): fallback manual del operador. */}
            {!exito.aviso?.ok && exito.accesoUrl && (
              <div className="exito-aviso" style={{ marginTop: 8 }}>
                Su link de acceso, por si se lo podés hacer llegar vos:
                <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 6 }}>
                  <code style={{ fontSize: 12, background: "#F3F4F6", padding: "4px 8px", borderRadius: 6, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {exito.accesoUrl}
                  </code>
                  <button
                    className="btn-sec"
                    style={{ padding: "4px 10px", fontSize: 12 }}
                    onClick={() => {
                      if (exito.accesoUrl) void navigator.clipboard?.writeText(exito.accesoUrl).catch(() => {});
                    }}
                  >
                    Copiar
                  </button>
                </div>
              </div>
            )}
            <div className="exito-botones">
              <button
                autoFocus
                className="btn-primario"
                onClick={() => {
                  setExito(null);
                  resetTodo();
                }}
              >
                Asignar otro turno
              </button>
              {/* Reenviar aviso: necesita el token del link-sesión (Etapa 3) */}
              <button className="btn-sec" disabled title="Disponible cuando exista el link de acceso (próxima etapa)">
                Reenviar aviso
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
