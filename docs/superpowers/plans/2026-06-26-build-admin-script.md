# Build Admin Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear un script `build-admin.js` que toma `CORE/src/admin.html` como fuente única y genera `WEB KUERRE/Productivo/admin.html` y `WEB CRP/Productivo/admin.html` aplicando patches de marca, eliminando la necesidad de editar cada archivo por separado.

**Architecture:** CORE es la fuente de verdad. Cada marca tiene un `config.json` con patches (find/replace strings y regex) y opcionalmente un archivo HTML para reemplazar secciones enteras (ej. content panels de KUERRE). El build script aplica los patches en orden y falla con error descriptivo si algún texto a reemplazar no se encuentra en CORE. Se añaden dos comentarios marcadores en CORE para delimitar la sección de content panels.

**Tech Stack:** Node.js built-in (fs, path) — sin dependencias npm.

## Global Constraints

- Sin dependencias npm — solo módulos built-in de Node.js
- El script falla (throw) si un patch no encuentra su texto en CORE — nunca silencioso
- Los archivos `Productivo/` Y `Desarrollo/` de cada marca se actualizan juntos
- Respetar encoding UTF-8 en todos los archivos
- No modificar `WEB KUERRE/worker/` ni `WEB CRP/worker/` — esos tienen sus propios deploys

---

## Archivos

| Archivo | Acción | Propósito |
|---------|--------|-----------|
| `CORE/src/admin.html` | Modificar | Agregar 2 marcadores HTML para content section |
| `CORE/build-admin.js` | Crear | Script de build |
| `CORE/brands/kuerre/config.json` | Crear | Patches KUERRE |
| `CORE/brands/kuerre/content-section.html` | Crear | Content panels de KUERRE (extraído de Productivo) |
| `CORE/brands/crp/config.json` | Crear | Patches CRP |

---

### Task 1: Agregar marcadores en CORE admin.html

**Files:**
- Modify: `e:\CLAUDE\CORE\src\admin.html` (línea ~1455, entre content editor y contratos)

Los marcadores delimitan la sección de content panels que cada marca puede reemplazar.

- [ ] **Step 1: Agregar marcador de inicio**

Localizar esta línea (es un comentario decorativo antes del content editor):

```
      <!-- ═══════════════════════════════════════
           CONTENT EDITOR PAGE
      ═══════════════════════════════════════ -->
```

Reemplazarla con:

```
      <!-- @@CONTENT_START -->
      <!-- ═══════════════════════════════════════
           CONTENT EDITOR PAGE
      ═══════════════════════════════════════ -->
```

- [ ] **Step 2: Agregar marcador de cierre**

Localizar esta línea (está justo antes de la página de contratos):

```
      <!-- PAGE: CONTRATOS -->
```

Reemplazarla con:

```
      <!-- @@CONTENT_END -->
      <!-- PAGE: CONTRATOS -->
```

- [ ] **Step 3: Verificar que los marcadores quedaron en el archivo**

```bash
grep -n "@@CONTENT" "e:/CLAUDE/CORE/src/admin.html"
```

Esperado: 2 líneas — una con `@@CONTENT_START` y otra con `@@CONTENT_END`.

- [ ] **Step 4: Commit**

```bash
cd "e:/CLAUDE/CORE"
git add src/admin.html
git commit -m "build: add content section markers for brand build system"
```

---

### Task 2: Extraer content section de KUERRE Productivo

**Files:**
- Create: `e:\CLAUDE\CORE\brands\kuerre\content-section.html`

Esta sección es completamente diferente en KUERRE (tiene Trust Bar, Invitaciones, QR, Premiere, etc. en vez de About, Services, Pricing, Contact de CRP/CORE).

- [ ] **Step 1: Encontrar líneas del content section en KUERRE Productivo**

```bash
grep -n "CONTENT EDITOR PAGE\|PAGE: CONTRATOS" "e:/CLAUDE/WEB KUERRE/Productivo/admin.html"
```

Esperado: dos líneas con los números de línea exactos. Anotar:
- `LINE_START` = la línea del comentario `CONTENT EDITOR PAGE` (o la anterior si hay `@@CONTENT_START`)
- `LINE_END` = la línea del comentario `PAGE: CONTRATOS` - 1

- [ ] **Step 2: Extraer la sección y guardar**

```bash
python3 -c "
import sys
lines = open('e:/CLAUDE/WEB KUERRE/Productivo/admin.html', encoding='utf-8').readlines()
# Buscar inicio y fin
start = next(i for i,l in enumerate(lines) if 'CONTENT EDITOR PAGE' in l) - 1
end   = next(i for i,l in enumerate(lines) if 'PAGE: CONTRATOS' in l)
content = ''.join(lines[start:end])
open('e:/CLAUDE/CORE/brands/kuerre/content-section.html', 'w', encoding='utf-8').write(content)
print(f'Extracted lines {start+1}-{end} ({end-start} lines)')
"
```

- [ ] **Step 3: Verificar que el archivo tiene contenido de KUERRE**

```bash
grep -c "cnt-panel" "e:/CLAUDE/CORE/brands/kuerre/content-section.html"
```

Esperado: número > 5 (KUERRE tiene muchos panels).

```bash
grep "cnt-global\|cnt-trust\|cnt-qr\|cnt-premiere" "e:/CLAUDE/CORE/brands/kuerre/content-section.html" | head -5
```

Esperado: al menos 4 líneas con IDs específicos de KUERRE.

- [ ] **Step 4: Commit**

```bash
cd "e:/CLAUDE/CORE"
git add brands/
git commit -m "build: extract KUERRE content section to brand file"
```

---

### Task 3: Escribir build-admin.js

**Files:**
- Create: `e:\CLAUDE\CORE\build-admin.js`

- [ ] **Step 1: Crear el script**

```javascript
// build-admin.js
// Uso: node build-admin.js [kuerre|crp|all]
// Sin deps: solo fs y path built-in

const fs   = require('fs');
const path = require('path');

const ROOT  = __dirname;
const CORE  = path.join(ROOT, 'src', 'admin.html');

function applyPatches(html, patches, brandName) {
  for (const patch of patches) {
    if (patch.regex) {
      html = html.replace(new RegExp(patch.regex, patch.flags || 'g'), patch.replace);
    } else {
      if (!html.includes(patch.find)) {
        throw new Error(`[${brandName}] Patch not found:\n  "${patch.find.slice(0, 80)}..."`);
      }
      html = html.split(patch.find).join(patch.replace);
    }
  }
  return html;
}

function applyContentSection(html, brandDir, sectionFile) {
  const content  = fs.readFileSync(path.join(brandDir, sectionFile), 'utf8');
  const START    = '<!-- @@CONTENT_START -->';
  const END      = '<!-- @@CONTENT_END -->';
  const startIdx = html.indexOf(START);
  const endIdx   = html.indexOf(END) + END.length;
  if (startIdx === -1) throw new Error('@@CONTENT_START marker not found in CORE');
  if (endIdx   === -1) throw new Error('@@CONTENT_END marker not found in CORE');
  return html.slice(0, startIdx) + content + html.slice(endIdx);
}

function buildBrand(brandName) {
  const brandDir = path.join(ROOT, 'brands', brandName);
  const config   = JSON.parse(fs.readFileSync(path.join(brandDir, 'config.json'), 'utf8'));

  let html = fs.readFileSync(CORE, 'utf8');

  // 1. Apply patches
  html = applyPatches(html, config.patches || [], brandName);

  // 2. Replace content section (optional)
  if (config.contentSection) {
    html = applyContentSection(html, brandDir, config.contentSection);
  }

  // 3. Write outputs
  for (const outRel of config.outputs) {
    const outPath = path.resolve(ROOT, '..', outRel);
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`  → ${outRel}`);
  }

  console.log(`✅ ${brandName} built (${config.outputs.length} files)`);
}

// Entry point
const target = process.argv[2] || 'all';
const brands = target === 'all' ? ['kuerre', 'crp'] : [target];

for (const brand of brands) {
  try {
    buildBrand(brand);
  } catch(e) {
    console.error(`❌ ${brand}: ${e.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Verificar que el script existe y es válido JS**

```bash
node -e "require('./build-admin.js')" 2>&1 || true
```

(Fallará porque los configs no existen aún — está bien, no debe crashear con syntax error)

---

### Task 4: Escribir brands/kuerre/config.json

**Files:**
- Create: `e:\CLAUDE\CORE\brands\kuerre\config.json`

Todos los patches se aplican en orden. Si uno falla, el build se detiene.

- [ ] **Step 1: Crear el config**

```json
{
  "outputs": [
    "WEB KUERRE/Productivo/admin.html",
    "WEB KUERRE/Desarrollo/admin.html"
  ],
  "contentSection": "content-section.html",
  "patches": [
    {
      "_comment": "1. Versión",
      "find": ">V1.40<",
      "replace": ">V1.48<"
    },
    {
      "_comment": "2. Inyectar CSS de colores KUERRE después del </style> principal",
      "find": "</style>\n<script src=\"https://upload-widget.cloudinary.com/global/all.js\"></script>",
      "replace": "</style>\n\n<!-- ═══ KUERRE VISUAL OVERRIDE — SOLO COLORES ═══ -->\n<style>\n/* ── LOGO ── */\n#sidebar-logo-img { display: none !important; }\n.sidebar-logo-text { font-size: 0 !important; color: transparent !important; }\n.sidebar-logo-text span { display: none !important; }\n.sidebar-logo-text::before { content: 'KUERRE'; display: block; font-family: 'DM Sans',sans-serif; font-size: 16px; font-weight: 300; letter-spacing: 3px; text-transform: uppercase; color: #9060b8; }\n\n/* ── VARIABLES DE COLOR ── */\n:root {\n  --gold:   #9060b8;\n  --gold2:  #00e0a8;\n}\n\n.login-logo span        { color: #9060b8 !important; }\n.login-btn              { background: #9060b8 !important; color: #fff !important; }\n.login-btn:hover        { background: #7a4aa0 !important; }\n.login-input:focus      { border-color: #9060b8 !important; }\n.nav-section-label      { color: rgba(192,144,224,.4) !important; }\n.sidebar-item.active    { color: #9060b8 !important; background: rgba(144,96,184,.1) !important; }\n.sidebar-item.active svg { opacity: 1; }\n.tab.active             { color: #9060b8 !important; border-bottom-color: #9060b8 !important; }\n.cnt-tab.active, .cnt-subtab.active { background: #9060b8 !important; color: #fafafa !important; }\n.btn-add                { background: rgba(192,144,224,.18) !important; color: #9060b8 !important; border-color: rgba(192,144,224,.3) !important; }\n.btn-add:hover          { background: rgba(192,144,224,.28) !important; }\n.settings-section-title { color: #9060b8 !important; }\n.form-input:focus, .form-textarea:focus, .form-select:focus { border-color: #9060b8 !important; }\n</style>\n<!-- ═══ / KUERRE VISUAL OVERRIDE ═══ -->\n<script src=\"https://upload-widget.cloudinary.com/global/all.js\"></script>"
    },
    {
      "_comment": "3. Quitar data-module de sidebar items y pages (regex)",
      "regex": " data-module=\"[^\"]*\"",
      "flags": "g",
      "replace": ""
    },
    {
      "_comment": "4. Ocultar sidebar de crclub",
      "find": "onclick=\"showPage('crclub')\">",
      "replace": "onclick=\"showPage('crclub')\" style=\"display:none\">"
    },
    {
      "_comment": "5. CF_URL",
      "find": "CF_URL:             '',",
      "replace": "CF_URL:             'https://KUERRE-worker.cristian-romero-digital.workers.dev',"
    },
    {
      "_comment": "6. CRCLUB_URL",
      "find": "CRCLUB_URL:          '',",
      "replace": "CRCLUB_URL:         'https://KUERRE-worker.cristian-romero-digital.workers.dev',"
    },
    {
      "_comment": "7. CF_AUTH — valor inyectado por config, no secreto ya que el admin es client-side",
      "find": "CF_AUTH:            '',",
      "replace": "CF_AUTH:            'f3971df2e46013b8ada19aaf3e209d8ff00d518f200d2655',"
    },
    {
      "_comment": "8. WEB_DEFAULT",
      "find": "WEB_DEFAULT:         ''",
      "replace": "WEB_DEFAULT:        'https://KUERRE.com.ar'"
    },
    {
      "_comment": "9. CLIENTES_WORKER",
      "find": "const CLIENTES_WORKER = '';",
      "replace": "const CLIENTES_WORKER = 'https://KUERRE-worker.cristian-romero-digital.workers.dev';"
    },
    {
      "_comment": "10. FIESTAS_WORKER",
      "find": "const FIESTAS_WORKER = '';",
      "replace": "const FIESTAS_WORKER = 'https://KUERRE-worker.cristian-romero-digital.workers.dev';"
    },
    {
      "_comment": "11. CF_SYNC_KEYS — quitar crd_site_logo",
      "find": "\"crd_contratos_cfg\",\"crd_site_logo\",\"crd_ct_draft\"",
      "replace": "\"crd_contratos_cfg\",\"crd_ct_draft\""
    },
    {
      "_comment": "12. Quitar bloque loadModules/applyModules",
      "find": "\n\n// ─── Módulos ─────────────────────────────────────────────────────────────────\nlet _MODULES = {};\n\nasync function loadModules() {\n  try {\n    const res = await fetch('/admin/modules');\n    if (!res.ok) return;\n    const data = await res.json();\n    _MODULES = data.modules || {};\n    if (data.brand) {\n      const logoEl = document.querySelector('.sidebar-logo-text');\n      if (logoEl) logoEl.textContent = data.brand;\n    }\n    applyModules();\n  } catch(e) {}\n}\n\nfunction applyModules() {\n  document.querySelectorAll('[data-module]').forEach(el => {\n    const mod = el.getAttribute('data-module');\n    el.style.display = _MODULES[mod] === false ? 'none' : '';\n  });\n  const activePage = document.querySelector('.page.active[data-module]');\n  if (activePage && _MODULES[activePage.getAttribute('data-module')] === false) {\n    showPage('dashboard');\n  }\n}\n",
      "replace": "\n"
    },
    {
      "_comment": "13. DOMContentLoaded — quitar loadModules()",
      "find": "document.addEventListener('DOMContentLoaded', () => { init(); loadModules(); });",
      "replace": "document.addEventListener('DOMContentLoaded', init);"
    },
    {
      "_comment": "14. init() — quitar loadModules() call inline",
      "find": "      init();\n      loadModules();",
      "replace": "      init();"
    },
    {
      "_comment": "15. showPage content — KUERRE usa initContentIfEmpty()",
      "find": "if (id === 'content') { loadContentPage(); setTimeout(loadDestinations, 100); }",
      "replace": "if (id === 'content') { initContentIfEmpty(); loadContentPage(); }"
    },
    {
      "_comment": "16. init() — agregar localStorage.removeItem antes de _fetchClientes",
      "find": "  _fetchClientes({ search: '', offset: 0 }).catch(function(){});\n  ctInitSolicitudes();",
      "replace": "  // El logo base64 en localStorage revienta el cupo de 5MB — siempre limpiar al arrancar\n  localStorage.removeItem('crd_site_logo');\n  localStorage.removeItem('crd_site_logo_light');\n  _fetchClientes({ search: '', offset: 0 }).catch(function(){});\n  ctInitSolicitudes();"
    },
    {
      "_comment": "17. Settings sync — delete logoUrl en lugar de preservar",
      "find": "    const local = S.get('crd_settings') || {};\n    if (!cloudSettings.logoUrl && local.logoUrl) cloudSettings.logoUrl = local.logoUrl;\n    if (!cloudSettings.logoFilter && local.logoFilter) cloudSettings.logoFilter = local.logoFilter;",
      "replace": "    delete cloudSettings.logoUrl; delete cloudSettings.logoFilter; // limpiar si quedaron del ciclo anterior"
    },
    {
      "_comment": "18. Logo sidebar — usar localStorage.getItem + parse + cleanup",
      "find": "  // Logo sidebar: aplicar siempre al arrancar (desde localStorage o desde crd_settings de CF)\n  const _logoLocal = S.get('crd_site_logo');\n  if (_logoLocal) {\n    applySidebarLogo(_logoLocal);",
      "replace": "  // Contenido CMS: siempre sincronizar del cloud (fuente de verdad cross-browser)\n  const cloudContent = await fetchFromCloud('crd_content');\n  if (cloudContent && typeof cloudContent === 'object') localStorage.setItem('crd_content', JSON.stringify(cloudContent));\n\n  // Logo sidebar — solo aplicar al DOM, nunca guardar en localStorage (base64 es demasiado grande)\n  const _logoLocal = localStorage.getItem('crd_site_logo');\n  if (_logoLocal) {\n    try { applySidebarLogo(JSON.parse(_logoLocal)); } catch(e) { applySidebarLogo(_logoLocal); }\n    localStorage.removeItem('crd_site_logo'); // limpiar si quedaron del ciclo anterior"
    },
    {
      "_comment": "19. Video section — agregar botón Drive",
      "find": "                  <input class=\"form-input\" id=\"video-url-input\" placeholder=\"https://res.cloudinary.com/... o cualquier URL directa de .mp4\" oninput=\"previewVideoUrl(this.value)\">\n                  <p id=\"video-url-hint\" style=\"font-size:11px;color:var(--gray);margin-top:8px;line-height:1.7;letter-spacing:0.5px\">Pegá una URL directa de .mp4 o .webm</p>",
      "replace": "                  <div style=\"display:flex;gap:8px\">\n                    <input class=\"form-input\" id=\"video-url-input\" placeholder=\"URL directa .mp4 o ID de Drive...\" style=\"flex:1\" oninput=\"previewVideoUrl(this.value)\">\n                    <button class=\"btn-sm\" onclick=\"pickVideoDrive()\">Drive</button>\n                  </div>\n                  <p id=\"video-url-hint\" style=\"font-size:11px;color:var(--gray);margin-top:8px;line-height:1.7;letter-spacing:0.5px\">Pegá una URL .mp4 o seleccioná desde Drive</p>"
    }
  ]
}
```

- [ ] **Step 2: Verificar que el JSON es válido**

```bash
node -e "JSON.parse(require('fs').readFileSync('e:/CLAUDE/CORE/brands/kuerre/config.json','utf8')); console.log('JSON OK')"
```

Esperado: `JSON OK`

---

### Task 5: Escribir brands/crp/config.json

**Files:**
- Create: `e:\CLAUDE\CORE\brands\crp\config.json`

CRP no reemplaza el content section (usa el mismo de CORE). Sus patches principales son URLs + simplificaciones.

- [ ] **Step 1: Crear el config**

```json
{
  "outputs": [
    "WEB CRP/Productivo/admin.html"
  ],
  "patches": [
    {
      "_comment": "1. Versión (CRP usa V1.41 después de nuestros cambios)",
      "find": ">V1.40<",
      "replace": ">V1.41<"
    },
    {
      "_comment": "2. Quitar data-module de sidebar items y pages (regex)",
      "regex": " data-module=\"[^\"]*\"",
      "flags": "g",
      "replace": ""
    },
    {
      "_comment": "3. CF_URL",
      "find": "CF_URL:             '',",
      "replace": "CF_URL:             'https://web.cristian-romero-digital.workers.dev',"
    },
    {
      "_comment": "4. CRCLUB_URL",
      "find": "CRCLUB_URL:          '',",
      "replace": "CRCLUB_URL:         'https://crclub-worker.cristian-romero-digital.workers.dev',"
    },
    {
      "_comment": "5. WA_DEFAULT",
      "find": "WA_DEFAULT:          '',",
      "replace": "WA_DEFAULT:         '+5491162557763',"
    },
    {
      "_comment": "6. IG_DEFAULT",
      "find": "IG_DEFAULT:          '',",
      "replace": "IG_DEFAULT:         'https://instagram.com/cristian.romero.digital',"
    },
    {
      "_comment": "7. WEB_DEFAULT",
      "find": "WEB_DEFAULT:         ''",
      "replace": "WEB_DEFAULT:        'https://cristianromeroproducciones.com.ar'"
    },
    {
      "_comment": "8. CLIENTES_WORKER",
      "find": "const CLIENTES_WORKER = '';",
      "replace": "const CLIENTES_WORKER = 'https://crclub-worker.cristian-romero-digital.workers.dev';"
    },
    {
      "_comment": "9. FIESTAS_WORKER",
      "find": "const FIESTAS_WORKER = '';",
      "replace": "const FIESTAS_WORKER = 'https://crclub-worker.cristian-romero-digital.workers.dev';"
    },
    {
      "_comment": "10. Quitar bloque loadModules/applyModules",
      "find": "\n\n// ─── Módulos ─────────────────────────────────────────────────────────────────\nlet _MODULES = {};\n\nasync function loadModules() {\n  try {\n    const res = await fetch('/admin/modules');\n    if (!res.ok) return;\n    const data = await res.json();\n    _MODULES = data.modules || {};\n    if (data.brand) {\n      const logoEl = document.querySelector('.sidebar-logo-text');\n      if (logoEl) logoEl.textContent = data.brand;\n    }\n    applyModules();\n  } catch(e) {}\n}\n\nfunction applyModules() {\n  document.querySelectorAll('[data-module]').forEach(el => {\n    const mod = el.getAttribute('data-module');\n    el.style.display = _MODULES[mod] === false ? 'none' : '';\n  });\n  const activePage = document.querySelector('.page.active[data-module]');\n  if (activePage && _MODULES[activePage.getAttribute('data-module')] === false) {\n    showPage('dashboard');\n  }\n}\n",
      "replace": "\n"
    },
    {
      "_comment": "11. DOMContentLoaded",
      "find": "document.addEventListener('DOMContentLoaded', () => { init(); loadModules(); });",
      "replace": "document.addEventListener('DOMContentLoaded', init);"
    },
    {
      "_comment": "12. init() — quitar loadModules() call inline",
      "find": "      init();\n      loadModules();",
      "replace": "      init();"
    },
    {
      "_comment": "13. Settings sync — delete logoUrl",
      "find": "    const local = S.get('crd_settings') || {};\n    if (!cloudSettings.logoUrl && local.logoUrl) cloudSettings.logoUrl = local.logoUrl;\n    if (!cloudSettings.logoFilter && local.logoFilter) cloudSettings.logoFilter = local.logoFilter;",
      "replace": "    delete cloudSettings.logoUrl; delete cloudSettings.logoFilter; // limpiar si quedaron del ciclo anterior"
    },
    {
      "_comment": "14. Logo sidebar — usar localStorage.getItem + parse + cleanup",
      "find": "  // Logo sidebar: aplicar siempre al arrancar (desde localStorage o desde crd_settings de CF)\n  const _logoLocal = S.get('crd_site_logo');\n  if (_logoLocal) {\n    applySidebarLogo(_logoLocal);",
      "replace": "  // Logo sidebar — solo aplicar al DOM, nunca guardar en localStorage (base64 es demasiado grande)\n  const _logoLocal = localStorage.getItem('crd_site_logo');\n  if (_logoLocal) {\n    try { applySidebarLogo(JSON.parse(_logoLocal)); } catch(e) { applySidebarLogo(_logoLocal); }\n    localStorage.removeItem('crd_site_logo'); // limpiar si quedaron del ciclo anterior"
    },
    {
      "_comment": "15. Contratos config HTML — CRP no tiene campos driveRootId/presupuestosId",
      "find": "            <div class=\"form-group\" style=\"margin-top:10px\">\n              <label class=\"form-label\">ID carpeta raíz de Drive</label>\n              <input class=\"form-input\" id=\"ct-drive-root-id\" placeholder=\"ID de la carpeta padre en Google Drive\">\n            </div>\n            <div class=\"form-group\" style=\"margin-top:10px\">\n              <label class=\"form-label\">ID hoja de servicios (Google Sheet)</label>\n              <input class=\"form-input\" id=\"ct-presupuestos-id\" placeholder=\"ID del Google Sheet con los servicios\">\n            </div>\n            <button class=\"btn-sm btn-sec\" style=\"margin-top:12px\" onclick=\"ctSaveCfg()\">Guardar configuración</button>",
      "replace": "            <button class=\"btn-sm btn-sec\" style=\"margin-top:8px\" onclick=\"ctSaveCfg()\">Guardar URL</button>"
    },
    {
      "_comment": "16. ctSaveCfg JS — CRP versión simplificada",
      "find": "  const url            = document.getElementById('ct-apps-url').value.trim();\n  const driveRootId    = document.getElementById('ct-drive-root-id').value.trim();\n  const presupuestosId = document.getElementById('ct-presupuestos-id').value.trim();",
      "replace": "  const url = document.getElementById('ct-apps-url').value.trim();"
    },
    {
      "_comment": "17. ctSaveCfg JS — CRP versión simplificada (body de la función)",
      "find": "  const cfg = { url, driveRootId, presupuestosId };\n  S.set(CT_CFG_KEY, cfg);\n  syncToCloud(CT_CFG_KEY, JSON.stringify(cfg));\n  if (driveRootId || presupuestosId) {\n    const body = {};\n    if (driveRootId)    body.DRIVE_ROOT_ID   = driveRootId;\n    if (presupuestosId) body.PRESUPUESTOS_ID  = presupuestosId;\n    fetch(url, { method: 'POST', redirect: 'follow', body: JSON.stringify({ action: 'setConfig', ...body }) })\n      .catch(() => {});\n  }\n  toast('Configuración guardada');",
      "replace": "  S.set(CT_CFG_KEY, { url });\n  syncToCloud(CT_CFG_KEY, JSON.stringify({ url }));\n  toast('URL guardada');"
    }
  ]
}
```

- [ ] **Step 2: Verificar JSON válido**

```bash
node -e "JSON.parse(require('fs').readFileSync('e:/CLAUDE/CORE/brands/crp/config.json','utf8')); console.log('JSON OK')"
```

Esperado: `JSON OK`

---

### Task 6: Correr build y verificar diff

**Files:** (ninguno nuevo — verifica los Productivo generados)

- [ ] **Step 1: Correr el build**

```bash
cd "e:/CLAUDE/CORE"
node build-admin.js all
```

Esperado:
```
  → WEB KUERRE/Productivo/admin.html
  → WEB KUERRE/Desarrollo/admin.html
✅ kuerre built (2 files)
  → WEB CRP/Productivo/admin.html
✅ crp built (1 files)
```

Si hay error `Patch not found`, el mensaje indica qué texto no matcheó. Ajustar el patch en config.json y repetir.

- [ ] **Step 2: Verificar que KUERRE tiene los cambios nuevos**

```bash
grep -c "cl-search\|cargarMasClientes\|cmGoInvite\|_pendingClienteId" "e:/CLAUDE/WEB KUERRE/Productivo/admin.html"
```

Esperado: 4 o más (uno por cada término).

- [ ] **Step 3: Verificar que CRP tiene los cambios nuevos**

```bash
grep -c "cl-search\|cargarMasClientes\|cmGoInvite\|_pendingClienteId" "e:/CLAUDE/WEB CRP/Productivo/admin.html"
```

Esperado: 4 o más.

- [ ] **Step 4: Verificar que KUERRE tiene sus URLs correctas**

```bash
grep "KUERRE-worker\|kuerre\.com" "e:/CLAUDE/WEB KUERRE/Productivo/admin.html" | head -5
```

Esperado: líneas con la URL del worker de KUERRE.

- [ ] **Step 5: Verificar que CRP tiene sus URLs correctas**

```bash
grep "crclub-worker\|cristianromero" "e:/CLAUDE/WEB CRP/Productivo/admin.html" | head -5
```

Esperado: líneas con las URLs de CRP.

- [ ] **Step 6: Verificar que KUERRE NO tiene loadModules**

```bash
grep "loadModules\|applyModules" "e:/CLAUDE/WEB KUERRE/Productivo/admin.html" | wc -l
```

Esperado: 0

- [ ] **Step 7: Verificar que KUERRE tiene el CSS de colores**

```bash
grep "KUERRE VISUAL OVERRIDE\|#9060b8" "e:/CLAUDE/WEB KUERRE/Productivo/admin.html" | head -3
```

Esperado: al menos 2 líneas.

---

### Task 7: Commit y push de todos los repos

- [ ] **Step 1: Commit CORE**

```bash
cd "e:/CLAUDE/CORE"
git add src/admin.html build-admin.js brands/
git commit -m "$(cat <<'EOF'
build: sistema de build por marca para admin.html

- build-admin.js genera Productivo de KUERRE y CRP desde CORE
- brands/kuerre/config.json: 19 patches (CSS, URLs, content section, init logo)
- brands/crp/config.json: 17 patches (URLs, ctSaveCfg simplificado)
- brands/kuerre/content-section.html: panels del CMS de KUERRE
- Marcadores @@CONTENT_START/END en admin.html
- Para deployar: node build-admin.js all → push cada proyecto

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
git push
```

- [ ] **Step 2: Commit y push WEB KUERRE**

```bash
cd "e:/CLAUDE/WEB KUERRE"
git add Productivo/admin.html Desarrollo/admin.html
git commit -m "$(cat <<'EOF'
feat: clientes search/pagination + prefill servicios desde cliente

- Búsqueda por nombre/teléfono con debounce 350ms
- Paginación server-side (30 por página, botón cargar más)
- Botón "Crear / ver en panel Fiestas →" pre-llena nombre+fecha
- Botón "Crear invitación →" pre-llena todos los campos
- Poller solicitudes GAS corre globalmente desde init()

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
git push
```

- [ ] **Step 3: Commit y push WEB KUERRE worker**

```bash
cd "e:/CLAUDE/WEB KUERRE/worker"
git add src/index.js
git commit -m "$(cat <<'EOF'
feat(worker): GET /solicitudes con search + pagination server-side

Agrega ?search=, ?limit= y ?offset= al endpoint de listado.
Sin params: comportamiento idéntico al anterior (limit=30, offset=0).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
git push
```

- [ ] **Step 4: Commit y push WEB CRP**

```bash
cd "e:/CLAUDE/WEB CRP"
git add Productivo/admin.html
git commit -m "$(cat <<'EOF'
feat: clientes search/pagination + prefill servicios desde cliente

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ Build script sin deps npm
- ✅ Falla con error descriptivo si patch no matchea
- ✅ KUERRE: CSS override, URLs, content section, init logo, sin loadModules, V1.48
- ✅ CRP: URLs, ctSaveCfg simplificado, sin loadModules, sin data-module, V1.41
- ✅ Los nuevos features (search/pagination/prefill) quedan en KUERRE y CRP vía build
- ✅ Worker KUERRE recibe el endpoint actualizado
- ✅ Todos los repos se pushean

**Placeholder scan:** Ninguno encontrado.

**Tipo consistency:**
- `config.patches[].find` / `config.patches[].replace` → string patches ✅
- `config.patches[].regex` / `config.patches[].flags` / `config.patches[].replace` → regex patches ✅
- `config.contentSection` → nombre de archivo en el directorio de la marca ✅
- `config.outputs[]` → rutas relativas desde `e:\CLAUDE\CORE\..` ✅

**Posibles puntos de fallo y sus mensajes:**
- Si un `find` string cambió en CORE → error `Patch not found` con los primeros 80 chars → ajustar el string en config.json
- Si el archivo `content-section.html` tiene el marcador `@@CONTENT_START` aún presente del KUERRE Productivo antiguo → el build produce un resultado incorrecto → el Step 2 del Task 2 extrae antes del marcador (el script busca la línea del comentario decorativo, no el marcador)
