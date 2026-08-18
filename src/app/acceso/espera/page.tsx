export const dynamic = "force-dynamic";

// /acceso/espera — el paciente ya entró, pero todavía no le asignaron nada.
//
// Existe por el ORDEN de la reunión: el participante escanea su QR apenas
// Diego lo carga, y el call center le asigna el turno después, en vivo. Sin
// esta pantalla, ese minuto y medio sería un 404 proyectado en una pared.
//
// Se refresca sola y salta a su turno en cuanto aparece: nadie tiene que
// decirle "volvé a tocar el enlace" delante del ministro.
//
// ── ACÁ NO VA EL TELÉFONO DE AYUDA (decisión Diego, 18/08) ──────────────────
// Esta pantalla tenía "¿Algo no anda? Llamanos al …", y era exactamente al
// revés: se pinta cuando TODO salió bien —el paciente entró sin usuario ni
// contraseña y está esperando, que es lo normal— y encima justo debajo de la
// frase que le pide calma. Ofrecer un teléfono ahí no ayuda: insinúa una falla
// que no existe, y en una demo le mete la duda al que mira.
// El teléfono sigue donde SÍ hay algo trabado: enlace inactivo, enlace vencido
// y cierre sin los documentos que el paciente esperaba.
//
// SOLO instancia institucional: en B2C es 404.

import { notFound, redirect } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { destinoDemoPaciente, ESPERA_DEMO } from "@/lib/institucional/demo";
import { MarcoPaciente, LinkInactivo } from "@/components/institucional/PantallaPaciente";
import { metadataPacienteInstitucional } from "@/lib/institucional/metadata";
import RefrescoSuave from "./RefrescoSuave";

export const generateMetadata = metadataPacienteInstitucional;

const primerNombre = (n: string | null | undefined): string =>
  (n ?? "").trim().split(/\s+/)[0] || "";

export default async function EsperaPage() {
  if (!esInstitucional()) notFound();

  const config = await getConfigInstitucion();

  // Sin sesión no hay nada que esperar: es alguien que llegó a esta URL suelta.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <LinkInactivo telefonoAyuda={config.telefono_ayuda} hrefReenvio="/acceso/reenviar" />;
  }

  const admin = createAdminClient();
  const { data: paciente } = await admin
    .from("pacientes")
    .select("id, nombre_completo")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!paciente) {
    return <LinkInactivo telefonoAyuda={config.telefono_ayuda} hrefReenvio="/acceso/reenviar" />;
  }

  // ¿Ya le asignaron algo? Entonces esta pantalla no es su lugar.
  const destino = await destinoDemoPaciente({ pacienteId: paciente.id, userId: user.id });
  if (destino !== ESPERA_DEMO) redirect(destino);

  return (
    <MarcoPaciente>
      <div className="pac-centro">
        {primerNombre(paciente.nombre_completo) && (
          <div className="pac-hola">Hola, {primerNombre(paciente.nombre_completo)}</div>
        )}
        <div className="pac-titulo">Ya estás en sala de espera.</div>
        <p className="pac-parrafo-sec">
          Aguardá que el profesional inicie la consulta. No hace falta que toques nada.
        </p>
      </div>
      <RefrescoSuave />
    </MarcoPaciente>
  );
}
