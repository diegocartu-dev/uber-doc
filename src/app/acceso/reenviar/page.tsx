export const dynamic = "force-dynamic";

// /acceso/reenviar — "Reenviarme el enlace" (mock 02, estado F).
//
// Sin esta pantalla, el estado F es un callejón: el paciente ve "este enlace ya
// no está activo" y no tiene ninguna manera de salir de ahí salvo llamar por
// teléfono. Es pública a propósito (el que llega no tiene sesión: justamente
// perdió el enlace que se la daba).
//
// Todo lo delicado vive en src/lib/institucional/reenvio.ts: el enlace se manda
// SIEMPRE al contacto del padrón, nunca al que se escribe acá, y la respuesta
// es la misma exista o no el DNI. Esta página solo pinta.
//
// Form nativo, sin JavaScript: tiene que andar en el webview de WhatsApp de un
// teléfono viejo con mala señal.
//
// SOLO instancia institucional: en B2C es 404.

import { notFound } from "next/navigation";
import { esInstitucional } from "@/lib/instancia";
import { getConfigInstitucion } from "@/lib/institucional/config";
import { MarcoPaciente } from "@/components/institucional/PantallaPaciente";
import { metadataPacienteInstitucional } from "@/lib/institucional/metadata";

// Marca blanca también en la pestaña y en la preview: sin esto hereda el
// title del B2C. Ver src/lib/institucional/metadata.ts.
export const generateMetadata = metadataPacienteInstitucional;

export default async function ReenviarAccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string }>;
}) {
  if (!esInstitucional()) notFound();

  const { enviado } = await searchParams;
  const config = await getConfigInstitucion();

  if (enviado) {
    return (
      <MarcoPaciente>
        <div className="pac-centro">
          <div className="pac-titulo">Listo</div>
          {/* Respuesta NEUTRA: no dice si el DNI existe ni a dónde se mandó.
              Decirlo convertiría esta pantalla en un buscador de padrón. */}
          <p className="pac-parrafo-sec">
            Si estás en el padrón, te mandamos el enlace al contacto que tenemos registrado.
            Revisá tus mensajes en unos minutos.
          </p>
          {config.telefono_ayuda && (
            <p className="pac-parrafo-sec" style={{ marginTop: 12 }}>
              Si no te llega, llamanos al{" "}
              <span className="nw tnum">{config.telefono_ayuda}</span>.
            </p>
          )}
        </div>
      </MarcoPaciente>
    );
  }

  return (
    <MarcoPaciente>
      <div className="pac-titulo">Reenviarme el enlace</div>
      <p className="pac-parrafo-sec">
        Poné tu DNI y el celular que diste en el centro de salud. Te mandamos el enlace a ese
        mismo contacto — no a otro.
      </p>
      <form method="POST" action="/acceso/reenviar/enviar">
        <label className="pac-campo">
          <span>DNI (sin puntos)</span>
          <input
            name="dni"
            inputMode="numeric"
            autoComplete="off"
            maxLength={12}
            required
          />
        </label>
        <label className="pac-campo">
          <span>Celular</span>
          <input name="celular" inputMode="tel" autoComplete="tel" maxLength={25} required />
        </label>
        <div style={{ marginTop: 18 }}>
          <button type="submit" className="pac-cta">
            Reenviarme el enlace
          </button>
        </div>
      </form>
      <div className="pac-micro">
        Máximo 1 reenvío cada {config.reenvio_cooldown_minutos} minutos.
      </div>
    </MarcoPaciente>
  );
}
