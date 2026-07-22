// Cartel de conexión de Mercado Pago (pedido Diego 21/07: "un cartel grande
// lindo que redireccione a conectar MP a todos los médicos que tengan ya
// completa su etapa de registro"). Dato que lo motiva: 13 de 20 aprobados
// reales (65%) nunca conectaron MP — el paso post-aprobación era el cementerio
// del funnel, y este componente existía pero quedó huérfano (sin montar) cuando
// BannerActivacion reemplazó al viejo collage.
//
// Se muestra a todo médico APROBADO sin cuenta MP activa (condición en el
// dashboard). Azul (acción/invitación), no naranja (alerta): el registro ya
// está completo, esto es el último empujón. CTA directo al OAuth de MP.
// Sin promesas de tiempo (regla de la casa).

import { Wallet } from "lucide-react";

export default function BannerMercadoPago() {
  return (
    <div
      className="mb-4 rounded-2xl p-6"
      style={{
        border: "1.5px solid #378ADD",
        background: "linear-gradient(135deg, rgba(55,138,221,0.08), rgba(55,138,221,0.02))",
      }}
    >
      <div className="flex items-start gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          style={{ background: "rgba(55,138,221,0.12)" }}
        >
          <Wallet size={24} strokeWidth={1.75} style={{ color: "#378ADD" }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold leading-snug text-gray-900">
            Conectá tu Mercado Pago para empezar a cobrar
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
            Tu registro ya está completo — este es el paso que te habilita a
            atender. Los pacientes pagan la consulta y el dinero va directo a tu
            cuenta de Mercado Pago. Sin esto no podés publicar tu agenda ni
            activar la consulta inmediata.
          </p>
          <a
            href="/api/mp/oauth/start"
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl px-7 py-3 text-[15px] font-semibold text-white transition active:scale-[0.98] sm:w-auto"
            style={{ backgroundColor: "#378ADD" }}
          >
            Conectar Mercado Pago →
          </a>
        </div>
      </div>
    </div>
  );
}
