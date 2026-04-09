"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Stethoscope } from "lucide-react";
import { getLogoHref } from "@/lib/origin-slug";

type Props = {
  /** Tamaño del ícono. Default 24 */
  size?: number;
  /** Tamaño del texto. Default "text-lg" */
  textClass?: string;
};

/**
 * Logo de Docto con link dinámico según el origen del paciente.
 * Si el paciente vino de /dr/[slug] → link a /dr/[slug]
 * Si no → link a /
 */
export default function DoctoLogo({ size = 24, textClass = "text-lg" }: Props) {
  const [href, setHref] = useState("/");

  useEffect(() => {
    setHref(getLogoHref());
  }, []);

  return (
    <Link href={href} className="flex items-center gap-2">
      <Stethoscope size={size} strokeWidth={2} color="var(--color-brand)" />
      <span
        className={`${textClass} font-bold lowercase`}
        style={{ color: "var(--color-text-primary)" }}
      >
        docto
      </span>
    </Link>
  );
}
