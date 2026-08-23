"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, ShieldX, AlertTriangle, FileText, Loader2 } from "lucide-react";

type VerificacionResponse = {
  estado?: string;
  verificada: boolean;
  alterada?: boolean;
  /** Instante real del sello criptográfico. */
  firmado_at?: string;
  /** Fecha de emisión del documento (el acto médico). */
  emitido_at?: string;
  /** El sello se aplicó después de la emisión. */
  sellado_diferido?: boolean;
  /**
   * La plataforma completó/corrigió los datos de identidad del paciente después
   * de la emisión y re-selló (camino 5). Solo fecha y motivo genérico.
   */
  rectificacion?: { at: string; motivo: string } | null;
  algoritmo?: string;
  hash?: string;
  motivo?: string;
  /** El documento salió de una cuenta de DEMOSTRACIÓN (modo demo institucional). */
  demostracion?: boolean;
  medico?: {
    nombre: string;
    especialidad: string;
    matricula: string;
  } | null;
};

type Estado =
  | "cargando"
  | "verificada"
  | "sin_sello"
  | "invalida"
  | "alterada"
  | "no_encontrada"
  | "error";

function formatFechaLarga(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function formatHoraAR(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

/**
 * AVISO DE DEMOSTRACIÓN — la otra mitad de la marca de agua del PDF.
 *
 * El papel de una demo se ve completo a propósito (es lo que se está
 * mostrando), y su QR funciona de verdad. Entonces esta página es exactamente
 * donde alguien que recibió ese papel va a venir a preguntar si vale — una
 * farmacia, un empleador, el propio participante al día siguiente. Si acá
 * dijera "documento verificado" a secas, la verificación estaría certificando
 * lo que la marca de agua niega.
 *
 * Va ARRIBA de todo y en rojo: la respuesta a "¿esto vale?" no puede estar al
 * final, entre la letra chica.
 */
function AvisoDemostracion() {
  return (
    <div
      className="mb-4 rounded-xl p-4"
      style={{ background: "#FDECEC", border: "1px solid #E24B4A" }}
    >
      <p className="text-sm font-semibold" style={{ color: "#B03A39" }}>
        Documento de demostración — sin validez legal
      </p>
      <p className="mt-1 text-sm" style={{ color: "#8A2E2D" }}>
        Se generó en una prueba del sistema, con una cuenta de demostración. No es una
        prescripción ni un certificado médico: no debe dispensarse ni presentarse ante nadie.
      </p>
    </div>
  );
}

export default function VerificarRecetaClient({ recetaId }: { recetaId: string }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [data, setData] = useState<VerificacionResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function verificar() {
      try {
        const res = await fetch(`/api/verificar/${recetaId}`);

        if (res.status === 429) {
          setErrorMsg("Demasiadas consultas. Intentá en un minuto.");
          setEstado("error");
          return;
        }

        const json: VerificacionResponse = await res.json();
        setData(json);

        // El backend manda `estado` explícito. Se distingue "sin sello"
        // (documento legítimo que nunca se selló) de "firma no válida"
        // (hay sello y no verifica) — antes ambos caían en la pantalla roja.
        switch (json.estado) {
          case "no_encontrado":
            setEstado("no_encontrada");
            return;
          case "sin_sello":
            setEstado("sin_sello");
            return;
          case "alterada":
            setEstado("alterada");
            return;
          case "verificada":
            setEstado("verificada");
            return;
          case "invalida":
            setEstado("invalida");
            return;
          case "error":
            setErrorMsg("No pudimos verificar el documento. Intentá de nuevo.");
            setEstado("error");
            return;
        }

        // Compatibilidad con respuestas viejas (sin `estado`).
        if (json.motivo) setEstado("no_encontrada");
        else if (json.alterada) setEstado("alterada");
        else if (json.verificada) setEstado("verificada");
        else setEstado("invalida");
      } catch {
        setErrorMsg("Error de conexión. Intentá de nuevo.");
        setEstado("error");
      }
    }

    verificar();
  }, [recetaId]);

  // ─── Cargando ──────────────────────────────────────────────────────
  // El aviso se arma una vez y se pinta como PRIMER hijo de cada tarjeta de
  // resultado: no importa si el documento verificó bien, si le falta el sello o
  // si está alterado — lo primero que hay que saber de un papel de demo es que
  // es de demo.
  const avisoDemo = data?.demostracion ? <AvisoDemostracion /> : null;

  if (estado === "cargando") {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm" style={{ border: "0.5px solid #e5e7eb" }}>
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#378ADD]" />
        <p className="mt-4 text-sm text-gray-500">Verificando receta...</p>
      </div>
    );
  }

  // ─── Error / Rate limit ────────────────────────────────────────────
  if (estado === "error") {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm" style={{ border: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#E24B4A]/10">
          <AlertTriangle className="h-7 w-7 text-[#E24B4A]" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Error</h2>
        <p className="mt-2 text-sm text-gray-600">{errorMsg}</p>
      </div>
    );
  }

  // ─── No encontrada ─────────────────────────────────────────────────
  if (estado === "no_encontrada") {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm" style={{ border: "0.5px solid #e5e7eb" }}>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          <ShieldX className="h-7 w-7 text-gray-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Documento no encontrado</h2>
        <p className="mt-2 text-sm text-gray-600">
          No se encontró un documento con este identificador. Verificá que la URL
          sea correcta.
        </p>
        <p className="mt-4 text-xs text-gray-400">
          Si creés que es un error, contactá a{" "}
          <a href="https://docto.com.ar" className="text-[#378ADD] hover:underline">
            docto.com.ar
          </a>
        </p>
      </div>
    );
  }

  // ─── Sin sello ─────────────────────────────────────────────────────
  // Documento real, emitido por un profesional identificado, que nunca recibió
  // sello electrónico. NO es un documento sospechoso: decirlo en rojo
  // perjudicaría al paciente. Estado neutro y explicación honesta.
  if (estado === "sin_sello") {
    return (
      <div className="rounded-2xl bg-white p-8 shadow-sm" style={{ border: "1px solid #BA7517" }}>
        {avisoDemo}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#BA7517]/10">
            <FileText className="h-7 w-7 text-[#BA7517]" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            Documento sin sello de verificación
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Este documento existe en Docto, pero no tiene un sello electrónico
            que permita verificar su contenido en esta página. Puede ser un
            documento emitido antes de que el sellado automático estuviera
            disponible.
          </p>
          <p className="mt-3 text-sm text-gray-600">
            No significa que sea inválido ni que haya sido adulterado: significa
            que su autenticidad se confirma directamente con el profesional que
            lo emitió.
          </p>
        </div>

        {data?.medico && (
          <div className="mt-6 rounded-lg bg-gray-50 p-4">
            <p className="text-xs font-medium tracking-wide text-gray-400">
              PROFESIONAL QUE LO EMITIÓ
            </p>
            <p className="mt-2 text-sm font-semibold text-gray-900">{data.medico.nombre}</p>
            <p className="mt-0.5 text-sm text-gray-600">{data.medico.especialidad}</p>
            <p className="mt-0.5 text-sm text-gray-500">{data.medico.matricula}</p>
          </div>
        )}
      </div>
    );
  }

  // ─── Alterada ──────────────────────────────────────────────────────
  if (estado === "alterada") {
    return (
      <div className="rounded-2xl bg-[#E24B4A]/5 p-8 text-center shadow-sm" style={{ border: "1px solid #E24B4A" }}>
        {avisoDemo}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#E24B4A]/10">
          <AlertTriangle className="h-7 w-7 text-[#E24B4A]" />
        </div>
        <h2 className="text-lg font-semibold text-[#E24B4A]">
          Documento alterado
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          El contenido de este documento fue modificado después de ser firmado.
          La firma electrónica ya no se corresponde con el contenido.
        </p>
        {data?.medico && (
          <div className="mt-4 rounded-lg bg-white p-3 text-left">
            <p className="text-xs text-gray-400">Firmante original</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{data.medico.nombre}</p>
            <p className="text-xs text-gray-500">{data.medico.especialidad} — {data.medico.matricula}</p>
            {data.emitido_at && (
              <p className="mt-1 text-xs text-gray-500">
                Emitido: {formatFechaLarga(data.emitido_at)} — {formatHoraAR(data.emitido_at)} hs
              </p>
            )}
            {data.firmado_at && (
              <p className="mt-1 text-xs text-gray-500">
                Sello electrónico aplicado: {formatFechaLarga(data.firmado_at)} —{" "}
                {formatHoraAR(data.firmado_at)} hs
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Inválida (firma no verifica) ──────────────────────────────────
  if (estado === "invalida") {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm" style={{ border: "1px solid #D85A30" }}>
        {avisoDemo}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#D85A30]/10">
          <ShieldX className="h-7 w-7 text-[#D85A30]" />
        </div>
        <h2 className="text-lg font-semibold text-[#D85A30]">
          Firma no válida
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Este documento tiene un sello electrónico, pero la firma no verifica
          contra la clave del profesional. No podemos confirmar su autenticidad.
        </p>
      </div>
    );
  }

  // ─── Verificada ────────────────────────────────────────────────────
  const fechaFirma = formatFechaLarga(data?.firmado_at);
  const horaFirma = formatHoraAR(data?.firmado_at);
  const fechaEmision = formatFechaLarga(data?.emitido_at);
  const horaEmision = formatHoraAR(data?.emitido_at);

  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm" style={{ border: "1px solid #1D9E75" }}>
      {avisoDemo}
      {/* Badge verificada */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#1D9E75]/10">
          <ShieldCheck className="h-7 w-7 text-[#1D9E75]" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">
          Documento verificado
        </h2>
        {/*
          "desde entonces" ata la integridad al instante que el lector tenga en
          la cabeza — y tres bloques más abajo esta misma página le muestra la
          fecha de EMISIÓN. En un documento de sellado diferido eso afirmaría
          algo que el sello no certifica: la integridad criptográfica entre la
          emisión y el sellado. Esa ventana está sostenida por otra evidencia
          (`documentos` es insert-only), que no es criptográfica y por lo tanto
          no se declara acá. Con sello diferido se dice exactamente desde cuándo
          rige; el bloque de las dos fechas explica el resto.
        */}
        <p className="mt-1 text-sm text-gray-500">
          {data?.rectificacion
            ? "Este documento fue firmado electrónicamente. Su contenido clínico no fue alterado; los datos de identidad del paciente fueron completados por Docto después de la emisión (ver fechas)."
            : data?.sellado_diferido
              ? "Este documento fue firmado electrónicamente y su contenido no fue alterado desde que se aplicó el sello."
              : "Este documento fue firmado electrónicamente y su contenido no fue alterado desde entonces."}
        </p>
      </div>

      {/* Datos del firmante */}
      {data?.medico && (
        <div className="mt-6 rounded-lg bg-gray-50 p-4">
          <p className="text-xs font-medium tracking-wide text-gray-400">
            FIRMANTE
          </p>
          <p className="mt-2 text-sm font-semibold text-gray-900">
            {data.medico.nombre}
          </p>
          <p className="mt-0.5 text-sm text-gray-600">
            {data.medico.especialidad}
          </p>
          <p className="mt-0.5 text-sm text-gray-500">
            {data.medico.matricula}
          </p>
        </div>
      )}

      {/* Datos técnicos de la firma.
          La fecha salió de acá y pasó al bloque de fechas de abajo, donde se
          muestra junto a la de emisión y con su etiqueta correcta ("sello
          electrónico aplicado"). No se oculta nada: se dice mejor. */}
      <div className="mt-4 space-y-2 rounded-lg bg-gray-50 p-4">
        <p className="text-xs font-medium tracking-wide text-gray-400">
          DATOS DE LA FIRMA
        </p>
        {data?.algoritmo && (
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Algoritmo</span>
            <span className="text-xs font-medium text-gray-700">
              {data.algoritmo}
            </span>
          </div>
        )}
        {data?.hash && (
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Hash</span>
            <span className="truncate text-right font-mono text-xs text-gray-500">
              {data.hash.substring(0, 16).toUpperCase()}...
            </span>
          </div>
        )}
      </div>

      {/* ─── Las dos fechas del documento ──────────────────────────────────
          Se muestra SIEMPRE, no solo cuando el sello es posterior. Dos razones:
          el bloque no es un caso especial que salte a la vista en los
          documentos históricos, y en el caso normal las dos fechas coinciden —
          que es la mejor prueba visual de que Docto no juega con las fechas.

          Acá está la verdad completa: es donde un tercero (una farmacia, un
          empleador) viene a verificar de verdad, y no se le oculta nada.
          Sigue en verde: no hay nada anómalo que advertir. */}
      {fechaFirma && (
        <div className="mt-4 space-y-2 rounded-lg bg-gray-50 p-4">
          <p className="text-xs font-medium tracking-wide text-gray-400">
            SOBRE LAS FECHAS DE ESTE DOCUMENTO
          </p>

          {data?.sellado_diferido && (
            <p className="text-xs leading-relaxed text-gray-600">
              El contenido es el original. Lo que se agregó después fue el sello
              que permite verificarlo.
            </p>
          )}

          {fechaEmision && (
            <div className="flex flex-wrap justify-between gap-x-3">
              <span className="text-xs text-gray-500">Emitido</span>
              <span className="text-xs font-medium text-gray-700">
                {fechaEmision} — {horaEmision} hs
              </span>
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-x-3">
            <span className="text-xs text-gray-500">Sello electrónico aplicado</span>
            <span className="text-xs font-medium text-gray-700">
              {fechaFirma} — {horaFirma} hs
            </span>
          </div>

          {data?.sellado_diferido && (
            <p className="pt-1 text-xs leading-relaxed text-gray-600">
              Este documento se emitió antes de que Docto aplicara el sello
              electrónico en forma automática. El sello se agregó después, sobre
              el mismo contenido que el profesional emitió y entregó ese día: por
              eso las dos fechas son distintas. La primera es la del acto médico;
              la segunda, la del sello que permite verificarlo en esta página. El
              documento no fue modificado.
            </p>
          )}

          {/* Rectificación de identidad (camino 5). Se dice con todas las
              letras y sin datos del paciente: qué se completó (los datos de
              identidad que la plataforma carga sola), qué NO se tocó (lo que
              escribió el profesional) y que el sello actual cubre el documento
              completo. La fecha del sello de arriba es la de esta rectificación. */}
          {data?.rectificacion && (
            <p className="pt-1 text-xs leading-relaxed text-gray-600">
              Los datos de identidad del paciente impresos en este documento —que
              Docto completa automáticamente desde su ficha— fueron rectificados
              por la plataforma después de la emisión, y el documento volvió a
              sellarse con la firma del profesional. El contenido clínico que el
              profesional emitió no fue modificado. El sello electrónico de arriba
              corresponde al documento completo y rectificado; la fecha de
              emisión es la del acto médico original.
            </p>
          )}
        </div>
      )}

      {/* Legal */}
      <p className="mt-4 text-center text-[11px] leading-relaxed text-gray-400">
        Firmado electrónicamente en los términos del art. 5 de la Ley 25.506.
        Esta página no muestra información médica del paciente por razones de
        privacidad.
      </p>
    </div>
  );
}
