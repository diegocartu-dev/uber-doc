// Tests de la PUERTA DE ORIGEN — ¿este POST salió de nuestra propia página?
// Runner: node:test + node:assert con tsx (`npm run test:unit`).
//
// Esta función ya produjo dos pantallas en blanco en producción, las dos la
// víspera de una demo, y ninguna la habría dejado pasar un test:
//
//   1. (17/08) Comparaba contra `request.url`, que detrás del proxy de Vercel
//      trae el host del deployment y no el dominio real → todo POST legítimo
//      rechazado.
//   2. (18/08) Safari en navegación privada manda `Origin: null` —la palabra,
//      literal— en form POSTs legítimos. `new URL("null")` explota y el catch
//      devolvía false → 403 → pantalla en blanco… ignorando que el MISMO
//      navegador declaraba al lado `sec-fetch-site: same-origin`.
//
// La regla que estos tests fijan: `sec-fetch-site` manda. Si el navegador
// atestigua same-origin/same-site/none, entra; si dice cross-site, no entra; y
// el análisis de `Origin` es solo el plan B para navegadores que no mandan
// `sec-fetch-site` — donde "null" y ausente se tratan igual, porque el modo
// privado de un teléfono viejo es EXACTAMENTE el visitante que hay que dejar
// pasar.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextRequest } from "next/server";
import { esPostDelMismoSitio } from "@/lib/institucional/origen";

/** Un NextRequest de mentira: la función solo usa `headers` y `url`. */
function pedido(headers: Record<string, string>, url = "https://deployment-abc123.vercel.app/acceso/entrar") {
  return { headers: new Headers(headers), url } as unknown as NextRequest;
}

const HOST = "instancia-institucional.vercel.app";

// ── sec-fetch-site manda ─────────────────────────────────────────────────────

test("same-origin declarado entra, diga lo que diga Origin", () => {
  // El caso Safari-privado que produjo la pantalla en blanco: Origin null,
  // sec-fetch-site same-origin. El navegador se está identificando bien.
  assert.equal(
    esPostDelMismoSitio(pedido({ "sec-fetch-site": "same-origin", origin: "null", host: HOST })),
    true,
    "se rechazó a un navegador que declaraba same-origin — el bug del 18/08"
  );
});

test("cross-site declarado NO entra, aunque el Origin parezca nuestro", () => {
  assert.equal(
    esPostDelMismoSitio(
      pedido({ "sec-fetch-site": "cross-site", origin: `https://${HOST}`, host: HOST })
    ),
    false,
    "cross-site es la palabra del navegador: un Origin bonito no la desmiente"
  );
});

test("una navegación directa (none) entra", () => {
  assert.equal(
    esPostDelMismoSitio(pedido({ "sec-fetch-site": "none", host: HOST })),
    true
  );
});

// ── el plan B: navegadores sin sec-fetch-site ───────────────────────────────

test("sin sec-fetch-site y sin Origin entra: es el teléfono viejo", () => {
  assert.equal(esPostDelMismoSitio(pedido({ host: HOST })), true);
});

test("sin sec-fetch-site, Origin null entra: modo privado de un navegador viejo", () => {
  assert.equal(
    esPostDelMismoSitio(pedido({ origin: "null", host: HOST })),
    true,
    'la serialización "null" del origen opaco no puede valer menos que un header ausente'
  );
});

test("sin sec-fetch-site, el Origin de otro sitio NO entra", () => {
  assert.equal(
    esPostDelMismoSitio(pedido({ origin: "https://malicioso.example", host: HOST })),
    false
  );
});

test("sin sec-fetch-site, el Origin propio entra aunque request.url sea del deployment", () => {
  // El bug del 17/08: detrás del proxy, `request.url` trae el host interno del
  // deployment. El host real viaja en x-forwarded-host.
  assert.equal(
    esPostDelMismoSitio(
      pedido(
        { origin: `https://${HOST}`, "x-forwarded-host": HOST, host: HOST },
        "https://instancia-institucional-9dmupj3do.vercel.app/acceso/entrar"
      )
    ),
    true,
    "el POST legítimo se rechazó por comparar contra el host del deployment — el bug del 17/08"
  );
});

test("un Origin ilegible de verdad NO entra", () => {
  assert.equal(
    esPostDelMismoSitio(pedido({ origin: "esto no es una url", host: HOST })),
    false,
    "basura en Origin sin atestación del navegador no puede abrir la puerta"
  );
});
