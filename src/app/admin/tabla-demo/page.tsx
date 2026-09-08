// MOCK de la vista de tabla — para validar el modelo ANTES de tocar una pantalla real
// (pedido de Diego 08/09: "primero en un mock, porque quiero el modelo de filtro tal como
// lo tiene OverCall").
//
// Los datos son INVENTADOS a propósito: nombres, especialidades y provincias que no
// existen. Así se puede probar el filtro sin mirar datos de personas reales, y esta
// pantalla no depende de la base.
//
// Está elegida a propósito para ejercitar las cuatro trampas del mandato:
//   1. celdas numéricas VACÍAS (que Number(null) convertiría en 0 y pondría primeras)
//   2. dos filas EMPATADAS en fecha (que sin desempate estable haría temblar la lista)
//   3. acentos y ñ ("Atención", "Peña") para el buscador
//   4. "Base 2" antes que "Base 10" en el orden de texto

import DemoTablaCliente from "./DemoTablaCliente";

export const metadata = { title: "Vista de tabla (demo) — Docto" };

export default function TablaDemoPage() {
  return <DemoTablaCliente />;
}
