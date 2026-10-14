import { nombreCategoria } from "@/lib/categorias";

/**
 * La categoría del profesional y su coste por uso de la plataforma, en "Cómo
 * atendés" y en "Consultorio particular". Texto aprobado por Diego el 14/10/2026.
 * El porcentaje es el REAL de su categoría (`getComisionForMedico`), nunca un
 * número escrito a mano.
 */
export default function CosteCategoria({
  categoria,
  comisionPct,
  esPsicologo = false,
  className = "",
}: {
  categoria: string | null | undefined;
  comisionPct: number;
  esPsicologo?: boolean;
  className?: string;
}) {
  const quien = `${esPsicologo ? "Profesional" : "Médico"} ${nombreCategoria(categoria)}`;
  return (
    <p className={`text-[13px] text-gray-500 ${className}`}>
      <strong className="text-gray-700">
        {categoria === "founder" ? `¡Felicitaciones por tu categoría de ${quien}!` : `Tu categoría: ${quien}.`}
      </strong>{" "}
      El pago del paciente va directo a tu Mercado Pago. A Docto por uso de la plataforma: solo{" "}
      <strong className="text-gray-700">{comisionPct}&nbsp;%</strong> por {esPsicologo ? "sesión" : "consulta"} realizada.
    </p>
  );
}
