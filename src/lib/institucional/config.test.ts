// Tests de la config institucional — runner: node:test + node:assert, con tsx.
// Ejecutar:  npx tsx --test src/lib/institucional/config.test.ts
//
// Fija dos garantías:
//   1. soloBranding() NUNCA deja pasar las columnas comerciales
//      (precio_consulta_centavos, acuerdo_horas_semana_default) — es la lista
//      blanca de lo que puede viajar al cliente.
//   2. getConfigInstitucion() fuera del modo institucional TIRA sin tocar la
//      DB (en B2C nadie puede leer una config que no existe).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  soloBranding,
  getConfigInstitucion,
  invalidarCacheConfigInstitucion,
  type ConfigInstitucion,
} from "./config";

// Datos SINTÉTICOS canónicos (07-handoff §03-datos-ejemplo) — jamás reales.
const CONFIG: ConfigInstitucion = {
  id: 1,
  nombre: "Ministerio de Salud",
  subnombre: "Provincia de ___",
  logo_path: null,
  color_primary: "#4A3F8C",
  color_primary_dark: "#37306B",
  color_primary_soft: "#EEECF7",
  dominio: "salud-provincia.example",
  pdf_accent: null,
  pdf_isologo_path: null,
  pdf_efector_texto: "Emitido a través de Docto (docto.com.ar).",
  wa_remitente_nombre: "Salud Provincia de ___",
  mail_from: "Salud Provincia de ___ <no-reply@salud-provincia.example>",
  telefono_ayuda: "0800-555-0000",
  ci_ventana_inicio: "08:00:00",
  ci_ventana_fin: "20:00:00",
  slot_duracion_min: 15,
  especialidades: ["Clínica Médica", "Pediatría"],
  vigencia_documentos_dias: 30,
  reenvio_cooldown_minutos: 10,
  reenvio_max_por_dia: 5,
  ventana_entrada_min: 10,
  wa_plantillas: { turno_asignado: "HX000000000000000000000000000sint" },
  acuerdo_horas_semana_default: 1,
  precio_consulta_centavos: 1200000,
  updated_at: "2026-08-12T00:00:00Z",
};

beforeEach(() => {
  delete process.env.INSTITUCIONAL;
  invalidarCacheConfigInstitucion();
});

test("soloBranding excluye las DOS columnas comerciales", () => {
  const branding = soloBranding(CONFIG) as Record<string, unknown>;
  assert.ok(!("precio_consulta_centavos" in branding), "precio_consulta_centavos NO puede viajar al cliente");
  assert.ok(!("acuerdo_horas_semana_default" in branding), "acuerdo_horas_semana_default NO puede viajar al cliente");
  assert.ok(!("wa_plantillas" in branding), "wa_plantillas (server-only) NO puede viajar al cliente");
});

test("soloBranding conserva branding y operación completos", () => {
  const branding = soloBranding(CONFIG);
  assert.equal(branding.nombre, "Ministerio de Salud");
  assert.equal(branding.color_primary, "#4A3F8C");
  assert.equal(branding.dominio, "salud-provincia.example");
  assert.equal(branding.ci_ventana_inicio, "08:00:00");
  assert.equal(branding.slot_duracion_min, 15);
  assert.deepEqual(branding.especialidades, ["Clínica Médica", "Pediatría"]);
  assert.equal(branding.telefono_ayuda, "0800-555-0000");
  // Ciclo de vida del link (migración 011): es política operativa, la ven las
  // pantallas del paciente — tiene que pasar la lista blanca.
  assert.equal(branding.vigencia_documentos_dias, 30);
  assert.equal(branding.reenvio_cooldown_minutos, 10);
  assert.equal(branding.reenvio_max_por_dia, 5);
  assert.equal(branding.ventana_entrada_min, 10);
});

test("soloBranding es una lista blanca cerrada (ninguna clave inesperada)", () => {
  // Si la tabla suma una columna, NO puede colarse al cliente por accidente:
  // el copiado es campo a campo, así que una clave extra en la fila no pasa.
  const filaConColumnaNueva = { ...CONFIG, descuento_secreto: 999 } as ConfigInstitucion;
  const branding = soloBranding(filaConColumnaNueva) as Record<string, unknown>;
  assert.ok(!("descuento_secreto" in branding));
});

test("getConfigInstitucion fuera del modo institucional tira error claro", async () => {
  await assert.rejects(
    () => getConfigInstitucion(),
    /fuera del modo institucional/
  );
});
