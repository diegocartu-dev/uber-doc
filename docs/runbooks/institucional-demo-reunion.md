# Runbook — la reunión de demostración

Cómo se prepara y cómo se cierra una reunión en la que los participantes **son
los actores**: uno entra como profesional, otro como paciente, y el circuito
ocurre en vivo contra la instancia institucional.

Pantalla: **`/admin/demo`**. Todo lo de acá es admin-only y solo existe en la
instancia institucional.

> **Los participantes son personas reales.** Su nombre y su celular viven en la
> base de la instancia y en ningún otro lado: ni en el repo (que es público), ni
> en un log, ni en un mensaje de commit. Este documento no lleva un solo dato de
> nadie.

---

## 1. Antes de la reunión

1. **Nueva reunión** → cargá a cada participante con nombre y rol. El celular es
   opcional: el camino garantizado de entrega es el QR proyectado, no WhatsApp
   (que depende de que Meta tenga la plantilla aprobada).
2. Para el que entra como **profesional**, tocá **Preparar agenda**.
3. **Leé lo que dice la pantalla después de preparar.** Hay dos bloques y
   significan cosas distintas:
   - **Verde (notas)** — lo que quedó puesto. Incluye la frase más importante del
     runbook: *"Nova tiene libre de HH:MM a HH:MM"*.
   - **Rojo ("Ojo antes de empezar")** — lo que **va a fallar en vivo** si nadie
     lo mira. Hoy son dos: la ventana de consulta inmediata cerrada a esta hora
     (el toggle "disponible" no enciende ningún chip en el call center) y que ya
     sea demasiado tarde para abrir turnos de hoy (el call center no va a poder
     asignar "para ahora"). Si aparece alguna, esa escena no se puede hacer:
     movela o cambiá el horario de la reunión.

**Preparar agenda se puede tocar las veces que haga falta.** No duplica turnos,
no crea pacientes de utilería de más y no crea un segundo profesional de
respaldo.

---

## 2. La banda libre — lo único que hay que recordar

El escenario llena **una sola mitad del día** (09:00–12:00 o 15:00–18:00) y deja
**la otra entera libre, todos los días del rango**.

Cuál se llena lo decide la hora de la reunión: antes de las 13 hora argentina se
llena la mañana; de ahí en adelante, la tarde. Es a propósito — el call center
necesita turnos **cerca de la hora de la reunión** para poder asignar "para
ahora", y esos turnos tienen que existir en la mitad del día en la que la
reunión efectivamente ocurre.

**Ya no hace falta soplarle nada al participante.** Nova recibe en su contexto
qué franjas tiene ocupadas ese profesional y de dónde salieron, y el confirmador
recorta el pedido contra eso antes de mandarlo. O sea que los tres pedidos
funcionan:

| Lo que pide el participante | Qué pasa |
|---|---|
| La banda **libre** ("abrime de 15 a 18") | Se crea, como siempre. |
| La banda **llena** ("abrime de 9 a 12") | No se crea —nadie atiende dos cosas a la vez— pero la respuesta ofrece el hueco real: *"de 9 a 12 ya tiene los turnos de la institución; le puedo abrir de 12 a 20, ¿va?"*. |
| **Las dos juntas** ("de 9 a 12 y también de 15 a 18") | Se crea la mitad libre y se dice qué quedó afuera y por qué. Antes fallaba entero, en las dos configuraciones del escenario. |

La pantalla igual dice cuál es la banda libre después de preparar la agenda: sirve
para saber qué esperar, no para tener que dictárselo a nadie.

Fijado por `src/lib/institucional/agenda-ocupada.test.ts`, que corre los tres
pedidos contra `crearAgendaModelo` de verdad.

---

## 3. El QR: mostrar ≠ regenerar

Son **dos botones distintos** y hacen cosas opuestas:

| Botón | Qué hace |
|---|---|
| **Ver QR** | Vuelve a proyectar el **mismo** enlace. No toca la base y no echa a nadie. |
| **Regenerar** | Emite un enlace **nuevo**: el anterior deja de funcionar y **quien haya entrado con él queda afuera en el acto**. Pide confirmación **siempre**. |
| **WhatsApp** | Manda un enlace **nuevo**, así que echa igual que "Regenerar". Misma confirmación. |

"Ver QR" funciona mientras la pantalla siga abierta: en la base vive solo el
sha256 del token, así que el enlace pelado existe una sola vez, en la respuesta
que lo creó. **Si recargás la página, el QR anterior ya no se puede volver a
mostrar** —no hay dónde leerlo— y "Ver QR" pasa a ofrecerte emitir uno nuevo.
Cuando eso pasa, **te lo pregunta**: aunque el semáforo diga "Invitado". Esa
marca la escribe un proceso best-effort que nunca frena la entrada, así que una
persona que entró perfectamente puede seguir figurando como invitada — y antes
la echábamos en silencio. Igual conviene no recargar `/admin/demo` durante la
reunión.

El enlace **vence a las 12 horas** (`HORAS_ACCESO_DEMO`). Cubre el día de la
reunión con margen y no cubre el día siguiente.

---

## 4. Durante la reunión

- El semáforo de cada participante: **Invitado → Entró → Atendiendo**. "Atendiendo"
  se deriva de que haya un encuentro en curso: es la señal de que el circuito
  arrancó de verdad.
- Si un profesional aparece con **"sin firma"**, tocá **Reintentar firma** *antes*
  de la escena de la receta. Sin claves, el documento sale sin sello y la página
  pública de verificación queda en ámbar, proyectada.
- En el **panel** (`/panel`), la consulta de la reunión aparece en la tab
  "Consultas" con un chip **Demostración**. Eso es a propósito: la fila se ve
  —es la escena del panel reflejando lo que acaba de pasar— pero **no entra en
  ningún KPI de arriba ni en la factura**. Si alguien pregunta, ese chip es la
  mejor respuesta posible: el sistema ya sabe que eso no se cobra.

---

## 5. Al terminar: limpiar la reunión

**Limpiar reunión** borra a los participantes con sus datos, y los turnos,
consultas y documentos que hayan generado.

**Lo que NO se va, y hay que saberlo antes de decir "está todo limpio":**

- **El documento firmado y su registro de firma.** `firma_logs` es append-only
  por ley y retiene por FK al documento: no se pueden borrar, ni ahora ni nunca.
  Su página `/verificar/{id}` sigue en línea para siempre.
- **La ficha del profesional**, si firmó algo: sobrevive **anonimizada** (sin
  nombre, sin celular) y fuera de la oferta del call center.

**Ninguna de esas dos cosas lleva el nombre de nadie.** El sello y el log se
emiten desde el principio con nombre de utilería ("Profesional de demostración",
"Paciente de demostración"), sin DNI, sin CUIL y sin la IP ni el navegador del
participante — y `/verificar` de un documento de demostración no muestra
identidad ninguna. Lo que no se escribe no hay que anonimizarlo después.

La pantalla lista al final exactamente qué quedó. Si algo falló de verdad, la
reunión **no** se marca como cerrada y el botón sigue disponible para reintentar.

**Si nadie toca el botón**, un barrido limpia sola toda reunión que lleve más de
24 horas abierta.

---

## 6. Lo que la reunión no puede tocar, por construcción

- El participante **no aparece** en la oferta del call center para un paciente
  real, ni al revés: los tres caminos que asignan un paciente a un profesional
  (turno, consulta inmediata y reprogramación) rechazan el cruce de mundos.
- Sus encuentros **nunca** entran a la factura de la provincia ni a los KPI del
  panel.
- Sus slots **no** cuentan como "oferta que nadie tomó".
- Sus documentos salen con marca de agua **"DEMOSTRACIÓN — SIN VALIDEZ LEGAL"**.

Todo eso está fijado por tests que leen el código fuente
(`src/lib/institucional/demo-aislamiento.test.ts`): si un refactor se lleva
puesta una de esas líneas, el test se pone rojo antes del merge.
