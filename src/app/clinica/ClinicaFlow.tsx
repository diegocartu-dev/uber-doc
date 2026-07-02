"use client";

import { useState } from "react";
import {
  type Medico,
  type ConsultaEspera,
  type TurnoClinicaVirtual,
  habilitadoEnProvincia,
} from "./disponibilidad";
import JurisdiccionScreen from "./JurisdiccionScreen";
import ListadoMedicos from "./ListadoMedicos";
import { guardarProvincia } from "./actions";

// Orquesta el flujo de la Clínica con ruteo por jurisdicción:
//   1) Pantalla de provincia (SIEMPRE primero — "validar cada vez"). provinciaGuardada
//      solo pre-selecciona; el paciente confirma cada visita.
//   2) Listado de médicos habilitados para esa provincia (filtro con fail-safe).
export default function ClinicaFlow({
  provinciaGuardada,
  medicos,
  consultasEspera,
  turnosClinicaVirtual,
  medicosEnTurno,
  flagCiActiva,
  flagTurnosActivos,
}: {
  provinciaGuardada: string | null;
  medicos: Medico[];
  consultasEspera: ConsultaEspera[];
  turnosClinicaVirtual: TurnoClinicaVirtual[];
  medicosEnTurno: string[];
  flagCiActiva: boolean;
  flagTurnosActivos: boolean;
}) {
  // null = mostrar la pantalla de jurisdicción. Arranca null SIEMPRE (validar cada vez),
  // aunque haya provinciaGuardada. El polling (router.refresh) conserva este estado.
  const [provincia, setProvincia] = useState<string | null>(null);

  async function confirmar(prov: string) {
    // Persistir para pre-seleccionar la próxima vez. No bloqueamos la vista si falla.
    await guardarProvincia(prov);
    setProvincia(prov);
  }

  if (!provincia) {
    return <JurisdiccionScreen provinciaGuardada={provinciaGuardada} onConfirmar={confirmar} />;
  }

  const medicosProvincia = medicos.filter((m) => habilitadoEnProvincia(m, provincia));

  return (
    <ListadoMedicos
      provincia={provincia}
      medicos={medicosProvincia}
      consultasEspera={consultasEspera}
      turnosClinicaVirtual={turnosClinicaVirtual}
      medicosEnTurno={medicosEnTurno}
      flagCiActiva={flagCiActiva}
      flagTurnosActivos={flagTurnosActivos}
      onCambiarProvincia={() => setProvincia(null)}
    />
  );
}
