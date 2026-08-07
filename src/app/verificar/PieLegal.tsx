/**
 * Pie legal de la verificación pública. Vive acá —y no copiado en cada página—
 * porque el problema que arregló fue justamente que dos textos sobre el sello
 * divergieran: el pie afirmaba en general algo que la tarjeta negaba para el
 * documento que el lector tenía delante.
 *
 * Regla: este pie describe el MECANISMO. Lo que pasa con un documento concreto
 * —si tiene sello, cuándo se emitió, cuándo se le aplicó— lo dice la tarjeta de
 * ese documento, y solo ella. Nada acá puede afirmar ni negar el estado de un
 * documento en particular.
 */
export default function PieLegal() {
  return (
    <footer className="border-t border-gray-100 bg-white px-4 py-6">
      <div className="mx-auto max-w-lg">
        <p className="text-[11px] leading-relaxed text-gray-400">
          Docto — Plataforma de telemedicina habilitada por Ley 27.553 y Decreto
          63/2024. Los documentos médicos emitidos por Docto se firman
          electrónicamente en los términos del art. 5 de la Ley 25.506. Esta
          página informa, para cada documento, si tiene sello, cuándo se emitió y
          cuándo se le aplicó el sello.
        </p>
        <p className="mt-1 text-[11px] text-gray-400">
          Esta página permite verificar la autenticidad de los documentos médicos
          emitidos electrónicamente. No se muestra información médica del
          paciente.
        </p>
      </div>
    </footer>
  );
}
