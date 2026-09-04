// Motor de render del tablero único (/admin/tablero).
//
// ES EL MOCK QUE VALIDÓ DIEGO, tal cual, montado en un contenedor: genera el
// HTML por cadenas y escucha los eventos por delegación. Se eligió no
// reescribirlo en React mientras el diseño se valida, para que la pantalla de
// producción sea EXACTAMENTE la que se validó y cada corrección del mock
// llegue acá sin traducción. Cuando el diseño quede firme, se porta.
//
// Lo que NO vive acá: los números. Toda agregación viene de
// `@/lib/tablero/vista` (una sola función agrega) y las fechas de
// `@/lib/tablero/cobertura`; este archivo solo decide cómo se ve.
//
// Todo dato que entra al HTML pasa por `esc()`.
/* eslint-disable */
import { vista, pasa as pasaLib, indices, variacion, varTasa, DES, ORDEN_DES, MOTIVO_LAB, motivoDe, ESTADO_LAB, FILTRO_ALCANCE, SIN_LINEA, SIN_MED, NADIE_ACEPTO, SIN_PROV, suma } from "@/lib/tablero/vista";
import { meses12, ultimoDia, diasEntre, diasCubiertosMes, cubierto as cubiertoMes, mesAnterior, lunesDe, enPer, perPrev, perInicio, diasDelPeriodo } from "@/lib/tablero/cobertura";
import { sumarDiasAR as sumaDias } from "@/lib/insights/fechas";

/**
 * Monta el tablero dentro de `root` (que ya contiene los contenedores #cab,
 * #fija, #franja, #app, #tip, #overlay y #panel) y devuelve la función que lo
 * desmonta.
 * @param {HTMLElement} root
 * @param {import("@/lib/tablero/tipos").DatosTablero} D
 */
export function montarTablero(root, D) {
  /* ───────────────────────── utilidades ───────────────────────── */
  const LAB = { "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr", "05": "May", "06": "Jun", "07": "Jul", "08": "Ago", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic" };
  const LARGO = { "01": "enero", "02": "febrero", "03": "marzo", "04": "abril", "05": "mayo", "06": "junio", "07": "julio", "08": "agosto", "09": "septiembre", "10": "octubre", "11": "noviembre", "12": "diciembre" };
  // Desde cuándo se mide cada cosa (regla 5 del manual: sin cobertura no hay divisor ni cero).
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, d = 0) => Number(n ?? 0).toLocaleString("es-AR", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  const ars = (n) => "$ " + fmt(Math.round(n));
  const pct = (a, b, d = 0) => (b > 0 ? fmt((a / b) * 100, d) + "%" : "—");
  const mesLab = (m) => LAB[m.slice(5, 7)];
  const mesLargo = (m) => `${LARGO[m.slice(5, 7)]} ${m.slice(0, 4)}`;
  const fechaLab = (f) => `${Number(f.slice(8, 10))} ${LAB[f.slice(5, 7)].toLowerCase()}`;
  /** Días de ese mes cubiertos por la medición: desde `desde` y hasta hoy. */
  const mediana = (xs) => { const a = xs.filter((x) => x != null).sort((p, q) => p - q); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const minutos = (m) => (m == null ? "—" : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`);
  const horaLab = (h) => String(h).padStart(2, "0") + ":00";
  const cnt = (arr, k) => { const o = new Map(); for (const x of arr) { const v = typeof k === "function" ? k(x) : x[k]; o.set(v, (o.get(v) || 0) + 1); } return [...o.entries()].sort((a, b) => b[1] - a[1]); };

  const MED = new Map(D.medicos.map((m) => [m.id, m]));
  const PAC = new Map(D.pacientes.map((p) => [p.key, p]));
  const pacProv = (k) => (k && PAC.get(k) ? PAC.get(k).provincia : null);
  const pacC = (k) => { const p = k && PAC.get(k); return p ? (p.nombre ? nomC({ nombre: p.nombre }) : p.iniciales) : "—"; };
  const pacLab = (k) => { const p = k && PAC.get(k); return p ? `${pacC(k)}${p.provincia ? " · " + p.provincia : ""}` : "—"; };

  const COL = { ok: "var(--ok)", brand: "var(--brand)", aten: "var(--aten)", adv: "var(--adv)", neutro: "var(--neutro)", ded: "var(--deducido)" };

  /* ───────────────────────── estado ───────────────────────── */

    const HOY = D.hoy;
    const MES_HOY = HOY.slice(0, 7);
    const MESES12 = meses12(HOY);
    const COB = D.cobertura;
    const diasCubiertos = (m, desde) => diasCubiertosMes(m, desde, HOY);
    const cubierto = (m, desde) => cubiertoMes(m, desde, HOY);
    const IX = indices(D);
    const pasa = (a) => pasaLib(a, S.f, IX);
    const V_ = (per) => vista(D, { per, f: S.f, intentos: S.intentos }, IX);
    const varHtml = (v) => (v ? `<span class="var ${v.cls}" title="${esc(v.title)}">${esc(v.texto)}</span>` : "");
    const LC = {};
    const byId = (id) => root.querySelector("#" + id);
  const S = {
    per: { modo: "meses", meses: new Set(MESES12.slice(-4).filter((m) => cubierto(m, COB.ventana))), desde: sumaDias(HOY, -6), hasta: HOY },
    gran: "semana", metrica: "consultas",
    f: { tipo: null, canal: null, esp: null, medico: null, des: null, prov: null, motivo: null },
    intentos: false, abiertas: new Set(), ficha: null, pila: [], fichaTodo: false, tablas: {}, verCampania: false, verPrendidos: false,
  };
  const FILTRO_LAB = { tipo: { ci: "Consulta inmediata", turno: "Turno" }, canal: { clinica: "Por la clínica", consultorio: "Por el link propio" } };
  // A qué vistas NO llega cada filtro (se declara, no se disimula). Las búsquedas no tienen desenlace ni motivo; los pacientes nuevos no tienen profesional.
  /** ¿La fecha cae en el período? Una sola definición para todas las unidades. */
  /** Días del período cubiertos por una medición que existe desde `cob` (regla 5). */
  /** El período previo equivalente: mismo largo, inmediatamente antes. */
  function perLabel(per) {
    if (per.modo === "dias") {
      const L = diasEntre(per.desde, per.hasta);
      if (per.desde === per.hasta) return per.desde === HOY ? `hoy, ${fechaLab(HOY)}` : per.desde === sumaDias(HOY, -1) ? `ayer, ${fechaLab(per.desde)}` : fechaLab(per.desde);
      return `${fechaLab(per.desde)} al ${fechaLab(per.hasta)} · ${L} días${per.hasta === HOY ? " · hasta hoy" : ""}`;
    }
    const ms = [...per.meses].sort();
    return (ms.length === 1 ? mesLargo(ms[0]) : `${mesLab(ms[0])}–${mesLab(ms.at(-1))} ${ms.at(-1).slice(0, 4)}`) + (per.meses.has(MES_HOY) ? ` · mes en curso al ${fechaLab(HOY)}` : "");
  }
  const perCorto = (per) => (per.modo === "dias" ? (per.desde === per.hasta ? fechaLab(per.desde) : `${fechaLab(per.desde)}–${fechaLab(per.hasta)}`) : [...per.meses].sort().map(mesLab).join(", "));
  function labelFiltro(k, v) { if (k === "medico") return MED.get(v)?.nombre ?? v; if (k === "des") return DES[v]?.[0] ?? v; if (FILTRO_LAB[k]) return FILTRO_LAB[k][v] ?? v; return v; }
  const hayFiltros = () => Object.values(S.f).some(Boolean);


  /* ───────────────────────── capa de datos: UNA función agrega ───────────────────────── */
  const hm = (x) => `${String(x.hora).padStart(2, "0")}:${String(x.min ?? 0).padStart(2, "0")}`;
  const AYER = sumaDias(HOY, -1);
  /** Todo lo que el tablero muestra sale de acá, para el período `per`. Ninguna vista vuelve a filtrar `D` por su cuenta. */
  const aprobados = () => D.medicos.filter((m) => m.estado === "aprobado" && !m.baja);
  /**
   * Variación justa (reglas 5 y 6 + criterio de Fede): tasas por día cubierto contra el período previo
   * equivalente; con menos de 10 casos en cualquiera de los dos períodos no hay porcentaje, hay
   * diferencia absoluta en gris; el color solo aparece si la diferencia supera 2·√(a+b).
   */
  /** Variación de una tasa (liquidez, conversión): puntos solo con ≥30 en el denominador y ≥5 éxitos en los dos períodos. */
  const arsK = (n) => (Math.abs(n) >= 1000 ? "$" + fmt(Math.round(n / 1000)) + "k" : "$" + fmt(Math.round(n)));
  /** Concordancia: "1 consulta", "2 consultas", "0 consultas". */
  const nn = (x, sing, plur) => `${fmt(x)} ${Number(x) === 1 ? sing : plur}`;
  /** Estado de entrega de un aviso, en castellano (Twilio devuelve inglés). */
  const ENTREGA_LAB = { delivered: "Entregado", read: "Leído", sent: "Enviado", queued: "Enviado", accepted: "Enviado", failed: "No entregado", undelivered: "No entregado" };
  const entregaLab = (e, fecha) => (e ? ENTREGA_LAB[e] ?? e : fecha >= COB.entrega ? "sin confirmación" : "no se registraba");
  /** El resultado de una búsqueda, con el vocabulario de la pantalla (profesional, sin nadie). */
  const RES_LAB = { [SIN_LINEA]: "había profesionales, ninguno en línea", [SIN_MED]: "sin profesionales para su provincia" };
  const resLab = (r) => RES_LAB[r] ?? r;
  const nomC = (m) => { const t = (m?.nombre ?? "—").split(" ").filter(Boolean); return t.length > 1 ? `${t[0]} ${t[t.length - 1]}` : t[0]; };
  const provC = (p) => ({ "Buenos Aires": "Bs. As.", "Santiago del Estero": "Sgo. del Estero", "Tierra del Fuego": "T. del Fuego" }[p] ?? p ?? "sin provincia");
  const linkMed = (id) => `<button class="w" data-act="ficha" data-tipo="medico" data-id="${esc(id)}" title="${esc(MED.get(id)?.nombre ?? "")}">${esc(nomC(MED.get(id)))}</button>`;
  const linkPac = (key) => (key ? `<button class="w" data-act="ficha" data-tipo="paciente" data-id="${esc(key)}">${esc(pacC(key))}</button>` : "—");
  const linkAt = (a, txt) => `<button class="w l" data-act="ficha" data-tipo="atencion" data-id="${esc(a.id)}">${txt}</button>`;
  const linkProv = (p, n) => `<button class="w" data-act="filtro" data-k="prov" data-v="${esc(p)}">${esc(provC(p))} <b>${fmt(n)}</b></button>`;
  const resCorto = (r) => ({ [SIN_LINEA]: "ninguno en línea", [SIN_MED]: "sin profesionales", [NADIE_ACEPTO]: "nadie aceptó", [SIN_PROV]: "sin provincia" }[r] ?? r);
  const tasaGrande = (k, n, pct1) => (n >= 30 && k >= 5 ? `${fmt(pct1, 1)}<small>%</small>` : n ? `<span class="chico">${fmt(k)} de ${fmt(n)}</span>` : "—");

  /* ───────────────────────── acción (ahora) ───────────────────────── */
  function accionesAhora() {
    const ap = aprobados();
    const listos = ap.filter((m) => m.faltantes.length === 0);
    const listosSinOferta = listos.filter((m) => !m.disponible && m.slotsFuturos === 0 && m.agendasActivas === 0);
    const mpVencido = ap.filter((m) => m.mp === "expirado");
    const pendientes = D.medicos.filter((m) => m.estado === "pendiente_revision");
    const ahora = Date.now();
    const dispAusentes = ap.filter((m) => m.disponible && m.disponibleDesdeAt && ahora - Date.parse(m.disponibleDesdeAt) > 4 * 3600_000);
    const noSostuvo24 = D.atenciones.filter((a) => a.fecha >= AYER && a.desenlace === "medico_se_fue");
    const sinNadie24 = D.busquedas.filter((b) => b.fecha >= AYER && b.provincia && !b.matchHabia);
    const items = [
      { k: "esperando", sev: "rojo", n: D.esperando.length, lab: "Pedidos de consulta inmediata sin respuesta ahora", sub: "el plazo es de 10 minutos" },
      { k: "nosostuvo", sev: "rojo", n: noSostuvo24.length, lab: "Consultas pagas que el profesional no sostuvo, ayer y hoy", sub: "se devuelve el pago" },
      { k: "sinnadie", sev: "ambar", n: sinNadie24.length, lab: "Buscaron ayer u hoy sin nadie", sub: "" },
      { k: "pendientes", sev: "azul", n: pendientes.length, lab: "Profesionales por aprobar", sub: "" },
      { k: "prendidos", sev: "ambar", n: dispAusentes.length, lab: "En línea hace más de 4 horas", sub: "" },
      { k: "mp", sev: "rojo", n: mpVencido.length, lab: "Cuentas de Mercado Pago vencidas", sub: "figuran activos, no cobran" },
      { k: "refunds", sev: "rojo", n: D.refunds.length, lab: "Devoluciones sin resolver", sub: "" },
      { k: "alertas", sev: "ambar", n: D.alertas.length, lab: "Alertas pendientes", sub: "" },
    ];
    const total = items.reduce((s, i) => s + i.n, 0);
    const corto = { esperando: "sin respuesta", nosostuvo: "no sostuvo", sinnadie: "sin nadie", pendientes: "por aprobar", prendidos: "en línea +4 h", mp: "Mercado Pago vencido", refunds: "devolución", alertas: "alerta" };
    const resumen = items.filter((i) => i.n).map((i) => `${i.n} ${corto[i.k]}`).join(" · ") || "nada pendiente hoy";
    return { total, items, listos, listosSinOferta, mpVencido, pendientes, dispAusentes, noSostuvo24, sinNadie24, resumen };
  }

  /* ───────────────────────── piezas ───────────────────────── */
  function preg(id, texto, ans, det, { nomide = false, aclar = "" } = {}) {
    const open = S.abiertas.has(id);
    return `<div class="preg ${open ? "open" : ""}"><button data-act="toggle" data-v="${esc(id)}" aria-expanded="${open}"><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg><span class="qt">${texto}${aclar ? `<em>${esc(aclar)}</em>` : ""}</span><span class="ans ${nomide ? "nomide" : ""}">${ans}</span></button>${open ? `<div class="det">${det()}</div>` : ""}</div>`;
  }
  const sup = `<span class="sup" title="Deducido: fila anterior al registro del hito (20/08). Se infiere del pago o de la sala.">°</span>`;
  const NIVEL = (n) => (n === "consulta" ? "Consulta" : "Intento de consulta");
  const colFecha = { k: "fecha", t: "Fecha", texto: (r) => fechaLab(r.fecha), sortVal: (r) => r.fecha };
  const colHora = { k: "hora", t: "Hora", tipo: "num", texto: (r) => hm(r), sortVal: (r) => r.hora * 60 + (r.min || 0) };
  const colPac = { k: "paciente", t: "Paciente", texto: (r) => pacLab(r.paciente) };
  const colDes = { k: "desenlace", t: "Desenlace", tipo: "sel", texto: (r) => DES[r.desenlace]?.[0] ?? r.desenlace, render: (r) => `<span class="est ${DES[r.desenlace]?.[1] ?? "neutro"}">${esc(DES[r.desenlace]?.[0] ?? r.desenlace)}</span>${r.origen === "inferido" && r.tipo === "ci" ? sup : ""}` };
  const filaAt = (r) => ({ tipo: "atencion", id: r.id, mas: { act: "filtro", k: "medico", v: r.medicoId } });
  const onlineEn = (fecha, h) => new Set(D.ciHoras.filter((c) => c.fecha === fecha && c.hora === h && c.horas > 0).map((c) => c.medicoId)).size;

  /* ───────────────────────── cabecera + franja ───────────────────────── */
  function renderCab() {
    const V = V_(S.per), P = V_(perPrev(S.per));
    const fechaHoy = new Date(HOY + "T12:00:00Z").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    const enMeses = S.per.modo === "meses";
    const mesesVentana = MESES12.filter((m) => cubierto(m, COB.ventana));
    const chips = mesesVentana.map((m) => `<button class="chip ${enMeses && S.per.meses.has(m) ? "on" : ""} ${!enMeses ? "dim" : ""}" data-act="mes" data-v="${esc(m)}">${mesLab(m)}${m === mesesVentana[0] ? ` <small>${m.slice(2, 4)}</small>` : ""}</button>`).join("");
    // Estado general: solo con base suficiente (≥ 7 días y ≥ 10 consultas), contra el promedio diario de los últimos 30 días.
    const todo = V_({ modo: "dias", meses: new Set(), desde: sumaDias(HOY, -29), hasta: HOY });
    const tasaSel = V.dias.consultas ? V.n / V.dias.consultas : 0, tasaTodo = todo.dias.consultas ? todo.n / todo.dias.consultas : 0;
    const conBase = V.dias.consultas >= 7 && V.n >= 10;
    const estado = !V.dias.consultas ? ["neutro", "Sin medición en el período"] : !conBase ? ["neutro", `base chica · ${fmt(V.n)} consultas en ${fmt(V.dias.consultas)} ${V.dias.consultas === 1 ? "día" : "días"}`] : tasaSel > tasaTodo * 1.1 ? ["ok", "Por encima del promedio de 30 días"] : tasaSel < tasaTodo * 0.9 ? ["aten", "Por debajo del promedio de 30 días"] : ["brand", "En el promedio de 30 días"];
    const v1 = variacion(V.n, V.dias.consultas, P.n, P.dias.consultas);
    const v2 = perInicio(perPrev(S.per)) < COB.lanzamiento ? { texto: "—", cls: "flat", title: "Sin comparación: el período previo es anterior al lanzamiento (10/06)" } : variacion(V.pacsN, V.dias.pacientes, P.pacsN, P.dias.pacientes);
    const v3 = varTasa(V.busConAlguienN, V.busConProvN, P.busConAlguienN, P.busConProvN);
    const v4 = varTasa(V.busPago, V.busConAlguienN, P.busPago, P.busConAlguienN);
    const v5 = variacion(V.cobrado, V.dias.consultas, P.cobrado, P.dias.consultas, { plata: true, nSel: V.cobradasN, nPrev: P.cobradasN });
    const acc = accionesAhora();
    const filtros = Object.entries(S.f).filter(([, v]) => v).map(([k, v]) => `<span class="fchip" title="${esc(FILTRO_ALCANCE[k] ?? "alcanza a todo el tablero")}">${esc(labelFiltro(k, v))}<button data-act="filtro" data-k="${k}" data-v="" title="Quitar">×</button></span>`).join("");
    const alcances = [...new Set(Object.entries(S.f).filter(([k, v]) => v && FILTRO_ALCANCE[k]).map(([k]) => FILTRO_ALCANCE[k]))];
    const presetDias = [["1", "Hoy"], ["ayer", "Ayer"], ["7", "7 días"], ["14", "14 días"], ["30", "30 días"]];
    const presetOn = (v) => !enMeses && ((v === "1" && S.per.desde === HOY && S.per.hasta === HOY) || (v === "ayer" && S.per.desde === AYER && S.per.hasta === AYER) || (Number(v) > 1 && S.per.hasta === HOY && S.per.desde === sumaDias(HOY, -(Number(v) - 1))));
    byId("cab").innerHTML = `<div class="wrap">
      <div class="cab-top">
        <div>
          <div class="marca"><svg class="logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg><h1>docto</h1><span class="tag">Tablero</span></div>
          <p class="formula"><b>Consultas</b> = aceptadas + turnos pagos · <b>Búsquedas con alguien</b> = encontraron un profesional en línea · cuentas de prueba excluidas <span class="i" title="Consultas: pedidos de consulta inmediata que un profesional aceptó, más turnos pagados; la fecha es la del pedido en la inmediata y la del turno en el turno. Los pedidos sin nadie del otro lado son intentos y se cuentan aparte. Búsquedas con alguien: de las búsquedas con provincia, cuántas encontraron en ese instante un profesional habilitado y en línea.">i</span></p>
        </div>
        <div class="cab-der"><span>${fechaHoy}</span><span class="mini" title="Las cuentas de prueba no entran en ningún número">Solo cuentas reales</span></div>
      </div>
    </div>`;
    byId("fija").innerHTML = `<div class="wrap">
      <div class="periodo">
        <div class="atajos" style="border-left:0;padding-left:0">${presetDias.map(([v, l]) => `<button data-act="dias" data-v="${esc(v)}" class="chip ${presetOn(v) ? "on" : ""}">${l}</button>`).join("")}</div>
        <span class="rango ${!enMeses ? "on" : ""}"><label>desde <input type="date" data-rango="desde" value="${S.per.desde}" max="${HOY}"></label><label>hasta <input type="date" data-rango="hasta" value="${S.per.hasta}" max="${HOY}"></label></span>
        <div class="chips" style="border-left:1px solid var(--line);padding-left:10px">${chips}</div>
        <div class="atajos"><button data-act="atajo" data-v="1">Este mes</button><button data-act="atajo" data-v="3">3 meses</button><button data-act="atajo" data-v="6">Todo</button></div>
      </div>
      <div class="filtros"><span><b style="color:var(--ink)">${perLabel(S.per)}</b></span>${conBase ? `<span class="pill ${estado[0]}" style="padding:1px 8px"><span class="dot"></span>${estado[1]}</span>` : ""}${filtros ? `<span class="mini">filtrado por</span>${filtros}<button class="limpiar" data-act="limpiar">limpiar</button>${alcances.map((a) => `<span class="alcance">${esc(a)}</span>`).join("")}` : `<span class="mini">sin filtros · tocá cualquier dato para filtrar todo</span>`}${S.intentos ? `<span class="fchip">incluye intentos<button data-act="intentos" title="Quitar">×</button></span>` : ""}</div>
    </div>`;
    byId("fija").classList.toggle("filtrada", hayFiltros());
    const noAplicaPac = ["medico", "esp", "tipo", "canal", "des", "motivo"].some((k) => S.f[k]);
    const top = (arr, k, n = 3) => cnt(arr, k).slice(0, n);
    const provPac = (a) => pacProv(a.paciente) ?? "sin provincia";
    // QUIÉN: cada cuadro nombra profesional, paciente y provincia. Con pocos casos, uno por uno; con muchos, los que más pesan.
    const qCons = V.consultas.length === 0 ? `<span class="cero">ninguna</span>` : V.consultas.length <= 3
      ? [...V.consultas].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((a) => linkAt(a, `${esc(nomC(MED.get(a.medicoId)))} → ${esc(pacC(a.paciente))} · ${esc(provC(pacProv(a.paciente)))}${a.desenlace !== "atendida" ? ` · ${esc(DES[a.desenlace][0].toLowerCase())}` : ""}`)).join("")
      : `${top(V.consultas, "medicoId").map(([id, n]) => `${linkMed(id)} <b>${n}</b>`).join(" · ")}<span class="mini">${top(V.consultas, provPac).map(([p, n]) => linkProv(p, n)).join(" · ")} · ${fmt(V.atendidas)} atendidas${V.sinRespuesta ? ` · ${fmt(V.sinRespuesta)} sin respuesta${V.sinRespuestaDed ? sup : ""}` : ""}</span>`;
    const qPac = V.pacs.length === 0 ? `<span class="cero">ninguno</span>` : V.pacs.length <= 3
      ? V.pacs.map((p) => `<span class="l">${linkPac(p.key)} · ${esc(provC(p.provincia))}${p.consultas ? " · consultó" : p.pidio ? " · pidió" : p.vioClinica ? " · abrió la clínica" : ""}</span>`).join("")
      : `${top(V.pacs, (p) => p.provincia ?? "sin provincia", 4).map(([p, n]) => linkProv(p, n)).join(" · ")}<span class="mini">${fmt(V.pacsConsultaron)} ya consultaron</span>`;
    const perdidas = V.bus.filter((b) => b.provincia && !b.matchHabia);
    const qBus = !V.busN ? `<span class="cero">sin búsquedas</span>` : perdidas.length === 0 ? `<span class="cero">nadie se quedó sin nadie</span>${V.busN <= 3 ? V.bus.map((b) => `<span class="l">${linkPac(b.paciente)} · ${esc(provC(b.provincia))} ${hm(b)}</span>`).join("") : ""}` : perdidas.length <= 3
      ? perdidas.map((b) => `<span class="l">${linkPac(b.paciente)} · ${esc(provC(b.provincia))} ${hm(b)} · <b style="color:#9C2C2B">${esc(resCorto(b.resultado))}</b></span>`).join("")
      : `<span style="color:#9C2C2B;font-weight:600">${fmt(perdidas.length)} sin nadie:</span> ${top(perdidas, "provincia", 3).map(([p, n]) => linkProv(p, n)).join(" · ")}<span class="mini">${fmt(V.busSinLinea)} con profesionales, ninguno en línea · ${fmt(V.busSinMed)} sin profesionales${V.busSinProvN ? ` · ${fmt(V.busSinProvN)} sin provincia` : ""}</span>`;
    const pagaron = V.bus.filter((b) => b.pago || b.seAtendio);
    const qConv = !V.busConAlguienN ? `<span class="cero">nadie encontró a alguien</span>` : pagaron.length === 0 ? `<span class="cero">nadie pagó</span>` : pagaron.length <= 3
      ? pagaron.map((b) => `<span class="l">${linkPac(b.paciente)} · ${esc(provC(b.provincia))}${b.medicoElegidoId ? ` → ${linkMed(b.medicoElegidoId)}` : ""}</span>`).join("")
      : `${top(pagaron, (b) => b.provincia ?? "sin provincia").map(([p, n]) => linkProv(p, n)).join(" · ")}<span class="mini">eligieron a ${top(pagaron.filter((b) => b.medicoElegidoId), "medicoElegidoId").map(([id, n]) => `${linkMed(id)} ${n}`).join(", ")}</span>`;
    const cobr = V.at.filter((a) => a.cobrado > 0);
    const porMedCobr = [...cobr.reduce((m, a) => m.set(a.medicoId, (m.get(a.medicoId) || 0) + a.cobrado), new Map()).entries()].sort((x, y) => y[1] - x[1]);
    const qCob = cobr.length === 0 ? `<span class="cero">nada cobrado</span>` : cobr.length <= 3
      ? cobr.map((a) => linkAt(a, `${esc(nomC(MED.get(a.medicoId)))} · ${a.tipo === "ci" ? "CI" : "turno"} ${fechaLab(a.fecha)} · ${ars(a.cobrado)}`)).join("")
      : `${porMedCobr.slice(0, 3).map(([id, m]) => `${linkMed(id)} <b>${arsK(m)}</b>`).join(" · ")}`;
    const feeLinea = `<span class="mini">fee Docto <b>${ars(V.fee)}</b>${V.reintegrado ? ` · devuelto ${ars(V.reintegrado)}` : ""}</span>`;
    const qAcc = [
      ...D.esperando.map((e) => `${linkMed(e.medicoId)} <span class="mini" style="display:inline">sin respuesta</span>`),
      ...acc.noSostuvo24.map((a) => `${linkMed(a.medicoId)} <span class="mini" style="display:inline">no sostuvo</span>`),
      ...acc.sinNadie24.map((b) => `${linkPac(b.paciente)} · ${esc(provC(b.provincia))} <span class="mini" style="display:inline">sin nadie</span>`),
      ...acc.pendientes.map((m) => `${linkMed(m.id)} <span class="mini" style="display:inline">por aprobar</span>`),
      ...acc.dispAusentes.map((m) => `${linkMed(m.id)} <span class="mini" style="display:inline">en línea +4 h</span>`),
      ...acc.mpVencido.map((m) => `${linkMed(m.id)} <span class="mini" style="display:inline">Mercado Pago vencido</span>`),
      ...D.refunds.map((r) => `${esc(r.medico)} <span class="mini" style="display:inline">devolución</span>`),
      ...D.alertas.map((a) => `${esc(a.titulo)} <span class="mini" style="display:inline">alerta</span>`),
    ];
    const qAccHtml = qAcc.length ? qAcc.slice(0, 4).map((x) => `<span class="l">${x}</span>`).join("") + (qAcc.length > 4 ? `<button class="w" data-act="ir" data-v="hoy">y ${qAcc.length - 4} más ↓</button>` : "") : `<span class="cero">nada pendiente hoy</span>`;
    const tile = (lab, val, who, v, extra = "") => `<div class="kpi ${extra}"><div class="kpi-top"><span class="lab">${lab}</span>${v}</div><div class="val num">${val}</div><div class="who">${who}</div></div>`;
    byId("franja").innerHTML = `<div class="wrap">
      <div class="franja">
        ${tile("Consultas", fmt(V.n), qCons, varHtml(v1))}
        ${tile("Pacientes nuevos", fmt(V.pacsN), noAplicaPac ? `<span class="cero">el filtro no alcanza a los pacientes nuevos</span>` : qPac, noAplicaPac ? "" : varHtml(v2))}
        ${tile("Búsquedas con alguien", tasaGrande(V.busConAlguienN, V.busConProvN, V.liquidez), qBus, varHtml(v3))}
        ${tile("Conversión con oferta", tasaGrande(V.busPago, V.busConAlguienN, V.convServida), qConv, varHtml(v4))}
        ${tile("Cobrado", ars(V.cobrado), qCob + feeLinea, varHtml(v5))}
        ${tile("Esperan acción", fmt(acc.total), qAccHtml + (acc.listosSinOferta.length ? `<span class="mini">${fmt(acc.listosSinOferta.length)} en campaña de activación</span>` : ""), "", "acc")}
      </div>
    </div>`;
  }

  /* ───────────────────────── HOY Y AHORA ───────────────────────── */
  function seccionHoy() {
    const A = accionesAhora();
    const corto = { esperando: "sin respuesta", nosostuvo: "no sostuvo", sinnadie: "sin nadie", pendientes: "por aprobar", prendidos: "en línea +4 h", mp: "Mercado Pago vencido", refunds: "devolución", alertas: "alerta" };
    const ap = aprobados();
    const enLinea = ap.filter((m) => m.disponible);
    const agendaHoy = D.slots.filter((s) => s.fecha === HOY);
    const horaAhora = new Date(Date.now() - 3 * 3600_000).getUTCHours();
    const tira = (fecha) => `<div class="tira"><span class="lab">${fecha === HOY ? "hoy" : "ayer"}</span>${Array.from({ length: 24 }, (_, h) => { const on = [...new Set(D.ciHoras.filter((c) => c.fecha === fecha && c.hora === h && c.horas > 0).map((c) => c.medicoId))]; const o = on.length; const bs = D.busquedas.filter((x) => x.fecha === fecha && x.hora === h); const b = bs.length; const fut = fecha === HOY && h > horaAhora; const cls = fut ? "fut" : b > 0 && o === 0 ? "hueco" : o >= 3 ? "o3" : o === 2 ? "o2" : o === 1 ? "o1" : ""; return `<div class="c ${cls} ${fecha === HOY && h === horaAhora ? "ahora" : ""}" data-tt="${esc(`${horaLab(h)} · en línea: ${on.map((id) => nomC(MED.get(id))).join(", ") || "nadie"} · búsquedas: ${bs.map((x) => `${pacC(x.paciente)} (${provC(x.provincia)}, ${resCorto(x.resultado)})`).join(", ") || "ninguna"}`)}">${b || ""}</div>`; }).join("")}</div>`;
    const ayer = { cons: D.atenciones.filter((a) => a.fecha === AYER && a.nivel === "consulta"), bus: D.busquedas.filter((b) => b.fecha === AYER), noSost: D.atenciones.filter((a) => a.fecha === AYER && a.desenlace === "medico_se_fue"), dev: suma(D.atenciones.filter((a) => a.fecha === AYER), "reintegrado"), cobrado: suma(D.atenciones.filter((a) => a.fecha === AYER), "cobrado") };
    const med = (m, extra) => `<li><button data-act="ficha" data-tipo="medico" data-id="${esc(m.id)}">${esc(m.nombre)}</button><span class="m">${esc(extra)}</span></li>`;
    const sub = {
      esperando: () => D.esperando.map((e) => `<li><button data-act="ficha" data-tipo="medico" data-id="${esc(e.medicoId)}">${esc(e.medico)}</button><span class="m">hace ${minutos(e.min)} · ${esc(pacLab(e.paciente))}</span></li>`).join(""),
      nosostuvo: () => A.noSostuvo24.map((a) => `<li><button data-act="ficha" data-tipo="atencion" data-id="${esc(a.id)}">${esc(a.medico)}</button><span class="m">${fechaLab(a.fecha)} ${hm(a)} · ${a.reintegrado ? `devuelto ${ars(a.reintegrado)}` : "sin devolución registrada"}</span></li>`).join(""),
      sinnadie: () => A.sinNadie24.map((b) => `<li><button data-act="ficha" data-tipo="paciente" data-id="${esc(b.paciente)}">${esc(pacLab(b.paciente))}</button><span class="m">${fechaLab(b.fecha)} ${hm(b)} · ${esc(b.resultado)}</span></li>`).join(""),
      pendientes: () => A.pendientes.map((m) => med(m, `${m.especialidad} · hace ${diasEntre(m.registro, HOY) - 1} días`)).join(""),
      prendidos: () => A.dispAusentes.map((m) => med(m, `desde las ${new Date(m.disponibleDesdeAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" })}`)).join(""),
      mp: () => A.mpVencido.map((m) => med(m, m.especialidad)).join(""),
      refunds: () => D.refunds.map((r) => `<li><span>${esc(r.medico)}</span><span class="m">${esc(r.tipo)} · desde ${fechaLab(r.desde)} · ${r.intentos} intentos</span></li>`).join(""),
      alertas: () => D.alertas.map((a) => `<li><span>${esc(a.titulo)}</span><span class="m">${esc(a.severidad)} · ${fechaLab(a.fecha)}</span></li>`).join(""),
    };
    const conN = A.items.filter((i) => i.n), ceros = A.items.filter((i) => !i.n);
    return `<section class="sec" id="hoy" style="margin-top:0">
      <div class="g12">
        <div class="card c7">
          <div class="card-h"><h3>Hoy y ahora</h3><span class="r">${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" })} hora argentina</span></div>
          <div class="linea"><span><b>${enLinea.length ? `${fmt(enLinea.length)} en línea ahora:` : "Nadie en línea ahora."}</b> ${enLinea.map((m) => `<button data-act="ficha" data-tipo="medico" data-id="${esc(m.id)}" style="color:var(--brand-hover)">${esc(m.nombre)}</button> <span class="mini">${esc(m.especialidad)} · ${esc(m.provincias.map(provC).join(", ") || "sin provincia")}${m.disponibleDesdeAt ? ` · desde ${new Date(m.disponibleDesdeAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" })}` : ""}</span>`).join(" · ")}</span><span><b>Agenda hoy:</b> ${fmt(suma(agendaHoy, "libres"))} lugares libres · ${[...new Set(agendaHoy.map((s) => s.medicoId))].map((id) => linkMed(id)).join(", ") || "nadie"}</span></div>
          ${(() => { const bh = D.busquedas.filter((b) => b.fecha === HOY); return `<div class="linea"><span><b>Buscaron hoy:</b> ${bh.length ? bh.map((b) => `${linkPac(b.paciente)} · ${esc(provC(b.provincia))} ${hm(b)} · <span style="color:${b.matchHabia ? "var(--ink-soft)" : "#9C2C2B"}">${esc(resCorto(b.resultado))}</span>${b.medicoElegidoId ? ` → ${linkMed(b.medicoElegidoId)}` : ""}`).join(" · ") : "nadie todavía"}</span></div>`; })()}
          ${tira(HOY)}${tira(AYER)}
          <div class="tiral"><span></span>${Array.from({ length: 24 }, (_, h) => `<span>${h % 3 === 0 ? h : ""}</span>`).join("")}</div>
          <div class="leg"><span><i style="background:var(--brand-soft)"></i>1 en línea</span><span><i style="background:var(--brand-line)"></i>2</span><span><i style="background:var(--brand)"></i>3 o más</span><span><i style="background:var(--adv-soft);box-shadow:inset 0 0 0 1px var(--adv)"></i>búsquedas sin nadie</span><span class="mini">el número es la cantidad de búsquedas en esa hora</span></div>
          <div class="linea" style="margin-top:12px"><span><b>Ayer:</b> ${ayer.cons.length ? ayer.cons.map((a) => linkAt(a, `${esc(nomC(MED.get(a.medicoId)))} → ${esc(pacC(a.paciente))} · ${esc(provC(pacProv(a.paciente)))}${a.desenlace !== "atendida" ? ` · ${esc(DES[a.desenlace][0].toLowerCase())}` : ""}`)).join(" · ") : "ninguna consulta"}</span><span>${ayer.bus.length ? `${nn(ayer.bus.length, "búsqueda", "búsquedas")}: ${ayer.bus.map((b) => `${linkPac(b.paciente)} · ${esc(provC(b.provincia))} <span style="color:${b.matchHabia ? "var(--ink-soft)" : "#9C2C2B"}">${esc(resCorto(b.resultado))}</span>`).join(", ")}` : "nadie buscó"}</span><span>cobrado ${ars(ayer.cobrado)}${ayer.dev ? ` · devuelto ${ars(ayer.dev)}` : ""}</span><button data-act="dias" data-v="ayer" style="color:var(--brand-hover)">ver ayer entero →</button></div>
        </div>
        <div class="card c5">
          <div class="card-h"><h3>A quién le escribo hoy</h3><span class="r">${nn(A.total, "pendiente hoy", "pendientes hoy")}</span></div>
          ${conN.length ? conN.map((i) => `<div class="reloj"><span class="t"><span class="sev ${i.sev}"></span><span>${esc(i.lab)}${i.sub ? ` <span class="mini">· ${esc(i.sub)}</span>` : ""}</span></span><span class="n">${fmt(i.n)}</span></div><ul class="subl">${sub[i.k]()}</ul>`).join("") : `<p class="cero">Nada pendiente hoy.</p>`}
          ${ceros.length ? `<div class="ceros">Sin pendientes: ${ceros.map((i) => corto[i.k]).join(" · ")}.</div>` : ""}
          ${A.listosSinOferta.length ? `<div class="ceros"><b>${fmt(A.listosSinOferta.length)}</b> con perfil completo sin CI ni agenda → <button data-act="ir" data-v="s4" style="color:var(--brand-hover)">campaña de activación ↓</button></div>` : ""}
        </div>
      </div>
    </section>`;
  }

  /* ───────────────────────── 1 · ¿GIRÓ? ───────────────────────── */
  function seccion1(V) {
    const metricas = { consultas: ["Consultas", COB.consultas, fmt], pacientes: ["Pacientes nuevos", COB.pacientes, fmt], busquedas: ["Búsquedas", COB.embudo, fmt], sinNadie: ["Búsquedas sin nadie", COB.embudo, fmt], cobrado: ["Cobrado", COB.consultas, (v) => "$" + fmt(v / 1000) + "k"] };
    const [mlab, mdesde, mfmt] = metricas[S.metrica];
    const valorDe = (pred) => {
      if (S.metrica === "consultas") return D.atenciones.filter((a) => pred(a.fecha) && a.nivel === "consulta" && pasa(a)).length;
      if (S.metrica === "pacientes") return D.pacientes.filter((p) => pred(p.alta) && (!S.f.prov || p.provincia === S.f.prov)).length;
      if (S.metrica === "busquedas") return D.busquedas.filter((b) => pred(b.fecha) && (!S.f.prov || b.provincia === S.f.prov)).length;
      if (S.metrica === "sinNadie") return D.busquedas.filter((b) => pred(b.fecha) && b.provincia && !b.matchHabia && (!S.f.prov || b.provincia === S.f.prov)).length;
      return suma(D.atenciones.filter((a) => pred(a.fecha) && pasa(a)), "cobrado");
    };
    const detalle = (pred) => { if (S.metrica !== "consultas") return ""; const a = D.atenciones.filter((x) => pred(x.fecha) && x.nivel === "consulta" && pasa(x)); return ` (${a.filter((x) => x.tipo === "ci").length} CI · ${a.filter((x) => x.tipo === "turno").length} turnos)`; };
    let buckets;
    const selDe = (a, b) => (S.per.modo === "dias" ? !(b < S.per.desde || a > S.per.hasta) : S.per.meses.has(a.slice(0, 7)));
    if (S.gran === "mes") {
      buckets = MESES12.filter((m) => cubierto(m, COB.ventana)).map((m) => { const cub = cubierto(m, mdesde); const v = cub ? valorDe((f) => f.slice(0, 7) === m) : 0; return { lab: mesLab(m), tipo: "mes", desde: m + "-01", hasta: ultimoDia(m), mes: m, v, cub, sel: S.per.modo === "meses" ? S.per.meses.has(m) : selDe(m + "-01", ultimoDia(m)), parcial: m === MES_HOY, titulo: `${mesLargo(m)}: ${mfmt(v)}${detalle((f) => f.slice(0, 7) === m)}${m === MES_HOY ? ` (al ${fechaLab(HOY)})` : ""}` }; });
    } else if (S.gran === "dia") {
      let ini = sumaDias(HOY, -44); if (S.per.modo === "dias" && S.per.desde < ini) ini = S.per.desde; if (ini < mdesde) ini = mdesde;
      buckets = [];
      for (let f = ini; f <= HOY; f = sumaDias(f, 1)) { const v = valorDe((x) => x === f); buckets.push({ lab: f.slice(8, 10) === "01" || f === ini ? fechaLab(f) : String(Number(f.slice(8, 10))), tipo: "dia", desde: f, hasta: f, mes: f.slice(0, 7), v, cub: true, sel: selDe(f, f), parcial: f === HOY, titulo: `${new Date(f + "T12:00:00Z").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}: ${mfmt(v)}${detalle((x) => x === f)}${f === HOY ? " (hoy, hasta ahora)" : ""}` }); }
    } else {
      const ini = lunesDe(mdesde), fin = lunesDe(HOY); buckets = [];
      for (let l = ini; l <= fin; l = sumaDias(l, 7)) { const dom = sumaDias(l, 6); const v = valorDe((f) => f >= l && f <= dom); const m = l.slice(0, 7); buckets.push({ lab: fechaLab(l), tipo: "semana", desde: l, hasta: dom < HOY ? dom : HOY, mes: m, v, cub: true, sel: selDe(l, dom), parcial: l === fin, titulo: `semana del ${fechaLab(l)}: ${mfmt(v)}${detalle((f) => f >= l && f <= dom)}${l === fin ? " (en curso)" : ""}` }); }
    }
    // composición + motivos en UNA lista
    const comp = ORDEN_DES.map((k) => ({ key: k, lab: DES[k][0], color: COL[DES[k][1]], n: V.consultas.filter((a) => a.desenlace === k).length, filas: V.consultas.filter((a) => a.desenlace === k) })).filter((x) => x.n > 0);
    const nComp = suma(comp, "n");
    const stack = comp.map((c) => `<span style="width:${(c.n / Math.max(nComp, 1)) * 100}%;background:${c.color}" title="${esc(c.lab)}: ${c.n}"></span>`).join("");
    const dedN = V.consultas.filter((a) => a.origen === "inferido" && a.tipo === "ci").length;
    const porTipo = [["ci", "Consulta inmediata"], ["turno", "Turno"]].map(([k, l]) => ({ k: "tipo", v: k, l, n: V.base.filter((a) => a.tipo === k).length }));
    const porCanal = [["clinica", "Por la clínica"], ["consultorio", "Por el link propio"]].map(([k, l]) => ({ k: "canal", v: k, l, n: V.base.filter((a) => a.canal === k).length }));
    const porEsp = cnt(V.base, "especialidad").map(([e, n]) => ({ k: "esp", v: e, l: e, n }));
    const chip = (c) => `<button class="chip ${S.f[c.k] === c.v ? "on" : ""}" data-act="filtro" data-k="${c.k}" data-v="${esc(c.v)}">${esc(c.l)}<span class="c num">${fmt(c.n)}</span></button>`;
    const personas = cnt(V.consultas.filter((a) => a.paciente), "paciente");
    const repet = personas.filter(([, n]) => n >= 2).length;
    const escalera = [["Se registraron", V.pacs.length], ["Abrieron la clínica", V.pacs.filter((p) => p.vioClinica).length], ["Eligieron un profesional", V.pacs.filter((p) => p.eligio).length], ["Pidieron o reservaron", V.pacs.filter((p) => p.pidio).length], ["Consultaron", V.pacs.filter((p) => p.consultas > 0).length]];
    const titulo = S.per.modo === "dias" && S.per.desde === S.per.hasta ? `¿Giró ${S.per.desde === HOY ? "hoy" : S.per.desde === AYER ? "ayer" : "ese día"}, y más que el día anterior?` : S.per.modo === "dias" && diasEntre(S.per.desde, S.per.hasta) <= 7 ? "¿Giró esta semana, y más que la anterior?" : "¿Está girando, y más que antes?";
    return `<section class="sec" id="s1">
      <div class="sec-h"><span class="n">1</span><h2>${titulo}</h2><span class="sub">crecimiento · ${perCorto(S.per)}</span></div>
      <div class="g12">
        <div class="card c7">
          <div class="card-h"><h3>${mlab} por ${S.gran === "mes" ? "mes" : S.gran === "dia" ? "día" : "semana"} <span class="r">· tocá un punto para elegir ese ${S.gran === "mes" ? "mes" : S.gran === "dia" ? "día" : "período"}</span></h3>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><span class="seg">${Object.entries(metricas).map(([k, [l]]) => `<button class="${S.metrica === k ? "on" : ""}" data-act="metrica" data-v="${esc(k)}">${l}</button>`).join("")}</span><span class="seg"><button class="${S.gran === "dia" ? "on" : ""}" data-act="gran" data-v="dia">Día</button><button class="${S.gran === "semana" ? "on" : ""}" data-act="gran" data-v="semana">Semana</button><button class="${S.gran === "mes" ? "on" : ""}" data-act="gran" data-v="mes">Mes</button></span></div></div>
          ${lineChart(buckets, { fmtV: mfmt, id: "curva" })}
          <div class="leg"><span><i class="ln" style="background:var(--brand)"></i>${mlab}${hayFiltros() ? " (filtrado)" : ""}</span><span title="${S.metrica === "consultas" || S.metrica === "cobrado" ? "Se mide desde el lanzamiento, 10/06/2026" : S.metrica === "busquedas" || S.metrica === "sinNadie" ? "Se mide desde el 22/06/2026" : "Los registros anteriores al 10/06 son de la beta cerrada"}"><i class="ded"></i>sin medición</span><span class="mini">último punto: ${S.gran === "mes" ? "mes" : S.gran === "dia" ? "hoy" : "semana"} en curso</span></div>
          <div class="chiprow">${porTipo.map(chip).join("")}<span style="width:8px"></span>${porCanal.map(chip).join("")}<span style="width:8px"></span>${porEsp.slice(0, 8).map(chip).join("")}${porEsp.length > 8 ? `<span class="mini" style="align-self:center">y ${porEsp.length - 8} especialidades más en el ranking</span>` : ""}</div>
        </div>
        <div class="card c5">
          <div class="card-h"><h3>¿En qué ${nComp === 1 ? "terminó esa consulta" : `terminaron esas ${fmt(nComp)} consultas`}?</h3></div>
          <div class="stack">${stack}</div>
          <ul class="lista">${comp.map((c) => { const mot = c.key === "atendida" || c.key === "en_progreso" ? [] : cnt(c.filas, motivoDe); return `<li class="${S.f.des === c.key ? "on" : ""}"><span class="sw" style="background:${c.color}"></span><button class="q" data-act="filtro" data-k="des" data-v="${esc(c.key)}">${esc(c.lab)}</button><span class="n num">${fmt(c.n)}</span><span class="p num">${nComp >= 30 ? pct(c.n, nComp) : `de ${fmt(nComp)}`}</span></li>${mot.map(([l, n]) => `<div class="sub-m ${S.f.motivo === l ? "on" : ""}"><span></span><button data-act="filtro" data-k="motivo" data-v="${esc(l)}">${esc(l)}</button><span class="num">${fmt(n)}</span><span></span></div>`).join("")}`; }).join("") || `<li><span></span><span class="cero">Sin consultas en el período.</span><span></span><span></span></li>`}</ul>
          ${dedN ? `<div class="nota" title="Anteriores al 20/08, cuando empezó a registrarse quién acepta; se infiere del pago o de la sala">${fmt(dedN)} con aceptación deducida${sup}</div>` : ""}
          <div style="margin-top:10px">
            <div class="fila-ex"><span><b>${fmt(V.sinRespuesta + V.retirados)}</b> ${V.sinRespuesta + V.retirados === 1 ? "intento que no llegó" : "intentos que no llegaron"} a consulta <span class="mini">· ${fmt(V.sinRespuesta)} sin respuesta${V.sinRespuestaDed ? sup : ""}, ${fmt(V.retirados)} el paciente se retiró</span></span><button class="tog ${S.intentos ? "on" : ""}" data-act="intentos"><span class="sw"></span>${S.intentos ? "incluidos" : "incluirlos"}</button></div>
            ${V.reservando ? `<div class="fila-ex"><span><b>${fmt(V.reservando)}</b> ${V.reservando === 1 ? "turno pendiente de pago" : "turnos pendientes de pago"}</span><span class="mini">no se cuentan</span></div>` : ""}
            <div class="fila-ex" title="${fmt(D.ocultos.reprogramadosOrigen)} reprogramaciones plegadas en su turno final"><span><b>${fmt(D.ocultos.consultasTest + D.ocultos.turnosTest)}</b> ${D.ocultos.consultasTest + D.ocultos.turnosTest === 1 ? "atención" : "atenciones"} de cuentas de prueba</span><span class="mini">ocultas</span></div>
          </div>
        </div>
      </div>
      <div class="preguntas">
        ${preg("q1z", "¿Cuáles fueron, una por una?", `${nn(V.at.length, "atención", "atenciones")}<span class="sub">${nn(V.consultas.length, "consulta", "consultas")} · ${nn(V.intentos.length, "intento", "intentos")}</span>`, () => tabla("t-todas", [
          colFecha, colHora, { k: "tipo", t: "Tipo", tipo: "sel", texto: (r) => (r.tipo === "ci" ? "CI" : "Turno") }, { k: "medico", t: "Profesional" }, { k: "especialidad", t: "Especialidad", tipo: "sel" }, colPac,
          { k: "canal", t: "Canal", tipo: "sel", texto: (r) => (r.canal === "consultorio" ? "Link propio" : "Clínica") }, { k: "nivel", t: "Nivel", tipo: "sel", texto: (r) => NIVEL(r.nivel) }, colDes,
          { k: "cobrado", t: "Cobrado", tipo: "num", texto: (r) => (r.cobrado ? ars(r.cobrado) : r.reintegrado ? `devuelto ${ars(r.reintegrado)}` : "—") },
        ], V.at, { ord: "fecha", fila: filaAt }))}
        ${preg("q1a", "¿Cuántos pacientes distintos consultaron, y cuántos por segunda vez?", `${nn(personas.length, "paciente", "pacientes")}<span class="sub">${fmt(repet)} ${repet === 1 ? "repitió" : "repitieron"}</span>`, () => tabla("t-personas", [
          { k: "paciente", t: "Paciente", texto: (r) => pacLab(r.key) }, { k: "provincia", t: "Provincia", tipo: "sel", texto: (r) => PAC.get(r.key)?.provincia ?? "—" }, { k: "n", t: "Consultas en el período", tipo: "num" },
          { k: "primera", t: "Primera consulta", texto: (r) => (PAC.get(r.key)?.primeraConsulta ? fechaLab(PAC.get(r.key).primeraConsulta) : "—"), sortVal: (r) => PAC.get(r.key)?.primeraConsulta ?? "" }, { k: "alta", t: "Alta", texto: (r) => (PAC.get(r.key)?.alta ? fechaLab(PAC.get(r.key).alta) : "—"), sortVal: (r) => PAC.get(r.key)?.alta ?? "" },
        ], personas.map(([key, n]) => ({ key, n })), { ord: "n", fila: (r) => ({ tipo: "paciente", id: r.key }) }))}
        ${preg("q1b", "¿Cuántos pacientes nuevos hicieron algo después de registrarse?", `${fmt(escalera[1][1])} de ${fmt(escalera[0][1])} abrieron la clínica<span class="sub">${fmt(escalera[4][1])} consultaron</span>`, () => `
          <div class="emb">${escalera.map(([l, n], i) => `<div class="e"><button class="lab">${esc(l)}</button><div class="tr"><div class="fi" style="width:${(n / Math.max(escalera[0][1], 1)) * 100}%">${n ? fmt(n) : ""}</div></div><div class="v num"><b>${pct(n, escalera[0][1])}</b>${i ? ` · <span class="caida">−${fmt(escalera[i - 1][1] - n)}</span> del paso anterior` : " de los registrados"}</div></div>`).join("")}</div>
          ${tabla("t-pacnuevos", [
            { k: "key", t: "Paciente", texto: (r) => pacLab(r.key) }, { k: "alta", t: "Alta", texto: (r) => fechaLab(r.alta), sortVal: (r) => r.alta }, { k: "provincia", t: "Provincia", tipo: "sel", texto: (r) => r.provincia ?? "—" },
            { k: "paso", t: "Hasta dónde llegó", tipo: "sel", texto: (r) => (r.consultas ? "Consultó" : r.pidio ? "Pidió o reservó" : r.eligio ? "Eligió profesional" : r.vioClinica ? "Abrió la clínica" : "Solo se registró") }, { k: "consultas", t: "Consultas", tipo: "num" },
          ], V.pacs, { ord: "alta", fila: (r) => ({ tipo: "paciente", id: r.key }) })}`)}
      </div>
    </section>`;
  }

  /* ───────────────────────── 2 · ¿POR QUÉ SE PIERDE LA DEMANDA? ───────────────────────── */
  function seccion2(V) {
    const ap = aprobados();
    const conFiltroProf = !!(S.f.medico || S.f.esp);
    const emb = conFiltroProf
      ? [["Lo eligieron", V.busEligio, "eligio"], ["Pidieron o reservaron", V.busPidio, "pidio"], ["Pagaron", V.busPago, "pago"], ["Se atendieron", V.busAtendio, "atendio"]]
      : [["Buscaron", V.busN, "todas"], ["Encontraron a alguien", V.busConAlguienN, "alguien"], ["Eligieron un profesional", V.busEligio, "eligio"], ["Pidieron o reservaron", V.busPidio, "pidio"], ["Pagaron", V.busPago, "pago"], ["Se atendieron", V.busAtendio, "atendio"]];
    const baseEmb = emb[0][1];
    const caida = ["", "sin nadie disponible", "no eligieron", "eligieron y no pidieron", "pidieron y no pagaron", "pagaron y no se atendieron"];
    const provs = cnt(V.bus, (b) => b.provincia ?? "Sin provincia cargada").map(([p, n]) => { const bs = V.bus.filter((b) => (b.provincia ?? "Sin provincia cargada") === p); const meds = ap.filter((m) => m.provincias.includes(p)).length; const sinLinea = bs.filter((b) => b.resultado === SIN_LINEA).length; const sinMed = bs.filter((b) => b.resultado === SIN_MED).length; return { prov: p, n, sinMatch: bs.filter((b) => !b.matchHabia).length, sinMed, sinLinea, nadieAcepto: bs.filter((b) => b.resultado === NADIE_ACEPTO).length, pago: bs.filter((b) => b.pago || b.seAtendio).length, medicos: meds, accion: p === "Sin provincia cargada" ? "Pedir la provincia" : meds === 0 && sinMed ? "Reclutar" : sinLinea ? "Prender" : "—" }; });
    const resultados = cnt(V.bus, "resultado");
    const colorRes = (l) => (l === SIN_PROV ? "var(--adv)" : V.bus.find((b) => b.resultado === l)?.matchHabia ? (l === "se atendió" || l === "pagó" ? "var(--ok)" : "var(--neutro)") : "var(--adv)");
    // mapa hora × día de semana: fracción de días de ese día de semana con ≥1 en línea a esa hora; búsquedas encima
    const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const dow = (f) => { const d = new Date(f + "T12:00:00Z").getUTCDay(); return d === 0 ? 6 : d - 1; };
    const diasPer = diasDelPeriodo(S.per, HOY);
    const diasDow = DOW.map((_, i) => diasPer.filter((f) => dow(f) === i));
    const onlineCel = new Map(); for (const c of V.ci) if (c.horas > 0) onlineCel.set(c.fecha + "|" + c.hora, true);
    const mapa = DOW.map((l, i) => `<span class="lab">${l}</span>${Array.from({ length: 24 }, (_, h) => { const dias = diasDow[i].length; const cub = diasDow[i].filter((f) => onlineCel.has(f + "|" + h)).length; const fr = dias ? cub / dias : 0; const b = V.bus.filter((x) => dow(x.fecha) === i && x.hora === h).length; const cls = fr >= 0.75 ? "n4" : fr >= 0.5 ? "n3" : fr >= 0.25 ? "n2" : fr > 0 ? "n1" : ""; return `<div class="c ${cls} ${b > 0 && fr < 0.25 ? "hueco" : ""}" data-tt="${esc(`${l} ${horaLab(h)} · alguien en línea ${fmt(fr * 100)}% de los ${dias} días · ${b} búsquedas`)}">${b || ""}</div>`; }).join("")}`).join("");
    const eligNoPidio = V.bus.filter((b) => b.eligio && !b.pidio && !b.pago);
    const sinResp = V.at.filter((a) => a.desenlace === "sin_respuesta");
    const ciPed = V.at.filter((a) => a.tipo === "ci"); const acept = ciPed.filter((a) => a.aceptada);
    const hitos = ciPed.filter((a) => a.minAceptar != null); const rapidos = hitos.filter((a) => a.minAceptar <= 10).length;
    const abandono = V.consultas.filter((a) => a.desenlace === "abandono");
    const slotsDow = DOW.map((l, i) => ({ lab: l, n: suma(V.slots.filter((s) => dow(s.fecha) === i), "n"), res: V.at.filter((a) => a.tipo === "turno" && a.pagada && dow(a.fecha) === i).length }));
    const franja = (h) => (h < 8 ? "Madrugada" : h < 13 ? "Mañana" : h < 18 ? "Tarde" : "Noche");
    const resFranja = ["Madrugada", "Mañana", "Tarde", "Noche"].map((f) => ({ lab: f, res: V.at.filter((a) => a.tipo === "turno" && a.pagada && franja(a.hora) === f).length, bus: V.bus.filter((b) => franja(b.hora) === f).length }));
    const rank = ap.filter((m) => (!S.f.medico || m.id === S.f.medico) && (!S.f.esp || m.especialidad === S.f.esp)).map((m) => { const ped = V.at.filter((a) => a.medicoId === m.id); const ci = ped.filter((a) => a.tipo === "ci"); return { id: m.id, nombre: m.nombre, especialidad: m.especialidad, provincias: m.provincias, pedidos: ci.length, acepto: ci.filter((a) => a.aceptada).length, sinResp: ci.filter((a) => a.desenlace === "sin_respuesta").length, atendio: ped.filter((a) => a.desenlace === "atendida").length, noSostuvo: ped.filter((a) => a.desenlace === "medico_se_fue").length, hci: suma(V.ci.filter((c) => c.medicoId === m.id), "horas"), lug: suma(V.slots.filter((s) => s.medicoId === m.id), "n"), res: ped.filter((a) => a.tipo === "turno" && a.pagada).length, cobrado: suma(ped, "cobrado"), estado: m.disponible ? "En línea ahora" : m.faltantes.length ? `Le faltan ${m.faltantes.length}` : m.slotsFuturos ? "Con agenda" : "Perfil completo, sin CI ni agenda" }; });
    const bTabla = (id, filas) => tabla(id, [
      colFecha, colHora, colPac, { k: "provincia", t: "Provincia", tipo: "sel", texto: (r) => r.provincia ?? "Sin provincia" },
      { k: "medicosProv", t: "Prof. para su provincia", tipo: "num" }, { k: "ciOnline", t: "CI en línea", tipo: "num" }, { k: "medicoElegido", t: "Eligió a", texto: (r) => r.medicoElegido ?? "—" }, { k: "modo", t: "Tipo", tipo: "sel", texto: (r) => (r.modo === "ci" ? "CI" : r.modo === "turno" ? "Turno" : "—") },
      { k: "resultado", t: "Qué pasó", tipo: "sel", texto: (r) => resLab(r.resultado), render: (r) => `<span class="est ${r.resultado === SIN_PROV ? "adv" : r.matchHabia ? (r.pago || r.seAtendio ? "ok" : "neutro") : "adv"}">${esc(resLab(r.resultado))}</span>${r.fotoExacta ? "" : `<span class="sup" title="Oferta reconstruida: la búsqueda es anterior al 28/07">°</span>`}` },
    ], filas, { ord: "fecha", fila: (r) => (r.paciente ? { tipo: "paciente", id: r.paciente } : null) });
    const filasEmb = (key) => key === "todas" ? V.bus : key === "alguien" ? V.bus.filter((b) => b.provincia && b.matchHabia) : key === "eligio" ? V.bus.filter((b) => b.eligio) : key === "pidio" ? V.bus.filter((b) => b.pidio) : key === "pago" ? V.bus.filter((b) => b.pago || b.seAtendio) : V.bus.filter((b) => b.seAtendio);
    return `<section class="sec" id="s2">
      <div class="sec-h"><span class="n">2</span><h2>¿Por qué con tanta oferta publicada hay tan pocas consultas?</h2><span class="sub">dónde se pierde la demanda</span></div>
      <div class="kv">
        <div class="k ${V.busSinNadieN ? "acc" : ""}"><div class="l">Búsquedas sin nadie</div><div class="v num">${fmt(V.busSinNadieN)} <small>de ${fmt(V.busConProvN)} con provincia</small></div><div class="s">${fmt(V.busSinLinea)} con profesionales, ninguno en línea · ${fmt(V.busSinMed)} sin profesionales para su provincia · ${fmt(V.busNadieAcepto)} nadie aceptó${V.busSinProvN ? ` · aparte, ${fmt(V.busSinProvN)} sin provincia cargada` : ""}</div></div>
        <div class="k"><div class="l">Cobertura horaria de la CI</div><div class="v num">${V.cobertura == null ? "—" : fmt(V.cobertura) + "<small>%</small>"}</div><div class="s">de las horas entre las 8 y las 22 del período, ${fmt(V.celdas)} de ${fmt(V.totalCeldas)} tuvieron a alguien en línea</div></div>
        <div class="k"><div class="l">Horas de CI ofrecidas</div><div class="v num">${fmt(V.ciHoras)} h <small>· ${fmt(V.pedidosCI)} pedidos</small></div><div class="s">${V.pedidosCI ? `un pedido cada ${fmt(V.ciHoras / V.pedidosCI)} h de CI` : "sin pedidos"} · ${fmt(V.ciMedicos)} profesionales la prendieron</div></div>
        <div class="k"><div class="l">Lugares de agenda ofrecidos</div><div class="v num">${fmt(V.slotsN)} <small>· ${nn(V.reservados, "turno pago", "turnos pagos")}</small></div><div class="s">ocupación ${V.slotsN ? pct(V.reservados, V.slotsN, 1) : "—"} · ${fmt(V.slotsVencidos)} vencieron sin que nadie los tome · ${fmt(V.medicosVivos)} de ${fmt(ap.length)} aprobados publicaron CI o agenda</div></div>
      </div>
      <div class="g12" style="margin-top:14px">
        <div class="card c7">
          <div class="card-h"><h3>El embudo del paciente <span class="r">· cada paso abre su lista</span></h3><span class="r" title="Una búsqueda es una sesión de vistas de la clínica; huecos de más de 30 minutos separan búsquedas">${conFiltroProf ? "con filtro por profesional, el embudo arranca en la elección" : ""}</span></div>
          <div class="emb">${emb.map(([l, n, key], i) => `<div class="e ${S.abiertas.has("emb-" + key) ? "on" : ""}"><button class="lab" data-act="toggleEmb" data-v="emb-${key}">${esc(l)}</button><div class="tr"><div class="fi" style="width:${(n / Math.max(baseEmb, 1)) * 100}%">${n ? fmt(n) : ""}</div></div><div class="v num"><b>${baseEmb >= 30 ? pct(n, baseEmb) : `${fmt(n)} de ${fmt(baseEmb)}`}</b>${i ? ` · ${i === 1 && !conFiltroProf ? `<span class="caida">−${fmt(V.busSinNadieN)}</span> sin nadie disponible${V.busSinProvN ? ` · <span class="caida">−${fmt(V.busSinProvN)}</span> sin provincia` : ""}` : `<span class="caida">−${fmt(emb[i - 1][1] - n)}</span> ${caida[conFiltroProf ? i + 2 : i] ?? ""}`}` : ""}</div></div>`).join("")}</div>
          ${!conFiltroProf && V.busSinProvN ? `<div class="nota hueco" style="margin-top:8px">${fmt(V.busSinProvN)} sin provincia cargada, fuera del embudo: falla del registro.</div>` : ""}
          ${[...S.abiertas].filter((k) => k.startsWith("emb-")).map((k) => { const key = k.slice(4); const filas = filasEmb(key); return `<div style="margin-top:10px"><div class="mini">${esc(emb.find((e) => e[2] === key)?.[0] ?? key)} · ${fmt(filas.length)} búsquedas</div>${bTabla("t-emb-" + key, filas)}</div>`; }).join("")}
          <div class="nota" title="Pagaron = plata acreditada (un pago abierto no cuenta); cada atención se acredita a una sola búsqueda; la oferta de cada búsqueda es exacta desde el 28/07 y antes se reconstruye°; el embudo se mide desde el 22/06">${fmt(V.busSinLineaConAgenda)} de las que no encontraron a nadie en línea tenían agenda de turnos a la vista</div>
        </div>
        <div class="card c5">
          <div class="card-h"><h3>Qué pasó con cada búsqueda</h3><span class="r">${fmt(V.busN)}</span></div>
          ${barrasH(resultados.map(([l, n]) => ({ key: l, lab: resLab(l), n, color: colorRes(l) })), V.busN)}
          <div class="leg"><span><i style="background:var(--adv)"></i>falla nuestra</span><span><i style="background:var(--neutro)"></i>el paciente no siguió</span><span><i style="background:var(--ok)"></i>pagó o se atendió</span></div>
        </div>
      </div>
      <div class="preguntas">
        ${preg("q2a", "¿Dónde no había nadie: reclutar o prender?", `${nn(provs.filter((p) => p.accion === "Reclutar").length, "provincia para reclutar", "provincias para reclutar")}<span class="sub">${fmt(provs.filter((p) => p.accion === "Prender").length)} para prender</span>`, () => tabla("t-prov", [
          { k: "prov", t: "Provincia del paciente" }, { k: "accion", t: "Acción", tipo: "sel", render: (r) => `<span class="est ${r.accion === "Reclutar" ? "adv" : r.accion === "Prender" ? "aten" : r.accion === "Pedir la provincia" ? "adv" : "neutro"}">${esc(r.accion)}</span>` }, { k: "n", t: "Búsquedas", tipo: "num" }, { k: "medicos", t: "Prof. habilitados hoy", tipo: "num" }, { k: "sinMed", t: "Sin profesionales", tipo: "num" }, { k: "sinLinea", t: "Nadie en línea", tipo: "num" }, { k: "nadieAcepto", t: "Nadie aceptó", tipo: "num" }, { k: "sinMatch", t: "Sin nadie (total)", tipo: "num", render: (r) => `<span class="mbar" style="width:${(r.sinMatch / Math.max(r.n, 1)) * 60}px;background:var(--adv)"></span><b>${fmt(r.sinMatch)}</b>` }, { k: "pago", t: "Pagaron", tipo: "num" },
        ], provs, { ord: "sinMatch", fila: (r) => ({ tipo: "prov", id: r.prov, mas: { act: "filtro", k: "prov", v: r.prov } }), buscar: false }))}
        ${preg("q2b", "¿A qué hora buscan los pacientes y a qué hora hay alguien en línea?", `pico de búsqueda ${horaLab(Array.from({ length: 24 }, (_, h) => V.bus.filter((b) => b.hora === h).length).reduce((m, v, h, arr) => (v > arr[m] ? h : m), 0))}<span class="sub">cobertura ${V.cobertura == null ? "—" : fmt(V.cobertura) + "%"}</span>`, () => `
          <div class="mapa"><span></span>${Array.from({ length: 24 }, (_, h) => `<span class="lab" style="text-align:center">${h % 3 === 0 ? h : ""}</span>`).join("")}${mapa}</div>
          <div class="leg"><span><i style="background:#D6E7F9"></i>alguien en línea pocas veces</span><span><i style="background:#6FA8E6"></i>más de la mitad de los días</span><span><i style="background:var(--brand)"></i>casi siempre</span><span><i style="box-shadow:inset 0 0 0 1px var(--adv)"></i>búsquedas con nadie</span><span class="mini">número = búsquedas · hora argentina</span></div>`)}
        ${preg("q2d", "¿Cuántos eligieron y no llegaron a pedir, y en qué paso se fueron?", `${nn(eligNoPidio.length, "búsqueda", "búsquedas")}<span class="sub">el paso se registra desde el 31/08</span>`, () => tabla("t-triage", [
          colFecha, colPac, { k: "medicoElegido", t: "Eligió a", texto: (r) => r.medicoElegido ?? "—" }, { k: "modo", t: "Tipo", tipo: "sel", texto: (r) => (r.modo === "ci" ? "CI" : r.modo === "turno" ? "Turno" : "—") },
          { k: "triage", t: "Último paso visto", tipo: "sel", texto: (r) => (r.fecha < COB.triage ? "sin registro (antes del 31/08)" : r.bloqueo ? `bloqueado: ${r.bloqueo}` : r.triage ?? "no llegó al triaje") }, { k: "resultado", t: "Qué pasó", tipo: "sel", texto: (r) => resLab(r.resultado) },
        ], eligNoPidio, { ord: "fecha", fila: (r) => (r.paciente ? { tipo: "paciente", id: r.paciente } : null) }))}
        ${preg("q2e", "¿Cuántos pidieron y nadie aceptó, a quién le llegó, y cuánto tardan en aceptar?", `${ciPed.length ? `aceptación ${pct(acept.length, ciPed.length)}` : "sin pedidos"}<span class="sub">${fmt(sinResp.length)} sin respuesta · ${hitos.length ? `mediana ${minutos(mediana(hitos.map((a) => a.minAceptar)))}, ${fmt(rapidos)} de ${fmt(hitos.length)} en menos de 10 min` : "tiempo sin hito registrado"}</span>`, () => `<p class="nota">Registrado desde el 20/08; antes, deducido°.</p>` + tabla("t-sinresp", [
          colFecha, colHora, { k: "medico", t: "Le llegó a" }, { k: "especialidad", t: "Especialidad", tipo: "sel" }, colPac,
          { k: "certeza", t: "Certeza", tipo: "sel", texto: (r) => (r.fecha >= COB.hito ? "Registrado" : "Deducido°"), render: (r) => `<span class="est ${r.fecha >= COB.hito ? "adv" : "ded"}">${r.fecha >= COB.hito ? "Registrado" : "Deducido°"}</span>` }, { k: "causaTexto", t: "Cómo se cerró", texto: (r) => motivoDe(r) },
        ], sinResp, { ord: "fecha", fila: filaAt, vacio: "Cero pedidos sin respuesta en el período." }) + (hitos.length ? tabla("t-aceptar", [colFecha, { k: "medico", t: "Profesional" }, colPac, { k: "minAceptar", t: "Tardó en aceptar", tipo: "num", texto: (r) => minutos(r.minAceptar) }, colDes], hitos, { ord: "minAceptar", dir: -1, fila: filaAt, buscar: false }) : ""))}
        ${preg("q2g", "¿Cuántos fueron aceptados y no pagaron: se fueron, o se les cayó el pago?", `${nn(abandono.length, "consulta", "consultas")}<span class="sub">si se fue o si falló el pago no se distingue todavía</span>`, () => tabla("t-abandono", [
          colFecha, colHora, { k: "medico", t: "Profesional" }, colPac, { k: "causaTexto", t: "Cómo se cerró", texto: (r) => motivoDe(r) },
        ], abandono, { ord: "fecha", fila: filaAt, vacio: "Cero en el período." }))}
        ${preg("q2h", "¿La agenda publicada está en días y horas que alguien quiere?", `${nn(V.slotsVencidos, "lugar venció", "lugares vencieron")} sin turno<span class="sub">de ${fmt(V.slotsN)} ofrecidos</span>`, () => `
          <div class="g12"><div class="c6"><div class="mini" style="font-weight:600;color:var(--ink)">Lugares ofrecidos por día de la semana · turnos pagos</div>${barrasH(slotsDow.map((d) => ({ key: d.lab, lab: d.lab, n: d.n, extra: nn(d.res, "turno pago", "turnos pagos"), color: "var(--turno)" })), null)}</div>
          <div class="c6"><div class="mini" style="font-weight:600;color:var(--ink)">Turnos pagos por franja · búsquedas en esa franja</div>${barrasH(resFranja.map((f) => ({ key: f.lab, lab: f.lab, n: f.res, extra: `${f.bus} búsquedas`, color: "var(--turno)" })), null)}</div></div>
  `)}
      </div>
      <div class="card" style="margin-top:14px">
        <div class="card-h"><h3>Quiénes <span class="r">· ordená por cualquier columna · "+" filtra el tablero por ese profesional · la fila abre la ficha</span></h3><span class="r">${nn(rank.length, "profesional", "profesionales")} ${S.f.medico || S.f.esp ? "según el filtro" : "aprobados"}</span></div>
        ${tabla("t-rank", [
          { k: "nombre", t: "Profesional" }, { k: "especialidad", t: "Especialidad", tipo: "sel" }, { k: "prov", t: "Provincias", texto: (r) => r.provincias.join(", ") },
          { k: "atendio", t: "Atendió", tipo: "num" }, { k: "pedidos", t: "Pedidos de CI", tipo: "num" }, { k: "acepto", t: "Aceptó", tipo: "num", render: (r) => `${fmt(r.acepto)}${r.pedidos ? ` <span class="mini">${pct(r.acepto, r.pedidos)}</span>` : ""}` }, { k: "sinResp", t: "Sin responder", tipo: "num", render: (r) => (r.sinResp ? `<span class="est adv">${r.sinResp}</span>` : `<span class="cero">0</span>`) },
          { k: "noSostuvo", t: "No sostuvo", tipo: "num", render: (r) => (r.noSostuvo ? `<span class="est adv">${r.noSostuvo}</span>` : `<span class="cero">0</span>`) },
          { k: "hci", t: "Horas CI", tipo: "num", texto: (r) => fmt(r.hci) }, { k: "lug", t: "Lugares", tipo: "num" }, { k: "res", t: "Turnos pagos", tipo: "num" }, { k: "cobrado", t: "Cobrado", tipo: "num", render: (r) => `<span class="mbar" style="width:${(r.cobrado / Math.max(...rank.map((x) => x.cobrado), 1)) * 50}px"></span>${ars(r.cobrado)}` },
          { k: "estado", t: "Estado", tipo: "sel", render: (r) => `<span class="est ${r.estado.startsWith("En línea") ? "ok" : r.estado.startsWith("Le faltan") ? "aten" : r.estado === "Con agenda" ? "brand" : "neutro"}">${esc(r.estado)}</span>` },
        ], rank, { ord: "atendio", fila: (r) => ({ tipo: "medico", id: r.id, mas: { act: "filtro", k: "medico", v: r.id } }) })}
      </div>
    </section>`;
  }

  /* ───────────────────────── 3 · ENTREGA Y PLATA ───────────────────────── */
  function seccion3(V) {
    const pag = V.consultas.filter((a) => a.pagada);
    const comp = ["atendida", "en_progreso", "paciente_se_fue", "medico_se_fue", "sin_datos"].map((k) => ({ key: k, lab: DES[k][0], color: COL[DES[k][1]], n: pag.filter((a) => a.desenlace === k).length })).filter((x) => x.n);
    const noSost = V.at.filter((a) => a.desenlace === "medico_se_fue");
    const reinc = cnt(noSost, "medicoId").filter(([, n]) => n >= 2).length;
    const atend = V.at.filter((a) => a.desenlace === "atendida");
    const conDoc = atend.filter((a) => a.documentos.length);
    const devol = V.at.filter((a) => a.reintegrado > 0);
    const causas = cnt(devol, motivoDe).map(([l, n]) => ({ key: l, lab: l, n, monto: suma(devol.filter((a) => motivoDe(a) === l), "reintegrado") }));
    const nuestra = suma(devol.filter((a) => a.desenlace === "medico_se_fue"), "reintegrado");
    const avisos = D.avisos.filter((a) => enPer(S.per, a.fecha) && (!S.f.medico || a.medicoId === S.f.medico));
    const avisosMed = avisos.filter((a) => a.fecha >= COB.entrega);
    const conc = cnt(pag.filter((a) => a.cobrado > 0), "medicoId").map(([id, n]) => ({ id, nombre: MED.get(id)?.nombre ?? "—", n, cobrado: suma(pag.filter((a) => a.medicoId === id), "cobrado"), atendio: V.at.filter((a) => a.medicoId === id && a.desenlace === "atendida").length, hci: suma(V.ci.filter((c) => c.medicoId === id), "horas") })).sort((a, b) => b.cobrado - a.cobrado);
    const top3 = conc.slice(0, 3); const shareC = V.cobrado ? suma(top3, "cobrado") / V.cobrado : 0; const shareA = atend.length ? suma(top3, "atendio") / atend.length : 0; const shareH = V.ciHoras ? suma(top3, "hci") / V.ciHoras : 0;
    const ap = aprobados(); const mpVenc = ap.filter((m) => m.mp === "expirado"); const mpNo = ap.filter((m) => m.mp === "no_conectado"); const deuda = D.deuda.filter((d) => d.estado !== "saldada");
    return `<section class="sec" id="s3">
      <div class="sec-h"><span class="n">3</span><h2>Lo que se pagó, ¿se atendió bien y quedó la plata?</h2><span class="sub">entrega y plata</span></div>
      <div class="g12">
        <div class="card c5">
          <div class="card-h"><h3>¿En qué ${pag.length === 1 ? "terminó la consulta paga" : `terminaron las ${fmt(pag.length)} consultas pagas`}?</h3></div>
          <div class="stack">${comp.map((c) => `<span style="width:${(c.n / Math.max(pag.length, 1)) * 100}%;background:${c.color}"></span>`).join("")}</div>
          <ul class="lista">${comp.map((c) => `<li class="${S.f.des === c.key ? "on" : ""}"><span class="sw" style="background:${c.color}"></span><button class="q" data-act="filtro" data-k="des" data-v="${esc(c.key)}">${esc(c.lab)}</button><span class="n num">${fmt(c.n)}</span><span class="p num">${pag.length >= 30 ? pct(c.n, pag.length) : `de ${fmt(pag.length)}`}</span></li>`).join("") || `<li><span></span><span class="cero">Sin consultas pagas en el período.</span><span></span><span></span></li>`}</ul>
          <div class="fila-ex" style="margin-top:8px"><span><b>${fmt(conDoc.length)}</b> de ${nn(atend.length, "atendida salió", "atendidas salieron")} con receta, certificado u orden</span><span class="mini">${atend.length >= 30 ? pct(conDoc.length, atend.length) : ""}</span></div>
        </div>
        <div class="card c7">
          <div class="card-h"><h3>La plata del período</h3><span class="r">aprobado por Mercado Pago, neto de devoluciones</span></div>
          <div class="kv">
            <div class="k"><div class="l">Cobrado</div><div class="v num">${ars(V.cobrado)}</div><div class="s">${nn(V.cobradasN, "consulta cobrada", "consultas cobradas")}${V.cobradasN ? ` · ${ars(V.cobrado / V.cobradasN)} por consulta` : ""}</div></div>
            <div class="k"><div class="l">Fee Docto</div><div class="v num">${ars(V.fee)}</div><div class="s">${V.cobrado ? pct(V.fee, V.cobrado, 1) : "—"} del cobrado · a los profesionales ${ars(V.cobrado - V.fee)}</div></div>
            <div class="k ${nuestra ? "acc" : ""}"><div class="l">Devuelto</div><div class="v num">${ars(V.reintegrado)}</div><div class="s">${nuestra ? `${ars(nuestra)} por falla nuestra` : "nada por falla nuestra"}${V.enCurso ? ` · ${ars(V.enCurso)} en curso` : ""}</div></div>
          </div>
          ${causas.length ? `<div style="margin-top:10px"><div class="mini" style="font-weight:600;color:var(--ink)">Devoluciones por causa</div>${barrasH(causas.map((c) => ({ ...c, n: c.monto, color: c.lab.includes("profesional") ? "var(--adv)" : "var(--neutro)" })), V.reintegrado, { fmtV: ars })}</div>` : `<p class="cero" style="margin-top:10px">Sin devoluciones en el período.</p>`}
        </div>
      </div>
      <div class="preguntas">
        ${preg("q3a", "¿Qué consultas pagas no sostuvo el profesional, y quién repite?", `${nn(noSost.length, "vez", "veces")}<span class="sub">${fmt(reinc)} con más de una</span>`, () => tabla("t-nosost", [
          colFecha, { k: "medico", t: "Profesional" }, { k: "tipo", t: "Tipo", tipo: "sel", texto: (r) => (r.tipo === "ci" ? "CI" : "Turno") }, colPac, { k: "reintegrado", t: "Devuelto", tipo: "num", texto: (r) => ars(r.reintegrado) }, { k: "estado", t: "Estado", texto: (r) => ESTADO_LAB[r.estado] ?? r.estado },
          { k: "veces", t: "Veces en el período", tipo: "num", sortVal: (r) => noSost.filter((x) => x.medicoId === r.medicoId).length, texto: (r) => fmt(noSost.filter((x) => x.medicoId === r.medicoId).length) },
        ], noSost, { ord: "fecha", fila: filaAt, vacio: "Cero: ningún profesional dejó caer una consulta paga en el período." }))}
        ${preg("q3e", "¿Cuáles fueron las devoluciones, una por una?", `${ars(V.reintegrado)}<span class="sub">${ars(nuestra)} por falla nuestra</span>`, () => tabla("t-devol", [
          colFecha, { k: "medico", t: "Profesional" }, colPac, { k: "reintegrado", t: "Devuelto", tipo: "num", texto: (r) => ars(r.reintegrado) }, { k: "causa", t: "Causa", tipo: "sel", texto: (r) => motivoDe(r) }, { k: "falla", t: "De quién", tipo: "sel", texto: (r) => (r.desenlace === "medico_se_fue" ? "Falla nuestra" : r.desenlace === "paciente_se_fue" ? "Del paciente" : "Sin registro") },
        ], devol, { ord: "fecha", fila: filaAt, vacio: "Cero devoluciones en el período." }))}
        ${preg("q3h", "¿De quién depende Docto, y qué pasa si se va?", conc.length ? `${esc(top3.map((t) => t.nombre.split(" ")[0]).join(", "))}<span class="sub">${fmt(shareC * 100)}% del cobrado</span>` : "—", () => `<p class="esc">${top3.length ? `<b>${nn(top3.length, "profesional concentra", "profesionales concentran")} el ${fmt(shareC * 100)}% de lo cobrado</b>, el ${fmt(shareA * 100)}% de las atendidas y el ${fmt(shareH * 100)}% de las horas de CI del período. Si el primero (${esc(top3[0].nombre)}, ${ars(top3[0].cobrado)}) dejara de atender, el cobrado del período bajaría a ${ars(V.cobrado - top3[0].cobrado)} y el fee a ${ars(V.fee - suma(pag.filter((a) => a.medicoId === top3[0].id), "fee"))}.` : "Sin cobros en el período."}</p>` + tabla("t-conc", [
          { k: "nombre", t: "Profesional" }, { k: "n", t: "Consultas cobradas", tipo: "num" }, { k: "cobrado", t: "Cobrado", tipo: "num", render: (r) => `<span class="mbar" style="width:${(r.cobrado / Math.max(conc[0]?.cobrado ?? 1, 1)) * 60}px"></span>${ars(r.cobrado)}` }, { k: "share", t: "Del total", tipo: "num", sortVal: (r) => r.cobrado / Math.max(V.cobrado, 1), texto: (r) => pct(r.cobrado, V.cobrado) }, { k: "hci", t: "Horas CI", tipo: "num", texto: (r) => fmt(r.hci) },
        ], conc, { ord: "cobrado", buscar: false, fila: (r) => ({ tipo: "medico", id: r.id }) }))}
        ${preg("q3g", "¿Los avisos al profesional le llegaron al teléfono?", avisosMed.length ? `${fmt(avisosMed.filter((a) => a.entrega === "delivered" || a.entrega === "read").length)} de ${fmt(avisosMed.length)} entregados<span class="sub">desde el 31/08</span>` : `${fmt(avisos.length)} enviados<span class="sub">entrega sin registro antes del 31/08</span>`, () => `<p class="nota">"Enviado" significa que el proveedor lo aceptó; la entrega se guarda desde el 31/08.</p>` + tabla("t-avisos", [
          colFecha, colHora, { k: "medico", t: "Profesional", texto: (r) => MED.get(r.medicoId)?.nombre ?? "—" }, { k: "disparador", t: "Motivo", tipo: "sel", texto: (r) => r.disparador ?? "—" }, { k: "resultado", t: "Envío", tipo: "sel", texto: (r) => r.resultado ?? "—" }, { k: "entrega", t: "Entrega", tipo: "sel", texto: (r) => entregaLab(r.entrega, r.fecha) },
        ], avisos, { ord: "fecha", fila: (r) => ({ tipo: "medico", id: r.medicoId }) }), { nomide: !avisosMed.length })}
        ${preg("q3i", "¿Hay profesionales con deuda con Docto, o que hoy no pueden cobrar?", `${fmt(deuda.length)} con deuda · ${fmt(mpVenc.length)} con Mercado Pago vencido<span class="sub">${fmt(mpNo.length)} aprobados sin Mercado Pago</span>`, () => `<div class="kv"><div class="k"><div class="l">Deuda con Docto</div><div class="v num">${deuda.length ? ars(suma(deuda, (d) => d.monto - d.recuperado)) : "cero"}</div><div class="s">${deuda.length ? `${deuda.length} profesionales` : "ningún profesional debe nada"}</div></div><div class="k"><div class="l">Mercado Pago vencido</div><div class="v num">${fmt(mpVenc.length)}</div><div class="s">${mpVenc.length ? "figuran activos pero no cobran" : "la renovación automática está al día"}</div></div><div class="k"><div class="l">Sin Mercado Pago</div><div class="v num">${fmt(mpNo.length)}</div><div class="s">aprobados que no pueden publicarse hasta conectarlo</div></div></div>` + (mpNo.length ? tabla("t-mpno", [{ k: "nombre", t: "Profesional" }, { k: "especialidad", t: "Especialidad", tipo: "sel" }, { k: "faltantes", t: "Le falta", texto: (r) => r.faltantes.join(", ") }, { k: "aprobado", t: "Aprobado el", texto: (r) => (r.aprobado ? fechaLab(r.aprobado) : "—"), sortVal: (r) => r.aprobado ?? "" }], mpNo, { ord: "aprobado", fila: (r) => ({ tipo: "medico", id: r.id }) }) : ""))}
      </div>
    </section>`;
  }

  /* ───────────────────────── 4 · CAMPAÑA Y PATRONES ───────────────────────── */
  function seccion4(V) {
    const A = accionesAhora();
    const ap = aprobados();
    const ult30 = sumaDias(HOY, -30);
    const bus30 = D.busquedas.filter((b) => b.fecha >= ult30);
    const provSin = cnt(bus30.filter((b) => !b.matchHabia && b.provincia), "provincia").map(([p, n]) => ({ p, n, meds: ap.filter((m) => m.provincias.includes(p)).length })).slice(0, 8);
    const repet = cnt(bus30.filter((b) => b.paciente), "paciente").filter(([k, n]) => n >= 2 && !bus30.some((b) => b.paciente === k && (b.pago || b.seAtendio))).slice(0, 8);
    // campaña: primero quien ya prendió alguna vez (reactivar es más barato), después por demanda perdida en su provincia
    const perdidaProv = (m) => bus30.filter((b) => b.provincia && !b.matchHabia && m.provincias.includes(b.provincia)).length;
    const campania = [...A.listosSinOferta].sort((a, b) => (b.ultimoOnline ? 1 : 0) - (a.ultimoOnline ? 1 : 0) || (b.ultimoOnline ?? "").localeCompare(a.ultimoOnline ?? "") || perdidaProv(b) - perdidaProv(a));
    const mostrar = S.verCampania ? campania : campania.slice(0, 6);
    const msgs30 = (m) => D.mensajes.filter((x) => x.medicoId === m.id && x.fecha >= ult30);
    // escenario en la unidad del resultado (Tomás): las búsquedas con profesionales y nadie en línea, pagando como las que sí encontraron a alguien
    const extra = V.convServida != null ? Math.round(V.busSinLinea * (V.convServida / 100)) : null;
    // cobertura de la franja 9–13 de lunes a viernes para CABA/BA
    const capba = ap.filter((m) => m.provincias.some((p) => p === "CABA" || p === "Buenos Aires"));
    const capbaIds = new Set(capba.map((m) => m.id));
    const diasPer = diasDelPeriodo(S.per, HOY);
    const habiles = diasPer.filter((f) => { const d = new Date(f + "T12:00:00Z").getUTCDay(); return d >= 1 && d <= 5; });
    const cel = new Set(V.ci.filter((c) => capbaIds.has(c.medicoId) && c.hora >= 9 && c.hora <= 12 && c.horas > 0).map((c) => c.fecha + "|" + c.hora));
    const franjaCob = habiles.length ? (cel.size / (habiles.length * 4)) * 100 : null;
    const prendidosSinPedidos = ap.map((m) => ({ m, h: suma(V.ci.filter((c) => c.medicoId === m.id), "horas"), ped: V.at.filter((a) => a.medicoId === m.id).length })).filter((x) => x.h >= 20 && x.ped === 0);
    return `<section class="sec" id="s4">
      <div class="sec-h"><span class="n">4</span><h2>¿A quién activo y dónde recluto?</h2><span class="sub">sin plazo</span></div>
      <div class="acciones">
        <div class="card">
          <div class="card-h"><h3 title="Perfil completo, sin CI ni agenda. Primero quien ya la prendió alguna vez; después, por búsquedas sin nadie en su provincia. Máximo dos avisos documentados antes de una baja.">Campaña de activación</h3><span class="r">${fmt(campania.length)} con perfil completo, sin CI ni agenda</span></div>
          <ul class="pipe">${mostrar.map((m) => `<li><div><button data-act="ficha" data-tipo="medico" data-id="${esc(m.id)}">${esc(m.nombre)}</button> <span class="m">${esc(m.especialidad)} · ${esc(m.provincias.join(", ") || "sin provincia")}</span><div class="m">${m.ultimoOnline ? `última CI ${fechaLab(m.ultimoOnline)}` : "nunca prendió la CI"} · ${msgs30(m).length ? `${nn(msgs30(m).length, "mensaje", "mensajes")} de Docto en 30 días, ${msgs30(m).filter((x) => x.leido).length} ${msgs30(m).filter((x) => x.leido).length === 1 ? "leído" : "leídos"}` : "sin mensajes en 30 días"}</div></div><span class="arg num" title="Búsquedas sin nadie en sus provincias, 30 días">${perdidaProv(m) ? `${nn(perdidaProv(m), "búsqueda sin nadie", "búsquedas sin nadie")} en sus provincias` : ""}</span></li>`).join("") || `<li><span class="cero">Nadie: todos los perfiles completos publican CI o agenda.</span></li>`}</ul>
          ${campania.length > 6 ? `<button data-act="verCampania" style="color:var(--brand-hover);font-size:12px;margin-top:8px">${S.verCampania ? "Ver menos" : `Ver los ${fmt(campania.length)}`}</button>` : ""}
        </div>
        <div class="card">
          <div class="card-h"><h3>Dónde recluto y quién volvió a buscar</h3><span class="r">últimos 30 días</span></div>
          <div class="mini" style="font-weight:600;color:var(--ink)">Provincias con búsquedas y sin nadie</div>
          ${provSin.length ? barrasH(provSin.map((x) => ({ key: x.p, lab: `${x.p} · ${x.meds ? `${x.meds} habilitados: prender` : "0 habilitados: reclutar"}`, n: x.n, color: x.meds ? "var(--aten)" : "var(--adv)" })), null, { onKey: { act: "filtro", k: "prov" } }) : `<p class="cero">Ninguna.</p>`}
          <div class="mini" style="font-weight:600;color:var(--ink);margin-top:12px">Pacientes que buscaron dos o más veces sin pagar ninguna</div>
          ${repet.length ? `<ul class="acc-sub">${repet.map(([k, n]) => `<li><button data-act="ficha" data-tipo="paciente" data-id="${esc(k)}">${esc(pacLab(k))}</button><span class="m">${n} búsquedas</span></li>`).join("")}</ul>` : `<p class="cero">Ninguno.</p>`}
          ${V.busSinProvN ? `<div class="nota hueco" style="margin-top:12px">${fmt(V.busSinProvN)} búsquedas del período sin provincia cargada: a esos pacientes no se les puede mostrar oferta. Pedir la provincia en el registro resuelve el match.</div>` : ""}
        </div>
        <div class="card">
          <div class="card-h"><h3>Qué cambiaría más</h3><span class="r">escenario y patrones</span></div>
          <p class="esc">${extra != null && V.busSinLinea ? `<b>+${nn(extra, "pago", "pagos")}</b> si las ${fmt(V.busSinLinea)} búsquedas con profesionales y ninguno en línea hubieran encontrado a alguien, pagando como las demás (${fmt(V.busPago)} de ${fmt(V.busConAlguienN)})${V.busPago ? ` · +${fmt((extra / V.busPago) * 100)}%` : ""}.` : "Sin búsquedas sin nadie en línea en el período."}</p>
          <p class="esc" style="margin-top:8px">Lunes a viernes de 9 a 13, CABA y Bs. As.: alguien en línea el <b>${franjaCob == null ? "—" : fmt(franjaCob) + "%"}</b> de las horas${capba.length ? ` · ${nn(capba.length, "profesional habilitado", "profesionales habilitados")}` : ""}.</p>
          <div style="margin-top:12px">
            <div class="patron"><span class="ic"></span><span><b>Más de 20 h de CI sin pedidos.</b> ${prendidosSinPedidos.length ? `${nn(prendidosSinPedidos.length, "profesional", "profesionales")}. A ${fmt(V.pedidosCI && V.dias.oferta ? V.pedidosCI / V.dias.oferta : 0, 1)} pedidos por día, la causa probable es el horario o la provincia (sin confirmar). <button data-act="verPrendidos" style="color:var(--brand-hover)">${S.verPrendidos ? "ocultar" : "ver quiénes"}</button>${S.verPrendidos ? `<ul class="acc-sub">${prendidosSinPedidos.map((x) => `<li><button data-act="ficha" data-tipo="medico" data-id="${esc(x.m.id)}">${esc(x.m.nombre)}</button><span class="m">${fmt(x.h)} h · ${esc(x.m.provincias.join(", "))}</span></li>`).join("")}</ul>` : ""}` : "Ninguno en el período."}</span></div>
            <div class="patron"><span class="ic"></span><span><b>La oferta se concentra.</b> ${fmt(capba.length)} de ${fmt(ap.length)} aprobados cubren CABA o Buenos Aires; las búsquedas sin nadie de otras provincias no se resuelven con más de lo mismo.</span></div>
            <div class="patron"><span class="ic"></span><span><b>Lo que Docto envió.</b> ${nn(D.avisos.filter((a) => a.fecha >= ult30).length, "aviso", "avisos")} por WhatsApp y ${nn(D.mensajes.filter((m) => m.fecha >= ult30).length, "mensaje automático", "mensajes automáticos")} en 30 días, ${fmt(D.mensajes.filter((m) => m.fecha >= ult30 && m.leido).length)} leídos. Qué pasó después, en cada ficha.</span></div>
          </div>
        </div>
      </div>
    </section>`;
  }

  /* ───────────────────────── lo que todavía no se mide ───────────────────────── */
  function noSeMide(V) {
    const atend = V.at.filter((a) => a.desenlace === "atendida");
    return `<section class="nomide">
      <h3>Lo que todavía no se mide</h3>
      <ul>
        <li><b>De dónde vienen los pacientes.</b> <span class="q">Hace falta: origen en el registro.</span></li>
        <li><b>Qué buscaban.</b> Queda solo la especialidad del elegido. <span class="q">Hace falta: evento de búsqueda.</span></li>
        <li><b>Espera y duración.</b> Sin cierre en ${fmt(atend.filter((a) => !a.minDuracion).length)} de ${fmt(atend.length)} atendidas. <span class="q">Hace falta: entrada a la sala.</span></li>
        <li><b>Conformidad del paciente.</b> ${fmt(cnt(V.consultas.filter((a) => a.paciente), "paciente").filter(([, n]) => n >= 2).length)} repitieron. <span class="q">Hace falta: un toque al cerrar.</span></li>
        <li><b>Por qué un aceptado no pagó.</b> <span class="q">Hace falta: el detalle del rechazo del pago.</span></li>
        <li><b>Entrega de avisos antes del 31/08.</b> <span class="q">Solo lo sabe Twilio.</span></li>
      </ul>
    </section>`;
  }

  /* ───────────────────────── ficha de la atención ───────────────────────── */
  function fichaAtencion(id) {
    const a = D.atenciones.find((x) => x.id === id); if (!a) return "<div class='pb'>No encontrada.</div>";
    const m = MED.get(a.medicoId); const p = a.paciente ? PAC.get(a.paciente) : null;
    const todasM = D.atenciones.filter((x) => x.medicoId === a.medicoId); const ciM = todasM.filter((x) => x.tipo === "ci");
    const busP = a.paciente ? D.busquedas.filter((b) => b.paciente === a.paciente) : [];
    const bus = busP.find((b) => (b.atenciones ?? []).includes(a.id)) ?? null;
    const avisos = D.avisos.filter((x) => x.medicoId === a.medicoId && x.fecha === a.fecha);
    const despues = a.paciente ? D.atenciones.filter((x) => x.paciente === a.paciente && x.id !== a.id && (x.fecha > a.fecha || (x.fecha === a.fecha && x.hora * 60 + (x.min || 0) > a.hora * 60 + (a.min || 0)))).sort((x, y) => x.fecha.localeCompare(y.fecha)) : [];
    const hh = (min) => { if (min == null) return null; const t = a.hora * 60 + (a.min || 0) + min; return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(Math.round(t % 60)).padStart(2, "0")}`; };
    const paso = (cls, k, v) => `<li><span class="b ${cls}"></span><span class="k">${k}</span><span>${esc(v)}</span></li>`;
    const busqueda = bus ? paso("", "Búsqueda", `a las ${hm(bus)} · ${bus.vistas} vistas de la clínica · vio ${fmt(bus.medicosProv)} profesionales para su provincia y ${fmt(bus.ciOnline)} en línea${bus.fotoExacta ? "" : " (reconstruido°)"}`) : paso("nd", "Búsqueda", a.tipo === "ci" ? "sin sesión de búsqueda asociada (anterior al 22/06, o entró por el link del profesional)" : "sin sesión de búsqueda asociada");
    const eleccion = bus && bus.eligio ? paso("", "Elección", `${bus.modo === "turno" ? "turno" : "consulta inmediata"}${bus.triage ? ` · triaje: ${bus.triage}` : ""}${bus.bloqueo ? ` · bloqueo: ${bus.bloqueo}` : ""}`) : "";
    const aceptacion = a.tipo === "turno" ? paso("", "Aceptación", "la agenda publicada es la aceptación; el turno se toma al pagar")
      : !a.aceptada ? paso("no", "Aceptación", `nadie la aceptó${a.causa === "sin_respuesta_plazo" ? " · venció el plazo de 10 min" : ""}`)
      : a.origen === "hito" ? paso("", "Aceptación", `${m?.nombre ?? "—"} la aceptó${a.minAceptar != null ? ` a las ${hh(a.minAceptar)} · tardó ${minutos(a.minAceptar)}` : ""}`)
      : paso("nd", "Aceptación", `aceptada, deducida° del pago o de la sala (anterior al 20/08, sin hora registrada)`);
    const pago = a.pagada ? paso("", "Pago", `${ars(a.cobrado || a.reintegrado)} aprobado por Mercado Pago${a.fee ? ` · fee Docto ${ars(a.fee)}` : ""}${a.reintegrado ? ` · devuelto ${ars(a.reintegrado)}` : ""}${a.reintegroEnCurso ? ` · devolución en curso ${ars(a.reintegroEnCurso)}` : ""}`) : a.estado === "reservando" ? paso("pend", "Pago", "pendiente de pago") : paso("no", "Pago", "sin pago");
    const atencion = a.desenlace === "atendida" ? paso("", "Atención", `atendida${a.tipo === "ci" && a.minEspera != null ? ` · pago ${hh(a.minEspera)}` : ""}${a.minDuracion ? ` · cierre ${minutos(a.minDuracion)} después` : " · cierre sin registro"} · entrada a la sala sin registro`)
      : a.desenlace === "en_progreso" ? paso("pend", "Atención", ESTADO_LAB[a.estado] ?? a.estado)
      : a.desenlace === "medico_se_fue" ? paso("no", "Atención", "el profesional no la sostuvo") : a.desenlace === "paciente_se_fue" ? paso("no", "Atención", "el paciente no llegó") : paso("no", "Atención", "no ocurrió");
    const cierre = paso(["atendida", "en_progreso"].includes(a.desenlace) ? "" : "no", "Cierre", `${DES[a.desenlace]?.[0] ?? a.desenlace}${a.causa ? ` · ${motivoDe(a)}` : ""}${a.resueltaPor ? ` · lo cerró ${a.resueltaPor === "sistema" ? "el sistema" : a.resueltaPor === "admin" ? "Docto" : "el " + a.resueltaPor}` : a.desenlace === "sin_datos" ? " · sin registro de quién" : ""}`);
    const docs = paso(a.documentos.length ? "" : "nd", "Documentos", a.documentos.length ? [...new Set(a.documentos)].join(", ") : "ninguno");
    const avs = paso(avisos.length ? "" : "nd", "Avisos al profesional", avisos.length ? avisos.map((x) => `${hm(x)} ${x.disparador ?? "aviso"} · ${entregaLab(x.entrega, x.fecha)}`).join(" · ") : "ninguno registrado ese día");
    const desp = paso(despues.length ? "" : "nd", "Después", despues.length ? `el paciente volvió: ${despues.map((x) => `${fechaLab(x.fecha)} ${x.tipo === "ci" ? "CI" : "turno"} con ${x.medico} (${DES[x.desenlace]?.[0] ?? x.desenlace})`).join("; ")}` : "no volvió a pedir hasta hoy");
    return `<div class="pb">
      <div class="fh"><div><h2>${a.tipo === "ci" ? "Consulta inmediata" : "Turno"} · ${new Date(a.fecha + "T12:00:00Z").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} ${hm(a)}</h2>
        <div class="meta">${esc(a.especialidad)} · ${a.canal === "consultorio" ? "por el link propio del profesional" : "por la clínica de Docto"}</div>
        <div class="tags"><span class="est ${DES[a.desenlace]?.[1] ?? "neutro"}">${esc(DES[a.desenlace]?.[0] ?? a.desenlace)}${a.origen === "inferido" && a.tipo === "ci" ? "°" : ""}</span><span class="est neutro">${esc(NIVEL(a.nivel))}</span><span class="est neutro">${esc(ESTADO_LAB[a.estado] ?? a.estado)}</span></div></div>
        <div><button data-act="filtro" data-k="medico" data-v="${esc(a.medicoId)}">Filtrar el tablero por este profesional</button></div></div>
      <div class="quien">
        <div class="q"><h4><button data-act="ficha" data-tipo="medico" data-id="${esc(a.medicoId)}">${esc(m?.nombre ?? a.medico)} →</button></h4><p>${esc(m?.especialidad ?? a.especialidad)} · ${esc((m?.provincias ?? []).join(", ") || "sin provincia")}${m?.categoria ? ` · ${m.categoria === "founder" ? "fundador" : "tradicional"}` : ""}</p><p>${m?.aprobado ? `aprobado el ${fechaLab(m.aprobado)} ${m.aprobado.slice(0, 4)}` : "sin fecha de aprobación"} · ${m?.disponible ? "en línea ahora" : "no está en línea"}</p><p>historia: ${fmt(todasM.filter((x) => x.nivel === "consulta").length)} consultas, ${fmt(todasM.filter((x) => x.desenlace === "atendida").length)} atendidas, ${ciM.length ? `aceptó ${pct(ciM.filter((x) => x.aceptada).length, ciM.length)} de ${ciM.length} pedidos` : "sin pedidos de CI"}, ${fmt(todasM.filter((x) => x.desenlace === "medico_se_fue").length)} no sostuvo</p></div>
        <div class="q"><h4>${a.paciente ? `<button data-act="ficha" data-tipo="paciente" data-id="${esc(a.paciente)}">${esc(pacLab(a.paciente))} →</button>` : "Paciente sin registro"}</h4>${p ? `<p>alta el ${fechaLab(p.alta)} ${p.alta.slice(0, 4)} · ${p.provincia ? esc(p.provincia) : "sin provincia cargada"}</p><p>historia: ${nn(busP.length, "búsqueda", "búsquedas")} (${fmt(busP.filter((b) => b.provincia && !b.matchHabia).length)} sin nadie), ${nn(D.atenciones.filter((x) => x.paciente === a.paciente).length, "pedido", "pedidos")}, ${nn(p.consultas, "consulta", "consultas")}</p>` : ""}</div>
      </div>
      <div class="fsec"><h3>Cómo y cuándo</h3><ul class="pasos">${busqueda}${eleccion}${paso("", "Pedido", `${a.tipo === "ci" ? "pidió" : "reservó"} el ${fechaLab(a.fecha)} a las ${hm(a)}${a.reservadoEl && a.reservadoEl !== a.fecha ? ` · reservado el ${fechaLab(a.reservadoEl)}` : ""}`)}${avs}${aceptacion}${pago}${atencion}${cierre}${docs}${desp}</ul>
        <p class="nota">° = deducido.</p></div>
    </div>`;
  }

  /* ───────────────────────── render ───────────────────────── */
  function render() {
    const V = V_(S.per);
    renderCab();
    byId("app").innerHTML = seccionHoy() + seccion1(V) + seccion2(V) + seccion3(V) + seccion4(V) + noSeMide(V) + `<p class="cierre">Un hueco declarado es información; uno tapado es una mentira que se lee bien. · Datos al ${fechaLab(HOY)} · cuentas de prueba excluidas.</p>`;
    renderFicha();
  }

  /* ───────────────────────── tablas (tipo Excel) ───────────────────────── */
  const TAB = {};
  function tabla(id, cols, rows, opts = {}) {
    TAB[id] = { cols, rows, opts };
    const st = (S.tablas[id] ??= { q: "", f: {}, ord: opts.ord ?? null, dir: opts.dir ?? -1, max: opts.max ?? 25 });
    const val = (r, c) => (c.sortVal ? c.sortVal(r) : r[c.k]);
    const txt = (r, c) => (c.texto ? c.texto(r) : String(val(r, c) ?? ""));
    let out = rows;
    if (st.q) { const q = st.q.toLowerCase(); out = out.filter((r) => cols.some((c) => txt(r, c).toLowerCase().includes(q))); }
    for (const c of cols) { const fv = st.f[c.k]; if (!fv) continue; const q = fv.toLowerCase(); out = out.filter((r) => (c.tipo === "sel" ? txt(r, c) === fv : txt(r, c).toLowerCase().includes(q))); }
    if (st.ord) { const c = cols.find((x) => x.k === st.ord); if (c) out = [...out].sort((a, b) => { const va = val(a, c), vb = val(b, c); if (va == null) return 1; if (vb == null) return -1; return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "es")) * st.dir; }); }
    const vis = out.slice(0, st.max);
    const th = cols.map((c) => `<th class="${c.tipo === "num" ? "num" : ""}"><button data-ts="${id}" data-k="${c.k}">${esc(c.t)}${st.ord === c.k ? (st.dir > 0 ? " ↑" : " ↓") : ""}</button></th>`).join("");
    const tf = cols.map((c) => {
      if (c.tipo === "sel") { const vals = [...new Set(rows.map((r) => txt(r, c)))].filter(Boolean).sort((a, b) => a.localeCompare(b, "es")); return `<th><select data-tf="${id}" data-k="${c.k}"><option value="">Todos</option>${vals.map((v) => `<option value="${esc(v)}" ${st.f[c.k] === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></th>`; }
      if (c.sinFiltro) return "<th></th>";
      return `<th><input data-tf="${id}" data-k="${c.k}" value="${esc(st.f[c.k] ?? "")}" placeholder="filtrar"></th>`;
    }).join("");
    const tr = vis.map((r) => {
      const clk = opts.fila ? opts.fila(r) : null;
      const tds = cols.map((c, i) => `<td class="${c.tipo === "num" ? "num" : ""}">${i === 0 && clk ? `${clk.mas ? `<button class="acc" title="Filtrar el tablero por esta fila" data-act="${clk.mas.act}" data-k="${clk.mas.k}" data-v="${esc(clk.mas.v)}">+</button>` : ""}` : ""}${c.render ? c.render(r) : esc(txt(r, c))}${i === 0 && clk ? `<span class="mas">Ver ficha →</span>` : ""}</td>`).join("");
      return `<tr class="${clk ? "clk" : ""}" ${clk ? `data-act="ficha" data-tipo="${clk.tipo}" data-id="${esc(clk.id)}"` : ""}>${tds}</tr>`;
    }).join("");
    return `<div class="tabla" id="${id}">
      <div class="tb-top">${opts.buscar === false ? "<span></span>" : `<input data-tq="${id}" value="${esc(st.q)}" placeholder="Buscar en la tabla…">`}<span class="cnt">${out.length === rows.length ? nn(rows.length, "fila", "filas") : `${fmt(out.length)} de ${fmt(rows.length)} filas`}</span></div>
      <div class="scroll"><table><thead><tr>${th}</tr><tr class="f">${tf}</tr></thead><tbody>${tr || `<tr><td colspan="${cols.length}" class="vacio">${esc(opts.vacio ?? "Sin filas para este período y estos filtros.")}</td></tr>`}</tbody></table></div>
      ${out.length > st.max ? `<div class="tb-foot"><span>Mostrando ${st.max} de ${fmt(out.length)}</span><button data-tmas="${id}">Mostrar más</button></div>` : ""}
    </div>`;
  }
  function refrescarTabla(id, foco) {
    const t = TAB[id]; if (!t) return;
    const viejo = byId(id); if (!viejo) return;
    const tmp = document.createElement("div"); tmp.innerHTML = tabla(id, t.cols, t.rows, t.opts);
    viejo.replaceWith(tmp.firstElementChild);
    if (foco) { const el = root.querySelector(foco); if (el) { el.focus(); if (el.setSelectionRange) { const n = el.value.length; el.setSelectionRange(n, n); } } }
  }

  /* ───────────────────────── gráficos ───────────────────────── */
  function lineChart(buckets, { fmtV = fmt, alto = 190, id = "lc" } = {}) {
    const W = 700, H = alto, pl = 40, pr = 14, pt = 14, pb = 26;
    const xs = buckets.map((_, i) => pl + (i * (W - pl - pr)) / Math.max(buckets.length - 1, 1));
    const max = Math.max(...buckets.map((b) => (b.cub ? b.v : 0)), 1);
    const nice = (m) => { const p = Math.pow(10, Math.floor(Math.log10(m))); const r = m / p; const s = r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10; return s * p; };
    const top = nice(max); const ticks = [0, top / 2, top];
    const y = (v) => pt + (H - pt - pb) * (1 - v / top);
    const pts = buckets.map((b, i) => (b.cub ? `${xs[i]},${y(b.v)}` : null));
    let path = "", seg = [];
    for (let i = 0; i < pts.length; i++) { if (pts[i]) seg.push(pts[i]); if (!pts[i] || i === pts.length - 1) { if (seg.length) path += "M" + seg.join(" L") + " "; seg = []; } }
    const primerCub = buckets.findIndex((b) => b.cub), ultCub = buckets.length - 1 - [...buckets].reverse().findIndex((b) => b.cub);
    const area = primerCub >= 0 ? `M${xs[primerCub]},${y(0)} ` + buckets.map((b, i) => (b.cub ? `L${xs[i]},${y(b.v)}` : "")).join(" ") + ` L${xs[ultCub]},${y(0)} Z` : "";
    const grid = ticks.map((t) => `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line-soft)" stroke-width="1"/><text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end" font-size="10" fill="var(--ink-faint)">${fmtV(t)}</text>`).join("");
    const paso = buckets.length > 14 ? Math.ceil(buckets.length / 15) : 1;
    const xl = buckets.map((b, i) => (i % paso === 0 || i === buckets.length - 1 ? `<text x="${xs[i]}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${b.sel ? "var(--ink)" : "var(--ink-faint)"}" font-weight="${b.sel ? 600 : 400}">${esc(b.lab)}</text>` : "")).join("");
    const dots = buckets.map((b, i) => b.cub
      ? `<circle class="pt" data-lc="${id}" data-i="${i}" data-act="bucket" data-tipo="${b.tipo}" data-desde="${b.desde}" data-hasta="${b.hasta}" data-v="${esc(b.mes)}" cx="${xs[i]}" cy="${y(b.v)}" r="${b.sel ? 5 : 4}" fill="${b.sel ? "var(--brand)" : "#fff"}" stroke="var(--brand)" stroke-width="2"><title>${esc(b.titulo)}</title></circle>`
      : `<circle cx="${xs[i]}" cy="${y(0)}" r="4" fill="#fff" stroke="var(--deducido)" stroke-width="1.5" stroke-dasharray="2 2"><title>${esc(b.lab)}: sin medición</title></circle>`).join("");
    const hit = buckets.map((b, i) => `<rect data-lc="${id}" data-i="${i}" x="${xs[i] - (W - pl - pr) / Math.max(buckets.length - 1, 1) / 2}" y="${pt}" width="${(W - pl - pr) / Math.max(buckets.length - 1, 1)}" height="${H - pt - pb}" fill="transparent"/>`).join("");
    const hoyLine = buckets[ultCub]?.parcial ? `<line x1="${xs[ultCub]}" x2="${xs[ultCub]}" y1="${pt}" y2="${y(0)}" stroke="var(--brand-line)" stroke-dasharray="3 3"/>` : "";
    LC[id] = buckets;
    return `<div class="chart" data-chart="${id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución">${grid}<path d="${area}" fill="var(--brand)" fill-opacity=".08"/><path d="${path}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${hoyLine}${hit}${dots}${xl}</svg></div>`;
  }
  function barrasH(items, total, { onKey, sel, fmtV = fmt, ded = false } = {}) {
    const max = Math.max(...items.map((i) => i.n), 1);
    return `<div class="barras">${items.map((i) => `<div class="barra ${sel && sel === i.key ? "on" : ""}"><button class="lab" ${onKey ? `data-act="${onKey.act}" data-k="${onKey.k}" data-v="${esc(i.key)}"` : ""} title="${esc(i.lab)}">${i.color ? `<i class="lista-sw" style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${i.color};margin-right:6px;vertical-align:-1px"></i>` : ""}${esc(i.lab)}</button><div class="tr"><div class="fi ${i.ded ? "ded" : ""}" style="width:${(i.n / max) * 100}%;${i.color ? `background:${i.color}` : ""}"></div></div><div class="v num"><b>${fmtV(i.n)}</b>${total ? ` · ${pct(i.n, total)}` : ""}${i.extra ? ` <span class="mini">${esc(i.extra)}</span>` : ""}</div></div>`).join("")}</div>`;
  }
  function h24(vals, { cls = "", fmtV = fmt, titulo = "" } = {}) {
    const max = Math.max(...vals, 1);
    return `<div class="h24" title="${esc(titulo)}">${vals.map((v, h) => `<div class="${v ? cls : "mudo"}" style="height:${Math.max((v / max) * 100, v ? 4 : 2)}%" data-tt="${esc(horaLab(h) + " · " + fmtV(v))}"></div>`).join("")}</div><div class="h24l">${vals.map((_, h) => (h % 3 === 0 ? `<span>${h}</span>` : "<span></span>")).join("")}</div>`;
  }

  function fichaMedico(id) {
    const m = MED.get(id); if (!m) return "<div class='pb'>No encontrado.</div>";
    const enF = S.fichaTodo ? () => true : (f) => enPer(S.per, f);
    const at = D.atenciones.filter((a) => a.medicoId === id && enF(a.fecha));
    const ci = at.filter((a) => a.tipo === "ci"); const cons = at.filter((a) => a.nivel === "consulta");
    const hci = D.ciHoras.filter((c) => c.medicoId === id && enF(c.fecha)); const slots = D.slots.filter((s) => s.medicoId === id && enF(s.fecha));
    const ap = aprobados(); const consDe = (mid) => D.atenciones.filter((a) => a.nivel === "consulta" && enF(a.fecha) && a.medicoId === mid).length;
    const puesto = 1 + ap.filter((x) => x.id !== id && consDe(x.id) > cons.length).length; const conActividad = ap.filter((x) => consDe(x.id) > 0).length;
    const acept = ci.length ? ci.filter((a) => a.aceptada).length / ci.length : null;
    const avisos = D.avisos.filter((a) => a.medicoId === id && enF(a.fecha)); const msgs = D.mensajes.filter((x) => x.medicoId === id && enF(x.fecha));
    const aus = D.ausencias.filter((a) => a.medicoId === id); const deuda = D.deuda.filter((d) => d.medicoId === id && d.estado !== "saldada");
    const ciPorDia = new Map(); for (const c of hci) ciPorDia.set(c.fecha, (ciPorDia.get(c.fecha) || 0) + c.horas);
    const tl = [
      ...at.map((a) => ({ f: a.fecha, cls: a.desenlace === "atendida" ? "ok" : ["medico_se_fue", "sin_respuesta"].includes(a.desenlace) ? "adv" : a.tipo, t: `${a.tipo === "ci" ? "Consulta inmediata" : "Turno"} · ${DES[a.desenlace]?.[0] ?? a.desenlace}${a.origen === "inferido" && a.tipo === "ci" ? "°" : ""}${a.cobrado ? ` · ${ars(a.cobrado)}` : a.reintegrado ? ` · devuelto ${ars(a.reintegrado)}` : ""}`, d: pacLab(a.paciente) })),
      ...[...ciPorDia.entries()].map(([f, h]) => ({ f, cls: "neutro", t: `CI prendida ${fmt(h, 1)} h`, d: "" })),
      ...avisos.map((a) => ({ f: a.fecha, cls: "aviso", t: `Aviso por WhatsApp · ${a.disparador ?? ""} · ${entregaLab(a.entrega, a.fecha)}`, d: "Docto" })),
      ...[...msgs.reduce((m, x) => { const k = x.fecha + "|" + x.titulo; const e = m.get(k) ?? { f: x.fecha, titulo: x.titulo, n: 0, leidos: 0 }; e.n++; if (x.leido) e.leidos++; m.set(k, e); return m; }, new Map()).values()].map((e) => ({ f: e.f, cls: "aviso", t: `Mensaje automático · ${e.titulo}${e.n > 1 ? ` ×${e.n}` : ""} · ${e.leidos ? `${e.leidos} leído${e.leidos > 1 ? "s" : ""}` : "sin leer"}`, d: "Docto" })),
      ...aus.map((a) => ({ f: a.fecha, cls: "adv", t: `Ausencia registrada · ${a.tipo}`, d: "Docto" })),
    ].sort((a, b) => b.f.localeCompare(a.f));
    const tag = (cls, t) => `<span class="est ${cls}">${esc(t)}</span>`;
    return `<div class="pb">
      <div class="fh"><div><h2>${esc(m.nombre)}</h2><div class="meta">${esc(m.especialidad)}${m.adicionales.length ? ` · también ${esc(m.adicionales.join(", "))}` : ""} · ${esc(m.provincias.join(", ") || "sin jurisdicción cargada")}${m.categoria ? ` · ${m.categoria === "founder" ? "fundador" : "tradicional"}` : ""}${m.aprobado ? ` · aprobado el ${fechaLab(m.aprobado)} ${m.aprobado.slice(0, 4)}` : ""}</div>
        <div class="tags">${m.disponible ? tag("ok", "En línea ahora") : tag("neutro", "No está en línea")}${m.faltantes.length ? tag("aten", `Le faltan ${m.faltantes.length}: ${m.faltantes.join(", ")}`) : tag("ok", "Perfil completo")}${tag(m.mp === "conectado" ? "ok" : m.mp === "expirado" ? "adv" : "neutro", m.mp === "conectado" ? "Mercado Pago conectado" : m.mp === "expirado" ? "Mercado Pago vencido" : "Sin Mercado Pago")}${m.agendasActivas ? tag("brand", nn(m.slotsFuturos, "lugar futuro", "lugares futuros")) : tag("neutro", "Sin agenda")}${m.identidad ? "" : tag("aten", "Identidad sin validar")}</div></div>
        <div><button data-act="fichaTodo">${S.fichaTodo ? "Ver el período elegido" : "Ver toda la ventana"}</button></div></div>
      <div class="kv"><div class="k"><div class="l">Consultas</div><div class="v num">${fmt(cons.length)}</div><div class="s">${fmt(cons.filter((a) => a.desenlace === "atendida").length)} atendidas</div></div><div class="k"><div class="l">Puesto</div><div class="v num">${cons.length ? `${puesto}.º <small>de ${fmt(ap.length)}</small>` : "—"}</div><div class="s">${conActividad} de ${fmt(ap.length)} aprobados tuvieron consultas en el período</div></div><div class="k"><div class="l">Aceptación</div><div class="v num">${acept == null ? "—" : fmt(acept * 100) + "%"}</div><div class="s">${fmt(ci.filter((a) => a.aceptada).length)} de ${fmt(ci.length)} pedidos de CI</div></div><div class="k ${ci.filter((a) => a.desenlace === "sin_respuesta").length || at.filter((a) => a.desenlace === "medico_se_fue").length ? "acc" : ""}"><div class="l">Sin respuesta · no sostuvo</div><div class="v num">${fmt(ci.filter((a) => a.desenlace === "sin_respuesta").length + at.filter((a) => a.desenlace === "medico_se_fue").length)}</div><div class="s">${fmt(ci.filter((a) => a.desenlace === "sin_respuesta").length)} sin responder · ${fmt(at.filter((a) => a.desenlace === "medico_se_fue").length)} no sostuvo</div></div></div>
      <div class="fsec"><h3>Actividad en el período<small>${S.fichaTodo ? "toda la ventana" : perCorto(S.per)}</small></h3>
        <dl class="dl"><dt>Pedidos de CI recibidos</dt><dd>${fmt(ci.length)} · aceptó ${fmt(ci.filter((a) => a.aceptada).length)} (${fmt(ci.filter((a) => a.origen === "hito").length)} registrados, ${fmt(ci.filter((a) => a.origen === "inferido").length)} deducidos°)</dd>
        <dt>Tiempo hasta aceptar</dt><dd>${ci.some((a) => a.minAceptar != null) ? `mediana ${minutos(mediana(ci.map((a) => a.minAceptar)))}` : "sin hito registrado"}</dd>
        <dt>Horas de CI ofrecidas</dt><dd>${fmt(suma(hci, "horas"))} h en ${ciPorDia.size} días${m.ultimoOnline ? ` · última vez ${fechaLab(m.ultimoOnline)}` : " · nunca la prendió"}</dd>
        <dt>Lugares de agenda</dt><dd>${fmt(suma(slots, "n"))} publicados · ${nn(at.filter((a) => a.tipo === "turno" && a.pagada).length, "turno pago", "turnos pagos")} · ${fmt(suma(slots.filter((s) => s.fecha < HOY), "libres"))} vencidos sin turno</dd>
        <dt>Plata</dt><dd>cobró ${ars(suma(at, "cobrado"))} · fee Docto ${ars(suma(at, "fee"))} · devuelto ${ars(suma(at, "reintegrado"))}</dd>
        <dt>Documentó</dt><dd>${fmt(at.filter((a) => a.desenlace === "atendida" && a.documentos.length).length)} de ${fmt(at.filter((a) => a.desenlace === "atendida").length)} atendidas</dd></dl></div>
      <div class="fsec"><h3>Contactos de Docto con este profesional</h3>
        <dl class="dl"><dt>Avisos por WhatsApp</dt><dd>${avisos.length ? `${fmt(avisos.length)} · ${fmt(avisos.filter((a) => a.entrega === "delivered" || a.entrega === "read").length)} con entrega confirmada` : "cero"}</dd><dt>Mensajes internos</dt><dd>${msgs.length ? `${fmt(msgs.length)} · ${fmt(msgs.filter((x) => x.leido).length)} leídos` : "cero"}</dd><dt>Ausencias registradas</dt><dd>${aus.length ? fmt(aus.length) : "cero"}</dd><dt>Deuda con Docto</dt><dd>${deuda.length ? ars(suma(deuda, (d) => d.monto - d.recuperado)) : "cero"}</dd><dt>Sanciones</dt><dd>cero · no hay régimen de sanciones todavía</dd></dl></div>
      <div class="fsec"><h3>Línea de tiempo<small>${nn(tl.length, "hecho", "hechos")} · ° = deducido</small></h3>${tl.length ? `<ul class="tl">${tl.slice(0, 80).map((e) => `<li class="${e.cls}"><span class="f">${fechaLab(e.f)}</span><span>${esc(e.t)}</span><span class="d">${esc(e.d)}</span></li>`).join("")}</ul>` : `<p class="cero">Nada registrado en el período.</p>`}</div>
    </div>`;
  }
  function fichaPaciente(key) {
    const p = PAC.get(key); if (!p) return "<div class='pb'>No encontrado.</div>";
    const enF = S.fichaTodo ? () => true : (f) => enPer(S.per, f);
    const at = D.atenciones.filter((a) => a.paciente === key && enF(a.fecha)).sort((a, b) => b.fecha.localeCompare(a.fecha)); const bus = D.busquedas.filter((b) => b.paciente === key && enF(b.fecha)).sort((a, b) => b.fecha.localeCompare(a.fecha));
    return `<div class="pb"><div class="fh"><div><h2>${esc(p.nombre || p.iniciales)}</h2><div class="meta">${esc(p.provincia ?? "sin provincia cargada")} · alta el ${fechaLab(p.alta)} ${p.alta.slice(0, 4)}</div><div class="tags">${p.consultas ? `<span class="est ok">${p.consultas} consultas en total</span>` : p.pidio ? `<span class="est aten">Pidió, no consultó</span>` : p.vioClinica ? `<span class="est neutro">Abrió la clínica</span>` : `<span class="est neutro">Solo se registró</span>`}</div></div><div><button data-act="fichaTodo">${S.fichaTodo ? "Ver el período elegido" : "Ver toda la ventana"}</button></div></div>
      <div class="kv"><div class="k"><div class="l">Búsquedas</div><div class="v num">${fmt(bus.length)}</div><div class="s">${fmt(bus.filter((b) => !b.matchHabia).length)} sin nadie</div></div><div class="k"><div class="l">Pedidos</div><div class="v num">${fmt(at.length)}</div><div class="s">${fmt(at.filter((a) => a.nivel === "intento").length)} intentos</div></div><div class="k"><div class="l">Pagó</div><div class="v num">${ars(suma(at, "cobrado") + suma(at, "reintegrado"))}</div><div class="s">${suma(at, "reintegrado") ? `devuelto ${ars(suma(at, "reintegrado"))}` : "sin devoluciones"}</div></div></div>
      <div class="fsec"><h3>Línea de tiempo<small>${S.fichaTodo ? "toda la ventana" : perCorto(S.per)}</small></h3><ul class="tl">${[...at.map((a) => ({ f: a.fecha, h: a.hora * 60 + (a.min || 0), cls: a.desenlace === "atendida" ? "ok" : a.tipo, t: `${a.tipo === "ci" ? "Consulta inmediata" : "Turno"} con ${a.medico} · ${DES[a.desenlace]?.[0] ?? a.desenlace}${a.cobrado ? ` · ${ars(a.cobrado)}` : ""}`, d: horaLab(a.hora) })), ...bus.map((b) => ({ f: b.fecha, h: b.hora * 60 + (b.min || 0), cls: b.matchHabia ? "neutro" : "adv", t: `Buscó · ${resLab(b.resultado)}${b.medicoElegido ? ` · eligió a ${b.medicoElegido}` : ""}`, d: horaLab(b.hora) }))].sort((a, b) => b.f.localeCompare(a.f) || (b.h || 0) - (a.h || 0)).map((e) => `<li class="${e.cls}"><span class="f">${fechaLab(e.f)}</span><span>${esc(e.t)}</span><span class="d">${esc(e.d)}</span></li>`).join("") || `<li class="neutro"><span class="f">—</span><span class="cero">Sin actividad registrada.</span><span></span></li>`}</ul></div></div>`;
  }
  function fichaProvincia(prov) {
    const bus = D.busquedas.filter((b) => (b.provincia ?? "Sin provincia cargada") === prov); const meds = aprobados().filter((m) => m.provincias.includes(prov));
    return `<div class="pb"><div class="fh"><div><h2>${esc(prov)}</h2><div class="meta">${fmt(meds.length)} profesionales habilitados hoy · ${fmt(bus.length)} búsquedas en toda la ventana</div></div></div>
      ${barrasH(cnt(bus, "resultado").map(([l, n]) => ({ key: l, lab: resLab(l), n, color: bus.find((b) => b.resultado === l)?.matchHabia ? "var(--neutro)" : "var(--adv)" })), bus.length)}
      <div class="fsec"><h3>Profesionales habilitados</h3>${meds.length ? `<ul class="acc-sub">${meds.map((m) => `<li><button data-act="ficha" data-tipo="medico" data-id="${esc(m.id)}">${esc(m.nombre)}</button><span class="m">${esc(m.especialidad)} · ${m.disponible ? "CI prendida" : m.faltantes.length ? `le faltan ${m.faltantes.length}` : m.slotsFuturos ? "con agenda" : "listo, sin ofertar"}</span></li>`).join("")}</ul>` : `<p class="cero">Ninguno: reclutar.</p>`}</div></div>`;
  }
  function renderFicha() {
    const ov = byId("overlay"), pn = byId("panel");
    if (!S.ficha) { ov.classList.remove("on"); pn.classList.remove("on"); pn.innerHTML = ""; return; }
    const body = S.ficha.tipo === "medico" ? fichaMedico(S.ficha.id) : S.ficha.tipo === "paciente" ? fichaPaciente(S.ficha.id) : S.ficha.tipo === "atencion" ? fichaAtencion(S.ficha.id) : fichaProvincia(S.ficha.id);
    const volver = S.pila.length ? `← Volver a la ${S.pila.at(-1).tipo === "atencion" ? "atención" : S.pila.at(-1).tipo === "medico" ? "ficha del profesional" : "ficha anterior"}` : "← Volver al tablero";
    pn.innerHTML = `<div class="ph"><button data-act="cerrar">${volver}</button><span class="mini">Ficha ${S.ficha.tipo === "medico" ? "del profesional" : S.ficha.tipo === "paciente" ? "del paciente" : S.ficha.tipo === "atencion" ? "de la atención" : "de la provincia"}</span></div>${body}`;
    ov.classList.add("on"); pn.classList.add("on"); pn.scrollTop = 0;
  }

  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act, v = b.dataset.v;
    if (act === "mes") { if (S.per.modo !== "meses") S.per = { ...S.per, modo: "meses", meses: new Set([v]) }; else if (S.per.meses.has(v)) { if (S.per.meses.size > 1) S.per.meses.delete(v); } else S.per.meses.add(v); if (S.gran === "dia") S.gran = "semana"; }
    else if (act === "atajo") { const k = Number(v); S.per = { ...S.per, modo: "meses", meses: new Set(MESES12.slice(-k).filter((m) => cubierto(m, COB.pacientes))) }; if (S.gran === "dia") S.gran = "semana"; }
    else if (act === "dias") { const hasta = v === "ayer" ? sumaDias(HOY, -1) : HOY; const desde = v === "ayer" ? hasta : sumaDias(HOY, -(Number(v) - 1)); S.per = { ...S.per, modo: "dias", desde, hasta }; S.gran = "dia"; }
    else if (act === "bucket") { const t = b.dataset.tipo; if (t === "mes") { if (S.per.modo !== "meses") S.per = { ...S.per, modo: "meses", meses: new Set([v]) }; else if (S.per.meses.has(v)) { if (S.per.meses.size > 1) S.per.meses.delete(v); } else S.per.meses.add(v); } else { const desde = b.dataset.desde, hasta = b.dataset.hasta; S.per = S.per.modo === "dias" && S.per.desde === desde && S.per.hasta === hasta ? { ...S.per, modo: "dias", desde: sumaDias(hasta, -6), hasta } : { ...S.per, modo: "dias", desde, hasta }; } }
    else if (act === "filtro") { const k = b.dataset.k; S.f[k] = v && S.f[k] !== v ? v : null; }
    else if (act === "limpiar") { for (const k of Object.keys(S.f)) S.f[k] = null; S.intentos = false; }
    else if (act === "intentos") S.intentos = !S.intentos;
    else if (act === "toggle" || act === "toggleEmb") { if (S.abiertas.has(v)) S.abiertas.delete(v); else S.abiertas.add(v); }
    else if (act === "metrica") S.metrica = v;
    else if (act === "verCampania") S.verCampania = !S.verCampania;
    else if (act === "verPrendidos") S.verPrendidos = !S.verPrendidos;
    else if (act === "gran") S.gran = v;
    else if (act === "ficha") { if (S.ficha) S.pila.push(S.ficha); else S.pila = []; S.ficha = { tipo: b.dataset.tipo, id: b.dataset.id }; S.fichaTodo = false; renderFicha(); return; }
    else if (act === "fichaTodo") { S.fichaTodo = !S.fichaTodo; renderFicha(); return; }
    else if (act === "cerrar") { S.ficha = S.pila.length ? S.pila.pop() : null; renderFicha(); return; }
    else if (act === "ir") { const el = byId(v); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    else return;
    e.stopPropagation(); render();
  });
  root.addEventListener("click", (e) => { if (e.target.id === "overlay") { S.ficha = null; S.pila = []; renderFicha(); } });
  const onKey = (e) => { if (e.key === "Escape" && S.ficha) { S.ficha = null; S.pila = []; renderFicha(); } };
    document.addEventListener("keydown", onKey);
  root.addEventListener("change", (e) => {
    const t = e.target; if (!t.dataset.rango) return;
    const v = t.value; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    let desde = t.dataset.rango === "desde" ? v : S.per.desde, hasta = t.dataset.rango === "hasta" ? v : S.per.hasta;
    if (hasta > HOY) hasta = HOY; if (desde > hasta) { if (t.dataset.rango === "desde") hasta = desde; else desde = hasta; }
    S.per = { ...S.per, modo: "dias", desde, hasta }; if (diasEntre(desde, hasta) <= 45) S.gran = "dia"; else if (S.gran === "dia") S.gran = "semana";
    render();
  });
  root.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.tq) { S.tablas[t.dataset.tq].q = t.value; refrescarTabla(t.dataset.tq, `[data-tq="${t.dataset.tq}"]`); }
    else if (t.dataset.tf) { S.tablas[t.dataset.tf].f[t.dataset.k] = t.value; refrescarTabla(t.dataset.tf, t.tagName === "SELECT" ? null : `[data-tf="${t.dataset.tf}"][data-k="${t.dataset.k}"]`); }
  });
  root.addEventListener("click", (e) => {
    const s = e.target.closest("[data-ts]"); if (s) { const st = S.tablas[s.dataset.ts]; if (st.ord === s.dataset.k) st.dir = -st.dir; else { st.ord = s.dataset.k; st.dir = -1; } refrescarTabla(s.dataset.ts); return; }
    const m = e.target.closest("[data-tmas]"); if (m) { S.tablas[m.dataset.tmas].max += 50; refrescarTabla(m.dataset.tmas); }
  });
  // tooltips: curva (crosshair por columna) y barras por hora
  const tip = byId("tip");
  root.addEventListener("pointermove", (e) => {
    const c = e.target.closest("[data-lc]");
    const h = e.target.closest("[data-tt]");
    if (c) { const b = LC[c.dataset.lc][Number(c.dataset.i)]; tip.innerHTML = `<b>${esc(b.titulo)}</b>`; tip.style.display = "block"; }
    else if (h) { tip.innerHTML = `<b>${esc(h.dataset.tt)}</b>`; tip.style.display = "block"; }
    else { tip.style.display = "none"; return; }
    const x = Math.min(e.clientX + 14, window.innerWidth - 280), y = e.clientY + 16; tip.style.left = x + "px"; tip.style.top = y + "px";
  });
  render();
    return () => document.removeEventListener("keydown", onKey);
}
