export const dynamic = "force-dynamic";

import { Suspense } from "react";
import FunnelClient from "./FunnelClient";

// Suspense explícito: useSearchParams sin boundary dejaba la hidratación
// pendiente en prod (spinner eterno hasta un click real del usuario, que
// dispara la hidratación selectiva de React). Fix documentado por Next.
export default function FunnelPage() {
  return (
    <Suspense fallback={null}>
      <FunnelClient />
    </Suspense>
  );
}
