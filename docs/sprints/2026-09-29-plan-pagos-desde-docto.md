# Plan — Docto paga por Mercado Pago

**Fecha:** 29/09/2026 · **Estado:** PROPUESTA — espera OK de Diego (decisiones en §3) · **Nada de esto está construido.**

**Origen:** decisión de Diego del 28/09 (a los profesionales de medicina laboral les paga Docto por Mercado Pago, desde su cuenta con saldo) y su pedido del 29/09: *"es la pata que nos está faltando para reintegros tanto en pacientes como en médicos de Docto tradicional"*.

---

## 1. Una pata, tres usos

| Uso | Hoy | Con esta pata |
|---|---|---|
| **Reintegro al paciente cuando el refund de MP no sale** (el profesional no tiene saldo) | La política (§2.2) escala a las 48 h a una "transferencia manual por CVU" desde el panel de admin. El CVU **nunca se capturó**: el ticket 3A sigue pendiente desde mayo y el panel muestra el campo vacío (`api/admin/reembolsos/route.ts`). | Docto le transfiere al paciente, a su cuenta de MP. |
| **Reintegro al profesional cuando la falla fue nuestra** | La regla está vigente (*la plata sale de Docto, no del neto del profesional*) pero no tiene mecanismo: un refund total de MP le saca el neto al profesional, y en código no hay forma de marcar que la falla fue nuestra. | Docto le devuelve el neto al profesional. |
| **Honorario de medicina laboral** (Validdar) | No existe ningún pago de Docto a un profesional, ni en el B2C ni en la instancia institucional. | Docto le paga el canon al emitirse el informe. |

**Para el paciente es la vía de reserva, no el reemplazo del refund.** El refund de MP sobre el pago original sigue siendo el camino normal: devuelve al mismo medio, revierte la comisión sola y deja el pago como `refunded`. Si Docto le transfiere por fuera, el pago original queda `approved`; si además el paciente lo desconoce con su tarjeta, la plata se devuelve dos veces. Por eso esta pata solo se usa cuando el refund de MP falló, nunca en su lugar, y cada transferencia queda asentada contra el pago original.

---

## 2. Lo verificado (29/09/2026)

Doc oficial de MP Argentina + pruebas de solo lectura contra producción. Las pruebas no imprimieron ningún email ni dato personal: solo sí/no.

**El riel: API de Payouts (`POST /v1/payouts`).**
- Mueve plata del **saldo** de la cuenta de origen. Requisitos publicados: cuenta de vendedor y fondos suficientes.
- Destino entre cuentas de MP: el **email de la cuenta de MP** del que recibe (`transactions.account.email`).
- Destino bancario: **solo cuenta corriente** ("no es posible transferir a una cuenta de ahorro"). Los campos (banco de 3 dígitos, sucursal) y un mensaje de error que nombra "TED" —el sistema de transferencias de Brasil— sugieren que esa parte está pensada para Brasil. **No hay campo de CBU, CVU ni alias.** Para Argentina, el destino que la documentación respalda es el email de la cuenta de MP.
- Para producción: par de claves ed25519, cada pedido firmado, y la clave pública se le entrega al "equipo de Integraciones" de MP. Es un paso con una persona, y la documentación no dice cuánto tarda.
- Una transacción solo se cancela mientras está pendiente o en proceso: **una vez procesada, no se revierte.**
- MP rechaza por su cuenta con motivos propios: `insufficient_funds`, `high_risk`, `review_manual`, `by_provider`, entre otros.
- **Costo de la API y plazo de acreditación: no publicados.**

**Costos e impuestos (centro de ayuda de MP).**
- Transferencia entre cuentas de MP con dinero en cuenta: **0%**. Es el costo de la transferencia manual; no sé si la API cuesta lo mismo.
- Impuesto a los débitos y créditos: **0,6%** a personas jurídicas cuando envían dinero a terceros con dinero en cuenta. Las personas físicas no están alcanzadas.

**El dato del profesional sale solo.** Con el token OAuth del profesional, `GET /users/me` devuelve el email de su cuenta de MP (probado contra producción). Hoy Docto consulta ese endpoint —en la conexión y en el cron diario `verificar-cuentas-mp`— pero guarda solo el país (`site_id`); el email no se guarda en ningún lado (`medicos_mp_accounts` no tiene la columna).

**El dato del paciente hay que pedirlo.** Con el token de Docto, el pago de MP no trae ningún dato del pagador (objeto `payer` vacío, probado contra producción). Quien pagó con **dinero en cuenta** tiene cuenta de MP con seguridad; quien pagó con tarjeta, no se sabe.

**Una premisa de la política ya no vale.** `POLITICA_REEMBOLSOS_DOCTO.md` §2.2 justifica la transferencia *manual* así: *"Mercado Pago Argentina no tiene API de disbursement para marketplaces"*. La documentación oficial de hoy sí la publica. No sé si la API es nueva o si en mayo no se encontró. La regla (a las 48 h Docto cubre al paciente) no cambia; cambia el cómo.

---

## 3. Decisiones de Diego

| # | Pregunta | Recomendación |
|---|---|---|
| **D-a** | Cambiar el *cómo* de §2.2 de la política ("no rediscutir"): de CVU manual a transferencia por MP, con el CVU manual como respaldo. | Sí. La regla de fondo queda igual. |
| **D-b** | ¿El pago sale solo al cumplirse la condición (informe emitido, 48 h vencidas) o lo aprueba un admin con un clic? | Con clic las primeras semanas: la plata no vuelve y el volumen es bajo. Automático después, con tope por pago y por día. |
| **D-c** | ¿Quién dice que una falla fue nuestra (para devolverle el neto al profesional)? | El admin, con una marca "falla nuestra" al reembolsar. Esa marca genera el pago al profesional. |
| **D-d** | Cuenta de origen: hoy la cuenta de MP es de GREBA. Si Payouts se da de alta ahí y después la SRL tiene cuenta propia, el alta se repite. | Decide Diego. |
| **D-e** | Al paciente, ¿se le pide el dato siempre (en el perfil) o solo cuando hace falta? | Solo cuando hace falta: el caso es raro, no se guarda un dato personal de todos, y se pide fresco. |

---

## 4. Sprints

Un commit por ticket. Toda migración: SQL completo y OK de Diego antes de aplicarla.

### Sprint 0 — Precondiciones (Diego, sin código; corre en paralelo con el Sprint 1)
- **Integraciones de MP:** habilitar Payouts en la cuenta de origen (D-d) y entregar la clave pública. Preguntar: costo por transferencia, plazo de acreditación, qué pasa si el email no tiene cuenta de MP, límites diarios, y si en Argentina se puede transferir a CVU o alias.
- **Contador:** factura del profesional a Docto (medicina laboral); cómo se registra un reintegro que sale de la cuenta de Docto y no de un refund; impuesto a los débitos y créditos si la cuenta de origen es de persona jurídica.
- **Sigue anotado desde el 05/09:** que Docto le pague a profesionales abre la relación de dependencia y el rol de prestador (SRL + abogado laboral).

### Sprint 1 — El dato: "¿a dónde te pagamos?" (no mueve plata)
- **T1.1 Tabla propia para el destino de pago** (una fila por persona: email de la cuenta de MP, de dónde salió —conexión con MP o declarado—, cuándo se confirmó, cuándo cambió). Va **aparte** de `medicos` y `pacientes` a propósito: una columna personal en `medicos` sin grant rompe la consulta entera, y con grant la expone por la policy pública (regla de CLAUDE.md). RLS: cada uno lee la suya; solo escribe el servidor.
- **T1.2 Profesional con MP conectado:** el email se guarda solo, en la conexión y en el cron diario que ya consulta `users/me`. Relleno retroactivo de las cuentas ya conectadas sin pedirles nada. En su perfil: *"Te pagamos a tu cuenta de Mercado Pago ‹email›"*, con opción de cambiarla.
- **T1.3 Profesional sin MP conectado** (plantel de medicina laboral): un campo, el email de su cuenta de MP escrito dos veces.
- **T1.4 Paciente** (según D-e): una pantalla por link, un campo, prellenado con su email de Docto y el aviso *"si tu cuenta de Mercado Pago usa otro email, cambialo"*. Alternativa: CVU o alias para una transferencia manual (el panel de admin que ya existe).
- **T1.5 Fácil de guardar, difícil de cambiar a escondidas:** el que recibe no corre ningún riesgo, Docto sí. Una transferencia procesada no vuelve. Un email mal escrito, o cambiado por alguien que entró a la cuenta de un profesional, manda la plata a otra persona. Si el destino cambia, se avisa al contacto anterior y el pago siguiente espera 24 h.
- **Gates:** Sofía (pantallas para un profesional de 70 años), Roberto (RLS y grants), Diego (migración).

### Sprint 2 — El riel: libro de pagos + API (mueve plata)
- **T2.1 Libro de pagos salientes:** quién recibe, por qué (reintegro al paciente, reintegro al profesional, honorario de control), sobre qué atención, cuánto, el email copiado en el momento del pago, estado (pendiente → enviado → acreditado / rechazado / cancelado), ids de MP y quién lo aprobó. **Clave única por motivo + atención:** nunca dos pagos por lo mismo.
- **T2.2 Cliente de Payouts:** firma ed25519; pruebas en el ambiente de test de MP sin plata real; reintenta solo los rechazos que la documentación marca como reintentables, y **nunca crea una segunda transacción si la primera ya existe**.
- **T2.3 Aviso de MP + conciliación:** webhook apuntado a `www` (regla de la casa: el apex responde 307) y un cron que no deja ningún pago en "enviado" sin estado final.
- **T2.4 Interruptor general** (flag en la base, apagado por default) y topes por pago y por día.
- **T2.5 Panel "Pagos" en admin**, con el mandato de tablas (buscador, orden, embudos, Históricos, URL) y el botón "Pagar" si D-b es con clic.
- **T2.6 Primera transferencia real:** $1 a una cuenta de Diego (el mínimo que acepta la API), antes de pagarle a cualquier tercero.
- **Gates:** revisión adversarial con lentes independientes (regla para todo lo que mueve plata), Roberto, Diego (prender el flag).

### Sprint 3 — Reintegros del Docto tradicional
- **T3.1 Paciente:** el escalado de las 48 h (`cron/reintentar-refunds`) deja de pedir un CVU manual. Si hay destino confirmado, crea el pago; si no, le pide el dato al paciente por link. El CVU manual queda de respaldo. `medicos_deuda` sigue registrándose igual.
- **T3.2 Profesional por falla nuestra** (según D-c): la marca en el reembolso genera el pago por su neto.
- **T3.3 Que cada uno vea lo suyo:** "Tus devoluciones" (paciente) y "Lo que te pagó Docto" (profesional).
- **T3.4 Documentos:** `POLITICA_REEMBOLSOS_DOCTO.md` §2.2 y §6 (con D-a), y el plazo en los TyC (va directo a Diego: Carolina en pausa).
- **Gates:** revisión adversarial, Roberto.

### Sprint 4 — Medicina laboral
- **T4.1 Honorario al emitirse el informe** (D4 del contrato: se cobra consulta realizada con informe escrito).
- **T4.2 "Lo que cobrás"** del profesional, control por control.
- **Depende de** dos cosas abiertas: dónde se cursa el control (B2C o instancia institucional, discusión del 26/09) y el contrato con Validdar. **Propuesta, no decidido:** el libro de pagos vive en un solo lugar; si el control corre en la instancia, la instancia avisa y paga Docto.

---

## 4b. Sprint 0 — lo verificado el 29/09 (doc y ayuda oficial de MP + una prueba de solo lectura)

**Decisiones de Diego del 29/09:** D-a = sí, se cambia la política. El destino **no se le pide al profesional** (errores de tipeo): tiene que salir de MP. Los pagos **pueden ser manuales** mientras no haya API. Sprint 0 delegado.

**1. La API no está habilitada.** `GET /v1/payouts/…` con el token de producción de Docto devuelve **403** (`PA_UNAUTHORIZED_RESULT_FROM_POLICIES`), con y sin `X-test-token`. No es autoservicio con la aplicación de cobros actual. El camino que da la documentación: crear **otra aplicación** en "Tus integraciones" eligiendo **Checkout API** y tipo **Orders API** ("no hay indicación específica para Payouts"), aceptar Privacidad y Términos; salen credenciales de prueba; se prueba un payout ficticio con `X-test-token: true`; para producción, activar credenciales (formulario + reCAPTCHA) y entregar la clave pública ed25519 al "equipo de Integraciones" — **la documentación no dice por qué canal**; los canales publicados son el ticket de soporte técnico (con login) y Discord. Si la app nueva también da 403, la habilitación la hace MP.

**2. Hay un camino manual que usa el email y no pide nada al profesional.** En la app de MP, **"Envío de dinero → Proveedores"** (ayuda 4557, ruta `/bulk-payments/suppliers`): se carga al proveedor con **CUIT/CUIL/DNI + el email de su cuenta de MP**, queda en una agenda, se paga a varios en una misma operación, **sin costo con dinero disponible, sin límite de monto, acreditación en el momento**. Los dos datos ya los tiene Docto: el DNI/CUIT en `medicos` (columnas sin grant: leer con service role) y el email por `users/me` (T1.2). **No verificado:** que la opción exista hoy con ese nombre (la página del artículo no tiene fecha y la pantalla pide login).

**3. Los T&C de MP (17/07/2026), cláusula 3.3:** *"el uso de la funcionalidad de transferencias entre Cuentas Mercado Pago a través de la Plataforma se encuentra destinada exclusivamente para fines no comerciales"*. Pagarle a un profesional por "Transferir" (el flujo personal) roza esa cláusula. Por eso el manual va por **"Proveedores"** (que es la herramienta comercial de MP) o por la API, nunca por "Transferir".

**4. Costos.** Transferir con dinero disponible: **0%** a cuentas de MP y a bancos. Impuesto a los débitos y créditos (0,6%): solo personas jurídicas; la cuenta de origen es de una **persona física** responsable inscripto → no aplica (la tabla de MP nombra "consumidores finales, monotributistas y autónomos"; "responsable inscripto" no figura literal). Payouts por API: costo **no publicado**.

**5. Destino.** API: entre cuentas de MP, solo el **email**; a banco, campos sin CBU/CVU/alias y "solo cuenta corriente" (texto que parece heredado de Brasil). App: "Transferir" busca por celular, email o nombre (dos páginas de ayuda lo dicen; una tercera omite el email). Tope diario de transferencias desde la app: $20.000.000 (otro artículo dice $40.000.000).

**Qué cambia en el plan:** el Sprint 1 queda igual (el email de `users/me` sirve para los dos caminos). El **Sprint 2 arranca manual por "Proveedores"** con el libro de pagos (T2.1) y el panel (T2.5); la API entra cuando MP la habilite. Sigue pendiente: canal para Integraciones, costo de la API, si "Proveedores" existe hoy.

## 4c. Sprint 0 — respuesta de Mercado Pago (30/09, asistente del soporte para integraciones)

Con OK de Diego se creó la aplicación **"Docto Pagos"** (Checkout API / API de Orders) y se probó Payouts con sus credenciales de prueba: **403 igual, en GET y en POST**. Se le preguntó al soporte de MP (asistente con IA, que deriva a ticket). Lo que contestó, textual en lo que importa:

- **"Primero debés haber sido autorizado por nuestra área comercial."** La habilitación de Payouts / Money Out es **a nivel cuenta y la da el área comercial**; no depende de crear una aplicación ni de credenciales de prueba o producción: sin autorización la política bloquea igual.
- **El endpoint documentado hoy para Money Out en Argentina es `POST /v1/transaction-intents/process`** (transaction intents), no `/v1/payouts`; sugiere validar contra ese una vez autorizados. **No verificado por nosotros**: la documentación de "Payouts" que leímos el 28/09 muestra `/v1/payouts`. Se resuelve con el contacto comercial.
- **Clave pública ed25519:** el canal no está en la documentación; "queda dentro del circuito de onboarding": cuando comercial habilita el producto, coordinan el intercambio.
- **Costo:** no es tabla pública, lo define el esquema comercial. **Plazo de acreditación:** sin SLA publicado; estados "en proceso / pendiente de banco". **Destino a banco:** número de cuenta (CBU/CVU numérico) + banco; alias y e-mail no figuran para cuenta bancaria vía API. Preguntó si queremos pagar a cuentas bancarias o a cuentas de MP de los profesionales (respuesta pendiente de Diego).

**Consecuencia:** el Sprint 0 tiene un paso comercial con MP que no es un formulario. Mientras tanto, el camino **manual** del Sprint 2 no depende de nada de esto.


- **Recuperar la deuda del profesional** (ticket 3C: subir la comisión en sus próximas consultas). Es la pata inversa y sigue pendiente.
- **Cobrarle a Validdar.** Lo arreglan Docto y Validdar (decisión del 28/09).

## 6. No verificado
- Costo de la API de Payouts y plazo real de acreditación.
- Qué pasa si el email de destino no tiene cuenta de MP.
- Si en Argentina hay destino por CVU o alias.
- Si la cuenta de origen actual es de persona física o jurídica (define el impuesto de 0,6%).

Las cuatro se resuelven en el Sprint 0.
