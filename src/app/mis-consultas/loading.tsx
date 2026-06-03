import CargandoDocto from "@/components/CargandoDocto";

// force-dynamic + queries de consultas del paciente — sin esto, blanco al navegar.
export default function Loading() {
  return <CargandoDocto texto="Cargando tus consultas…" />;
}
