# Editor visual de portada (drag + reorder) — invite.html / admin.html

## Contexto

`invite.html` (WEB CRP) tiene 2 formatos de portada — **Clásico** y **Wedding** — cada uno
compuesto por 3 bloques de texto (`#hero-eyebrow`, `#hero-names`, `#hero-date`) más un
countdown fijo. Hoy el admin (`CORE/src/admin.html`) solo permite mover **el grupo entero**
con botones de flecha (`hero_text_x/y`), a ciegas — sin ninguna vista previa visual.

Se pide poder:
1. Reordenar cuál de los 3 bloques va arriba / al medio / abajo.
2. Posicionar cada bloque de forma independiente (no solo el grupo entero).
3. Reemplazar los botones de flecha por interacción directa con el mouse (arrastrar,
   rueda del mouse para ajuste fino).

Aplica a **ambos formatos** (Clásico y Wedding). El countdown no se reordena ni se
arrastra — queda fijo debajo del grupo de texto, sin cambios.

## Arquitectura

**Preview en vivo vía iframe same-origin, sin duplicar CSS.**

`admin.html` e `invite.html` se sirven desde el mismo origen (mismo dominio, mismo
deploy). En vez de reconstruir el hero dentro del admin (duplicando fuentes/estilos y
arriesgando que diverja del real), el admin embebe:

```html
<iframe id="inv-hero-preview" src="invite.html?preview=1"></iframe>
```

Al cargar, el admin llama directamente `iframe.contentWindow.applyHeroPreview(cfg)`
(acceso directo al DOM del iframe — permitido por ser same-origin, sin `postMessage`).
El iframe expone también un evento (`herolayoutchange`) que el admin escucha para
capturar los cambios de orden/posición que el usuario hace arrastrando dentro del
iframe.

Esto garantiza que el preview sea *pixel-perfect* con la portada real: es literalmente
la misma página, la misma hoja de estilos, el mismo JS de render.

## Modelo de datos

Se reemplaza `hero_text_x` / `hero_text_y` (offset único para todo el grupo) por:

```js
hero_layout: {
  order: ['eyebrow', 'names', 'date'],   // ids en orden visual (arriba → abajo)
  pos: {
    eyebrow: { x: 0, y: 0 },
    names:   { x: 0, y: 0 },
    date:    { x: 0, y: 0 }
  }
}
```

- `order` determina el `order` CSS (flexbox) de cada bloque dentro de `#hero-content`.
- `pos` es un offset fino (`transform: translate(x,y)`) aplicado sobre la posición que
  le toca por su `order`.
- El countdown no tiene entrada en este objeto — siempre es el último elemento visual,
  sin offset.

**Backward compatibility:** si una invitación guardada no tiene `hero_layout` pero sí
`hero_text_x/y` (formato legacy), al cargar se sintetiza un `hero_layout` con
`order: ['eyebrow','names','date']` y ese mismo offset aplicado a los 3 bloques — la
invitación se ve exactamente igual que antes, sin necesitar una migración de datos
explícita. Se guarda como `hero_layout` la próxima vez que se edite y guarde.

## Interacción dentro del preview

Implementada en `invite.html`, activa solo cuando la página corre en modo
`?preview=1` (o sea, nunca afecta a la invitación real que ve un invitado).

- **Arrastre (mousedown → mousemove → mouseup)** sobre `#hero-eyebrow`,
  `#hero-names` o `#hero-date`:
  - Actualiza el `transform: translate()` del bloque en vivo (feedback inmediato).
  - Si el centro vertical del bloque arrastrado cruza el centro vertical de un bloque
    vecino, se intercambian sus valores de `order` (reordenamiento).
  - Al soltar, se consolida `{order, pos}` en un objeto `heroLayout` interno del
    iframe y se dispara `window.dispatchEvent(new CustomEvent('herolayoutchange', {detail: heroLayout}))`.
- **Rueda del mouse** sobre un bloque (sin necesidad de arrastrar):
  - Ajusta `y` en pasos pequeños (±2px por tick) — pensado para el ajuste fino luego
    de un arrastre grueso.
  - Dispara el mismo evento `herolayoutchange` al soltar/parar de scrollear
    (debounce ~150ms).
- `window.getHeroLayout()` queda expuesta como getter adicional (por si el admin
  necesita leer el estado sin depender del evento, ej. al abrir el modal ya con datos
  cargados).

## Cambios en `invite.html`

1. Detectar `?preview=1` en `parseConfig()`/`init()`:
   - Se salta el flujo del sobre (`showEnvelope`) y el fetch a `CF_URL_INV` — el admin
     va a inyectar la config directamente.
   - Se muestra `#invite-app` de inmediato (solo interesa `#hero`, el resto de las
     secciones no se ocultan pero tampoco importan para este editor).
2. Nueva función `applyHeroPreview(cfg)`: llama al `renderHero(cfg)` ya existente
   (con su branching `formato === 'wedding'` actual, sin tocarlo) y además aplica
   `cfg.hero_layout` (o el legacy migrado) vía una nueva función `applyHeroLayout(layout)`.
3. `applyHeroLayout(layout)`: setea `style.order` y `style.transform` en los 3 bloques
   según `layout.order` / `layout.pos`. Se reusa tanto en preview como en el render de
   producción normal (misma función, sin condicional de modo).
4. Los handlers de arrastre/rueda/reordenamiento (mousedown/mousemove/mouseup/wheel)
   solo se registran cuando `preview=1` — cero impacto en el render que ve un invitado
   real.
5. `#hero-content` pasa a `display:flex; flex-direction:column` (ya está centrado por
   `#hero` con flex/align-items/justify-content, así que este cambio es transparente)
   para que la propiedad `order` de los 3 hijos determine la secuencia visual.

## Cambios en `CORE/src/admin.html`

1. La sección actual "Posición del texto en portada" (botones de flecha, líneas
   ~720-740) se reemplaza por:
   - El `<iframe id="inv-hero-preview">` (tamaño fijo, ej. 380×260, ya que `#hero` usa
     `100vh` relativo al viewport propio del iframe — no requiere ningún ajuste de
     escala especial).
   - Un texto de ayuda breve: "Arrastrá los textos para reposicionarlos y
     reordenarlos. Rueda del mouse = ajuste fino."
2. Al abrir el modal (edición o invitación nueva) y en cada cambio de campo relevante
   (`inv-novios`, `inv-wedding-script`, `inv-fecha-display`, `inv-formato`,
   `inv-color-esquema`, `inv-wedding-fx`, `inv-media-url`/tipo): se reconstruye el
   `cfg` desde el formulario (reusando `readInviteForm()`) y se llama
   `iframe.contentWindow.applyHeroPreview(cfg)` (debounce ~200ms en inputs de texto).
3. `iframe.contentWindow.addEventListener('herolayoutchange', e => { _heroLayout = e.detail; })`
   guarda el resultado en una variable de módulo `_heroLayout`.
4. `readInviteForm()`: agrega `hero_layout: _heroLayout` al config guardado, en lugar
   de `hero_text_x/y`.
5. Al cargar una invitación existente (`loadInvite`/equivalente): si `c.hero_layout`
   existe se usa tal cual; si no, se sintetiza desde `c.hero_text_x/y` (mismo criterio
   de migración descrito arriba) antes de pasarlo al preview.
6. Se elimina `nudgeHeroText`/`resetHeroTextPos`/`setHeroTextPos` y los inputs ocultos
   `inv-text-x`/`inv-text-y` (quedan obsoletos, reemplazados por `_heroLayout`).

## Testing / verificación

- Cargar el admin, abrir una invitación nueva en formato Wedding: verificar que el
  preview muestra foto + 3 textos en su posición default, arrastre reordena
  correctamente (cruce de centros intercambia `order`), rueda ajusta Y fino, y el
  config guardado contiene `hero_layout` coherente.
- Repetir en formato Clásico.
- Cargar una invitación existente creada antes de este cambio (con `hero_text_x/y`
  legacy, sin `hero_layout`): confirmar que el preview la muestra en la misma posición
  que tenía antes (migración implícita funciona) y que al guardar queda persistida
  como `hero_layout`.
- Abrir la invitación real (no `?preview=1`) en el navegador y confirmar que no
  aparecen listeners de arrastre ni cambia el comportamiento para el invitado.
