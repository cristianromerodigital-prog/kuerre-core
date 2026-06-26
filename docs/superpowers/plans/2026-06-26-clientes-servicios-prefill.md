# Clientes → Servicios Pre-fill + Paginación Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evitar carga doble de datos: desde el modal de un cliente, navegar directamente a Fiestas/Invitaciones con los datos pre-llenados; además agregar búsqueda + paginación server-side en la lista de clientes para escalar a miles de registros; y mantener el poller de solicitudes GAS siempre activo.

**Architecture:** El Worker agrega `?search=&limit=&offset=` al endpoint `GET /solicitudes`. El admin guarda `_clienteActual` al navegar entre secciones y pre-llena formularios al detectar `_pendingClienteId`. El poller GAS se mueve a `init()` para correr globalmente.

**Tech Stack:** Cloudflare Workers + D1 (SQL), Vanilla JS (admin.html), sin build system.

## Global Constraints

- Sin cambios de schema en D1 — solo modificar queries SELECT existentes
- No tocar lógica de auth, no agregar endpoints nuevos
- Todo JS/CSS inline en admin.html — sin archivos separados
- Preservar comportamiento existente cuando no se pasan params nuevos (retrocompatible)
- Respetar indentación y estilo del archivo original en cada edición

---

### Task 1: Worker — search + pagination en `GET /solicitudes`

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\worker\src\index.js` (funciones líneas 58-66 y 300-302)

**Interfaces:**
- Produce: `GET /solicitudes?search=lucia&limit=30&offset=0` → `{ solicitudes: [...], total: 42, limit: 30, offset: 0 }`
- Sin params → comportamiento idéntico al actual (limit=30, offset=0, sin filtro)

- [ ] **Step 1: Reemplazar `handleSolicitudesList`**

En `e:\CLAUDE\WEB KUERRE\worker\src\index.js`, reemplazar las líneas 58-67:

```javascript
async function handleSolicitudesList(env, request) {
  const u      = new URL(request.url);
  const search = (u.searchParams.get('search') || '').trim();
  const limit  = Math.min(parseInt(u.searchParams.get('limit')  || '30', 10), 100);
  const offset = Math.max(parseInt(u.searchParams.get('offset') || '0',  10), 0);

  const likeTerm = search ? '%' + search + '%' : null;
  const where    = search
    ? 'WHERE (s.nombre_display LIKE ? OR s.cliente_nombre LIKE ? OR s.cliente_tel LIKE ?)'
    : '';
  const baseParams = search ? [likeTerm, likeTerm, likeTerm] : [];

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM solicitudes s ${where}`
  ).bind(...baseParams).first();
  const total = countRow ? countRow.n : 0;

  const { results } = await env.DB.prepare(`
    SELECT s.*, ef.estado AS fiesta_estado, ec.folder_id AS entrega_folder
    FROM solicitudes s
    LEFT JOIN eventos_foto ef ON ef.id = s.fiesta_id
    LEFT JOIN entrega_configs ec ON ec.id = s.id
    ${where}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...baseParams, limit, offset).all();

  return json({ solicitudes: results, total, limit, offset });
}
```

- [ ] **Step 2: Pasar `request` al llamado de la función**

En la misma línea del route handler (~línea 302), cambiar:

```javascript
// ANTES:
return await handleSolicitudesList(env);

// DESPUÉS:
return await handleSolicitudesList(env, request);
```

- [ ] **Step 3: Verificar manualmente en Wrangler dev**

```bash
cd "e:\CLAUDE\WEB KUERRE\worker"
npx wrangler dev
```

Abrir en browser:
- `http://localhost:8787/solicitudes` → debe devolver `{ solicitudes:[...], total: N, limit:30, offset:0 }`
- `http://localhost:8787/solicitudes?search=lucia` → filtra por nombre
- `http://localhost:8787/solicitudes?limit=5&offset=5` → segunda página

- [ ] **Step 4: Commit**

```bash
git add "e:\CLAUDE\WEB KUERRE\worker\src\index.js"
git commit -m "feat(worker): add search + pagination to GET /solicitudes"
```

---

### Task 2: Frontend — state vars + `_fetchClientes` con params + UI búsqueda/paginación

**Files:**
- Modify: `e:\CLAUDE\CORE\src\admin.html` (bloque CLIENTES ~línea 3305, función `loadClientesPage` ~3340, `renderClientes` ~3362, HTML panel clientes ~2177)

**Interfaces:**
- Consumes: Worker response `{ solicitudes, total, limit, offset }` (Task 1)
- Produce: `_fetchClientes({ search, limit, offset })` — actualiza `_clientes` y `_totalClientes`

- [ ] **Step 1: Actualizar variables de estado del bloque CLIENTES**

Localizar el bloque `// ── CLIENTES ──` (~línea 3306). Cambiar:

```javascript
// ANTES:
const CLIENTES_WORKER = '';
let _clientes = [];
let _clienteActual = null;
let _clientesCargados = false;
let _clientesPoller = null;

// DESPUÉS:
const CLIENTES_WORKER = '';
let _clientes = [];
let _clienteActual = null;
let _clientesCargados = false;
let _clientesPoller = null;
let _totalClientes = 0;
let _clientesSearch = '';
let _clientesOffset = 0;
const CLIENTES_LIMIT = 30;
```

- [ ] **Step 2: Actualizar `_fetchClientes` para aceptar opts**

Reemplazar la función `_fetchClientes` (~línea 3332):

```javascript
async function _fetchClientes(opts) {
  const search = opts && opts.search !== undefined ? opts.search : _clientesSearch;
  const limit  = CLIENTES_LIMIT;
  const offset = opts && opts.offset !== undefined ? opts.offset : _clientesOffset;

  const params = new URLSearchParams({ limit, offset });
  if (search) params.set('search', search);

  const r = await fetch(CLIENTES_WORKER + '/solicitudes?' + params.toString(), {
    headers: { 'Authorization': 'Bearer ' + getAdminJWT() }
  });
  const d = await r.json();

  _clientesSearch = search;
  _clientesOffset = offset;
  _totalClientes  = d.total || 0;

  if (offset === 0) {
    _clientes = d.solicitudes || [];
  } else {
    _clientes = _clientes.concat(d.solicitudes || []);
  }
  _clientesCargados = true;
}
```

- [ ] **Step 3: Actualizar `loadClientesPage` para resetear y buscar**

Reemplazar `loadClientesPage` (~línea 3340):

```javascript
async function loadClientesPage() {
  _clientesSearch = '';
  _clientesOffset = 0;
  const searchEl = document.getElementById('cl-search');
  if (searchEl) searchEl.value = '';
  document.getElementById('clientes-list').innerHTML = '<div style="color:var(--gray2);font-size:12px">Cargando...</div>';
  try {
    await _fetchClientes({ search: '', offset: 0 });
    renderClientes();
  } catch(e) {
    document.getElementById('clientes-list').innerHTML = '<div style="color:var(--red);font-size:12px">Error: ' + e.message + '</div>';
  }
}
```

- [ ] **Step 4: Agregar función de búsqueda con debounce**

Agregar justo después de `loadClientesPage`:

```javascript
let _clSearch_t = null;
function onClSearchInput(val) {
  clearTimeout(_clSearch_t);
  _clSearch_t = setTimeout(async function() {
    _clientesOffset = 0;
    document.getElementById('clientes-list').innerHTML = '<div style="color:var(--gray2);font-size:12px">Buscando...</div>';
    try {
      await _fetchClientes({ search: val, offset: 0 });
      renderClientes();
    } catch(e) {
      document.getElementById('clientes-list').innerHTML = '<div style="color:var(--red);font-size:12px">Error: ' + e.message + '</div>';
    }
  }, 350);
}

async function cargarMasClientes() {
  const newOffset = _clientesOffset + CLIENTES_LIMIT;
  try {
    await _fetchClientes({ search: _clientesSearch, offset: newOffset });
    renderClientes();
  } catch(e) { toast('Error al cargar más clientes', 'error'); }
}
```

- [ ] **Step 5: Actualizar `renderClientes` para mostrar conteo y "Cargar más"**

Reemplazar la función `renderClientes(list)` (~línea 3362). Nota: ahora no recibe params, usa `_clientes` directamente:

```javascript
function renderClientes() {
  const list = _clientes;
  const el = document.getElementById('clientes-list');
  if (!list.length) {
    el.innerHTML = '<div style="color:var(--gray2);font-size:12px;padding:20px 0">Sin registros. Los clientes aparecerán aquí al completar el formulario de solicitud.</div>';
    return;
  }
  const fiestaOk_fn = s => s.fiesta_estado === 'activo';
  const entregaOk_fn = s => s.entrega_folder && s.entrega_folder.trim() !== '';
  let html = list.map(function(s) {
    const fiestaOk = fiestaOk_fn(s);
    const entregaOk = entregaOk_fn(s);
    const fBadge = fiestaOk
      ? '<span style="background:rgba(37,211,102,0.15);color:#25d366;font-size:9px;padding:2px 8px;border-radius:10px">Fiesta activa</span>'
      : '<span style="background:rgba(201,168,76,0.12);color:var(--gold);font-size:9px;padding:2px 8px;border-radius:10px">Fiesta pendiente</span>';
    const eBadge = entregaOk
      ? '<span style="background:rgba(0,212,212,0.12);color:var(--cyan);font-size:9px;padding:2px 8px;border-radius:10px">Entrega lista</span>'
      : '<span style="background:rgba(255,255,255,0.05);color:var(--gray2);font-size:9px;padding:2px 8px;border-radius:10px">Sin folder entrega</span>';
    const fechaFmt = s.fecha ? s.fecha.replace(/(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1') : '—';
    return '<div onclick="abrirClienteModal(\'' + s.id + '\')" style="background:var(--black3);border:1px solid rgba(255,255,255,0.06);padding:14px 18px;cursor:pointer;display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-radius:6px;transition:border-color 0.2s" onmouseover="this.style.borderColor=\'rgba(201,168,76,0.4)\'" onmouseout="this.style.borderColor=\'rgba(255,255,255,0.06)\'">'
      + '<div style="flex:1;min-width:160px">'
      + '<div style="font-size:13px;font-weight:500;margin-bottom:3px;color:var(--white)">' + escHtmlCl(s.nombre_display) + '</div>'
      + '<div style="font-size:10px;color:var(--gray2)">' + escHtmlCl(s.tipo) + ' · ' + fechaFmt + (s.cliente_tel ? ' · ' + escHtmlCl(s.cliente_tel) : '') + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">' + fBadge + eBadge + '</div>'
      + '</div>';
  }).join('');

  const hayMas = _clientes.length < _totalClientes;
  const resumen = '<div style="font-size:10px;color:var(--gray2);margin-bottom:12px">Mostrando ' + list.length + ' de ' + _totalClientes + ' clientes</div>';
  const cargarMas = hayMas
    ? '<div style="text-align:center;margin-top:14px"><button class="btn-sm btn-sec" onclick="cargarMasClientes()">Cargar más (' + (_totalClientes - list.length) + ' restantes)</button></div>'
    : '';

  el.innerHTML = resumen + html + cargarMas;
}
```

- [ ] **Step 6: Agregar search input en el HTML del panel clientes**

Localizar en el HTML (~línea 2177) el bloque:
```html
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
  <p style="font-size:12px;color:var(--gray2);letter-spacing:1px">Registros del formulario de alta · cada cliente genera automáticamente Fiesta QR, Invitación y Entrega.</p>
  <button class="btn-sm btn-sec" onclick="loadClientesPage()">↻ Actualizar</button>
</div>
```

Reemplazarlo con:
```html
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
  <p style="font-size:12px;color:var(--gray2);letter-spacing:1px">Registros del formulario de alta · cada cliente genera automáticamente Fiesta QR, Invitación y Entrega.</p>
  <button class="btn-sm btn-sec" onclick="loadClientesPage()">↻ Actualizar</button>
</div>
<div style="margin-bottom:16px">
  <input id="cl-search" type="text" placeholder="Buscar por nombre, teléfono..."
    style="background:var(--black2);border:1px solid rgba(255,255,255,0.08);color:var(--white);padding:9px 14px;font-size:13px;outline:none;width:100%;font-family:inherit;border-radius:4px"
    oninput="onClSearchInput(this.value)">
</div>
```

- [ ] **Step 7: Actualizar el poller para no renderizar si no está en la página**

En `_startClientesPoller`, la línea que hace `renderClientes(_clientes)` ahora debe llamar `renderClientes()` (sin args, ya que la función fue actualizada). Localizar (~línea 3322):

```javascript
// ANTES:
if (newIds !== prevIds) renderClientes(_clientes);

// DESPUÉS:
if (newIds !== prevIds && currentPage === 'clientes') renderClientes();
```

- [ ] **Step 8: Verificar en browser**

Abrir admin → sección Clientes. Verificar:
- Lista carga con "Mostrando X de Y clientes"
- Input de búsqueda filtra al escribir (debounce 350ms)
- "Cargar más" aparece si hay más de 30 clientes

- [ ] **Step 9: Commit**

```bash
git add "e:\CLAUDE\CORE\src\admin.html"
git commit -m "feat(admin): clientes list with server-side search + load-more pagination"
```

---

### Task 3: Frontend — Pre-fill Fiestas desde cliente modal

**Files:**
- Modify: `e:\CLAUDE\CORE\src\admin.html` (función `cmGoFiesta` ~3424, función `loadFiestasPage` ~8334, HTML modal clientes ~2196-2216)

**Interfaces:**
- Consumes: `_clienteActual` (global), `_pendingClienteId` (nueva var Task 3)
- Produce: Cuando se navega a fiestas con pending, pre-llena `fi-nombre`, `fi-fecha`, `fi-folder`

- [ ] **Step 1: Agregar `_pendingClienteId` junto a las vars de clientes (~línea 3309)**

```javascript
// Agregar después de: let _clientesCargados = false;
let _pendingClienteId = null;
```

- [ ] **Step 2: Reemplazar `cmGoFiesta()`**

```javascript
// ANTES:
function cmGoFiesta() {
  document.getElementById('cliente-modal').style.display = 'none';
  showPage('fiestas');
}

// DESPUÉS:
function cmGoFiesta() {
  if (_clienteActual) _pendingClienteId = _clienteActual.id;
  document.getElementById('cliente-modal').style.display = 'none';
  showPage('fiestas');
}
```

- [ ] **Step 3: Agregar pre-fill al final de `loadFiestasPage()`**

Al final de la función `loadFiestasPage` (~línea 8360, antes del cierre `}`), agregar:

```javascript
  // Pre-fill desde cliente si viene del modal
  if (_pendingClienteId) {
    const s = _clientes.find(function(x){ return x.id === _pendingClienteId; });
    if (s) {
      const nombreEl = document.getElementById('fi-nombre');
      const fechaEl  = document.getElementById('fi-fecha');
      const folderEl = document.getElementById('fi-folder');
      if (nombreEl && !nombreEl.value) nombreEl.value = s.nombre_display || '';
      if (fechaEl  && !fechaEl.value)  fechaEl.value  = s.fecha || '';
      if (folderEl && !folderEl.value) folderEl.value = s.drive_fiesta_id || '';
      const sec = document.querySelector('#page-fiestas .settings-section:nth-child(3)');
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('Datos de ' + s.nombre_display + ' pre-cargados');
    }
    _pendingClienteId = null;
  }
```

- [ ] **Step 4: Actualizar botón en el modal HTML (~línea 2201)**

```html
<!-- ANTES: -->
<button class="btn-sm btn-sec" onclick="cmGoFiesta()">Abrir en panel Fiestas ↗</button>

<!-- DESPUÉS: -->
<button class="btn-sm btn-sec" onclick="cmGoFiesta()">Crear / ver en panel Fiestas →</button>
```

- [ ] **Step 5: Verificar en browser**

1. Abrir admin → Clientes → click en cualquier cliente → modal se abre
2. Click "Crear / ver en panel Fiestas →"
3. Panel Fiestas debe abrir con `fi-nombre` y `fi-fecha` pre-llenados
4. Toast "Datos de X pre-cargados" debe aparecer

- [ ] **Step 6: Commit**

```bash
git add "e:\CLAUDE\CORE\src\admin.html"
git commit -m "feat(admin): pre-fill fiestas form from cliente modal"
```

---

### Task 4: Frontend — Pre-fill Invitaciones desde cliente modal

**Files:**
- Modify: `e:\CLAUDE\CORE\src\admin.html` (función `renderInvitesPage` ~5728, función `openInviteModal` ~5766, HTML modal clientes sección Invitación ~2218-2226)

**Interfaces:**
- Consumes: `_pendingClienteId` (Task 3), `_clienteActual`, `_clientes`
- Produce: `cmGoInvite()` — navega a invites con pending; `renderInvitesPage()` detecta pending y abre modal pre-llenado

**Mapeo de tipos cliente → tipo invitación:**
- `BODA` → `casamiento`
- `XV` → `quinces`
- `CUMPLE` → `otro`

- [ ] **Step 1: Agregar función `cmGoInvite()`**

Agregar justo después de `cmGoFiesta()` (~línea 3427):

```javascript
function cmGoInvite() {
  if (_clienteActual) _pendingClienteId = _clienteActual.id;
  document.getElementById('cliente-modal').style.display = 'none';
  showPage('invites');
}
```

- [ ] **Step 2: Agregar pre-fill al inicio de `renderInvitesPage()`**

Al inicio de `renderInvitesPage()` (~línea 5728), después de la primera línea `const baseInput = ...`, agregar:

```javascript
  // Pre-fill nueva invitación desde cliente
  if (_pendingClienteId) {
    const s = _clientes.find(function(x){ return x.id === _pendingClienteId; });
    _pendingClienteId = null;
    if (s) {
      const tipoMap = { BODA: 'casamiento', XV: 'quinces', CUMPLE: 'otro' };
      const tipo = tipoMap[s.tipo] || 'otro';
      const fechaFmt = s.fecha
        ? s.fecha.replace(/(\d{4})-(\d{2})-(\d{2})/, function(_, y, m, d){ return d + '/' + m + '/' + y; })
        : '';
      // Render la lista primero (el código existente continúa abajo), luego abre el modal
      setTimeout(function() {
        openInviteModal();
        document.getElementById('inv-tipo').value = tipo;
        document.getElementById('inv-novios').value = s.nombre_display || '';
        document.getElementById('inv-fecha-display').value = fechaFmt;
        document.getElementById('inv-fecha-iso').value = s.fecha || '';
        document.getElementById('inv-lugar-nombre').value = s.salon || '';
        document.getElementById('inv-lugar-dir').value = s.direccion || '';
        toast('Datos de ' + s.nombre_display + ' pre-cargados en invitación');
      }, 50);
    }
  }
```

- [ ] **Step 3: Actualizar sección Invitación en el HTML del modal (~línea 2219-2226)**

```html
<!-- ANTES: -->
<div style="border:1px solid rgba(255,255,255,0.07);padding:16px;margin-bottom:12px">
  <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:12px">Invitación Digital</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn-sm btn-sec" onclick="cmOpenInvite()">Abrir invite ↗</button>
    <button class="btn-sm" onclick="cmCopyInvite()">Copiar link invite</button>
  </div>
  <div style="font-size:10px;color:var(--gray2);margin-top:8px">Datos pre-cargados: nombres, fecha, salón. Configurá media y extras desde el panel Invitaciones.</div>
</div>

<!-- DESPUÉS: -->
<div style="border:1px solid rgba(255,255,255,0.07);padding:16px;margin-bottom:12px">
  <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:12px">Invitación Digital</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn-sm" onclick="cmGoInvite()">Crear invitación →</button>
    <button class="btn-sm btn-sec" onclick="cmOpenInvite()">Abrir invite ↗</button>
    <button class="btn-sm btn-sec" onclick="cmCopyInvite()">Copiar link</button>
  </div>
  <div style="font-size:10px;color:var(--gray2);margin-top:8px">"Crear invitación" abre el panel con nombre, fecha, salón y tipo pre-cargados.</div>
</div>
```

- [ ] **Step 4: Verificar en browser**

1. Abrir admin → Clientes → click en cliente con tipo BODA
2. Click "Crear invitación →"
3. Panel Invitaciones debe abrir y el modal de nueva invitación debe aparecer con `inv-novios`, `inv-fecha-display`, `inv-lugar-nombre` y tipo `casamiento` pre-llenados

- [ ] **Step 5: Commit**

```bash
git add "e:\CLAUDE\CORE\src\admin.html"
git commit -m "feat(admin): pre-fill invitaciones form from cliente modal"
```

---

### Task 5: Frontend — Poller de solicitudes GAS siempre activo

**Files:**
- Modify: `e:\CLAUDE\CORE\src\admin.html` (función `init` ~3646, `showPage` ~3617, `ctRefreshSolicitudes` ~8020)

**Interfaces:**
- Produce: `_solBadgePoller` global que corre cada 60s independientemente de la sección activa

**Nota:** `ctRefreshSolicitudes()` actualiza `ct-sol-badge` y `ct-sol-list`. Ambos están en el DOM siempre (dentro de `page-clientes`, que existe aunque esté oculto). No hay riesgo de null pointer.

- [ ] **Step 1: Agregar var `_solBadgePoller` junto a las demás vars globales**

Localizar ~línea 3311 (`let _clientesPoller = null;`), agregar debajo:

```javascript
let _solBadgePoller = null;
```

- [ ] **Step 2: Iniciar poller global en `init()`**

En `init()` (~línea 3646), agregar después de `_fetchClientes().catch(function(){});`:

```javascript
  // Poller global de solicitudes GAS — corre siempre, independiente de la sección activa
  ctInitSolicitudes();
  if (!_solBadgePoller) {
    _solBadgePoller = setInterval(function() { ctRefreshSolicitudes(); }, 60000);
  }
```

- [ ] **Step 3: Quitar `ctInitSolicitudes()` del `showPage('clientes')`**

En `showPage` (~línea 3617):

```javascript
// ANTES:
if (id === 'clientes') { loadClientesPage(); ctInitSolicitudes(); _startClientesPoller(); } else { _stopClientesPoller(); }

// DESPUÉS:
if (id === 'clientes') { loadClientesPage(); _startClientesPoller(); } else { _stopClientesPoller(); }
```

- [ ] **Step 4: Verificar en browser**

1. Abrir admin → entrar a cualquier sección (ej. Contratos)
2. Esperar 60s o ir a la consola y ejecutar `ctRefreshSolicitudes()`
3. Navegar a Clientes → el badge debe estar actualizado sin necesidad de haber pasado por esa sección antes

- [ ] **Step 5: Commit**

```bash
git add "e:\CLAUDE\CORE\src\admin.html"
git commit -m "feat(admin): solicitudes GAS poller runs globally on init"
```

---

## Self-Review

**Spec coverage:**
- ✅ Paginación server-side: Task 1 (Worker) + Task 2 (frontend search + load more)
- ✅ Pre-fill Fiestas desde cliente: Task 3
- ✅ Pre-fill Invitaciones desde cliente: Task 4
- ✅ Poller solicitudes siempre activo: Task 5
- ✅ Sin cambios de schema D1
- ✅ Retrocompatible (Worker sin params devuelve igual que antes)
- ✅ `_clienteActual` persiste al navegar (ya era global, no cambia)

**Placeholder scan:** Ninguno encontrado.

**Type consistency:**
- `renderClientes()` sin args en Tasks 2 y 3 ✅
- `_pendingClienteId` definido en Task 3, usado en Tasks 3 y 4 ✅
- `_fetchClientes(opts)` con `{ search, limit, offset }` consistente en Tasks 2 y 2 ✅
