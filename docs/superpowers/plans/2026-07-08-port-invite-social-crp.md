# Port del modelo de invitación Social de Kuerre a CRP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el admin de CRP tenga el selector Clásico/Social en el modal de invitaciones (igual que Kuerre V1.74) y que exista `invite-social.html` funcionando en cristianromeroproducciones.com.ar, sin cambiar un solo byte del Kuerre deployado.

**Architecture:** El modelo Social vive hoy como 10 patches en `brands/kuerre/config.json` (índices 26–35, comments "27." a "36."). Se verificó empíricamente que los 10 aplican en secuencia sobre el CORE crudo normalizado a LF sin depender de ningún otro patch de kuerre, y que no contienen ningún valor específico de marca (ni URLs kuerre, ni colores). Por lo tanto se **hornean en `CORE/src/admin.html`** (pasan a ser código compartido), se **eliminan del config de kuerre**, y el build de kuerre debe quedar **byte-idéntico** al actual (prueba de no-regresión). CRP los recibe gratis en su próximo build. El frontend `invite-social.html` se copia de Kuerre a CRP Productivo cambiando solo 2 URLs de worker (mismo patrón que ya usa el `invite.html` clásico de CRP: config/settings desde el worker `web`, RSVP contra `crclub-worker`).

**Tech Stack:** Vanilla HTML/JS, `build-admin.cjs` (Node sin deps), git, `deploy-admin.js` (ofuscador de CRP).

## Global Constraints

- **Kuerre no se toca en producción**: tras el refactor, `WEB KUERRE/Productivo/admin.html` debe ser byte-idéntico al actual (V1.74). Si no lo es, PARAR y diagnosticar antes de seguir.
- **CRP solo suma**: el diff del admin de CRP debe contener únicamente los bloques sociales + bump de versión. Nada del flujo clásico cambia.
- Regla de memoria `feedback-core-cross-brand-safety`: buildear solo la marca que se está tocando cuando sea posible; acá se buildean ambas porque el CORE cambia, pero kuerre se valida byte a byte.
- Versiones: CORE `V1.89` → `V1.90` (en `src/admin.html` línea ~397). CRP `>V2.01<` → `>V2.02<` (en `brands/crp/config.json` patch 0). Kuerre queda en `V1.74` (sin cambio de output → sin deploy).
- Mensajes de commit: descriptivos, con `git commit -F <archivo>` (el sandbox bloquea `-m` con rutas). Terminar con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Preservar line endings del `CORE/src/admin.html` tal como están en disco (el script de horneado detecta y restaura CRLF si aplica).
- No hay test runner: la verificación es por script Node (balance de divs, greps), diffs y curl.

---

### Task 1: Baseline de Kuerre (hash de referencia)

**Files:**
- Lee: `e:/CLAUDE/WEB KUERRE/Productivo/admin.html`
- Crea: `C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/3f65ca2e-e2db-4c04-bbdb-507c06088571/scratchpad/kuerre-baseline.sha256`

**Interfaces:**
- Produces: archivo `kuerre-baseline.sha256` con el hash SHA-256 del admin de kuerre ANTES de tocar nada. Task 4 lo consume.

- [ ] **Step 1: Confirmar working trees limpios**

```bash
git -C "e:/CLAUDE/CORE" status --short
git -C "e:/CLAUDE/WEB KUERRE" status --short
```
Expected: sin archivos `M` (modificados). Si hay, resolver antes de seguir.

- [ ] **Step 2: Build de kuerre en frío y guardar hash**

```bash
cd "e:/CLAUDE/CORE" && node build-admin.cjs kuerre
sha256sum "e:/CLAUDE/WEB KUERRE/Productivo/admin.html" | tee "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/3f65ca2e-e2db-4c04-bbdb-507c06088571/scratchpad/kuerre-baseline.sha256"
```
Expected: build OK, hash impreso y guardado.

- [ ] **Step 3: Verificar que ese build no cambió nada versionado**

```bash
git -C "e:/CLAUDE/WEB KUERRE" status --short
```
Expected: limpio (el build regenera lo mismo que está commiteado). Si aparece `M`, el working tree no estaba sincronizado con el config — investigar antes de seguir.

---

### Task 2: Hornear los 10 patches sociales en CORE/src/admin.html

**Files:**
- Modify: `e:/CLAUDE/CORE/src/admin.html` (se le inyectan los replaces de los patches 26–35 de kuerre)
- Crea: `C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/3f65ca2e-e2db-4c04-bbdb-507c06088571/scratchpad/bake-social.cjs`

**Interfaces:**
- Consumes: `brands/kuerre/config.json` tal como está HOY (con los 10 patches sociales aún presentes).
- Produces: `CORE/src/admin.html` con el selector Clásico/Social, campos sociales, y funciones JS (`setInvModelo`, `getInvSocialBaseUrl`, `openDriveBrowserCarousel`, `renderCarouselPreview`, `toggleTriviaEditor`, `triviaAgregar`, etc.) como código compartido. Versión interna `V1.90`.

- [ ] **Step 1: Escribir el script de horneado**

Crear `C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/3f65ca2e-e2db-4c04-bbdb-507c06088571/scratchpad/bake-social.cjs`:

```js
// Hornea los patches sociales de kuerre en CORE/src/admin.html.
// Selección por _comment ("27." a "36.") — no por índice, por robustez.
const fs = require('fs');
const path = require('path');
const CORE_DIR = 'e:/CLAUDE/CORE';
const SRC = path.join(CORE_DIR, 'src', 'admin.html');

const cfg = JSON.parse(fs.readFileSync(path.join(CORE_DIR, 'brands/kuerre/config.json'), 'utf8'));
const SOCIAL_RX = /^(2[7-9]|3[0-6])\. /;
const social = cfg.patches.filter(p => SOCIAL_RX.test(p._comment || ''));
if (social.length !== 10) { console.error('Esperaba 10 patches sociales, hay', social.length); process.exit(1); }

const raw = fs.readFileSync(SRC, 'utf8');
const hadCRLF = raw.includes('\r\n');
let html = raw.replace(/\r\n/g, '\n');

for (const p of social) {
  if (p.regex) { html = html.replace(new RegExp(p.regex, p.flags || 'g'), p.replace); continue; }
  if (!html.includes(p.find)) { console.error('FALLA:', p._comment); process.exit(1); }
  html = html.split(p.find).join(p.replace);
}

// Bump de versión CORE
if (!html.includes('>V1.89<')) { console.error('No encontré V1.89 para bumpear'); process.exit(1); }
html = html.replace('>V1.89<', '>V1.90<');

if (hadCRLF) html = html.replace(/\n/g, '\r\n');
fs.writeFileSync(SRC, html, 'utf8');
console.log('OK — 10 patches horneados + bump V1.90. CRLF preservado:', hadCRLF);
```

- [ ] **Step 2: Ejecutarlo**

```bash
node "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/3f65ca2e-e2db-4c04-bbdb-507c06088571/scratchpad/bake-social.cjs"
```
Expected: `OK — 10 patches horneados + bump V1.90.`

- [ ] **Step 3: Verificar marcadores sociales en el CORE**

```bash
grep -c "inv-campos-social\|inv-modelo-social\|setInvModelo\|getInvSocialBaseUrl\|toggleTriviaEditor" "e:/CLAUDE/CORE/src/admin.html"
```
Expected: número > 0 (los 5 marcadores presentes; con `grep -c` alcanza con que sea ≥ 5).

---

### Task 3: Quitar los patches sociales de brands/kuerre/config.json

**Files:**
- Modify: `e:/CLAUDE/CORE/brands/kuerre/config.json` (eliminar los 10 patches sociales; el resto queda igual, en el mismo orden)

**Interfaces:**
- Consumes: el mismo criterio de selección `/^(2[7-9]|3[0-6])\. /` sobre `_comment` que usó Task 2.
- Produces: config de kuerre con 31 patches (41 − 10). El build de kuerre con este config sobre el CORE horneado debe dar byte-idéntico al baseline.

- [ ] **Step 1: Eliminar los patches y reescribir el JSON**

```bash
cd "e:/CLAUDE/CORE" && node -e "
const fs = require('fs');
const f = 'brands/kuerre/config.json';
const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
const SOCIAL_RX = /^(2[7-9]|3[0-6])\. /;
const before = cfg.patches.length;
cfg.patches = cfg.patches.filter(p => !SOCIAL_RX.test(p._comment || ''));
console.log('patches:', before, '→', cfg.patches.length);
if (before - cfg.patches.length !== 10) { console.error('No eliminé exactamente 10'); process.exit(1); }
fs.writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
JSON.parse(fs.readFileSync(f, 'utf8'));
console.log('JSON válido');
"
```
Expected: `patches: 41 → 31` y `JSON válido`. (El archivo queda reformateado por JSON.stringify — aceptable, el contenido es lo que valida Task 4.)

---

### Task 4: Build kuerre → verificar byte-idéntico (gate de no-regresión)

**Files:**
- Regenera: `e:/CLAUDE/WEB KUERRE/Productivo/admin.html`, `e:/CLAUDE/WEB KUERRE/Desarrollo/admin.html`
- Lee: `kuerre-baseline.sha256` de Task 1

**Interfaces:**
- Consumes: CORE horneado (Task 2) + config kuerre sin patches sociales (Task 3).
- Produces: prueba de que kuerre no cambió. **Si este gate falla, NO avanzar a Task 5**: diffear (`git -C "e:/CLAUDE/WEB KUERRE" diff Productivo/admin.html | head -100`), corregir el horneado, repetir.

- [ ] **Step 1: Build kuerre**

```bash
cd "e:/CLAUDE/CORE" && node build-admin.cjs kuerre
```
Expected: `✅ kuerre built (2 files)`. Si tira "Patch not found" es que un patch no-social de kuerre dependía del texto pre-horneado — diagnosticar cuál y regenerar su `find` desde el CORE horneado.

- [ ] **Step 2: Comparar hash con el baseline**

```bash
sha256sum "e:/CLAUDE/WEB KUERRE/Productivo/admin.html"
cat "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/3f65ca2e-e2db-4c04-bbdb-507c06088571/scratchpad/kuerre-baseline.sha256"
git -C "e:/CLAUDE/WEB KUERRE" status --short
```
Expected: los dos hashes **idénticos** y `git status` de WEB KUERRE **limpio**. Kuerre no necesita deploy.

---

### Task 5: Bump CRP a V2.02 y build crp con verificación estructural

**Files:**
- Modify: `e:/CLAUDE/CORE/brands/crp/config.json` (patch 0: `>V2.01<` → `>V2.02<`)
- Regenera: `e:/CLAUDE/WEB CRP/Productivo/admin.html`, `e:/CLAUDE/WEB CRP/Desarrollo/admin.html`

**Interfaces:**
- Consumes: CORE horneado.
- Produces: admin de CRP V2.02 con el modal Social. IDs/funciones disponibles para el frontend: el form social escribe `config.modelo = 'social'` vía `readInviteForm` y `genInviteUrl` usa `getInvSocialBaseUrl()` cuando `modelo === 'social'` (fallback: `getInvBaseUrl().replace('invite.html','invite-social.html')`).

- [ ] **Step 1: Bump de versión CRP**

En `e:/CLAUDE/CORE/brands/crp/config.json`, patch 0, cambiar con el tool Edit:

```json
      "replace": ">V2.02<"
```
(era `">V2.01<"`)

- [ ] **Step 2: Build crp**

```bash
cd "e:/CLAUDE/CORE" && node build-admin.cjs crp
```
Expected: `✅ crp built (2 files)`. Si tira "Patch not found", un patch de crp matcheaba texto que el horneado cambió — regenerar su `find` desde el CORE horneado.

- [ ] **Step 3: Verificación estructural del output CRP**

```bash
cd "e:/CLAUDE/CORE" && node -e "
const fs = require('fs');
const t = fs.readFileSync('e:/CLAUDE/WEB CRP/Productivo/admin.html', 'utf8');
const lines = t.split('\n');
const idx = {
  clasicoClose: lines.findIndex(l => l.includes('/inv-campos-clasico')),
  socialOpen:   lines.findIndex(l => l.includes('id=\"inv-campos-social\"')),
  socialClose:  lines.findIndex(l => l.includes('/inv-campos-social')),
};
console.log(idx);
if (!(idx.clasicoClose > 0 && idx.clasicoClose < idx.socialOpen && idx.socialOpen < idx.socialClose)) { console.error('ORDEN MAL'); process.exit(1); }
// balance de divs del modal-body del modal de invitaciones
let start = -1;
for (let i = idx.clasicoClose; i >= 0; i--) if (/class=\"modal-body\"/.test(lines[i])) { start = i; break; }
let bal = 0, end = -1;
for (let i = start; i < lines.length; i++) {
  bal += (lines[i].match(/<div\b/g) || []).length;
  bal -= (lines[i].match(/<\/div>/g) || []).length;
  if (bal === 0) { end = i; break; }
}
if (end < idx.socialClose) { console.error('modal-body cierra ANTES del bloque social — anidación rota'); process.exit(1); }
console.log('modal-body abre en', start + 1, 'cierra en', end + 1, '— social adentro ✓');
const funcs = ['setInvModelo', 'getInvSocialBaseUrl', 'openDriveBrowserCarousel', 'toggleTriviaEditor', 'triviaAgregar'];
for (const f of funcs) if (!t.includes(f)) { console.error('FALTA función', f); process.exit(1); }
console.log('funciones sociales presentes ✓');
if (!t.includes('>V2.02<')) { console.error('versión no bumpeada'); process.exit(1); }
console.log('V2.02 ✓');
"
```
Expected: `social adentro ✓`, `funciones sociales presentes ✓`, `V2.02 ✓`.

- [ ] **Step 4: Revisar que el diff de CRP sea SOLO social + versión**

```bash
git -C "e:/CLAUDE/WEB CRP/Productivo" diff --stat admin.html
git -C "e:/CLAUDE/WEB CRP/Productivo" diff admin.html | grep "^[-+]" | grep -v "^[-+][-+]" | grep -vi "social\|modelo\|carousel\|trivia\|V2\.0\|inv-s-\|inv-hero-emoji\|inv-color-tema\|frase-emotiva\|album-url\|db-btn" | head -30
```
Expected: el segundo comando imprime pocas líneas o ninguna (todo hunk pertenece al bloque social). Revisar manualmente lo que aparezca; si hay cambios ajenos al scope, PARAR y diagnosticar.

---

### Task 6: Portar invite-social.html a CRP (2 URLs de worker)

**Files:**
- Create: `e:/CLAUDE/WEB CRP/Productivo/invite-social.html` (copia de `e:/CLAUDE/WEB KUERRE/Desarrollo/invite-social.html`, que es idéntico al Productivo de kuerre — verificado)

**Interfaces:**
- Consumes: worker `web` de CRP (`https://web.cristian-romero-digital.workers.dev`) para `GET /invite/{slug}` y `GET /crd_settings` (mismos endpoints que ya usa el `invite.html` clásico de CRP), y `crclub-worker` para `POST /rsvp/{slug}`.
- Produces: página pública en `https://cristianromeroproducciones.com.ar/invite-social.html?i={slug}`.

- [ ] **Step 1: Copiar y reemplazar las 2 URLs por contexto**

El archivo de kuerre usa `https://kuerre-worker.cristian-romero-digital.workers.dev` en 2 lugares con destinos DISTINTOS en CRP — no hacer replace global ciego:

```bash
node -e "
const fs = require('fs');
let t = fs.readFileSync('e:/CLAUDE/WEB KUERRE/Desarrollo/invite-social.html', 'utf8');
const KW = /kuerre-worker\.cristian-romero-digital\.workers\.dev/gi;
const count = (t.match(KW) || []).length;
if (count !== 2) { console.error('Esperaba 2 URLs kuerre-worker, hay', count, '— revisar el archivo a mano'); process.exit(1); }
// 1) CF_URL (config de invitación + crd_settings) → worker web
t = t.replace(/CF_URL:\s*'https:\/\/kuerre-worker\.cristian-romero-digital\.workers\.dev'/i,
              \"CF_URL: 'https://web.cristian-romero-digital.workers.dev'\");
// 2) POST de RSVP → crclub-worker
t = t.replace(/https:\/\/kuerre-worker\.cristian-romero-digital\.workers\.dev\/rsvp\//i,
              'https://crclub-worker.cristian-romero-digital.workers.dev/rsvp/');
if ((t.match(KW) || []).length !== 0) { console.error('Quedó una URL kuerre sin reemplazar'); process.exit(1); }
fs.writeFileSync('e:/CLAUDE/WEB CRP/Productivo/invite-social.html', t, 'utf8');
console.log('OK — invite-social.html porteado a CRP');
"
```
Expected: `OK — invite-social.html porteado a CRP`.

- [ ] **Step 2: Verificar que no quedó branding kuerre**

```bash
grep -in "kuerre" "e:/CLAUDE/WEB CRP/Productivo/invite-social.html" || echo "SIN RASTROS KUERRE ✓"
```
Expected: `SIN RASTROS KUERRE ✓`. (El branding visible — logo, nombre — se carga en runtime desde `/crd_settings` del worker `web`, igual que el invite clásico.)

---

### Task 7: Verificar endpoints del worker CRP (sin cambios de worker)

**Files:** ninguno — solo verificación remota.

**Interfaces:**
- Produces: confirmación de que NO hace falta tocar ningún worker: el clásico ya usa exactamente los mismos endpoints.

- [ ] **Step 1: GET /invite/{slug} en worker web**

```bash
curl -s -o /dev/null -w "%{http_code}" "https://web.cristian-romero-digital.workers.dev/invite/slug-inexistente-test"
```
Expected: `404` (o `200` con error JSON) — la ruta existe. Si diera `1042` o HTML de error de Cloudflare, la ruta no existe y hay que investigar (no debería: el invite clásico de CRP la usa hoy).

- [ ] **Step 2: POST /rsvp en crclub-worker responde**

```bash
curl -s -o /dev/null -w "%{http_code}" "https://crclub-worker.cristian-romero-digital.workers.dev/rsvp/slug-inexistente-test"
```
Expected: `200`/`404`/`405` — cualquier respuesta del worker confirma la ruta viva (el panel RSVP clásico de CRP la usa hoy).

---

### Task 8: Commits y deploy (CORE + CRP; Kuerre NO se deploya)

**Files:**
- Commit en `e:/CLAUDE/CORE`: `src/admin.html`, `brands/kuerre/config.json`, `brands/crp/config.json`
- Commit en `e:/CLAUDE/WEB CRP` (repo raíz, sin remote): `Desarrollo/admin.html`
- Commit+push en `e:/CLAUDE/WEB CRP/Productivo` (web.git): `invite-social.html` y luego `admin.html` vía `deploy-admin.js`

**Interfaces:**
- Consumes: todos los gates anteriores en verde.
- Produces: CRP live con Social; kuerre intacto (verificado en Task 4 que no hay nada que commitear en WEB KUERRE).

- [ ] **Step 1: Commit + push CORE**

Escribir el mensaje en un archivo del scratchpad (el sandbox bloquea `-m` con rutas):

```
CORE V1.90: modelo Social de invitaciones pasa de patches kuerre a codigo compartido

Los 10 patches sociales (27-36) de brands/kuerre/config.json se hornean
en src/admin.html sin cambios (verificado: build kuerre byte-identico a
V1.74). CRP los recibe en su build V2.02. Ningun patch contenia valores
especificos de marca.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

```bash
cd "e:/CLAUDE/CORE" && git add src/admin.html brands/kuerre/config.json brands/crp/config.json && git commit -F "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/3f65ca2e-e2db-4c04-bbdb-507c06088571/scratchpad/msg-core-social.txt" && git push
```
Expected: push OK a kuerre-core.git.

- [ ] **Step 2: Confirmar una vez más que WEB KUERRE está limpio**

```bash
git -C "e:/CLAUDE/WEB KUERRE" status --short
```
Expected: limpio. No se commitea ni deploya nada de kuerre.

- [ ] **Step 3: Commit invite-social.html en CRP Productivo y push**

Mensaje:

```
invite-social.html: port del modelo Social desde Kuerre

Misma pagina que kuerre con 2 URLs adaptadas: config/settings desde el
worker web y RSVP contra crclub-worker (mismo patron que invite.html
clasico). Branding se carga en runtime desde crd_settings.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

```bash
cd "e:/CLAUDE/WEB CRP/Productivo" && git add invite-social.html && git commit -F "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/3f65ca2e-e2db-4c04-bbdb-507c06088571/scratchpad/msg-crp-social.txt" && git push
```
Expected: push OK a web.git.

- [ ] **Step 4: Deploy del admin CRP (ofuscado)**

```bash
cd "e:/CLAUDE/WEB CRP" && node deploy-admin.js
```
Expected: `JS obfuscado`, commit `deploy: admin.html obfuscado`, `✓ Pusheado a GitHub`, `✓ Fuente local restaurado`. (El script commitea y pushea SOLO admin.html en Productivo y restaura el fuente legible.)

- [ ] **Step 5: Commit del Desarrollo/admin.html en el repo raíz de CRP (local, sin remote)**

```bash
cd "e:/CLAUDE/WEB CRP" && git add Desarrollo/admin.html Productivo && git commit -F "C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/3f65ca2e-e2db-4c04-bbdb-507c06088571/scratchpad/msg-crp-social.txt"
```
Expected: commit local OK (este repo no tiene remote — es solo historial).

---

### Task 9: Verificación live

**Files:** ninguno.

- [ ] **Step 1: invite-social.html responde en el dominio**

```bash
curl -s -o /dev/null -w "%{http_code}" "https://cristianromeroproducciones.com.ar/invite-social.html"
```
Expected: `200`. Si `404`, esperar el build de Pages (hasta 10 min de cache por `feedback_forzar_cache_deploy` + posible flakiness de pages-build-deployment por `project_web_crp_pages_deploy_flaky` — `gh run list` en el repo web y rerun si falló).

- [ ] **Step 2: Admin CRP versión nueva**

```bash
curl -s "https://cristianromeroproducciones.com.ar/admin.html" | grep -o "V2\.0[0-9]" | head -1
```
Expected: `V2.02` (con hasta 10 min de retraso por cache del CDN).

- [ ] **Step 3: Prueba manual del usuario (checklist para pasarle)**

1. Abrir el admin de CRP → Invitaciones → Nueva invitación → debe aparecer el selector CLÁSICO / SOCIAL ✦.
2. Elegir SOCIAL, cargar nombre + fecha + color de tema, "Guardar y previsualizar" → debe abrir `cristianromeroproducciones.com.ar/invite-social.html?i={slug}` con la invitación renderizada.
3. Verificar que una invitación CLÁSICA existente sigue abriendo y editándose igual que antes (no-regresión del flujo viejo).

---

## Self-Review

**Spec coverage:** (a) opción Social en admin CRP → Tasks 2+5; (b) "así como está en kuerre" → los patches se hornean sin modificar, byte-idéntico verificado en Task 4; (c) "sin romper nada" → gate byte-idéntico kuerre (Task 4), diff-scope CRP (Task 5 Step 4), verificación de endpoints sin tocar workers (Task 7), checklist de no-regresión clásica (Task 9). (d) Página pública → Task 6.

**Placeholders:** ninguno — todos los pasos tienen código/comandos completos.

**Consistencia de nombres:** `bake-social.cjs`, `SOCIAL_RX /^(2[7-9]|3[0-6])\. /`, hashes en `kuerre-baseline.sha256`, funciones `setInvModelo`/`getInvSocialBaseUrl` usadas consistentemente entre Tasks 2, 5 y 6.

**Riesgo conocido asumido:** el reformateo de `brands/kuerre/config.json` por `JSON.stringify` (Task 3) produce un diff grande de formato; es aceptable porque la validación real es el output byte-idéntico de Task 4.
