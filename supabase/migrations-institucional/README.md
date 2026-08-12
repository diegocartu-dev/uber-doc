# Migraciones institucionales

Estos `.sql` se aplican **SOLO en la base de una instancia institucional** (proyecto Supabase dedicado, deploy con `INSTITUCIONAL=true`), **encima** del schema B2C ya provisionado (las migraciones de `supabase/migrations/` + la migración de baseline — ver `scripts/institucional/README.md`). **Nunca corren en el B2C.**

## Env vars de la instancia (provisión)

- **`INSTITUCIONAL=true`** — la fuente de verdad del modo (server, runtime). Todo gate de código sale de acá vía `src/lib/instancia.ts`: páginas, server actions, crons, capas A/B/C, y también el sidebar de `/admin` (que recibe el flag por **prop** desde el layout server — no lee ninguna env client).
- **`NEXT_PUBLIC_INSTITUCIONAL=true`** — variante client-side. Se **inlinea en build**: cambiarla exige **deploy fresco**, nunca `vercel redeploy` (mismo pitfall que `BETA_PASSWORD`). Hoy ningún componente la consume, pero si un gate client la llegara a usar, **setear las dos juntas en el mismo deploy**: si divergen, la UI muestra links a 404 (solo client seteada) o esconde pantallas vivas (solo server seteada). Preferir siempre pasar el flag por prop desde un server component antes que sumar un consumer de la env client.
