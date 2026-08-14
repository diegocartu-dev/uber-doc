// Layout de /medico — SERVER, y con una sola responsabilidad propia: la puerta
// del profesional invitado a una reunión de demostración.
//
// ── POR QUÉ ESTE ARCHIVO EXISTE ──────────────────────────────────────────────
// El enlace del participante se proyecta en una pared y quien lo fotografía
// entra. Revocarlo cierra su sesión, pero el access token que ya tiene en la
// mano vive cerca de una hora más. Esa hora la tapaba `/dashboard` — y sólo
// `/dashboard`. Desde acá cuelgan la agenda, "mis pacientes" y el workspace de
// la consulta: o sea la historia clínica de la institución, que era justo lo que
// quedaba abierto.
//
// En B2C (y para cualquier profesional que no sea de una reunión) el guard
// devuelve `true` sin tocar la base ni las cookies: el gate por modo corta
// primero. Ver `demo-puerta.ts`.
//
// Todo el comportamiento de cliente que vivía acá —el modal de sesión vencida—
// se mudó tal cual a `MedicoShell.tsx`, sin un cambio.

import { exigirProfesionalHabilitado } from "@/lib/institucional/demo-puerta";
import MedicoShell from "./MedicoShell";

export default async function MedicoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await exigirProfesionalHabilitado();
  return <MedicoShell>{children}</MedicoShell>;
}
