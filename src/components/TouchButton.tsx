"use client";

import { useState } from "react";

type Props = {
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  href?: string;
};

export function TouchButton({ onClick, className, children, disabled, type = "button", href }: Props) {
  const [pressed, setPressed] = useState(false);

  const pressStyle = {
    transform: pressed ? "scale(0.95)" : "scale(1)",
    opacity: pressed ? 0.8 : 1,
    transition: "transform 0.12s ease, opacity 0.12s ease",
  };

  const handlers = {
    onTouchStart: () => setPressed(true),
    onTouchEnd: () => setPressed(false),
    onTouchCancel: () => setPressed(false),
    onMouseDown: () => setPressed(true),
    onMouseUp: () => setPressed(false),
    onMouseLeave: () => setPressed(false),
  };

  if (href) {
    return (
      <a href={href} className={className} style={pressStyle} {...handlers}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} onClick={onClick} className={className} disabled={disabled} style={pressStyle} {...handlers}>
      {children}
    </button>
  );
}
