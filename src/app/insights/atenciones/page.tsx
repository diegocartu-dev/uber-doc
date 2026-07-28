export const dynamic = "force-dynamic";

import { Suspense } from "react";
import AtencionesClient from "./AtencionesClient";

// Suspense explícito alrededor de useSearchParams (mismo fix que Demanda:
// sin boundary, la hidratación puede quedar pendiente y la página muerta).
export default function AtencionesPage() {
  return (
    <Suspense fallback={null}>
      <AtencionesClient />
    </Suspense>
  );
}
