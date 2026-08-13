// Tests de la CORRECCIÓN de un mes ya facturado (R33) — runner: node:test + tsx.
//
// Lo que se protege acá es la mitad más delicada del contador: la puerta que
// deja tocar un número que ya se facturó. La regla tiene dos mitades y las dos
// se testean:
//   1. solo el superadministrador de Docto puede, y
//   2. no hay forma de hacerlo sin dejar rastro (quién, cuándo, qué fila, qué
//      cambió y por qué).
//
// La ley vive en la migración 021, no en TypeScript: un test que solo mirara la
// validación de la lib pasaría en verde con la función de la DB borrada. Por
// eso la segunda tanda lee el `.sql` y verifica que las cláusulas que sostienen
// la regla siguen ahí — es lo más cerca de la base que se puede llegar sin una.
//
// Datos 100% SINTÉTICOS.

process.env.INSTITUCIONAL = "true";

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MOTIVO_MIN,
  corregirEncuentroSellado,
  etiquetaPeriodo,
  validarCorreccion,
  type LlamadaRPC,
} from "@/lib/metering/correcciones";

const ENCUENTRO = "00000000-0000-4000-8000-000000000001";
const SUPERADMIN = "00000000-0000-4000-8000-00000000000a";
const ADMIN_COMUN = "00000000-0000-4000-8000-00000000000b";
const MOTIVO = "El profesional avisó que la llamada se cortó por un corte de luz.";

// ─────────────────────────────────────────────────────────────────────────────
// LA VALIDACIÓN — lo que la pantalla no deja ni intentar
// ─────────────────────────────────────────────────────────────────────────────

test("sin motivo NO se puede corregir", () => {
  const sinNada = validarCorreccion({ clasificacion: "facturable", motivo: "" });
  assert.equal(sinNada.ok, false);
  const soloEspacios = validarCorreccion({ clasificacion: "facturable", motivo: "        " });
  assert.equal(soloEspacios.ok, false);
  // Un motivo que no explica nada tampoco sirve: "ok" pasa cualquier NOT NULL.
  const flojo = validarCorreccion({ clasificacion: "facturable", motivo: "ok" });
  assert.equal(flojo.ok, false);
  if (!flojo.ok) assert.match(flojo.error, /motivo/i);
});

test("el motivo se guarda sin los espacios de los costados", () => {
  const v = validarCorreccion({ clasificacion: "facturable", motivo: `   ${MOTIVO}   ` });
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.motivo, MOTIVO);
});

test("la clasificación tiene que ser una de las cinco del contador", () => {
  assert.equal(validarCorreccion({ clasificacion: "inventada", motivo: MOTIVO }).ok, false);
  assert.equal(validarCorreccion({ clasificacion: "", motivo: MOTIVO }).ok, false);
  assert.equal(validarCorreccion({ clasificacion: "falla_tecnica", motivo: MOTIVO }).ok, true);
});

test("corregir a lo que ya está no es una corrección: es una fila de auditoría vacía", () => {
  const v = validarCorreccion({ clasificacion: "facturable", motivo: MOTIVO, actual: "facturable" });
  assert.equal(v.ok, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// EL CONTRATO CON LA DB — con una base falsa que imita a la 021
// ─────────────────────────────────────────────────────────────────────────────

interface FilaFalsa {
  id: string;
  clasificacion: string;
  clasificacion_origen: string;
  clasificacion_motivo: string | null;
  facturado_periodo: string | null;
}

/** Imita el contrato de `corregir_encuentro_sellado`: firma, motivo, y el
 *  registro ANTES del cambio (nunca uno sin el otro). */
function baseFalsa(inicial?: Partial<FilaFalsa>) {
  const fila: FilaFalsa = {
    id: ENCUENTRO,
    clasificacion: "facturable",
    clasificacion_origen: "job",
    clasificacion_motivo: null,
    facturado_periodo: "2026-10",
    ...inicial,
  };
  const auditoria: Record<string, unknown>[] = [];
  const rpc: LlamadaRPC = async (nombre, args) => {
    assert.equal(nombre, "corregir_encuentro_sellado");
    if (args.p_admin_user_id !== SUPERADMIN) {
      return { data: null, error: { message: "Solo un superadministrador de Docto activo puede corregir un período sellado (R33)." } };
    }
    const motivo = String(args.p_motivo ?? "").trim();
    if (motivo.length < MOTIVO_MIN) {
      return { data: null, error: { message: "La corrección de un período sellado necesita un motivo" } };
    }
    if (!fila.facturado_periodo) {
      return { data: null, error: { message: "no está sellado" } };
    }
    const registro = {
      id: `corr-${auditoria.length + 1}`,
      encuentro_id: fila.id,
      periodo: fila.facturado_periodo,
      admin_user_id: args.p_admin_user_id,
      admin_email: args.p_admin_email,
      motivo,
      valores_antes: { clasificacion: fila.clasificacion },
      valores_despues: { clasificacion: args.p_clasificacion },
    };
    auditoria.push(registro); // PRIMERO la constancia…
    fila.clasificacion = String(args.p_clasificacion); // …y recién ahí el cambio
    fila.clasificacion_origen = "manual_admin";
    fila.clasificacion_motivo = motivo;
    return { data: registro, error: null };
  };
  return { fila, auditoria, rpc };
}

test("un no-superadmin no puede: la DB rebota y no queda ninguna fila de auditoría", async () => {
  const { fila, auditoria, rpc } = baseFalsa();
  const res = await corregirEncuentroSellado(
    { encuentroId: ENCUENTRO, clasificacion: "no_facturable_corta", motivo: MOTIVO, adminUserId: ADMIN_COMUN },
    rpc
  );
  assert.equal(res.ok, false);
  assert.match(res.error ?? "", /superadministrador/i);
  assert.equal(fila.clasificacion, "facturable", "la fila sellada no se movió");
  assert.equal(auditoria.length, 0);
});

test("sin motivo la RPC ni se llama: la validación corta antes", async () => {
  const { auditoria, rpc } = baseFalsa();
  let llamadas = 0;
  const contada: LlamadaRPC = (n, a) => {
    llamadas++;
    return rpc(n, a);
  };
  const res = await corregirEncuentroSellado(
    { encuentroId: ENCUENTRO, clasificacion: "no_facturable_corta", motivo: " ", adminUserId: SUPERADMIN },
    contada
  );
  assert.equal(res.ok, false);
  assert.equal(llamadas, 0, "una corrección sin motivo no llega ni a la base");
  assert.equal(auditoria.length, 0);
});

test("con superadmin y motivo: la fila refleja el cambio Y el rastro queda", async () => {
  const { fila, auditoria, rpc } = baseFalsa();
  const res = await corregirEncuentroSellado(
    {
      encuentroId: ENCUENTRO,
      clasificacion: "falla_tecnica",
      motivo: MOTIVO,
      adminUserId: SUPERADMIN,
      adminEmail: "superadmin@ejemplo.test",
      actual: "facturable",
    },
    rpc
  );
  assert.equal(res.ok, true);
  assert.equal(res.correccionId, "corr-1");

  // La fila corregida
  assert.equal(fila.clasificacion, "falla_tecnica");
  assert.equal(fila.clasificacion_origen, "manual_admin", "el job no la vuelve a pisar (017)");
  assert.equal(fila.clasificacion_motivo, MOTIVO);
  assert.equal(fila.facturado_periodo, "2026-10", "sigue perteneciendo al mes que se facturó");

  // El rastro: quién, qué fila, de qué a qué, y por qué
  assert.equal(auditoria.length, 1);
  const registro = auditoria[0] as Record<string, unknown>;
  assert.equal(registro.encuentro_id, ENCUENTRO);
  assert.equal(registro.periodo, "2026-10");
  assert.equal(registro.admin_user_id, SUPERADMIN);
  assert.equal(registro.admin_email, "superadmin@ejemplo.test");
  assert.equal(registro.motivo, MOTIVO);
  assert.deepEqual(registro.valores_antes, { clasificacion: "facturable" });
  assert.deepEqual(registro.valores_despues, { clasificacion: "falla_tecnica" });
});

test("los argumentos que viajan a la RPC son los que la 021 espera", async () => {
  const { rpc } = baseFalsa();
  let vistos: Record<string, unknown> = {};
  const espia: LlamadaRPC = (n, a) => {
    vistos = a;
    return rpc(n, a);
  };
  await corregirEncuentroSellado(
    { encuentroId: ENCUENTRO, clasificacion: "ausente_paciente", motivo: `  ${MOTIVO}  `, adminUserId: SUPERADMIN },
    espia
  );
  assert.deepEqual(Object.keys(vistos).sort(), [
    "p_admin_email",
    "p_admin_user_id",
    "p_clasificacion",
    "p_encuentro_id",
    "p_motivo",
  ]);
  assert.equal(vistos.p_motivo, MOTIVO, "el motivo viaja normalizado, no crudo");
  assert.equal(vistos.p_admin_email, null, "sin mail, null explícito (no undefined)");
});

// ─────────────────────────────────────────────────────────────────────────────
// LA LEY, EN LA MIGRACIÓN
// ─────────────────────────────────────────────────────────────────────────────
// Estas aserciones son incómodas a propósito: leen texto SQL. Existen porque
// todo lo anterior seguiría en verde con la 021 vaciada, y lo que sostiene la
// regla —que no se pueda corregir sin rastro, ni desde el SQL Editor— vive
// exactamente ahí.

const SQL_021 = readFileSync(
  join(process.cwd(), "supabase/migrations-institucional/021_correcciones_periodo_sellado.sql"),
  "utf8"
);

test("021 · el motivo es obligatorio EN LA BASE, con el mismo mínimo que la lib", () => {
  assert.match(SQL_021, /motivo\s+TEXT\s+NOT NULL\s+CHECK\s*\(length\(btrim\(motivo\)\)\s*>=\s*(\d+)\)/);
  const minimoSQL = Number(SQL_021.match(/length\(btrim\(motivo\)\)\s*>=\s*(\d+)/)![1]);
  assert.equal(minimoSQL, MOTIVO_MIN, "si los dos mínimos divergen, la pantalla miente");
  assert.match(SQL_021, /length\(motivo\)\s*<\s*10/, "la función también lo exige, no solo la tabla");
});

test("021 · el UPDATE sobre una fila sellada exige su fila de auditoría", () => {
  // La puerta: el trigger solo deja pasar si el setting apunta a una corrección
  // de ESE encuentro. Sin la condición del `encuentro_id`, una constancia
  // cualquiera abriría cualquier fila.
  assert.match(
    SQL_021,
    /FROM metering_correcciones c\s*\n\s*WHERE c\.id = correccion AND c\.encuentro_id = OLD\.id AND c\.txid = txid_current\(\)/
  );
  assert.match(SQL_021, /set_config\('metering\.correccion_id', registro\.id::text, true\)/);
  // Y el orden: la constancia se inserta ANTES de habilitar el cambio.
  assert.ok(
    SQL_021.indexOf("INSERT INTO metering_correcciones") <
      SQL_021.indexOf("set_config('metering.correccion_id', registro.id::text"),
    "primero la constancia, después el permiso"
  );
});

test("021 · la constancia es de UN SOLO USO: no se puede reusar la de ayer", () => {
  // Sin `c.txid = txid_current()`, el id de una corrección vieja de esa misma
  // fila era un permiso PERMANENTE: `SET LOCAL metering.correccion_id = '<id
  // viejo>'` + UPDATE pasaba, y no se escribía ninguna constancia nueva.
  assert.match(SQL_021, /txid BIGINT NOT NULL DEFAULT txid_current\(\)/);
  assert.match(SQL_021, /c\.txid = txid_current\(\)/);
});

test("021 · levantar el sello TAMPOCO es un camino", () => {
  // La 014 dejaba pasar el UPDATE que solo ponía `facturado_periodo = NULL`:
  // eran los tres pasos (levantar, corregir, volver a sellar) que esta
  // migración dice cerrar, disponibles con service role y sin una sola fila de
  // auditoría. Esa rama ya no existe.
  assert.ok(
    !/NEW\.facturado_periodo IS NOT NULL OR candidato IS DISTINCT FROM OLD/.test(SQL_021),
    "la rama que permitía des-sellar sigue viva"
  );
  assert.match(SQL_021, /está sellada, y eso incluye levantarle el sello/);
});

test("021 · la corrección solo puede tocar la clasificación, no el reloj ni el precio", () => {
  // La constancia registra el de→a de la clasificación y nada más. Si el mismo
  // UPDATE pudiera cambiar `segundos_ambos_en_sala` o `precio_centavos`, la
  // auditoría diría una cosa y la fila otra.
  for (const campo of [
    "candidato.clasificacion ",
    "candidato.clasificacion_origen",
    "candidato.clasificacion_motivo",
    "candidato.clasificado_at",
  ]) {
    assert.ok(SQL_021.includes(campo), `el trigger no neutraliza ${campo.trim()}`);
  }
  assert.match(SQL_021, /solo puede cambiar la clasificación/);
});

test("021 · la constancia no se puede firmar con un UUID cualquiera", () => {
  // La verificación de superadmin vivía SOLO adentro de la RPC. Una constancia
  // escrita a mano desde el SQL Editor podía atribuirse a quien fuera y después
  // servir de permiso.
  assert.match(SQL_021, /BEFORE INSERT ON metering_correcciones/);
  assert.match(
    SQL_021,
    /WHERE a\.user_id = NEW\.admin_user_id AND a\.activo AND a\.nivel = 'super_admin'/
  );
});

test("021 · el registro es append-only y no se puede vaciar", () => {
  assert.match(SQL_021, /BEFORE UPDATE ON metering_correcciones/);
  assert.match(SQL_021, /BEFORE DELETE ON metering_correcciones/);
  assert.match(SQL_021, /BEFORE TRUNCATE ON metering_correcciones/);
  assert.match(SQL_021, /REVOKE TRUNCATE ON metering_correcciones FROM anon, authenticated, service_role/);
});

test("021 · solo un superadmin ACTIVO puede firmar, verificado en la DB", () => {
  assert.match(
    SQL_021,
    /FROM admin_users a\s*\n\s*WHERE a\.user_id = p_admin_user_id AND a\.activo AND a\.nivel = 'super_admin'/
  );
});

test("021 · la puerta no se abre desde el navegador", () => {
  assert.match(SQL_021, /REVOKE ALL ON FUNCTION corregir_encuentro_sellado[\s\S]*FROM anon, authenticated/);
  assert.match(SQL_021, /GRANT EXECUTE ON FUNCTION corregir_encuentro_sellado[\s\S]*TO service_role/);
  assert.match(SQL_021, /SECURITY DEFINER/);
});

test("021 · ni el superadmin puede mudar la consulta de mes", () => {
  assert.match(SQL_021, /NEW\.facturado_periodo IS DISTINCT FROM OLD\.facturado_periodo/);
});

// ─────────────────────────────────────────────────────────────────────────────
// LA CUARTA PUERTA: EL INSERT
// ─────────────────────────────────────────────────────────────────────────────
// La 014 y la 021 blindan la fila sellada contra UPDATE y DELETE. Faltaba el
// INSERT: una fila que NACE con `facturado_periodo` le agrega una línea a una
// factura emitida y ningún trigger se entera, porque sobre una fila que todavía
// no existe no hay nada que proteger.

const SQL_022 = readFileSync(
  join(process.cwd(), "supabase/migrations-institucional/022_metering_insert_sin_sello.sql"),
  "utf8"
);

test("022 · una fila del contador NACE sin sello", () => {
  assert.match(SQL_022, /BEFORE INSERT ON encuentros_metering/);
  assert.match(SQL_022, /IF NEW\.facturado_periodo IS NOT NULL THEN/);
  assert.match(SQL_022, /RAISE EXCEPTION/);
});

test("021 · es reentrante: volver a aplicarla no rompe nada", () => {
  // Se aplica a mano, en el SQL Editor. Un pegado que se corta a la mitad deja
  // la mitad de las defensas puestas, y el reintento revienta por lo que YA
  // estaba: el final probable es "aplicá lo que falta a ojo".
  assert.match(SQL_021, /CREATE TABLE IF NOT EXISTS metering_correcciones/);
  const indices = SQL_021.match(/CREATE INDEX IF NOT EXISTS/g) ?? [];
  assert.equal(indices.length, 4, "los cuatro índices se crean con IF NOT EXISTS");
  const creados = SQL_021.match(/CREATE TRIGGER/g) ?? [];
  const dropeados = SQL_021.match(/DROP TRIGGER IF EXISTS/g) ?? [];
  assert.equal(dropeados.length, creados.length, "cada trigger se dropea antes de crearse");
});

test("022 · es reentrante: volver a aplicarla no rompe nada", () => {
  // Una migración que no se puede repetir se aplica a medias cuando el SQL
  // Editor corta a la mitad, y el segundo intento falla por lo que YA estaba.
  assert.match(SQL_022, /CREATE OR REPLACE FUNCTION encuentros_metering_nace_sin_sello/);
  assert.match(
    SQL_022,
    /DROP TRIGGER IF EXISTS trg_encuentros_metering_insert_sellado ON encuentros_metering/
  );
});

test("etiqueta del período · se lee como un mes, no como un código", () => {
  assert.equal(etiquetaPeriodo("2026-10"), "Octubre de 2026");
});
