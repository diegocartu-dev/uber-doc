export const dynamic = "force-dynamic";
// El cargador hace ~25 lecturas paginadas con la clave de servicio; a este
// volumen tarda segundos, no el default de 15 s sin Fluid.
export const maxDuration = 60;

import { redirect } from "next/navigation";
import { verificarAdmin } from "@/lib/admin-auth";
import { cargarTablero } from "@/lib/tablero/cargar";
import TableroClient from "./TableroClient";

// Tablero único de gestión (Diego, 04/09/2026): "Un solo tablero, no dos".
// Convive con /admin (Dashboard) y /insights mientras se valida; cuando Diego
// lo dé por bueno, los dos viejos se apagan.
//
// La página verifica el rol por su cuenta, además del layout de /admin: en una
// navegación parcial del App Router el cliente puede declarar que ya tiene el
// layout y el servidor no lo vuelve a renderizar (hallazgo de Roberto, 04/09).
// Sin este gate, un usuario logueado no admin podía pedir el payload.
export default async function TableroPage() {
  const user = await verificarAdmin();
  if (!user) redirect("/dashboard");
  const datos = await cargarTablero();
  return <TableroClient datos={datos} />;
}
