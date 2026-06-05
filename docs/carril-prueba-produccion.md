# Carril de prueba en producción — par médico + paciente permanente

> **Propósito:** poder reproducir **empíricamente** cualquier falla (video, pago, receta,
> turnos, CI) **en producción**, sin tocar a ningún usuario real y sin ensuciar reportes.
> Cumple la regla de "evidencia empírica reproducible" del CLAUDE.md.

## El par de prueba (NO BORRAR)

| Rol | Email | Notas |
|---|---|---|
| **Médico de prueba** | `medico.test@docto.com.ar` | slug `docto-test`. `es_cuenta_test=true`, aprobado, verificado, disponible. MP **real** (`live_mode=true`). |
| **Paciente de prueba** | `paciente.test1@docto.com.ar` | `es_cuenta_test=true`. |

- **Login:** email + contraseña en `https://www.docto.com.ar/auth/login`.
- **Contraseña:** en el gestor de secretos / con Diego. **NUNCA se commitea al repo.**
- ⚠️ **No borrar ni des-flaguear estas dos cuentas.** Son fixtures permanentes.

## Diseño: "universos paralelos" keyed en `es_cuenta_test`

> **Real ve real. Test ve test. Nunca se cruzan.** Los reportes/métricas del admin
> ya excluyen `es_cuenta_test=true` (filtro existente en ~15 queries).

La regla simétrica se aplica en las **3 puertas** por las que un paciente llega a un médico:

| Puerta | Archivo | Regla |
|---|---|---|
| Clínica (descubrimiento) | `src/app/clinica/page.tsx` | `.eq("es_cuenta_test", esPacienteTest)` — el paciente ve médicos de su mismo universo |
| Iniciar Consulta Inmediata | `src/app/clinica/actions.ts` (`crearConsulta`) | bloquea si `medico.es_cuenta_test !== paciente.es_cuenta_test` |
| Reserva de turno | `src/app/clinica/[medicoId]/turnos/actions.ts` (`reservarTurno`) | ídem, cubre también el link directo |

**No abre agujero de seguridad:** un paciente no puede auto-marcarse como test
(`es_cuenta_test` lo setea un admin en DB). Un paciente real nunca alcanza al médico de
prueba ni viceversa.

## Cómo usar el carril (reproducir una falla)

1. **Navegador A** → login `medico.test@docto.com.ar` → dashboard (queda esperando).
2. **Navegador B (incógnito)** → login `paciente.test1@docto.com.ar`.
   - El paciente de prueba ve la **clínica idéntica a la real, pero poblada por el médico
     de prueba** (universo test). Elige especialidad → médico → CI o turno.
   - URL directa al médico: `https://www.docto.com.ar/dr/docto-test/consultorio`
3. Paga en **MP sandbox** (`live_mode=false` no aplica acá — `medico.test` tiene MP real;
   para probar **sin** mover plata real, usá un médico test con MP sandbox, o la whitelist
   de cobro real `MP_PAGO_REAL_WHITELIST` para una prueba con plata de verdad acotada).
4. **Navegador A** → el médico ve al paciente entrando → acepta → ambos al video. Ahí se
   reproduce el problema con evidencia real, en prod, sin afectar a nadie.

> Para dos sesiones en paralelo: un navegador normal + uno en incógnito (o dos navegadores
> distintos), porque comparten cookies de sesión si no.

## Estado de las cuentas (limpieza asociada, aplicada en DB)

- **Médicos reales que quedan:** `medico.test@docto.com.ar` (test) + `sofia_fasce@hotmail.com`
  (real, suspendida). Dados de baja: `diegocartu@gmail.com` (Diego Gonzalez, era falso),
  `diegocartu+drprueba1@gmail.com` (Dr Prueba 1), `rolo@puente.com` (Rolo Puente).
- **Pacientes:** `paciente.test1` queda como único fixture "vivo" de prueba; el resto de
  `paciente.testN` + `paciente.qa` siguen flageados `es_cuenta_test=true` (fuera de reportes).
  Se corrigió el flag de 3 cuentas de prueba mal marcadas como reales (Juan Barril, Jose Velez ×2).
