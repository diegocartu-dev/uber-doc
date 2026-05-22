// ─── Tipos FHIR Practitioner (subset relevante para REFEPS) ──────────────────

export interface FHIRIdentifier {
  system?: string;
  value?: string;
  type?: {
    coding?: Array<{ system?: string; code?: string; display?: string }>;
  };
  assigner?: { display?: string };
}

export interface FHIRHumanName {
  use?: string;
  family?: string;
  given?: string[];
  text?: string;
}

export interface FHIRQualification {
  identifier?: FHIRIdentifier[];
  code?: {
    coding?: Array<{ system?: string; code?: string; display?: string }>;
    text?: string;
  };
  period?: { start?: string; end?: string };
  issuer?: { reference?: string; display?: string };
  extension?: Array<{ url?: string; valueCode?: string; valueString?: string }>;
}

export interface FHIRPractitioner {
  resourceType: "Practitioner";
  id?: string;
  identifier?: FHIRIdentifier[];
  active?: boolean;
  name?: FHIRHumanName[];
  qualification?: FHIRQualification[];
  gender?: string;
}

export interface FHIRBundle {
  resourceType: "Bundle";
  type: string;
  total?: number;
  entry?: Array<{
    resource: FHIRPractitioner;
  }>;
}

// ─── Tipos internos de Docto ─────────────────────────────────────────────────

export interface REFEPSMatricula {
  numero: string;
  tipo: string; // "Nacional", "Provincial", etc.
  entidad_certificante: string;
  vigente_desde?: string;
}

export interface REFEPSEspecialidad {
  codigo: string;
  nombre: string;
  vigente_desde?: string;
}

export interface REFEPSResult {
  encontrado: boolean;
  refeps_id?: string;
  nombre?: string;
  apellido?: string;
  dni?: string;
  activo?: boolean;
  matriculas?: REFEPSMatricula[];
  especialidades?: REFEPSEspecialidad[];
  genero?: string;
  error?: string;
  raw?: FHIRPractitioner; // Respuesta cruda para auditoría
}
