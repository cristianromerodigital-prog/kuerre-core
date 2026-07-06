# Kuerre Content Editor — Full Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every tab in Kuerre admin's "Editor de Contenido" (Global, Hero, Trust Bar, Invitaciones, QR Fiestas, Premiere, Servicios, Cómo Funciona, FAQ, CTA Final) actually load the live site content into its fields and actually persist edits back to the KV that `index.html` reads.

**Architecture:** `loadContentPage()` and `saveContentSection()` in `CORE/src/admin.html` are CRP-shaped (keys: hero/about/services/pricing/contact/social) and don't match Kuerre's actual content schema (keys: global/hero/trust/invitaciones/qr/premiere/servicios/como_funciona/faq/cta_final — see `index.html:993-1115` `applyContent()`), so the "Guardar X" buttons in Kuerre's content editor are silent no-ops for everything except `hero`. Fix: add two brand-specific patches to `CORE/brands/kuerre/config.json` that replace these two functions (and add FAQ list helpers) with Kuerre's real schema, matching the existing patch pattern already used for `ctCargarServicios`/`svFetchServicios`. This only affects Kuerre's build output — CRP's `admin.html` is generated from the unpatched CORE functions and is untouched.

**Tech Stack:** Vanilla JS (no framework, no npm), Node.js only for the one-off patch-authoring script and `build-admin.cjs`.

## Global Constraints

- No npm dependencies, no build framework — this repo is vanilla HTML/CSS/JS (`CORE/build-admin.cjs` build only).
- Never edit `WEB KUERRE/Desarrollo/admin.html` or `Productivo/admin.html` directly — they are generated. Edit `CORE/src/admin.html` (shared) or `CORE/brands/kuerre/config.json` / `content-section.html` (brand-specific), then run `node CORE/build-admin.cjs kuerre`.
- Field IDs must exactly match `CORE/brands/kuerre/content-section.html` (already has all 10 tabs' HTML; FAQ tab has an empty `<div id="cnt-faq-list">` that needs a JS-rendered dynamic list).
- Data keys must exactly match what `index.html`'s `applyContent()` reads (verified against `WEB KUERRE/content-backup-2026-06-25.json`, a real content snapshot):
  - `global`: `wa_number, ig_url, topbar_left, nav_cta_text, nav_cta_url, footer_copyright`
  - `hero`: `eyebrow, title, desc, btn1_text, btn1_url, btn2_text, bg_image`
  - `trust`: array of 4 `{num, label}`
  - `invitaciones` / `qr` / `premiere`: `{label, title, desc, features: string[5], btn_text, btn_url, bg_image}`
  - `servicios`: `{eyebrow, title, cards: [{name, desc, price}] x3, promo_combo: {enabled, text}}`
  - `como_funciona`: `{eyebrow, title, steps: [{name, desc}] x3}`
  - `faq`: `{eyebrow, title, items: [{q, a}] (variable length)}`
  - `cta_final`: `{title, desc, btn_text, btn_url}`
- `title` fields on multi-word headings may contain a literal `\n` (manual line break, rendered via `<br>` on the public site) — these fields must be `<textarea>`, never `<input>` (already fixed for `svc/cf/faq` titles in this session; `hero/inv/qr/pm` were already textareas; `cta_final.title` has no `\n` in current data, stays `<input>`).

---

### Task 1: Add promo-combo fields to the Servicios panel HTML

**Files:**
- Modify: `e:\CLAUDE\CORE\brands\kuerre\content-section.html:156-158`

**Interfaces:**
- Produces: two new field IDs `cnt-svc-promo-enabled` (checkbox) and `cnt-svc-promo-text` (input), consumed by Task 3's `saveContentSection` and Task 2's `loadContentPage`.

- [ ] **Step 1: Add the fields**

In `CORE/brands/kuerre/content-section.html`, inside the `cnt-servicios` panel's first `settings-section` (header block), after the existing eyebrow/title `form-row` (currently ends at line 157 `</div>`), add:

```html
            <div class="form-row" style="margin-top:10px">
              <div class="form-group"><label class="form-label" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="cnt-svc-promo-enabled" style="width:auto"> Mostrar cartel de promo</label></div>
              <div class="form-group"><label class="form-label">Texto del cartel</label><input class="form-input" id="cnt-svc-promo-text" placeholder="Consultá aquí por Promo Combo Lanzamiento · 50% OFF"></div>
            </div>
```

- [ ] **Step 2: Verify it's well-formed HTML**

Run: `node -e "require('fs').readFileSync('e:/CLAUDE/CORE/brands/kuerre/content-section.html','utf8')"` (just confirms the file still reads without throwing — no HTML parser in this repo, this is a smoke check).
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git -C "e:/CLAUDE/CORE" add brands/kuerre/content-section.html
git -C "e:/CLAUDE/CORE" commit -m "kuerre: add promo combo toggle fields to Servicios content panel"
```

---

### Task 2: Write the patch-authoring Node script (produces both patches)

**Files:**
- Create: `e:\CLAUDE\CORE\_scratch\gen-content-patches.cjs` (temporary, deleted in Task 4 Step 4)

**Interfaces:**
- Consumes: `CORE/src/admin.html` (reads exact current `loadContentPage`/`saveContentSection` source as `find` text — do NOT hand-type these, extract them programmatically to guarantee an exact match).
- Produces: `e:\CLAUDE\CORE\brands\kuerre\config.json` with two new entries appended to its `patches` array (`_comment: "25. ..."` and `"26. ..."`).

- [ ] **Step 1: Write the script**

```javascript
// e:/CLAUDE/CORE/_scratch/gen-content-patches.cjs
const fs = require('fs');

const CORE_PATH = 'e:/CLAUDE/CORE/src/admin.html';
const CONFIG_PATH = 'e:/CLAUDE/CORE/brands/kuerre/config.json';

const core = fs.readFileSync(CORE_PATH, 'utf8').replace(/\r\n/g, '\n');

function extractFunction(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) throw new Error('signature not found: ' + signature);
  let depth = 0, i = start, bodyStart = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') { if (depth === 0) bodyStart = i; depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const OLD_LOAD = extractFunction(core, 'function loadContentPage() {');
const OLD_SAVE = extractFunction(core, 'function saveContentSection(section) {');

const NEW_LOAD = `function loadContentPage() {
  const c = getContent();

  // GLOBAL
  const g = c.global || {};
  document.getElementById('cnt-global-wa').value = g.wa_number || '';
  document.getElementById('cnt-global-ig').value = g.ig_url || '';
  document.getElementById('cnt-global-topbar').value = g.topbar_left || '';
  document.getElementById('cnt-global-nav-cta').value = g.nav_cta_text || '';
  document.getElementById('cnt-global-nav-cta-url').value = g.nav_cta_url || '';
  document.getElementById('cnt-global-footer').value = g.footer_copyright || '';

  // HERO
  const h = c.hero || {};
  document.getElementById('cnt-hero-eyebrow').value = h.eyebrow || '';
  document.getElementById('cnt-hero-title').value = h.title || '';
  document.getElementById('cnt-hero-desc').value = h.desc || '';
  document.getElementById('cnt-hero-btn1').value = h.btn1_text || '';
  document.getElementById('cnt-hero-btn1-url').value = h.btn1_url || '';
  document.getElementById('cnt-hero-btn2').value = h.btn2_text || '';
  document.getElementById('cnt-hero-bg').value = h.bg_image || '';

  // TRUST BAR
  const trust = c.trust || [];
  for (let i = 0; i < 4; i++) {
    const item = trust[i] || {};
    const numEl = document.getElementById('cnt-trust-num-' + i);
    const labelEl = document.getElementById('cnt-trust-label-' + i);
    if (numEl) numEl.value = item.num || '';
    if (labelEl) labelEl.value = item.label || '';
  }

  // FEATURE SECTIONS (Invitaciones, QR, Premiere)
  const featureSections = [
    { key: 'invitaciones', pfx: 'inv' },
    { key: 'qr',           pfx: 'qr'  },
    { key: 'premiere',     pfx: 'pm'  }
  ];
  featureSections.forEach(s => {
    const d = c[s.key] || {};
    const p = s.pfx;
    document.getElementById('cnt-' + p + '-label').value = d.label || '';
    document.getElementById('cnt-' + p + '-title').value = d.title || '';
    document.getElementById('cnt-' + p + '-desc').value = d.desc || '';
    const feats = d.features || [];
    for (let i = 0; i < 5; i++) {
      const el = document.getElementById('cnt-' + p + '-feat-' + i);
      if (el) el.value = feats[i] || '';
    }
    document.getElementById('cnt-' + p + '-btn').value = d.btn_text || '';
    document.getElementById('cnt-' + p + '-btn-url').value = d.btn_url || '';
    document.getElementById('cnt-' + p + '-bg').value = d.bg_image || '';
  });

  // SERVICIOS
  const svc = c.servicios || {};
  document.getElementById('cnt-svc-eyebrow').value = svc.eyebrow || '';
  document.getElementById('cnt-svc-title').value = svc.title || '';
  const cards = svc.cards || [];
  for (let i = 0; i < 3; i++) {
    const card = cards[i] || {};
    const nameEl = document.getElementById('cnt-svc-name-' + i);
    const priceEl = document.getElementById('cnt-svc-price-' + i);
    const descEl = document.getElementById('cnt-svc-desc-' + i);
    if (nameEl) nameEl.value = card.name || '';
    if (priceEl) priceEl.value = card.price || '';
    if (descEl) descEl.value = card.desc || '';
  }
  const promo = svc.promo_combo || {};
  const promoEnabledEl = document.getElementById('cnt-svc-promo-enabled');
  const promoTextEl = document.getElementById('cnt-svc-promo-text');
  if (promoEnabledEl) promoEnabledEl.checked = promo.enabled !== false;
  if (promoTextEl) promoTextEl.value = promo.text || '';

  // COMO FUNCIONA
  const cf = c.como_funciona || {};
  document.getElementById('cnt-cf-eyebrow').value = cf.eyebrow || '';
  document.getElementById('cnt-cf-title').value = cf.title || '';
  const steps = cf.steps || [];
  for (let i = 0; i < 3; i++) {
    const step = steps[i] || {};
    const nameEl = document.getElementById('cnt-cf-step-name-' + i);
    const descEl = document.getElementById('cnt-cf-step-desc-' + i);
    if (nameEl) nameEl.value = step.name || '';
    if (descEl) descEl.value = step.desc || '';
  }

  // FAQ
  const faq = c.faq || {};
  document.getElementById('cnt-faq-eyebrow').value = faq.eyebrow || '';
  document.getElementById('cnt-faq-title').value = faq.title || '';
  renderFaqEditor(faq.items || []);

  // CTA FINAL
  const ctaFinal = c.cta_final || {};
  document.getElementById('cnt-cta-title').value = ctaFinal.title || '';
  document.getElementById('cnt-cta-desc').value = ctaFinal.desc || '';
  document.getElementById('cnt-cta-btn').value = ctaFinal.btn_text || '';
  document.getElementById('cnt-cta-btn-url').value = ctaFinal.btn_url || '';
}

// ── FAQ EDITOR (Kuerre) ──
function renderFaqEditor(items) {
  const container = document.getElementById('cnt-faq-list');
  if (!container) return;
  container.innerHTML = items.map((item, i) => \\\`
    <div class="settings-section" style="margin-bottom:10px">
      <div class="form-group"><label class="form-label">Pregunta \\\${i+1}</label><input class="form-input" id="cnt-faq-q-\\\${i}" value="\\\${(item.q||'').replace(/"/g,'&quot;')}"></div>
      <div class="form-group"><label class="form-label">Respuesta</label><textarea class="form-textarea" id="cnt-faq-a-\\\${i}">\\\${item.a||''}</textarea></div>
      <button class="btn-sm" onclick="removeFaqItem(\\\${i})" style="color:var(--red)">✕ Quitar pregunta</button>
    </div>\\\`).join('');
  container.dataset.count = items.length;
}

function addFaqItem() {
  const items = collectFaqItems();
  items.push({ q: '', a: '' });
  renderFaqEditor(items);
}

function removeFaqItem(idx) {
  const items = collectFaqItems();
  items.splice(idx, 1);
  renderFaqEditor(items);
}

function collectFaqItems() {
  const container = document.getElementById('cnt-faq-list');
  const count = parseInt((container && container.dataset.count) || '0', 10);
  const items = [];
  for (let i = 0; i < count; i++) {
    const q = document.getElementById('cnt-faq-q-' + i);
    const a = document.getElementById('cnt-faq-a-' + i);
    if (q) items.push({ q: q.value.trim(), a: (a ? a.value.trim() : '') });
  }
  return items;
}`;

const NEW_SAVE = `function saveContentSection(section) {
  const c = getContent();

  if (section === 'global') {
    c.global = {
      wa_number: document.getElementById('cnt-global-wa').value.trim(),
      ig_url: document.getElementById('cnt-global-ig').value.trim(),
      topbar_left: document.getElementById('cnt-global-topbar').value.trim(),
      nav_cta_text: document.getElementById('cnt-global-nav-cta').value.trim(),
      nav_cta_url: document.getElementById('cnt-global-nav-cta-url').value.trim(),
      footer_copyright: document.getElementById('cnt-global-footer').value.trim()
    };
  }
  else if (section === 'hero') {
    c.hero = {
      eyebrow: document.getElementById('cnt-hero-eyebrow').value.trim(),
      title: document.getElementById('cnt-hero-title').value.trim(),
      desc: document.getElementById('cnt-hero-desc').value.trim(),
      btn1_text: document.getElementById('cnt-hero-btn1').value.trim(),
      btn1_url: document.getElementById('cnt-hero-btn1-url').value.trim(),
      btn2_text: document.getElementById('cnt-hero-btn2').value.trim(),
      bg_image: document.getElementById('cnt-hero-bg').value.trim()
    };
  }
  else if (section === 'trust') {
    const trust = [];
    for (let i = 0; i < 4; i++) {
      trust.push({
        num: document.getElementById('cnt-trust-num-' + i).value.trim(),
        label: document.getElementById('cnt-trust-label-' + i).value.trim()
      });
    }
    c.trust = trust;
  }
  else if (section === 'invitaciones' || section === 'qr' || section === 'premiere') {
    const pfxMap = { invitaciones: 'inv', qr: 'qr', premiere: 'pm' };
    const p = pfxMap[section];
    const feats = [];
    for (let i = 0; i < 5; i++) {
      const el = document.getElementById('cnt-' + p + '-feat-' + i);
      if (el && el.value.trim()) feats.push(el.value.trim());
    }
    c[section] = {
      label: document.getElementById('cnt-' + p + '-label').value.trim(),
      title: document.getElementById('cnt-' + p + '-title').value.trim(),
      desc: document.getElementById('cnt-' + p + '-desc').value.trim(),
      features: feats,
      btn_text: document.getElementById('cnt-' + p + '-btn').value.trim(),
      btn_url: document.getElementById('cnt-' + p + '-btn-url').value.trim(),
      bg_image: document.getElementById('cnt-' + p + '-bg').value.trim()
    };
  }
  else if (section === 'servicios') {
    const cards = [];
    for (let i = 0; i < 3; i++) {
      cards.push({
        name: document.getElementById('cnt-svc-name-' + i).value.trim(),
        desc: document.getElementById('cnt-svc-desc-' + i).value.trim(),
        price: document.getElementById('cnt-svc-price-' + i).value.trim()
      });
    }
    const promoEnabledEl = document.getElementById('cnt-svc-promo-enabled');
    const promoTextEl = document.getElementById('cnt-svc-promo-text');
    c.servicios = {
      eyebrow: document.getElementById('cnt-svc-eyebrow').value.trim(),
      title: document.getElementById('cnt-svc-title').value.trim(),
      cards: cards,
      promo_combo: {
        enabled: promoEnabledEl ? promoEnabledEl.checked : true,
        text: promoTextEl ? promoTextEl.value.trim() : ''
      }
    };
  }
  else if (section === 'como') {
    const steps = [];
    for (let i = 0; i < 3; i++) {
      steps.push({
        name: document.getElementById('cnt-cf-step-name-' + i).value.trim(),
        desc: document.getElementById('cnt-cf-step-desc-' + i).value.trim()
      });
    }
    c.como_funciona = {
      eyebrow: document.getElementById('cnt-cf-eyebrow').value.trim(),
      title: document.getElementById('cnt-cf-title').value.trim(),
      steps: steps
    };
  }
  else if (section === 'faq') {
    c.faq = {
      eyebrow: document.getElementById('cnt-faq-eyebrow').value.trim(),
      title: document.getElementById('cnt-faq-title').value.trim(),
      items: collectFaqItems()
    };
  }
  else if (section === 'cta') {
    c.cta_final = {
      title: document.getElementById('cnt-cta-title').value.trim(),
      desc: document.getElementById('cnt-cta-desc').value.trim(),
      btn_text: document.getElementById('cnt-cta-btn').value.trim(),
      btn_url: document.getElementById('cnt-cta-btn-url').value.trim()
    };
  }

  setContent(c);
  toast('Sección guardada ✓ — recargá el sitio para ver los cambios');
}`;

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
config.patches.push(
  { _comment: '25. loadContentPage — reemplazo completo por schema real de Kuerre (global/hero/trust/invitaciones/qr/premiere/servicios/como_funciona/faq/cta_final) + FAQ editor dinamico', find: OLD_LOAD, replace: NEW_LOAD },
  { _comment: '26. saveContentSection — reemplazo completo por schema real de Kuerre (ver patch 25)', find: OLD_SAVE, replace: NEW_SAVE }
);
fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\\n', 'utf8');
console.log('OK: patches 25 and 26 appended to', CONFIG_PATH);
```

- [ ] **Step 2: Run it**

Run: `mkdir -p "e:/CLAUDE/CORE/_scratch" && node "e:/CLAUDE/CORE/_scratch/gen-content-patches.cjs"`
Expected: `OK: patches 25 and 26 appended to e:/CLAUDE/CORE/brands/kuerre/config.json`

- [ ] **Step 3: Sanity-check the appended JSON is valid and both patches are present**

Run: `node -e "const c=require('e:/CLAUDE/CORE/brands/kuerre/config.json'); console.log(c.patches.slice(-2).map(p=>p._comment))"`
Expected:
```
[
  '25. loadContentPage — reemplazo completo por schema real de Kuerre (global/hero/trust/invitaciones/qr/premiere/servicios/como_funciona/faq/cta_final) + FAQ editor dinamico',
  '26. saveContentSection — reemplazo completo por schema real de Kuerre (ver patch 25)'
]
```

---

### Task 3: Rebuild and structurally verify

**Files:**
- Generated: `e:\CLAUDE\WEB KUERRE\Desarrollo\admin.html`, `e:\CLAUDE\WEB KUERRE\Productivo\admin.html`

- [ ] **Step 1: Build**

Run: `node "e:/CLAUDE/CORE/build-admin.cjs" kuerre`
Expected:
```
  → WEB KUERRE/Productivo/admin.html
  → WEB KUERRE/Desarrollo/admin.html
✅ kuerre built (2 files)
```
If it instead throws `[kuerre] Patch not found`, the `find` text extracted in Task 2 no longer matches CORE (someone edited `loadContentPage`/`saveContentSection` since this plan was written) — re-run Task 2's script (it re-extracts fresh from the current CORE file) rather than hand-editing.

- [ ] **Step 2: Verify every content-tab field ID referenced by the new JS exists in the generated HTML**

Run:
```bash
node -e "
const html = require('fs').readFileSync('e:/CLAUDE/WEB KUERRE/Desarrollo/admin.html','utf8');
const ids = ['cnt-global-wa','cnt-global-ig','cnt-global-topbar','cnt-global-nav-cta','cnt-global-nav-cta-url','cnt-global-footer',
  'cnt-hero-eyebrow','cnt-hero-title','cnt-hero-desc','cnt-hero-btn1','cnt-hero-btn1-url','cnt-hero-btn2','cnt-hero-bg',
  'cnt-trust-num-0','cnt-trust-label-3',
  'cnt-inv-label','cnt-inv-title','cnt-inv-feat-4','cnt-inv-btn-url','cnt-inv-bg',
  'cnt-qr-label','cnt-qr-feat-4','cnt-pm-label','cnt-pm-feat-4',
  'cnt-svc-eyebrow','cnt-svc-title','cnt-svc-name-2','cnt-svc-price-2','cnt-svc-desc-2','cnt-svc-promo-enabled','cnt-svc-promo-text',
  'cnt-cf-eyebrow','cnt-cf-title','cnt-cf-step-name-2','cnt-cf-step-desc-2',
  'cnt-faq-eyebrow','cnt-faq-title','cnt-faq-list',
  'cnt-cta-title','cnt-cta-desc','cnt-cta-btn','cnt-cta-btn-url'];
const missing = ids.filter(id => !html.includes('id=\\\"'+id+'\\\"'));
console.log(missing.length ? 'MISSING: ' + missing.join(', ') : 'ALL IDS PRESENT');
"
```
Expected: `ALL IDS PRESENT`

- [ ] **Step 3: Verify the new functions landed and old CRP branches are gone from Kuerre's build**

Run: `node -e "const h=require('fs').readFileSync('e:/CLAUDE/WEB KUERRE/Desarrollo/admin.html','utf8'); console.log(h.includes(\"section === 'servicios'\"), h.includes(\"section === 'about'\"), h.includes('function renderFaqEditor'))"`
Expected: `true false true` (new kuerre branch present, old CRP `about` branch gone, FAQ editor helper present)

- [ ] **Step 4: Delete the scratch script**

Run: `rm -rf "e:/CLAUDE/CORE/_scratch"`

- [ ] **Step 5: Commit**

```bash
git -C "e:/CLAUDE/CORE" add brands/kuerre/config.json
git -C "e:/CLAUDE/CORE" commit -m "kuerre: wire content editor load/save to real site schema (all 10 tabs)"
```

Then copy the two generated files to Kuerre's own repo and commit there too (per this project's convention — "subilo" = Productivo + push):
```bash
git -C "e:/CLAUDE/WEB KUERRE" add Desarrollo/admin.html Productivo/admin.html
git -C "e:/CLAUDE/WEB KUERRE" commit -m "admin: content editor now loads/saves all 10 sections (was only hero)"
```

---

### Task 4: Data-contract round-trip check against the live KV (no browser needed)

This validates the *shape* the new save function will produce is exactly what `index.html`'s `applyContent()` expects — without needing to drive a real browser session against the authenticated admin panel.

**Files:** none (verification only, talks to the live Cloudflare Worker)

- [ ] **Step 1: Fetch current live content and confirm baseline**

Run:
```bash
curl -s "https://kuerre-worker.cristian-romero-digital.workers.dev/crd_content" > "$SCRATCH/live_before.json"
node -e "console.log(Object.keys(require('$SCRATCH/live_before.json')))"
```
Expected: `[ 'global', 'hero', 'trust', 'invitaciones', 'qr', 'premiere', 'servicios', 'como_funciona', 'faq', 'cta_final' ]`

- [ ] **Step 2: Simulate what saveContentSection('servicios') would produce (with promo_combo now included) and confirm it round-trips through the KV without altering unrelated sections**

```bash
node -e "
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('\$SCRATCH/live_before.json','utf8'));
d.servicios.promo_combo = { enabled: true, text: 'Consultá aquí por Promo Combo Lanzamiento · 50% OFF' };
fs.writeFileSync('\$SCRATCH/live_test.json', JSON.stringify(d));
fetch('https://KUERRE-worker.cristian-romero-digital.workers.dev/crd_content', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'f3971df2e46013b8ada19aaf3e209d8ff00d518f200d2655' },
  body: fs.readFileSync('\$SCRATCH/live_test.json','utf8')
}).then(async r => console.log(r.status, await r.text()));
"
curl -s "https://kuerre-worker.cristian-romero-digital.workers.dev/crd_content" | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{ const j=JSON.parse(d); console.log(JSON.stringify(j.servicios.promo_combo)); console.log('title unchanged:', j.servicios.title === 'Antes, durante y después\\ndeu tu evento' || j.servicios.title.includes('\\n')); });
"
```
Expected: `200 {"ok":true}`, then `{"enabled":true,"text":"Consultá aquí por Promo Combo Lanzamiento · 50% OFF"}` and title still contains a real `\n`.

- [ ] **Step 3: Clean up scratch files**

Run: `rm -f "$SCRATCH/live_before.json" "$SCRATCH/live_test.json"`

---

### Task 5: Manual browser QA (final gate — requires the real admin login, cannot be scripted blind)

- [ ] Log into Kuerre admin → Contenido.
- [ ] For each of the 10 tabs, confirm fields are pre-filled with the current live copy (not blank, not CRP placeholders like "Mis servicios").
- [ ] Edit one field in **Servicios** (e.g. append a word to the title) and one in **FAQ** (add a question via "+ Agregar pregunta", fill it, save).
- [ ] Click "Guardar" on both, then hard-refresh `index.html` and confirm both edits appear on the live page.
- [ ] Confirm the previously-fixed titles ("Antes, durante y después / de tu evento", "Simple, rápido / y sin complicaciones", "¿Tenés dudas? / Las respondemos todas") still render on two lines and haven't been re-corrupted by the save round-trip.
- [ ] Revert the test edits (or leave them — user's call) and confirm final state matches intent.
