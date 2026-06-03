import CargandoDocto from "@/components/CargandoDocto";

// 9 queries (documentos + consultas + turnos del paciente) — sin esto, blanco.
export default function Loading() {
  return <CargandoDocto texto="Cargando tus documentos…" />;
}
