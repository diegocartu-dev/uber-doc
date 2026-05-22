import { buscarPorDNI, IDENTIFIER_SYSTEMS } from "./client";
import type {
  FHIRPractitioner,
  REFEPSResult,
  REFEPSMatricula,
  REFEPSEspecialidad,
} from "./types";

// ─── Parsear Practitioner FHIR → REFEPSResult ──────────────────────────────

function parsearPractitioner(p: FHIRPractitioner): REFEPSResult {
  // Extraer nombre
  const nombreOficial = p.name?.find((n) => n.use === "official") ?? p.name?.[0];
  const nombre = nombreOficial?.given?.join(" ") ?? "";
  const apellido = nombreOficial?.family ?? "";

  // Extraer REFEPS ID
  const refepsId = p.identifier?.find(
    (id) => id.system === IDENTIFIER_SYSTEMS.REFEPS
  )?.value;

  // Extraer DNI
  const dni = p.identifier?.find(
    (id) => id.system === IDENTIFIER_SYSTEMS.DNI
  )?.value;

  // Extraer matrículas de qualifications
  const matriculas: REFEPSMatricula[] = [];
  const especialidades: REFEPSEspecialidad[] = [];

  if (p.qualification) {
    for (const q of p.qualification) {
      // Qualification con identifier = matrícula
      if (q.identifier && q.identifier.length > 0) {
        for (const id of q.identifier) {
          matriculas.push({
            numero: id.value ?? "",
            tipo: extraerTipoMatricula(id.system),
            entidad_certificante: q.issuer?.display ?? "",
            vigente_desde: q.period?.start,
          });
        }
      }

      // Qualification con code = especialidad
      if (q.code) {
        const coding = q.code.coding?.[0];
        if (coding) {
          especialidades.push({
            codigo: coding.code ?? "",
            nombre: coding.display ?? q.code.text ?? "",
            vigente_desde: q.period?.start,
          });
        }
      }

      // Especialidad en extension (formato alternativo REFEPS)
      if (q.extension) {
        for (const ext of q.extension) {
          if (ext.valueString || ext.valueCode) {
            especialidades.push({
              codigo: ext.valueCode ?? "",
              nombre: ext.valueString ?? ext.valueCode ?? "",
              vigente_desde: q.period?.start,
            });
          }
        }
      }
    }
  }

  return {
    encontrado: true,
    refeps_id: refepsId,
    nombre,
    apellido,
    dni,
    activo: p.active ?? false,
    matriculas,
    especialidades,
    genero: p.gender,
    raw: p,
  };
}

function extraerTipoMatricula(system?: string): string {
  if (!system) return "Desconocido";
  if (system.includes("Nacional") || system.includes("nacional"))
    return "Nacional";
  if (system.includes("Provincial") || system.includes("provincial"))
    return "Provincial";
  // El system URI suele contener la entidad certificante
  const partes = system.split("/");
  return partes[partes.length - 1] || "Otro";
}

// ─── Función principal: validar médico por DNI ──────────────────────────────

export async function validarMedicoREFEPS(dni: string): Promise<REFEPSResult> {
  if (!dni || !/^\d{7,8}$/.test(dni)) {
    return { encontrado: false, error: "DNI inválido (debe tener 7-8 dígitos)" };
  }

  try {
    const practitioner = await buscarPorDNI(dni);

    if (!practitioner) {
      return { encontrado: false, error: "REGISTRO_NO_ENCONTRADO" };
    }

    const resultado = parsearPractitioner(practitioner);

    // Verificar que tenga al menos una matrícula
    if (!resultado.matriculas || resultado.matriculas.length === 0) {
      return {
        ...resultado,
        encontrado: true,
        error: "SIN_MATRICULA_REGISTRADA",
      };
    }

    return resultado;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error desconocido REFEPS";

    // No loguear la secret ni tokens — solo el mensaje de error
    console.error("[REFEPS] Error validando médico:", message);

    // Clasificar errores para la UI
    if (message.includes("token error")) {
      return { encontrado: false, error: "REFEPS_AUTH_ERROR" };
    }
    if (
      message.includes("TimeoutError") ||
      message.includes("abort") ||
      message.includes("timeout")
    ) {
      return { encontrado: false, error: "REFEPS_TIMEOUT" };
    }

    return { encontrado: false, error: "REFEPS_ERROR_INTERNO" };
  }
}
