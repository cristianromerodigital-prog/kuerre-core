# Diseño: Selector de fuente + edición de texto estático (CRP)

**Fecha:** 2026-07-04
**Proyecto:** WEB CRP (admin compartido vía CORE)
**Archivos afectados:** `CORE/src/admin.html`, `WEB CRP/Productivo/invite.html` (y su copia en `Desarrollo/`)

---

## Contexto

El editor de tamaño/grosor de texto (spec `2026-07-04-invite-text-styles-design.md`) reveló que el control de grosor no tiene efecto visible en `hero-names` con formato Wedding: la fuente asignada (`Mrs Saint Delafield`) es de un solo peso — Google Fonts no ofrece variantes para esa familia (`wght@100..900` devuelve 400 "Font family not found"). No es un bug de la implementación: es una limitación de la fuente elegida.

La solución correcta es permitir elegir la fuente por bloque, priorizando fuentes que sí tengan varios pesos, y hacer que los botones de grosor reflejen los pesos reales disponibles para la fuente activa en cada bloque — así el control nunca vuelve a mostrar opciones que no hacen nada.

Además, 5 de los 16 bloques editables (`dresscode-title`, `rsvp-title`, `rsvp-body`, `spotify-title`, `spotify-body`) tienen su texto hardcodeado en `invite.html` sin ningún campo en el formulario del admin para cambiarlo. Se agrega edición de texto para esos 5 únicamente — el resto ya se edita desde el formulario existente y no se duplica ahí.

Alcance: **WEB CRP únicamente**, mismo alcance que la spec de tamaño/grosor.

---

## Catálogo de fuentes (22, en 4 categorías)

| Categoría | Fuentes |
|---|---|
| Script/manuscrita | Dancing Script, Mrs Saint Delafield, Great Vibes, Parisienne, Alex Brush |
| Serif elegante | Cormorant Garamond, Playfair Display, Cinzel, EB Garamond, Marcellus, Libre Baskerville, Prata |
| Sans-serif elegante | Montserrat, Poppins, Raleway, Josefin Sans, Quicksand |
| Display/decorativa | Abril Fatface, Bodoni Moda, Italiana, Cormorant, Yeseva One |

Las 4 fuentes ya usadas hoy (Cormorant Garamond, Montserrat, Mrs Saint Delafield, Cinzel) siguen siendo el default de cada bloque — nada cambia visualmente si no se toca el selector.

Cada entrada del catálogo declara sus pesos reales disponibles (verificados contra Google Fonts antes de implementar, uno por uno, con el mismo método usado para diagnosticar `Mrs Saint Delafield`), por ejemplo:

```js
const FONT_CATALOG = {
  'Dancing Script':  { category: 'script', weights: [400,500,600,700] },
  'Mrs Saint Delafield': { category: 'script', weights: [400] },
  'Playfair Display': { category: 'serif', weights: [400,500,600,700,800,900] },
  'Cormorant Garamond': { category: 'serif', weights: [300,400,600] },
  // ... resto del catálogo
};
```

## Modelo de datos

`text_styles[id]` gana un campo opcional `font` (nombre exacto de `FONT_CATALOG`, ausente = fuente CSS original del bloque):

```js
text_styles: {
  "hero-names": { font: "Dancing Script", weight: 300 }
}
```

Nuevo campo de config `text_content`, exclusivo para los 5 bloques sin campo propio en el formulario:

```js
text_content: {
  "dresscode-title": "Vestimenta formal",
  "rsvp-title": "¿Nos acompañás?"
}
```

Una clave ausente en `text_content` usa el texto original hardcodeado (sin cambios de comportamiento para invitaciones existentes).

## Carga de fuentes bajo demanda

`invite.html` arma, al renderizar (tanto en producción como en preview), el conjunto de fuentes distintas presentes en `text_styles[*].font`, y si ese conjunto no está vacío inyecta dinámicamente un único `<link>` de Google Fonts en el `<head>` con exactamente esas familias y sus pesos declarados en `FONT_CATALOG` (para fuentes de un solo peso, sin parámetro `wght@`, igual que ya hace hoy `Mrs Saint Delafield` en el `<link>` estático). Si ninguna invitación usa fuentes custom, no se agrega ningún `<link>` extra — cero impacto en el peso de página de invitaciones existentes.

## Grosor dinámico según fuente activa

El panel de click (mismo del editor de tamaño/grosor) deja de mostrar siempre los 3 botones fijos (Fina/Normal/Negrita). En su lugar:

1. Resuelve la fuente activa del bloque: la elegida en `font`, o si no hay override, la fuente CSS original de ese bloque (mapeada 1:1 a una entrada de `FONT_CATALOG` para poder leer sus pesos — las 4 fuentes originales ya están en el catálogo).
2. Genera un botón por cada peso disponible de esa fuente, con la etiqueta más cercana (300→"Fina", 400→"Normal", 500→"Medio", 600/700→"Negrita", 800/900→"Extra negrita").
3. Si la fuente activa tiene un solo peso disponible, en vez de botones muestra el texto: *"Esta fuente no tiene variantes de grosor."*
4. Al cambiar de fuente en el mismo panel, los botones de grosor se regeneran en el momento (si el peso que estaba elegido no existe en la fuente nueva, se resetea a "Original").

## Panel de click — cambios de UI

- Nuevo combo "Fuente" arriba del slider de tamaño, en los 16 bloques. Opciones agrupadas por categoría (`<optgroup>`), con "Original" primero.
- Para los 5 bloques con `text_content` (dresscode-title, rsvp-title, rsvp-body, spotify-title, spotify-body): un `<textarea>` de texto arriba de todo el panel, que edita `text_content[id]` en vivo.
- El resto de los 11 bloques no suman textarea — se editan desde el formulario existente, sin cambios ahí.

## Cambios en `invite.html` (render)

- `renderDresscode`: `document.getElementById('dresscode-title')` (nuevo id, agregado en la spec anterior) usa `c.text_content?.['dresscode-title'] ?? 'Dresscode'`.
- `renderRSVP`: título usa `c.text_content?.['rsvp-title'] ?? '¿Venís?'`; cuerpo usa `c.text_content?.['rsvp-body'] ?? 'Por favor confirmá antes del {fecha}.'` (mantiene el span dinámico de fecha límite dentro del texto).
- `renderSpotify`: título usa `c.text_content?.['spotify-title'] ?? 'La playlist'`; cuerpo usa `c.text_content?.['spotify-body'] ?? '¿Querés que suene tu canción favorita? La playlist es colaborativa — agregá los temas que quieras.'`.
- `applyTextStyle(id, style)` (de la spec anterior) suma: si `style.font` existe, `el.style.fontFamily = "'" + style.font + "', " + generic` (genérico según categoría: `cursive` para script, `serif` para serif/display, `sans-serif` para sans) — si no, `el.style.removeProperty('font-family')`.

## Testing / verificación

- Elegir Dancing Script en `hero-names` (formato Wedding) → confirmar que Fina/Normal/Negrita cambian visualmente el trazo.
- Elegir Mrs Saint Delafield (u otra de un solo peso) → confirmar que el panel muestra el aviso en vez de botones sin efecto.
- Editar el texto de Dresscode/RSVP/Playlist desde el panel → guardar → reabrir → confirmar persistencia y que la fecha límite de RSVP se sigue mostrando dentro del texto editado.
- Abrir una invitación guardada antes de este cambio (sin `font` ni `text_content`) → confirmar que se ve idéntica a como estaba.
- Confirmar que `invite.html` solo agrega el `<link>` de Google Fonts dinámico cuando hay al menos una fuente custom en uso.

## Fuera de alcance

- WEB KUERRE (no se porta en este trabajo, mismo criterio que la spec anterior).
- Subir fuentes propias (no-Google-Fonts).
- Edición de texto para los 11 bloques que ya tienen campo en el formulario.
