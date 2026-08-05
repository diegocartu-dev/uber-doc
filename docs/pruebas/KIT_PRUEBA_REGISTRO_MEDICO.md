# Kit de prueba — registro médico real de punta a punta

Para que Diego (o quien haga QA) recorra el registro médico COMPLETO en
producción con datos sintéticos y validación REFEPS real. Usado por primera
vez el 05/08/2026 (cazó el bug del cartel "Error al enviar" sobre envío
exitoso — ver `docs/sprints/2026-08-04-drenaje-registro-medico-fotos-y-firma.md`,
causa 3).

## Datos a cargar (docto.com.ar/auth/registro-medico, ventana de incógnito)

| Campo | Valor | Por qué |
|---|---|---|
| Nombre | Diego Prueba | sintético, se borra al final |
| Email | diegocartu+registroNNNN@gmail.com | cambiar NNNN por corrida; el mail de confirmación llega al Gmail de Diego |
| Título / Especialidad | Dr. / Clínica médica | — |
| Matrícula | **MN 909090** | número libre en Docto (verificar antes si se repite la prueba) |
| DNI | **29362322** | DNI real de Pablo Cogliandro — **REFEPS valida POR DNI**, no por matrícula → da verde con sus jurisdicciones (Buenos Aires + CABA) |
| CUIT | 20-29362322-3 | pasa el cruce DNI↔CUIT (solo chequea estructura y que embeba el DNI) |
| Domicilio | Av. Prueba 123, CABA | — |
| Celular | el real de Diego (11 4028-9141) | prueba también los avisos WhatsApp |
| Credencial | `docs/pruebas/credencial-prueba-registro.jpg` | sintética, marcada PRUEBA |
| Firma | dibujar con el dedo, o modo "subir imagen" | ambos modos ya comprimen |

## Restricciones conocidas

- La MN real de Pablo (138169) está OCUPADA por él → el anti-duplicados la
  rechaza (comportamiento correcto). Usar 909090 u otro número libre.
- `medicos.dni` NO tiene unique → el DNI de Pablo puede convivir.
- El QR de Didit solo aparece en desktop (hand-off al teléfono); en el celular
  abre la cámara directo.

## Limpieza al terminar (orden importa)

1. Storage: `credenciales-medicos/<user_id>/…` y `firmas-medicos/medicos/<user_id>/firma.*`
2. Fila de `medicos`
3. `eventos_funnel` where `metadata->>'user_id' = <user_id>`
4. **`aceptaciones_legales` where user_id** — SIN esto el paso 5 falla con
   "Database error deleting user" (FK sin cascade, hallazgo 05/08)
5. `auth.users` (admin API deleteUser)
6. Verificar: ficha inexistente + email inexistente en auth
