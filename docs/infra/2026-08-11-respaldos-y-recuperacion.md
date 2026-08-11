# Respaldos y recuperación — auditoría del 11/08/2026

Verificado contra los proveedores reales (Management API de Supabase, GitHub,
Vercel), no contra documentación ni de memoria. Motivo: pregunta de Diego —
*"¿dónde tenemos nuestros respaldos del sistema, bases de datos, la plataforma y
los documentos de los pacientes?"*.

## Dónde vive cada cosa

| Qué | Dónde | Estado |
|---|---|---|
| Código de la plataforma | GitHub `diegocartu-dev/uber-doc` + deploys de Vercel | ✅ Cubierto |
| **Documentos clínicos** (recetas, certificados, indicaciones, órdenes) | **Filas de la tabla `documentos`**, en Postgres | ✅ Entran en el backup diario |
| Base de datos completa | Supabase Pro, región `sa-east-1` (São Paulo), Postgres 17 | 🔶 Backup diario, sin PITR |
| Archivos (firmas, credenciales, fotos) | Supabase Storage | 🔶 **Fuera del backup** |

**Dato clave que evita malentendidos:** las recetas y certificados **no son
archivos**. Son 124 filas (33 con sello de firma electrónica), 160 kB, y el PDF
se genera al vuelo en cada descarga. Por eso los protege el mismo backup que a
la base y no hay archivos sueltos que se puedan perder por separado.

## Números verificados (11/08/2026)

- Base de datos completa: **29 MB**.
- Storage: `credenciales-medicos` 48 archivos / 15 MB · `avatars` 32 / 20 MB ·
  `firmas-medicos` **31 / 3,5 MB** · `consultas-temp` 2 / 3,6 MB. Total ~42 MB.
- Código: 1.101 commits desde el 25/03/2026, sin commits locales sin subir.
- Backups físicos disponibles: 11/08, 09/08, 08/08, 06/08, 05/08, 04/08.

## Los dos huecos, y qué los explica

### 1. El Storage NO está en el backup de la base

No es una falla de Supabase: es cómo funciona el producto. La documentación lo
dice textual:

> *"Database backups do not include objects you store via the Storage API, as
> the database only includes metadata about these objects."*

**Contra qué protege y contra qué no.** La durabilidad de la infraestructura la
cubre el proveedor (AWS): que se rompa un disco o se caiga un servidor no es un
escenario que tengamos que resolver nosotros — para eso usamos un servicio
administrado y no un fierro propio. Lo que NO cubre es **un borrado nuestro**, y
ahí no hay "deshacer".

No es hipotético: **nuestro propio código borra del Storage en tres lugares** —
`dashboard/credencial-actions.ts` (reemplazo de credencial),
`api/medico/firma/route.ts` (reemplazo de firma) y
`api/consulta/eliminar-estudio/route.ts`. Un path mal armado en cualquiera de
esos borra el archivo y no hay de dónde traerlo.

Lo más caro de perder son las **31 firmas manuscritas**: son lo que da validez
legal a cada documento que emite un profesional.

### 2. Sin recuperación a un punto en el tiempo (PITR)

Add-on disponible y **NO contratado** (add-ons contratados: ninguno). Precios al
11/08: 7 días **USD 100/mes**, 14 días USD 200, 28 días USD 400.

Sin PITR, la granularidad de recuperación es el backup diario (~04:20 UTC). Si
un incidente ocurre a las 15:00, se pierden **hasta 24 h** de consultas, pagos y
documentos firmados.

### Observación menor: dos días faltantes en la serie

La serie disponible salta el **07/08** y el **10/08**. Puede ser cómo la API
reporta la retención de 7 días, o backups que no corrieron. **Sin confirmar con
Supabase.**

## Recomendaciones, en orden

1. **Copia semanal del Storage fuera de Supabase.** Son 42 MB, no cuesta dinero
   y tapa el hueco más concreto: nuestro propio borrado. Pendiente de construir.
2. **Evaluar PITR** (USD 100/mes). Es la única protección real contra un error
   nuestro en la base. Decisión de Diego; hoy no está contratado.
3. **Confirmar los dos días faltantes** con el soporte de Supabase.

## Lo que NO es un problema

Sacar todo del proveedor "por si desaparece" es paranoia para el momento
actual, y así lo definió Diego: para eso se usa un servicio administrado. El
código está triplicado (GitHub, Vercel, local) sin esfuerzo, y los documentos
clínicos viajan dentro del backup de la base.
