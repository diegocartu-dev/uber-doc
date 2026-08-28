// ¿El profesional está intentando CAMBIAR su matrícula?
//
// El gate A1 (Roberto) prohíbe tocar la matrícula una vez validada la identidad:
// si no, se rompe el cruce DNI↔matrícula (TOCTOU) —validar con la propia y
// después ponerse la de otro—. Eso sigue igual y no se toca.
//
// Lo que estaba mal era la PREGUNTA: el guard miraba si el campo VENÍA en el
// request, no si su valor CAMBIABA. Y el formulario del perfil manda siempre el
// perfil entero, así que a todo profesional con identidad validada le rebotaba
// con 403 cualquier guardado — incluso corregir solo su celular, que es el
// destino de los avisos por WhatsApp. Caso real: 26/08/2026.

export interface MatriculaGuardada {
  tipo_matricula?: string | null;
  numero_matricula?: string | null;
}

/**
 * `true` solo si alguno de los dos campos llega con un valor DISTINTO al
 * guardado. Un campo ausente no cuenta, y uno que llega igual tampoco.
 */
export function cambiaMatricula(
  updates: { tipo_matricula?: string | null; numero_matricula?: string | null },
  actual: MatriculaGuardada | null | undefined
): boolean {
  const distinto = (nuevo: string | null | undefined, viejo: string | null | undefined) =>
    nuevo !== undefined && (nuevo ?? "") !== (viejo ?? "");
  return (
    distinto(updates.tipo_matricula, actual?.tipo_matricula) ||
    distinto(updates.numero_matricula, actual?.numero_matricula)
  );
}
