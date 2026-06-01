"use client";

type Props = {
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  href?: string;
};

// Feedback de presión por CSS `:active` (opacidad), NO por transform en JS.
// El `scale(0.93)` en onPointerDown achicaba el botón bajo el dedo y, en Safari
// iOS, eso movía el target y cancelaba el `click` en taps rápidos → obligaba a
// tocar dos veces (ingresar a la consulta, habilitar cámara/mic, etc.).
// La opacidad no mueve el elemento, así que el click siempre dispara al 1er toque.
const baseStyle = {
  transition: "opacity 0.12s ease",
  WebkitTapHighlightColor: "transparent",
  cursor: "pointer",
  userSelect: "none" as const,
};

export function TouchButton({ onClick, className, children, disabled, type = "button", href }: Props) {
  const cls = `${className ?? ""} active:opacity-70`.trim();

  if (href) {
    return (
      <a href={href} className={cls} style={baseStyle}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} onClick={onClick} className={cls} disabled={disabled} style={baseStyle}>
      {children}
    </button>
  );
}
