"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useRef, useEffect, useTransition } from "react";
import { crearConsulta } from "@/app/clinica/actions";

const SINTOMAS_EMERGENCIA = [
  "Dolor de pecho",
  "Dificultad para respirar",
  "Pérdida de consciencia",
];

const SINTOMAS_OPCIONES = [
  "Fiebre",
  "Dolor de cabeza",
  "Dolor de pecho",
  "Dolor abdominal",
  "Náuseas o vómitos",
  "Diarrea",
  "Tos",
  "Dificultad para respirar",
  "Dolor de garganta",
  "Congestión nasal",
  "Dolor muscular o articular",
  "Fatiga o cansancio",
  "Mareos",
  "Pérdida de consciencia",
  "Erupción cutánea",
  "Problemas para dormir",
  "Ansiedad o estrés",
  "Dolor de espalda",
  "Problemas digestivos",
  "Otro",
];

const TIEMPO_OPCIONES = [
  "Menos de 24 horas",
  "1-3 días",
  "4-7 días",
  "1-2 semanas",
  "Más de 2 semanas",
  "Más de 1 mes",
];

export default function TriagePage() {
  const searchParams = useSearchParams();
  const medicoId = searchParams.get("medicoId") ?? "";
  const especialidad = searchParams.get("especialidad") ?? "";

  const [paso, setPaso] = useState(1);

  // Paso 1: Términos
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollCompleto, setScrollCompleto] = useState(false);
  const [checkTerminos, setCheckTerminos] = useState(false);
  const [checkMayorEdad, setCheckMayorEdad] = useState(false);

  // Paso 2: Triage
  const [motivo, setMotivo] = useState("");
  const [sintomas, setSintomas] = useState<string[]>([]);
  const [tiempo, setTiempo] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);

  const tieneEmergencia = sintomas.some((s) => SINTOMAS_EMERGENCIA.includes(s));

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const llegaAlFinal = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    if (llegaAlFinal) setScrollCompleto(true);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Si el contenido no hace scroll (ya se ve todo), habilitar directamente
    if (el.scrollHeight <= el.clientHeight + 20) {
      setScrollCompleto(true);
    }
  }, []);

  function toggleSintoma(s: string) {
    setSintomas((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  function handleEnviarTriage() {
    if (!motivo.trim()) {
      setError("El motivo de consulta es obligatorio.");
      return;
    }
    if (sintomas.length === 0) {
      setError("Seleccioná al menos un síntoma.");
      return;
    }
    if (!tiempo) {
      setError("Indicá hace cuánto tiempo tenés los síntomas.");
      return;
    }
    if (tieneEmergencia) return;

    setError(null);
    setMostrarConfirmacion(true);
  }

  function handleConfirmarConsulta() {
    setMostrarConfirmacion(false);
    startTransition(async () => {
      const result = await crearConsulta(medicoId, especialidad, motivo, sintomas);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  const inputClass =
    "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="min-h-full bg-gray-50">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🩺</span>
            <span className="text-xl font-bold text-gray-900">Uber Doc</span>
          </div>
          <Link
            href="/clinica"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Volver a la clínica
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-4 py-10">
        {/* Indicador de pasos */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
              paso === 1
                ? "bg-blue-600 text-white"
                : "bg-green-500 text-white"
            }`}
          >
            {paso > 1 ? "✓" : "1"}
          </div>
          <div className="h-px w-12 bg-gray-300" />
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
              paso === 2
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-500"
            }`}
          >
            2
          </div>
        </div>

        {/* PASO 1: Términos y condiciones */}
        {paso === 1 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-gray-900">
              Términos y condiciones
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Leé los términos completos antes de continuar
            </p>

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="mt-4 h-96 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-5 text-sm leading-relaxed text-gray-700"
            >
              <h2 className="mb-3 text-base font-semibold text-gray-900">
                TÉRMINOS Y CONDICIONES DE USO — UBER DOC
              </h2>
              <p className="mb-2 text-xs text-gray-500">
                Última actualización: marzo 2026
              </p>

              <h3 className="mb-2 mt-4 font-semibold text-gray-900">
                1. Identidad y mayoría de edad
              </h3>
              <p className="mb-3">
                El usuario declara ser mayor de 18 años de edad y que los datos
                proporcionados durante el registro son verídicos, completos y
                actualizados. El uso de la plataforma por parte de menores de
                edad requiere el consentimiento y supervisión de un
                representante legal. Uber Doc se reserva el derecho de solicitar
                documentación que acredite la identidad del usuario en cualquier
                momento.
              </p>

              <h3 className="mb-2 mt-4 font-semibold text-gray-900">
                2. Suplantación de identidad
              </h3>
              <p className="mb-3">
                La suplantación de identidad constituye un delito penal tipificado
                en el artículo 292 y concordantes del Código Penal de la República
                Argentina. Cualquier intento de utilizar datos de terceros sin
                autorización, falsificar documentación o hacerse pasar por otra
                persona será denunciado ante las autoridades competentes. Uber Doc
                colaborará con las fuerzas de seguridad y la justicia en toda
                investigación relacionada con suplantación de identidad.
              </p>

              <h3 className="mb-2 mt-4 font-semibold text-gray-900">
                3. Limitaciones del servicio de telemedicina
              </h3>
              <p className="mb-3">
                El servicio de telemedicina ofrecido a través de Uber Doc tiene
                limitaciones inherentes a la atención médica a distancia. El
                profesional médico no puede realizar examen físico directo,
                procedimientos invasivos ni diagnósticos que requieran estudios
                complementarios presenciales. La telemedicina es complementaria y
                no reemplaza la atención médica presencial cuando esta sea
                necesaria. El profesional médico podrá derivar al paciente a
                atención presencial cuando lo considere necesario según su
                criterio profesional.
              </p>

              <h3 className="mb-2 mt-4 font-semibold text-gray-900">
                4. Servicio de emergencias — Uber Doc NO es un servicio de
                emergencias
              </h3>
              <p className="mb-3">
                <strong>
                  Uber Doc NO es un servicio de emergencias médicas.
                </strong>{" "}
                Ante una emergencia médica, el usuario debe comunicarse
                inmediatamente con el servicio de emergencias médicas (SAME) al
                número <strong>107</strong> o con el servicio de emergencias
                general al número <strong>911</strong>. No utilice esta
                plataforma en caso de: infarto, accidente cerebrovascular (ACV),
                traumatismos graves, hemorragias severas, dificultad respiratoria
                aguda, pérdida de consciencia, reacciones alérgicas graves
                (anafilaxia), intoxicaciones agudas, o cualquier otra situación
                que ponga en riesgo inmediato la vida.
              </p>

              <h3 className="mb-2 mt-4 font-semibold text-gray-900">
                5. Consentimiento informado (Ley 26.529)
              </h3>
              <p className="mb-3">
                De conformidad con la Ley 26.529 de Derechos del Paciente en su
                Relación con los Profesionales e Instituciones de la Salud, el
                usuario presta su consentimiento informado para recibir atención
                médica a través de medios telemáticos. El paciente tiene derecho
                a: recibir información clara y comprensible sobre su estado de
                salud, aceptar o rechazar determinadas terapias o procedimientos,
                recibir atención médica con respeto a su dignidad, intimidad y
                autonomía de la voluntad, acceder a su historia clínica, y
                revocar el consentimiento en cualquier momento.
              </p>

              <h3 className="mb-2 mt-4 font-semibold text-gray-900">
                6. Protección de datos personales (Ley 25.326)
              </h3>
              <p className="mb-3">
                Uber Doc cumple con la Ley 25.326 de Protección de Datos
                Personales de la República Argentina. Los datos personales y de
                salud recopilados serán tratados con estricta confidencialidad y
                utilizados exclusivamente para la prestación del servicio de
                telemedicina. El usuario tiene derecho a acceder, rectificar,
                actualizar y suprimir sus datos personales. Los datos de salud
                son considerados datos sensibles y reciben protección reforzada.
                La información médica es compartida únicamente con el profesional
                tratante y no será cedida a terceros sin consentimiento expreso
                del usuario, excepto cuando medie obligación legal.
              </p>

              <h3 className="mb-2 mt-4 font-semibold text-gray-900">
                7. Política de cancelaciones y reembolsos
              </h3>
              <p className="mb-3">
                El paciente puede cancelar una consulta sin cargo antes de que el
                médico la acepte. Una vez aceptada la consulta y realizado el
                pago, se aplicarán las siguientes políticas: cancelación antes
                del inicio de la videollamada genera un reembolso del 100%;
                cancelación durante los primeros 5 minutos de la videollamada
                genera un reembolso del 50%; no se otorgarán reembolsos una vez
                transcurridos los primeros 5 minutos de consulta. Los reembolsos
                se procesarán por el mismo medio de pago utilizado en un plazo de
                5 a 10 días hábiles.
              </p>

              <h3 className="mb-2 mt-4 font-semibold text-gray-900">
                8. Responsabilidad del médico
              </h3>
              <p className="mb-3">
                Los profesionales médicos que utilizan Uber Doc son profesionales
                independientes debidamente matriculados. Cada médico es
                responsable de sus actos profesionales, diagnósticos, indicaciones
                y prescripciones de conformidad con la Ley 17.132 de Ejercicio de
                la Medicina. Uber Doc no ejerce ningún tipo de dirección,
                supervisión ni control sobre el criterio médico de los
                profesionales.
              </p>

              <h3 className="mb-2 mt-4 font-semibold text-gray-900">
                9. Responsabilidad de Uber Doc como plataforma intermediaria
              </h3>
              <p className="mb-3">
                Uber Doc actúa exclusivamente como plataforma tecnológica
                intermediaria que facilita la conexión entre pacientes y
                profesionales médicos. Uber Doc no presta servicios médicos, no
                emite diagnósticos ni prescripciones, y no es responsable por los
                actos profesionales de los médicos registrados en la plataforma.
                Uber Doc garantiza el correcto funcionamiento técnico de la
                plataforma y la seguridad de los datos transmitidos.
              </p>

              <h3 className="mb-2 mt-4 font-semibold text-gray-900">
                10. Uso correcto del servicio
              </h3>
              <p className="mb-3">
                Queda expresamente prohibido el uso de la plataforma para: obtener
                recetas médicas sin una consulta médica real y legítima, simular
                síntomas o condiciones médicas con fines fraudulentos, grabar o
                difundir las consultas médicas sin consentimiento de ambas partes,
                utilizar la plataforma con fines distintos a la atención médica,
                y cualquier otro uso que contravenga la legislación vigente o los
                presentes términos y condiciones.
              </p>

              <h3 className="mb-2 mt-4 font-semibold text-gray-900">
                11. Jurisdicción y ley aplicable
              </h3>
              <p className="mb-3">
                Los presentes términos y condiciones se rigen por las leyes de la
                República Argentina. Para cualquier controversia derivada del uso
                de la plataforma, las partes se someten a la jurisdicción de los
                Tribunales Ordinarios de la Ciudad Autónoma de Buenos Aires,
                renunciando a cualquier otro fuero o jurisdicción que pudiera
                corresponderles.
              </p>

              <div className="mt-6 rounded-lg bg-blue-50 p-4 text-center text-xs text-blue-700">
                — Fin de los Términos y Condiciones —
              </div>
            </div>

            {!scrollCompleto && (
              <p className="mt-2 text-center text-xs text-amber-600">
                Desplazá hacia abajo para leer todos los términos
              </p>
            )}

            <div className="mt-5 space-y-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  disabled={!scrollCompleto}
                  checked={checkTerminos}
                  onChange={(e) => setCheckTerminos(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                />
                <span
                  className={`text-sm ${
                    scrollCompleto ? "text-gray-700" : "text-gray-400"
                  }`}
                >
                  Leí y acepto los términos y condiciones
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  disabled={!scrollCompleto}
                  checked={checkMayorEdad}
                  onChange={(e) => setCheckMayorEdad(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                />
                <span
                  className={`text-sm ${
                    scrollCompleto ? "text-gray-700" : "text-gray-400"
                  }`}
                >
                  Soy mayor de edad y mis datos son verídicos
                </span>
              </label>
            </div>

            <button
              disabled={!checkTerminos || !checkMayorEdad}
              onClick={() => setPaso(2)}
              className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continuar
            </button>
          </div>
        )}

        {/* PASO 2: Triage médico */}
        {paso === 2 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-gray-900">Triage médico</h1>
            <p className="mt-1 text-sm text-gray-500">
              Contanos sobre tu consulta para que el médico pueda prepararse
            </p>

            {error && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Alerta de emergencia */}
            {tieneEmergencia && (
              <div className="mt-4 rounded-xl border-2 border-red-500 bg-red-50 p-5">
                <div className="flex items-center gap-2 text-lg font-bold text-red-700">
                  <span className="text-2xl">🚨</span>
                  EMERGENCIA MÉDICA
                </div>
                <p className="mt-2 text-sm font-medium text-red-700">
                  Los síntomas que seleccionaste pueden indicar una emergencia
                  médica que requiere atención presencial inmediata.
                </p>
                <div className="mt-3 rounded-lg bg-red-100 p-4">
                  <p className="text-center text-lg font-bold text-red-800">
                    Llamá al 107 (SAME) o 911 de inmediato
                  </p>
                </div>
                <p className="mt-3 text-xs text-red-600">
                  Uber Doc no es un servicio de emergencias. No podemos
                  continuar con la consulta virtual si presentás estos síntomas.
                </p>
              </div>
            )}

            <div className="mt-6 space-y-5">
              {/* Motivo de consulta */}
              <div>
                <label htmlFor="motivo" className="block text-sm font-medium text-gray-700">
                  Motivo de consulta *
                </label>
                <textarea
                  id="motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  required
                  rows={3}
                  className={inputClass + " resize-none"}
                  placeholder="Describí brevemente por qué querés consultar..."
                />
              </div>

              {/* Síntomas */}
              <div>
                <p className="block text-sm font-medium text-gray-700">
                  Síntomas principales *
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Seleccioná todos los que apliquen
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SINTOMAS_OPCIONES.map((s) => {
                    const seleccionado = sintomas.includes(s);
                    const esEmergencia = SINTOMAS_EMERGENCIA.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSintoma(s)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          seleccionado
                            ? esEmergencia
                              ? "border-red-300 bg-red-100 text-red-700"
                              : "border-blue-300 bg-blue-100 text-blue-700"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tiempo */}
              <div>
                <label htmlFor="tiempo" className="block text-sm font-medium text-gray-700">
                  ¿Hace cuánto tiempo tenés estos síntomas? *
                </label>
                <select
                  id="tiempo"
                  value={tiempo}
                  onChange={(e) => setTiempo(e.target.value)}
                  required
                  className={inputClass}
                >
                  <option value="" disabled>
                    Seleccioná una opción
                  </option>
                  {TIEMPO_OPCIONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setPaso(1)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Atrás
              </button>
              <button
                disabled={isPending || tieneEmergencia}
                onClick={handleEnviarTriage}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Enviando..." : "Entrar a la sala de espera"}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Popup de confirmación */}
      {mostrarConfirmacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="text-center">
              <span className="text-4xl">⚠️</span>
              <h2 className="mt-3 text-lg font-bold text-gray-900">
                Antes de continuar
              </h2>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-gray-700">
              Uber Doc <strong>NO</strong> es un servicio de emergencias
              médicas. Si tu situación es urgente o sentís que empeora, no
              esperes — llamá al <strong>107</strong> (SAME) o al{" "}
              <strong>911</strong> de inmediato.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-gray-700">
              Este servicio es para consultas médicas no urgentes que pueden
              atenderse de forma virtual.
            </p>
            <p className="mt-3 text-sm font-medium text-gray-900">
              ¿Tu consulta es no urgente y podés esperar la atención del médico?
            </p>

            <div className="mt-6 space-y-3">
              <button
                disabled={isPending}
                onClick={handleConfirmarConsulta}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending
                  ? "Enviando..."
                  : "Sí, es una consulta no urgente — continuar"}
              </button>
              <a
                href="tel:107"
                className="block w-full rounded-lg bg-red-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-red-700"
              >
                Es una urgencia — llamar al 107
              </a>
              <button
                onClick={() => setMostrarConfirmacion(false)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Volver al triage
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
