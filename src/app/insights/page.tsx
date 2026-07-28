export const dynamic = "force-dynamic";

import { Suspense } from "react";
import InsightsHoyClient from "./InsightsHoyClient";

// Suspense explícito alrededor de useSearchParams (mismo fix que Demanda:
// sin boundary, la hidratación puede quedar pendiente y la página muerta).
export default function InsightsPage() {
  return (
    <Suspense fallback={null}>
      <InsightsHoyClient />
    </Suspense>
  );
}
