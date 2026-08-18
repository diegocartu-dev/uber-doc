// NINGUNA PANTALLA DEL PACIENTE INSTITUCIONAL LINKEA A UNA RUTA QUE NO EXISTE.
// Runner: node:test + node:assert con tsx (`npm run test:unit`).
//
// ── QUÉ FIJA ESTE ARCHIVO ────────────────────────────────────────────────────
// El modo institucional apaga rutas enteras del B2C (`INSTITUCIONAL_BLOCKED`) y
// el middleware las contesta con `new NextResponse(null, { status: 404 })`: un
// 404 SIN CUERPO, que el navegador pinta como una pantalla en blanco. No hay
// cartel, no hay "volver", no hay nada. Es el peor error posible en la mano de
// un paciente, y es invisible para el que escribe el código: el link compila,
// el tipo es `string`, y en el B2C funciona perfecto.
//
// Caso real (demo institucional del 18/08): al terminar la videollamada, el
// botón "Ver mis documentos" apuntaba a `/documentos` —bloqueada— y el paciente
// se quedó mirando una pantalla vacía. Sus documentos estaban bien guardados y
// se veían en SU pantalla, la del enlace: el único roto era el link.
//
// Por eso el test lee el CÓDIGO FUENTE de las pantallas que mira un paciente y
// falla si encuentra una ruta bloqueada escrita a mano. La forma correcta es
// que el destino lo decida la page (server) con `rebotePaciente`, que en B2C
// devuelve la ruta de siempre y en la instancia la pantalla propia del enlace.
//
// NO alcanza con "acordarse": esta clase de bug no la ve ni el tipado, ni el
// lint, ni un test de render, porque el link está bien escrito. Se ve mirando
// el conjunto — que es justo lo que hace este archivo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bloqueaRutaInstitucional, rebotePaciente } from "@/lib/instancia";

/** Pantallas que ve un paciente (las del enlace y las del canal clínico). */
const PANTALLAS_DEL_PACIENTE = [
  "src/app/consulta/[id]/sala/SalaConsultaPaciente.tsx",
  "src/app/consulta/[id]/acceso/AccesoConsultaClient.tsx",
  "src/app/turno/[turnoId]/acceso/AccesoTurnoClient.tsx",
];

/**
 * Rutas apagadas en la instancia que además son destinos "naturales" al escribir
 * una pantalla de paciente. Se listan explícitas —y no leyendo la constante del
 * módulo— para que agregar una ruta a la lista de bloqueadas no cambie en
 * silencio lo que este test vigila.
 */
const DESTINOS_TENTADORES = ["/documentos", "/mis-consultas", "/mis-datos", "/clinica"];

/** `href="/documentos"` y `href='/documentos'`, no `href={destinoDocumentos}`. */
function hrefsLiterales(fuente: string): string[] {
  return [...fuente.matchAll(/href=["']([^"'{}]+)["']/g)].map((m) => m[1]);
}

test("las rutas tentadoras están REALMENTE bloqueadas en la instancia", () => {
  const previo = process.env.INSTITUCIONAL;
  process.env.INSTITUCIONAL = "true";
  try {
    for (const ruta of DESTINOS_TENTADORES) {
      assert.equal(
        bloqueaRutaInstitucional(ruta),
        true,
        `${ruta} dejó de estar bloqueada: revisá si este test sigue teniendo sentido`
      );
    }
    // El contrapunto: en B2C no bloquea ninguna. Sin esto, un gate escrito al
    // revés dejaría pasar el test entero.
    process.env.INSTITUCIONAL = "";
    for (const ruta of DESTINOS_TENTADORES) {
      assert.equal(bloqueaRutaInstitucional(ruta), false, `${ruta} no puede bloquearse en el B2C`);
    }
  } finally {
    process.env.INSTITUCIONAL = previo;
  }
});

test("ninguna pantalla del paciente escribe a mano una ruta apagada", () => {
  for (const archivo of PANTALLAS_DEL_PACIENTE) {
    const fuente = readFileSync(archivo, "utf8");
    for (const href of hrefsLiterales(fuente)) {
      const muerto = DESTINOS_TENTADORES.some((r) => href === r || href.startsWith(r + "/"));
      assert.equal(
        muerto,
        false,
        `${archivo} linkea a ${href}, que en la instancia es un 404 de cuerpo vacío. ` +
          `El destino lo decide la page con rebotePaciente() y viaja como prop.`
      );
    }
  }
});

test("rebotePaciente manda al paciente a SU pantalla, y en B2C no cambia nada", () => {
  const previo = process.env.INSTITUCIONAL;
  try {
    process.env.INSTITUCIONAL = "true";
    assert.equal(rebotePaciente("/documentos", "/consulta/abc/acceso"), "/consulta/abc/acceso");
    assert.equal(rebotePaciente("/documentos", "/turno/xyz/acceso"), "/turno/xyz/acceso");

    process.env.INSTITUCIONAL = "";
    assert.equal(rebotePaciente("/documentos", "/consulta/abc/acceso"), "/documentos");
  } finally {
    process.env.INSTITUCIONAL = previo;
  }
});
