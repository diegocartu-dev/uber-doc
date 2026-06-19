"use client";

// Wizard de onboarding del médico (post-aprobación). Pantalla completa, un paso
// por pantalla, barra de progreso, retoma donde quedó. Reusa los endpoints que
// ya existen — no reimplementa guardado. Gate de "disponible" = los 4 pasos.

import { useState } from "react";
import { useRouter } from "next/navigation";
import FirmaManuscrita from "@/app/medico/perfil/FirmaManuscrita";

const C = {
  azul: "#378ADD",
  verde: "#1D9E75",
  rojo: "#E24B4A",
  amarillo: "#BA7517",
  gris: "#888780",
};

type Pasos = { mp: boolean; foto: boolean; firma: boolean; domicilio: boolean };
type Key = keyof Pasos;
const ORDEN: Key[] = ["mp", "foto", "firma", "domicilio"];

type Props = {
  nombre: string;
  pasos: Pasos;
  fotoUrl: string | null;
  firmaUrl: string | null;
  domicilioInicial: string;
  provinciaInicial: string;
  pasoInicialParam: string | null;
  mpResultado: string | null; // "ok" | "error" | null (al volver del OAuth)
  mpError: string | null; // credentials_mismatch | mp_account_already_linked | ...
};

const apellido = (n: string) => {
  const partes = n.trim().split(/\s+/);
  return partes.length > 1 ? partes[partes.length - 1] : n;
};

export default function OnboardingWizard(props: Props) {
  const router = useRouter();
  const [hechos, setHechos] = useState<Pasos>(props.pasos);

  // Paso actual: 0 = bienvenida; 1-4 = MP/foto/firma/domicilio; 5 = cierre.
  const primerIncompleto = () => {
    const idx = ORDEN.findIndex((k) => !hechos[k]);
    return idx === -1 ? 5 : idx + 1;
  };
  const inicial = () => {
    if (props.mpResultado) return 1; // volvió del OAuth → mostrar resultado MP
    if (props.pasoInicialParam) {
      const n = parseInt(props.pasoInicialParam, 10);
      if (n >= 1 && n <= 4) return n;
    }
    return 0; // bienvenida
  };
  const [paso, setPaso] = useState<number>(inicial);

  const completados = ORDEN.filter((k) => hechos[k]).length;
  const porcentaje = Math.round((completados / 4) * 100);

  const marcar = (k: Key) => setHechos((h) => ({ ...h, [k]: true }));
  const avanzar = (desde: number) => {
    // Próximo paso incompleto a partir de `desde`.
    for (let i = desde; i < 4; i++) {
      if (!hechos[ORDEN[i]]) return setPaso(i + 1);
    }
    // No llegar al cierre con un paso anterior salteado (ej. MP con "lo hago al
    // final"): si quedó alguno pendiente, volver a ese paso. Cierre solo con los 4.
    const pendiente = ORDEN.findIndex((k) => !hechos[k]);
    setPaso(pendiente === -1 ? 5 : pendiente + 1);
  };

  // ── chrome ──────────────────────────────────────────────
  const Progreso = () => (
    <div className="mb-8">
      <div className="flex items-center gap-2">
        {ORDEN.map((k, i) => {
          const done = hechos[k];
          const actual = paso === i + 1;
          return (
            <div key={k} className="flex flex-1 items-center">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: done ? C.verde : actual ? C.azul : "#E5E7EB",
                  color: done || actual ? "#fff" : C.gris,
                }}
              >
                {done ? "✓" : i + 1}
              </span>
              {i < 3 && (
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
        Paso {Math.min(paso, 4)} de 4 · {porcentaje}%
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
            Te quedan 4 pasos para empezar a atender. Son 3 minutos.
          </p>
          <div className="mt-6 space-y-3 rounded-xl p-4" style={{ border: `1px solid ${C.azul}33` }}>
            {[
              ["💳", "Conectá Mercado Pago", "para cobrar tus consultas"],
              ["📸", "Foto de perfil", "para que el paciente te reconozca"],
              ["✍️", "Firma", "para tus recetas"],
              ["🏥", "Domicilio del consultorio", "requisito para la receta electrónica"],
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
  if (paso === 5) {
    return (
      <Marco>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-full text-3xl text-white"
            style={{ backgroundColor: C.verde }}
          >
            ✓
          </span>
          <h1 className="mt-5 text-2xl font-semibold text-gray-900">
            ¡Listo, Dr. {apellido(props.nombre)}!
          </h1>
          <p className="mt-2 text-gray-600">Ya podés empezar a atender en Docto.</p>
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
        {paso === 1 && <PasoMP {...props} hecho={hechos.mp} onSkip={() => avanzar(1)} onDone={() => { marcar("mp"); avanzar(1); }} />}
        {paso === 2 && <PasoFoto fotoUrl={props.fotoUrl} onDone={() => { marcar("foto"); avanzar(2); }} />}
        {paso === 3 && <PasoFirma firmaUrl={props.firmaUrl} onDone={() => { marcar("firma"); avanzar(3); }} />}
        {paso === 4 && <PasoDomicilio inicial={props.domicilioInicial} provinciaInicial={props.provinciaInicial} onDone={() => { marcar("domicilio"); avanzar(4); }} />}
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

// ════════ PASO 2 — FOTO ════════
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

// ════════ PASO 3 — FIRMA ════════
function PasoFirma({ firmaUrl, onDone }: { firmaUrl: string | null; onDone: () => void }) {
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
    <Centro icono="✍️" titulo="Tu firma para las recetas" sub="Dibujala con el dedo o subí una foto. Después tocá Continuar para activarla.">
      <FirmaManuscrita firmaUrl={firmaUrl} />
      {error && <p className="text-center text-sm" style={{ color: C.rojo }}>{error}</p>}
      <CTA onClick={continuar} disabled={provisionando}>{provisionando ? "Activando…" : "Continuar"}</CTA>
    </Centro>
  );
}

// ════════ PASO 4 — DOMICILIO ════════
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
      <CTA onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Finalizar"}</CTA>
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
      style={{ backgroundColor: "#378ADD" }}
    >
      {children}
    </button>
  );
}
