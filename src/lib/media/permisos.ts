// src/lib/media/permisos.ts
// Detección de plataforma para los permisos de micrófono y cámara.
//
// Los permisos fallan distinto en cada plataforma y las instrucciones para
// desbloquearlos NO son intercambiables: iOS no tiene candadito, la PWA de iOS
// no tiene barra de direcciones, y un "permití el acceso desde el navegador"
// genérico deja al paciente sin salida. Aprendizaje del 10/06/2026, ya escrito
// en CLAUDE.md: los mensajes de error de permisos van por plataforma.
//
// Vivían adentro de SalaConsultaPaciente.tsx (el pre-join del canal clínico).
// Se movieron acá —misma lógica— para que la prueba de cámara y micrófono de la
// pantalla del paciente institucional use exactamente estas instrucciones y no
// una copia que se despegue con el tiempo.
//
// ── LO QUE NO SE PUEDE COMPARTIR TAL CUAL: LA MARCA ──────────────────────────
// Tres de las cuatro ramas nombran el producto ("buscá «Docto»", "entrá a
// docto.com.ar"). Compartido tal cual, ese texto se renderizaba en la pantalla
// institucional: un vecino de una provincia que niega el permiso recibía
// instrucciones para entrar a un sitio que no es el suyo y buscar una app que
// no instaló. Por eso la marca es un PARÁMETRO, con Docto como default — el
// pre-join del B2C llama sin argumento y se comporta idéntico.

export interface MarcaPermisos {
  /** Cómo se llama la app en Ajustes del teléfono. */
  nombre: string;
  /** Dominio al que hay que entrar desde el navegador. */
  dominio: string;
}

const DOCTO: MarcaPermisos = { nombre: "Docto", dominio: "docto.com.ar" };

export function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    // iPadOS se reporta como Mac pero tiene touch
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function esStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function instruccionesPermiso(
  dispositivo: "micrófono" | "cámara",
  marca: MarcaPermisos = DOCTO
): string {
  const ios = esIOS();
  const pwa = esStandalone();
  if (ios && pwa) {
    return `El permiso de ${dispositivo} está bloqueado para la app de ${marca.nombre}. Andá a Ajustes de tu iPhone, buscá «${marca.nombre}» y activá Micrófono y Cámara. Si no aparece, abrí ${marca.dominio} desde Safari.`;
  }
  if (ios) {
    return `El ${dispositivo} está bloqueado. En Safari, tocá «ᴀA» en la barra de direcciones → «Configuración del sitio web» → permití Micrófono y Cámara, y recargá la página.`;
  }
  if (pwa) {
    return `El ${dispositivo} está bloqueado. Cerrá la app, abrí Chrome, entrá a ${marca.dominio} y habilitá el ${dispositivo} desde ahí.`;
  }
  return `El ${dispositivo} está bloqueado. Tocá el candadito al lado de la dirección y permití el acceso al ${dispositivo}.`;
}
