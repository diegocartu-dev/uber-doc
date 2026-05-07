"use client";

import { useRef, useState, useCallback } from "react";

type NovaState = "idle" | "recording" | "processing" | "done" | "error";

export function useNovaRecording(consultaId: string) {
  const [state, setState] = useState<NovaState>("idle");
  const [evolucionSugerida, setEvolucionSugerida] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async (remoteAudioElement?: HTMLAudioElement | null) => {
    try {
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();

      // Local mic
      const localSource = audioCtx.createMediaStreamSource(localStream);
      localSource.connect(dest);

      // Remote audio (patient) — if available via LiveKit's audio element
      if (remoteAudioElement && remoteAudioElement.srcObject) {
        try {
          const remoteSource = audioCtx.createMediaStreamSource(remoteAudioElement.srcObject as MediaStream);
          remoteSource.connect(dest);
        } catch {
          // Remote audio not capturable — record local only
        }
      }

      const recorder = new MediaRecorder(dest.stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current = recorder;
      streamRef.current = localStream;
      recorder.start(5000);
      setState("recording");
    } catch {
      setState("idle");
    }
  }, []);

  const stopAndProcess = useCallback(async (): Promise<string> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        setState("idle");
        resolve("");
        return;
      }

      setState("processing");

      recorder.onstop = async () => {
        // Stop all tracks
        streamRef.current?.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];

        if (blob.size < 1000) {
          setState("done");
          resolve("");
          return;
        }

        try {
          const formData = new FormData();
          formData.append("audio", blob, "audio.webm");
          formData.append("consulta_id", consultaId);

          const res = await fetch("/api/nova/generar-evolucion", {
            method: "POST",
            credentials: "include",
            body: formData,
          });

          if (!res.ok) {
            setState("done");
            resolve("");
            return;
          }

          const data = await res.json();
          const evol = data.evolucion || "";
          setEvolucionSugerida(evol || null);
          setState("done");
          resolve(evol);
        } catch {
          setState("done");
          resolve("");
        }
      };

      recorder.stop();
    });
  }, [consultaId]);

  const cancel = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    chunksRef.current = [];
    setState("idle");
  }, []);

  return {
    state,
    evolucionSugerida,
    startRecording,
    stopAndProcess,
    cancel,
    isRecording: state === "recording",
    isProcessing: state === "processing",
  };
}
