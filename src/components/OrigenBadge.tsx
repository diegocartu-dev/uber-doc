type Props = {
  canalOrigen: string | null;
};

const config: Record<string, { bg: string; label: string }> = {
  clinica_virtual: { bg: "#378ADD", label: "Clinica Virtual" },
  consultorio_privado: { bg: "#D85A30", label: "Consultorio Particular" },
};

const defaultConfig = { bg: "#1D9E75", label: "Consulta Inmediata" };

export default function OrigenBadge({ canalOrigen }: Props) {
  const { bg, label } = config[canalOrigen ?? ""] ?? defaultConfig;

  return (
    <span
      style={{
        backgroundColor: bg,
        color: "#fff",
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
