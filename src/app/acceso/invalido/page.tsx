export const dynamic = "force-dynamic";

// /acceso/invalido — donde termina TODO minteo que no salió bien.
//
// Existe por una razón chica y concreta: el POST de `/acceso/entrar` no puede
// contestar redirigiendo de vuelta al token. Hacerlo metía la credencial en el
// header `Location` de la respuesta (y de ahí a los logs de la plataforma), y
// además invitaba al reintento infinito sobre un enlace ya muerto.
//
// Dos finales, ninguno de los dos dice por qué:
//   · sin `reintento` — el enlace no sirve: el MISMO estado F de siempre.
//   · con `reintento` — la falla fue nuestra y es transitoria: se le pide que
//     vuelva al mensaje y toque el enlace otra vez (el token vive ahí, no acá).
//
// SOLO instancia institucional: en B2C es 404.

import { notFound } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { MarcoPaciente, LinkInactivo } from "@/components/institucional/PantallaPaciente";
import { metadataPacienteInstitucional } from "@/lib/institucional/metadata";

export const generateMetadata = metadataPacienteInstitucional;

export default async function AccesoInvalidoPage({
  searchParams,
}: {
  searchParams: Promise<{ reintento?: string }>;
}) {
  if (!esInstitucional()) notFound();

  const { reintento } = await searchParams;
  const config = await getConfigInstitucion();

  if (!reintento) {
    return (
      <LinkInactivo
        telefonoAyuda={config.telefono_ayuda}
        hrefReenvio="/acceso/reenviar"
        cooldownMinutos={config.reenvio_cooldown_minutos}
      />
    );
  }

  return (
    <MarcoPaciente>
      <div className="pac-centro">
        <div className="pac-titulo">No pudimos abrirte la puerta</div>
        <p className="pac-parrafo-sec">
          Fue un problema nuestro, no tuyo. Volvé al mensaje que te mandamos y tocá el enlace de
          nuevo.
          {config.telefono_ayuda ? (
            <>
              <br />
              <br />
              Si tu consulta es ahora, llamanos al{" "}
              <span className="nw tnum">{config.telefono_ayuda}</span>.
            </>
          ) : null}
        </p>
        <a className="pac-cta-sec" href="/acceso/reenviar">
          Reenviarme el enlace
        </a>
      </div>
    </MarcoPaciente>
  );
}
