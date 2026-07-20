// Strip de preparación para el flujo de Didit (spec Sofía 20/07, addendum).
// Cuenta QUÉ va a hacer el médico adentro y en qué orden — reemplaza al viejo
// "Vas a necesitar" (misma información, contada mejor). La instrucción del paso 2
// va en negrita NEGRA a propósito: es una instrucción, no una alerta — el botón
// de Didit para iniciar el escaneo facial es poco visible y el médico tiene que
// salir de acá sabiendo que existe (caso Diego + Lecys, 20/07/2026).
// Follow-up documentado: cuando el Style Editor de Didit fije el label definitivo
// del botón, citarlo textual entre comillas en el paso 2.

const AZUL = "#378ADD";

export default function PasosDidit() {
  return (
    <div className="mt-5 text-left">
      <p className="text-sm font-semibold text-gray-900">
        En Didit vas a hacer dos pasos:
      </p>
      <ol className="mt-2 space-y-2">
        {[
          <>Foto de tu DNI — tenelo a mano.</>,
          <>
            Selfie:{" "}
            <strong className="font-semibold text-gray-900">
              tocá el botón para iniciar el escaneo de tu cara
            </strong>{" "}
            — no empieza solo.
          </>,
        ].map((contenido, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
              style={{ background: "rgba(55,138,221,0.1)", color: AZUL }}
            >
              {i + 1}
            </span>
            <span className="text-sm leading-snug text-gray-700">{contenido}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
