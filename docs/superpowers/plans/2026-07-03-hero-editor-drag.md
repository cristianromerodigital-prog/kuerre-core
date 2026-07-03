# Editor visual de portada (drag + reorder) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los botones de flecha para posicionar el texto de la portada de la invitación por un editor visual en vivo (iframe same-origin) donde se puede arrastrar cada uno de los 3 bloques de texto (nombres, título/script, fecha) para reordenarlos y reposicionarlos, con ajuste fino por rueda del mouse.

**Architecture:** `invite.html` gana un modo `?preview=1` que expone `applyHeroPreview(cfg)`/`getHeroLayout()` y un evento `herolayoutchange`; el admin (`CORE/src/admin.html`, compartido por CRP y Kuerre) embebe ese `invite.html` en un iframe same-origin y accede a su DOM directamente (sin `postMessage`) para pintar cambios y escuchar el resultado del arrastre. El modelo de datos `hero_layout {order, pos}` reemplaza a `hero_text_x/y`, con migración automática de invitaciones viejas.

**Tech Stack:** Vanilla HTML/CSS/JS (sin build, sin framework). Verificación manual/con Playwright CLI vía `npx playwright` (sin test framework en el repo).

## Global Constraints

- No romper el render de producción (invitado real) de ninguno de los 2 brands (CRP, Kuerre) — los handlers de arrastre solo se activan con `?preview=1`.
- `admin.html` es un único archivo fuente en `CORE/src/admin.html`, buildeado para ambos brands vía `node build-admin.cjs` — todo cambio ahí impacta a los dos.
- El countdown (`#countdown`) no se reordena ni se arrastra — siempre queda último.
- Invitaciones ya guardadas con `hero_text_x/y` (legacy) deben verse igual que antes tras este cambio (migración implícita a `hero_layout`).
- Sin `package.json`/test runner en `WEB CRP` ni `WEB KUERRE` — la verificación es vía navegador real (Playwright CLI / server local), no unit tests.

---

### Task 1: `invite.html` (CRP) — modelo de datos `hero_layout` + integración en `renderHero`

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\Productivo\invite.html`

**Interfaces:**
- Produces: `HERO_BLOCK_IDS` (array `['eyebrow','names','date']`), `resolveHeroLayout(c)`, `applyHeroLayout(layout)`, module-level `heroLayout` variable — consumidos por Task 2 (misma sección del archivo) y por el render de producción existente.

- [ ] **Step 1: Editar el CSS de `#hero-content` y `#countdown` para permitir reordenar por flex `order`**

En `e:\CLAUDE\WEB CRP\Productivo\invite.html`, reemplazar:

```css
#hero-content{position:relative;z-index:2;padding:0 24px}
```

por:

```css
#hero-content{position:relative;z-index:2;padding:0 24px;display:flex;flex-direction:column;align-items:center}
```

Y reemplazar:

```css
#countdown{display:flex;gap:32px;justify-content:center;margin-top:36px}
```

por:

```css
#countdown{display:flex;gap:32px;justify-content:center;margin-top:36px;order:99}
```

(El `order:99` garantiza que el countdown quede siempre último sin importar cómo se reordenen los otros 3 bloques.)

- [ ] **Step 2: Agregar las funciones de modelo de datos antes de `renderHero`**

Insertar el siguiente bloque nuevo inmediatamente antes de la línea `function renderHero(c) {`:

```js
const HERO_BLOCK_IDS = ['eyebrow', 'names', 'date'];
let heroLayout = null;

function defaultHeroLayout(tx, ty) {
  return {
    order: ['eyebrow', 'names', 'date'],
    pos: { eyebrow: { x: tx, y: ty }, names: { x: tx, y: ty }, date: { x: tx, y: ty } }
  };
}

function resolveHeroLayout(c) {
  if (c.hero_layout && Array.isArray(c.hero_layout.order) && c.hero_layout.pos) return c.hero_layout;
  return defaultHeroLayout(c.hero_text_x || 0, c.hero_text_y || 0);
}

function applyHeroLayout(layout) {
  HERO_BLOCK_IDS.forEach((id, i) => {
    const el = document.getElementById('hero-' + id);
    if (!el) return;
    const ord = layout.order.indexOf(id);
    el.style.order = ord === -1 ? i : ord;
    const p = layout.pos[id] || { x: 0, y: 0 };
    el.style.transform = (p.x || p.y) ? `translate(${p.x}px,${p.y}px)` : '';
  });
}

```

- [ ] **Step 3: Usar `resolveHeroLayout`/`applyHeroLayout` dentro de `renderHero` en lugar del offset único**

Dentro de `function renderHero(c) { ... }`, reemplazar:

```js
  const hc = document.getElementById('hero-content');
  const tx = c.hero_text_x || 0, ty = c.hero_text_y || 0;
  hc.style.transform = (tx || ty) ? `translate(${tx}px,${ty}px)` : '';
```

por:

```js
  heroLayout = resolveHeroLayout(c);
  applyHeroLayout(heroLayout);
```

- [ ] **Step 4: Levantar un server local y verificar con una config de `hero_layout` custom**

```bash
cd "e:/CLAUDE/WEB CRP/Productivo" && python -m http.server 8090
```

En otra terminal, generar una config de prueba que invierte el orden por defecto (fecha arriba, nombres al medio, eyebrow abajo) con un offset distinto por bloque:

```bash
node -e "
const cfg = {
  novios: 'Fale & Nico', fecha_display: '06.03.2027', tipo: 'casamiento',
  hero_layout: {
    order: ['date','names','eyebrow'],
    pos: { eyebrow: {x:0,y:40}, names: {x:0,y:0}, date: {x:0,y:-40} }
  }
};
console.log(encodeURIComponent(Buffer.from(JSON.stringify(cfg)).toString('base64')));
"
```

Copiar el string de salida y abrir con Playwright CLI (ya usado en este proyecto — no requiere instalar nada nuevo si `npx playwright install chromium` ya corrió antes):

```bash
npx --yes playwright screenshot --viewport-size=500,900 --wait-for-timeout=1500 \
  "http://localhost:8090/invite.html?c=<PEGAR_STRING_AQUI>" \
  "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/4bfbd4c6-e234-44a9-b9b6-0536ed1fe84b/scratchpad/task1-check.png"
```

Expected: en el screenshot, "06.03.2027" aparece arriba de "Fale & Nico", y "FALE & NICO" (eyebrow) aparece abajo de todo — confirma que `order` custom se respetó. Revisar la imagen con la tool `Read`.

- [ ] **Step 5: Commit**

```bash
cd "e:/CLAUDE/WEB CRP/Productivo" && git add invite.html && git commit -m "$(cat <<'EOF'
feat(invite): modelo hero_layout (orden + posicion por bloque) en CRP

Reemplaza el offset unico hero_text_x/y por hero_layout{order,pos},
con migracion automatica de invitaciones legacy. Aun sin interaccion
de mouse (arrastre) — eso va en el siguiente commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `invite.html` (CRP) — modo preview + arrastre/reorden/rueda del mouse

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\Productivo\invite.html`

**Interfaces:**
- Consumes: `HERO_BLOCK_IDS`, `resolveHeroLayout`, `applyHeroLayout`, `heroLayout` (de Task 1).
- Produces: `window.applyHeroPreview(cfg)`, `window.getHeroLayout()`, evento DOM `herolayoutchange` (detail = `{order,pos}`) — consumidos por Task 4 (admin.html) vía `iframe.contentWindow`.

- [ ] **Step 1: Detectar el modo preview**

Reemplazar:

```js
const CF_URL_INV = CONFIG.CF_URL; // alias para compatibilidad
```

por:

```js
const CF_URL_INV = CONFIG.CF_URL; // alias para compatibilidad
const PREVIEW_MODE = new URLSearchParams(location.search).get('preview') === '1';
```

- [ ] **Step 2: Agregar las funciones de interacción (arrastre, reorden, rueda) después del bloque de Task 1**

Insertar este bloque nuevo inmediatamente después de la función `applyHeroLayout` (agregada en Task 1) y antes de `function renderHero(c) {`:

```js
window.applyHeroPreview = function(c) {
  if (!PREVIEW_MODE) return;
  cfg = c || {};
  renderHero(cfg);
};

window.getHeroLayout = function() {
  return heroLayout ? JSON.parse(JSON.stringify(heroLayout)) : null;
};

let heroDrag = null;
let heroWheelTimer = null;

function initHeroPreviewInteractions() {
  HERO_BLOCK_IDS.forEach(id => {
    const el = document.getElementById('hero-' + id);
    if (!el) return;
    el.style.cursor = 'grab';
    el.addEventListener('mousedown', e => startHeroDrag(e, id));
    el.addEventListener('wheel', e => wheelHeroNudge(e, id), { passive: false });
  });
  document.addEventListener('mousemove', onHeroDragMove);
  document.addEventListener('mouseup', endHeroDrag);
}

function startHeroDrag(e, id) {
  e.preventDefault();
  const p = heroLayout.pos[id] || { x: 0, y: 0 };
  heroDrag = { id, startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y };
  document.getElementById('hero-' + id).style.cursor = 'grabbing';
}

function onHeroDragMove(e) {
  if (!heroDrag) return;
  const dx = e.clientX - heroDrag.startX;
  const dy = e.clientY - heroDrag.startY;
  heroLayout.pos[heroDrag.id] = { x: heroDrag.origX + dx, y: heroDrag.origY + dy };
  applyHeroLayout(heroLayout);
  checkHeroReorder(heroDrag.id);
}

function checkHeroReorder(draggedId) {
  const draggedEl = document.getElementById('hero-' + draggedId);
  const draggedRect = draggedEl.getBoundingClientRect();
  const draggedMid = draggedRect.top + draggedRect.height / 2;
  HERO_BLOCK_IDS.filter(id => id !== draggedId).forEach(otherId => {
    const otherEl = document.getElementById('hero-' + otherId);
    const r = otherEl.getBoundingClientRect();
    const otherMid = r.top + r.height / 2;
    const draggedOrder = heroLayout.order.indexOf(draggedId);
    const otherOrder = heroLayout.order.indexOf(otherId);
    const shouldSwap = (draggedOrder < otherOrder && draggedMid > otherMid) ||
                        (draggedOrder > otherOrder && draggedMid < otherMid);
    if (shouldSwap) {
      heroLayout.order[draggedOrder] = otherId;
      heroLayout.order[otherOrder] = draggedId;
      applyHeroLayout(heroLayout);
    }
  });
}

function endHeroDrag() {
  if (!heroDrag) return;
  document.getElementById('hero-' + heroDrag.id).style.cursor = 'grab';
  heroDrag = null;
  emitHeroLayoutChange();
}

function wheelHeroNudge(e, id) {
  e.preventDefault();
  const p = heroLayout.pos[id] || { x: 0, y: 0 };
  const dy = e.deltaY > 0 ? 2 : -2;
  heroLayout.pos[id] = { x: p.x, y: p.y + dy };
  applyHeroLayout(heroLayout);
  clearTimeout(heroWheelTimer);
  heroWheelTimer = setTimeout(emitHeroLayoutChange, 150);
}

function emitHeroLayoutChange() {
  window.dispatchEvent(new CustomEvent('herolayoutchange', { detail: JSON.parse(JSON.stringify(heroLayout)) }));
}

```

- [ ] **Step 3: Ramificar `init()` para el modo preview**

Reemplazar el comienzo de `init()`:

```js
async function init() {
  if (!cfg) cfg = await parseConfig();
  if (!cfg) {
    document.getElementById('placeholder').style.display = 'flex';
    return;
  }
```

por:

```js
async function init() {
  if (PREVIEW_MODE) {
    cfg = {};
    document.body.style.userSelect = 'none';
    renderHero(cfg);
    document.getElementById('invite-app').style.display = 'block';
    initHeroPreviewInteractions();
    return;
  }
  if (!cfg) cfg = await parseConfig();
  if (!cfg) {
    document.getElementById('placeholder').style.display = 'flex';
    return;
  }
```

- [ ] **Step 4: Instalar Playwright localmente para poder simular mouse (drag/wheel) con aserciones programáticas**

```bash
mkdir -p "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/4bfbd4c6-e234-44a9-b9b6-0536ed1fe84b/scratchpad/pwtest"
cd "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/4bfbd4c6-e234-44a9-b9b6-0536ed1fe84b/scratchpad/pwtest" && npm init -y && npm install playwright
```

Expected: instala sin volver a descargar Chromium (ya está en caché de una instalación previa de `npx playwright install chromium` en este entorno).

- [ ] **Step 5: Escribir y correr el script de verificación de arrastre/reorden/rueda**

Crear `C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/4bfbd4c6-e234-44a9-b9b6-0536ed1fe84b/scratchpad/pwtest/check.js`:

```js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
  await page.goto('http://localhost:8090/invite.html?preview=1');
  await page.waitForFunction(() => typeof window.applyHeroPreview === 'function');

  await page.evaluate(() => {
    window.applyHeroPreview({
      formato: 'wedding', novios: 'Fale & Nico', fecha_display: '06.03.2027',
      wedding_script: 'The Wedding', wedding_fx: 'glow', color_esquema: 'negro'
    });
  });

  const dateBox = await page.locator('#hero-date').boundingBox();
  const namesBox = await page.locator('#hero-names').boundingBox();
  await page.mouse.move(dateBox.x + dateBox.width / 2, dateBox.y + dateBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dateBox.x + dateBox.width / 2, namesBox.y - 10, { steps: 10 });
  await page.mouse.up();

  const layoutAfterDrag = await page.evaluate(() => window.getHeroLayout());
  const reorderOk = layoutAfterDrag.order.indexOf('date') < layoutAfterDrag.order.indexOf('names');
  console.log('REORDER', reorderOk ? 'PASS' : 'FAIL', layoutAfterDrag.order);

  await page.hover('#hero-eyebrow');
  await page.mouse.wheel(0, 5);
  await page.waitForTimeout(250);
  const layoutAfterWheel = await page.evaluate(() => window.getHeroLayout());
  const wheelOk = layoutAfterWheel.pos.eyebrow.y === 2;
  console.log('WHEEL', wheelOk ? 'PASS' : 'FAIL', layoutAfterWheel.pos.eyebrow);

  await browser.close();
  if (!reorderOk || !wheelOk) process.exit(1);
})();
```

Con el server del Task 1 todavía corriendo en `localhost:8090`, correr:

```bash
cd "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/4bfbd4c6-e234-44a9-b9b6-0536ed1fe84b/scratchpad/pwtest" && node check.js
```

Expected output:
```
REORDER PASS [ 'date', ... ]
WHEEL PASS { x: 0, y: 2 }
```

Si `REORDER FAIL`: revisar `checkHeroReorder` — el drag no cruzó el punto medio (aumentar el desplazamiento en `page.mouse.move`). Si `WHEEL FAIL`: confirmar que `wheelHeroNudge` está atado (`initHeroPreviewInteractions` se llamó) y que el signo de `deltaY` coincide con lo esperado.

- [ ] **Step 6: Confirmar que el modo producción (sin `?preview=1`) no registra listeners de arrastre**

```bash
npx --yes playwright screenshot --viewport-size=500,900 --wait-for-timeout=1000 \
  "http://localhost:8090/invite.html?c=$(node -e "console.log(encodeURIComponent(Buffer.from(JSON.stringify({novios:'Fale & Nico',fecha_display:'06.03.2027'})).toString('base64')))")" \
  "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/4bfbd4c6-e234-44a9-b9b6-0536ed1fe84b/scratchpad/task2-prod-check.png"
```

Expected: la portada renderiza normalmente (sin cursor `grab`, sin cambios visuales) — confirma que `initHeroPreviewInteractions()` solo corre bajo `PREVIEW_MODE`.

- [ ] **Step 7: Detener el server local y commitear**

```bash
taskkill //F //IM python.exe
cd "e:/CLAUDE/WEB CRP/Productivo" && git add invite.html && git commit -m "$(cat <<'EOF'
feat(invite): modo preview con arrastre, reorden y ajuste por rueda

?preview=1 activa applyHeroPreview()/getHeroLayout() y el evento
herolayoutchange que el admin va a consumir via iframe same-origin.
Cero impacto en el render que ve un invitado real.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Portar el mismo modelo a `invite.html` (Kuerre)

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\Desarrollo\invite.html`
- Copy result to: `e:\CLAUDE\WEB KUERRE\Productivo\invite.html`

**Interfaces:** Igual contrato que Task 1+2 (`resolveHeroLayout`, `applyHeroLayout`, `window.applyHeroPreview`, `window.getHeroLayout`, evento `herolayoutchange`) — Kuerre no tiene el branching `formato === 'wedding'` de CRP, así que `renderHero` es más simple (sin ese `if/else`), pero la integración es la misma.

- [ ] **Step 1: Confirmar que Desarrollo y Productivo están sincronizados antes de editar**

```bash
diff "e:/CLAUDE/WEB KUERRE/Desarrollo/invite.html" "e:/CLAUDE/WEB KUERRE/Productivo/invite.html" && echo IDENTICAL
```

Expected: `IDENTICAL`. Si difieren, parar y avisar — puede haber trabajo sin sincronizar en Productivo que no debe pisarse.

- [ ] **Step 2: CSS — mismo cambio que Task 1 Step 1, en `WEB KUERRE/Desarrollo/invite.html`**

Reemplazar:

```css
#hero-content{position:relative;z-index:2;padding:0 24px}
```

por:

```css
#hero-content{position:relative;z-index:2;padding:0 24px;display:flex;flex-direction:column;align-items:center}
```

Reemplazar:

```css
#countdown{display:flex;gap:32px;justify-content:center;margin-top:36px}
```

por:

```css
#countdown{display:flex;gap:32px;justify-content:center;margin-top:36px;order:99}
```

- [ ] **Step 3: Agregar `PREVIEW_MODE` después de `CF_URL_INV`**

Reemplazar:

```js
const CF_URL_INV = CONFIG.CF_URL; // alias para compatibilidad
```

por:

```js
const CF_URL_INV = CONFIG.CF_URL; // alias para compatibilidad
const PREVIEW_MODE = new URLSearchParams(location.search).get('preview') === '1';
```

- [ ] **Step 4: Insertar el mismo bloque de modelo de datos + interacción de Task 1 Step 2 y Task 2 Step 2, antes de `function renderHero(c) {`**

Insertar (idéntico a lo agregado en CRP — mismo texto exacto, ids de bloque compartidos):

```js
const HERO_BLOCK_IDS = ['eyebrow', 'names', 'date'];
let heroLayout = null;

function defaultHeroLayout(tx, ty) {
  return {
    order: ['eyebrow', 'names', 'date'],
    pos: { eyebrow: { x: tx, y: ty }, names: { x: tx, y: ty }, date: { x: tx, y: ty } }
  };
}

function resolveHeroLayout(c) {
  if (c.hero_layout && Array.isArray(c.hero_layout.order) && c.hero_layout.pos) return c.hero_layout;
  return defaultHeroLayout(c.hero_text_x || 0, c.hero_text_y || 0);
}

function applyHeroLayout(layout) {
  HERO_BLOCK_IDS.forEach((id, i) => {
    const el = document.getElementById('hero-' + id);
    if (!el) return;
    const ord = layout.order.indexOf(id);
    el.style.order = ord === -1 ? i : ord;
    const p = layout.pos[id] || { x: 0, y: 0 };
    el.style.transform = (p.x || p.y) ? `translate(${p.x}px,${p.y}px)` : '';
  });
}

window.applyHeroPreview = function(c) {
  if (!PREVIEW_MODE) return;
  cfg = c || {};
  renderHero(cfg);
};

window.getHeroLayout = function() {
  return heroLayout ? JSON.parse(JSON.stringify(heroLayout)) : null;
};

let heroDrag = null;
let heroWheelTimer = null;

function initHeroPreviewInteractions() {
  HERO_BLOCK_IDS.forEach(id => {
    const el = document.getElementById('hero-' + id);
    if (!el) return;
    el.style.cursor = 'grab';
    el.addEventListener('mousedown', e => startHeroDrag(e, id));
    el.addEventListener('wheel', e => wheelHeroNudge(e, id), { passive: false });
  });
  document.addEventListener('mousemove', onHeroDragMove);
  document.addEventListener('mouseup', endHeroDrag);
}

function startHeroDrag(e, id) {
  e.preventDefault();
  const p = heroLayout.pos[id] || { x: 0, y: 0 };
  heroDrag = { id, startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y };
  document.getElementById('hero-' + id).style.cursor = 'grabbing';
}

function onHeroDragMove(e) {
  if (!heroDrag) return;
  const dx = e.clientX - heroDrag.startX;
  const dy = e.clientY - heroDrag.startY;
  heroLayout.pos[heroDrag.id] = { x: heroDrag.origX + dx, y: heroDrag.origY + dy };
  applyHeroLayout(heroLayout);
  checkHeroReorder(heroDrag.id);
}

function checkHeroReorder(draggedId) {
  const draggedEl = document.getElementById('hero-' + draggedId);
  const draggedRect = draggedEl.getBoundingClientRect();
  const draggedMid = draggedRect.top + draggedRect.height / 2;
  HERO_BLOCK_IDS.filter(id => id !== draggedId).forEach(otherId => {
    const otherEl = document.getElementById('hero-' + otherId);
    const r = otherEl.getBoundingClientRect();
    const otherMid = r.top + r.height / 2;
    const draggedOrder = heroLayout.order.indexOf(draggedId);
    const otherOrder = heroLayout.order.indexOf(otherId);
    const shouldSwap = (draggedOrder < otherOrder && draggedMid > otherMid) ||
                        (draggedOrder > otherOrder && draggedMid < otherMid);
    if (shouldSwap) {
      heroLayout.order[draggedOrder] = otherId;
      heroLayout.order[otherOrder] = draggedId;
      applyHeroLayout(heroLayout);
    }
  });
}

function endHeroDrag() {
  if (!heroDrag) return;
  document.getElementById('hero-' + heroDrag.id).style.cursor = 'grab';
  heroDrag = null;
  emitHeroLayoutChange();
}

function wheelHeroNudge(e, id) {
  e.preventDefault();
  const p = heroLayout.pos[id] || { x: 0, y: 0 };
  const dy = e.deltaY > 0 ? 2 : -2;
  heroLayout.pos[id] = { x: p.x, y: p.y + dy };
  applyHeroLayout(heroLayout);
  clearTimeout(heroWheelTimer);
  heroWheelTimer = setTimeout(emitHeroLayoutChange, 150);
}

function emitHeroLayoutChange() {
  window.dispatchEvent(new CustomEvent('herolayoutchange', { detail: JSON.parse(JSON.stringify(heroLayout)) }));
}

```

- [ ] **Step 5: Integrar en el `renderHero` de Kuerre (no tiene branching de formato, es más simple que el de CRP)**

Reemplazar:

```js
  document.getElementById('hero-date').textContent = c.fecha_display || '';

  const wrap = document.getElementById('hero-media-wrap');
```

por:

```js
  document.getElementById('hero-date').textContent = c.fecha_display || '';
  heroLayout = resolveHeroLayout(c);
  applyHeroLayout(heroLayout);

  const wrap = document.getElementById('hero-media-wrap');
```

- [ ] **Step 6: Ramificar `init()` igual que en CRP**

Reemplazar:

```js
async function init() {
  if (!cfg) cfg = await parseConfig();
  if (!cfg) {
    document.getElementById('placeholder').style.display = 'flex';
    return;
  }
```

por:

```js
async function init() {
  if (PREVIEW_MODE) {
    cfg = {};
    document.body.style.userSelect = 'none';
    renderHero(cfg);
    document.getElementById('invite-app').style.display = 'block';
    initHeroPreviewInteractions();
    return;
  }
  if (!cfg) cfg = await parseConfig();
  if (!cfg) {
    document.getElementById('placeholder').style.display = 'flex';
    return;
  }
```

- [ ] **Step 7: Verificar con el mismo script de Task 2, apuntado a Kuerre**

```bash
cd "e:/CLAUDE/WEB KUERRE/Desarrollo" && python -m http.server 8091
```

```bash
cd "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/4bfbd4c6-e234-44a9-b9b6-0536ed1fe84b/scratchpad/pwtest"
node -e "
const fs = require('fs');
let s = fs.readFileSync('check.js', 'utf8').replace('localhost:8090', 'localhost:8091');
s = s.replace(\"formato: 'wedding', novios\", \"novios\").replace(\"wedding_script: 'The Wedding', wedding_fx: 'glow', \", '');
fs.writeFileSync('check-kuerre.js', s);
"
node check-kuerre.js
```

Expected: mismo `REORDER PASS` / `WHEEL PASS` que en Task 2 Step 5 (Kuerre no tiene formato wedding, pero el modelo de `hero_layout` es idéntico).

```bash
taskkill //F //IM python.exe
```

- [ ] **Step 8: Copiar a Productivo y commitear**

```bash
cp "e:/CLAUDE/WEB KUERRE/Desarrollo/invite.html" "e:/CLAUDE/WEB KUERRE/Productivo/invite.html"
diff "e:/CLAUDE/WEB KUERRE/Desarrollo/invite.html" "e:/CLAUDE/WEB KUERRE/Productivo/invite.html" && echo IDENTICAL
cd "e:/CLAUDE/WEB KUERRE" && git status --short
```

Expected: `IDENTICAL`, y `git status` muestra ambos `Desarrollo/invite.html` y `Productivo/invite.html` modificados.

```bash
cd "e:/CLAUDE/WEB KUERRE" && git add Desarrollo/invite.html Productivo/invite.html && git commit -m "$(cat <<'EOF'
feat(invite): mismo editor de hero_layout (drag/reorden/rueda) que CRP

Puerto 1:1 del modelo hero_layout + modo preview de invite.html de
CRP. Antes, los botones de posicion del admin compartido no tenian
ningun efecto en Kuerre (invite.html nunca leyo hero_text_x/y) — esto
los reemplaza por una funcionalidad que si funciona en ambos brands.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `CORE/src/admin.html` — reemplazar los botones de flecha por el iframe-preview

**Files:**
- Modify: `e:\CLAUDE\CORE\src\admin.html`

**Interfaces:**
- Consumes: `iframe.contentWindow.applyHeroPreview(cfg)`, `iframe.contentWindow.getHeroLayout()`, evento `herolayoutchange` en `iframe.contentWindow` (de Task 2/3), `getInvBaseUrl()` (ya existente en el archivo, línea ~6256).
- Produces: `hero_layout` dentro del objeto que devuelve `readInviteForm()` (reemplaza a `hero_text_x`/`hero_text_y`).

- [ ] **Step 1: Reemplazar el HTML de los botones de flecha por el iframe**

Reemplazar:

```html
            <!-- POSICIÓN TEXTO PORTADA -->
            <div class="inv-modal-section">
              <div class="inv-modal-section-title">Posición del Texto en Portada</div>
              <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">
                <div style="display:grid;grid-template-columns:repeat(3,40px);grid-template-rows:repeat(3,40px);gap:4px">
                  <div></div>
                  <button type="button" onclick="nudgeHeroText(0,-20)" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:var(--white);font-size:18px;cursor:pointer;border-radius:4px">↑</button>
                  <div></div>
                  <button type="button" onclick="nudgeHeroText(-20,0)" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:var(--white);font-size:18px;cursor:pointer;border-radius:4px">←</button>
                  <button type="button" onclick="resetHeroTextPos()" style="background:rgba(201,168,76,0.15);border:1px solid rgba(201,168,76,0.4);color:var(--gold);font-size:13px;cursor:pointer;border-radius:4px" title="Centrar">⊙</button>
                  <button type="button" onclick="nudgeHeroText(20,0)" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:var(--white);font-size:18px;cursor:pointer;border-radius:4px">→</button>
                  <div></div>
                  <button type="button" onclick="nudgeHeroText(0,20)" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:var(--white);font-size:18px;cursor:pointer;border-radius:4px">↓</button>
                  <div></div>
                </div>
                <div style="font-size:12px;color:var(--gray2);line-height:1.8">
                  <div>X: <span id="inv-text-x-val" style="color:var(--gold);font-family:monospace;font-size:13px">0</span> px</div>
                  <div>Y: <span id="inv-text-y-val" style="color:var(--gold);font-family:monospace;font-size:13px">0</span> px</div>
                  <div style="font-size:10px;color:var(--gray);margin-top:6px">Cada paso = 20px · ⊙ centra</div>
                </div>
              </div>
              <input type="hidden" id="inv-text-x" value="0">
              <input type="hidden" id="inv-text-y" value="0">
            </div>
```

por:

```html
            <!-- POSICIÓN TEXTO PORTADA -->
            <div class="inv-modal-section">
              <div class="inv-modal-section-title">Posición del Texto en Portada</div>
              <div style="font-size:11px;color:var(--gray2);margin-bottom:10px;line-height:1.6">Arrastrá los textos para reposicionarlos y reordenarlos (arriba/medio/abajo). Rueda del mouse sobre un texto = ajuste fino.</div>
              <iframe id="inv-hero-preview" style="width:380px;max-width:100%;height:260px;border:1px solid var(--border);border-radius:8px;background:#000;display:block"></iframe>
            </div>
```

- [ ] **Step 2: Agregar el controlador del preview, después de `invFormatoChange()`**

Insertar después de:

```js
function invFormatoChange() {
  const wedding = document.getElementById('inv-formato').value === 'wedding';
  document.getElementById('inv-wedding-opts').style.display = wedding ? '' : 'none';
}
```

el siguiente bloque nuevo:

```js

// ── HERO PREVIEW (arrastre/reorden/rueda) ──
let _heroLayout = null;
let _heroPreviewDebounce = null;
let _heroPreviewListenersBound = false;
const HERO_PREVIEW_WATCH_FIELDS = ['inv-novios', 'inv-titulo', 'inv-fecha-display', 'inv-media-url',
  'inv-wedding-script', 'inv-formato', 'inv-color-esquema', 'inv-wedding-fx', 'inv-media-type', 'inv-tipo'];

function defaultHeroLayout(tx, ty) {
  return {
    order: ['eyebrow', 'names', 'date'],
    pos: { eyebrow: { x: tx, y: ty }, names: { x: tx, y: ty }, date: { x: tx, y: ty } }
  };
}

function resolveHeroLayoutFromConfig(c) {
  if (c && c.hero_layout && Array.isArray(c.hero_layout.order) && c.hero_layout.pos) return c.hero_layout;
  return defaultHeroLayout((c && c.hero_text_x) || 0, (c && c.hero_text_y) || 0);
}

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

function scheduleHeroPreviewRefresh() {
  clearTimeout(_heroPreviewDebounce);
  _heroPreviewDebounce = setTimeout(refreshHeroPreview, 200);
}

function bindHeroPreviewFieldListeners() {
  if (_heroPreviewListenersBound) return;
  _heroPreviewListenersBound = true;
  const modal = document.getElementById('inv-modal');
  modal.addEventListener('input', e => {
    if (HERO_PREVIEW_WATCH_FIELDS.includes(e.target.id)) scheduleHeroPreviewRefresh();
  });
  modal.addEventListener('change', e => {
    if (HERO_PREVIEW_WATCH_FIELDS.includes(e.target.id)) scheduleHeroPreviewRefresh();
  });
}

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

- [ ] **Step 3: Usar `_heroLayout`/`initHeroPreviewIframe` en `openInviteModal` (rama de edición)**

Reemplazar:

```js
    setHeroTextPos(c.hero_text_x || 0, c.hero_text_y || 0);
```

por:

```js
    _heroLayout = resolveHeroLayoutFromConfig(c);
    initHeroPreviewIframe();
```

- [ ] **Step 4: Usar `_heroLayout`/`initHeroPreviewIframe` en `openInviteModal` (rama de invitación nueva)**

Reemplazar:

```js
    document.getElementById('inv-formato').value = 'clasico';
    document.getElementById('inv-wedding-script').value = '';
    document.getElementById('inv-wedding-fx').value = 'glow';
    invFormatoChange();
    setHeroTextPos(0, 0);
```

por:

```js
    document.getElementById('inv-formato').value = 'clasico';
    document.getElementById('inv-wedding-script').value = '';
    document.getElementById('inv-wedding-fx').value = 'glow';
    invFormatoChange();
    _heroLayout = defaultHeroLayout(0, 0);
    initHeroPreviewIframe();
```

- [ ] **Step 5: Guardar `hero_layout` en lugar de `hero_text_x`/`hero_text_y`**

Dentro de `readInviteForm()`, reemplazar:

```js
      hero_text_x: parseInt(document.getElementById('inv-text-x').value) || 0,
      hero_text_y: parseInt(document.getElementById('inv-text-y').value) || 0
```

por:

```js
      hero_layout: _heroLayout || defaultHeroLayout(0, 0)
```

- [ ] **Step 6: Eliminar las funciones obsoletas de flecha**

Borrar por completo (ya no las llama nada tras los Steps 1-5):

```js
function nudgeHeroText(dx, dy) {
  const x = (parseInt(document.getElementById('inv-text-x').value) || 0) + dx;
  const y = (parseInt(document.getElementById('inv-text-y').value) || 0) + dy;
  setHeroTextPos(x, y);
}
function resetHeroTextPos() { setHeroTextPos(0, 0); }
function setHeroTextPos(x, y) {
  document.getElementById('inv-text-x').value = x;
  document.getElementById('inv-text-y').value = y;
  document.getElementById('inv-text-x-val').textContent = x;
  document.getElementById('inv-text-y-val').textContent = y;
}
```

- [ ] **Step 7: Confirmar que no quedan referencias colgantes**

```bash
grep -n "nudgeHeroText\|resetHeroTextPos\|setHeroTextPos\|inv-text-x\|inv-text-y" "e:/CLAUDE/CORE/src/admin.html"
```

Expected: sin resultados (0 matches).

- [ ] **Step 8: Commit**

```bash
cd "e:/CLAUDE/CORE" && git add src/admin.html && git commit -m "$(cat <<'EOF'
feat(admin): editor visual (iframe drag/reorden) de posicion del hero

Reemplaza los botones de flecha (offset unico, sin preview) por un
iframe same-origin que embebe el propio invite.html en ?preview=1:
arrastre para reposicionar y reordenar cada bloque de texto, rueda
del mouse para ajuste fino. hero_layout reemplaza a hero_text_x/y,
con migracion automatica de invitaciones legacy via
resolveHeroLayoutFromConfig(). Afecta a CRP y Kuerre (admin.html
compartido).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Build de ambos brands + verificación manual guiada

**Files:** ninguno nuevo — corre el build existente y valida en navegador.

- [ ] **Step 1: Rebuild**

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

- [ ] **Step 2: Verificar que el iframe apunta al archivo correcto en el HTML buildeado**

```bash
grep -c "inv-hero-preview" "e:/CLAUDE/WEB CRP/Productivo/admin.html" "e:/CLAUDE/WEB KUERRE/Productivo/admin.html"
```

Expected: al menos 1 match en cada archivo (el `id="inv-hero-preview"` del iframe).

- [ ] **Step 3: Verificación manual en CRP (requiere login real — no automatizable sin credenciales)**

1. Servir `WEB CRP/Productivo` localmente (`python -m http.server 8090`).
2. Abrir `admin.html`, loguearse, ir a Invitaciones → Nueva.
3. Cargar una foto de portada (URL de Cloudinary/Drive existente) y un nombre.
4. Confirmar que el iframe "Posición del Texto en Portada" muestra la foto + los 3 textos.
5. Arrastrar el bloque de fecha por encima del bloque de nombres → confirmar que intercambian de posición en el preview.
6. Pasar el mouse sobre el bloque de nombres y girar la rueda → confirmar que se mueve de a poco verticalmente.
7. Guardar la invitación, reabrirla (Editar) → confirmar que el preview se abre exactamente en la posición/orden que se dejó (persistencia de `hero_layout` funciona).
8. Abrir el link real de esa invitación (fuera del admin, sin `?preview=1`) → confirmar que se ve igual que en el preview y que no hay cursores de arrastre ni la portada reacciona al mouse.

- [ ] **Step 4: Verificación manual en Kuerre — mismos 8 puntos del Step 3, contra `WEB KUERRE/Productivo`**

- [ ] **Step 5: Verificar migración de una invitación legacy**

En cualquiera de los 2 brands, tomar una invitación guardada **antes** de este cambio (con `hero_text_x`/`hero_text_y` en su config, sin `hero_layout`) y abrirla en el admin → confirmar que el preview la muestra en la misma posición que tenía antes (los 3 bloques con el mismo offset, orden por defecto) — si no hay ninguna invitación así a mano, crear una manualmente en `localStorage` (`crd_invites` / clave equivalente) con `hero_text_x: 40, hero_text_y: -20` y sin `hero_layout`, y confirmar que `resolveHeroLayoutFromConfig` la migra visualmente igual.

- [ ] **Step 6: Reportar resultados al usuario antes de empujar (push)**

No hacer `git push` en ningún repo todavía — informar qué se verificó y esperar confirmación explícita del usuario para subir (mismo flujo que el resto de esta conversación: "subilo").
