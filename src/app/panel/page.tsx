export const dynamic = "force-dynamic";

// /panel — EL PANEL DE LA INSTITUCIÓN (spec §6.7, mock aprobado
// docto-institucional/mocks/04-panel-admin.html). Escena 6 de la demo: la
// primera vez que la institución ve cumplimiento sin conflicto interpersonal.
//
// Server component completo: guards, datos y render. No hay JS de cliente
// porque no hace falta — todo lo interactivo del mock (cambiar de semana,
// cambiar de tab, exportar) es navegación, y la navegación se hace con links.
// Menos código, menos superficie y funciona sin esperar hidratación.
//
// El acceso es SOLO de `admin_institucion`. Un otorgador tiene su pantalla y
// no ve rankings de colegas; un profesional, mucho menos (R23: el panel de
// cumplimiento existe de un solo lado del mostrador).
//
// SOLO instancia institucional: en B2C es 404.

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esInstitucional } from "@/lib/instancia";
import { resolverOperador } from "@/lib/auth/rol-institucional";
import { getConfigInstitucion, soloBranding } from "@/lib/institucional/config";
import { semanaDeHoy } from "@/lib/metering/bolsa";
import { fechaAR } from "@/lib/insights/fechas";
import { resumenDeSemana, encuentrosDeSemana } from "@/lib/metering/panel";
import { corteDePeriodo, facturacionDePeriodo, periodoDeSemana } from "@/lib/metering/facturacion";
import ResumenSemanalVista from "./ResumenSemanal";
import TabConsultas from "./TabConsultas";
import "./panel.css";

type Tab = "resumen" | "consultas" | "nova";

const TABS: { id: Tab; label: string; nova?: boolean }[] = [
  { id: "resumen", label: "Resumen semanal" },
  { id: "consultas", label: "Consultas" },
  { id: "nova", label: "Nova", nova: true },
];

/** "2026-10-19" válido y no delirante (el parámetro viene de la URL). */
function semanaPedida(valor: string | undefined): string | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const ms = Date.parse(`${valor}T12:00:00Z`);
  if (Number.isNaN(ms)) return null;
  // Solo lunes: el resto de la semana no es una semana, es un día suelto.
  return new Date(ms).getUTCDay() === 1 ? valor : null;
}

function iniciales(nombre: string): string {
  const partes = nombre.replace(/^(Dra?\.|Lic\.)\s*/i, "").trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

export default async function PanelPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string; tab?: string }>;
}) {
  if (!esInstitucional()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const operador = await resolverOperador(user.id);
  if (!operador) redirect("/dashboard"); // no-operador: la resolución central lo reencamina
  if (operador.nivel !== "admin_institucion") redirect("/otorgador");

  const { semana, tab } = await searchParams;
  const semanaAr = semanaPedida(semana) ?? semanaDeHoy();
  const tabActiva: Tab = tab === "consultas" ? "consultas" : tab === "nova" ? "nova" : "resumen";

  const config = await getConfigInstitucion();
  const branding = soloBranding(config);
  // El período ACOMPAÑA a la semana que se está mirando. Estaba clavado en el
  // mes de hoy: el 1 de noviembre, la administración que entraba a facturar
  // octubre veía "Noviembre — 0 consultas facturables" y un botón que bajaba un
  // CSV vacío; el de octubre solo se alcanzaba tipeando `?periodo=` a mano.
  const periodo = periodoDeSemana(semanaAr);

  // El resumen se pide siempre (los KPIs son el encabezado del panel); el
  // detalle de consultas, solo cuando esa tab está abierta.
  // La facturación TIRA si la base falla (un cero silencioso en la plata es lo
  // que no puede pasar). Acá se atrapa para que un blip no se lleve puesto el
  // panel entero: la card lo dice con todas las letras y el resto sigue vivo.
  const [resumen, facturacion, encuentros] = await Promise.all([
    resumenDeSemana({ semanaAr }),
    facturacionDePeriodo(periodo)
      .then((f) => ({ consultas: f.consultas }))
      .catch((err) => {
        console.error("[panel] No se pudo calcular la facturación del período:", err);
        return null;
      }),
    tabActiva === "consultas" ? encuentrosDeSemana({ semanaAr }) : Promise.resolve([]),
  ]);

  // `fechaAR()` y no `new Date()` acá: el reloj vive en el helper del repo (y
  // la regla de pureza de React no quiere ver un Date.now() en el render).
  // El corte es hoy mientras el mes esté en curso, y el último día del mes
  // cuando ya terminó: "Octubre — 311 consultas facturables al 25/10" no puede
  // decir "al 13/11" porque alguien lo abrió en noviembre.
  const corte = corteDePeriodo(periodo, fechaAR());
  const hastaLabel = `al ${corte.slice(8, 10)}/${corte.slice(5, 7)}`;

  return (
    <div className="pnl">
      <header className="header">
        <div className="header-izq">
          {/* Logo de la institución: el bucket institucion-assets llega en la
              Etapa 5. Hasta entonces, el hueco reservado del mock. */}
          <div className="logo-ph">LOGO INSTITUCIÓN</div>
          <div>
            <div className="inst-nombre">{branding.nombre}</div>
            {branding.subnombre && <div className="inst-sub">{branding.subnombre}</div>}
          </div>
        </div>
        <div className="header-der">
          <div className="quien">
            <div className="op-nombre">{operador.nombre}</div>
            <div className="op-centro">Administración</div>
          </div>
          <div className="op-avatar">{iniciales(operador.nombre)}</div>
        </div>
      </header>

      <nav className="tabs">
        <div className="tabs-in">
          {TABS.map((t) => (
            <a
              key={t.id}
              className={`tab${t.id === tabActiva ? " on" : ""}`}
              href={`/panel?semana=${semanaAr}&tab=${t.id}`}
            >
              {t.nova && <span className="nova-star">✦</span>}
              {t.label}
            </a>
          ))}
        </div>
      </nav>

      <main className="trabajo">
        {tabActiva === "resumen" && (
          <ResumenSemanalVista
            resumen={resumen}
            duracionSlotMin={config.slot_duracion_min}
            facturacion={facturacion}
            periodo={periodo}
            hastaLabel={hastaLabel}
          />
        )}

        {tabActiva === "consultas" && <TabConsultas encuentros={encuentros} />}

        {tabActiva === "nova" && (
          <section className="card">
            <div className="vacio">
              <b>Nova todavía no está disponible en el panel.</b>
              Nova es el asistente que va a resolver por conversación lo que hoy se hace a mano: reprogramar la agenda
              de un profesional que no puede atender y avisarle a cada paciente. Llega después del piloto.
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
