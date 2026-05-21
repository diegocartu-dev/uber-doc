export const PLATAFORMA_ID = "0270";

export const TIPO_RECETA = {
  COMUN: "comun",
  CONTROLADA: "controlada",
  PSICOTROPICO: "psicotropico",
} as const;

export type TipoReceta = (typeof TIPO_RECETA)[keyof typeof TIPO_RECETA];

export const ESTADO_RECETA = {
  BORRADOR: "borrador",
  EMITIDA: "emitida",
  DISPENSADA: "dispensada",
  ANULADA: "anulada",
} as const;

export type EstadoReceta = (typeof ESTADO_RECETA)[keyof typeof ESTADO_RECETA];
