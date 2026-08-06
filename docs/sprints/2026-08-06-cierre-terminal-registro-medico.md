# Cierre terminal de la cadena de registro médico (06/08/2026)

Tras una semana de drenaje (4 causas documentadas en
`2026-08-04-drenaje-registro-medico-fotos-y-firma.md`), Diego exigió auditoría
completa de la cadena con desconfianza de cada paso, y cierre con validación
empírica. Se corrió con orquestación multi-agente (3 auditores adversariales de
fase + 3 implementadores + 3 revisores adversariales por PR + correctores).

## Lo que salió a producción hoy

| PR | Qué |
|---|---|
| #339 | El médico a medio registrar ya no cae al onboarding de PACIENTE al entrar por la home (le pedíamos obra social; la home además le creaba ficha de paciente) |
| #340 | Reintento de registro con mail existente: aviso honesto + botones Iniciar sesión / Recuperar (antes: "Revisá tu email" y el mail NUNCA llegaba — anti-enumeración de GoTrue) |
| #341 + #343 | Las claves de firma electrónica se crean en el registro + cron diario de respaldo. **15 aprobados desbloqueados** (32/32 con claves) — no podían ponerse disponibles y el cartel solo decía "completá tu perfil" |
| #342 | Tilde verde fantasma en la credencial + la firma acepta HEIC de iPhone + paso 3 instrumentado |
| #344 | En el celular no existía el acceso para médicos (nav lo ocultaba por CSS; 2 médicos reales se registraron como pacientes primero) — "Soy médico" siempre visible + link en registro de paciente |
| #345 | Funciones Vercel a São Paulo (gru1), al lado de la base — dashboard de 3,5-4,6s a **0,5-1,1s** |
| #346 | La ficha de médicos pendientes deja de mentir sobre el gate de identidad: lee el flag real y dice la consecuencia exacta (prendido = aprobar la deja grisada y sin poder atender hasta la biometría). Leyenda "kill switch" en Configuración. El revisor adversarial cazó que el texto nuevo TAMBIÉN mentía ("no va a aparecer" — falso: aparece grisada, decisión 22/06) |
| #347 | Cron `recuperar-registros` (diario 10:00 ART): mail de recupero automático (Valentina) a cuentas de médico sin ficha (24h-21 días, dedupe doble por Bandeja+app_metadata) + alerta 🟡 por médicos en `pendiente_revision` >24h (caso Yurimare: 18 días mirando "menos de 24 horas") |
| #348 | Formulario blindado: **autosave en localStorage** (recargar ya no borra nada; borrador POR USUARIO — compu compartida no filtra PII; se limpia al enviar OK), validaciones de celular/CUIT/cruce DNI en el paso 1 (antes explotaban en el 3), DNI/CUIT con puntos aceptados (cliente Y server), errores del server saltan al paso 1 con foco, especialidades faltantes (Emergentología, Medicina general y familiar, C. vascular, Flebología, C. paliativos), `noValidate` |

## Validación terminante (batería E2E contra producción, 15/15 ✅)

Autosave: campos+matrícula MP+provincia restauradas tras recarga; doble recarga
sin degradar (hallazgo del revisor, corregido); borrador de OTRO usuario se
descarta. Registro completo desde Pixel emulado: DNI/CUIT con puntos, credencial
real de 11,6 MB, firma con el dedo, ficha creada, DNI persistido normalizado,
borrador limpiado tras el éxito, aterrizaje en identidad. Reintento con cuenta
existente: aviso + botones. "Soy médico" en la home y en el registro de paciente.

Primera corrida real del cron: 324 usuarios revisados, **12 recuperos enviados**
(dedupe excluyó bien a los 4 ya contactados a mano), 1 alerta de pendientes.

## Aclaraciones operativas que salieron de la sesión

- **"KILL SWITCH"** en /admin/configuracion = flags con `es_kill_switch=true`:
  interruptores de emergencia. Verde = flujo andando. No es un error.
- **Gate de identidad: PRENDIDO** (orden de Diego 20/07, condiciones cumplidas).
  Aprobar a un médico sin biometría lo deja grisado/no-reservable hasta que la
  haga; los recordatorios corren solos. La memoria "gate apagado" estaba vieja.
- La descripción del flag en la DB se corrigió (decía "estado actual" de julio).

## Deuda que queda anotada (no bloqueante)

- Mail de bienvenida post-aprobación no lista los pasos reales ni linkea al wizard.
- Auto-apagado de disponibilidad a las 4h: 88 apagados en 45 días sobre los
  médicos más activos (Gabriel 26/29) — revisar el costo/beneficio con datos.
- Wizard: "¡Listo, ya podés atender!" con MP sin conectar; pasos sin salida.
- RegistroIdentidad (la pantalla del registro) sin link de escape (la del
  dashboard sí lo tiene).
- Tokens MP sin renovación automática (vencen desde 15/11/2026).
- Instrumentación de Fase C (identidad/onboarding/MP) inexistente.
