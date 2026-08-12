// src/components/institucional/PantallaEnConstruccion.tsx
// Placeholder compartido de las pantallas de operador que llegan en etapas
// posteriores (/otorgador → Etapa 2, /panel → Etapa 4, spec §10).
//
// Existe porque rutaOperador() YA redirige post-login a esas rutas desde la
// Etapa 1: sin destino, un operador recién dado de alta caía en un 404 y
// guardRutaPaciente lo re-expulsaba al mismo 404 desde cualquier ruta de
// paciente (hallazgo revisión Etapa 1). Cuando aterrice la pantalla real,
// la page reemplaza este componente.
//
// Lenguaje de diseño del handoff: card 12px, título 20/600, texto 13,
// badge pendiente (amarillo soft), espaciado en escala 4/8.

export default function PantallaEnConstruccion({
  titulo,
  nombre,
  detalle,
}: {
  titulo: string;
  nombre: string;
  detalle: string;
}) {
  return (
    <main
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#F8F9FA",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          background: "#fff",
          border: "1px solid #E9EBEF",
          borderRadius: 12,
          boxShadow: "0 1px 2px rgba(16,24,40,.04)",
          padding: 32,
        }}
      >
        <span
          style={{
            display: "inline-block",
            padding: "2px 10px",
            borderRadius: 99,
            fontSize: 12,
            fontWeight: 600,
            background: "#FEF6E8",
            color: "#BA7517",
          }}
        >
          En construcción
        </span>
        <h1 style={{ marginTop: 12, fontSize: 20, fontWeight: 600, color: "#111827" }}>
          {titulo}
        </h1>
        <p style={{ marginTop: 8, fontSize: 13, color: "#4B5563" }}>Hola, {nombre}.</p>
        <p style={{ marginTop: 8, fontSize: 13, color: "#4B5563" }}>{detalle}</p>
      </div>
    </main>
  );
}
