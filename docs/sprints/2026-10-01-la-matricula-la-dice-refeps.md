# La matrícula la dice REFEPS — 01/10/2026

## Qué pasaba

El profesional escribe su número de matrícula al registrarse y después valida su
identidad con selfie + DNI. Con la biometría aprobada, el sistema cruza: ¿el
número que escribió figura entre las matrículas que REFEPS tiene para ese DNI?

Si no figuraba, el registro quedaba en **"Necesita TU revisión — identidad
aprobada, cruce sin cerrar"** y esperaba a que alguien del equipo lo resolviera.

Investigados los casos reales (producción, 01/10):

- **Todos los que llegaron a ese cartel por la matrícula eran el mismo error:** un
  dígito mal tipeado, o una diferencia de formato (la provincia antepone letra y
  cero; el profesional escribe solo el número). En todos, REFEPS tenía la
  matrícula correcta para ese DNI.
- **El cartel pedía "corregilo en la ficha" y la ficha no tenía cómo.** No existía
  ninguna acción en el panel para cambiar una matrícula: cada caso terminó en una
  corrección por SQL.
- Hubo un caso distinto, que no es tipeo: declaró una matrícula de una provincia y
  REFEPS solo tenía, para ese DNI, una de otra jurisdicción.

No se verificó cuántos profesionales abandonaron el registro por esto sin llegar
a escribir a soporte: el dato no está en la base.

## Qué se decidió (Diego, 01/10)

*"Yo no puedo estar más resolviendo estos temas de error de tipeo, es un problema
de diseño."* — *"Si la valida REFEPS es real."*

Un número escrito a mano no puede valer más que el del registro oficial para un
DNI verificado por biometría. **Lo que el profesional escribe pasa a ser una
pista (dice con qué jurisdicción quiere atender); el número sale de REFEPS.**

Se evaluó leer el número de la foto de la credencial y se descartó: es sumar otro
lector que puede confundir un dígito, cuando REFEPS ya lo entrega como dato.

## Qué se construyó

Vale para una **matrícula de médico, habilitada**, que REFEPS tiene para el DNI
que verificó la biometría. Una de otra profesión o inhabilitada no coincide ni se
adopta nunca.

| Situación | Antes | Ahora |
|---|---|---|
| El número escrito es, tal cual, una de las suyas, en la jurisdicción que declaró | valida | valida (igual) |
| El número es suyo pero de otra jurisdicción (eligió MN y es provincial, o al revés) | validaba y quedaba congelado el tipo equivocado | **se corrige tipo y provincia** y valida |
| No figura tal cual (un dígito, una letra o un cero adelante), y en la jurisdicción declarada REFEPS tiene **una sola** de médico habilitada | revisión manual | **se adopta la de REFEPS**, escrita como la tiene REFEPS, y valida |
| No hay una única respuesta (otra jurisdicción, varias, inhabilitada, de otra profesión, profesional ya aprobado, matrícula cargada en otra cuenta) | revisión manual, sin forma de resolver desde el panel | revisión **con el motivo concreto** y **«Usar esta»** sobre las matrículas de REFEPS, que valida en el momento |

- Regla pura y probada: `src/lib/medicos/matricula-refeps.ts`.
- Dónde se aplica: `src/lib/didit/reconciliar.ts`. Un solo camino para el
  webhook de Didit, el cron `reconciliar-identidad` y «Usar esta».
- Acción del panel: `usar_matricula_refeps` en `src/app/api/admin/medicos/route.ts`.
  No se escribe ningún número: le pregunta a Didit qué DNI verificó, exige que sea
  el de la ficha, consulta REFEPS **en vivo** por ese DNI y solo acepta una de sus
  matrículas de médico habilitadas. Después cierra el cruce en el momento y
  devuelve el estado real. Queda en el log de auditoría. Está en la tarjeta de
  Pendientes y en la ficha.

### Por qué no abre una puerta

El cruce existe para impedir que alguien se valide con su identidad y se quede
con la matrícula de otro. La matrícula que se adopta pertenece, por construcción,
a la persona que acaba de probar quién es: sale de REFEPS consultado con el DNI
que verificó la biometría. Lo que el cruce impedía sigue impedido, y la revisión
encontró que antes había un hueco que ahora se cierra: el "coincide" viejo
comparaba solo dígitos contra **cualquier** matrícula de la persona, de cualquier
jurisdicción y profesión.

La adopción ocurre **después** de la biometría, no al registrarse: antes de eso
el DNI es solo un número tipeado.

### Lo que se cuidó

- **Un solo lugar escribe `identidad_validada = true`** (`cerrarCruce`). Relee la
  ficha, exige que el DNI siga siendo el que verificó la biometría y escribe con
  DNI, tipo, número y provincia como condición: si el profesional cambió algo
  mientras se consultaba a Didit y al Bus (hasta un minuto), no se escribe nada y
  la próxima corrida vuelve a mirar. Antes, el camino que ya existía validaba sin
  esa condición.
- En ese mismo update se guarda **lo que REFEPS dijo para el DNI biométrico**
  (datos, validación, jurisdicciones). Antes quedaba lo de la validación del
  alta, hecha con el DNI tipeado.
- La adopción y la validación van en el **mismo update**: el candado de la base
  congela la matrícula una vez validada.
- **Solo matrículas de médico.** REFEPS devuelve bajo un DNI las matrículas de
  todas las profesiones de la persona; cada una ahora lleva la suya. Una de otra
  profesión tampoco cuenta como jurisdicción para atender.
- "M1234" y "K1234" son dos matrículas distintas: entre dos no se elige sola.
- Un profesional **ya aprobado** no se corrige solo: cambiarle la matrícula lo
  devuelve a revisión (trigger `reverificar_medico`) y lo saca de la clínica. En
  el panel se pide confirmación.
- Si la ficha no se puede leer o escribir, **no se decide nada** y la próxima
  corrida reintenta. No se manda a revisión por una falla nuestra.
- El slug del perfil público lleva el número: se actualiza **solo si el
  profesional nunca estuvo aprobado** (se decide con la ficha de antes del
  cambio). Si choca, queda el viejo.
- Un timeout de REFEPS ya no borra las matrículas que estaban guardadas.
- **La provincia que cuenta es la de la matrícula** (`provincia_matricula`).
  `medicos.provincia` es otra cosa: el onboarding guarda ahí la del consultorio.
  Usarla mandaba a revisión a profesionales con la matrícula correcta (lo encontró
  la tercera ronda de revisión).
- «Usar esta» **siempre** pide confirmación: la matrícula elegida queda congelada
  en el mismo clic.

### Revisión

Dos revisiones independientes (seguridad y correctitud) sobre los primeros dos
commits; sus hallazgos se corrigieron en el tercero. Una segunda ronda con cuatro
lentes (seguridad del cruce, columnas que el profesional puede escribir directo,
correctitud, panel) y dos verificadores por hallazgo; lo de esta rama se corrigió
en el cuarto commit. Una tercera ronda sobre el estado final encontró, entre otras
cosas, el error de la provincia del consultorio; se corrigió con pruebas del cruce
completo contra una base falsa que aplica las condiciones de cada escritura.

## Decisiones abiertas para Diego

1. **¿Se le avisa al profesional cuando se le corrige la matrícula?** Hoy no: la
   ve corregida en su perfil y el equipo ve la nota en la ficha.
2. **¿Se saca el campo "número" del formulario de registro?** Con esto el número
   escrito ya no manda, pero se sigue pidiendo. Sacarlo es el paso siguiente
   (pedir solo "Nacional / Provincial + provincia"), y es más grande: hoy el
   número se usa al crear la ficha (chequeo de duplicado, slug) y REFEPS puede
   tardar o no responder en ese momento.

## Deuda declarada

- El rastro de una adopción automática va al log de auditoría con actor
  "sistema", pero eso necesita que `admin_audit_log.admin_user_id` acepte vacío
  (migración pendiente, va con la de abajo). Hasta entonces queda solo la nota en
  `notas_admin`, que rechazar, suspender o reactivar reemplazan y que el propio
  profesional puede escribir.
- La revisión encontró además un problema de la base, anterior a este cambio y
  que no depende de él. Se trata en su propio PR, con migración.
- La validación automática de REFEPS al registrarse (`lib/refeps/persistir.ts`)
  no mira el número declarado: dice "figura y está activo" para el DNI. El cruce
  del número ocurre recién con la biometría.
