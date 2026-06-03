import CargandoDocto from "@/components/CargandoDocto";

// force-dynamic + queries de datos del paciente — sin esto, blanco al navegar.
export default function Loading() {
  return <CargandoDocto texto="Cargando tus datos…" />;
}
