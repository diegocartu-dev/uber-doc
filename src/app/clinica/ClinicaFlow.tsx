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
//      Los psicólogos van en su propia sección, "Psicología" (Diego, 13/10/2026):
//      mezclados, quien busca un médico encontraría psicólogos. El selector solo
//      aparece si hay psicólogos en la provincia, y nunca para un paciente menor
//      (psicología es solo para adultos).
export default function ClinicaFlow({
  provinciaGuardada,
  medicos,
  consultasEspera,
  turnosClinicaVirtual,
  medicosEnTurno,
  flagCiActiva,
  flagTurnosActivos,
  pilotoDespertarActivo,
  mostrarPsicologia = false,
}: {
  provinciaGuardada: string | null;
  /** Falso para un paciente menor: la sección de psicología no se le muestra. */
  mostrarPsicologia?: boolean;
  medicos: Medico[];
  consultasEspera: ConsultaEspera[];
  turnosClinicaVirtual: TurnoClinicaVirtual[];
  medicosEnTurno: string[];
  flagCiActiva: boolean;
  flagTurnosActivos: boolean;
  // Piloto despertar-oferta (Diego lo dejó EN PAUSA el 01/09): el botón del
  // paciente solo existe si la plantilla de Twilio está configurada — la misma
  // llave que hace inerte al endpoint. Sin esto, el botón prometía avisar y
  // siempre terminaba en "no hay nadie": una promesa muerta en el momento B.
  pilotoDespertarActivo: boolean;
}) {
  // null = mostrar la pantalla de jurisdicción. Arranca null SIEMPRE (validar cada vez),
  // aunque haya provinciaGuardada. El polling (router.refresh) conserva este estado.
  const [provincia, setProvincia] = useState<string | null>(null);
  const [seccion, setSeccion] = useState<"medicos" | "psicologia">("medicos");

  async function confirmar(prov: string) {
    // Persistir para pre-seleccionar la próxima vez. No bloqueamos la vista si falla.
    await guardarProvincia(prov);
    setProvincia(prov);
  }

  if (!provincia) {
    return <JurisdiccionScreen provinciaGuardada={provinciaGuardada} onConfirmar={confirmar} />;
  }

  const habilitados = medicos.filter((m) => habilitadoEnProvincia(m, provincia));
  const deMedicina = habilitados.filter((m) => m.profesion !== "psicologo");
  const dePsicologia = mostrarPsicologia ? habilitados.filter((m) => m.profesion === "psicologo") : [];
  const actual = dePsicologia.length > 0 && seccion === "psicologia" ? "psicologia" : "medicos";

  const selector =
    dePsicologia.length > 0 ? (
      <div className="mb-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Sección">
        {([
          ["medicos", "Médicos"],
          ["psicologia", "Psicología"],
        ] as const).map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={actual === valor}
            onClick={() => setSeccion(valor)}
            className="min-h-[44px] rounded-lg bg-white px-3 text-[15px] font-medium"
            style={
              actual === valor
                ? { border: "1px solid #378ADD", color: "#378ADD" }
                : { border: "1px solid #e5e7eb", color: "#57534e" }
            }
          >
            {texto}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <ListadoMedicos
      key={actual}
      seccion={actual}
      selectorSeccion={selector}
      provincia={provincia}
      medicos={actual === "psicologia" ? dePsicologia : deMedicina}
      consultasEspera={consultasEspera}
      turnosClinicaVirtual={turnosClinicaVirtual}
      medicosEnTurno={medicosEnTurno}
      flagCiActiva={flagCiActiva}
      flagTurnosActivos={flagTurnosActivos}
      pilotoDespertarActivo={pilotoDespertarActivo}
      onCambiarProvincia={() => setProvincia(null)}
    />
  );
}
