# Aprobación automática de profesionales (15/11/2026)

## El pedido

Diego, 13/11: que la ficha con REFEPS y biometría en verde se apruebe sola y que a él le queden solo los fallos de biometría. 15/11, ante la única pregunta abierta (si al aprobar miraba la credencial o la especialidad declarada): "no miro ni credencial ni especialidad, hacé la aprobación automática".

## Cómo era

La aprobación era un clic en el panel. El código de ese clic ya no comparaba nada por su cuenta: exigía REFEPS validado (gate del 10/06) y escribía `aprobado`. La espera entre terminar el registro y poder atender dependía de que alguien entrara al panel.

## La regla

Se aprueba sola la ficha que cumple todo:

1. está en revisión, no es cuenta de prueba y el profesional no se dio de baja;
2. es de un médico;
3. la identidad quedó validada por biometría y Didit sigue en "Approved" (la exención manual de biometría no cuenta);
4. REFEPS validado;
5. el equipo nunca la rechazó ni la suspendió.

`identidad_validada` solo lo escribe `cerrarCruce` (`src/lib/didit/reconciliar.ts`), y solo cuando el DNI que verificó la biometría es el de la ficha y la matrícula es una habilitada que REFEPS tiene para ese DNI. En ese mismo update se guarda el REFEPS del DNI biométrico. Por eso "identidad validada + REFEPS validado" es la condición fuerte, y no hace falta volver a consultar ninguna fuente al aprobar.

El registro crea la ficha recién con el formulario completo (credencial, firma, celular, términos) y la biometría es su último paso: una ficha en revisión con las dos fuentes en verde es un registro terminado.

## Dónde corre

- `src/lib/medicos/aprobacion-automatica.ts`: la regla pura (`decidirAprobacionAutomatica`), la escritura (`aprobarSiCorresponde`) y el barrido (`aprobarPendientesEnVerde`).
- La llaman los tres caminos que validan una identidad: el webhook de Didit, el cron `reconciliar-identidad` y «Usar esta» del panel.
- El barrido corre dentro del mismo cron, cada 10 minutos: aprueba lo que quedó en verde y no se aprobó en el momento (la función murió, o la ficha estaba así desde antes de la regla). No es un cron nuevo.

## Cuidados

- **No pisa a una persona.** El update lleva como condición que la ficha siga en revisión y en verde: si en el medio alguien la rechazó, la suspendió o la aprobó a mano, no escribe.
- **No deshace una decisión.** Con un rechazo o una suspensión en el log de auditoría, la ficha se aprueba a mano. Si el log no se puede leer, no se aprueba: no saber no es "nunca fue rechazada".
- **Rastro.** `verificado_por = "Aprobación automática"` (se ve en la ficha) y una fila en `admin_audit_log` sin administrador.
- **Bienvenida.** El mail de siempre, una sola vez: si ya estuvo aprobado (volvió a revisión por un cambio de matrícula), no se repite.
- **No lanza.** Una falla de la aprobación no voltea la validación de identidad que la disparó; el barrido vuelve a mirar.
- **Sin aviso al equipo.** Lo que cierra solo no suena. Lo que no cierra ya tenía su aviso (identidad rechazada, en revisión de Didit, cruce sin una única respuesta).
- **Solo B2C.** En la instancia institucional el alta es provisionada; la lib corta sola y no consulta nada.

## Qué sigue a mano

Biometría rechazada o en revisión, cruce de matrícula sin una única respuesta, exentos de biometría, fichas con una decisión previa del equipo, reactivaciones y psicología (pendiente 1.19 de `DECISIONES.md`, para decidir junto con su apertura).

## Efecto lateral buscado

Un profesional aprobado al que se le elige otra matrícula con «Usar esta» vuelve a revisión (trigger de la base); si el cruce cierra, se aprueba solo en el mismo clic. El panel lo dice en la confirmación y en el resultado.

## Pruebas

`src/lib/medicos/aprobacion-automatica.test.ts`: la regla caso por caso, las condiciones exactas del update, la carrera con un rechazo, el historial ilegible, la bienvenida única, la instancia institucional y el barrido.
