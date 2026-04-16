import { Resend } from "resend";

// Singleton — una sola instancia por proceso
// RESEND_API_KEY debe estar en las variables de entorno de Vercel
let _resend: Resend | null = null;

export function getResendClient(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}
