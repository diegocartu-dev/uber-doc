"use client";

// El latido de la pantalla de espera: cada 5 segundos le vuelve a preguntar al
// server si ya hay turno. Cuando lo hay, el propio server component redirige.
//
// `router.refresh()` y no `location.reload()`: recarga los datos sin repintar
// la página entera, así que el participante no ve el parpadeo blanco cada cinco
// segundos con la pantalla proyectada.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const CADA_MS = 5000;

export default function RefrescoSuave() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), CADA_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
