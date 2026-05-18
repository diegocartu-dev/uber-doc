"use client";

interface Props {
  mpConectado: boolean;
}

export default function BannerMercadoPago({ mpConectado }: Props) {
  if (mpConectado) return null;

  return (
    <div className="mb-4 rounded-xl p-5" style={{ background: "#EBF4FF", border: "1px solid #378ADD" }}>
      {/* Logo MP */}
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="6" fill="#009EE3" />
        <path d="M8 16c0-2.5 1.5-5 4.5-5 2 0 3 1 3.5 2 .5-1 1.5-2 3.5-2 3 0 4.5 2.5 4.5 5s-2 6-8 9c-6-3-8-6.5-8-9z" fill="white" />
      </svg>

      <p className="mt-3 text-sm font-semibold text-gray-900">
        Conectá Mercado Pago para recibir pagos
      </p>
      <p className="mt-1 text-sm text-gray-600">
        Tus pacientes pagan online y vos cobrás al instante en tu cuenta.
      </p>

      <a
        href="/api/mp/oauth/start"
        className="mt-4 block w-full rounded-lg bg-[#378ADD] px-5 py-2.5 text-center text-sm font-medium text-white transition hover:bg-[#2d75c4] active:scale-[0.97]"
      >
        Conectar ahora
      </a>
    </div>
  );
}
