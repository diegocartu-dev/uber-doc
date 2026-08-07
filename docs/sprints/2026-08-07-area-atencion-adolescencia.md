# Áreas de atención del médico — Adolescencia (07/08/2026)

## De dónde salió
La Dra. Noelia Salva se registró en **Pediatría** y pidió figurar como
*"Pediatra especialista en Adolescencia"*.

## Decisión de Diego (CEO)
**No** se suma una especialidad nueva a la lista. Se agrega un **área de atención
ADICIONAL** que el médico activa **sobre** su especialidad, con un **rango de edad que
define él mismo**.

Ejemplo real: la Dra. Salva sigue siendo Pediatría **y además** declara que atiende
Adolescencia de 10 a 19 años.

Motivos:
1. No fragmentar la búsqueda del paciente (una especialidad más = una casilla más vacía).
2. Sirve para **cualquier** especialidad que quiera declarar un rango etario, no solo
   pediatría.

## El rango de edad es INFORMATIVO, no un candado
Le dice al paciente a quién atiende ese médico. **No bloquea reservas ni consultas por la
edad del paciente**: un gate nuevo en producción podría tirar abajo reservas legítimas.
Si alguna vez se quisiera bloquear, es una decisión de producto aparte.

## Cómo quedó implementado
- **Dato**: columna `medicos.areas_atencion` (jsonb, default `[]`).
  Forma: `[{"area":"adolescencia","edad_desde":10,"edad_hasta":19}]`.
  Migración: `supabase/migrations/20260807_areas_atencion_medico.sql` (incluye
  `GRANT SELECT (areas_atencion) ... TO authenticated, anon`, regla del outage 22/06).
- **Lista de áreas**: `src/lib/areas-atencion.ts` — fuente única. Para sumar un área
  nueva alcanza con agregarla a `AREAS_ATENCION`.
- **Médico**: `/medico/perfil` → sección "Áreas de atención" (toggle + desde/hasta, con
  validación clara y vista previa de lo que ve el paciente). Se guarda con el mismo botón
  "Guardar cambios", contra su endpoint propio `POST /api/medico/areas-atencion`.
- **Paciente**: en la clínica y en el perfil público `/dr/[slug]` se ve
  *"Atiende adolescentes (10 a 19 años)"*. El buscador de la clínica también matchea por
  el área ("adolescencia", "adolescentes"): **suma** resultados, no saca ninguno.

## Deuda detectada (fuera de alcance, para decidir)
`POST /api/medico/perfil` devuelve **403** cuando el médico tiene `identidad_validada`,
porque el cliente manda siempre `tipo_matricula` y `numero_matricula` (aunque no los haya
tocado) y el guard anti-TOCTOU corta ante su sola presencia. Efecto: un médico validado no
puede guardar cambios de perfil. No se tocó en este ticket; el guardado de áreas usa su
propio endpoint y no depende de eso.
