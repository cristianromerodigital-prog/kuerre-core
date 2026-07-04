# Tamaño y grosor de texto en la invitación (CRP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir ajustar tamaño y grosor de los títulos/textos principales de todas las secciones de `invite.html` (CRP), reusando el mismo iframe de preview que ya existe para el arrastre del hero.

**Architecture:** `invite.html` en modo `?preview=1` pasa a renderizar TODAS las secciones (no solo el hero) y expone un sistema `text_styles` (mapa `id → {size, weight}`) aplicado vía una custom property CSS (`--ts-scale`) que multiplica el `font-size` original sin romper el `clamp()` responsive. Un click sobre cualquiera de 16 bloques abre un panel flotante (construido enteramente en JS, sin marcado estático) con slider de tamaño y 4 botones de grosor; los cambios se emiten vía evento `textstyleschange` que el admin (`CORE/src/admin.html`, compartido por CRP y Kuerre) escucha y persiste en `readInviteForm()`.

**Tech Stack:** Vanilla HTML/CSS/JS (sin build, sin framework en `invite.html`/`admin.html`; `CORE` sí tiene un script de build `build-admin.cjs` que genera los `admin.html` finales). Verificación vía Playwright CLI (`npx playwright`) y `python -m http.server` para servir localmente — no hay test runner en el repo.

## Global Constraints

- Alcance **solo WEB CRP** (`WEB CRP/Productivo/invite.html`). No se toca WEB KUERRE ni `invite-social.html`/`invite-social-v2.html`.
- Cero impacto en el render que ve un invitado real: todo listener de click/drag para estilos solo se registra bajo `PREVIEW_MODE` (`?preview=1`).
- `CORE/src/admin.html` es la fuente única para los `admin.html` de CRP y Kuerre — todo cambio ahí se buildea con `node build-admin.cjs` y afecta a ambos brands.
- No modificar el comportamiento de arrastre del hero ya existente (`hero_layout`, orden/posición) — solo agregarle la distinción click-vs-drag.
- Sin test runner: verificar con Playwright CLI (`npx --yes playwright ...` o scripts node con `require('playwright')`) contra un server local, y con revisión manual guiada al final.
- No hacer `git push` en ningún repo — solo commits locales. Informar al usuario y esperar confirmación explícita ("subilo") antes de subir.

---

### Task 1: `invite.html` (CRP) — CSS: soporte de escala por bloque + peso 600 de Montserrat

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\Productivo\invite.html` (bloque `<style>`, líneas ~8, 35-53, 184-186)

**Interfaces:**
- Produces: custom property `--ts-scale` (default `1`) multiplicando el `font-size` en 8 reglas CSS, clase nueva `.sec-body-sub`. Consumido por el JS de Task 3 (`applyTextStyle`).

- [ ] **Step 1: Agregar el peso 600 de Montserrat al `<link>` de Google Fonts**

Reemplazar:

```html
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Montserrat:wght@300;400;500&family=Mrs+Saint+Delafield&family=Cinzel:wght@400;500;600&display=swap" rel="stylesheet">
```

por:

```html
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Montserrat:wght@300;400;500;600&family=Mrs+Saint+Delafield&family=Cinzel:wght@400;500;600&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Envolver el `font-size` de los 3 bloques del hero (formato clásico) en `calc(... * var(--ts-scale,1))`**

Reemplazar:

```css
.hero-eyebrow{font-size:10px;letter-spacing:6px;text-transform:uppercase;color:var(--gold);margin-bottom:24px;opacity:0.9}
.hero-names{font-family:'Cormorant Garamond',serif;font-size:clamp(52px,10vw,100px);font-weight:300;line-height:1;letter-spacing:-1px;margin-bottom:16px}
.hero-names em{font-style:italic;color:var(--gold2)}
.hero-ampersand{color:var(--gold);font-weight:300;padding:0 8px}
.hero-date{font-size:13px;letter-spacing:4px;text-transform:uppercase;color:var(--gray2);margin-top:20px}
```

por:

```css
.hero-eyebrow{font-size:calc(10px * var(--ts-scale,1));letter-spacing:6px;text-transform:uppercase;color:var(--gold);margin-bottom:24px;opacity:0.9}
.hero-names{font-family:'Cormorant Garamond',serif;font-size:calc(clamp(52px,10vw,100px) * var(--ts-scale,1));font-weight:300;line-height:1;letter-spacing:-1px;margin-bottom:16px}
.hero-names em{font-style:italic;color:var(--gold2)}
.hero-ampersand{color:var(--gold);font-weight:300;padding:0 8px}
.hero-date{font-size:calc(13px * var(--ts-scale,1));letter-spacing:4px;text-transform:uppercase;color:var(--gray2);margin-top:20px}
```

- [ ] **Step 3: Envolver `.sec-title` y `.sec-body`, agregar `.sec-body-sub`**

Reemplazar:

```css
.sec-label{font-size:9px;letter-spacing:5px;text-transform:uppercase;color:var(--gold);margin-bottom:20px;display:block}
.sec-title{font-family:'Cormorant Garamond',serif;font-size:clamp(36px,6vw,58px);font-weight:300;line-height:1.1;margin-bottom:24px}
.sec-title em{font-style:italic;color:var(--gold2)}
.sec-body{font-size:14px;line-height:1.9;color:var(--gray2)}
```

por:

```css
.sec-label{font-size:9px;letter-spacing:5px;text-transform:uppercase;color:var(--gold);margin-bottom:20px;display:block}
.sec-title{font-family:'Cormorant Garamond',serif;font-size:calc(clamp(36px,6vw,58px) * var(--ts-scale,1));font-weight:300;line-height:1.1;margin-bottom:24px}
.sec-title em{font-style:italic;color:var(--gold2)}
.sec-body{font-size:calc(14px * var(--ts-scale,1));line-height:1.9;color:var(--gray2)}
.sec-body-sub{margin-top:6px;font-size:calc(12px * var(--ts-scale,1));opacity:0.7}
```

(`.sec-body-sub` reemplaza el `style="margin-top:6px;font-size:12px;opacity:0.7"` inline que hoy tienen `ceremonia-lugar-dir` y `lugar-dir` — ver Task 2. Al declararse después de `.sec-body` en la hoja de estilos, su `font-size` gana por orden de aparición ante igual especificidad.)

- [ ] **Step 4: Envolver el `font-size` de los 3 bloques del hero en formato Wedding**

Reemplazar:

```css
.formato-wedding .hero-eyebrow{font-family:'Montserrat',sans-serif;font-size:clamp(13px,2vw,18px);font-weight:400;letter-spacing:10px;opacity:1;margin-bottom:18px;color:var(--white)}
.formato-wedding .hero-names{font-family:'Mrs Saint Delafield',cursive;font-size:clamp(80px,18vw,190px);line-height:0.85;letter-spacing:0;margin:4px 0 8px;transform:rotate(-3deg);color:var(--white)}
.formato-wedding .hero-date{font-family:'Cinzel',serif;font-weight:500;font-size:clamp(20px,3vw,28px);letter-spacing:7px;margin-top:32px;color:var(--white)}
```

por:

```css
.formato-wedding .hero-eyebrow{font-family:'Montserrat',sans-serif;font-size:calc(clamp(13px,2vw,18px) * var(--ts-scale,1));font-weight:400;letter-spacing:10px;opacity:1;margin-bottom:18px;color:var(--white)}
.formato-wedding .hero-names{font-family:'Mrs Saint Delafield',cursive;font-size:calc(clamp(80px,18vw,190px) * var(--ts-scale,1));line-height:0.85;letter-spacing:0;margin:4px 0 8px;transform:rotate(-3deg);color:var(--white)}
.formato-wedding .hero-date{font-family:'Cinzel',serif;font-weight:500;font-size:calc(clamp(20px,3vw,28px) * var(--ts-scale,1));letter-spacing:7px;margin-top:32px;color:var(--white)}
```

- [ ] **Step 5: Verificar con grep que las 8 reglas quedaron envueltas**

```bash
grep -c -- "--ts-scale" "e:/CLAUDE/WEB CRP/Productivo/invite.html"
```

Expected: `9` (8 usos en `calc(...)` + 1 en la nueva regla `.sec-body-sub`, que también usa la variable — son 9 apariciones de la cadena `--ts-scale` en total contando declaración y uso... si el conteo da un número distinto, abrir el archivo y confirmar visualmente que son exactamente estas 8 reglas de `font-size` + `.sec-body-sub` las que la usan, ninguna de más ni de menos).

- [ ] **Step 6: Commit**

```bash
cd "e:/CLAUDE/WEB CRP/Productivo" && git add invite.html && git commit -m "$(cat <<'EOF'
feat(invite): soporte de escala de tamano por bloque de texto (CSS)

Envuelve el font-size de hero (clasico y wedding), sec-title y
sec-body en calc(valor * var(--ts-scale,1)) para poder escalar cada
bloque individualmente sin romper el clamp() responsive. Extrae el
font-size inline de ceremonia-lugar-dir/lugar-dir a una clase nueva
.sec-body-sub para que tambien sea escalable. Agrega el peso 600 de
Montserrat (antes solo 300/400/500) para que la opcion "Negrita" del
proximo editor se vea con un peso real, no un bold sintetico.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `invite.html` (CRP) — HTML: ids faltantes + clase `sec-body-sub`

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\Productivo\invite.html` (líneas ~336-346, 359, 389-390, 443-444)

**Interfaces:**
- Produces: ids `dresscode-title`, `rsvp-title`, `rsvp-body`, `spotify-title`, `spotify-body` (los otros 11 de los 16 bloques ya existen). Consumido por `TEXT_STYLE_IDS` en Task 3.

- [ ] **Step 1: Aplicar `.sec-body-sub` en `ceremonia-lugar-dir` y `lugar-dir`, quitando el inline style**

Reemplazar:

```html
  <h2 class="sec-title" id="ceremonia-lugar-nombre"></h2>
  <p class="sec-body" id="ceremonia-lugar-dir" style="margin-top:6px;font-size:12px;opacity:0.7"></p>
```

por:

```html
  <h2 class="sec-title" id="ceremonia-lugar-nombre"></h2>
  <p class="sec-body sec-body-sub" id="ceremonia-lugar-dir"></p>
```

Reemplazar:

```html
  <h2 class="sec-title" id="lugar-nombre"></h2>
  <p class="sec-body" id="lugar-dir" style="margin-top:6px;font-size:12px;opacity:0.7"></p>
```

por:

```html
  <h2 class="sec-title" id="lugar-nombre"></h2>
  <p class="sec-body sec-body-sub" id="lugar-dir"></p>
```

- [ ] **Step 2: Agregar id al título de Dresscode**

Reemplazar:

```html
  <h2 class="sec-title"><em>Dresscode</em></h2>
```

por:

```html
  <h2 class="sec-title" id="dresscode-title"><em>Dresscode</em></h2>
```

- [ ] **Step 3: Agregar ids al título y texto de RSVP**

Reemplazar:

```html
  <h2 class="sec-title">¿<em>Venís</em>?</h2>
  <p class="sec-body">Por favor confirmá antes del <span id="rsvp-fecha-limite" style="color:var(--gold2)"></span>.</p>
```

por:

```html
  <h2 class="sec-title" id="rsvp-title">¿<em>Venís</em>?</h2>
  <p class="sec-body" id="rsvp-body">Por favor confirmá antes del <span id="rsvp-fecha-limite" style="color:var(--gold2)"></span>.</p>
```

- [ ] **Step 4: Agregar ids al título y texto de Spotify**

Reemplazar:

```html
  <h2 class="sec-title">La <em>playlist</em></h2>
  <p class="sec-body" style="margin:0 auto;max-width:480px">¿Querés que suene tu canción favorita? La playlist es colaborativa — agregá los temas que quieras.</p>
```

por:

```html
  <h2 class="sec-title" id="spotify-title">La <em>playlist</em></h2>
  <p class="sec-body" id="spotify-body" style="margin:0 auto;max-width:480px">¿Querés que suene tu canción favorita? La playlist es colaborativa — agregá los temas que quieras.</p>
```

- [ ] **Step 5: Verificar que los 5 ids nuevos quedaron y que no se rompió ningún atributo**

```bash
grep -n 'id="dresscode-title"\|id="rsvp-title"\|id="rsvp-body"\|id="spotify-title"\|id="spotify-body"\|sec-body-sub' "e:/CLAUDE/WEB CRP/Productivo/invite.html"
```

Expected: 7 líneas (5 ids nuevos en su elemento + 2 usos de `sec-body-sub` en `ceremonia-lugar-dir`/`lugar-dir`).

- [ ] **Step 6: Commit**

```bash
cd "e:/CLAUDE/WEB CRP/Productivo" && git add invite.html && git commit -m "$(cat <<'EOF'
feat(invite): ids en titulos/textos de Dresscode, RSVP y Spotify

Agrega id a 5 elementos de texto estatico que no lo tenian
(dresscode-title, rsvp-title, rsvp-body, spotify-title, spotify-body)
para que el editor de tamano/grosor los pueda direccionar. No cambia
texto ni comportamiento existente.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `invite.html` (CRP) — modelo de datos `text_styles` + aplicación

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\Productivo\invite.html` (JS, insertar antes de `function renderHero(c) {`, inmediatamente después de la función `emitHeroLayoutChange` existente)

**Interfaces:**
- Consumes: ninguna de tasks anteriores (usa los ids de Task 2 y las reglas CSS de Task 1).
- Produces: `TEXT_STYLE_IDS` (array de 16 ids), `applyTextStyle(id, style)`, `applyAllTextStyles(styles)` — consumidos por Task 4 (panel) y Task 6 (integración con el render completo).

- [ ] **Step 1: Insertar el modelo de datos, después de `emitHeroLayoutChange` y antes de `function renderHero(c) {`**

Buscar el final de la función existente:

```js
function emitHeroLayoutChange() {
  window.dispatchEvent(new CustomEvent('herolayoutchange', { detail: JSON.parse(JSON.stringify(heroLayout)) }));
}

function renderHero(c) {
```

Reemplazar por:

```js
function emitHeroLayoutChange() {
  window.dispatchEvent(new CustomEvent('herolayoutchange', { detail: JSON.parse(JSON.stringify(heroLayout)) }));
}

// ── TEXT STYLES (tamano/grosor por bloque, todas las secciones) ──
const TEXT_STYLE_IDS = ['hero-eyebrow', 'hero-names', 'hero-date', 'ev-title', 'ev-body',
  'ceremonia-lugar-nombre', 'ceremonia-lugar-dir', 'lugar-nombre', 'lugar-dir', 'dresscode-title',
  'regalo-titulo', 'regalo-texto', 'rsvp-title', 'rsvp-body', 'spotify-title', 'spotify-body'];

let textStyles = {};

function applyTextStyle(id, style) {
  const el = document.getElementById(id);
  if (!el) return;
  if (style && style.size) el.style.setProperty('--ts-scale', style.size / 100);
  else el.style.removeProperty('--ts-scale');
  if (style && style.weight) el.style.fontWeight = style.weight;
  else el.style.removeProperty('font-weight');
}

function applyAllTextStyles(styles) {
  textStyles = styles || {};
  TEXT_STYLE_IDS.forEach(id => applyTextStyle(id, textStyles[id]));
}

function renderHero(c) {
```

- [ ] **Step 2: Levantar un server local para verificar**

```bash
cd "e:/CLAUDE/WEB CRP/Productivo" && python -m http.server 8090
```

- [ ] **Step 3: Verificar con Playwright que `applyTextStyle`/`applyAllTextStyles` cambian el estilo computado**

Crear `C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/96380c22-dd4f-4a9a-a76d-4a62c71bb216/scratchpad/pwtest/check-task3.js`:

```js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  await page.goto('http://localhost:8090/invite.html?preview=1');
  await page.waitForFunction(() => typeof window.applyHeroPreview === 'function');
  await page.evaluate(() => window.applyHeroPreview({ novios: 'Fale & Nico', fecha_display: '06.03.2027' }));

  const before = await page.evaluate(() => getComputedStyle(document.getElementById('hero-names')).fontWeight);

  await page.evaluate(() => applyAllTextStyles({ 'hero-names': { size: 150, weight: 600 } }));
  const scale = await page.evaluate(() => document.getElementById('hero-names').style.getPropertyValue('--ts-scale'));
  const weight = await page.evaluate(() => getComputedStyle(document.getElementById('hero-names')).fontWeight);

  console.log('BEFORE_WEIGHT', before);
  console.log('SCALE', scale === '1.5' ? 'PASS' : 'FAIL', scale);
  console.log('WEIGHT', weight === '600' ? 'PASS' : 'FAIL', weight);

  await page.evaluate(() => applyTextStyle('hero-names', null));
  const scaleReset = await page.evaluate(() => document.getElementById('hero-names').style.getPropertyValue('--ts-scale'));
  console.log('RESET', scaleReset === '' ? 'PASS' : 'FAIL', JSON.stringify(scaleReset));

  await browser.close();
})();
```

```bash
mkdir -p "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/96380c22-dd4f-4a9a-a76d-4a62c71bb216/scratchpad/pwtest" && cd "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/96380c22-dd4f-4a9a-a76d-4a62c71bb216/scratchpad/pwtest" && npm init -y && npm install playwright && npx playwright install chromium
```

```bash
node check-task3.js
```

Expected:
```
BEFORE_WEIGHT 300
SCALE PASS 1.5
WEIGHT PASS 600
RESET PASS ""
```

- [ ] **Step 4: Detener el server y commitear**

```bash
taskkill //F //IM python.exe
cd "e:/CLAUDE/WEB CRP/Productivo" && git add invite.html && git commit -m "$(cat <<'EOF'
feat(invite): modelo de datos text_styles (tamano/grosor por bloque)

applyTextStyle/applyAllTextStyles setean --ts-scale y font-weight
inline sobre cualquiera de los 16 bloques editables. Sin efecto
visual todavia -- falta la interaccion de click (siguiente tarea).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `invite.html` (CRP) — panel flotante de click + wiring en los 16 bloques

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\Productivo\invite.html` (JS: insertar después del bloque de Task 3 y antes de `function renderHero(c) {`; modificar `endHeroDrag`; modificar el branch `PREVIEW_MODE` de `init()`)

**Interfaces:**
- Consumes: `TEXT_STYLE_IDS`, `textStyles`, `applyTextStyle` (Task 3); `heroLayout`, `HERO_BLOCK_IDS`, `heroDrag` (ya existentes).
- Produces: `openTextStylePanel(id)`, `closeTsPanel()`, `emitTextStylesChange()`, `initTextStyleClickHandlers()` — consumidos por Task 6 (integración con `init()`/`applyHeroPreview`) y por Task 5 (`endHeroDrag`).

- [ ] **Step 1: Insertar el panel flotante y las funciones de interacción, después del bloque de Task 3**

Insertar inmediatamente después de `function applyAllTextStyles(styles) { ... }` (Task 3) y antes de `function renderHero(c) {`:

```js
const TEXT_STYLE_LABELS = {
  'hero-eyebrow': 'Hero — Eyebrow', 'hero-names': 'Hero — Nombres', 'hero-date': 'Hero — Fecha',
  'ev-title': 'Cuándo — Título', 'ev-body': 'Cuándo — Texto',
  'ceremonia-lugar-nombre': 'Ceremonia — Nombre', 'ceremonia-lugar-dir': 'Ceremonia — Dirección',
  'lugar-nombre': 'Dónde — Nombre', 'lugar-dir': 'Dónde — Dirección',
  'dresscode-title': 'Dresscode — Título',
  'regalo-titulo': 'Regalo — Título', 'regalo-texto': 'Regalo — Texto',
  'rsvp-title': 'RSVP — Título', 'rsvp-body': 'RSVP — Texto',
  'spotify-title': 'Spotify — Título', 'spotify-body': 'Spotify — Texto'
};

let tsPanelEl = null;
let tsActiveId = null;
let tsChangeTimer = null;

function ensureTsPanel() {
  if (tsPanelEl) return tsPanelEl;
  tsPanelEl = document.createElement('div');
  tsPanelEl.id = 'ts-panel';
  tsPanelEl.style.cssText = 'display:none;position:fixed;z-index:9999;background:#1a1a1a;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:14px 16px;font-family:Montserrat,sans-serif;color:#f5f0e8;font-size:12px;width:220px;box-shadow:0 8px 24px rgba(0,0,0,0.5)';
  tsPanelEl.innerHTML = `
    <div id="ts-panel-title" style="font-size:11px;letter-spacing:1px;color:#c9a84c;margin-bottom:10px;text-transform:uppercase"></div>
    <label style="display:block;font-size:10px;color:#999;margin-bottom:4px">Tamaño: <span id="ts-size-val">100</span>%</label>
    <input type="range" id="ts-size-slider" min="50" max="180" step="5" value="100" style="width:100%;margin-bottom:12px">
    <div style="font-size:10px;color:#999;margin-bottom:6px">Grosor</div>
    <div style="display:flex;gap:6px;margin-bottom:12px" id="ts-weight-buttons">
      <button type="button" data-w="" style="flex:1;padding:6px 0;font-size:10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;cursor:pointer;border-radius:4px">Original</button>
      <button type="button" data-w="300" style="flex:1;padding:6px 0;font-size:10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;cursor:pointer;border-radius:4px">Fina</button>
      <button type="button" data-w="400" style="flex:1;padding:6px 0;font-size:10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;cursor:pointer;border-radius:4px">Normal</button>
      <button type="button" data-w="600" style="flex:1;padding:6px 0;font-size:10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;cursor:pointer;border-radius:4px">Negrita</button>
    </div>
    <button type="button" id="ts-reset-btn" style="width:100%;padding:6px 0;font-size:10px;background:none;border:1px solid rgba(255,255,255,0.2);color:#999;cursor:pointer;border-radius:4px">Restablecer</button>
  `;
  document.body.appendChild(tsPanelEl);
  tsPanelEl.addEventListener('mousedown', e => e.stopPropagation());
  tsPanelEl.querySelector('#ts-size-slider').addEventListener('input', e => {
    const v = parseInt(e.target.value);
    tsPanelEl.querySelector('#ts-size-val').textContent = v;
    setTextStyleField(tsActiveId, 'size', v);
  });
  tsPanelEl.querySelectorAll('#ts-weight-buttons button').forEach(btn => {
    btn.addEventListener('click', () => setTextStyleField(tsActiveId, 'weight', btn.dataset.w ? parseInt(btn.dataset.w) : null));
  });
  tsPanelEl.querySelector('#ts-reset-btn').addEventListener('click', () => {
    delete textStyles[tsActiveId];
    applyTextStyle(tsActiveId, null);
    closeTsPanel();
    emitTextStylesChange();
  });
  return tsPanelEl;
}

function setTextStyleField(id, field, value) {
  if (!id) return;
  if (!textStyles[id]) textStyles[id] = {};
  if (value === null || value === undefined) delete textStyles[id][field];
  else textStyles[id][field] = value;
  if (Object.keys(textStyles[id]).length === 0) delete textStyles[id];
  applyTextStyle(id, textStyles[id]);
  clearTimeout(tsChangeTimer);
  tsChangeTimer = setTimeout(emitTextStylesChange, 150);
}

function emitTextStylesChange() {
  window.dispatchEvent(new CustomEvent('textstyleschange', { detail: JSON.parse(JSON.stringify(textStyles)) }));
}

function openTextStylePanel(id) {
  const el = document.getElementById(id);
  if (!el) return;
  tsActiveId = id;
  const panel = ensureTsPanel();
  panel.querySelector('#ts-panel-title').textContent = TEXT_STYLE_LABELS[id] || id;
  const cur = textStyles[id] || {};
  panel.querySelector('#ts-size-slider').value = cur.size || 100;
  panel.querySelector('#ts-size-val').textContent = cur.size || 100;
  panel.querySelectorAll('#ts-weight-buttons button').forEach(btn => {
    const w = btn.dataset.w ? parseInt(btn.dataset.w) : null;
    btn.style.borderColor = (w === (cur.weight || null)) ? '#c9a84c' : 'rgba(255,255,255,0.15)';
  });
  const r = el.getBoundingClientRect();
  panel.style.display = 'block';
  let top = r.bottom + 8;
  if (top + 220 > window.innerHeight) top = Math.max(8, r.top - 228);
  const left = Math.min(Math.max(8, r.left), window.innerWidth - 236);
  panel.style.top = top + 'px';
  panel.style.left = left + 'px';
}

function closeTsPanel() {
  if (tsPanelEl) tsPanelEl.style.display = 'none';
  tsActiveId = null;
}

function initTextStyleClickHandlers() {
  TEXT_STYLE_IDS.filter(id => !id.startsWith('hero-')).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => openTextStylePanel(id));
  });
  document.addEventListener('click', e => {
    if (tsPanelEl && tsPanelEl.contains(e.target)) return;
    if (TEXT_STYLE_IDS.includes(e.target.id)) return;
    closeTsPanel();
  });
}
```

- [ ] **Step 2: Registrar `initTextStyleClickHandlers()` en el branch `PREVIEW_MODE` de `init()`**

Reemplazar:

```js
async function init() {
  if (PREVIEW_MODE) {
    document.getElementById('loading-splash').style.display = 'none';
    cfg = {};
    document.body.style.userSelect = 'none';
    renderHero(cfg);
    document.getElementById('invite-app').style.display = 'block';
    initHeroPreviewInteractions();
    return;
  }
```

por:

```js
async function init() {
  if (PREVIEW_MODE) {
    document.getElementById('loading-splash').style.display = 'none';
    cfg = {};
    document.body.style.userSelect = 'none';
    renderHero(cfg);
    document.getElementById('invite-app').style.display = 'block';
    initHeroPreviewInteractions();
    initTextStyleClickHandlers();
    return;
  }
```

- [ ] **Step 3: Levantar el server local y verificar con Playwright**

```bash
cd "e:/CLAUDE/WEB CRP/Productivo" && python -m http.server 8090
```

Crear `C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/96380c22-dd4f-4a9a-a76d-4a62c71bb216/scratchpad/pwtest/check-task4.js`:

```js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  await page.goto('http://localhost:8090/invite.html?preview=1');
  await page.waitForFunction(() => typeof window.applyHeroPreview === 'function');
  await page.evaluate(() => window.applyHeroPreview({ novios: 'Fale & Nico', fecha_display: '06.03.2027' }));

  // click en un bloque estatico (Dresscode) que no depende del render completo
  await page.evaluate(() => document.getElementById('dresscode-title').click());
  const panelVisible = await page.evaluate(() => document.getElementById('ts-panel').style.display);
  console.log('PANEL_OPEN', panelVisible === 'block' ? 'PASS' : 'FAIL', panelVisible);

  // mover el slider de tamaño y confirmar que se aplica en vivo
  const slider = page.locator('#ts-size-slider');
  await slider.evaluate(el => { el.value = 140; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const scale = await page.evaluate(() => document.getElementById('dresscode-title').style.getPropertyValue('--ts-scale'));
  console.log('SIZE_LIVE', scale === '1.4' ? 'PASS' : 'FAIL', scale);

  // click en boton "Negrita"
  await page.evaluate(() => {
    [...document.querySelectorAll('#ts-weight-buttons button')].find(b => b.dataset.w === '600').click();
  });
  const weight = await page.evaluate(() => getComputedStyle(document.getElementById('dresscode-title')).fontWeight);
  console.log('WEIGHT_LIVE', weight === '600' ? 'PASS' : 'FAIL', weight);

  // click afuera cierra el panel
  await page.evaluate(() => document.getElementById('hero-media-wrap').click());
  const panelClosed = await page.evaluate(() => document.getElementById('ts-panel').style.display);
  console.log('PANEL_CLOSE', panelClosed === 'none' ? 'PASS' : 'FAIL', panelClosed);

  await browser.close();
})();
```

```bash
cd "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/96380c22-dd4f-4a9a-a76d-4a62c71bb216/scratchpad/pwtest" && node check-task4.js
```

Expected:
```
PANEL_OPEN PASS block
SIZE_LIVE PASS 1.4
WEIGHT_LIVE PASS 600
PANEL_CLOSE PASS none
```

- [ ] **Step 4: Detener el server y commitear**

```bash
taskkill //F //IM python.exe
cd "e:/CLAUDE/WEB CRP/Productivo" && git add invite.html && git commit -m "$(cat <<'EOF'
feat(invite): panel flotante de tamano/grosor al clickear un texto

Click en cualquiera de los 13 bloques no-hero abre un panel con
slider de tamano (50-180%) y 4 botones de grosor (Original/Fina/
Normal/Negrita), con aplicacion en vivo y cierre al clickear afuera.
El panel se construye enteramente en JS (sin marcado estatico) y
solo se registra bajo PREVIEW_MODE -- cero impacto para el invitado
real. Los 3 bloques del hero se conectan en la siguiente tarea (hay
que distinguir click de drag primero).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `invite.html` (CRP) — distinguir click de drag en el hero + fix de listener duplicado en RSVP

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\Productivo\invite.html` (función `endHeroDrag`, función `renderRSVP`)

**Interfaces:**
- Consumes: `openTextStylePanel` (Task 4), `heroDrag`, `heroLayout`, `applyHeroLayout` (ya existentes).

- [ ] **Step 1: Modificar `endHeroDrag` para abrir el panel si el movimiento fue menor a 5px**

Reemplazar:

```js
function endHeroDrag() {
  if (!heroDrag) return;
  document.getElementById('hero-content').style.cursor = 'grab';
  heroDrag = null;
  emitHeroLayoutChange();
}
```

por:

```js
function endHeroDrag() {
  if (!heroDrag) return;
  document.getElementById('hero-content').style.cursor = 'grab';
  const { id, origX, origY } = heroDrag;
  const p = heroLayout.pos[id];
  const moved = Math.hypot(p.x - origX, p.y - origY);
  heroDrag = null;
  if (moved < 5) {
    heroLayout.pos[id] = { x: origX, y: origY };
    applyHeroLayout(heroLayout);
    openTextStylePanel('hero-' + id);
  } else {
    emitHeroLayoutChange();
  }
}
```

- [ ] **Step 2: Blindar `renderRSVP` contra listeners duplicados (se va a llamar en cada refresh del preview desde Task 6)**

Reemplazar:

```js
function renderRSVP(c) {
  const sec = document.getElementById('rsvp');
  if (c.tipo === 'save_the_date' || !c.rsvp_activo) { sec.style.display = 'none'; return; }
  const fl = document.getElementById('rsvp-fecha-limite');
  fl.textContent = formatFechaLimite(c.rsvp_limite) || '';
  document.getElementById('rsvp-alergia').addEventListener('change', function() {
    document.getElementById('rsvp-alergia-detail-wrap').style.display = this.checked ? 'block' : 'none';
  });
}
```

por:

```js
function renderRSVP(c) {
  const sec = document.getElementById('rsvp');
  if (c.tipo === 'save_the_date' || !c.rsvp_activo) { sec.style.display = 'none'; return; }
  const fl = document.getElementById('rsvp-fecha-limite');
  fl.textContent = formatFechaLimite(c.rsvp_limite) || '';
  const alergiaEl = document.getElementById('rsvp-alergia');
  if (!alergiaEl.dataset.bound) {
    alergiaEl.dataset.bound = '1';
    alergiaEl.addEventListener('change', function() {
      document.getElementById('rsvp-alergia-detail-wrap').style.display = this.checked ? 'block' : 'none';
    });
  }
}
```

- [ ] **Step 3: Levantar el server local y verificar con Playwright**

```bash
cd "e:/CLAUDE/WEB CRP/Productivo" && python -m http.server 8090
```

Crear `C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/96380c22-dd4f-4a9a-a76d-4a62c71bb216/scratchpad/pwtest/check-task5.js`:

```js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  await page.goto('http://localhost:8090/invite.html?preview=1');
  await page.waitForFunction(() => typeof window.applyHeroPreview === 'function');
  await page.evaluate(() => window.applyHeroPreview({ novios: 'Fale & Nico', fecha_display: '06.03.2027' }));

  // click puro (sin mover el mouse) sobre hero-names -> debe abrir el panel, no mover el layout
  const namesBox = await page.locator('#hero-names').boundingBox();
  await page.mouse.move(namesBox.x + namesBox.width / 2, namesBox.y + namesBox.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  const panelVisible = await page.evaluate(() => document.getElementById('ts-panel').style.display);
  const layoutAfterClick = await page.evaluate(() => window.getHeroLayout());
  console.log('CLICK_OPENS_PANEL', panelVisible === 'block' ? 'PASS' : 'FAIL', panelVisible);
  console.log('CLICK_NO_MOVE', (layoutAfterClick.pos.names.x === 0 && layoutAfterClick.pos.names.y === 0) ? 'PASS' : 'FAIL', layoutAfterClick.pos.names);

  // arrastre real (>5px) -> sigue reposicionando, no abre panel para ese drag
  await page.evaluate(() => document.getElementById('hero-media-wrap').click()); // cierra el panel anterior
  await page.mouse.move(namesBox.x + namesBox.width / 2, namesBox.y + namesBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(namesBox.x + namesBox.width / 2, namesBox.y + namesBox.height / 2 - 40, { steps: 10 });
  await page.mouse.up();
  const layoutAfterDrag = await page.evaluate(() => window.getHeroLayout());
  console.log('DRAG_STILL_WORKS', layoutAfterDrag.pos.names.y === -40 ? 'PASS' : 'FAIL', layoutAfterDrag.pos.names);

  // fix de listener duplicado en renderRSVP
  const dupCount = await page.evaluate(() => {
    let calls = 0;
    const el = document.getElementById('rsvp-alergia');
    const orig = el.addEventListener.bind(el);
    el.addEventListener = (...args) => { if (args[0] === 'change') calls++; orig(...args); };
    renderRSVP({ rsvp_activo: true });
    renderRSVP({ rsvp_activo: true });
    return calls;
  });
  console.log('RSVP_NO_DUP_LISTENER', dupCount === 1 ? 'PASS' : 'FAIL', dupCount);

  await browser.close();
})();
```

```bash
cd "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/96380c22-dd4f-4a9a-a76d-4a62c71bb216/scratchpad/pwtest" && node check-task5.js
```

Expected:
```
CLICK_OPENS_PANEL PASS block
CLICK_NO_MOVE PASS { x: 0, y: 0 }
DRAG_STILL_WORKS PASS { x: 0, y: -40 }
RSVP_NO_DUP_LISTENER PASS 1
```

- [ ] **Step 4: Detener el server y commitear**

```bash
taskkill //F //IM python.exe
cd "e:/CLAUDE/WEB CRP/Productivo" && git add invite.html && git commit -m "$(cat <<'EOF'
feat(invite): click en el hero abre el panel de estilo sin romper el drag

endHeroDrag distingue un click real (movimiento menor a 5px, revierte
el micro-jitter y abre el panel de tamano/grosor) de un arrastre
(reposiciona/reordena como antes). Ademas, renderRSVP ya no acumula
listeners de 'change' en cada llamada -- necesario porque el preview
completo (proxima tarea) lo va a llamar en cada refresh del formulario.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `invite.html` (CRP) — preview de todas las secciones + integración de `text_styles`

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\Productivo\invite.html` (función `applyHeroPreview`)

**Interfaces:**
- Consumes: `renderEvento`, `renderLugar`, `renderDresscode`, `renderRegalo`, `renderRSVP`, `renderSpotify` (ya existentes), `applyAllTextStyles` (Task 3).
- Produces: `window.applyHeroPreview(cfg)` ahora renderiza la invitación completa y aplica `cfg.text_styles` — consumido por Task 7 (`CORE/src/admin.html`, que ya lo llama).

- [ ] **Step 1: Extender `applyHeroPreview` para renderizar todas las secciones y aplicar `text_styles`**

Reemplazar:

```js
window.applyHeroPreview = function(c) {
  if (!PREVIEW_MODE) return;
  cfg = c || {};
  renderHero(cfg);
};
```

por:

```js
window.applyHeroPreview = function(c) {
  if (!PREVIEW_MODE) return;
  cfg = c || {};
  renderHero(cfg);
  renderEvento(cfg);
  renderLugar(cfg);
  renderDresscode(cfg);
  renderRegalo(cfg);
  renderRSVP(cfg);
  renderSpotify(cfg);
  applyAllTextStyles(cfg.text_styles);
};
```

- [ ] **Step 2: Levantar el server local y verificar con Playwright que todas las secciones renderizan y que `text_styles` persiste visualmente**

```bash
cd "e:/CLAUDE/WEB CRP/Productivo" && python -m http.server 8090
```

Crear `C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/96380c22-dd4f-4a9a-a76d-4a62c71bb216/scratchpad/pwtest/check-task6.js`:

```js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  await page.goto('http://localhost:8090/invite.html?preview=1');
  await page.waitForFunction(() => typeof window.applyHeroPreview === 'function');

  const fullCfg = {
    tipo: 'casamiento', novios: 'Fale & Nico', fecha_display: '06.03.2027',
    subtitulo_html: 'Nos casamos', presentacion: 'Los esperamos con mucha alegria',
    lugar_nombre: 'Salon Estrella', lugar_direccion: 'Av. Siempre Viva 123',
    dresscode: 'Formal', alias_mp: 'faleynico.mp', rsvp_activo: true,
    spotify_url: 'https://open.spotify.com/playlist/abc123',
    text_styles: { 'lugar-nombre': { size: 130, weight: 600 } }
  };
  await page.evaluate((c) => window.applyHeroPreview(c), fullCfg);

  const evTitle = await page.evaluate(() => document.getElementById('ev-title').textContent);
  const lugarNombre = await page.evaluate(() => document.getElementById('lugar-nombre').textContent);
  const dresscodeVal = await page.evaluate(() => document.getElementById('dresscode-val').textContent);
  const spotifyDisplay = await page.evaluate(() => getComputedStyle(document.getElementById('spotify')).display);
  console.log('EV_TITLE_RENDERED', evTitle.includes('Nos casamos') ? 'PASS' : 'FAIL', evTitle);
  console.log('LUGAR_RENDERED', lugarNombre === 'Salon Estrella' ? 'PASS' : 'FAIL', lugarNombre);
  console.log('DRESSCODE_RENDERED', dresscodeVal === 'Formal' ? 'PASS' : 'FAIL', dresscodeVal);
  console.log('SPOTIFY_VISIBLE', spotifyDisplay !== 'none' ? 'PASS' : 'FAIL', spotifyDisplay);

  const lugarScale = await page.evaluate(() => document.getElementById('lugar-nombre').style.getPropertyValue('--ts-scale'));
  const lugarWeight = await page.evaluate(() => getComputedStyle(document.getElementById('lugar-nombre')).fontWeight);
  console.log('TEXT_STYLE_APPLIED_ON_LOAD', (lugarScale === '1.3' && lugarWeight === '600') ? 'PASS' : 'FAIL', lugarScale, lugarWeight);

  // click en un bloque que ahora SI tiene contenido real (antes de esta tarea estaba vacio)
  await page.evaluate(() => document.getElementById('lugar-dir').click());
  const panelTitle = await page.evaluate(() => document.getElementById('ts-panel-title').textContent);
  console.log('CLICK_ON_RENDERED_BLOCK', panelTitle === 'Dónde — Dirección' ? 'PASS' : 'FAIL', panelTitle);

  await browser.close();
})();
```

```bash
cd "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/96380c22-dd4f-4a9a-a76d-4a62c71bb216/scratchpad/pwtest" && node check-task6.js
```

Expected: las 6 líneas con `PASS`.

- [ ] **Step 3: Confirmar que el modo producción (sin `?preview=1`) sigue funcionando igual que antes**

```bash
node -e "console.log(encodeURIComponent(Buffer.from(JSON.stringify({novios:'Fale & Nico',fecha_display:'06.03.2027',tipo:'casamiento',lugar_nombre:'Salon Estrella'})).toString('base64')))" > "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/96380c22-dd4f-4a9a-a76d-4a62c71bb216/scratchpad/cfg64.txt"
```

```bash
npx --yes playwright screenshot --viewport-size=500,1400 --wait-for-timeout=1000 \
  "http://localhost:8090/invite.html?c=$(cat "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/96380c22-dd4f-4a9a-a76d-4a62c71bb216/scratchpad/cfg64.txt")" \
  "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/96380c22-dd4f-4a9a-a76d-4a62c71bb216/scratchpad/task6-prod-check.png"
```

Expected: la portada y la sección "Dónde" renderizan con texto legible, tamaño normal (sin escalas raras), sin panel ni cursores de arrastre visibles. Revisar la imagen con `Read`.

- [ ] **Step 4: Detener el server y commitear**

```bash
taskkill //F //IM python.exe
cd "e:/CLAUDE/WEB CRP/Productivo" && git add invite.html && git commit -m "$(cat <<'EOF'
feat(invite): preview completo de todas las secciones + text_styles

applyHeroPreview ahora llama a los 7 render* (antes solo renderHero)
y aplica cfg.text_styles, para que el editor visual del admin pueda
mostrar y hacer clickeable cualquier seccion, no solo el hero.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `CORE/src/admin.html` — editor unificado (config completa + persistencia de `text_styles`)

**Files:**
- Modify: `e:\CLAUDE\CORE\src\admin.html` (HTML del popup ~líneas 719-721, 1017-1031; JS ~líneas 6434-6470, 6483-6539, 6844-6935)

**Interfaces:**
- Consumes: `window.applyHeroPreview(cfg)` con la firma extendida de Task 6 (ahora también acepta `tipo`, `subtitulo_html`, `presentacion`, `ceremonia_*`, `recepcion_*`, `fin_fiesta_hora`, `lugar_*`, `dresscode*`, `alias_*`, `cbu`, `rsvp_*`, `spotify_url`, `regalo_*`, `text_styles`) y el evento `textstyleschange` (Task 4).
- Produces: `text_styles` dentro del objeto devuelto por `readInviteForm()`.

- [ ] **Step 1: Renombrar el botón que abre el popup**

Reemplazar:

```html
              <button type="button" class="btn-sm" onclick="openHeroPopup()">✎ Editar posición</button>
```

por:

```html
              <button type="button" class="btn-sm" onclick="openHeroPopup()">✎ Editor visual</button>
```

- [ ] **Step 2: Renombrar el título y el texto de ayuda del popup**

Reemplazar:

```html
          <div class="modal-header">
            <span>Posición del Texto en Portada</span>
            <button class="modal-close" onclick="closeHeroPopup()">✕</button>
          </div>
          <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;align-items:center">
            <div style="font-size:11px;color:var(--gray2);margin-bottom:14px;line-height:1.6;text-align:center;max-width:340px">Arrastrá los textos para reposicionarlos y reordenarlos (arriba/medio/abajo). Rueda del mouse sobre un texto = ajuste fino.</div>
```

por:

```html
          <div class="modal-header">
            <span>Editor visual de la invitación</span>
            <button class="modal-close" onclick="closeHeroPopup()">✕</button>
          </div>
          <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;align-items:center">
            <div style="font-size:11px;color:var(--gray2);margin-bottom:14px;line-height:1.6;text-align:center;max-width:340px">Arrastrá los textos de la portada para reposicionarlos y reordenarlos. Rueda del mouse = ajuste fino. Click en cualquier texto de la invitación (incluida la portada) abre un panel para cambiar su tamaño y grosor.</div>
```

- [ ] **Step 3: Extender `buildHeroPreviewCfg` (renombrada `buildInvitePreviewCfg`) con todos los campos de las demás secciones + `text_styles`**

Reemplazar:

```js
function buildHeroPreviewCfg() {
  return {
    formato: document.getElementById('inv-formato').value,
    tipo: document.getElementById('inv-tipo').value,
    novios: document.getElementById('inv-novios').value.trim(),
    titulo: document.getElementById('inv-titulo').value.trim(),
    fecha_display: document.getElementById('inv-fecha-display').value.trim(),
    fecha_iso: document.getElementById('inv-fecha-iso').value,
    media_url: document.getElementById('inv-media-url').value.trim(),
    media_type: document.getElementById('inv-media-type').value,
    color_esquema: document.getElementById('inv-color-esquema').value,
    wedding_script: document.getElementById('inv-wedding-script').value.trim(),
    wedding_fx: document.getElementById('inv-wedding-fx').value,
    hero_layout: _heroLayout
  };
}

function refreshHeroPreview() {
  const iframe = document.getElementById('inv-hero-preview');
  if (!iframe || !iframe.contentWindow || !iframe.contentWindow.applyHeroPreview) return;
  iframe.contentWindow.applyHeroPreview(buildHeroPreviewCfg());
}
```

por:

```js
function buildInvitePreviewCfg() {
  return {
    formato: document.getElementById('inv-formato').value,
    tipo: document.getElementById('inv-tipo').value,
    novios: document.getElementById('inv-novios').value.trim(),
    titulo: document.getElementById('inv-titulo').value.trim(),
    fecha_display: document.getElementById('inv-fecha-display').value.trim(),
    fecha_iso: document.getElementById('inv-fecha-iso').value,
    media_url: document.getElementById('inv-media-url').value.trim(),
    media_type: document.getElementById('inv-media-type').value,
    color_esquema: document.getElementById('inv-color-esquema').value,
    wedding_script: document.getElementById('inv-wedding-script').value.trim(),
    wedding_fx: document.getElementById('inv-wedding-fx').value,
    subtitulo_html: document.getElementById('inv-subtitulo').value.trim(),
    presentacion: document.getElementById('inv-presentacion').value.trim(),
    ceremonia_hora: document.getElementById('inv-ceremonia-hora').value.trim(),
    ceremonia_lugar: document.getElementById('inv-ceremonia-lugar').value.trim(),
    ceremonia_direccion: document.getElementById('inv-ceremonia-dir').value.trim(),
    recepcion_hora: document.getElementById('inv-recepcion-hora').value.trim(),
    fin_fiesta_hora: document.getElementById('inv-fin-fiesta-hora').value.trim(),
    lugar_nombre: document.getElementById('inv-lugar-nombre').value.trim(),
    lugar_direccion: document.getElementById('inv-lugar-dir').value.trim(),
    lugar_maps: document.getElementById('inv-lugar-maps').value.trim(),
    dresscode: document.getElementById('inv-dresscode').value.trim(),
    dresscode_nota: document.getElementById('inv-dresscode-nota').value.trim(),
    alias_mp: document.getElementById('inv-alias').value.trim(),
    alias_banco: document.getElementById('inv-alias-banco').value.trim(),
    alias_titular: document.getElementById('inv-alias-titular').value.trim(),
    cbu: document.getElementById('inv-cbu').value.trim(),
    rsvp_activo: document.getElementById('inv-rsvp-activo').checked,
    rsvp_limite: document.getElementById('inv-rsvp-limite').value,
    spotify_url: document.getElementById('inv-spotify').value.trim(),
    regalo_label: document.getElementById('inv-regalo-label').value.trim(),
    regalo_titulo: document.getElementById('inv-regalo-titulo').value.trim(),
    regalo_texto: document.getElementById('inv-regalo-texto').value.trim(),
    hero_layout: _heroLayout,
    text_styles: _textStyles
  };
}

function refreshHeroPreview() {
  const iframe = document.getElementById('inv-hero-preview');
  if (!iframe || !iframe.contentWindow || !iframe.contentWindow.applyHeroPreview) return;
  iframe.contentWindow.applyHeroPreview(buildInvitePreviewCfg());
}
```

- [ ] **Step 4: Agregar `_textStyles`, extender los campos observados y el listener del iframe**

Reemplazar:

```js
// ── HERO PREVIEW (arrastre/reorden/rueda) ──
let _heroLayout = null;
let _heroPreviewDebounce = null;
let _heroPreviewListenersBound = false;
const HERO_PREVIEW_WATCH_FIELDS = ['inv-novios', 'inv-titulo', 'inv-fecha-display', 'inv-media-url',
  'inv-wedding-script', 'inv-formato', 'inv-color-esquema', 'inv-wedding-fx', 'inv-media-type', 'inv-tipo'];
```

por:

```js
// ── HERO PREVIEW (arrastre/reorden/rueda) ──
let _heroLayout = null;
let _textStyles = null;
let _heroPreviewDebounce = null;
let _heroPreviewListenersBound = false;
const HERO_PREVIEW_WATCH_FIELDS = ['inv-novios', 'inv-titulo', 'inv-fecha-display', 'inv-media-url',
  'inv-wedding-script', 'inv-formato', 'inv-color-esquema', 'inv-wedding-fx', 'inv-media-type', 'inv-tipo',
  'inv-subtitulo', 'inv-presentacion', 'inv-ceremonia-hora', 'inv-ceremonia-lugar', 'inv-ceremonia-dir',
  'inv-recepcion-hora', 'inv-fin-fiesta-hora', 'inv-lugar-nombre', 'inv-lugar-dir', 'inv-lugar-maps',
  'inv-dresscode', 'inv-dresscode-nota', 'inv-alias', 'inv-alias-banco', 'inv-alias-titular', 'inv-cbu',
  'inv-rsvp-activo', 'inv-rsvp-limite', 'inv-spotify', 'inv-regalo-label', 'inv-regalo-titulo', 'inv-regalo-texto'];
```

Reemplazar:

```js
function initHeroPreviewIframe() {
  bindHeroPreviewFieldListeners();
  const iframe = document.getElementById('inv-hero-preview');
  iframe.onload = () => {
    iframe.contentWindow.addEventListener('herolayoutchange', e => { _heroLayout = e.detail; });
    refreshHeroPreview();
  };
  iframe.src = getInvBaseUrl() + '?preview=1&_=' + Date.now();
}
```

por:

```js
function initHeroPreviewIframe() {
  bindHeroPreviewFieldListeners();
  const iframe = document.getElementById('inv-hero-preview');
  iframe.onload = () => {
    iframe.contentWindow.addEventListener('herolayoutchange', e => { _heroLayout = e.detail; });
    iframe.contentWindow.addEventListener('textstyleschange', e => { _textStyles = e.detail; });
    refreshHeroPreview();
  };
  iframe.src = getInvBaseUrl() + '?preview=1&_=' + Date.now();
}
```

- [ ] **Step 5: Inicializar `_textStyles` al abrir el modal (edición y nueva invitación)**

Reemplazar:

```js
    _heroLayout = resolveHeroLayoutFromConfig(c);
    initHeroPreviewIframe();
    invSetMode(c.tipo === 'save_the_date' ? 'save_the_date' : 'invitacion');
```

por:

```js
    _heroLayout = resolveHeroLayoutFromConfig(c);
    _textStyles = c.text_styles || {};
    initHeroPreviewIframe();
    invSetMode(c.tipo === 'save_the_date' ? 'save_the_date' : 'invitacion');
```

Reemplazar:

```js
    _heroLayout = defaultHeroLayout(0, 0);
    initHeroPreviewIframe();
    ['inv-media-preview-img','inv-media-preview-vid'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
```

por:

```js
    _heroLayout = defaultHeroLayout(0, 0);
    _textStyles = {};
    initHeroPreviewIframe();
    ['inv-media-preview-img','inv-media-preview-vid'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
```

- [ ] **Step 6: Guardar `text_styles` en `readInviteForm()`**

Reemplazar:

```js
      hero_layout: _heroLayout || defaultHeroLayout(0, 0)
    },
    slug: document.getElementById('inv-slug').value.trim() || toSlug(document.getElementById('inv-novios').value.trim()) || 'invitacion'
```

por:

```js
      hero_layout: _heroLayout || defaultHeroLayout(0, 0),
      text_styles: _textStyles || {}
    },
    slug: document.getElementById('inv-slug').value.trim() || toSlug(document.getElementById('inv-novios').value.trim()) || 'invitacion'
```

- [ ] **Step 7: Confirmar que no queda ninguna referencia colgante a `buildHeroPreviewCfg`**

```bash
grep -n "buildHeroPreviewCfg" "e:/CLAUDE/CORE/src/admin.html"
```

Expected: sin resultados (0 matches) — todas las referencias deben decir `buildInvitePreviewCfg`.

- [ ] **Step 8: Rebuild de ambos brands**

```bash
cd "e:/CLAUDE/CORE" && node build-admin.cjs
```

Expected:
```
  → WEB KUERRE/Productivo/admin.html
  → WEB KUERRE/Desarrollo/admin.html
✅ kuerre built (2 files)
  → WEB CRP/Productivo/admin.html
  → WEB CRP/Desarrollo/admin.html
✅ crp built (2 files)
```

- [ ] **Step 9: Verificar que el build generó el iframe y las funciones nuevas en ambos brands**

```bash
grep -c "buildInvitePreviewCfg\|textstyleschange\|inv-hero-preview" "e:/CLAUDE/WEB CRP/Productivo/admin.html" "e:/CLAUDE/WEB KUERRE/Productivo/admin.html"
```

Expected: al menos 1 match de cada patrón en cada archivo.

- [ ] **Step 10: Commit**

```bash
cd "e:/CLAUDE/CORE" && git add src/admin.html && git commit -m "$(cat <<'EOF'
feat(admin): editor visual unificado (posicion del hero + tamano/grosor)

El popup "Editor visual" ahora arma la config completa del formulario
(no solo los campos del hero) para que el preview pueda renderizar y
hacer clickeable cualquier seccion de la invitacion. Escucha el nuevo
evento textstyleschange y persiste text_styles en readInviteForm().
buildHeroPreviewCfg se renombra a buildInvitePreviewCfg (ya no arma
solo el hero). Afecta a CRP y Kuerre (admin.html compartido via CORE).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Verificación manual guiada (WEB CRP) + reporte al usuario

**Files:** ninguno nuevo — corre contra `WEB CRP/Productivo` ya buildeado.

- [ ] **Step 1: Servir `WEB CRP/Productivo` localmente**

```bash
cd "e:/CLAUDE/WEB CRP/Productivo" && python -m http.server 8090
```

- [ ] **Step 2: Verificación manual en el navegador (requiere login real — no automatizable sin credenciales)**

1. Abrir `http://localhost:8090/admin.html`, loguearse, ir a Invitaciones.
2. Editar una invitación existente con datos en varias secciones (o crear una nueva y completar Cuándo/Dónde/Dresscode/Regalo/RSVP/Spotify).
3. Click en "✎ Editor visual" → confirmar que el popup muestra el hero y, al scrollear dentro del iframe, las demás secciones con contenido real.
4. Arrastrar un bloque del hero (ej. fecha por encima de nombres) → confirmar que sigue reordenando como antes.
5. Click (sin arrastrar) sobre el bloque de nombres del hero → confirmar que abre el panel de tamaño/grosor (y no movió el texto).
6. Scrollear a "Dónde" dentro del iframe, click en el nombre del lugar → mover el slider de tamaño y probar los 4 botones de grosor → confirmar cambio en vivo.
7. Click en "Restablecer" → confirmar que vuelve al tamaño/grosor original.
8. Guardar la invitación, reabrirla (Editar) → confirmar que el preview abre con los mismos tamaños/grosores dejados.
9. Abrir el link real de esa invitación (fuera del admin, sin `?preview=1`) → confirmar que los tamaños/grosores se ven aplicados y que no hay panel, cursores de arrastre, ni reacciones al click/mouse para el invitado.
10. Abrir una invitación creada antes de este cambio (sin `text_styles` guardado) → confirmar que se ve exactamente igual que antes (sin escalas ni pesos inesperados).

- [ ] **Step 3: Detener el server**

```bash
taskkill //F //IM python.exe
```

- [ ] **Step 4: Reportar al usuario antes de empujar (push)**

No hacer `git push` en ningún repo todavía — informar qué se verificó (los 10 puntos del Step 2) y esperar confirmación explícita del usuario ("subilo") antes de subir.

---

## Self-Review

**Spec coverage:**
- Reuso del iframe existente para posición + estilo → Task 7 (popup unificado, `buildInvitePreviewCfg`).
- Modelo `text_styles` independiente de `hero_layout` → Task 3.
- Escala responsive vía `calc(...*var(--ts-scale,1))` → Task 1.
- 16 bloques editables, 5 ids nuevos → Task 2, `TEXT_STYLE_IDS` en Task 3.
- 4 opciones de grosor + fix de fuente Montserrat 600 → Task 1 (fuente), Task 4 (botones).
- Click-vs-drag en el hero (umbral 5px) → Task 5.
- Persistencia (`readInviteForm`, migración implícita al no tener `text_styles`) → Task 7.
- Verificación de que el invitado real no ve nada de esto → Task 6 Step 3, Task 8 Step 2.10.
- Fuera de alcance (Kuerre, invite-social, labels chicos/botones/footer) → respetado en todos los tasks (ningún task toca esos archivos/elementos).

**Placeholder scan:** sin TBD/TODO; todos los steps traen código completo o comandos exactos con output esperado.

**Type/naming consistency:** `TEXT_STYLE_IDS` (Task 3) se usa igual en Task 4 y Task 6; `applyTextStyle`/`applyAllTextStyles` (Task 3) consumidos sin cambio de firma en Task 4/6; `buildHeroPreviewCfg` → `buildInvitePreviewCfg` renombrado de forma consistente en todo Task 7 (declaración + único call site en `refreshHeroPreview`); `_textStyles` inicializado en ambos branches de `openInviteModal` (edición y nueva) antes de usarse en `readInviteForm`.
