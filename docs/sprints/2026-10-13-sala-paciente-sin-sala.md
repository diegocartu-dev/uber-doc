# La paciente pagó dos veces y nunca pudo entrar (13/10/2026)

## Qué pasó
Una paciente pidió una consulta inmediata dos veces seguidas con la misma profesional (12:16 y 12:28). Las dos veces: la profesional aceptó, la paciente pagó, la profesional entró a la videollamada y esperó, la paciente nunca apareció, y la profesional canceló con reintegro. El admin lo anotó como "Pagó y el profesional canceló", y la ficha decía "Video iniciado".

## Qué pasó de verdad (logs de Vercel + `video_presencia` + `eventos_funnel`)
- La paciente sí tocó "Entrar a la videollamada" las dos veces y llegó a `/consulta/[id]/sala` (primero desde una computadora, después desde un iPhone). Ahí vio una ruedita para siempre.
- En ninguno de los dos intentos hay un `POST /api/livekit/token` de la paciente: la pantalla nunca pidió el video.
- Segundo intento: la paciente abrió la sala a las 12:29:32; la profesional abrió su pantalla a las 12:29:34 y entró a las 12:29:36. La paciente se quedó esperando hasta las 12:30:52 y se fue; la profesional canceló a las 12:31:16. Después la paciente buscó un turno con la misma profesional: quería atenderse.

## Por qué
Un pago real pone la consulta `en_curso` al acreditarse (webhook de Mercado Pago). `sala_video_url` la escribe la profesional al abrir su espacio de trabajo. `/consulta/[id]/sala/page.tsx` leía `sala_video_url` una sola vez y `SalaConsultaPaciente` solo pedía el token si existía. Si el paciente llegaba antes que la profesional, no había forma de recuperarse: el polling de 5 s ya traía `sala_video_url` y no lo miraba. Y la espera decía "¡X te está esperando! Tu videollamada ya está lista" apenas se acreditaba el pago.

Desde el 06/10 el pago es instantáneo (solo cuenta de Mercado Pago + `binary_mode`), así que el paciente llega a la sala antes que el profesional mucho más seguido. Medido: antes del 06/10, de 11 consultas pagas reales 11 entraron al video; después, 2 de 4.

## Qué se hizo (#560, en producción y verificado el mismo día)
- La sala del paciente espera a que exista la sala: `roomName` es estado, el polling y Realtime lo traen apenas la profesional abre su pantalla, y recién ahí se pide el token y se conecta sola. Mientras tanto dice "{profesional} está iniciando la videollamada. Esperá un momento: vas a entrar automáticamente." Vale también para turnos.
- La espera deja de decir "ya está lista" cuando no lo está: "¡Listo, ya pagaste! {profesional} está iniciando la videollamada. Entrá y esperá un momento: te conecta sola."
- Verificado en producción con cuentas de prueba (consulta sintética `en_curso` sin sala): con la sala sin crear, el mensaje de espera y ningún pedido de token; al escribirse `sala_video_url`, en menos de 8 s pide el token y muestra "Activar cámara y micrófono".
- #561: la ficha del admin deja de decir "Video iniciado" por el pago: dice quién entró a la videollamada y cuándo, desde `video_presencia`, y "El paciente nunca entró" cuando hay evidencia.

## Pendiente de Diego
- Los dos textos nuevos son provisorios (DECISIONES.md 1.15).
- Las dos consultas de hoy ya están reembolsadas. Si se le quiere escribir a la paciente o a la profesional, es decisión de Diego (mensajes a personas reales).
