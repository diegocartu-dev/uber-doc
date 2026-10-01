# Columnas de confianza de `medicos` — hallazgo 01/10/2026

Salió de la revisión adversarial del cambio "la matrícula la dice REFEPS"
(`docs/sprints/2026-10-01-la-matricula-la-dice-refeps.md`). Es **anterior** a ese
cambio y no depende de él.

## Qué pasaba

La aplicación nunca deja que un profesional cambie estos datos. Pero la **base**
sí lo dejaba: con su propia sesión (la clave pública de Supabase está en el
navegador, y con ella cualquiera le habla directo a la base salteando las
pantallas) podía:

1. **Crear su propia ficha de médico con las marcas de validación ya puestas.**
   Cualquier usuario logueado, incluso un paciente. La regla de la base solo
   exigía `verificado = false` y estado "pendiente"; el trigger que protege
   `identidad_validada`, `refeps_validado` y `biometria_exenta` es solo de
   actualización, no de alta. El panel mostraba esa ficha en verde ("identidad
   verificada", "matrícula verificada en REFEPS"), y el gate de aprobar no
   vuelve a consultar REFEPS cuando `refeps_validado` ya es `true`. Para atender
   hacía falta igual que un administrador lo aprobara.
2. **Cambiarse columnas que deciden plata, ruteo y lo que el equipo ve como
   verificado**: la categoría del coste por uso, las jurisdicciones (aparecer en
   provincias donde no tiene matrícula), la especialidad y las adicionales, las
   notas del equipo, lo que REFEPS dijo y cuándo, y su DNI y matrícula antes de
   validar la identidad.

## Evidencia

Probado contra la base de producción con **cuentas de prueba**, en transacciones
que se deshacen solas (corren con los permisos, la RLS y los triggers reales, y
terminan en un error a propósito: no queda nada escrito). Los scripts no van al
repo porque llevan identificadores de esas cuentas.

| Prueba | Antes | Con la migración (ensayada y revertida) |
|---|---|---|
| Un usuario logueado crea su ficha de médico con las marcas en verde | **se crea** | bloqueado |
| El profesional cambia las 19 columnas de confianza | **se cambian todas** | no cambia ninguna |
| Flujos legítimos del profesional (disponibilidad, precio, duración, ocultarse, nombre y domicilio, Nova) | andan | siguen andando |
| El servidor (service role) escribe columnas protegidas | anda | sigue andando |

Clasificación (regla de evidencia empírica de CLAUDE.md): **explotable hoy**
(la base acepta las escrituras), con impacto acotado por compuertas humanas en
el caso del alta (hace falta que un administrador apruebe). La categoría no le
da ventaja hoy a nadie, porque todos los profesionales reales están en la misma.

## Qué se hizo

`supabase/migrations/20261001_medicos_columnas_de_confianza.sql` — **sin aplicar,
espera el OK de Diego**:

1. Se borra la regla que permitía crear fichas de médico con la sesión del
   usuario y se le saca el permiso de alta a `anon` y `authenticated`. Las dos
   altas de la aplicación (registro, demo institucional) usan el servidor.
2. El trigger `proteger_verificacion_medico` revierte en silencio, para la sesión
   del usuario, 19 columnas más (mismo mecanismo que ya protegía verificación,
   identidad y REFEPS).
3. `admin_audit_log.admin_user_id` admite vacío para las acciones del sistema (la
   matrícula que el cruce de identidad toma de REFEPS queda registrada así). La
   pantalla de auditoría las muestra como "Sistema".

Antes de proteger cada columna se relevaron **todos** sus escritores en el
código, columna por columna, con un segundo revisor intentando refutar cada
"nadie la escribe con la sesión del usuario". Si alguna tuviera un escritor así,
protegerla lo rompería en silencio (el guardado "anda" y el valor no cambia).

## Lo que NO cubre, a propósito

- **Disponibilidad y horario, precio, duración, foto, firma manuscrita.** Tienen
  escritores legítimos con la sesión del profesional (`dashboard/actions.ts`,
  `api/medico/foto`, `api/medico/firma`). Primero se mudan esas escrituras al
  servidor y después se protegen. Hasta entonces, un profesional podría prenderse
  disponible salteando el chequeo de "perfil completo", o poner como foto una
  imagen de otro sitio.
- **El nombre** (`nombre_completo`): lo edita el propio profesional en
  `/mis-datos`. Congelarlo una vez validada la identidad es una decisión de
  producto (Diego).
- **La base de la instancia institucional** se provisiona con este mismo schema:
  hay que aplicarle la misma migración. No se verificó desde acá.
- Otras columnas con permiso de escritura que no se analizaron una por una (CUIT,
  e-mail, título, áreas de atención, teléfonos): quedan como estaban.
