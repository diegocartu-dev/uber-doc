// La constancia de atención del psicólogo (Diego, 13/10/2026; texto aprobado en
// docs/sprints/2026-10-13-psicologos.md).
//
// Lleva lo que pide el Decreto 905/1995 para las certificaciones del psicólogo
// (nombre, profesión, matrícula, domicilio) y nada clínico: ni diagnóstico ni
// motivo de consulta (secreto profesional). El título ("CONSTANCIA DE ATENCIÓN")
// lo pone el encabezado del PDF; esto es el cuerpo, completo.
//
// El texto entero se guarda en `documentos.contenido`, que entra al hash de la
// firma: todo lo que el papel imprime queda sellado, sin depender de las
// tablas vivas.
//
// Puro (sin base ni red) para poder probarlo entero.

import { capitalizarNombre } from "@/lib/utils/texto";

export const TITULO_CONSTANCIA = "CONSTANCIA DE ATENCIÓN";

export type DatosConstancia = {
  pacienteNombre: string;
  pacienteDni: string;
  /** Fecha de la sesión, "YYYY-MM-DD" (hora argentina). */
  fecha: string;
  /** Hora de la sesión, "HH:MM" o "HH:MM:SS" (hora argentina). */
  hora: string;
  profesionalNombre: string;
  /** "MN" | "MP". */
  matriculaTipo: string;
  matriculaNumero: string;
  /** Provincia de la matrícula provincial; para la MN no se usa. */
  matriculaProvincia: string | null;
  domicilio: string;
};

function fechaLarga(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha;
}

/** "MP 5555 — Córdoba" / "MN 12345 — Nacional". */
export function matriculaConJurisdiccion(tipo: string, numero: string, provincia: string | null): string {
  const t = (tipo ?? "").trim().toUpperCase();
  const n = (numero ?? "").trim();
  const jurisdiccion = t === "MN" ? "Nacional" : (provincia ?? "").trim();
  return jurisdiccion ? `${t} ${n} — ${jurisdiccion}`.trim() : `${t} ${n}`.trim();
}

/** El cuerpo de la constancia, tal cual el texto aprobado. */
export function textoConstancia(d: DatosConstancia): string {
  const hora = (d.hora ?? "").slice(0, 5);
  return [
    `Dejo constancia de que ${capitalizarNombre(d.pacienteNombre)}, DNI ${d.pacienteDni.replace(/\D/g, "")}, asistió a una sesión de atención psicológica por videollamada el ${fechaLarga(d.fecha)} a las ${hora} hs.`,
    "",
    `Lic. ${capitalizarNombre(d.profesionalNombre)}`,
    "Licenciado/a en Psicología",
    `Matrícula ${matriculaConJurisdiccion(d.matriculaTipo, d.matriculaNumero, d.matriculaProvincia)}`,
    `Domicilio profesional: ${d.domicilio.trim().replace(/\s+/g, " ")}`,
    "",
    "Firmado electrónicamente en Docto.",
  ].join("\n");
}
