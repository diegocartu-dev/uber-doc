"use client";

import { useRef } from "react";

type Props = {
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  href?: string;
};

export function TouchButton({ onClick, className, children, disabled, type = "button", href }: Props) {
  const ref = useRef<HTMLButtonElement & HTMLAnchorElement>(null);

  const handlePressStart = () => {
    if (ref.current) {
      ref.current.style.transform = "scale(0.95)";
      ref.current.style.opacity = "0.8";
    }
  };

  const handlePressEnd = () => {
    if (ref.current) {
      ref.current.style.transform = "scale(1)";
      ref.current.style.opacity = "1";
    }
  };

  const style = { transition: "transform 0.1s ease, opacity 0.1s ease" };

  if (href) {
    return (
      <a
        ref={ref}
        href={href}
        className={className}
        style={style}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      className={className}
      disabled={disabled}
      style={style}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
    >
      {children}
    </button>
  );
}
