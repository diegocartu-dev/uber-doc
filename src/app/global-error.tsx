"use client";

// Boundary de último recurso: ataja errores del root layout (error.tsx no llega ahí).
// Debe renderizar su propio <html>/<body> porque reemplaza al layout entero.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[global-error]", error.message, error.digest ?? "");
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "Inter, system-ui, sans-serif", background: "#f8f9fa" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px", textAlign: "center" }}>
          <p style={{ fontSize: 36, margin: 0 }}>😕</p>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#111827", margin: "16px 0 0" }}>Algo salió mal</h1>
          <p style={{ fontSize: 14, color: "#6b7280", maxWidth: 360, lineHeight: 1.55, margin: "8px 0 0" }}>
            Hubo un problema al mostrar esta pantalla. Tus datos están a salvo — probá de nuevo.
          </p>
          <button
            onClick={reset}
            style={{ marginTop: 24, background: "#378ADD", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
