# Psicólogos en Docto — decisiones (13/10/2026) y plan

Pedido de AC Ai (Sara, 12/10): los psicólogos llegan a Docto y el registro los rebota, porque la validación de matrícula solo acepta la de médico. Diego decidió que entran, y cómo.

## Decisiones de Diego (13/10/2026)

| Tema | Decisión | Por qué |
|---|---|---|
| Cómo atienden | **Solo con turno.** Nunca consulta inmediata. Sesión con la duración que elija el profesional (50 min sugerido). | Una consulta inmediata de salud mental suele ser una crisis, y una crisis va a una guardia o a una línea de emergencia, no a una videollamada con alguien que no conoce. |
| Qué emiten | **Evolución** en la historia clínica (ya existe) y una **constancia de atención**. Nunca receta, orden de estudios, certificado ni indicaciones. | El psicólogo no receta; el paciente necesita poder justificar la sesión. |
| Cómo aparecen | **Sección propia "Psicología"** en la clínica, separados de los médicos. Título **"Lic."** en vez de Dr./Dra. | Hoy la clínica muestra a todos los profesionales de la provincia sin elegir especialidad: mezclados, quien busca un médico encontraría psicólogos. |
| Edad | **Solo pacientes adultos** al principio. | Con menores hace falta el consentimiento de los padres y otro encuadre; se suma después. |
| Verificación | Igual que el médico: biometría (Didit) + **REFEPS**, aceptando la matrícula habilitada **de psicología**. Ruteo por jurisdicción igual. | REFEPS releva más de 79 profesiones de la salud; la matrícula y el ejercicio son provinciales. |
| Coste por uso | **Igual que los médicos** (mismo esquema de categorías). | — |

### Texto aprobado de la constancia

```
CONSTANCIA DE ATENCIÓN

Dejo constancia de que {nombre y apellido del paciente},
DNI {dni}, asistió a una sesión de atención psicológica
por videollamada el {fecha} a las {hora} hs.

Lic. {nombre y apellido}
Licenciado/a en Psicología
Matrícula {tipo} {número} — {jurisdicción}
Domicilio profesional: {domicilio}

Firmado electrónicamente en Docto.
```

Lleva lo que pide el Decreto 905/1995 para las certificaciones del psicólogo (nombre, profesión, matrícula, domicilio) y nada clínico (secreto profesional).

## Lo que no está verificado

- **El texto exacto con el que REFEPS devuelve la profesión de psicología.** El código de hoy solo reconoce "Médico". Se confirma con el primer psicólogo real que se registre (o un DNI de prueba que pase Diego).
- **Que el Decreto 905/1995 siga vigente y alcance a la atención por videollamada.** Es la referencia más directa que se encontró; conviene que lo mire el abogado.
- **Números de las líneas de emergencia** que se muestren en las pantallas de psicología: se verifican antes de publicarlos.

## Plan de construcción

Se arma detrás de un interruptor: el registro de psicólogos se abre recién cuando esté todo, y ahí se le avisa a Sara (en `docs/respuesta-docto-buzon-sara.md`).

(El detalle por ticket se completa con el inventario de todo lo que hoy supone que el profesional es médico.)
