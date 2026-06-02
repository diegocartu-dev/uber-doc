import CargandoDocto from "@/components/CargandoDocto";

// El dashboard del médico hace varias queries al cargar — sin esto, blanco.
export default function Loading() {
  return <CargandoDocto texto="Cargando tu información…" />;
}
