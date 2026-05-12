"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import SessionExpiredModal from "@/components/SessionExpiredModal";

export default function MedicoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sessionExpired, setSessionExpired] = useState(false);
  const isVoluntaryLogout = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT" && !isVoluntaryLogout.current) {
          setSessionExpired(true);
          trackSessionEvent("session_expired_detected");
        }

        if (event === "TOKEN_REFRESHED") {
          console.log("[AUTH] Token renovado correctamente");
        }

        if (!session && event !== "INITIAL_SESSION" && !isVoluntaryLogout.current) {
          setSessionExpired(true);
          trackSessionEvent("session_expired_detected");
        }
      }
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session && !isVoluntaryLogout.current) {
            setSessionExpired(true);
            trackSessionEvent("session_expired_background");
          }
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleBeforeSignOut = () => {
      isVoluntaryLogout.current = true;
    };
    window.addEventListener("docto:voluntary-logout", handleBeforeSignOut);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("docto:voluntary-logout", handleBeforeSignOut);
    };
  }, []);

  return (
    <>
      {children}
      {sessionExpired && <SessionExpiredModal />}
    </>
  );
}

function trackSessionEvent(evento: string) {
  fetch("/api/funnel/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evento }),
  }).catch(() => {});
}
