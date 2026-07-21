"use client";

// Wizard de onboarding del médico (post-aprobación). Pantalla completa, un paso
// por pantalla, barra de progreso, retoma donde quedó. Reusa los endpoints que
// ya existen — no reimplementa guardado. Gate de "disponible" = los 4 pasos.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FirmaManuscrita from "@/app/medico/perfil/FirmaManuscrita";
import { createClient } from "@/lib/supabase/client";
import { CONSENTIMIENTO_IDENTIDAD_TEXTO } from "@/lib/didit/consentimiento";

const C = {
  azul: "#378ADD",
  verde: "#1D9E75",
  rojo: "#E24B4A",
  amarillo: "#BA7517",
  naranja: "#D85A30",
  gris: "#888780",
};

type Pasos = {
  mp: boolean;
  celular: boolean;
  foto: boolean;
  firma: boolean;
  domicilio: boolean;
  biometrico: boolean;
};
type Key = keyof Pasos;
const ORDEN: Key[] = ["mp", "celular", "foto", "firma", "domicilio", "biometrico"];
const TOTAL = ORDEN.length;

type Props = {
  nombre: string;
  pasos: Pasos;
  fotoUrl: string | null;
  firmaUrl: string | null;
  domicilioInicial: string;
  provinciaInicial: string;
  celularInicial: string;
  diditStatus: string | null;
  userId: string;
  pasoInicialParam: string | null;
  mpResultado: string | null; // "ok" | "error" | null (al volver del OAuth)
  mpError: string | null; // credentials_mismatch | mp_account_already_linked | ...
};

// Estado del biométrico derivado del didit_status (espejo de mapEstado de
// PantallaIdentidad, sin `recienVolvio`: el wizard se monta en carga normal).
type EstadoBio = "sin_empezar" | "procesando" | "en_revision" | "rechazada" | "aprobada";
function mapEstadoBio(diditStatus: string | null, aprobado: boolean): EstadoBio {
  if (aprobado) return "aprobada";
  const s = diditStatus ?? "Not Started";
  if (s === "Approved") return "procesando";
  if (s === "In Review" || s === "Resubmitted") return "en_revision";
  if (s === "Declined") return "rechazada";
  // In Progress / Abandoned / Expired / Not Started → arranca de cero.
  return "sin_empezar";
}

const apellido = (n: string) => {
  const partes = n.trim().split(/\s+/);
  return partes.length > 1 ? partes[partes.length - 1] : n;
};

const CIERRE = TOTAL + 1; // paso 7 con 6 pasos

export default function OnboardingWizard(props: Props) {
  const router = useRouter();
  const [hechos, setHechos] = useState<Pasos>(props.pasos);

  // Estado del biométrico, vivo: arranca del didit_status y se actualiza por
  // polling (webhook de Didit). Decisión de Diego: async, no bloquea el cierre.
  const [estadoBio, setEstadoBio] = useState<EstadoBio>(
    mapEstadoBio(props.diditStatus, props.pasos.biometrico)
  );

  // Polling cada 8s: si el webhook valida la identidad o cambia el didit_status,
  // refrescamos el estado del paso 6 SIN recargar la página ni matar el wizard.
  // (Regla del repo: no meter `estado` en deps y matar el interval; acá el
  // efecto monta una sola vez y vive todo el wizard.)
  const diditRef = useRef(props.diditStatus);
  useEffect(() => {
    if (props.pasos.biometrico) return; // ya estaba aprobado/exento, nada que pollear
    const supabase = createClient();
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("medicos")
        .select("identidad_validada, biometria_exenta, didit_status")
        .eq("user_id", props.userId)
        .single();
      if (!data) return;
      if (data.identidad_validada || data.biometria_exenta) {
        diditRef.current = data.didit_status;
        setEstadoBio("aprobada");
        setHechos((h) => ({ ...h, biometrico: true }));
        clearInterval(interval);
        return;
      }
      if (data.didit_status !== diditRef.current) {
        diditRef.current = data.didit_status;
        setEstadoBio(mapEstadoBio(data.didit_status, false));
      }
    }, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El biométrico NO traba el cierre: solo cuenta `aprobada`. Para decidir si ya
  // se puede ir al cierre, tratamos el paso 6 como "resuelto" en cualquier estado
  // que no sea volver a la pantalla inicial (sin_empezar). Una vez que el médico
  // disparó Didit, el caminito está completo aunque la validación siga en vuelo.
  const bioResuelto = () => hechos.biometrico || estadoBio !== "sin_empezar";

  // Paso actual: 0 = bienvenida; 1-6 = MP/celular/foto/firma/domicilio/biométrico; 7 = cierre.
  const primerIncompleto = () => {
    const idx = ORDEN.findIndex((k) => !hechos[k]);
    return idx === -1 ? CIERRE : idx + 1;
  };
  const inicial = () => {
    if (props.mpResultado) return 1; // volvió del OAuth → mostrar resultado MP
    if (props.pasoInicialParam) {
      const n = parseInt(props.pasoInicialParam, 10);
      if (n >= 1 && n <= TOTAL) return n;
    }
    return 0; // bienvenida
  };
  const [paso, setPaso] = useState<number>(inicial);

  const completados = ORDEN.filter((k) => hechos[k]).length;
  const porcentaje = Math.round((completados / TOTAL) * 100);

  const marcar = (k: Key) => setHechos((h) => ({ ...h, [k]: true }));
  const avanzar = (desde: number) => {
    // Próximo paso incompleto a partir de `desde`.
    for (let i = desde; i < TOTAL; i++) {
      if (!hechos[ORDEN[i]]) return setPaso(i + 1);
    }
    // No llegar al cierre con un paso anterior salteado (ej. MP con "lo hago al
    // final"): si quedó alguno pendiente, volver a ese paso. El biométrico NO
    // cuenta como pendiente bloqueante (decisión de Diego: async).
    const pendiente = ORDEN.findIndex((k) => !hechos[k] && k !== "biometrico");
    setPaso(pendiente === -1 ? CIERRE : pendiente + 1);
  };

  // ── chrome ──────────────────────────────────────────────
  // El paso biométrico (último) va AMARILLO mientras está procesando/en revisión
  // (pendiente, no traba), VERDE solo cuando quedó aprobado.
  const bioPendiente = estadoBio === "procesando" || estadoBio === "en_revision";
  const Progreso = () => (
    <div className="mb-8">
      <div className="flex items-center gap-2">
        {ORDEN.map((k, i) => {
          const done = hechos[k];
          const actual = paso === i + 1;
          const pendienteAmarillo = k === "biometrico" && !done && bioPendiente;
          const bg = done
            ? C.verde
            : pendienteAmarillo
              ? C.amarillo
              : actual
                ? C.azul
                : "#E5E7EB";
          return (
            <div key={k} className="flex flex-1 items-center">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: bg,
                  color: done || actual || pendienteAmarillo ? "#fff" : C.gris,
                }}
              >
                {done ? "✓" : pendienteAmarillo ? "…" : i + 1}
              </span>
              {i < TOTAL - 1 && (
                <span
                  className="mx-1 h-0.5 flex-1 rounded"
                  style={{ backgroundColor: hechos[ORDEN[i + 1]] ? C.verde : "#E5E7EB" }}
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-right text-xs font-medium" style={{ color: C.gris }}>
        Paso {Math.min(paso, TOTAL)} de {TOTAL} · {porcentaje}%
      </p>
    </div>
  );

  const Marco = ({ children }: { children: React.ReactNode }) => (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-8">{children}</div>
  );

  // ── BIENVENIDA ──────────────────────────────────────────
  if (paso === 0) {
    return (
      <Marco>
        <div className="flex flex-1 flex-col justify-center">
          <span
            className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            style={{ backgroundColor: "#E8F5F0", color: C.verde }}
          >
            ✓ Matrícula validada
          </span>
          <h1 className="text-2xl font-semibold text-gray-900">
            Bienvenido a Docto, Dr. {apellido(props.nombre)}
          </h1>
          <p className="mt-2 text-gray-600">
            Te quedan 6 pasos para empezar a atender. Son unos minutos.
          </p>
          <div className="mt-6 space-y-3 rounded-xl p-4" style={{ border: `1px solid ${C.azul}33` }}>
            {[
              ["💳", "Conectá Mercado Pago", "para cobrar tus consultas"],
              ["📱", "Tu celular personal", "para avisarte cuando un paciente te espera"],
              ["📸", "Foto de perfil", "para que el paciente te reconozca"],
              ["✍️", "Firma", "para tus recetas"],
              ["🏥", "Domicilio del consultorio", "requisito para la receta electrónica"],
              ["🛡️", "Verificá tu identidad", "para proteger a tus pacientes"],
            ].map(([ic, t, sub]) => (
              <div key={t} className="flex items-start gap-3">
                <span className="text-xl">{ic}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{t}</p>
                  <p className="text-xs text-gray-500">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={() => setPaso(primerIncompleto())}
          className="mt-6 h-13 w-full rounded-xl py-3.5 text-base font-semibold text-white"
          style={{ backgroundColor: C.azul }}
        >
          Empezar
        </button>
      </Marco>
    );
  }

  // ── CIERRE ──────────────────────────────────────────────
  if (paso === CIERRE) {
    const bioListo = hechos.biometrico || estadoBio === "aprobada";
    return (
      <Marco>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-full text-3xl text-white"
            style={{ backgroundColor: bioListo ? C.verde : C.amarillo }}
          >
            {bioListo ? "✓" : "…"}
          </span>
          {bioListo ? (
            <>
              <h1 className="mt-5 text-2xl font-semibold text-gray-900">
                ¡Listo, Dr. {apellido(props.nombre)}!
              </h1>
              <p className="mt-2 text-gray-600">Ya podés empezar a atender en Docto.</p>
            </>
          ) : (
            <>
              <h1 className="mt-5 text-2xl font-semibold text-gray-900">
                ¡Casi listo, Dr. {apellido(props.nombre)}!
              </h1>
              <p className="mt-2 text-gray-600">
                Completaste tu perfil. Estamos terminando de verificar tu identidad — te
                avisamos por email apenas esté lista. Mientras tanto ya podés preparar tu agenda.
              </p>
            </>
          )}
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          className="mt-6 w-full rounded-xl py-3.5 text-base font-semibold text-white"
          style={{ backgroundColor: C.azul }}
        >
          Ir a mi panel
        </button>
      </Marco>
    );
  }

  // ── PASOS ───────────────────────────────────────────────
  return (
    <Marco>
      <Progreso />
      <div className="flex-1">
        {paso === 1 && <PasoMP {...props} hecho={hechos.mp} onSkip={() => { if (ORDEN.slice(1).some((k) => !hechos[k] && k !== "biometrico")) avanzar(1); else setPaso(CIERRE); }} onDone={() => { marcar("mp"); avanzar(1); }} />}
        {paso === 2 && <PasoCelular inicial={props.celularInicial} hecho={hechos.celular} onDone={() => { marcar("celular"); avanzar(2); }} />}
        {paso === 3 && <PasoFoto fotoUrl={props.fotoUrl} onDone={() => { marcar("foto"); avanzar(3); }} />}
        {paso === 4 && <PasoFirma firmaUrl={props.firmaUrl} onDone={() => { marcar("firma"); avanzar(4); }} />}
        {paso === 5 && <PasoDomicilio inicial={props.domicilioInicial} provinciaInicial={props.provinciaInicial} onDone={() => { marcar("domicilio"); avanzar(5); }} />}
        {paso === 6 && <PasoBiometrico estado={estadoBio} onFinalizar={() => setPaso(CIERRE)} />}
      </div>
    </Marco>
  );
}

// ════════ PASO 1 — MERCADO PAGO ════════
function PasoMP({ hecho, mpError, onSkip, onDone }: { hecho: boolean; mpError: string | null; onSkip: () => void; onDone: () => void }) {
  const errores: Record<string, { titulo: string; texto: string }> = {
    credentials_mismatch: {
      titulo: "No pudimos conectar tu cuenta",
      texto: "Parece que usaste una cuenta de prueba de Mercado Pago. Necesitás conectar tu cuenta real, la que usás para cobrar.",
    },
    mp_account_already_linked: {
      titulo: "Esa cuenta ya está en uso",
      texto: "Esta cuenta de Mercado Pago ya está vinculada a otro profesional en Docto. Conectá con otra cuenta, o escribinos a soporte@docto.com.ar.",
    },
  };
  const err = mpError ? errores[mpError] ?? { titulo: "No pudimos conectar tu cuenta", texto: "Intentá de nuevo." } : null;

  if (hecho) {
    return (
      <Centro icono="💳" titulo="Mercado Pago conectado">
        <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: "#E8F5F0", color: C.verde }}>
          ✓ Tu cuenta quedó conectada. Vas a recibir los pagos directo.
        </div>
        <CTA onClick={onDone}>Siguiente</CTA>
      </Centro>
    );
  }
  return (
    <Centro icono="💳" titulo="Conectá Mercado Pago" sub="Es donde vas a recibir el pago de cada consulta. La plata va directo a tu cuenta — Docto nunca la toca.">
      {err && (
        <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: "#FEF2F2", color: C.rojo }}>
          <p className="font-semibold">{err.titulo}</p>
          <p className="mt-1">{err.texto}</p>
        </div>
      )}
      <CTA onClick={() => { window.location.href = "/api/mp/oauth/start?origin=onboarding"; }}>
        {err ? "Intentar de nuevo" : "Conectar Mercado Pago"}
      </CTA>
      <p className="text-center text-xs" style={{ color: C.gris }}>
        Te vamos a llevar a Mercado Pago y volvés acá automáticamente.
      </p>
      <button onClick={onSkip} className="w-full text-center text-sm" style={{ color: C.gris }}>
        Lo hago al final
      </button>
    </Centro>
  );
}

// ════════ PASO 2 — CELULAR ════════
// Móvil AR nacional = 10 dígitos (área + abonado). El backend normaliza a E.164
// al usar el número (normalizarTelefonoAR), así que acá validamos lo mismo y
// guardamos el número nacional tal cual lo tipea el médico.
const inputCelCls = "w-full rounded-xl border px-4 py-3 text-base outline-none focus:ring-2";

// 10 dígitos exactos (después de pelar lo que sobre) = móvil AR válido.
function celularARValido(raw: string): boolean {
  return /^\d{10}$/.test(raw.replace(/\D/g, "").replace(/^0/, "").replace(/^15/, ""));
}
// "1123456789" → "11 2345 6789" (solo cosmético en el estado "ya cargado").
function formatoNacional(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^54/, "").replace(/^9/, "").replace(/^0/, "");
  if (d.length !== 10) return raw;
  return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
}

function PasoCelular({ inicial, hecho, onDone }: { inicial: string; hecho: boolean; onDone: () => void }) {
  const [editando, setEditando] = useState(!hecho);
  const [valor, setValor] = useState(inicial.replace(/\D/g, "").replace(/^54/, "").replace(/^9/, "").replace(/^0/, ""));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tocado, setTocado] = useState(false);

  const valido = celularARValido(valor);

  const guardar = async () => {
    if (!valido) {
      setTocado(true);
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      const res = await fetch("/api/medico/perfil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ celular_personal: valor.replace(/\D/g, "") }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || "No se pudo guardar.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  // Estado "ya cargado": vuelve y ya tiene celular → confirmación rápida.
  if (hecho && !editando) {
    return (
      <Centro icono="📱" titulo="Tu celular personal">
        <div className="space-y-1 rounded-xl p-3 text-sm" style={{ backgroundColor: "#E8F5F0", color: C.verde }}>
          <p>✓ Te vamos a avisar a este número apenas tengas un paciente esperando.</p>
          <p className="font-semibold">+54 9 {formatoNacional(inicial)}</p>
        </div>
        <CTA onClick={onDone}>Siguiente</CTA>
        <button onClick={() => setEditando(true)} className="w-full text-center text-sm" style={{ color: C.gris }}>
          Cambiar número
        </button>
      </Centro>
    );
  }

  return (
    <Centro
      icono="📱"
      titulo="Tu celular personal"
      sub="Es la vía por la que te avisamos al instante cuando un paciente te está esperando. Sin tu celular, te enterás solo si tenés el panel abierto."
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Celular</label>
        <div className="flex items-stretch">
          <span
            className="flex shrink-0 items-center rounded-l-xl border border-r-0 px-3 text-base text-gray-600"
            style={{ borderColor: "#D1D5DB", backgroundColor: "#F3F4F6" }}
          >
            +54 9
          </span>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onBlur={() => setTocado(true)}
            inputMode="tel"
            placeholder="11 2345 6789"
            className={`${inputCelCls} rounded-l-none`}
            style={{ borderColor: tocado && !valido ? C.rojo : "#D1D5DB" }}
          />
        </div>
        <p className="mt-1 text-xs" style={{ color: C.gris }}>
          Número de celular argentino. Lo usamos solo para avisarte, nunca para llamadas comerciales.
        </p>
        {tocado && !valido && (
          <p className="mt-1 text-sm" style={{ color: C.rojo }}>
            Revisá el número, parece incompleto.
          </p>
        )}
      </div>
      {error && <p className="text-sm" style={{ color: C.rojo }}>{error}</p>}
      <CTA onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Siguiente"}</CTA>
    </Centro>
  );
}

// ════════ PASO 3 — FOTO ════════
function PasoFoto({ fotoUrl, onDone }: { fotoUrl: string | null; onDone: () => void }) {
  const [preview, setPreview] = useState<string | null>(fotoUrl);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subir = async (file: File) => {
    setError(null);
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("foto", file);
      const res = await fetch("/api/medico/foto", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo subir la foto.");
      setPreview(data.foto_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Centro icono="📸" titulo="Subí tu foto de perfil" sub="Es lo primero que ve el paciente cuando elige con quién atenderse.">
      <label className="mx-auto flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed" style={{ borderColor: C.azul }}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="px-2 text-center text-xs" style={{ color: C.gris }}>{subiendo ? "Subiendo…" : "Tocá para elegir"}</span>
        )}
        <input type="file" accept="image/*" className="hidden" disabled={subiendo} onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])} />
      </label>
      {error && <p className="text-center text-sm" style={{ color: C.rojo }}>{error}</p>}
      <CTA onClick={onDone} disabled={!preview || subiendo}>Siguiente</CTA>
    </Centro>
  );
}

// ════════ PASO 4 — FIRMA ════════
function PasoFirma({ firmaUrl, onDone }: { firmaUrl: string | null; onDone: () => void }) {
  // "Continuar" no se habilita hasta que la imagen de firma esté efectivamente
  // guardada (vía el botón propio de FirmaManuscrita) — evita avanzar con la
  // firma manuscrita vacía. Si ya había firma, arranca lista.
  const [firmaLista, setFirmaLista] = useState(!!firmaUrl);
  const [provisionando, setProvisionando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const continuar = async () => {
    setError(null);
    setProvisionando(true);
    try {
      // Provisiona las claves de firma electrónica (medico_claves) — esto es lo
      // que mira el gate. La imagen manuscrita la guarda el componente de arriba.
      const res = await fetch("/api/firma/configurar", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || "No se pudo configurar la firma.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo configurar la firma.");
    } finally {
      setProvisionando(false);
    }
  };

  return (
    <Centro icono="✍️" titulo="Tu firma para las recetas" sub={firmaUrl ? "Tu firma ya está cargada. Revisala y continuá — vamos a activar tu firma electrónica." : "Dibujá tu firma o subí una foto, y tocá «Guardar firma». Después continuás."}>
      <FirmaManuscrita firmaUrl={firmaUrl} onGuardada={() => setFirmaLista(true)} />
      {error && <p className="text-center text-sm" style={{ color: C.rojo }}>{error}</p>}
      <CTA onClick={continuar} disabled={!firmaLista || provisionando}>{provisionando ? "Activando…" : "Continuar"}</CTA>
    </Centro>
  );
}

// ════════ PASO 5 — DOMICILIO ════════
const PROVINCIAS = [
  "Buenos Aires", "Ciudad Autónoma de Buenos Aires", "Catamarca", "Chaco", "Chubut",
  "Córdoba", "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja",
  "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis",
  "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán",
];

function PasoDomicilio({ inicial, provinciaInicial, onDone }: { inicial: string; provinciaInicial: string; onDone: () => void }) {
  const [calle, setCalle] = useState(inicial);
  const [ciudad, setCiudad] = useState("");
  const [provincia, setProvincia] = useState(provinciaInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (!calle.trim() || !ciudad.trim() || !provincia.trim()) {
      setError("Completá calle y número, ciudad y provincia.");
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      // domicilio_consultorio es lo que va en la receta: lo componemos estructurado.
      const domicilio_consultorio = `${calle.trim()}, ${ciudad.trim()}, ${provincia}`;
      const res = await fetch("/api/medico/perfil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domicilio_consultorio, provincia }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || "No se pudo guardar.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const inputCls = "w-full rounded-xl border px-4 py-3 text-base outline-none focus:ring-2";
  return (
    <Centro icono="🏥" titulo="Domicilio del consultorio" sub="Requisito para la receta electrónica. Aunque atiendas solo de forma virtual, la receta necesita un domicilio profesional registrado.">
      <input value={calle} onChange={(e) => setCalle(e.target.value)} placeholder="Calle y número" className={inputCls} style={{ borderColor: "#D1D5DB" }} />
      <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Ciudad / Localidad" className={inputCls} style={{ borderColor: "#D1D5DB" }} />
      <select value={provincia} onChange={(e) => setProvincia(e.target.value)} className={inputCls} style={{ borderColor: "#D1D5DB", appearance: "none" }}>
        <option value="">Provincia</option>
        {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      {error && <p className="text-sm" style={{ color: C.rojo }}>{error}</p>}
      <CTA onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Siguiente"}</CTA>
    </Centro>
  );
}

// ════════ PASO 6 — BIOMÉTRICO (Didit) ════════
// Decisión de Diego: async, no bloqueante. El médico dispara Didit y vuelve;
// la validación se completa por webhook + polling. NINGÚN estado salvo
// `aprobada` traba el cierre. El polling vive en el componente padre.
function PasoBiometrico({ estado, onFinalizar }: { estado: EstadoBio; onFinalizar: () => void }) {
  const [aceptado, setAceptado] = useState(false);
  const [verConsentimiento, setVerConsentimiento] = useState(false);
  const [intentoSinAceptar, setIntentoSinAceptar] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mismo fetch que PantallaIdentidad: registra el consentimiento expreso y
  // redirige a Didit. Al volver, el polling del padre detecta el nuevo estado.
  const iniciarVerificacion = async () => {
    setCargando(true);
    setError(null);
    try {
      const resp = await fetch("/api/didit/crear-sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentimiento: true, origin: "onboarding" }),
      });
      const data = await resp.json().catch(() => ({}));
      if (data?.yaValidado) {
        onFinalizar();
        return;
      }
      if (!resp.ok || !data?.url) throw new Error(data?.error ?? "error");
      window.location.href = data.url;
    } catch {
      setError("No pudimos iniciar la verificación. Probá de nuevo en un momento.");
      setCargando(false);
    }
  };

  // ── procesando ──
  if (estado === "procesando") {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-[3px]"
            style={{ borderColor: `${C.azul}22`, borderTopColor: C.azul }}
            role="status"
            aria-label="Procesando"
          />
          <h2 className="text-xl font-semibold text-gray-900">Procesando tu verificación…</h2>
          <p className="mt-1 text-sm text-gray-600">Esto toma unos segundos. No cierres esta pantalla.</p>
        </div>
        <CTA onClick={onFinalizar}>Continuar</CTA>
      </div>
    );
  }

  // ── en revisión (identidad OK, matrícula manual) ──
  if (estado === "en_revision") {
    return (
      <Centro icono="🛡️" titulo="Estamos revisando tu verificación" sub="Verificamos tu identidad. Solo falta confirmar tu matrícula — te avisamos por email, normalmente en menos de 24 horas.">
        <div className="space-y-3 rounded-xl bg-white p-4" style={{ border: "1px solid #e5e7eb" }}>
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: C.verde }} />
            Identidad verificada
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: C.amarillo }} />
            Matrícula en revisión
          </div>
        </div>
        <CTA onClick={onFinalizar}>Continuar</CTA>
      </Centro>
    );
  }

  // ── aprobada ──
  if (estado === "aprobada") {
    return (
      <Centro icono="🛡️" titulo="Verificá tu identidad">
        <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: "#E8F5F0", color: C.verde }}>
          ✓ Tu identidad quedó verificada.
        </div>
        <CTA onClick={onFinalizar}>Finalizar</CTA>
      </Centro>
    );
  }

  // ── rechazada (recuperable) ──
  if (estado === "rechazada") {
    return (
      <Centro icono="🛡️" titulo="No pudimos verificarte esta vez" sub="Suele pasar por una foto borrosa, poca luz o un documento difícil de leer. Probá de nuevo.">
        <div className="rounded-xl p-4" style={{ backgroundColor: C.naranja + "14", border: `1px solid ${C.naranja}33` }}>
          <p className="text-sm font-medium text-gray-900">Para que salga bien:</p>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            <li>• Buena luz, sin reflejos en el DNI</li>
            <li>• Documento vigente y completo</li>
            <li>• Tu cara despejada, sin lentes oscuros</li>
          </ul>
        </div>
        {error && <p className="text-center text-sm" style={{ color: C.rojo }}>{error}</p>}
        <CTA onClick={iniciarVerificacion} disabled={cargando}>{cargando ? "Conectando con Didit…" : "Volver a intentar"}</CTA>
        <button onClick={onFinalizar} className="w-full text-center text-sm" style={{ color: C.gris }}>
          Seguir y verificar después
        </button>
      </Centro>
    );
  }

  // ── sin empezar: pantalla inicial con consentimiento colapsado ──
  return (
    <Centro
      icono="🛡️"
      titulo="Verificá tu identidad"
      sub="Confirmamos que sos el titular de la matrícula que registraste. Esto protege a tus pacientes de la suplantación de identidad y respalda cada receta que firmás con tu nombre."
    >
      <div className="space-y-3 rounded-xl p-4" style={{ border: `1px solid ${C.azul}33` }}>
        {[
          ["🪪", "Escaneás tu DNI"],
          ["🤳", "Te sacás una selfie para confirmar que sos vos"],
          ["✅", "Validamos tu identidad contra RENAPER"],
        ].map(([ic, t]) => (
          <div key={t} className="flex items-start gap-3">
            <span className="text-xl">{ic}</span>
            <p className="text-sm text-gray-700">{t}</p>
          </div>
        ))}
      </div>

      <p className="text-xs" style={{ color: C.gris }}>
        Tus datos los procesa Didit, nuestro proveedor especializado. Docto nunca recibe ni
        guarda tu selfie — solo el resultado de la verificación.
      </p>

      {/* Consentimiento colapsado a una pantalla: checkbox único + expandible. */}
      <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3" style={{ border: "1px solid #e5e7eb" }}>
        <input
          type="checkbox"
          checked={aceptado}
          onChange={(e) => {
            setAceptado(e.target.checked);
            if (e.target.checked) setIntentoSinAceptar(false);
          }}
          className="mt-0.5 h-6 w-6 shrink-0 rounded border-gray-300"
          style={{ accentColor: C.azul }}
        />
        <span className="text-left text-sm text-gray-700">
          Presto mi consentimiento para verificar mi identidad con Didit.
        </span>
      </label>
      <button
        type="button"
        onClick={() => setVerConsentimiento((v) => !v)}
        className="-mt-1 text-left text-sm"
        style={{ color: C.azul }}
      >
        {verConsentimiento ? "Ocultar consentimiento" : "Ver consentimiento completo"}
      </button>
      {verConsentimiento && (
        <div
          className="max-h-48 overflow-y-auto overscroll-contain whitespace-pre-line rounded-lg bg-white p-4 text-left text-xs leading-relaxed text-gray-600"
          style={{ border: "1px solid #e5e7eb" }}
        >
          {CONSENTIMIENTO_IDENTIDAD_TEXTO}
        </div>
      )}

      {/* CTA NO se deshabilita por falta de check (Safari iOS): atenúa + guard. */}
      {intentoSinAceptar && !aceptado && (
        <p className="-mb-2 text-center text-xs" style={{ color: C.gris }}>
          Marcá la casilla para continuar
        </p>
      )}
      {error && <p className="text-center text-sm" style={{ color: C.rojo }}>{error}</p>}
      <button
        onClick={() => {
          if (cargando) return;
          if (!aceptado) {
            setIntentoSinAceptar(true);
            return;
          }
          iniciarVerificacion();
        }}
        disabled={cargando}
        className="w-full rounded-xl py-3.5 text-base font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: C.azul, opacity: !aceptado && !cargando ? 0.6 : undefined }}
      >
        {cargando ? "Conectando con Didit…" : "Verificar mi identidad"}
      </button>
      <p className="text-center text-xs" style={{ color: C.gris }}>
        Vas a continuar en Didit y volvés acá automáticamente. Toma menos de 2 minutos.
      </p>
    </Centro>
  );
}

// ════════ helpers de UI ════════
function Centro({ icono, titulo, sub, children }: { icono: string; titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="text-4xl">{icono}</span>
        <h2 className="mt-2 text-xl font-semibold text-gray-900">{titulo}</h2>
        {sub && <p className="mt-1 text-sm text-gray-600">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function CTA({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl py-3.5 text-base font-semibold text-white disabled:opacity-50"
      style={{ backgroundColor: C.azul }}
    >
      {children}
    </button>
  );
}
