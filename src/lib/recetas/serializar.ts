// La receta en texto, armada desde la lista de medicamentos (formato IFA
// compatible con AAIP/ReNaPDiS: Rp/ + IFA + detalles). Es lo que se guarda en
// `documentos.contenido`, se imprime en el PDF y se firma.
//
// Movida tal cual desde WorkspaceConsulta.tsx el 13/10/2026 para que el
// servidor pueda verificar que la lista estructurada guardada coincide con el
// texto de la receta (`listaCoincideConReceta`). El test fija el formato.

export type MedicamentoParaTexto = {
  nombre?: string | null;
  droga?: string | null;
  presentacion?: string | null;
  forma_farmaceutica?: string | null;
  via?: string | null;
  cantidad?: number | null;
};

// Formato IFA compatible con AAIP/ReNaPDiS — cada medicamento con Rp/ + IFA + detalles
export function serializarMedicamentos(meds: MedicamentoParaTexto[], textoLibre: string): string {
  const bloques: string[] = [];
  for (let i = 0; i < meds.length; i++) {
    const med = meds[i];
    const nombre = (med.nombre ?? "").trim();
    if (!nombre) continue;

    const lineas: string[] = [];
    // IFA (droga) como línea principal — formato prescripción
    const ifa = (med.droga ?? "").trim();
    lineas.push(`Rp/ ${ifa ? ifa.toUpperCase() : nombre.toUpperCase()}`);
    if (ifa && nombre !== ifa) {
      lineas.push(`    Nombre comercial: ${nombre}`);
    }
    if (med.forma_farmaceutica?.trim()) {
      lineas.push(`    Forma farmacéutica: ${capitalizar(med.forma_farmaceutica.trim())}`);
    }
    if (med.presentacion?.trim()) {
      lineas.push(`    Presentación: ${med.presentacion.trim()}`);
    }
    if (med.via?.trim()) {
      lineas.push(`    Vía: ${med.via.trim()}`);
    }
    // Cantidad de envases (13/10/2026): solo se escribe si el profesional pidió
    // más de uno. Con 1 (el valor de siempre) la receta sale idéntica a antes.
    if ((med.cantidad ?? 1) > 1) {
      lineas.push(`    Cantidad: ${med.cantidad} envases`);
    }
    bloques.push(lineas.join("\n"));
  }

  if ((textoLibre ?? "").trim()) {
    if (bloques.length > 0) bloques.push("");
    bloques.push(textoLibre.trim());
  }
  return bloques.join("\n\n");
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}


/**
 * ¿La lista estructurada es la misma receta que el texto guardado? La parte de
 * los medicamentos del texto tiene que ser exactamente la serialización de la
 * lista, y lo único que puede seguir es el texto libre, que la serialización
 * separa con un bloque vacío ("\n\n" + "" + "\n\n"). Con un "\n\n" solo, una
 * lista a la que le falta el último medicamento pasaría por buena.
 */
export function listaCoincideConReceta(lista: MedicamentoParaTexto[], contenido: string): boolean {
  const meds = serializarMedicamentos(lista, "");
  if (!meds) return false;
  return contenido === meds || contenido.startsWith(meds + "\n\n\n\n");
}
