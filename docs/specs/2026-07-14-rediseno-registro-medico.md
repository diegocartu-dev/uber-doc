# Rediseño del registro de médico — SPEC APROBADA (Diego, 14/07/2026)

> **Estado: IMPLEMENTADO Y EN PRODUCCIÓN.** Aprobado detalle por detalle por
> Diego el 14/07/2026 (bosquejos v2) e implementado ese mismo día en los PRs
> #268 y #269, que citan esta spec en sus commits. Los textos entre comillas son
> copy aprobado literal.
>
> **Este documento se archiva como registro del criterio de diseño, no como
> trabajo pendiente.** Se mergeó el 10/08/2026, tres semanas tarde: la spec había
> quedado en un PR abierto mientras el código ya estaba desplegado, y por eso
> `docs/specs/` no existía y tres referencias del repo —dos en comentarios de
> código vivo— apuntaban a un archivo fantasma.
>
> Para el estado ACTUAL del registro, mandan el código y los docs de sprint
> posteriores (`docs/sprints/2026-08-06-cierre-terminal-registro-medico.md`),
> no esta spec: hubo cambios después, como la firma incorporada al registro
> como paso 3 (#295).

## Principio rector

**El registro es SOLO validación de identidad profesional. Cero configuración
de consulta.** Precio, duración y modalidad se ELIMINAN del registro y pasan a
la habilitación de agenda y de Consulta Inmediata (rediseño aparte, pendiente).
Disparador: el paso 3 actual ("Tu consulta") confunde — el médico no entiende
qué está configurando ni por qué, antes siquiera de conocer el producto.

## Flujo completo

```
REGISTRO (3 pasos, solo validación)
  1. Completá tus datos          (3 bloques por propósito)
  2. Subí tu credencial          (qué es / qué NO es)
  3. Verificá tu identidad       (Didit, DENTRO del registro, ANTES de aprobar)
  → Salida inmediata: "Tu registro está completo" (pendiente de aprobación)

APROBACIÓN MANUAL (admin)
  Ficha con los 3 resultados + chequeos automáticos (REFEPS + cruce identidad)
  → Aprobar = habilitado (lado validación)

POST-APROBACIÓN (el médico, desde su panel)
  Conectar Mercado Pago + firma (manuscrita y electrónica)  ← confirmado: NO es
  solo MP; la firma también queda pendiente tras aprobar.

HABILITACIÓN DE AGENDA / CI (rediseño aparte, pendiente de diseño)
  Ahí se pone el precio — en cada agenda y en CI.
```

## Paso 1 — "Completá tus datos" (v2 aprobada)

Subtítulo: "Es rápido. Lo dividimos en 3 partes." Tres bloques EN ESTE ORDEN:

### 1 · Tus datos profesionales
- Subtítulo: "Con esto validamos tu matrícula y te mostramos a los pacientes."
- Campos: **Título (campo propio: Dr./Dra.)** + Nombre y apellido · Especialidad
  · Matrícula (tipo + número) · DNI · CUIT.

### 2 · Tu consultorio
- Subtítulo: "Estos datos aparecen impresos en tus recetas."
- **Domicilio del consultorio** — hint: "Va en el pie de tus recetas, como pide
  la normativa."
- **Teléfono profesional (OPCIONAL)** — hint: "Este teléfono sí aparece en tus
  recetas."
- **Foto de perfil** — hint: "La ven los pacientes en tu bio. Distinta de la
  credencial (próximo paso)."

### 3 · Cómo te avisamos
- Subtítulo: "Solo uso interno administrativo."
- **Celular personal** — hint: "Te avisamos acá cuando un paciente te está
  esperando. Los pacientes no ven este teléfono." (ícono WhatsApp)

CTA: "Continuar a la credencial".

## Paso 2 — "Subí tu credencial de médico" (aprobado)

- Subtítulo conecta con el paso 1 usando la matrícula declarada: "Así
  confirmamos que la matrícula MN 123456 es tuya."
- Zona de subida: "Sacale una foto o subila" — botones **Sacar foto** (primario)
  y **Subir archivo**. JPG/PNG/PDF hasta 10 MB. Al subir: preview + opción de
  cambiarla antes de continuar.
- Bloque "¿Qué es la credencial?" (anti caso-Williana, que subió otro documento):
  - ✓ "El carnet o certificado de tu matrícula profesional (el que emite el
    Ministerio o el Colegio Médico)."
  - ✗ "No es tu DNI (eso va en el próximo paso) ni tu CV ni tu título."
  - 💡 "Que se lea completa: tu nombre y el número de matrícula, sin reflejos."
- CTA: "Continuar a la verificación de identidad".

## Paso 3 — "Verificá tu identidad" (v2 aprobada)

- Subtítulo: "El último paso. Por la seguridad de tus pacientes, confirmamos que
  quien atiende sos realmente vos."
- Bloque "Vas a necesitar": DNI físico a mano · la cámara para una selfie.
  **SIN mención de tiempo** (Diego: "3 minutos es un exceso, se va"). REGLA DE
  PRODUCTO derivada: **no prometer tiempos en ningún flujo** (aplicar también a
  banner y mails existentes cuando se implemente).
- Consentimiento en una línea humana: "Acepto que Docto verifique mi identidad
  con mi DNI y una imagen de mi rostro." + link "Ver cómo cuidamos tus datos"
  (texto legal existente de Carolina).
- CTA: "Comenzar verificación". Debajo: "Vas a continuar en Didit, nuestro
  proveedor de verificación."

## Salida de la biometría (aprobada) — REGLA DE ORO

**Ninguna pantalla del registro espera a un proveedor externo.** Volver del
escaneo = registro completo. El resultado fino de Didit viaja por atrás
(webhook + cron) al panel del admin. Nunca un spinner esperando a Didit (bug
sufrido por Diego en su prueba en vivo: quedó "procesando" minutos y el panel
después le pedía verificarse de nuevo).

- **Pantalla A (caso normal, AL INSTANTE de volver):** "¡Tu registro está
  completo!" + checklist (Datos ✓ / Credencial recibida ✓ / Identidad
  verificada ✓) + aviso ámbar: "Ahora Docto revisa tu cuenta. Te avisamos por
  email cuando esté aprobada — en menos de 24 horas."
- **Pantalla B (solo si Didit RECHAZÓ, comunicada por email y al reingresar,
  nunca en vivo):** "Tenemos que repetir tu verificación" — "La foto del DNI o
  la selfie no salieron bien. Suele resolverse con buena luz y el documento sin
  reflejos." + CTA "Repetir verificación". El registro sigue pendiente; solo se
  repite ese paso.

## Panel de aprobación del admin (aprobado)

Ficha por médico pendiente, espejo de los 3 pasos, cada uno con badge
(verde/ámbar/rojo):

1. **Datos y matrícula** — badge REFEPS (OK / pendiente / no figura) +
   jurisdicciones habilitadas.
2. **Credencial** — badge Recibida + miniatura + "Ver credencial completa".
3. **Identidad biométrica** — badge (Verificada / En revisión / Rechazada) con
   el cruce DESGLOSADO: ✓ rostro y DNI coinciden (Didit+RENAPER) · ✓ DNI
   escaneado = DNI declarado · ✓ la matrícula pertenece a ese DNI (REFEPS).

Acciones: **Rechazar** (borde rojo) / **Aprobar — queda habilitada** (azul).
Guard: si algún chequeo no está en verde, el botón avisa antes de aprobar.

## Notas de implementación (para cuando Diego dé el GO)

- Campos que el registro actual NO captura y el nuevo SÍ: teléfono profesional
  (opcional), celular personal, domicilio_consultorio, foto de perfil.
- Campos que se VAN del registro: precio_consulta, duracion_consulta,
  modalidad_atencion → necesitan default/null-safety en el INSERT y su captura
  se muda a habilitar agenda / CI (diseño pendiente).
- La biometría pasa a PRE-aprobación → revisar `identidad_gate_activa` (hoy
  APAGADO tras el rollback del 14/07) y el flujo `PantallaIdentidad` (el estado
  "procesando" con polling se reemplaza por la salida inmediata A).
- Cuentas test: hoy saltean la biometría por diseño (`es_cuenta_test`) — decidir
  cómo se prueba el flujo nuevo end-to-end.
- Gates obligatorios: Sofía (UX), Roberto (seguridad — el cruce anti-suplantación
  no se debilita), Carolina (consentimiento/datos biométricos), Martín (lectura
  de médico real).
