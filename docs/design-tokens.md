# DOCTO — DESIGN TOKENS v2.0

**Cambio principal v2.1:** Color de marca unificado a azul #378ADD. Decidido por Diego (CEO) el 2026-04-22. Reemplaza el indigo #6B8DE3 de v2.0.

Documento de referencia para implementacion. Cada valor es definitivo. Si no esta aca, no existe.

---

## 1. PALETA DE COLORES

### 1.1 Color de marca — Azul Docto

| Token | Hex | Uso |
|---|---|---|
| `--color-brand` | `#378ADD` | Azul Docto. CTAs principales, botones primarios, links, identidad de marca |
| `--color-brand-light` | `#EBF3FC` | Fondo claro marca. Backgrounds sutiles, hover states ligeros |
| `--color-brand-medium` | `#A8CBF0` | Acento medio. Bordes activos, selecciones, tags de marca |
| `--color-brand-dark` | `#2D75C4` | Oscuro. Texto sobre fondos claros, hover de botones, pressed states |

### 1.2 Colores semanticos (base)

| Token | Hex | Uso |
|---|---|---|
| `--color-primary` | `#378ADD` | Azul marca. CTAs principales, links, acciones primarias |
| `--color-info` | `#378ADD` | Azul. Turnos programados, reservas, pagos confirmados |
| `--color-success` | `#1D9E75` | Verde. Disponible, activo, completado, consulta inmediata |
| `--color-warning` | `#D85A30` | Naranja. Alertas que requieren atencion |
| `--color-danger` | `#E24B4A` | Rojo. Errores, cancelaciones, acciones destructivas |
| `--color-pending` | `#BA7517` | Amarillo. Estados pendientes de accion |
| `--color-muted` | `#888780` | Gris. Bloqueado, inactivo, deshabilitado |

**Nota:** primary e info comparten el mismo azul #378ADD. Primary es el rol de marca/CTA, info es el rol semantico de turnos/reservas. Son el mismo color por decision de diseño.

### 1.3 Variantes de cada color semantico

**Azul (primary — color de marca)**

| Token | Hex | Uso |
|---|---|---|
| `--color-primary` | `#378ADD` | Default |
| `--color-primary-hover` | `#2D75C4` | Hover en botones |
| `--color-primary-active` | `#2461A8` | Active/pressed |
| `--color-primary-disabled` | `#378ADD` + opacity 40% | Disabled |
| `--color-primary-soft` | `#EBF3FC` | Fondo de badges, alerts, banners de marca |
| `--color-primary-soft-hover` | `#D6E7F9` | Hover sobre fondo soft |
| `--color-primary-border` | `#A8CBF0` | Bordes sutiles en contexto azul |

**Azul (info — turnos/reservas — mismos valores que primary)**

| Token | Hex | Uso |
|---|---|---|
| `--color-info` | `#378ADD` | Default. Solo para contexto turnos/reservas |
| `--color-info-hover` | `#2D75C4` | Hover |
| `--color-info-active` | `#2461A8` | Active |
| `--color-info-disabled` | `#378ADD` + opacity 40% | Disabled |
| `--color-info-soft` | `#EBF3FC` | Fondo badges/alerts turno |
| `--color-info-soft-hover` | `#D6E7F9` | Hover soft |
| `--color-info-border` | `#A8CBF0` | Bordes |

**Verde (success — disponible/activo/completado)**

| Token | Hex | Uso |
|---|---|---|
| `--color-success` | `#1D9E75` | Default |
| `--color-success-hover` | `#178A64` | Hover |
| `--color-success-active` | `#127553` | Active |
| `--color-success-disabled` | `#1D9E75` + opacity 40% | Disabled |
| `--color-success-soft` | `#E8F5F0` | Fondo badges disponible/completado |
| `--color-success-soft-hover` | `#D1EBE2` | Hover soft |
| `--color-success-border` | `#A3D9C4` | Bordes |

**Naranja (warning)**

| Token | Hex | Uso |
|---|---|---|
| `--color-warning` | `#D85A30` | Default |
| `--color-warning-hover` | `#C04E28` | Hover |
| `--color-warning-active` | `#A84321` | Active |
| `--color-warning-soft` | `#FDF0EB` | Fondo alertas |
| `--color-warning-soft-hover` | `#FAE0D6` | Hover soft |
| `--color-warning-border` | `#F0B8A0` | Bordes |

**Rojo (danger)**

| Token | Hex | Uso |
|---|---|---|
| `--color-danger` | `#E24B4A` | Default |
| `--color-danger-hover` | `#CC3B3A` | Hover |
| `--color-danger-active` | `#B52F2E` | Active |
| `--color-danger-soft` | `#FDF0F0` | Fondo errores |
| `--color-danger-soft-hover` | `#FAE0E0` | Hover soft |
| `--color-danger-border` | `#F0AAAA` | Bordes |

**Amarillo (pending)**

| Token | Hex | Uso |
|---|---|---|
| `--color-pending` | `#BA7517` | Default |
| `--color-pending-hover` | `#A56613` | Hover |
| `--color-pending-active` | `#8F5810` | Active |
| `--color-pending-soft` | `#FEF6E8` | Fondo pendientes |
| `--color-pending-soft-hover` | `#FDECD1` | Hover soft |
| `--color-pending-border` | `#E8C98A` | Bordes |

**Gris (muted)**

| Token | Hex | Uso |
|---|---|---|
| `--color-muted` | `#888780` | Default |
| `--color-muted-hover` | `#767570` | Hover |
| `--color-muted-active` | `#656460` | Active |
| `--color-muted-soft` | `#F4F4F3` | Fondo inactivos |
| `--color-muted-soft-hover` | `#EAEAE8` | Hover soft |
| `--color-muted-border` | `#C8C7C4` | Bordes |

### 1.4 Neutrales (UI framework)

| Token | Hex | Uso |
|---|---|---|
| `--color-bg-primary` | `#FFFFFF` | Fondo principal (cards, modales, navbars) |
| `--color-bg-secondary` | `#F8F9FA` | Fondo de pagina, segundo plano |
| `--color-bg-tertiary` | `#F1F3F5` | Fondo de secciones anidadas, inputs disabled |
| `--color-surface-elevated` | `#FFFFFF` | Cards y modales con sombra |
| `--color-border-default` | `#E5E7EB` | Bordes generales, separadores |
| `--color-border-subtle` | `#F0F0EF` | Bordes dentro de cards, separadores internos |
| `--color-border-strong` | `#D1D5DB` | Bordes de inputs, elementos interactivos |

### 1.5 Texto

| Token | Hex | Uso |
|---|---|---|
| `--color-text-primary` | `#111827` | Titulos, texto principal. Casi negro, no negro puro |
| `--color-text-secondary` | `#4B5563` | Texto descriptivo, subtitulos |
| `--color-text-tertiary` | `#9CA3AF` | Placeholders, metadata, timestamps |
| `--color-text-disabled` | `#D1D5DB` | Texto deshabilitado |
| `--color-text-inverse` | `#FFFFFF` | Texto sobre fondos oscuros/colores |
| `--color-text-link` | `#2D75C4` | Links. Azul oscuro para accesibilidad |

### 1.6 Overlays

| Token | Valor | Uso |
|---|---|---|
| `--color-overlay` | `rgba(0, 0, 0, 0.5)` | Fondo de modales |
| `--color-overlay-light` | `rgba(0, 0, 0, 0.2)` | Backdrop sutil |

---

## 2. TIPOGRAFIA

### 2.1 Font family

**Eleccion: Inter**

Justificacion: Disenada para pantallas, numeros tabulares (horarios, precios), excelente legibilidad en tamanios chicos (medico de 70 anios), variable font que reduce carga.

```
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;  /* Solo para CUIL, codigos */
```

Font loading: `next/font/google` con `Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })`

### 2.2 Escala tipografica

Base: 16px. Escala mayor third (1.25).

| Token | Size | Weight | Line-height | Letter-spacing | Uso |
|---|---|---|---|---|---|
| `--text-h1` | 32px / 2rem | 700 | 1.2 (38px) | -0.02em | Pagina principal, hero |
| `--text-h2` | 26px / 1.625rem | 700 | 1.25 (32px) | -0.015em | Titulos de seccion |
| `--text-h3` | 21px / 1.3125rem | 600 | 1.3 (27px) | -0.01em | Subtitulos, nombres de card |
| `--text-h4` | 18px / 1.125rem | 600 | 1.35 (24px) | -0.005em | Labels de seccion |
| `--text-h5` | 16px / 1rem | 600 | 1.4 (22px) | 0 | Subheaders chicos |
| `--text-h6` | 14px / 0.875rem | 600 | 1.4 (20px) | 0 | Titulos minimos |
| `--text-body-lg` | 18px / 1.125rem | 400 | 1.6 (29px) | 0 | Texto destacado, descripciones largas |
| `--text-body` | 15px / 0.9375rem | 400 | 1.6 (24px) | 0 | Texto por defecto en toda la app |
| `--text-body-sm` | 14px / 0.875rem | 400 | 1.5 (21px) | 0 | Texto secundario, metadata |
| `--text-caption` | 12px / 0.75rem | 400 | 1.5 (18px) | 0.01em | Timestamps, notas al pie |
| `--text-label` | 13px / 0.8125rem | 500 | 1.4 (18px) | 0.02em | Labels de formularios |
| `--text-overline` | 11px / 0.6875rem | 600 | 1.4 (15px) | 0.06em | Categorias, tags uppercase |
| `--text-button-lg` | 16px / 1rem | 600 | 1 (16px) | 0 | Botones grandes |
| `--text-button` | 14px / 0.875rem | 600 | 1 (14px) | 0.01em | Botones default |
| `--text-button-sm` | 13px / 0.8125rem | 600 | 1 (13px) | 0.01em | Botones chicos |

Nota: body a 15px porque 16px es grande para dashboard denso, 14px es chico para medico de 70 en mobile. 15px es el sweet spot.

### 2.3 Pesos disponibles

Solo se cargan estos pesos de Inter:
- 400 (Regular) — body, descriptions
- 500 (Medium) — labels, metadata con enfasis
- 600 (SemiBold) — headings h3-h6, botones, tabs
- 700 (Bold) — headings h1-h2, wordmark del logo

NO se usa 300 (Light) ni 800/900 (Extra Bold).

---

## 3. ICONOGRAFIA

### 3.1 Libreria

**Lucide React** (`lucide-react`)

Linea consistente de 1.75px, set completo para salud, licencia MIT, tree-shakeable, componentes React nativos.

### 3.2 Tamanios

| Token | Size | Uso |
|---|---|---|
| `--icon-sm` | 16px | Inline con texto small, dentro de badges |
| `--icon-md` | 20px | Default. Botones, inputs, nav items |
| `--icon-lg` | 24px | Headers, acciones principales standalone |
| `--icon-xl` | 32px | Empty states, feature cards, estados prominentes |

### 3.3 Stroke

`strokeWidth: 1.75` para todos los tamanios. Default de Lucide (2) es demasiado pesado. 1.5 es demasiado fino para mobile. 1.75 es el equilibrio.

### 3.4 Reglas

- CERO emojis en toda la aplicacion
- Color hereda del texto padre (`currentColor`)
- Nunca iconos decorativos sin proposito funcional
- Iconos interactivos: `min-width` y `min-height` de 44px (target tactil)

### 3.5 Mapa de reemplazo de emojis actuales

| Emoji actual | Reemplazo Lucide | Contexto |
|---|---|---|
| Estetoscopio (Navbar) | `Stethoscope` | Logo/wordmark |
| Camara (Home) | `Video` | Videoconsultas |
| Chat (Home) | `MessageCircle` | Chat medico |
| Clipboard (Home) | `FileText` | Recetas digitales |
| Hospital (Dashboard pac) | `Building2` | Clinica virtual |
| Documento (Dashboard pac) | `Files` | Mis documentos |

---

## 4. ESPACIADO Y LAYOUT

### 4.1 Sistema de spacing

Base unit: **4px**.

| Token | Valor | Uso tipico |
|---|---|---|
| `--space-0` | 0px | Reset |
| `--space-0-5` | 2px | Micro gap (entre icono y dot de estado) |
| `--space-1` | 4px | Gap minimo |
| `--space-1-5` | 6px | Padding interno badges |
| `--space-2` | 8px | Gap entre elementos inline, padding chico |
| `--space-3` | 12px | Gap en grupos, padding de badges grandes |
| `--space-4` | 16px | Padding interno de inputs, gap standard |
| `--space-5` | 20px | Padding de cards (mobile) |
| `--space-6` | 24px | Padding de cards (desktop), gap entre secciones |
| `--space-8` | 32px | Margin entre bloques |
| `--space-10` | 40px | Separacion de secciones grandes |
| `--space-12` | 48px | Padding de pagina (vertical) |
| `--space-16` | 64px | Margen superior de hero, spacing mayor |
| `--space-20` | 80px | Espaciado entre secciones de landing |

### 4.2 Border radius

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | 6px | Badges, chips, tags |
| `--radius-md` | 8px | Botones, inputs |
| `--radius-lg` | 12px | Cards, paneles, modales |
| `--radius-xl` | 16px | Cards destacadas, hero sections |
| `--radius-full` | 9999px | Avatares, dots de estado, pills |

Regla: interactivo = `md` (8px), contenedor = `lg` (12px).

### 4.3 Sombras (elevacion)

| Token | Valor | Uso |
|---|---|---|
| `--shadow-none` | `none` | Default para cards con borde |
| `--shadow-xs` | `0 1px 2px rgba(0, 0, 0, 0.04)` | Hover sutil en cards |
| `--shadow-sm` | `0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)` | Cards flotantes, dropdowns |
| `--shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.08)` | Modales, popovers |
| `--shadow-lg` | `0 8px 24px rgba(0, 0, 0, 0.12)` | Modales importantes, toasts |
| `--shadow-focus` | `0 0 0 3px rgba(55, 138, 221, 0.25)` | Focus ring (azul marca) |
| `--shadow-focus-danger` | `0 0 0 3px rgba(226, 75, 74, 0.2)` | Focus ring en inputs con error |

Filosofia: la mayoria de cards usan borde + hover sombra, no sombra permanente. Solo modales/dropdowns/toasts tienen sombra base.

### 4.4 Breakpoints

| Token | Valor | Descripcion |
|---|---|---|
| `--bp-sm` | 640px | Mobile landscape |
| `--bp-md` | 768px | Tablets |
| `--bp-lg` | 1024px | Desktop chico — layout dos columnas |
| `--bp-xl` | 1280px | Desktop — max-width de contenido |

Mobile-first obligatorio. 80% del uso es mobile.

### 4.5 Container

| Token | Valor | Uso |
|---|---|---|
| `--container-sm` | 480px | Flujos single-column (login, triage, pago) |
| `--container-md` | 640px | Dashboard paciente |
| `--container-lg` | 768px | Workspace medico |
| `--container-xl` | 1280px | Dashboard medico (dos hemisferios) |
| `--container-padding` | 16px mobile, 24px desktop |

---

## 5. COMPONENTES BASE

### 5.1 Boton

**Tamanios**

| Tamanio | Height | Padding horizontal | Font | Border-radius |
|---|---|---|---|---|
| `sm` | 36px | 12px | `--text-button-sm` (13px/600) | `--radius-md` (8px) |
| `md` | 44px | 16px | `--text-button` (14px/600) | `--radius-md` (8px) |
| `lg` | 48px | 20px | `--text-button-lg` (16px/600) | `--radius-md` (8px) |

44px default = minimo tactil 44px (Apple HIG).

**Variantes**

| Variante | Background | Text | Border | Hover bg | Active bg |
|---|---|---|---|---|---|
| `primary` | `#378ADD` | `#FFFFFF` | none | `#2D75C4` | `#2461A8` |
| `secondary` | transparent | `#2D75C4` | 1px `#A8CBF0` | `#EBF3FC` | `#D6E7F9` |
| `ghost` | transparent | `#4B5563` | none | `#F1F3F5` | `#E5E7EB` |
| `danger` | `#E24B4A` | `#FFFFFF` | none | `#CC3B3A` | `#B52F2E` |
| `danger-ghost` | transparent | `#E24B4A` | none | `#FDF0F0` | `#FAE0E0` |

**Nota contraste boton primary:** #378ADD fondo + #FFFFFF texto = ~3.9:1. Cumple WCAG AA para texto bold 14px+ (botones usan 600 weight).

**Disabled**: opacity 0.4, cursor not-allowed, sin hover.

**Microinteraccion**: `active:scale-[0.97]` + `transition: transform 100ms ease, background 150ms ease`.

**Full-width mobile**: Botones principales en flujos mobile = `width: 100%`.

**Con icono**: gap 8px. Icono izquierda excepto flechas de navegacion (derecha).

### 5.2 Card

| Propiedad | Valor |
|---|---|
| Background | `#FFFFFF` |
| Border | 1px `#E5E7EB` |
| Border-radius | 12px |
| Padding | 20px mobile, 24px desktop |
| Shadow | none default |
| Hover shadow | `--shadow-xs` (solo si clickeable) |

**Card con acento**: `border-left: 3px solid [color semantico]`
**Card urgente**: `border: 1.5px solid [color semantico]`, sin sombra

### 5.3 Input

| Propiedad | Valor |
|---|---|
| Height | 44px |
| Padding | 12px horizontal |
| Font | 15px/400 |
| Background | `#FFFFFF` |
| Border | 1px `#D1D5DB` |
| Border-radius | 8px |
| Placeholder | `#9CA3AF` |

**Estados**

| Estado | Border | Shadow | Background |
|---|---|---|---|
| Default | 1px #D1D5DB | none | #FFFFFF |
| Hover | 1px #9CA3AF | none | #FFFFFF |
| Focus | 1.5px #378ADD | `--shadow-focus` | #FFFFFF |
| Error | 1.5px #E24B4A | `--shadow-focus-danger` | #FFFFFF |
| Disabled | 1px #E5E7EB | none | #F1F3F5 |

**Focus ring AZUL MARCA** `#378ADD`.

**Label**: 13px/500, color `#4B5563`, margin-bottom 6px.
**Error message**: 12px/400, color `#E24B4A`, margin-top 6px.

### 5.4 Badge de estado

| Propiedad | Valor |
|---|---|
| Padding | 4px 10px |
| Font | 12px weight 600 |
| Border-radius | 6px |

**Colores por estado**

| Estado | Background | Text | Dot |
|---|---|---|---|
| Disponible/Activo | `#E8F5F0` | `#1D9E75` | `#1D9E75` animado |
| Reservado/Pagado | `#EBF3FC` | `#378ADD` | `#378ADD` |
| En curso | `#EBF3FC` | `#2D75C4` | `#378ADD` pulse |
| Pendiente | `#FEF6E8` | `#BA7517` | `#BA7517` |
| Alerta | `#FDF0EB` | `#D85A30` | `#D85A30` |
| Cancelado/Error | `#FDF0F0` | `#E24B4A` | ninguno |
| Inactivo | `#F4F4F3` | `#888780` | ninguno |

### 5.5 Avatar

| Tamanio | Dimension | Font size | Font weight |
|---|---|---|---|
| `sm` | 32px | 11px | 600 |
| `md` | 40px | 14px | 600 |
| `lg` | 48px | 16px | 600 |
| `xl` | 64px | 22px | 600 |

Border-radius: full. Background: `#F1F3F5`. Fallback: iniciales uppercase.

### 5.6 Toast / Notification

| Propiedad | Valor |
|---|---|
| Max-width | 400px |
| Padding | 16px |
| Border-radius | 12px |
| Shadow | `--shadow-lg` |
| Background | `#FFFFFF` |
| Border-left | 3px solid [color semantico] |
| Auto-dismiss | 5s info, persistent errores |

### 5.7 Navbar

| Propiedad | Valor |
|---|---|
| Height | 56px |
| Background | `#FFFFFF` |
| Border-bottom | 1px `#E5E7EB` |
| Logo font | 18px/600 |
| Position | sticky top-0, z-50 |

### 5.8 Modal

| Propiedad | Valor |
|---|---|
| Max-width | 480px |
| Border-radius | 16px |
| Padding | 24px |
| Shadow | `--shadow-lg` |
| Backdrop | `rgba(0, 0, 0, 0.5)` |

### 5.9 Drawer (menu hamburguesa)

| Propiedad | Valor |
|---|---|
| Width | 280px mobile (max 80vw), 320px desktop |
| Background | `#FFFFFF` |
| Shadow | `--shadow-lg` |
| Animation | slide-in derecha 200ms ease-out |
| Overlay | `rgba(0, 0, 0, 0.3)` |
| Item height | min 48px |
| Item padding | 12px 20px |
| Separator | 1px `#F0F0EF` |

---

## 6. LOGO

### 6.1 Composicion

- Icono: `Stethoscope` de Lucide, 24px, strokeWidth 2, color `#378ADD`
- Wordmark: "docto" en Inter 700, 18px, color `#111827`, lowercase
- Gap icono-texto: 8px
- Alineacion: centrado vertical

### 6.2 Variantes

- **Full** (icono + wordmark): navbar, header
- **Icon-only**: favicon, mobile comprimido, loading
- **Inverse**: blanco, para fondos oscuros

### 6.3 Favicon

Stethoscope de Lucide simplificado a 32x32, `#378ADD` sobre fondo transparente.

---

## 7. REGLAS DE DISENO

### 7.1 CERO emojis
Sin excepciones. Todo se reemplaza por Lucide.

### 7.2 Azul marca protagonista
CTA principal de CUALQUIER pantalla = azul `#378ADD`. Verde `#1D9E75` solo para estados (disponible, activo, completado) y Consulta Inmediata. Nunca verde en botones, logos, ni branding.

### 7.3 Asimetria en layouts
Evitar grids de N columnas identicas. Usar card hero + secundarias, stacking asimetrico.

### 7.4 Jerarquia por contexto
No bordes + sombras + color en el mismo elemento. Elegir UNA senal:
- Card normal: borde sutil
- Card destacada: borde de color (sin sombra)
- Card flotante: sombra (sin borde visible)
- Card urgente: borde de color + dot animado

### 7.5 Microinteracciones
- Botones: `active:scale-[0.97]` + transition 100ms
- Cards clickeables: `hover:shadow-xs` + transition 150ms
- Focus ring: `--shadow-focus` (3px azul translucido)

### 7.6 Feedback tactil
`-webkit-tap-highlight-color: transparent` + escala propia. TouchButton actual: bajar de 0.93 a 0.97.

### 7.7 Detalles humanos
- Skeletons animados (pulse gris claro), nunca spinner generico
- Saludos: "Buen dia, Dr. [nombre]" segun hora AR
- Empty states: ilustracion sutil + texto orientador + CTA
- Transiciones: fade-in 150ms al montar componentes

### 7.8 Contraste y accesibilidad

- Todo texto sobre blanco: minimo 4.5:1 (WCAG AA)
- `#378ADD` (azul marca) sobre blanco = ~3.9:1 — OK para texto grande (18px+), bold (14px+ 600), y fondos de boton
- `#2D75C4` (azul oscuro) sobre blanco = ~5.0:1 — USAR para links, texto inline, labels de color
- `#1D9E75` sobre blanco = 3.9:1 — SOLO para texto grande (18px+) o bold (14px+)
- Para texto chico verde, usar sobre `#E8F5F0`
- Texto blanco sobre fondo `#378ADD` = ~3.9:1 — OK para botones (texto 14px/600 bold)

### 7.9 Animaciones

| Nombre | Duracion | Easing | Uso |
|---|---|---|---|
| `fade-in` | 150ms | ease-out | Montar componentes |
| `slide-up` | 200ms | ease-out | Toasts, modales |
| `scale-tap` | 100ms | ease | Press de botones |
| `pulse` | 2s | ease-in-out infinite | Dots de estado activo |
| `skeleton` | 1.5s | ease-in-out infinite | Loading states |

---

## 8. MIGRACION — PROBLEMAS A CORREGIR

### 8.1 Criticos (color de marca) — COMPLETADO v2.1

1. ~~Reemplazar `#6B8DE3` por `#378ADD`~~ HECHO (2026-04-22)
2. ~~Actualizar focus rings a azul `rgba(55, 138, 221, 0.25)`~~ HECHO
3. ~~Links inline: cambiar a `#2D75C4` (azul oscuro)~~ HECHO
4. **Reemplazar `blue-600/700/500` de Tailwind** por azul marca (si queda alguno)
5. **Verde `#1D9E75` SOLO para estados activos y Consulta Inmediata** — nunca en botones, logos, branding

### 8.2 Criticos (identidad)

6. **Eliminar 37 emojis en 23 archivos** y reemplazar por Lucide. Instalar `lucide-react`
7. **Cambiar Geist por Inter** en layout.tsx. Eliminar `font-family: Arial` de globals.css
8. **Cambiar `lang="en"` a `lang="es-AR"`** en layout.tsx

### 8.3 Importantes (consistencias)

9. Estandarizar navbar a 56px
10. Estandarizar padding de cards a 20px mobile / 24px desktop
11. Redisenar favicon con Stethoscope indigo
12. Agregar CSS custom properties a globals.css

### 8.4 Mejoras

13. Skeletons en lugar de "Cargando..."
14. Transiciones de pagina (fade-in)
15. TouchButton scale 0.97 en vez de 0.93

---

## 9. CSS VARIABLES — BLOQUE COMPLETO PARA globals.css

```css
:root {
  /* Color de marca — Azul Docto */
  --color-brand: #378ADD;
  --color-brand-light: #EBF3FC;
  --color-brand-medium: #A8CBF0;
  --color-brand-dark: #2D75C4;

  /* Colores semanticos */
  --color-primary: #378ADD;
  --color-primary-hover: #2D75C4;
  --color-primary-active: #2461A8;
  --color-primary-soft: #EBF3FC;
  --color-primary-soft-hover: #D6E7F9;
  --color-primary-border: #A8CBF0;

  --color-info: #378ADD;
  --color-info-hover: #2D75C4;
  --color-info-active: #2461A8;
  --color-info-soft: #EBF3FC;
  --color-info-soft-hover: #D6E7F9;
  --color-info-border: #A8CBF0;

  --color-success: #1D9E75;
  --color-success-hover: #178A64;
  --color-success-active: #127553;
  --color-success-soft: #E8F5F0;
  --color-success-soft-hover: #D1EBE2;
  --color-success-border: #A3D9C4;

  --color-warning: #D85A30;
  --color-warning-hover: #C04E28;
  --color-warning-active: #A84321;
  --color-warning-soft: #FDF0EB;
  --color-warning-soft-hover: #FAE0D6;
  --color-warning-border: #F0B8A0;

  --color-danger: #E24B4A;
  --color-danger-hover: #CC3B3A;
  --color-danger-active: #B52F2E;
  --color-danger-soft: #FDF0F0;
  --color-danger-soft-hover: #FAE0E0;
  --color-danger-border: #F0AAAA;

  --color-pending: #BA7517;
  --color-pending-hover: #A56613;
  --color-pending-active: #8F5810;
  --color-pending-soft: #FEF6E8;
  --color-pending-soft-hover: #FDECD1;
  --color-pending-border: #E8C98A;

  --color-muted: #888780;
  --color-muted-hover: #767570;
  --color-muted-active: #656460;
  --color-muted-soft: #F4F4F3;
  --color-muted-soft-hover: #EAEAE8;
  --color-muted-border: #C8C7C4;

  /* Neutrales */
  --color-bg-primary: #FFFFFF;
  --color-bg-secondary: #F8F9FA;
  --color-bg-tertiary: #F1F3F5;
  --color-surface-elevated: #FFFFFF;
  --color-border-default: #E5E7EB;
  --color-border-subtle: #F0F0EF;
  --color-border-strong: #D1D5DB;

  /* Texto */
  --color-text-primary: #111827;
  --color-text-secondary: #4B5563;
  --color-text-tertiary: #9CA3AF;
  --color-text-disabled: #D1D5DB;
  --color-text-inverse: #FFFFFF;
  --color-text-link: #2D75C4;

  /* Overlays */
  --color-overlay: rgba(0, 0, 0, 0.5);
  --color-overlay-light: rgba(0, 0, 0, 0.2);

  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Spacing */
  --space-0: 0px;
  --space-0-5: 2px;
  --space-1: 4px;
  --space-1-5: 6px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
  --shadow-focus: 0 0 0 3px rgba(55, 138, 221, 0.25);
  --shadow-focus-danger: 0 0 0 3px rgba(226, 75, 74, 0.2);
}
```
