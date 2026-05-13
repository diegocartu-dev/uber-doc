import { waitUntil } from "@vercel/functions";

type LogLevel = "info" | "warn" | "error";

type LogEvent = {
  level: LogLevel;
  service: string;
  message: string;
  context?: Record<string, unknown>;
};

const AXIOM_TOKEN = process.env.AXIOM_TOKEN;
const AXIOM_DATASET = process.env.AXIOM_DATASET || "docto-prod";

async function sendToAxiom(event: LogEvent): Promise<void> {
  if (!AXIOM_TOKEN) {
    return;
  }

  try {
    const url = `https://api.axiom.co/v1/datasets/${AXIOM_DATASET}/ingest`;
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AXIOM_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          _time: new Date().toISOString(),
          level: event.level,
          service: event.service,
          message: event.message,
          ...event.context,
        },
      ]),
      keepalive: true,
    });
  } catch (err) {
    console.error(
      "[LOGGER] Axiom send failed:",
      err instanceof Error ? err.message : err
    );
  }
}

function dispatch(event: LogEvent) {
  try {
    waitUntil(sendToAxiom(event));
  } catch {
    void sendToAxiom(event);
  }
}

export function logInfo(
  service: string,
  message: string,
  context?: Record<string, unknown>
) {
  console.log(`${service} ${message}`, context ?? "");
  dispatch({ level: "info", service, message, context });
}

export function logWarn(
  service: string,
  message: string,
  context?: Record<string, unknown>
) {
  console.warn(`${service} ${message}`, context ?? "");
  dispatch({ level: "warn", service, message, context });
}

export function logError(
  service: string,
  message: string,
  context?: Record<string, unknown>
) {
  console.error(`${service} ${message}`, context ?? "");
  dispatch({ level: "error", service, message, context });
}
