# Docto — Plataforma de Telemedicina Argentina

## Qué es Docto
Plataforma de telemedicina que conecta pacientes con médicos para consultas virtuales inmediatas y programadas. Target: Argentina primero, luego LATAM.

## Equipo y roles
- **Diego** — CEO, fundador, domain expert. Toma decisiones de producto y negocio. NO codea.
- **Claude (Cortana)** — Tech Lead, Arquitecto General y Coordinador.
- **Claude Code** — Desarrollador ejecutor. Implementa código, hace push a GitHub.
- **Agentes** en `.claude/agents/`: @sofia (UX), @marcos (Eng), @elena (PM), @roberto (QA).

## Stack
- Frontend: Next.js (App Router)
- Backend/DB: Supabase (PostgreSQL + RLS + Realtime)
- Video: Daily.co
- Pagos: Mercado Pago (simulado)
- Hosting: Vercel (auto-deploy desde GitHub)
- Repo: github.com/diegocartu-dev/uber-doc
- Producción: uber-doc.vercel.app
- Dominio: docto.com.ar

## Reglas de desarrollo
- SIEMPRE diseñar y validar arquitectura antes de implementar.
- Supabase RLS activo. Usar supabaseAdmin para bypass.
- Realtime: filtros en non-PK fallan. Escuchar sin filtros, filtrar en JS.
- Video Daily.co: Safari OK, Chrome iPhone NO.
- UX simple para médico de 70 años.
- Todo se prueba en uber-doc.vercel.app, NUNCA en localhost.
- Push a main = redeploy automático en Vercel.
- Simplificación bold > debugging incremental.

## Design system
- Verde #1D9E75 (disponible/activo)
- Azul #378ADD (reservado/pagado)
- Naranja #D85A30 (alerta)
- Gris #888780 (bloqueado)
- Rojo #E24B4A (cancelado/error)
- Amarillo #BA7517 (pendiente)

## Estado actual (Abril 2026)
- MVP scope locked. Flujos core funcionando.
- BUGS: (1) Dashboard médico no detecta consultas sin recargar. (2) Generador slots frágil sin cron.
- PRÓXIMO: Vercel Cron + polling centralizado, password reset, error handling, dominio, beta cerrada.
