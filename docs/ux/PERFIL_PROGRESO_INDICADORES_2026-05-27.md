# SPEC UX: Panel de Progreso + Indicadores Inline en Perfil Medico

**Autora:** Sofia (Product Designer)
**Aprobada por:** Diego (CEO) — 27/05/2026, sin cambios
**Ticket destino:** UX-perfil-inline (TICKET 4 del sprint post-QA)
**Estado:** Aprobada, lista para implementar

---

## Contexto

QA E2E del 27/05 encontro que el panel de progreso de perfil medico confunde al usuario:

1. Dots naranjas de "faltante" se confunden con sugerencias grises. El usuario no entiende que son bloqueantes.
2. El formulario de perfil no tiene indicacion inline por campo. El medico tiene que adivinar cual falta.
3. Bug de data: domicilio aparecia como faltante cuando ya estaba completo (ver seccion "Hallazgo del bug").

---

## A) Tres estados visuales en el panel de progreso (dashboard)

| Estado | Color | Dot | Copy del CTA | Cuando aplica |
|---|---|---|---|---|
| **Bloqueante** (impide CI) | Rojo `#E24B4A` | Relleno 8px, texto rojo-700 | "Completar ->" | Matricula, nombre, telefono, domicilio |
| **Recomendado** (no bloquea) | Amarillo `#BA7517` | Relleno 8px, texto gray-700 | "Agregar ->" | Foto de perfil |
| **Completo** | Verde `#1D9E75` | Relleno 8px (colapsado como hoy) | -- | Campos ya completados |

### Decision de negocio (Diego, 27/05)

Foto de perfil queda como RECOMENDADO (amarillo, no bloquea CI). Razon: reducir friccion de onboarding para los primeros 30 medicos seed. La regulacion AAIP/REFEPS no exige foto. Si en el futuro se decide hacerla bloqueante, se cambia en una constante.

### Subtitulo condicional debajo de "Completa tu perfil"

- Si hay bloqueantes: texto rojo `#E24B4A` -> `"X dato(s) requerido(s) para atender"`
- Si solo hay recomendados: texto amarillo `#BA7517` -> `"Tu perfil funciona, pero podes mejorarlo"`

### Orden de items

Primero bloqueantes (rojo), despues recomendados (amarillo), despues completos (verde, colapsado como hoy).

### Implementacion

Cada item del array `items` en `PanelProgresoPerfil.tsx` necesita un campo `blocking: boolean`. El componente ordena y colorea segun ese campo. El link CTA mantiene azul `#378ADD` para ambos tipos — el color del dot ya comunica la urgencia, el link es accion neutral.

---

## B) Indicadores inline en el formulario de perfil

### 1. Borde del input vacio

- Bloqueante vacio: `border-color: #E24B4A` (rojo)
- Recomendado vacio: `border-color: #BA7517` (amarillo)
- Se evalua en render inicial, NO al tocar el campo. No es validacion de formulario, es estado del perfil.

### 2. Microcopy debajo del input vacio

Un `<p>` de 12px debajo del campo vacio:

- Bloqueante: color `#E24B4A`, copy: `"Obligatorio para atender consultas"`
- Recomendado: color `#BA7517`, copy: `"Recomendado para generar confianza"`

### 3. Comportamiento reactivo

Cuando el usuario escribe, el borde vuelve a gris default y el microcopy desaparece. Si borra todo el contenido, vuelven. Reactivo al valor del estado, no a un flag separado.

### 4. Avatar vacio (foto de perfil)

Borde amarillo punteado: `border: 2px dashed #BA7517`. Estado vacio visualmente distinguible del estado "tiene foto".

### 5. Scroll desde el panel

Cuando el medico llega desde el panel haciendo click en "Agregar/Completar", usar el hash anchor existente (`#foto`, `#domicilio`, etc.) con:

```typescript
scrollIntoView({ behavior: 'smooth', block: 'center' })
```

El campo queda centrado, no pegado al tope.

---

## C) Copy del panel

**Decision:** Mantener labels actuales ("Foto de perfil", "Domicilio del consultorio") sin prefijo "Falta:". El dot de color ya comunica ausencia.

La diferencia la hace el verbo del CTA:
- **Bloqueante:** "Completar ->" (implica obligacion)
- **Recomendado:** "Agregar ->" (implica opcionalidad)

No hace falta escribir "Falta:" ni "Requerido:" delante del label — eso es ruido visual que compite con el dot de color.

---

## Hallazgo del bug de domicilio

**Diagnostico:** No es un problema de UX, es un bug de data.

La evaluacion en el panel (linea 36 de `PanelProgresoPerfil.tsx`) es correcta:

```typescript
{ label: "Domicilio del consultorio", done: !!domicilioConsultorio?.trim(), anchor: "domicilio" }
```

Si `domicilioConsultorio` llega como string no vacio, `done` es `true`. Si aparece como faltante cuando tiene datos, el problema esta aguas arriba: el prop llega `null` cuando no deberia, o el SELECT del server component no trae la columna correcta.

**Accion para Marcos:** Revisar el query del server component que alimenta `PanelProgresoPerfil.tsx`. No tocar la logica del componente hasta confirmar que los props llegan correctamente.

---

## Campos definitivos

### Bloqueantes (rojo `#E24B4A`)

- Matricula (`numero_matricula`)
- Nombre (`nombre_completo`)
- Telefono (`telefono`)
- Domicilio del consultorio (`domicilio_consultorio`)

### Recomendados (amarillo `#BA7517`)

- Foto de perfil (`foto_url`)

### Nota sobre extensibilidad

Si en el futuro se decide hacer foto de perfil bloqueante, se cambia `blocking: true` en la constante del array de items. No requiere cambio de logica ni de estilos.

---

## Archivos a tocar

| Archivo | Cambios |
|---|---|
| `src/app/dashboard/PanelProgresoPerfil.tsx` | Agregar `blocking` a items, colores de dots, subtitulo condicional, CTA "Completar"/"Agregar" |
| `src/app/medico/perfil/PerfilClient.tsx` | Bordes condicionales en inputs vacios, microcopy debajo, avatar dashed amarillo, smooth scroll con `block: 'center'` |
| Server component/page que pasa props al panel | Fix del bug de domicilio (prop llegando null) |

---

## Proceso de aprobacion

1. Marcos implementa segun esta spec
2. Deploy a preview Vercel
3. Sofia da OK visual en preview antes del merge
4. Merge a main
