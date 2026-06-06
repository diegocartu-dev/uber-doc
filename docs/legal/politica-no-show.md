# Política de no-show — Marco legal y redacción (Carolina, 06/06/2026)

> Análisis legal para la decisión §13 de `DECISIONES_PRODUCTO_DOCTO.md` (resolución de
> consultas por presencia). **Draft legal sólido, NO consultoría vinculante** — antes del
> go-live con pacientes reales, un abogado matriculado debe validar la redacción final del
> §6.5 de T&C y el umbral confirmado.
>
> **UMBRAL CONFIRMADO POR DIEGO (06/06/2026): 10 minutos.** Reemplaza/unifica el 15 min del
> `ausente_paciente` existente (§4.2). El cambio en código (15→10) va en Fase 2, junto con
> el §6.5 de T&C, para que el umbral del texto = el umbral que ejecuta el código.

## 0. Lo que YA existe (no reinventar)
| Pieza | Estado | Archivo |
|---|---|---|
| T&C paciente con cláusula no-show embrionaria (§6.2) | Existe, hay que precisar | `src/app/terminos/TerminosContent.tsx` |
| Aceptación T&C scroll forzado + doble checkbox (CI) | Existe, probatoriamente sólido | `src/app/triage/page.tsx` |
| Consentimiento versionado por turno con IP + user-agent | Existe | `src/app/api/consentimiento/route.ts` |
| Tabla de aceptaciones legales versionadas (hash SHA-256) | Existe | `supabase/migrations/20260529_versiones_textos_legales.sql` |
| **Prueba objetiva del no-show** (entrada a sala, timestamp servidor) | Existe | `supabase/migrations/061_sala_espera_entradas.sql` (`entrada_en`) |

Estamos **endureciendo algo ya aceptado**, no introduciendo una cláusula sorpresiva.

## 1. ¿Es válido y exigible cobrar el no-show en Argentina? SÍ
Encuadre jurídico clave: **NO es una multa, es el cobro de un servicio puesto a disposición.**
El profesional reservó la franja en forma exclusiva y la mantuvo disponible → hubo
contraprestación efectiva. Fundamentos: Ley 24.240 art. 10 bis / 19 (a favor, el que
incumple el horario es el consumidor), CCyC art. 1740 (mora del acreedor).

**3 condiciones de validez:**
- **(a) Consentimiento informado PREVIO al pago.** Una cláusula con efecto económico
  adverso debe estar informada de forma clara, destacada y **antes de contratar** (Ley
  24.240 art. 4, 7-8). Si está solo enterrada en el T&C → riesgo de "cláusula sorpresiva"
  no oponible. **Por eso los 3 avisos cortos son requisito de validez, no cosmética.**
- **(b) Criterio objetivo, no discrecional.** Lo determina la plataforma con `entrada_en`,
  no el médico → neutraliza el reproche de abusividad (Ley 24.240 art. 37). Es la mayor
  fortaleza legal de Docto.
- **(c) Trazabilidad de la aceptación.** Ya existe (`consentimientos_informados` versionado).

## 2. 🚩 Banderas rojas
1. **CI ≠ no-show por horario.** La Consulta Inmediata NO tiene horario fijo pactado →
   cobrar "no-show" ahí es zona gris fuerte. **La cláusula se redacta SOLO para TURNOS
   PROGRAMADOS.** CI se trata con sus reglas existentes (reembolso si nadie la toma).
2. **No prometer reembolso "instantáneo"** del médico ausente — MP puede demorar ~72hs en
   ~1% de casos. Usar "te reintegramos el 100%" sin "al instante" (Ley 24.240 art. 8).
3. **No llamarlo "multa"/"penalidad"** — atacable como cláusula penal abusiva. Encuadrar
   como "el profesional reservó y mantuvo el horario disponible para vos".
4. **🔴 CONTRADICCIÓN VIVA 10 vs 15 min.** §13 dice **10 min**; §4.2 del mismo doc dice
   **15 min → `ausente_paciente`**, y el código (`EsperaTurno.tsx`) maneja ese estado.
   **Diego debe confirmar el número y unificar T&C + código + decisiones.** El umbral del
   T&C tiene que ser EXACTAMENTE el que ejecuta el código, o el cobro es reclamable.

**No over-comply:** NO hace falta un checkbox dedicado "acepto no-show". Cláusula clara +
aviso destacado al pagar + aceptación versionada del turno = consentimiento cubierto.

## 3. Redacción — Cláusula §6.5 para T&C (reemplaza/expande §6.2)
> ### 6.5 Inasistencia a un turno (no-show) y resolución por presencia
>
> Cuando reservás un **turno programado**, el profesional reserva esa fecha y hora en
> forma exclusiva para vos y mantiene ese horario disponible para atenderte.
>
> **Si no te presentás a horario.** Tenés que ingresar a la sala de espera dentro de los
> **10 minutos** posteriores al horario de inicio. Si pasados esos minutos no
> ingresaste, el turno se registra como **no asistido** y **no corresponde reembolso**,
> porque el profesional reservó y mantuvo ese horario disponible para vos. Lo determina la
> plataforma de forma automática y objetiva, según el registro de tu ingreso a la sala de
> espera; no depende de la apreciación del profesional.
>
> **Si el profesional no se conecta.** No perdés nada: **te reintegramos el 100% o
> reprogramás sin costo, a tu elección.**
>
> **Si la videollamada ya empezó y se corta.** Ambos disponen de **2 minutos** para volver
> a conectarse. Si no se restablece, el turno se reprograma **sin cargo y sin perder tu pago.**
>
> **Si la falla es de la plataforma.** Te reintegramos el 100% o reprogramás sin cargo.
>
> **Cómo se determina.** La hora del turno, tu ingreso a la sala y la conexión quedan
> registrados con la hora de nuestros servidores. Si entendés que hubo un error, escribinos
> a **soporte@docto.com.ar**.

## 4. Avisos cortos (requisito de validez — 3 puntos de contacto)
**(a) Al reservar/pagar** (cajita destacada, visible antes de "Pagar"):
> **Importante:** este turno reserva un horario exclusivo para vos. **Tenés que ingresar a
> la sala de espera dentro de los 10 minutos del horario de inicio.** Si no, el turno se
> toma como no asistido y no se reintegra el pago. Si el profesional no se conecta, te
> devolvemos todo o reprogramás sin costo.

**(b) Recordatorio** (24hs antes + 10min antes "Ingresá ahora"):
> Entrá a la sala de espera dentro de los **10 minutos** del horario de tu turno. Pasado
> ese tiempo, el turno se toma como no asistido y no se reintegra el pago.

**(c) Sala de espera** (`EsperaTurno.tsx`, mientras espera):
> Estás en la sala de espera a tiempo. El profesional se va a conectar en breve. **No
> cierres esta pantalla.** Si salís, volvé antes de los 10 minutos del horario del turno.

## 5. Consentimiento — dónde se ancla
Ancla probatoria principal: **aceptación específica del turno** (`consentimientos_informados`
con `turno_id`, `texto_version`, IP, user-agent). Subir nueva versión de T&C (`tyc_paciente`
v2) con hash real (hoy varios en `'pending_hash'`). El aviso (a) debe estar en la MISMA
pantalla del pago, y la aceptación del turno registrarse con la versión que contiene §6.5.

## 6. Checklist de cierre
- [ ] Agregar §6.5 a `TerminosContent.tsx`
- [ ] Avisos (a)(b)(c) en pago / recordatorio / sala de espera
- [ ] Subir T&C v2 con `hash_sha256` real
- [ ] **Diego confirma el número (10 vs 15) → unificar T&C + código + §13/§4.2**
- [ ] Validación de abogado matriculado antes del go-live con pacientes reales
