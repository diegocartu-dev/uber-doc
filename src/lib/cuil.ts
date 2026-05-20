const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

function verificador(base: string): number {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(base[i]) * WEIGHTS[i];
  }
  const mod = sum % 11;
  if (mod === 0) return 0;
  if (mod === 1) return 9;
  return 11 - mod;
}

export function calcularCuil(
  dni: string,
  sexo: "masculino" | "femenino"
): string {
  const digits = dni.replace(/\D/g, "");
  if (digits.length < 1 || digits.length > 8) {
    throw new Error(`DNI inválido: ${dni}`);
  }
  const padded = digits.padStart(8, "0");

  const prefijo = sexo === "masculino" ? "20" : "27";
  const base = prefijo + padded;
  let digito = verificador(base);

  if (digito === 9) {
    const baseAlt = "23" + padded;
    digito = verificador(baseAlt);
    return `23${padded}${digito}`;
  }

  return `${prefijo}${padded}${digito}`;
}
