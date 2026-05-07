# ACCESOS Y PROCEDIMIENTOS TÉCNICOS — Docto
## Documento para el equipo — Leer antes de arrancar cualquier sprint
### Última actualización: 07/05/2026

---

## REGLA FUNDAMENTAL

Diego nunca ejecuta comandos en la terminal.
Diego nunca pega nada en el SQL Editor de Supabase.
Diego nunca genera ni comparte tokens en el chat.

Si Marcos necesita algo de Diego → está mal planteado.
Marcos tiene todo el acceso que necesita.

---

## 1. ACCESO A SUPABASE — Marcos

### Token de autenticación
- Nombre del token: "claude code token 2"
- Prefijo visible: sbp_2a46...
- Expira: Nunca
- Se encuentra en: .env.local del proyecto
  como SUPABASE_ACCESS_TOKEN

### Cómo autenticarse (si la sesión expiró)

```bash
npx supabase login --token $(cat ~/.config/supabase/access-token)
```

### Proyecto
- Project ref: irpupskopjahbqqvckue
- Directorio principal: /Users/diegogonzales/uber-doc

### Cómo aplicar una migración en producción

COMANDO CORRECTO:
```bash
cd /Users/diegogonzales/uber-doc
npx supabase db query --linked -f supabase/migrations/[archivo].sql
```

COMANDO INCORRECTO (no existe, no usar):
```bash
npx supabase db push --project-ref irpupskopjahbqqvckue
```

### Si la migración está en un worktree distinto

```bash
# Paso 1: copiar al directorio principal
cp /Users/diegogonzales/uber-doc/.claude/worktrees/[nombre-rama]/supabase/migrations/[archivo].sql \
   /Users/diegogonzales/uber-doc/supabase/migrations/

# Paso 2: aplicar
cd /Users/diegogonzales/uber-doc
npx supabase db query --linked -f supabase/migrations/[archivo].sql
```

### Verificar que se aplicó correctamente

```bash
npx supabase db query --linked \
  --sql "SELECT column_name FROM information_schema.columns
         WHERE table_name = '[tabla]'
         ORDER BY ordinal_position;"
```

### NUNCA
- Pedirle a Diego que ejecute SQL en el browser
- Pedirle a Diego que genere un token nuevo
- Pedirle a Diego que ejecute comandos en la terminal
- Usar `npx supabase db push` (ese comando no existe)
- Usar `npx supabase migration up` (apunta al Docker local)

---

## 2. ACCESO A VERCEL — Marcos

### Reconexión al inicio de cada sesión

```bash
npx vercel login
npx vercel link
```

### Despliegue automático
- Cada push a main → Vercel despliega automáticamente
- Cada push a cualquier rama → Vercel genera
  URL de preview automáticamente

### Agregar variable de entorno

```bash
vercel env add NOMBRE_VARIABLE
```

### Forzar redespliegue

```bash
cd /Users/diegogonzales/uber-doc
vercel --prod
```

---

## 3. FLUJO ESTÁNDAR DE SPRINT

1. Diego + Claude (Chat) diseñan la solución
2. Claude genera briefs para Sofía y Marcos
3. Sofía diseña y entrega specs si hay UX nueva
4. Marcos implementa en rama nueva (worktree)
5. Si hay migración → Marcos la aplica con
   `db query --linked` (él solo)
6. Vercel genera preview automáticamente
7. Diego prueba en el preview
8. Bugs → Marcos fixea en la misma rama
9. Roberto audita seguridad
10. Sofía valida visual
11. Diego aprueba → Marcos mergea a main
12. Vercel despliega automáticamente

REGLA INAMOVIBLE: nunca mergear a main sin
preview aprobado por Diego + Roberto + Sofía.

---

## 4. ERRORES FRECUENTES Y SOLUCIONES

### "column X does not exist" en producción
Causa: la migración no fue aplicada en Supabase.
Solución:
```bash
npx supabase db query --linked -f supabase/migrations/[archivo].sql
```

### "not logged in" o "session expired" en Supabase CLI
Causa: el token de sesión expiró.
Solución:
```bash
npx supabase login --token $(cat ~/.config/supabase/access-token)
```

### "duplicate key value violates unique constraint"
Causa: ya existen slots para esa fecha/hora.
Solución: verificar slots existentes antes de
crear agenda nueva.

### Marcos dice que necesita que Diego ejecute algo
Causa: Marcos no encontró el token o está
confundido con el comando.
Solución: recordarle que el token está en
.env.local como SUPABASE_ACCESS_TOKEN y que
el comando es `db query --linked`, no `db push`.

---

## 5. REFERENCIA RÁPIDA

| Tarea | Quién | Comando |
|---|---|---|
| Aplicar migración | Marcos | `npx supabase db query --linked -f [archivo.sql]` |
| Verificar columnas | Marcos | `npx supabase db query --linked --sql "SELECT..."` |
| Login CLI si expiró | Marcos | `npx supabase login --token $(cat ~/.config/supabase/access-token)` |
| Ver token guardado | Marcos | `cat /Users/diegogonzales/uber-doc/.env.local \| grep SUPABASE_ACCESS_TOKEN` |
| Reconectar Vercel | Marcos | `npx vercel login && npx vercel link` |
| Redespliegue Vercel | Marcos | `vercel --prod` |
| Aprobar merge a main | Diego | GitHub browser |
| Cargar env var Vercel | Marcos | `vercel env add NOMBRE` |

---

## 6. VARIABLES DE ENTORNO — REFERENCIA

Todas están configuradas en Vercel.
Nunca se comparten en el chat.

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ACCESS_TOKEN (solo en .env.local)
MP_PUBLIC_KEY
MP_ACCESS_TOKEN
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
NEXT_PUBLIC_LIVEKIT_URL
ANTHROPIC_API_KEY
OPENAI_API_KEY
RESEND_API_KEY
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
NEXT_PUBLIC_VAPID_PUBLIC_KEY
CRON_SECRET
```

---

## 7. SUPABASE — REGLAS TÉCNICAS CRÍTICAS

- Realtime NUNCA — todo con polling de 5s
- Filtros de Realtime en columnas que no son
  PK retornan silenciosamente vacío —
  filtrar en JavaScript callbacks
- RLS loops entre tablas producen recursión
  infinita silenciosa — usar SECURITY DEFINER
- paciente_id en consultas = auth.users.id
- paciente_id en turnos y documentos = pacientes.id
  (requiere lookup — nunca asumir)
- estado_consulta es ENUM PostgreSQL — agregar
  valores con ALTER TYPE ... ADD VALUE IF NOT EXISTS
- Siempre consultar estructura de DB antes de
  asumir nombres de columnas
