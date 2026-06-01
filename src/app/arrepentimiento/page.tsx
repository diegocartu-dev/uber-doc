import type { Metadata } from "next";
import Link from "next/link";
import { Stethoscope } from "lucide-react";

export const metadata: Metadata = {
  title: "Botón de arrepentimiento — Docto",
  description: "Ejercé tu derecho de arrepentimiento de una contratación a distancia en Docto.",
};

// Botón de arrepentimiento (Res. 1033/2021 Sec. Comercio Interior).
// La norma exige un acceso directo, visible y con ese nombre literal, que
// permita gestionar la revocación de forma simple y sin costo. Docto NO crea
// una mecánica nueva: enruta a las acciones que ya existen (cancelar consulta /
// dar de baja la cuenta), que son las vías prácticas de arrepentimiento.
export default function ArrepentimientoPage() {
  return (
    <div className="min-h-full bg-white px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <Stethoscope size={28} strokeWidth={2} color="var(--color-brand)" />
          <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>docto</span>
        </Link>

        <article className="prose prose-sm prose-gray max-w-none">
          <h1 className="text-center text-2xl font-bold text-gray-900">Botón de arrepentimiento</h1>
          <p className="text-center text-sm text-gray-500">Resolución 1033/2021 — Secretaría de Comercio</p>

          <p className="mt-6">
            Si te arrepentiste de una contratación que hiciste a distancia en Docto, podés ejercer tu
            derecho de arrepentimiento de forma simple y sin costo. Acá te explicamos cómo, según el caso.
          </p>

          <h2>Si tenés una consulta agendada o pagada</h2>
          <p>
            Podés cancelarla desde tu panel. El reembolso se rige por la política de cancelaciones de
            nuestros <Link href="/terminos" className="underline">Términos y Condiciones</Link> (§6):
            cancelación de un turno con más de 48 hs de anticipación, reembolso del 100%; si el
            profesional cancela, reprogramás o recibís el 100%; en Consulta Inmediata, si ningún
            profesional la toma en 30 minutos, reembolso del 100%.
          </p>
          <p>
            <Link
              href="/mis-consultas"
              className="inline-block rounded-xl px-6 py-2.5 text-sm font-medium text-white no-underline active:scale-[0.97] transition-all duration-100"
              style={{ backgroundColor: "#378ADD" }}
            >
              Ir a mis consultas
            </Link>
          </p>

          <h2>Si querés dar de baja tu cuenta</h2>
          <p>
            Podés solicitar la eliminación de tu cuenta y de tus datos en cualquier momento, sin costo
            ni penalidad. Escribinos a <a href="mailto:soporte@docto.com.ar" className="underline">soporte@docto.com.ar</a> con
            el asunto <strong>“Arrepentimiento / Baja de cuenta”</strong> desde el correo asociado a tu
            cuenta, y procesamos la baja. Los profesionales pueden además darse de baja directamente
            desde su perfil.
          </p>

          <h2>Tené en cuenta</h2>
          <p>
            El derecho de revocación de 10 días previsto en el art. 34 de la Ley 24.240 no resulta
            aplicable a las consultas ya agendadas para una fecha y hora determinadas (servicio
            excluido de la revocación), las cuales se rigen por la política de cancelaciones. El presente
            canal te permite, de todos modos, gestionar la baja de cualquier contratación a distancia de
            forma directa.
          </p>

          <p className="text-sm text-gray-500">
            ¿Dudas con un reclamo de consumo? Ver la sección <Link href="/terminos" className="underline">Defensa del Consumidor</Link> en
            nuestros Términos y Condiciones.
          </p>
        </article>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-block rounded-xl px-6 py-2.5 text-sm font-medium text-white active:scale-[0.97] transition-all duration-100"
            style={{ backgroundColor: "#378ADD" }}
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
