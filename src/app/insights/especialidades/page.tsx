export const dynamic = "force-dynamic";

import { Suspense } from "react";
import EspecialidadesClient from "./EspecialidadesClient";

// Suspense explícito alrededor de useSearchParams (mismo fix que Demanda:
// sin boundary, la hidratación puede quedar pendiente y la página muerta).
export default function EspecialidadesPage() {
  return (
    <Suspense fallback={null}>
      <EspecialidadesClient />
    </Suspense>
  );
}
