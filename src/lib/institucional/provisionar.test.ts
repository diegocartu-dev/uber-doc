// Tests del alta provisionada — parte PURA (validación + email sintético +
// parser CSV). Runner: node:test + node:assert, con tsx:
//   npx tsx --test src/lib/institucional/provisionar.test.ts
//
// Datos 100% SINTÉTICOS (jamás personas reales — repo público).

import { test } from "node:test";
import assert from "node:assert/strict";
import { validarDatosProvision, emailSinteticoPorDNI } from "./provisionar";
import { parsearPadronCSV } from "./padron-csv";

const BASE = {
  dni: "12.345.678",
  nombre_completo: "  Marta   Pérez ",
  fecha_nacimiento: "1961-03-12",
};

test("valida y normaliza la fila mínima (DNI con puntos, espacios en el nombre)", () => {
  const r = validarDatosProvision(BASE);
  assert.ok(r.ok);
  assert.equal(r.datos.dni, "12345678");
  assert.equal(r.datos.nombre_completo, "Marta Pérez");
  assert.equal(r.datos.celular, null);
  assert.equal(r.datos.email, null);
});

test("celular se normaliza a E.164 y uno inválido rechaza la fila", () => {
  const ok = validarDatosProvision({ ...BASE, celular: "0387 15-555-0101" });
  assert.ok(ok.ok);
  assert.equal(ok.datos.celular, "+5493875550101");

  const mal = validarDatosProvision({ ...BASE, celular: "123" });
  assert.ok(!mal.ok);
});

test("sexo acepta M/F y variantes, rechaza otros", () => {
  const m = validarDatosProvision({ ...BASE, sexo_dni: "M" });
  assert.ok(m.ok && m.datos.sexo_dni === "masculino");
  const f = validarDatosProvision({ ...BASE, sexo_dni: "Femenino" });
  assert.ok(f.ok && f.datos.sexo_dni === "femenino");
  const x = validarDatosProvision({ ...BASE, sexo_dni: "otro" });
  assert.ok(!x.ok);
});

test("DNI corto, nombre vacío o fecha futura rechazan", () => {
  assert.ok(!validarDatosProvision({ ...BASE, dni: "123" }).ok);
  assert.ok(!validarDatosProvision({ ...BASE, nombre_completo: " " }).ok);
  assert.ok(!validarDatosProvision({ ...BASE, fecha_nacimiento: "2099-01-01" }).ok);
  assert.ok(!validarDatosProvision({ ...BASE, fecha_nacimiento: "12/03/1961" }).ok);
});

test("email sintético: determinístico por DNI, dominio limpio de protocolo", () => {
  const a = emailSinteticoPorDNI("12345678", "https://salud.ejemplo.gob.ar/");
  const b = emailSinteticoPorDNI("12345678", "salud.ejemplo.gob.ar");
  assert.equal(a, "dni-12345678@padron.salud.ejemplo.gob.ar");
  assert.equal(a, b); // mismo DNI + mismo dominio = mismo alias, siempre
});

test("CSV: header por nombre en cualquier orden, delimitador ';' y filas mixtas", () => {
  const csv = [
    "nombre;dni;fecha_nacimiento;sexo;celular",
    "Marta Pérez;12.345.678;1961-03-12;F;387 555 0101",
    "Luis Castro;45678901;1955-07-01;M;", // sin canal: VÁLIDA igual (R20)
    "Sin Fecha;11222333;;M;387 555 0102", // fecha vacía: error
  ].join("\n");
  const r = parsearPadronCSV(csv);
  assert.ok(r.ok);
  assert.equal(r.filas.length, 3);
  assert.ok(r.filas[0].ok && r.filas[0].datos?.celular === "+5493875550101");
  assert.ok(r.filas[1].ok && r.filas[1].datos?.celular === null);
  assert.ok(!r.filas[2].ok);
});

test("CSV: DNI repetido dentro del archivo marca la segunda aparición", () => {
  const csv = [
    "dni,nombre,fecha_nacimiento",
    "12345678,Marta Pérez,1961-03-12",
    "12.345.678,Marta Perez Otra Vez,1961-03-12",
  ].join("\n");
  const r = parsearPadronCSV(csv);
  assert.ok(r.ok);
  assert.ok(r.filas[0].ok);
  assert.ok(!r.filas[1].ok);
  assert.match(r.filas[1].error ?? "", /repetido/i);
});

test("CSV: sin columnas obligatorias devuelve error estructural, no filas", () => {
  const r = parsearPadronCSV("nombre,celular\nMarta,3875550101");
  assert.ok(!r.ok);
  assert.match(r.error ?? "", /dni/i);
});

test("CSV: campos entre comillas con el delimitador adentro", () => {
  const csv = ['dni,nombre,fecha_nacimiento,localidad', '12345678,"Pérez, Marta",1961-03-12,"Cafayate"'].join("\n");
  const r = parsearPadronCSV(csv);
  assert.ok(r.ok && r.filas[0].ok);
  assert.equal(r.filas[0].datos?.nombre_completo, "Pérez, Marta");
});
