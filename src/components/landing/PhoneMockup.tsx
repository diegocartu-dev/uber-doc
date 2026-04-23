import { Heart, Brain, Baby, Eye, Activity, Pill, Clock, ChevronRight } from "lucide-react";

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 280,
        height: 580,
        background: "#0F1720",
        borderRadius: 40,
        padding: 8,
        boxShadow: "0 30px 60px -20px rgba(15,23,32,0.25), 0 18px 30px -15px rgba(15,23,32,0.18)",
        position: "relative",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#fff",
          borderRadius: 34,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            width: 100,
            height: 28,
            background: "#0F1720",
            borderRadius: 999,
            zIndex: 2,
          }}
        />
        {children}
      </div>
    </div>
  );
}

const specialties = [
  { Icon: Heart, label: "Cardiología", dot: "#3F7A52", status: "Disponible" },
  { Icon: Brain, label: "Neurología", dot: "#BA7517", status: "Con espera" },
  { Icon: Baby, label: "Pediatría", dot: "#3F7A52", status: "Disponible" },
  { Icon: Eye, label: "Oftalmología", dot: "#3F7A52", status: "Disponible" },
  { Icon: Activity, label: "Clínica Médica", dot: "#3F7A52", status: "Disponible" },
  { Icon: Pill, label: "Nutrición", dot: "#D85A30", status: "Programada" },
];

export function PhoneMockupHero() {
  return (
    <PhoneFrame>
      <div style={{ padding: "52px 18px 20px", height: "100%", background: "#F8F9FA" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4, letterSpacing: "-0.01em" }}>
          Hola, Malena
        </div>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 16 }}>
          ¿Con qué te podemos ayudar hoy?
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            padding: "10px 12px",
            border: "1px solid #E5E7EB",
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 14,
          }}
        >
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#9CA3AF" }} />
          <span style={{ fontSize: 10, color: "#9CA3AF" }}>Buscar especialidad</span>
        </div>

        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#9CA3AF",
            marginBottom: 8,
          }}
        >
          Clínica virtual
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {specialties.map((s) => (
            <div key={s.label} style={{ background: "#fff", borderRadius: 8, padding: "10px 10px", border: "1px solid #E5E7EB" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <s.Icon size={14} style={{ color: "#6B8DE3" }} />
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
              </div>
              <div style={{ fontSize: 9, fontWeight: 600, color: "#111827" }}>{s.label}</div>
              <div style={{ fontSize: 8, color: "#9CA3AF" }}>{s.status}</div>
            </div>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

export function PhoneMockupInmediata() {
  return (
    <PhoneFrame>
      <div style={{ padding: "52px 16px 16px", height: "100%", background: "#F8F9FA" }}>
        {/* Featured doctor card */}
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: 14,
            border: "1.5px solid #A1CEA4",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span className="landing-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "#3F7A52", display: "inline-block" }} />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#3F7A52" }}>
              Disponible ahora
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "#F1F3F5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 600,
                color: "#4B5563",
              }}
            >
              MR
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>Dra. Martina Ríos</div>
              <div style={{ fontSize: 10, color: "#9CA3AF" }}>Clínica Médica · MP 48129</div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid #F0F0EF",
            }}
          >
            <div style={{ fontSize: 10, color: "#4B5563" }}>Espera estimada</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#111827" }}>~4 min</div>
          </div>
          <div
            style={{
              width: "100%",
              marginTop: 10,
              background: "#378ADD",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "9px 0",
              fontSize: 11,
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            Consultar ahora
          </div>
        </div>

        {/* Doctor list */}
        {[
          { n: "Dr. Tomás Vera", e: "Clínica Médica", w: "~12 min", avail: true },
          { n: "Dra. Elena Sosa", e: "Pediatría", w: "~8 min", avail: true },
          { n: "Dr. Pablo Acuña", e: "Dermatología", w: "En 18:30", avail: false },
        ].map((m) => (
          <div
            key={m.n}
            style={{
              background: "#fff",
              borderRadius: 10,
              padding: 10,
              border: "1px solid #E5E7EB",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: m.avail ? "#3F7A52" : "#BA7517",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: "#111827",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {m.n}
              </div>
              <div style={{ fontSize: 9, color: "#9CA3AF" }}>{m.e}</div>
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: m.avail ? "#3F7A52" : "#BA7517", flexShrink: 0 }}>
              {m.w}
            </div>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

const turnoSlots = [
  { time: "09:00", available: true },
  { time: "09:30", available: false },
  { time: "10:00", available: true },
  { time: "10:30", available: true },
  { time: "11:00", available: false },
  { time: "11:30", available: true },
  { time: "14:00", available: true },
  { time: "14:30", available: false },
];

const turnoDays = [
  { day: "Lun", num: "28", active: false },
  { day: "Mar", num: "29", active: true },
  { day: "Mié", num: "30", active: false },
  { day: "Jue", num: "1", active: false },
  { day: "Vie", num: "2", active: false },
];

export function PhoneMockupTurnos() {
  return (
    <PhoneFrame>
      <div style={{ padding: "52px 16px 16px", height: "100%", background: "#F8F9FA" }}>
        {/* Doctor header */}
        <div style={{
          background: "#fff",
          borderRadius: 12,
          padding: 14,
          border: "1px solid #E5E7EB",
          marginBottom: 12,
        }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%", background: "#F1F3F5",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 600, color: "#4B5563",
            }}>
              LG
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>Dr. Lucas García</div>
              <div style={{ fontSize: 10, color: "#9CA3AF" }}>Cardiología · MP 31845</div>
            </div>
            <ChevronRight size={14} style={{ color: "#9CA3AF" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#4B5563" }}>
            <Clock size={10} style={{ color: "#378ADD" }} />
            Consulta 30 min · $8.500
          </div>
        </div>

        {/* Day selector */}
        <div style={{
          display: "flex", gap: 6, marginBottom: 12,
          justifyContent: "space-between",
        }}>
          {turnoDays.map((d) => (
            <div key={d.num} style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 10,
              background: d.active ? "#378ADD" : "#fff",
              border: d.active ? "none" : "1px solid #E5E7EB",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 8, color: d.active ? "rgba(255,255,255,0.7)" : "#9CA3AF", fontWeight: 500 }}>{d.day}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: d.active ? "#fff" : "#111827" }}>{d.num}</div>
            </div>
          ))}
        </div>

        {/* Time label */}
        <div style={{
          fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
          textTransform: "uppercase", color: "#9CA3AF", marginBottom: 8,
        }}>
          Horarios disponibles
        </div>

        {/* Slots grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {turnoSlots.map((s) => (
            <div key={s.time} style={{
              padding: "10px 0",
              borderRadius: 8,
              background: s.available ? "#fff" : "#F8F9FA",
              border: s.available ? "1px solid #378ADD" : "1px solid #E5E7EB",
              textAlign: "center",
              fontSize: 11,
              fontWeight: 600,
              color: s.available ? "#378ADD" : "#D1D5DB",
            }}>
              {s.time}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{
          marginTop: 12, background: "#378ADD", color: "#fff",
          borderRadius: 8, padding: "10px 0",
          fontSize: 11, fontWeight: 600, textAlign: "center",
        }}>
          Confirmar turno
        </div>
      </div>
    </PhoneFrame>
  );
}
