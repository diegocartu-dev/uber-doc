export const dynamic = "force-dynamic";

import { Suspense } from "react";
import OfertaClient from "./OfertaClient";

// Suspense explícito alrededor de useSearchParams (mismo fix que Demanda:
// sin boundary, la hidratación puede quedar pendiente y la página muerta).
export default function OfertaPage() {
  return (
    <Suspense fallback={null}>
      <OfertaClient />
    </Suspense>
  );
}
