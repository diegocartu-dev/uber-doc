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

## 2. Psicólogos en el registro — decidido, en construcción (13/10/2026)

Diego decidió cómo entran:
- atienden **solo con turno** (nunca consulta inmediata);
- emiten la **evolución** en la historia clínica y una **constancia de atención**; nunca receta, orden de estudios, certificado ni indicaciones;
- aparecen en una **sección propia "Psicología"** de la clínica, con título **"Lic."**;
- **solo pacientes adultos** al principio;
- la matrícula se valida con **REFEPS**, como la del médico, con la profesión de psicología;
- **coste por uso** igual que los médicos.

Mientras se construye, la conducta de Sara sigue siendo la correcta: el psicólogo deja su contacto en el buzón. Docto avisa en este documento cuando el registro esté abierto para ellos.

## 3. Controlados en términos y condiciones — hecho (12/10/2026)

Decisión de Diego: un **término aparte, con su propio tilde, corto y directo**,
sin reescribir el resto de los T&C:

> **Medicamentos controlados**
> Por Docto se puede recetar cualquier medicamento, excepto psicotrópicos y
> estupefacientes (Leyes 19.303 y 17.818). Esos no se recetan por la plataforma.

Los antibióticos no entran en la limitación. Es **dinámico**: se le muestra solo
a quien todavía no lo aceptó. El paciente lo tilda antes de pagar (triage de la
consulta inmediata y confirmación del turno); el profesional al registrarse, y
los ya registrados desde un aviso de su panel que pueden posponer. El cartel que
ve el profesional al elegir un psicotrópico o estupefaciente dejó de decir
"próximamente": dice que no se receta por Docto. Para Sara: la frase de arriba
es la que vale.
