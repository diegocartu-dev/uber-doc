export const dynamic = "force-dynamic";

// /admin/demo — LA PANTALLA QUE SE USA EN LA REUNIÓN.
//
// No es un panel de administración: es una herramienta de escenario. Diego la
// tiene abierta mientras habla, carga a los participantes con lo que le dicen
// en voz alta (nombre y celular) y proyecta un QR. Todo lo demás lo hace el
// sistema.
//
// Pantalla INTERNA de Docto, SOLO en la instancia institucional — en B2C es 404
// (mismo gate que /admin/padron).

import { notFound, redirect } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { listarSesionesDemo, medicosSinFirma, participantesDeSesion } from "@/lib/institucional/demo";
import DemoClient from "./DemoClient";

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ sesion?: string }>;
}) {
  if (!esInstitucional()) notFound();

  // Defensa en profundidad: no depender solo del guard del layout de /admin.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/dashboard");

  const [config, sesiones] = await Promise.all([getConfigInstitucion(), listarSesionesDemo()]);

  const { sesion } = await searchParams;
  const abiertas = sesiones.filter((s) => !s.cerrada_at);
  const elegida =
    sesiones.find((s) => s.id === sesion) ?? abiertas[0] ?? null;

  const participantes = elegida ? await participantesDeSesion(elegida.id) : [];

  // Quién quedó SIN claves de firma. Es la única pieza del alta cuya falla no se
  // veía en ninguna pantalla: el profesional entra, atiende, documenta… y recién
  // en la Escena 4 el papel sale sin sello y la verificación pública en ámbar.
  const sinFirma = [
    ...(await medicosSinFirma(
      participantes.map((p) => p.medico_id).filter((id): id is string => !!id)
    )),
  ];

  return (
    <DemoClient
      institucion={config.nombre}
      especialidades={config.especialidades}
      // El botón de WhatsApp solo existe si Meta aprobó la plantilla. El QR no
      // depende de nadie: por eso es el camino principal y esto, un extra.
      hayPlantillaWhatsApp={Boolean(config.wa_plantillas?.demo_invitacion)}
      sesiones={sesiones}
      sesionElegida={elegida}
      participantes={participantes}
      sinFirma={sinFirma}
    />
  );
}
