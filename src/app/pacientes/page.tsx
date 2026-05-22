import { permanentRedirect } from "next/navigation";

// Redirect 308 (permanent): la landing de pacientes ahora vive en la raíz (/).
// Este redirect mantiene compatibilidad con links externos y SEO.
export default function PacientesRedirect() {
  permanentRedirect("/");
}
