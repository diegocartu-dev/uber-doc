"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface Props {
  label: string;
  value: number;
  href?: string;
  color?: string;
  sub?: string;
}

export default function MetricCard({
  label,
  value,
  href,
  color = "#378ADD",
  sub,
}: Props) {
  const content = (
    <div
      className="rounded-xl bg-white p-4"
      style={{ border: "1px solid #e5e7eb" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400">{label}</p>
          <p className="mt-1 text-2xl font-bold" style={{ color }}>
            {value}
          </p>
          {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
        </div>
        {href && (
          <ChevronRight size={18} className="text-gray-300" />
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
