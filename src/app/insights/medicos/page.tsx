export const dynamic = "force-dynamic";

import { Suspense } from "react";
import MedicosInsightsClient from "./MedicosInsightsClient";

// Suspense explícito alrededor de useSearchParams (mismo fix que Demanda:
// sin boundary, la hidratación puede quedar pendiente y la página muerta).
export default function MedicosInsightsPage() {
  return (
    <Suspense fallback={null}>
      <MedicosInsightsClient />
    </Suspense>
  );
}
