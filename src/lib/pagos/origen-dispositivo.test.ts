// Desde dónde paga el paciente: lo que decide si se le abre la app de Mercado Pago.
import { test } from "node:test";
import assert from "node:assert/strict";
import { origenDispositivo } from "./origen-dispositivo";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const ANDROID_FACEBOOK = "Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]";
const ANDROID_WEBVIEW = "Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";

test("plataforma: iPhone, Android y computadora; el iPad que se presenta como Mac es iOS", () => {
  assert.equal(origenDispositivo(IPHONE_SAFARI, false).plataforma, "ios");
  assert.equal(origenDispositivo(ANDROID_CHROME, false).plataforma, "android");
  assert.equal(origenDispositivo(MAC, false).plataforma, "computadora");
  assert.equal(origenDispositivo(MAC, false, 5).plataforma, "ios");
});

test("navegador: el de otra app se distingue del navegador del teléfono", () => {
  assert.equal(origenDispositivo(IPHONE_SAFARI, false).navegador, "navegador");
  assert.equal(origenDispositivo(IPHONE_INSTAGRAM, false).navegador, "instagram");
  assert.equal(origenDispositivo(ANDROID_FACEBOOK, false).navegador, "facebook");
  assert.equal(origenDispositivo(ANDROID_WEBVIEW, false).navegador, "otro_dentro_de_app");
  assert.equal(origenDispositivo(ANDROID_CHROME, false).navegador, "navegador");
});

test("instalada viaja tal cual", () => {
  assert.equal(origenDispositivo(IPHONE_SAFARI, true).instalada, true);
});
