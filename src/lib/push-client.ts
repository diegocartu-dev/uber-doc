export function pushSoportado(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export function pushYaActivo(): boolean {
  return pushSoportado() && Notification.permission === "granted";
}

export function pushRechazado(): boolean {
  return pushSoportado() && Notification.permission === "denied";
}

export async function registrarSW(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSoportado()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function suscribirPush(rol: "medico" | "paciente"): Promise<boolean> {
  const reg = await registrarSW();
  if (!reg) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return false;

  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    });

    const json = sub.toJSON();
    const res = await fetch("/api/push/suscribir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        rol,
      }),
    });

    return res.ok;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
