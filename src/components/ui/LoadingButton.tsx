"use client";
import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  isLoading?: boolean;
  variant?: Variant;
  children: ReactNode;
};

export default function LoadingButton({
  isLoading = false,
  variant: _variant,
  children,
  disabled,
  className,
  ...rest
}: Props) {
  return (
    <>
      <style>{`
        @keyframes loadingDotPulse {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
      `}</style>
      <button
        disabled={isLoading || disabled}
        className={className}
        {...rest}
      >
        {isLoading ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            {([0, 160, 320] as const).map((delay) => (
              <span
                key={delay}
                style={{
                  display: "inline-block",
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  backgroundColor: "currentColor",
                  animation: `loadingDotPulse 900ms ${delay}ms infinite`,
                }}
              />
            ))}
          </span>
        ) : (
          children
        )}
      </button>
    </>
  );
}
