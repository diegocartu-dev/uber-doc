// Áreas de atención adicionales del médico (Adolescencia y las que vengan).
// Cubre lo que se puede romper sin que nadie lo note: qué se guarda, qué mensaje ve
// el médico si se equivoca, qué texto ve el paciente y con qué palabras lo encuentra.

import {
  areasCoincidenBusqueda,
  parsearAreasAtencion,
  serializarAreas,
  textoArea,
  validarAreas,
  type AreaAtencion,
} from "../../src/lib/areas-atencion";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) {
    passed++;
    console.log(`✅ ${label}`);
  } else {
    failed++;
    console.log(`❌ ${label}`, extra ?? "");
  }
}

const ok: AreaAtencion = { area: "adolescencia", edad_desde: 10, edad_hasta: 19 };

// ── parseo tolerante (lo que viene de la base) ──
check("parsea un área válida", parsearAreasAtencion([ok]).length === 1);
check("descarta un área desconocida", parsearAreasAtencion([{ area: "geriatria", edad_desde: 65, edad_hasta: 99 }]).length === 0);
check("descarta rango invertido", parsearAreasAtencion([{ area: "adolescencia", edad_desde: 19, edad_hasta: 10 }]).length === 0);
check("descarta edades fuera de rango", parsearAreasAtencion([{ area: "adolescencia", edad_desde: 10, edad_hasta: 200 }]).length === 0);
check("descarta duplicados", parsearAreasAtencion([ok, ok]).length === 1);
check("no explota con basura", parsearAreasAtencion("qué es esto").length === 0 && parsearAreasAtencion(null).length === 0);

// ── validación con mensaje para el médico ──
check("área válida no da error", validarAreas([ok]) === null);
check("lista vacía no da error (área desactivada)", validarAreas([]) === null);
check("edad vacía da mensaje", (validarAreas([{ area: "adolescencia", edad_desde: NaN, edad_hasta: 19 }]) ?? "").includes("números enteros"));
check("desde >= hasta da mensaje", (validarAreas([{ area: "adolescencia", edad_desde: 19, edad_hasta: 19 }]) ?? "").includes("menor"));
check("edad absurda da mensaje", (validarAreas([{ area: "adolescencia", edad_desde: 10, edad_hasta: 130 }]) ?? "").includes("entre 0 y 120"));

// ── texto que ve el paciente ──
check("texto humano del área", textoArea(ok) === "Atiende adolescentes (10 a 19 años)", textoArea(ok));

// ── buscador de la clínica ──
check("encuentra por 'adolescencia'", areasCoincidenBusqueda([ok], "adolescencia"));
check("encuentra por 'adolescentes'", areasCoincidenBusqueda([ok], "adolescentes"));
check("encuentra por prefijo 'adoles'", areasCoincidenBusqueda([ok], "adoles"));
check("encuentra sin acentos ni mayúsculas", areasCoincidenBusqueda([ok], "ADOLESCENCIA"));
check("no matchea cualquier cosa", !areasCoincidenBusqueda([ok], "cardiologia"));
check("médico sin áreas no matchea", !areasCoincidenBusqueda([], "adolescencia") && !areasCoincidenBusqueda(undefined, "adolescencia"));

// ── comparación estable (botón "Guardar cambios") ──
check("serialización estable ignora el orden", serializarAreas([ok]) === serializarAreas([{ ...ok }]));
check("detecta un cambio real", serializarAreas([ok]) !== serializarAreas([{ ...ok, edad_hasta: 21 }]));

console.log(`\n${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
