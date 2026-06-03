import CargandoDocto from "@/components/CargandoDocto";

// La agenda hace varias queries (médico + modelos + turnos) — sin esto, blanco.
export default function Loading() {
  return <CargandoDocto texto="Cargando tu agenda…" />;
}
