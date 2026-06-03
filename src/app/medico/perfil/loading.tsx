import CargandoDocto from "@/components/CargandoDocto";

// force-dynamic + queries de perfil médico — sin esto, blanco al navegar.
export default function Loading() {
  return <CargandoDocto texto="Cargando tu perfil…" />;
}
