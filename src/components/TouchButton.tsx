"use client";

type Props = {
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  href?: string;
};

export function TouchButton({ onClick, className, children, disabled, type = "button", href }: Props) {
  const baseStyle = {
    transition: "transform 0.15s ease, opacity 0.15s ease",
    WebkitTapHighlightColor: "transparent",
    cursor: "pointer",
    userSelect: "none" as const,
  };

  const handlePress = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.transform = "scale(0.93)";
    el.style.opacity = "0.75";
    setTimeout(() => {
      el.style.transform = "scale(1)";
      el.style.opacity = "1";
    }, 150);
  };

  if (href) {
    return (
      <a
        href={href}
        className={className}
        style={baseStyle}
        onPointerDown={handlePress}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      className={className}
      disabled={disabled}
      style={baseStyle}
      onPointerDown={handlePress}
    >
      {children}
    </button>
  );
}
