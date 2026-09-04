// Identidades del tablero único contra PRODUCCIÓN (regla 4 del manual).
// Se corre antes de cada deploy que toque `src/lib/tablero/`:
//
//   npx tsx scripts/probar-tablero.mts
//
// Necesita NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno
// (por ejemplo `.env.production.check`, que este script lee si existe).
// Imprime SOLO conteos y verdaderos/falsos: nada de nombres ni montos (el
// repo es público y el output puede terminar pegado en un PR).
// Sale con código 1 ante cualquier identidad rota.

import fs from "node:fs";
import path from "node:path";

for (const archivo of [".env.production.check", ".env.local"]) {
  const ruta = path.resolve(process.cwd(), archivo);
  if (!fs.existsSync(ruta)) continue;
  for (const linea of fs.readFileSync(ruta, "utf8").split("\n")) {
    const i = linea.indexOf("=");
    if (i < 1 || linea.trim().startsWith("#")) continue;
    const k = linea.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = linea.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
  }
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const { cargarTablero } = await import("../src/lib/tablero/cargar");
const { vista, indices, ORDEN_DES } = await import("../src/lib/tablero/vista");
const { COBERTURA, diasDelPeriodo, meses12, cubierto, diasCub } = await import("../src/lib/tablero/cobertura");
const { FILTROS_VACIOS } = await import("../src/lib/tablero/tipos");
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { clasificarAtencion } = await import("../src/lib/consultas/clasificar");
const { conMovimiento, cobradoDe, comisionTotalDe, reintegradoDe } = await import("../src/lib/insights/plata");
const { medianocheARenUTC } = await import("../src/lib/insights/fechas");

let fallas = 0;
const ok = (cond: boolean, nombre: string, detalle = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${nombre}${detalle ? " · " + detalle : ""}`);
  if (!cond) fallas++;
};

const t0 = Date.now();
const D = await cargarTablero();
const ms = Date.now() - t0;
console.log(`cargado en ${ms} ms · atenciones ${D.atenciones.length} · búsquedas ${D.busquedas.length} · pacientes ${D.pacientes.length} · profesionales ${D.medicos.length} · slots ${D.slots.length} · ciHoras ${D.ciHoras.length}`);
ok(ms < 5000, "el cargador tarda menos de 5 s", `${ms} ms`);

const HOY = D.hoy;
const ix = indices(D);
const todos = new Set(meses12(HOY).filter((m) => cubierto(m, COBERTURA.ventana, HOY)));
const sel = (per: Parameters<typeof vista>[1]["per"], f = FILTROS_VACIOS, intentos = false) => ({ per, f, intentos });
const meses = (...ms: string[]) => ({ modo: "meses" as const, meses: new Set(ms), desde: HOY, hasta: HOY });
const dias = (desde: string, hasta: string) => ({ modo: "dias" as const, meses: new Set<string>(), desde, hasta });
const V = vista(D, sel(meses(...todos)));

// 1. partes = total
ok(V.consultas.length + V.intentos.length === V.at.length, "consultas + intentos = atenciones");
ok(ORDEN_DES.reduce((s, d) => s + V.consultas.filter((a) => a.desenlace === d).length, 0) === V.consultas.length, "Σ desenlaces = consultas");
ok(V.at.filter((a) => a.tipo === "ci").length + V.at.filter((a) => a.tipo === "turno").length === V.at.length, "CI + turnos = atenciones");
ok(V.at.every((a) => a.medicoId && D.medicos.some((m) => m.id === a.medicoId) === (a.medico !== "—")), "toda atención tiene profesional resoluble o figura como —");

// 2. Σ ranking = total
const porMed = new Map<string, number>();
for (const a of V.consultas) porMed.set(a.medicoId, (porMed.get(a.medicoId) ?? 0) + 1);
ok([...porMed.values()].reduce((s, n) => s + n, 0) === V.consultas.length, "Σ consultas por profesional = consultas");
const cobradoRank = D.medicos.reduce((s, m) => s + vista(D, sel(meses(...todos), { ...FILTROS_VACIOS, medico: m.id }), ix).cobrado, 0);
ok(Math.abs(cobradoRank - V.cobrado) < 0.01, "Σ cobrado por profesional (ficha) = cobrado del tablero");

// 3. mes del tablero = motor llamado directo sobre filas crudas
const admin = createAdminClient();
const mesTest = [...todos].sort().at(-2) ?? [...todos][0];
const { data: consMes, error: e1 } = await admin
  .from("consultas")
  .select("id, estado, aceptada_at, resuelta_por, resolucion_motivo, pago_id, mp_status, sala_video_url, en_curso_at, monto, mp_application_fee, comision_docto_pct, reintegro_estado, medico_id, paciente_id")
  .gte("created_at", medianocheARenUTC(mesTest + "-01"))
  .lt("created_at", medianocheARenUTC(mesTest === "2026-12" ? "2027-01-01" : mesTest.slice(0, 5) + String(Number(mesTest.slice(5, 7)) + 1).padStart(2, "0") + "-01"));
if (e1) throw new Error(e1.message);
const { data: testM } = await admin.from("medicos").select("id").eq("es_cuenta_test", true);
const { data: testP } = await admin.from("pacientes").select("id, user_id").eq("es_cuenta_test", true);
const tm = new Set((testM ?? []).map((x) => x.id));
const tp = new Set((testP ?? []).flatMap((x) => [x.id, x.user_id].filter(Boolean)));
const consReales = (consMes ?? []).filter((c) => !tm.has(c.medico_id) && !tp.has(c.paciente_id));
const directoConsultas = consReales.filter((c) => clasificarAtencion(c).nivel === "consulta").length;
const Vm = vista(D, sel(meses(mesTest)), ix);
ok(Vm.consultas.filter((a) => a.tipo === "ci").length === directoConsultas, `CI nivel consulta de ${mesTest}: tablero = motor directo`, `${Vm.consultas.filter((a) => a.tipo === "ci").length} vs ${directoConsultas}`);
const conPlata = consReales.filter(conMovimiento);
ok(Math.abs(Vm.at.filter((a) => a.tipo === "ci").reduce((s, a) => s + a.cobrado, 0) - cobradoDe(conPlata)) < 0.01, `cobrado CI de ${mesTest}: tablero = plata.ts directo`);
ok(Math.abs(Vm.at.filter((a) => a.tipo === "ci").reduce((s, a) => s + a.fee, 0) - comisionTotalDe(conPlata)) < 0.01, `fee CI de ${mesTest}: tablero = plata.ts directo`);
ok(Math.abs(Vm.at.filter((a) => a.tipo === "ci").reduce((s, a) => s + a.reintegrado, 0) - reintegradoDe(conPlata)) < 0.01, `devuelto CI de ${mesTest}: tablero = plata.ts directo`);

// 4. rango = Σ días (métricas aditivas)
const rango = dias([...todos].sort()[0] + "-01", HOY);
const Vr = vista(D, sel(rango), ix);
const porDia = diasDelPeriodo(rango, HOY).map((f) => vista(D, sel(dias(f, f)), ix));
for (const k of ["n", "atendidas", "cobrado", "fee", "reintegrado", "pacsN", "busN", "busConAlguienN", "busPago", "slotsN", "ciHoras", "pedidosCI"] as const) {
  const suma = porDia.reduce((s, v) => s + (v[k] as number), 0);
  const plata = k === "cobrado" || k === "fee" || k === "reintegrado";
  ok(Math.abs((Vr[k] as number) - suma) < 0.01, `rango = Σ días · ${k}`, plata ? "" : `${Vr[k]} vs ${suma}`);
}
ok(Math.abs(Vr.cobrado - V.cobrado) < 0.01 && Vr.n === V.n, "meses = rango de días equivalente");

// 5. aislamiento de cuentas de prueba
ok(!D.atenciones.some((a) => tm.has(a.medicoId)), "ninguna atención de un profesional de prueba");
ok(!D.medicos.some((m) => tm.has(m.id)), "ningún profesional de prueba en la lista");
console.log(`INFO  ocultos: ${D.ocultos.consultasTest} consultas y ${D.ocultos.turnosTest} turnos de prueba · ${D.ocultos.reservasAbandonadas} reservas abandonadas · ${D.ocultos.reprogramadosOrigen} reprogramaciones plegadas`);

// 6. plata: cobrado + devuelto = movimiento; fee ≤ cobrado; nunca cobrado y devuelto a la vez
ok(D.atenciones.every((a) => !(a.cobrado > 0 && a.reintegrado > 0)), "ninguna atención cobrada y devuelta a la vez");
ok(D.atenciones.every((a) => a.fee <= a.cobrado + 0.01), "fee ≤ cobrado en cada atención");
ok(D.atenciones.every((a) => a.fee === 0 || a.cobrado > 0), "fee > 0 solo con cobro");

// 7. reservas y cadena
ok(!D.atenciones.some((a) => a.estado === "reservado_pendiente"), "ninguna reserva abandonada llegó como unidad (las vivas figuran como 'reservando')");
ok(D.atenciones.filter((a) => a.tipo === "turno").every((a) => a.cobrado === 0 || a.pagada), "todo turno con cobro está clasificado como pagado (la plata de la cadena llegó al hijo)");

// 8. cobertura: cero unidades antes de su fecha
ok(!D.atenciones.some((a) => a.fecha < COBERTURA.ventana), "ninguna atención antes de la ventana");
ok(!D.busquedas.some((b) => b.fecha < COBERTURA.embudo), "ninguna búsqueda antes de la cobertura del embudo", `primera: ${D.busquedas.map((b) => b.fecha).sort()[0] ?? "—"}`);
ok(!D.atenciones.some((a) => a.origen === "hito" && a.fecha < COBERTURA.hito), "ningún hito de aceptación antes de la fecha declarada");
ok(diasCub(meses(COBERTURA.lanzamiento.slice(0, 7)), COBERTURA.consultas, HOY) > 0, "el mes del lanzamiento cubre días");

// 9. embudo monótono y Σ resultados = búsquedas
ok(V.busN >= V.busConAlguienN && V.busConAlguienN >= V.busPago && V.busPago >= V.busAtendio, "embudo monótono", `${V.busN} ≥ ${V.busConAlguienN} ≥ ${V.busPago} ≥ ${V.busAtendio}`);
ok(V.busConProvN === V.busConAlguienN + V.busSinNadieN, "con provincia = con alguien + sin nadie");
ok(V.busN === V.busConProvN + V.busSinProvN, "búsquedas = con provincia + sin provincia");
ok(D.busquedas.every((b) => b.atenciones.every((id) => D.atenciones.some((a) => a.id === id))), "cada atención acreditada a una búsqueda existe");
ok(D.busquedas.every((b) => !b.medicoElegidoId || D.medicos.some((m) => m.id === b.medicoElegidoId)), "todo profesional elegido existe en la lista (el id lo escribe el cliente)");
ok(D.busquedas.every((b) => (!b.triage || /^[a-z_]+$/.test(b.triage)) && (!b.bloqueo || /^[a-z_]+$/.test(b.bloqueo))), "triaje y bloqueo son claves limpias");
ok(D.slots.every((s) => s.libres <= s.n), "libres ≤ publicados en cada fecha");
const acreditadas = D.busquedas.flatMap((b) => b.atenciones);
ok(new Set(acreditadas).size === acreditadas.length, "ninguna atención acreditada a dos búsquedas");

// 10. "ahora" = badges del panel
const { count: pendientesDb } = await admin.from("medicos").select("id", { count: "exact", head: true }).eq("estado_registro", "pendiente_revision").eq("es_cuenta_test", false);
ok(D.medicos.filter((m) => m.estado === "pendiente_revision").length === (pendientesDb ?? 0), "por revisar = badge del sidebar");
const { count: alertasDb } = await admin.from("alertas_admin").select("id", { count: "exact", head: true }).eq("estado", "pendiente");
ok(D.alertas.length === (alertasDb ?? 0), "alertas pendientes = badge del sidebar");

// 11. definiciones pendientes de Diego: se informan, no se juzgan
const { count: aprobadosIncl } = await admin.from("medicos").select("id", { count: "exact", head: true }).eq("estado_registro", "aprobado");
console.log(`INFO  aprobados reales sin baja: ${D.medicos.filter((m) => m.estado === "aprobado" && !m.baja).length} · con baja: ${D.medicos.filter((m) => m.estado === "aprobado").length} · incluyendo prueba: ${aprobadosIncl}`);

console.log(fallas ? `\n${fallas} identidad(es) rota(s)` : "\nTodas las identidades pasan");
process.exit(fallas ? 1 : 0);
