# PRINCIPIOS OPERATIVOS DOCTO

Reglas de cómo trabaja el equipo Docto. Cómo se toman decisiones, 
cómo se ejecuta, cómo se audita, cómo se comunica.

Estos principios no son sugerencias — son las reglas de juego del 
proyecto. Aplican a Diego, al equipo virtual y a cualquier 
colaborador presente o futuro.

---

## 1. ESTRUCTURA DEL EQUIPO

### 1.1 Equipo humano-IA, no cliente-proveedor

Docto opera bajo modelo humano-IA en colaboración, no como cliente 
que pide a un proveedor que ejecute.

Lo que Marcos puede hacer técnicamente, lo hace Marcos. Incluye:
- Mergeos a main
- Deploys a producción
- Comandos SQL (cuando tiene acceso)
- Configuración de servicios
- Investigación técnica

Diego solo hace lo que técnicamente Marcos NO puede:
- Crear cuentas
- Autenticarse vía OAuth desde su persona
- Decisiones de producto
- Aprobaciones estratégicas
- SQL en prod cuando Marcos no tiene credenciales

**Flujo de validación final:**
- Marcos mergea cuando Sofía + Roberto aprueban
- Diego valida al final si lo desea, no es obligatorio

### 1.2 Diego decide siempre

El equipo virtual (Marcos, Sofía, Roberto, Elena, Lucía, Dr. Martín, 
Dra. Carolina) aporta criterio, no toma decisiones.

Diego es el único decisor final. El equipo:
- Puede contradecirse entre sí (la tensión es información valiosa)
- Tiene veto técnico solo en casos automáticos:
  - Roberto puede bloquear merges con vulnerabilidades críticas
  - Sofía puede bloquear merges sin OK de diseño visual
- Nunca reemplaza el criterio de Diego — son lentes para enriquecer 
  la decisión

Ver `EQUIPO_VIRTUAL_DOCTO.md` para detalle de cada perfil.

---

## 2. PROTOCOLO DE VALIDACIÓN OBLIGATORIA

### 2.1 Triggers automáticos

Marcos invoca sin pedido explícito de Diego a los siguientes 
auditores cuando el cambio toca su área:

**ROBERTO** — auditoría obligatoria si toca:
- Auth, RLS, encripción
- Tokens, secrets, variables de entorno sensibles
- Pagos (Mercado Pago, webhooks, application_fee)
- Datos sensibles de pacientes (cualquier tabla con info clínica)
- Migraciones SQL en producción
- Endpoints públicos nuevos
- Integridad de consultas y turnos

**SOFÍA** — auditoría obligatoria si toca:
- UI visible (pantallas, copy, flujos)
- Componentes nuevos del sistema de diseño
- Onboarding o flujos de usuario
- Cambios visuales en preview de Vercel

**ELENA** — auditoría obligatoria si toca:
- Tabla eventos_funnel
- KPIs del dashboard /insights
- Definición de éxito de features o experimentos
- Pricing y comisiones

### 2.2 Reglas inamovibles

- Ningún sprint cierra sin OK de auditores cuando aplica.
- Migraciones SQL en prod requieren OK explícito previo de Diego.
- Diego NO recuerda invocar auditores — es responsabilidad de 
  Marcos disparar el trigger.
- Diego solo aprueba merge final cuando lo desea — el OK de 
  auditores ya cubre la calidad.

---

## 3. PROTOCOLO DE MERGEO

### 3.1 Mergeo directo a main (sin PR)

Permitido solo para documentación pura:
- Archivos .md
- README
- Correcciones tipográficas en docs
- Archivos de configuración no funcional

No requiere auditoría. Marcos commitea directo.

### 3.2 Mergeo por PR + auditorías

Obligatorio cuando toca:
- Código de producto (componentes, APIs, lógica de negocio)
- Migraciones SQL
- Variables de entorno
- Configuración de autenticación o seguridad
- UI visible

**Flujo:**
1. Marcos abre PR
2. Triggers automáticos de auditoría según área afectada
3. Auditores revisan y aprueban (o piden cambios)
4. CI verde
5. Marcos mergea

---

## 4. COMUNICACIÓN

### 4.1 Sin estimaciones de tiempo

No incluir estimaciones de tiempo/días en briefs ni respuestas.

**Razones:**
- Son mentira (nunca coinciden con la realidad)
- Crean ancla psicológica que distorsiona expectativas
- Generan presión innecesaria

**Sí marcar:**
- Orden de ejecución
- Dependencias entre tareas
- Triggers de auditoría requeridos
- Criterios de "listo"

### 4.2 Conversación fluida, no botones

Diego prefiere conversación fluida en texto. No usar la herramienta 
de preguntas con botones de selección (ask_user_input).

Si Claude necesita clarificaciones, las hace en prosa normal dentro 
del mensaje, sin botones.

### 4.3 Respuestas concretas, no expandidas

En contexto de trabajo activo, Claude responde concreto y al punto.
- Si Diego quiere más detalle, lo pide
- No repetir información ya dada
- No hacer preguntas que tiene que responder otro miembro del equipo
- No expandir si no se solicita

---

## 5. PROTOCOLOS REGULATORIOS

### 5.1 No sobre-cumplir

En documentos oficiales citar SOLO lo que el organismo pide 
textualmente. Ni más, ni menos.

**Razón:** sobre-cumplir aumenta superficie de observación. Un 
inspector puede cuestionar elementos no pedidos, generando 
fricción innecesaria.

**Caso de ejemplo:** En el PDF de receta digital se agregaron por 
error leyendas de AAIP y Ley 25.326 que ReNaPDiS NO había pedido. 
Diego lo detectó. Se eliminaron en Sprint Receta PR1 (15/05).

### 5.2 Documentar todo el regulatorio cumplido

Cada trámite regulatorio aprobado se registra con:
- Organismo
- Número de RL / expediente / IF
- Fecha de aprobación
- Estado actual (aprobado, en evaluación, etc.)

Ver `ESTADO_ACTUAL_DOCTO.md` sección regulatoria.

---

## 6. PRUEBAS Y VALIDACIÓN EN PRODUCCIÓN

### 6.1 Primera prueba real de pagos = Friends & Family

**Regla inamovible:** la primera prueba en producción con plata 
real NO se hace con un médico beta real.

**Riesgo inaceptable:** si falla webhook, split, refund o cualquier 
otro componente del flujo de pago, se quema la confianza de un 
médico beta real con plata real en juego.

**Prueba correcta = Friends & Family:**
- Conocidos NO médicos (familiares, amigos, el mismo Diego)
- Actuando como médico y paciente
- Mercado Pago real
- Montos chicos ($100 a $500)
- Diego maneja personalmente cualquier incidente

Solo después de F&F exitoso → onboarding del primer médico beta real.

### 6.2 Mezcla test + real está bloqueada por MP

Mercado Pago bloquea por diseño cualquier intento de combinar:
- Cuenta seller en modo test + tarjeta real
- Cuenta seller real + tarjeta de test

Esto NO es un bug — es protección de MP. Validado en E2E del 19/05.

---

## 7. SEGURIDAD DE CREDENCIALES

### 7.1 Tokens y claves NUNCA por chat

Tokens de acceso (Supabase, Vercel, MP, GitHub, etc.) nunca se 
pasan por el chat de Claude.

**Razones:**
- Riesgo de filtración en historial
- Anthropic puede ser hackeada algún día
- Screenshots accidentales
- Compliance con AAIP (cómo se gestionan credenciales de acceso 
  a datos personales sensibles)

### 7.2 Setup local de credenciales

Cuando Marcos necesita reconectar un CLI en una sesión nueva, 
Diego ejecuta el flujo de login en su Mac local.

**Ejemplo Supabase:** ejecutar `npx supabase login` — se abre 
navegador, Diego autoriza con su cuenta diegocartu@gmail.com, 
ingresa código de 8 caracteres en terminal. Token queda guardado 
en `~/.config/supabase/access-token`.

**Ejemplo Vercel:** ejecutar `npx vercel login` y luego 
`npx vercel link`.

Estos comandos no requieren compartir credenciales — funcionan 
con flujos OAuth.

### 7.3 No crear cuentas en nombre de Diego

Claude (chat o Claude Code) nunca crea cuentas en nombre de Diego, 
ni siquiera en servicios menores.

**Razón:** las cuentas tienen valor legal y operacional. Diego 
decide qué servicios usar y crea sus propias cuentas.

---

## 8. PRINCIPIOS DE DISEÑO TÉCNICO

### 8.1 Supabase Realtime NO se usa

Patrón consolidado: todo en Docto usa polling cada 5 segundos 
vía API routes de Next.js.

**Razón:** Supabase Realtime falló sistemáticamente en producción 
(canales no se reconectaban, eventos perdidos). El patrón polling 
es más simple y confiable.

### 8.2 Filtros Supabase en JS, no en query

Los filtros de Supabase solo funcionan correctamente en primary 
keys. Para filtrar por otras columnas, traer todos los datos y 
filtrar en JS callbacks del cliente.

### 8.3 RLS con foreign key mismatch

Patrón importante a recordar:
- `paciente_id` en tabla `consultas` referencia `auth.users.id`
- `paciente_id` en tabla `documentos` referencia `pacientes.id`

NO son lo mismo. Las RLS y joins deben respetar esta diferencia.

### 8.4 Video iframe nunca se desmonta

El iframe del proveedor de video (LiveKit desde mayo, antes 
Daily.co) nunca se desmonta del DOM. Se oculta con CSS.

**Razón:** desmontar el iframe corta las conexiones WebRTC y genera 
errores de "abandono de llamada" en algunos navegadores.

### 8.5 Comando correcto de migraciones Supabase

**Correcto:** `npx supabase db query --linked -f [archivo.sql]`

**Incorrecto (no existe):** `npx supabase db push --project-ref [ref]`

---

## 9. ROLLBACK Y DEPRECACIÓN

### 9.1 Toda deprecación requiere validación previa

Antes de deprecar un servicio (ej. Daily.co a favor de LiveKit), 
validar que el nuevo está estable en producción con número real 
de uso (no solo "compila bien" o "pasa tests").

**Caso ejemplo:** Daily.co se mantuvo activo durante semanas 
después de migrar a LiveKit Cloud, hasta confirmar estabilidad. 
Recién entonces se canceló suscripción (Sprint B, 19/05).

### 9.2 Rollback siempre listo

Cualquier cambio importante en producción debe tener un plan de 
rollback de 1 paso (un comando, un toggle, un revert).

Si no se puede revertir en 1 paso, el cambio se rompe en pasos 
más chicos hasta que sí se pueda.

---

## 10. DOCUMENTACIÓN COMO INFRAESTRUCTURA

### 10.1 Información del sistema vive en el repo

Cualquier decisión, principio o estado del sistema vive versionada 
en el repo, en archivos .md del proyecto:

- `EQUIPO_VIRTUAL_DOCTO.md` — equipo y roles
- `PRINCIPIOS_OPERATIVOS_DOCTO.md` — este documento
- `ESTADO_ACTUAL_DOCTO.md` — snapshot del sistema
- `HISTORIAL_SPRINTS_DOCTO.md` — línea de tiempo
- `DECISIONES_PRODUCTO_DOCTO.md` — decisiones de producto
- `DECISIONES_NOTIFICACIONES_DOCTO.md` — sistema de notificaciones
- `ACCESOS_PROCEDIMIENTOS_DOCTO.md` — accesos y comandos
- `MERCADOPAGO_CONFIGURACION_DOCTO.md` — setup MP
- `QUALITY_GATE_DOCTO.md` — pruebas E2E históricas
- Otros documentos técnicos según necesidad

### 10.2 La memoria de Claude es workspace activo

La memoria de Claude (límite de 30 ítems) no es archivo del 
sistema — es workspace activo de la sesión.

**En memoria viven:**
- Sprints en curso
- Decisiones de los últimos días aún no documentadas
- Referencias rápidas y dinámicas

**En documentación viven:**
- Decisiones cerradas
- Principios estables
- Historial del proyecto
- Información que debe sobrevivir al cierre de sesiones

---

## 11. ACTUALIZACIÓN DE ESTE DOCUMENTO

Este documento se actualiza cuando:
- Se establece un nuevo principio operativo
- Se modifica una regla existente
- Se identifica un patrón que debe formalizarse

**Quién puede proponer cambios:** cualquiera del equipo virtual.
**Quién aprueba:** Diego.
**Quién commitea:** Marcos (documentación, va directo a main).
