// SNAPSHOT DE LOS CUATRO MENSAJES DE PERMISOS DEL B2C — runner: node:test + tsx.
//
// ── POR QUÉ ESTE TEST EXISTE (gate #404, spec §11.17) ────────────────────────
// `instruccionesPermiso` salió del archivo más cicatrizado del repo (el
// pre-join del canal clínico) para que la pantalla del paciente institucional
// pudiera usar las mismas instrucciones sin copiarlas. En esa mudanza la marca
// pasó a ser un PARÁMETRO, con Docto como default.
//
// El riesgo de una parametrización así no es que rompa: es que cambie de a
// poco. Estos textos son la última salida de alguien que denegó el permiso de
// micrófono en el peor momento —cuando el profesional ya está del otro lado— y
// no son intercambiables entre plataformas: iOS no tiene candadito, la PWA de
// iOS no tiene barra de direcciones, y un "permití el acceso desde el
// navegador" genérico deja al paciente sin ninguna salida (aprendizaje del
// 10/06/2026, escrito en CLAUDE.md).
//
// Por eso son STRINGS LITERALES y no plantillas: si alguien los toca, el test
// falla y muestra exactamente qué le va a leer el paciente. Cambiarlos es
// perfectamente legítimo — actualizar el literal de acá es parte del cambio,
// no un obstáculo.
//
// ── CÓMO SE SIMULA CADA PLATAFORMA ───────────────────────────────────────────
// `esIOS()` y `esStandalone()` leen `navigator` y `window`, que en Node no son
// los del browser. Se pisan con defineProperty (configurable) y se restauran
// al final de cada caso: nada queda contaminado para los otros tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { instruccionesPermiso, esIOS, esStandalone } from "@/lib/media/permisos";

type Plataforma = "ios-pwa" | "ios-safari" | "android-pwa" | "escritorio";

const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const UA_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

/** Corre `fn` como si el visitante estuviera en esa plataforma. */
function en<T>(plataforma: Plataforma, fn: () => T): T {
  const ios = plataforma.startsWith("ios");
  const pwa = plataforma.endsWith("pwa");

  const navigatorOriginal = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const windowOriginal = Object.getOwnPropertyDescriptor(globalThis, "window");

  Object.defineProperty(globalThis, "navigator", {
    value: {
      userAgent: ios ? UA_IPHONE : UA_ANDROID,
      platform: ios ? "iPhone" : "Linux armv8l",
      maxTouchPoints: 5,
      standalone: ios && pwa ? true : undefined,
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: {
      matchMedia: (q: string) => ({ matches: pwa && q.includes("standalone") }),
    },
    configurable: true,
    writable: true,
  });

  try {
    return fn();
  } finally {
    if (navigatorOriginal) Object.defineProperty(globalThis, "navigator", navigatorOriginal);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (windowOriginal) Object.defineProperty(globalThis, "window", windowOriginal);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("detección · cada plataforma se reconoce como lo que es", () => {
  assert.deepEqual(en("ios-pwa", () => [esIOS(), esStandalone()]), [true, true]);
  assert.deepEqual(en("ios-safari", () => [esIOS(), esStandalone()]), [true, false]);
  assert.deepEqual(en("android-pwa", () => [esIOS(), esStandalone()]), [false, true]);
  assert.deepEqual(en("escritorio", () => [esIOS(), esStandalone()]), [false, false]);
});

test("B2C · iOS dentro de la app instalada: Ajustes del iPhone, con la marca Docto", () => {
  assert.equal(
    en("ios-pwa", () => instruccionesPermiso("micrófono")),
    "El permiso de micrófono está bloqueado para la app de Docto. Andá a Ajustes de tu iPhone, buscá «Docto» y activá Micrófono y Cámara. Si no aparece, abrí docto.com.ar desde Safari."
  );
});

// ⚠ CONCORDANCIA DE GÉNERO — los mensajes de "cámara" dicen "El cámara" y
// "al cámara" porque el dispositivo entra como parámetro en frases escritas
// para "el micrófono". Es un bug de copy VIVO en producción hoy, y el snapshot
// lo registra tal cual: este test fija lo que el paciente lee, no lo que
// debería leer. Arreglarlo es un cambio de copy del B2C —con su OK— y en ese
// momento se actualizan estos dos literales.
test("B2C · iOS en Safari: el «ᴀA» de la barra, que es lo único que hay ahí", () => {
  assert.equal(
    en("ios-safari", () => instruccionesPermiso("cámara")),
    "El cámara está bloqueado. En Safari, tocá «ᴀA» en la barra de direcciones → «Configuración del sitio web» → permití Micrófono y Cámara, y recargá la página."
  );
});

test("B2C · PWA de Android: salir a Chrome y entrar por el dominio", () => {
  assert.equal(
    en("android-pwa", () => instruccionesPermiso("micrófono")),
    "El micrófono está bloqueado. Cerrá la app, abrí Chrome, entrá a docto.com.ar y habilitá el micrófono desde ahí."
  );
});

test("B2C · escritorio: el candadito al lado de la dirección", () => {
  assert.equal(
    en("escritorio", () => instruccionesPermiso("cámara")),
    "El cámara está bloqueado. Tocá el candadito al lado de la dirección y permití el acceso al cámara."
  );
});

test("B2C · el default es Docto: los cuatro mensajes nombran a Docto o a nadie", () => {
  const plataformas: Plataforma[] = ["ios-pwa", "ios-safari", "android-pwa", "escritorio"];
  for (const p of plataformas) {
    const texto = en(p, () => instruccionesPermiso("micrófono"));
    assert.equal(texto.includes("Docto") || texto.includes("docto.com.ar") || !texto.includes("app de"), true, p);
  }
});

// ── El otro lado del mismo cambio: con marca, ni una mención a Docto ─────────

test("instancia · con la marca de la institución no aparece Docto por ningún lado", () => {
  const marca = { nombre: "Salud Provincia", dominio: "salud.gob.ar" };
  for (const p of ["ios-pwa", "android-pwa"] as Plataforma[]) {
    const texto = en(p, () => instruccionesPermiso("micrófono", marca));
    assert.equal(
      texto.toLowerCase().includes("docto"),
      false,
      `${p}: un vecino de la provincia no puede recibir instrucciones para entrar a un sitio que no es el suyo`
    );
    assert.ok(texto.includes("Salud Provincia") || texto.includes("salud.gob.ar"), p);
  }
});

test("instancia · los mensajes que NO nombran producto son idénticos en los dos modos", () => {
  // Safari-iOS y escritorio hablan solo de la interfaz del navegador: la marca
  // no los toca, y si algún día los tocara, sería un cambio a decidir, no un
  // efecto colateral.
  const marca = { nombre: "Salud Provincia", dominio: "salud.gob.ar" };
  for (const p of ["ios-safari", "escritorio"] as Plataforma[]) {
    assert.equal(
      en(p, () => instruccionesPermiso("micrófono", marca)),
      en(p, () => instruccionesPermiso("micrófono"))
    );
  }
});
