export const dynamic = "force-dynamic";

// /admin/periodos — LOS MESES YA FACTURADOS (R33).
//
// Pantalla INTERNA de Docto (no es marca blanca): la ve solo un admin de Docto,
// y SOLO en la instancia institucional. Sirve para dos cosas:
//   1. mirar el detalle de un mes sellado, y
//   2. corregir la clasificación de un encuentro — solo superadmin, con motivo
//      obligatorio, y dejando constancia en la auditoría del período.
//
// Por qué existe: un mes sellado es inmutable para todos (la institución, los
// operadores, el job, un backfill). Para todos menos para uno, porque los
// errores existen. Esta es la única puerta, y no se puede usar en silencio: el
// trigger de la 021 rechaza el cambio si no viene con su fila de auditoría.
//
// Defensa en profundidad: el guard va acá y no solo en el layout de /admin — en
// App Router layout y page renderizan en paralelo, y esta page lee con service
// role el detalle de lo que se le factura a la institución.

import { notFound, redirect } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { createClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/admin-auth";
import { periodoValido, periodoASellar } from "@/lib/metering/facturacion";
import {
  encuentrosSelladosDePeriodo,
  historialDePeriodo,
  periodosSellados,
} from "@/lib/metering/correcciones";
import PeriodosClient from "./PeriodosClient";

export default async function PeriodosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  if (!esInstitucional()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const admin = await getAdminUser(user.id);
  if (!admin) redirect("/dashboard");
  // Un admin común entra a MIRAR; corregir es de superadmin (R33). El botón se
  // esconde y, aunque no se escondiera, la action y la función de la DB
  // rebotan.
  const esSuperadmin = admin.nivel === "super_admin";

  const sellados = await periodosSellados();
  const pedido = (await searchParams).periodo;
  const periodo =
    pedido && periodoValido(pedido) ? pedido : (sellados[0] ?? periodoASellar());

  const [encuentros, historial] = await Promise.all([
    encuentrosSelladosDePeriodo(periodo),
    historialDePeriodo(periodo),
  ]);

  return (
    <PeriodosClient
      periodo={periodo}
      periodos={sellados}
      encuentros={encuentros}
      historial={historial}
      esSuperadmin={esSuperadmin}
    />
  );
}
