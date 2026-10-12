# Respuesta de Docto: buzón de Sara

> **De:** Docto · **Para:** AC Ai (Sara) · **Fecha:** 12/10/2026 · **Responde a:**
> `AC Ai/ac-ai/docs/pedido-docto-buzon-sara.md`.
>
> Protocolo de siempre: el pedido vive en el repo del que pide y la respuesta en
> el del que responde. Diego es el puente. Docto no toca el código de AC Ai.

---

## 1. El buzón — hecho

Los contactos de Sara aparecen en la Bandeja del panel, en una pestaña propia
**"Sara"**, separada de soporte (Diego: que no se mezcle). El asistente de la
bandeja no los ve.

### Cómo escribir

```
POST https://www.docto.com.ar/api/bandeja/sara
Authorization: Bearer <clave de Sara>
Content-Type: application/json
```

**Con `www`.** El dominio sin `www` redirige, y en la redirección el cuerpo del
`POST` se pierde.

**La clave** la entrega Diego. Docto guarda solo su hash: no se puede recuperar,
se rota. Va en una variable de entorno de Sara, nunca en un repo.

### Qué mandar

| Campo | Obligatorio | Regla |
|---|---|---|
| `tipo` | sí | `"institucion"` o `"profesional"`, exacto |
| `nombre` | sí | persona de contacto, hasta 120 caracteres |
| `institucion` | si `tipo` es `institucion` | hasta 120 |
| `profesion` | si `tipo` es `profesional` | hasta 120 |
| `mail` | sí | con forma de mail |
| `telefono` | sí | al menos 8 dígitos (con característica) |
| `interes` | no | una frase, **sin datos de salud**; se corta en 300 |
| `acepta_contacto` | sí | tiene que ser `true` (booleano). Sin eso no entra nada |
| `recibido` | no | fecha ISO; si falta o no es fecha, vale la hora de llegada |
| `id_externo` | no, pero conviene | id de Sara para ese contacto, hasta 100. Si Sara reintenta con el mismo id, no se duplica |

Cualquier otro campo **se descarta**: no se guarda lo que no está en esta tabla.

### Qué contesta

| Código | Cuerpo | Qué hacer |
|---|---|---|
| 200 | `{ "ok": true, "id": "…" }` | listo |
| 200 | `{ "ok": true, "id": "…", "repetido": true }` | ya lo teníamos (mismo `id_externo`): listo |
| 400 | `{ "ok": false, "error": "…" }` | el `error` está escrito para que Sara vuelva a preguntar ("Al teléfono le faltan dígitos: pedilo con característica.") |
| 401 | `{ "ok": false, "error": "No autorizado." }` | clave mala o rotada: avisarle a Diego |
| 413 | `{ "ok": false, "error": "…" }` | el cuerpo pasa de 8 KB |
| 500 | `{ "ok": false, "error": "…" }` | falla nuestra: reintentar más tarde **con el mismo `id_externo`** |

Son las mismas reglas que ya aplicaba el buzón de la demo, así que la conducta de
Sara no cambia: cambian el destino, la clave en la cabecera y, si se puede, el
`id_externo`.

### Ejemplo

```bash
curl -X POST https://www.docto.com.ar/api/bandeja/sara \
  -H "Authorization: Bearer $CLAVE_BUZON_DOCTO" \
  -H "Content-Type: application/json" \
  -d '{"tipo":"institucion","nombre":"Juan Ejemplo","institucion":"Clínica Ejemplo",
       "mail":"juan@ejemplo.test","telefono":"11 5555-0000",
       "interes":"Quieren Docto para sus pacientes","acepta_contacto":true,
       "id_externo":"sara-0001"}'
```

### Lo que la puerta NO hace

No lee la bandeja, no devuelve datos de nadie, no manda mails y no avisa a nadie
cuando entra un contacto: el equipo lo ve en la pestaña, con su contador de sin
leer. Que no viajen datos de salud ni el motivo de consulta de un paciente lo
garantiza Sara; Docto solo acota los campos y el largo.

## 2. Psicólogos en el registro — pendiente de decisiones de Diego

No es abrir un filtro. Detrás de la validación de matrícula, el producto supone
que el profesional es médico: la clínica muestra a todos los profesionales de la
provincia sin elegir especialidad, la receta y la orden de estudios no aplican a
un psicólogo, y los documentos dicen "médico". Hace falta que Diego decida cómo
atienden (consulta inmediata o solo turnos), qué documentos emiten y cómo
aparecen en la clínica. Mientras tanto, la conducta de Sara es la correcta: el
psicólogo deja su contacto en el buzón.

## 3. Controlados en términos y condiciones — en curso

El bloqueo existe en el código. Los textos que lo cuentan (términos del paciente
y del profesional, y el cartel que ve el profesional al intentar recetar uno) se
van a reescribir para que digan que **no se recetan por Docto**, no que vienen
"próximamente". El texto lo aprueba Diego antes de publicarse.
