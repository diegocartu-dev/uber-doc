"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ShieldCheck, Check, AlertTriangle, Loader2 } from "lucide-react";

type EstadoModal =
  | "inicial"
  | "enviando"
  | "codigo_enviado"
  | "verificando"
  | "firmado"
  | "error"
  | "lockout";

type Props = {
  consultaId?: string;
  turnoId?: string;
  emailOfuscado: string;
  onFirmado: (otpId: string) => void;
  onCancelar: () => void;
};

export default function ModalOTPFirma({
  consultaId,
  turnoId,
  emailOfuscado,
  onFirmado,
  onCancelar,
}: Props) {
  const [estado, setEstado] = useState<EstadoModal>("inicial");
  const [digitos, setDigitos] = useState<string[]>(["", "", "", "", "", ""]);
  const [errorMsg, setErrorMsg] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [bloqueadoHasta, setBloqueadoHasta] = useState("");
  const [otpId, setOtpId] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cooldownRef = useRef<NodeJS.Timeout | null>(null);

  // Limpiar cooldown al desmontar
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // Auto-cerrar después de firmado
  useEffect(() => {
    if (estado === "firmado") {
      const timer = setTimeout(() => onFirmado(otpId), 1800);
      return () => clearTimeout(timer);
    }
  }, [estado, otpId, onFirmado]);

  const iniciarCooldown = useCallback((segundos: number) => {
    setCooldown(segundos);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const limpiarDigitos = useCallback(() => {
    setDigitos(["", "", "", "", "", ""]);
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  }, []);

  const enviarCodigo = async () => {
    setEstado("enviando");
    setErrorMsg("");

    try {
      const res = await fetch("/api/2fa/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultaId, turnoId }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.bloqueado_hasta) {
          setBloqueadoHasta(
            new Date(data.bloqueado_hasta).toLocaleTimeString("es-AR", {
              hour: "2-digit",
              minute: "2-digit",
            })
          );
          setEstado("lockout");
          return;
        }
        if (data.cooldown_restante) {
          iniciarCooldown(data.cooldown_restante);
          setEstado("codigo_enviado");
          return;
        }
        setErrorMsg(data.error || "Error enviando código");
        setEstado("error");
        return;
      }

      setEstado("codigo_enviado");
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      setErrorMsg("Error de conexión. Intentá de nuevo.");
      setEstado("error");
    }
  };

  const verificarCodigo = async () => {
    const codigo = digitos.join("");
    if (codigo.length !== 6) return;

    setEstado("verificando");
    setErrorMsg("");

    try {
      const res = await fetch("/api/2fa/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, consultaId, turnoId }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.includes("bloqueada")) {
          setBloqueadoHasta(
            new Date(Date.now() + 60 * 60 * 1000).toLocaleTimeString("es-AR", {
              hour: "2-digit",
              minute: "2-digit",
            })
          );
          setEstado("lockout");
          return;
        }
        setErrorMsg(data.error || "Código incorrecto");
        setEstado("error");
        limpiarDigitos();
        return;
      }

      setOtpId(data.otp_id);
      setEstado("firmado");
    } catch {
      setErrorMsg("Error de conexión. Intentá de nuevo.");
      setEstado("error");
      limpiarDigitos();
    }
  };

  const handleDigitChange = (index: number, value: string) => {
    // Solo números
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigitos = [...digitos];
    newDigitos[index] = digit;
    setDigitos(newDigitos);

    // Auto-advance
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digitos[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 0) return;

    const newDigitos = [...digitos];
    for (let i = 0; i < 6; i++) {
      newDigitos[i] = pasted[i] || "";
    }
    setDigitos(newDigitos);

    // Focus en el último dígito pegado o el siguiente vacío
    const focusIndex = Math.min(pasted.length, 5);
    inputRefs.current[focusIndex]?.focus();
  };

  const codigoCompleto = digitos.every((d) => d !== "");

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        {/* Estado: FIRMADO */}
        {estado === "firmado" && (
          <div className="py-4">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#1D9E75]/10">
              <Check className="h-7 w-7 text-[#1D9E75]" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Receta firmada correctamente
            </h2>
          </div>
        )}

        {/* Estado: LOCKOUT */}
        {estado === "lockout" && (
          <div className="py-4">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#D85A30]/10">
              <AlertTriangle className="h-7 w-7 text-[#D85A30]" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">
              Cuenta bloqueada temporalmente
            </h2>
            <p className="mb-6 text-sm text-gray-600">
              Tu cuenta está bloqueada temporalmente por demasiados intentos.
              Podés reintentar a las {bloqueadoHasta}.
            </p>
            <button
              onClick={onCancelar}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Entendido
            </button>
          </div>
        )}

        {/* Estados: INICIAL, ENVIANDO, CODIGO_ENVIADO, VERIFICANDO, ERROR */}
        {estado !== "firmado" && estado !== "lockout" && (
          <>
            {/* Header */}
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <ShieldCheck className="h-7 w-7 text-gray-500" />
            </div>
            <h2 className="mb-1 text-lg font-semibold text-gray-900">
              Verificación de identidad
            </h2>
            <p className="mb-5 text-sm text-gray-500">
              Para firmar esta receta necesitamos verificar tu identidad
            </p>

            {/* Estado INICIAL / ENVIANDO */}
            {(estado === "inicial" || estado === "enviando") && (
              <>
                <button
                  onClick={enviarCodigo}
                  disabled={estado === "enviando"}
                  className="w-full rounded-lg bg-[#378ADD] px-4 py-3.5 text-base font-medium text-white transition-colors hover:bg-[#2d75c4] disabled:opacity-60"
                >
                  {estado === "enviando" ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enviando código...
                    </span>
                  ) : (
                    "Enviar código a mi email"
                  )}
                </button>
                <p className="mt-2 text-xs text-gray-400">{emailOfuscado}</p>
              </>
            )}

            {/* Estado CODIGO_ENVIADO / VERIFICANDO / ERROR */}
            {(estado === "codigo_enviado" ||
              estado === "verificando" ||
              estado === "error") && (
              <>
                <p className="mb-3 text-[13px] text-gray-500">
                  Ingresá el código de 6 dígitos
                </p>

                {/* Input de 6 dígitos */}
                <div className="mb-2 flex justify-center gap-2">
                  {digitos.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onPaste={i === 0 ? handlePaste : undefined}
                      disabled={estado === "verificando"}
                      className={`h-[52px] w-11 rounded-[10px] border text-center text-2xl font-semibold text-gray-900 outline-none transition-colors ${
                        digit
                          ? "border-[#378ADD]"
                          : "border-gray-200 focus:border-[#378ADD]"
                      } ${estado === "verificando" ? "opacity-50" : ""}`}
                      aria-label={`Dígito ${i + 1}`}
                    />
                  ))}
                </div>

                <p className="mb-4 text-xs text-gray-400">
                  Enviamos el código a {emailOfuscado}
                </p>

                {/* Error */}
                {estado === "error" && errorMsg && (
                  <div className="mb-4 rounded-lg bg-[#E24B4A]/[0.08] px-3 py-2.5">
                    <p className="text-[13px] text-[#E24B4A]">{errorMsg}</p>
                  </div>
                )}

                {/* Botón verificar */}
                <button
                  onClick={verificarCodigo}
                  disabled={!codigoCompleto || estado === "verificando"}
                  className="w-full rounded-lg bg-[#378ADD] px-4 py-3.5 text-base font-medium text-white transition-colors hover:bg-[#2d75c4] disabled:opacity-40"
                >
                  {estado === "verificando" ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verificando...
                    </span>
                  ) : (
                    "Verificar y firmar"
                  )}
                </button>

                {/* Reenviar / Cooldown */}
                <div className="mt-3">
                  {cooldown > 0 ? (
                    <p className="text-[13px] text-gray-400">
                      Reenviar en 0:{String(cooldown).padStart(2, "0")}
                    </p>
                  ) : (
                    <button
                      onClick={enviarCodigo}
                      disabled={estado === "verificando"}
                      className="text-[13px] font-medium text-[#378ADD] hover:underline disabled:opacity-40"
                    >
                      Reenviar código
                    </button>
                  )}
                </div>

                {/* Texto legal */}
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <p className="text-[11px] leading-relaxed text-gray-400">
                    Al firmar, declarás que revisaste el contenido de la
                    prescripción y que los datos son correctos. Esta acción genera
                    una firma electrónica conforme al Art. 5 de la Ley 25.506.
                  </p>
                </div>
              </>
            )}

            {/* Cancelar */}
            <button
              onClick={onCancelar}
              disabled={estado === "verificando"}
              className="mt-4 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40"
            >
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
