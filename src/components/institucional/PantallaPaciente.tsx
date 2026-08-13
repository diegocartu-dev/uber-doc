// src/components/institucional/PantallaPaciente.tsx
// El MARCO de la pantalla del paciente institucional + los estados que no
// necesitan interacción. Transplante del mock aprobado (mocks/02-paciente.html
// §2 — "un solo layout, seis estados").
//
// Regla de la pantalla (03-spec §2.3): sin menú, sin footer, SIN SALIDAS DE
// NAVEGACIÓN y jamás un login. El link ES la sesión. Por eso acá no hay ningún
// <a> hacia el resto del sitio: lo único que puede llevar a otra página es la
// acción de ese estado.
//
// Sin "use client": son componentes de presentación puros, así que sirven
// igual dentro de un server component (la landing) que dentro de uno cliente
// (la pantalla del turno).

import "./paciente.css";

/** Fondo + marca + card centrada de 400px. Todo estado vive adentro de esto. */
export function MarcoPaciente({
  institucion,
  children,
}: {
  institucion: string;
  children: React.ReactNode;
}) {
  return (
    <main className="pac-app">
      {/* Placeholder del logo hasta la Etapa 5 (bucket institucion-assets):
          por ahora la marca es el nombre. Mismo criterio que InstitucionTheme. */}
      <div className="pac-marca">{institucion}</div>
      <div className="pac-card">{children}</div>
    </main>
  );
}

/** Encabezado fijo de los estados A/B/D: "Hola, X" + turno + profesional. */
export function EncabezadoTurno({
  primerNombre,
  especialidad,
  fechaLabel,
  hora,
  profesional,
}: {
  primerNombre: string;
  especialidad: string;
  fechaLabel: string;
  hora: string;
  profesional: string;
}) {
  return (
    <>
      {primerNombre && <div className="pac-hola">Hola, {primerNombre}</div>}
      <div className="pac-titulo">Tu turno de {especialidad}</div>
      <div className="pac-fecha tnum">
        <span className="nw">{fechaLabel}</span> — <span className="nw">{hora} hs</span>
      </div>
      <div className="pac-prof nw">{profesional}</div>
    </>
  );
}

function IconoCandado() {
  return (
    <div className="pac-ico-estado">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="5" y="10.5" width="14" height="9" rx="2" />
        <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      </svg>
    </div>
  );
}

/**
 * ESTADO F — "Este enlace ya no está activo".
 *
 * Es la ÚNICA respuesta a un token que no sirve, sea porque no existe, porque
 * venció, porque se revocó o porque el turno se reprogramó. No distingue entre
 * esos casos a propósito: decir "este link venció" confirmaría que el token
 * existió, y la página quedaría como oráculo de tokens ajenos.
 *
 * Nunca es un callejón: siempre ofrece el teléfono de la institución y, cuando
 * el reenvío self-service está disponible, el camino para pedir uno nuevo.
 */
export function LinkInactivo({
  institucion,
  telefonoAyuda,
  hrefReenvio = null,
  cooldownMinutos,
}: {
  institucion: string;
  telefonoAyuda: string | null;
  hrefReenvio?: string | null;
  cooldownMinutos?: number;
}) {
  return (
    <MarcoPaciente institucion={institucion}>
      <div className="pac-centro">
        <IconoCandado />
        <div className="pac-titulo">Este enlace ya no está activo.</div>
        <p className="pac-parrafo-sec" style={{ marginBottom: 16 }}>
          Si tenés un turno, buscá el último mensaje que te mandamos — el enlace nuevo está ahí.
          {telefonoAyuda ? (
            <>
              <br />
              <br />
              ¿No lo encontrás? Llamanos al <span className="nw tnum">{telefonoAyuda}</span>.
            </>
          ) : null}
        </p>
        {hrefReenvio && (
          <>
            <a className="pac-cta-sec" href={hrefReenvio}>
              Reenviarme el enlace
            </a>
            {cooldownMinutos ? (
              <div className="pac-micro">Máximo 1 reenvío cada {cooldownMinutos} minutos</div>
            ) : null}
          </>
        )}
      </div>
    </MarcoPaciente>
  );
}
