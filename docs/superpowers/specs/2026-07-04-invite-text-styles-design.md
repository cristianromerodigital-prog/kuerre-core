# Diseño: Tamaño y grosor de texto en la invitación (CRP)

**Fecha:** 2026-07-04
**Proyecto:** WEB CRP (admin compartido vía CORE)
**Archivos afectados:** `CORE/src/admin.html`, `WEB CRP/Productivo/invite.html` (y su copia en `Desarrollo/`)

---

## Contexto

El admin ya tiene un editor visual de la portada (`invite.html?preview=1` embebido en un iframe same-origin dentro de un popup) que permite arrastrar los 3 bloques de texto del hero (`hero-eyebrow`, `hero-names`, `hero-date`) para reposicionarlos y reordenarlos (`hero_layout`). Ese sistema no toca tamaño ni grosor, y solo cubre el hero — el resto de las secciones (Cuándo, Dónde, Dresscode, Regalo, RSVP, Spotify) no tiene ningún control de estilo de texto.

Se pide poder ajustar **tamaño y grosor** de los títulos y textos principales de **todas** las secciones de la invitación, no solo el hero.

Alcance: **WEB CRP únicamente** (`invite.html` de CRP). No se porta a WEB KUERRE en este trabajo.

---

## Arquitectura

Se reutiliza el mismo iframe/popup que ya existe para el arrastre del hero, en vez de crear una superficie nueva. El popup pasa a llamarse **"Editor visual de la invitación"** (antes "Posición del Texto en Portada") y soporta dos interacciones sobre la misma vista previa:

- **Arrastre** (ya existe, sin cambios de comportamiento): reposiciona/reordena los 3 bloques del hero.
- **Click** (nuevo): sobre cualquiera de los 16 bloques editables (ver abajo, incluye los 3 del hero) abre un panel flotante con controles de tamaño y grosor, con aplicación en vivo dentro del mismo preview.

Para que el click funcione en secciones que hoy el preview no renderiza, `invite.html` en modo `?preview=1` pasa a llamar también a `renderEvento`, `renderLugar`, `renderDresscode`, `renderRegalo`, `renderRSVP`, `renderSpotify` (además de `renderHero`), con la config armada desde el formulario — igual que ya hace el render de producción, solo que dentro del iframe.

Toda la lógica de interacción (detectar click vs. drag, pintar el panel flotante, aplicar estilos en vivo) vive dentro de `invite.html`, igual que el arrastre del hero — el admin no hace matemática de coordenadas cross-frame, solo escucha un evento y guarda el resultado final.

## Modelo de datos

Nuevo campo de config, independiente de `hero_layout` (que sigue siendo solo posición/orden del hero):

```js
text_styles: {
  "ev-title":  { size: 120, weight: 600 },
  "lugar-dir": { size: 90 }
}
```

- Clave = `id` del elemento HTML del bloque.
- `size`: número entero, porcentaje de escala sobre el tamaño original (rango 50–180, default 100 = sin cambio).
- `weight`: uno de `300` (Fina) / `400` (Normal) / `600` (Negrita), o ausente = peso original de la regla CSS (ni forzado a 400 ni a ningún valor — "Original" borra la propiedad en vez de fijar un número).
- Un bloque sin entrada en `text_styles` se ve exactamente igual que hoy.

### Aplicación del tamaño (preserva el diseño responsive)

Las reglas CSS existentes usan `clamp()` para tamaño fluido según el viewport (ej. `.sec-title{font-size:clamp(36px,6vw,58px)}`). En vez de reemplazar eso por un `px` fijo (lo cual rompería la fluidez en pantallas distintas a la del preview), cada regla pasa a multiplicar su valor por una custom property con default 1:

```css
.sec-title{font-size:calc(clamp(36px,6vw,58px) * var(--ts-scale,1));...}
```

El JS solo setea `el.style.setProperty('--ts-scale', size/100)` en el elemento puntual — el `clamp()` se seguiría escalando por viewport como siempre, ahora multiplicado por el factor elegido. Esto no cambia el rendering de ningún bloque que no tenga override (var por defecto = 1).

Reglas a tocar: `.hero-eyebrow`, `.formato-wedding .hero-eyebrow`, `.hero-names`, `.formato-wedding .hero-names`, `.hero-date`, `.formato-wedding .hero-date`, `.sec-title`, `.sec-body`.

### Aplicación del grosor

Directo, sin custom property: `el.style.fontWeight = '600'` (o se hace `el.style.removeProperty('font-weight')` para "Original"). No requiere tocar CSS.

**Fix de fuente necesario:** Montserrat hoy solo carga los pesos 300/400/500 vía Google Fonts. Para que "Negrita" (600) se vea con un peso real en los bloques que usan Montserrat (`sec-body`, `hero-eyebrow` clásico) en vez de un bold sintético del navegador, se agrega el peso 600 al `<link>` de Google Fonts existente. Cormorant Garamond ya carga 300/400/600, no necesita cambios.

## Bloques editables (16)

| id | Sección | Nota |
|---|---|---|
| `hero-eyebrow` | Hero | ya existe |
| `hero-names` | Hero | ya existe |
| `hero-date` | Hero | ya existe |
| `ev-title` | Cuándo | ya tiene id |
| `ev-body` | Cuándo | ya tiene id |
| `ceremonia-lugar-nombre` | Ceremonia (opcional) | ya tiene id |
| `ceremonia-lugar-dir` | Ceremonia (opcional) | ya tiene id |
| `lugar-nombre` | Dónde | ya tiene id |
| `lugar-dir` | Dónde | ya tiene id |
| `dresscode-title` | Dresscode | **nuevo id** en el `<h2>` (hoy sin id, texto estático "Dresscode") |
| `regalo-titulo` | Regalo (opcional) | ya tiene id |
| `regalo-texto` | Regalo (opcional) | ya tiene id |
| `rsvp-title` | RSVP | **nuevo id** en el `<h2>` (texto estático "¿Venís?") |
| `rsvp-body` | RSVP | **nuevo id** en el `<p>` (contiene el span dinámico de fecha límite) |
| `spotify-title` | Spotify (opcional) | **nuevo id** en el `<h2>` (texto estático "La playlist") |
| `spotify-body` | Spotify (opcional) | **nuevo id** en el `<p>` (texto estático) |

Agregar un `id` a un elemento estático no cambia su texto ni su comportamiento actual.

Si una sección no tiene contenido cargado (ej. Regalo vacío) su bloque no se renderiza en el preview y por lo tanto no es clickeable — no se puede estilizar algo que no existe en esa invitación puntual, mismo criterio que ya aplica hoy al hero.

## Interacción dentro del preview

- Click (mousedown+mouseup sin arrastre real) sobre cualquiera de los 16 bloques → abre un panel flotante posicionado junto al bloque, con:
  - Nombre del bloque.
  - Slider de tamaño, 50%–180%, paso 5%, con el valor actual en vivo.
  - 4 botones de grosor: Original / Fina / Normal / Negrita.
  - Botón "Restablecer" (borra la entrada de `text_styles` para ese bloque).
  - Click afuera del panel o en otro bloque cierra/cambia de bloque.
- Para los 3 bloques del hero (que ya soportan arrastre): se distingue click de drag por distancia de movimiento del mouse — menos de ~5px entre mousedown y mouseup se trata como click (abre el panel), más que eso sigue siendo el drag existente (reposición/reorden). No cambia el comportamiento de arrastre actual.
- Nuevo evento `textstyleschange` (mismo patrón que `herolayoutchange` ya existente para el hero) con el mapa completo de `text_styles` actualizado — debounced igual que el ajuste por rueda del mouse del hero.

## Cambios en `CORE/src/admin.html`

- El popup existente (`#inv-hero-popup`) se renombra a "Editor visual de la invitación".
- Al abrir el popup: además de lo que ya hace hoy (`applyHeroPreview`), arma la config completa del formulario (reusa `readInviteForm()`/`buildHeroPreviewCfg()` extendido a todos los campos necesarios para que evento/lugar/dresscode/regalo/rsvp/spotify tengan contenido) y la pasa al iframe para que se rendericen todas las secciones.
- Escucha `textstyleschange` en `iframe.contentWindow` y guarda el resultado en una variable de módulo `_textStyles`.
- `readInviteForm()` agrega `text_styles: _textStyles || {}` al config guardado.
- Al abrir una invitación existente para editar: `_textStyles = c.text_styles || {}` antes de inicializar el iframe.

## Testing / verificación

- Abrir el admin local, entrar a una invitación con datos en varias secciones (evento, lugar, dresscode, regalo, rsvp, spotify).
- Click en 3-4 bloques de distintas secciones (incluyendo al menos uno del hero) → confirmar que el panel aparece, el slider cambia el tamaño en vivo, los 4 botones de grosor cambian el peso en vivo, y "Restablecer" vuelve al original.
- Confirmar que el arrastre del hero (reposición/reorden) sigue funcionando igual que antes (distinguido correctamente de un click).
- Guardar la invitación, reabrirla en modo edición → confirmar que el preview abre con los mismos tamaños/grosores que se dejaron guardados.
- Abrir el link real de esa invitación (sin `?preview=1`) → confirmar que los tamaños/grosores guardados se ven aplicados, y que no hay ningún listener de click/hover activo para el invitado real (sin cursores ni reacciones al mouse).
- Confirmar que una invitación sin `text_styles` (creada antes de este cambio) se ve exactamente igual que antes.

## Fuera de alcance

- WEB KUERRE (no se porta en este trabajo).
- `invite-social.html` / `invite-social-v2.html` (otro template, no tocado).
- Labels chicos, botones, footer, nav, valores de countdown, alias/CBU de regalo — solo títulos y textos principales de cada sección.
