// Desde dónde toca "Pagar" el paciente. Con el pago solo con cuenta de Mercado
// Pago (06/10/2026), lo que decide si paga sin fricción es si se le abre la app
// de MP: en un celular con la app se abre sola; en una computadora, en un
// celular sin la app o dentro del navegador de otra app (Instagram, Facebook)
// MP le pide ingresar su usuario y clave en la web. Sin este dato no hay forma
// de saber cuántos pacientes caen en el segundo caso.

export type OrigenDispositivo = {
  plataforma: "ios" | "android" | "computadora";
  navegador: "instagram" | "facebook" | "tiktok" | "whatsapp" | "otro_dentro_de_app" | "navegador";
  /** Docto instalado en la pantalla de inicio (se abre sin barra del navegador). */
  instalada: boolean;
};

export function origenDispositivo(ua: string, instalada: boolean, puntosTactiles = 0): OrigenDispositivo {
  // El iPad con iPadOS se presenta como Mac: lo delata la pantalla táctil.
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && puntosTactiles > 1);
  const plataforma = ios ? "ios" : /Android/i.test(ua) ? "android" : "computadora";
  const navegador = /Instagram/i.test(ua)
    ? "instagram"
    : /FBAN|FBAV|FB_IAB/.test(ua)
      ? "facebook"
      : /musical_ly|TikTok|BytedanceWebview/i.test(ua)
        ? "tiktok"
        : /WhatsApp/i.test(ua)
          ? "whatsapp"
          : /; wv\)/.test(ua)
            ? "otro_dentro_de_app"
            : "navegador";
  return { plataforma, navegador, instalada };
}

/** Lo mismo, leído del navegador actual. Nunca rompe: sin datos, objeto vacío. */
export function origenDelNavegadorActual(): Partial<OrigenDispositivo> {
  try {
    if (typeof navigator === "undefined" || typeof window === "undefined") return {};
    const instalada =
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return origenDispositivo(navigator.userAgent ?? "", instalada, navigator.maxTouchPoints ?? 0);
  } catch {
    return {};
  }
}
