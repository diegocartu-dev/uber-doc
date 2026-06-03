import CargandoDocto from "@/components/CargandoDocto";

// force-dynamic + 13 queries (paciente + historial + documentos) — sin esto, blanco.
export default function Loading() {
  return <CargandoDocto texto="Cargando ficha del paciente…" />;
}
