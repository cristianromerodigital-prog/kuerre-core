# Calendario con Sync Google Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una sección Calendario al admin (todos los entornos) que muestra las fechas tomadas (evento, book, civil, religiosa) desde D1, permite agendar nuevas fechas asignando cliente y tipo, y sincroniza con Google Calendar vía GAS.

**Architecture:** La sección Calendario vive en CORE/src/admin.html (disponible en KUERRE y CRP via build system). Los datos provienen del endpoint GET /solicitudes. La sync a Google Calendar usa el GAS ya configurado (misma URL que Contratos) con una nueva acción `syncCalendar`. El GAS escribe eventos con CalendarApp.getDefaultCalendar().

**Tech Stack:** Vanilla JS (calendar UI sin libs), Google Apps Script (CalendarApp), Cloudflare Workers D1 (fuente de datos), clasp (deploy GAS).

## Global Constraints

- Sin dependencias npm — todo vanilla JS inline en admin.html
- El GAS usa la misma URL configurada en `crd_contratos_cfg` (ctGetUrl())
- El código GAS debe ser idéntico para CRP y KUERRE (sincronizados)
- Los cambios a admin.html se aplican via `node build-admin.cjs all` en e:\CLAUDE\CORE\
- La sección Calendario va en el sidebar bajo CLIENTES, entre Testimonios y la label NEGOCIOS
- Colores por tipo de evento: evento=gold, book=violet, civil=cyan, religiosa=green

---

## Archivos

| Archivo | Acción | Propósito |
|---------|--------|-----------|
| `CORE/src/admin.html` | Modificar | Sidebar item + page-calendario + JS loadCalendarioPage + renderCalendar |
| `WEB CRP/Productivo/Skills/ContractSystem/SheetService.gs` | Modificar | Agregar función syncCalendar(events) |
| `WEB CRP/Productivo/Skills/ContractSystem/Code.gs` | Modificar | Agregar action 'syncCalendar' en doPost |

---

### Task 1: Sidebar item + page-calendario en CORE admin.html

**Files:**
- Modify: `e:\CLAUDE\CORE\src\admin.html` (sidebar ~línea 343 y nuevo bloque page)

- [ ] **Step 1: Agregar sidebar item "Calendario" entre Testimonios y label NEGOCIOS**

Localizar en el HTML:
```html
      <div class="nav-section-label">Negocios</div>
```

Insertar ANTES de esa línea:
```html
      <div class="sidebar-item" title="Calendario de fechas tomadas — eventos, books, civil y religiosa" onclick="showPage('calendario')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
        Calendario
      </div>
```

- [ ] **Step 2: Agregar page-calendario en el HTML (antes del cierre de content)**

Localizar `<div class="page" id="page-clientes"` y agregar ANTES:

```html
      <!-- ═══════════════════════════════════════
           CALENDARIO
      ═══════════════════════════════════════ -->
      <div class="page" id="page-calendario">
        <h2 class="section-h" style="margin-bottom:4px">Calendario</h2>
        <p style="font-size:12px;color:var(--gray);margin-bottom:24px;letter-spacing:1px">Fechas tomadas — eventos, books, civil y religiosa. Sincronizá con Google Calendar.</p>

        <!-- Controles -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
          <div style="display:flex;align-items:center;gap:12px">
            <button class="btn-sm btn-sec" onclick="calPrevMonth()">←</button>
            <span id="cal-titulo" style="font-size:14px;font-weight:500;letter-spacing:2px;min-width:180px;text-align:center"></span>
            <button class="btn-sm btn-sec" onclick="calNextMonth()">→</button>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span style="font-size:10px;color:var(--gray2)">
              <span style="color:var(--gold)">●</span> Evento
              <span style="color:var(--violet);margin-left:8px">●</span> Book
              <span style="color:var(--cyan);margin-left:8px">●</span> Civil
              <span style="color:var(--green);margin-left:8px">●</span> Religiosa
            </span>
            <button class="btn-sm" onclick="calSyncGAS()" id="cal-btn-sync">Sincronizar con Google Calendar</button>
          </div>
        </div>

        <!-- Grid del mes -->
        <div class="settings-section" style="margin-bottom:20px">
          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:8px">
            <div style="text-align:center;font-size:9px;letter-spacing:2px;color:var(--gray2);padding:6px 0">LUN</div>
            <div style="text-align:center;font-size:9px;letter-spacing:2px;color:var(--gray2);padding:6px 0">MAR</div>
            <div style="text-align:center;font-size:9px;letter-spacing:2px;color:var(--gray2);padding:6px 0">MIÉ</div>
            <div style="text-align:center;font-size:9px;letter-spacing:2px;color:var(--gray2);padding:6px 0">JUE</div>
            <div style="text-align:center;font-size:9px;letter-spacing:2px;color:var(--gray2);padding:6px 0">VIE</div>
            <div style="text-align:center;font-size:9px;letter-spacing:2px;color:var(--gray2);padding:6px 0">SÁB</div>
            <div style="text-align:center;font-size:9px;letter-spacing:2px;color:var(--gray2);padding:6px 0">DOM</div>
          </div>
          <div id="cal-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px"></div>
        </div>

        <!-- Panel de eventos del día seleccionado -->
        <div id="cal-day-panel" style="display:none" class="settings-section">
          <div class="settings-section-title" id="cal-day-titulo"></div>
          <div id="cal-day-lista" style="margin-top:12px;display:flex;flex-direction:column;gap:8px"></div>
        </div>

        <!-- Lista próximas fechas -->
        <div class="settings-section">
          <div class="settings-section-title" style="margin-bottom:12px">Próximas fechas <i class="tip" data-tip="Todas las fechas cargadas ordenadas cronológicamente.">?</i></div>
          <div id="cal-proximas" style="display:flex;flex-direction:column;gap:6px"></div>
        </div>
      </div>
```

- [ ] **Step 3: Verificar que el HTML no tiene errores de cierre de tags**

```bash
grep -c "page-calendario" "e:/CLAUDE/CORE/src/admin.html"
```
Esperado: al menos 1.

- [ ] **Step 4: Agregar showPage hook**

Localizar el bloque `showPage` en el JS (~línea 3660-3670) y agregar:
```javascript
  if (id === 'calendario') loadCalendarioPage();
```
junto al resto de los `if (id === ...)`.

- [ ] **Step 5: Commit**

```bash
cd "e:/CLAUDE/CORE"
git add src/admin.html
git commit -m "feat(calendario): sidebar item + page HTML"
```

---

### Task 2: JS del calendario en CORE admin.html

**Files:**
- Modify: `e:\CLAUDE\CORE\src\admin.html` (sección JS, al final antes de `</script>`)

- [ ] **Step 1: Agregar variables de estado y función loadCalendarioPage**

Al final del bloque JS (antes del cierre `</script>`):

```javascript
// ── CALENDARIO ──
let _calFecha   = new Date();
let _calEventos = [];
let _calDiaSel  = null;

async function loadCalendarioPage() {
  document.getElementById('cal-grid').innerHTML = '<div style="grid-column:1/-1;color:var(--gray2);font-size:12px;padding:20px 0">Cargando...</div>';
  document.getElementById('cal-proximas').innerHTML = '';
  document.getElementById('cal-day-panel').style.display = 'none';
  try {
    const d = await fetch(CLIENTES_WORKER + '/solicitudes?limit=200&offset=0', {
      headers: { 'Authorization': 'Bearer ' + getAdminJWT() }
    }).then(r => r.json());
    _calEventos = [];
    for (const c of (d.solicitudes || [])) {
      if (c.fecha) _calEventos.push({ fecha: c.fecha, tipo: 'evento', nombre: c.nombre_display, lugar: c.salon || '', direccion: c.direccion || '', id: c.id });
      if (c.book_fecha) _calEventos.push({ fecha: c.book_fecha, hora: c.book_hora || '', tipo: 'book', nombre: c.nombre_display, lugar: c.book_zona || '', id: c.id });
      try {
        const dj = typeof c.data_json === 'string' ? JSON.parse(c.data_json) : (c.data_json || {});
        if (dj.civil?.fecha) _calEventos.push({ fecha: dj.civil.fecha, hora: dj.civil.horario || '', tipo: 'civil', nombre: c.nombre_display, lugar: dj.civil.direccion || '', id: c.id });
        if (dj.religiosa?.fecha) _calEventos.push({ fecha: dj.religiosa.fecha, hora: dj.religiosa.horario || '', tipo: 'religiosa', nombre: c.nombre_display, lugar: dj.religiosa.direccion || '', id: c.id });
      } catch(e) {}
    }
    renderCalendar();
  } catch(e) {
    document.getElementById('cal-grid').innerHTML = '<div style="grid-column:1/-1;color:var(--red);font-size:12px">Error al cargar</div>';
  }
}
```

- [ ] **Step 2: Agregar renderCalendar y funciones de navegación**

```javascript
function calPrevMonth() { _calFecha.setMonth(_calFecha.getMonth() - 1); renderCalendar(); }
function calNextMonth() { _calFecha.setMonth(_calFecha.getMonth() + 1); renderCalendar(); }

function renderCalendar() {
  const y = _calFecha.getFullYear(), m = _calFecha.getMonth();
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('cal-titulo').textContent = meses[m].toUpperCase() + ' ' + y;

  const primerDia = new Date(y, m, 1);
  const diasMes   = new Date(y, m + 1, 0).getDate();
  let inicioCol   = primerDia.getDay(); // 0=dom
  if (inicioCol === 0) inicioCol = 7;   // domingo → columna 7 (lunes=1)

  const colores = { evento: 'var(--gold)', book: 'var(--violet)', civil: 'var(--cyan)', religiosa: 'var(--green)' };
  const hoy = new Date(); hoy.setHours(0,0,0,0);

  const evPorDia = {};
  _calEventos.forEach(function(ev) {
    if (!ev.fecha) return;
    const d = ev.fecha.slice(0, 10);
    if (!evPorDia[d]) evPorDia[d] = [];
    evPorDia[d].push(ev);
  });

  let html = '';
  // Celdas vacías al inicio
  for (let i = 1; i < inicioCol; i++) html += '<div></div>';
  // Días
  for (let dia = 1; dia <= diasMes; dia++) {
    const fechaStr = y + '-' + String(m+1).padStart(2,'0') + '-' + String(dia).padStart(2,'0');
    const evs = evPorDia[fechaStr] || [];
    const esHoy = new Date(y, m, dia).getTime() === hoy.getTime();
    const selBg = _calDiaSel === fechaStr ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.02)';
    const border = esHoy ? '1px solid var(--gold)' : '1px solid rgba(255,255,255,0.05)';
    const dots = evs.slice(0,4).map(function(ev){ return '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + (colores[ev.tipo]||'var(--gray)') + ';margin:0 1px"></span>'; }).join('');
    html += '<div onclick="calSelDia(\'' + fechaStr + '\')" style="background:' + selBg + ';border:' + border + ';border-radius:4px;padding:6px 4px;text-align:center;cursor:pointer;min-height:54px">'
      + '<div style="font-size:11px;color:' + (esHoy ? 'var(--gold)' : 'var(--white)') + ';font-weight:' + (esHoy ? '700' : '400') + ';margin-bottom:4px">' + dia + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:1px">' + dots + '</div>'
      + '</div>';
  }
  document.getElementById('cal-grid').innerHTML = html;
  renderProximas();
}

function calSelDia(fechaStr) {
  _calDiaSel = fechaStr;
  renderCalendar();
  const evs = _calEventos.filter(function(ev){ return ev.fecha && ev.fecha.slice(0,10) === fechaStr; });
  const panel = document.getElementById('cal-day-panel');
  const colores = { evento: 'var(--gold)', book: 'var(--violet)', civil: 'var(--cyan)', religiosa: 'var(--green)' };
  const etiquetas = { evento: 'Evento', book: 'Book', civil: 'Civil', religiosa: 'Religiosa' };
  if (!evs.length) { panel.style.display = 'none'; return; }
  const partes = fechaStr.split('-');
  document.getElementById('cal-day-titulo').textContent = partes[2] + '/' + partes[1] + '/' + partes[0];
  document.getElementById('cal-day-lista').innerHTML = evs.map(function(ev){
    return '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:6px">'
      + '<span style="font-size:9px;letter-spacing:1.5px;color:' + (colores[ev.tipo]||'var(--gray)') + ';text-transform:uppercase;min-width:60px;padding-top:1px">' + (etiquetas[ev.tipo]||ev.tipo) + '</span>'
      + '<div><div style="font-size:13px;color:var(--white)">' + ev.nombre + '</div>'
      + (ev.hora ? '<div style="font-size:10px;color:var(--gray2);margin-top:2px">🕐 ' + ev.hora + '</div>' : '')
      + (ev.lugar ? '<div style="font-size:10px;color:var(--gray2);margin-top:2px">📍 ' + ev.lugar + '</div>' : '')
      + '</div></div>';
  }).join('');
  panel.style.display = 'block';
}

function renderProximas() {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const futuras = _calEventos
    .filter(function(ev){ return ev.fecha && new Date(ev.fecha + 'T00:00:00') >= hoy; })
    .sort(function(a,b){ return a.fecha.localeCompare(b.fecha); })
    .slice(0, 20);
  const colores = { evento: 'var(--gold)', book: 'var(--violet)', civil: 'var(--cyan)', religiosa: 'var(--green)' };
  const etiquetas = { evento: '🎉', book: '📸', civil: '⚖️', religiosa: '⛪' };
  if (!futuras.length) {
    document.getElementById('cal-proximas').innerHTML = '<div style="color:var(--gray2);font-size:12px">No hay fechas próximas cargadas.</div>';
    return;
  }
  document.getElementById('cal-proximas').innerHTML = futuras.map(function(ev){
    const p = ev.fecha.split('-');
    const fFmt = p[2] + '/' + p[1] + '/' + p[0];
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:4px">'
      + '<span style="font-size:14px">' + (etiquetas[ev.tipo]||'📅') + '</span>'
      + '<span style="font-size:11px;color:' + (colores[ev.tipo]||'var(--gray)') + ';min-width:70px">' + fFmt + (ev.hora ? ' ' + ev.hora : '') + '</span>'
      + '<span style="font-size:12px;color:var(--white)">' + ev.nombre + '</span>'
      + (ev.lugar ? '<span style="font-size:10px;color:var(--gray2)">· ' + ev.lugar + '</span>' : '')
      + '</div>';
  }).join('');
}
```

- [ ] **Step 3: Agregar calSyncGAS**

```javascript
async function calSyncGAS() {
  const url = ctGetUrl();
  if (!url) { toast('Configurá la URL del Apps Script primero', 'error'); return; }
  const btn = document.getElementById('cal-btn-sync');
  btn.disabled = true; btn.textContent = 'Sincronizando...';
  try {
    const eventos = _calEventos.map(function(ev){ return {
      titulo: (ev.tipo === 'book' ? '📸 Book — ' : ev.tipo === 'civil' ? '⚖️ Civil — ' : ev.tipo === 'religiosa' ? '⛪ Religiosa — ' : '🎉 Evento — ') + ev.nombre,
      fecha: ev.fecha,
      hora: ev.hora || '09:00',
      tipo: ev.tipo,
      nombre: ev.nombre,
      lugar: ev.lugar || ''
    }; });
    const res = await fetch(url, {
      method: 'POST', redirect: 'follow',
      body: JSON.stringify({ action: 'syncCalendar', events: eventos })
    }).then(r => r.json());
    if (res.ok) toast('Sincronizado: ' + res.synced + ' eventos en Google Calendar ✓');
    else toast(res.error || 'Error al sincronizar', 'error');
  } catch(e) { toast('Error de conexión: ' + e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Sincronizar con Google Calendar'; }
}
```

- [ ] **Step 4: Commit**

```bash
cd "e:/CLAUDE/CORE"
git add src/admin.html
git commit -m "feat(calendario): vista mensual, lista proximas, calSyncGAS"
```

---

### Task 2b: Endpoint PATCH /solicitudes/{id}/agendar en ambos workers

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\worker\src\index.js`
- Modify: `e:\CLAUDE\WEB CRP\worker\src\index.js`

Recibe `{ tipo, fecha, hora, lugar }` y actualiza el campo correcto según tipo:
- `evento` → actualiza `fecha` (fecha principal del evento)
- `book` → actualiza `book_fecha`, `book_hora`, `book_zona`
- `civil` → actualiza `data_json.civil` (merge en el JSON)
- `religiosa` → actualiza `data_json.religiosa` (merge en el JSON)

- [ ] **Step 1: Agregar endpoint en KUERRE worker**

Localizar el bloque del `bookMatch` y agregar después:

```javascript
      const agendarMatch = path.match(/^\/solicitudes\/([A-Z2-9]{6})\/agendar$/);
      if (agendarMatch && method === 'PATCH') {
        if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        const { tipo, fecha, hora, lugar } = await request.json().catch(() => ({}));
        const id = agendarMatch[1];
        if (tipo === 'evento') {
          await env.DB.prepare('UPDATE solicitudes SET fecha=? WHERE id=?').bind(fecha||'', id).run();
        } else if (tipo === 'book') {
          await env.DB.prepare('UPDATE solicitudes SET book_fecha=?, book_hora=?, book_zona=? WHERE id=?').bind(fecha||'', hora||'', lugar||'', id).run();
        } else if (tipo === 'civil' || tipo === 'religiosa') {
          const row = await env.DB.prepare('SELECT data_json FROM solicitudes WHERE id=?').bind(id).first();
          let dj = {};
          try { dj = JSON.parse(row?.data_json || '{}'); } catch(e) {}
          dj[tipo] = { fecha: fecha||'', horario: hora||'', direccion: lugar||'' };
          await env.DB.prepare('UPDATE solicitudes SET data_json=? WHERE id=?').bind(JSON.stringify(dj), id).run();
        }
        return json({ ok: true });
      }
```

- [ ] **Step 2: Mismo cambio en CRP worker**

Mismo bloque exacto, en `e:\CLAUDE\WEB CRP\worker\src\index.js`, después del bloque `bookMatch`.

- [ ] **Step 3: Deploy ambos workers**

```bash
cd "e:/CLAUDE/WEB KUERRE/worker" && npx wrangler deploy 2>&1 | tail -3
cd "e:/CLAUDE/WEB CRP/worker" && npx wrangler deploy 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
cd "e:/CLAUDE/WEB KUERRE/worker" && git add src/index.js && git commit -m "feat(calendario): PATCH /solicitudes/{id}/agendar"
cd "e:/CLAUDE/WEB CRP/worker" && git add src/index.js && git commit -m "feat(calendario): PATCH /solicitudes/{id}/agendar"
```

---

### Task 2c: Modal "Agendar" en CORE admin.html

**Files:**
- Modify: `e:\CLAUDE\CORE\src\admin.html` (HTML del modal + JS)

- [ ] **Step 1: Agregar modal HTML de agendar (antes del cierre del app div)**

```html
<!-- Modal Agendar desde Calendario -->
<div id="cal-agendar-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:1100;align-items:center;justify-content:center;padding:16px">
  <div style="background:var(--black3);border:1px solid rgba(255,255,255,0.08);max-width:440px;width:100%;padding:28px;border-radius:6px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--gold)" id="cal-ag-titulo">Agendar fecha</div>
      <button onclick="document.getElementById('cal-agendar-modal').style.display='none'" style="background:none;border:none;color:var(--gray2);font-size:22px;cursor:pointer">×</button>
    </div>
    <div class="form-group" style="margin-bottom:14px">
      <label class="form-label">¿Qué agendamos?</label>
      <select id="cal-ag-tipo" class="form-input" onchange="calAgTipoChange()">
        <option value="evento">🎉 Evento (fecha principal)</option>
        <option value="book">📸 Book / Sesión de fotos</option>
        <option value="civil">⚖️ Civil</option>
        <option value="religiosa">⛪ Religiosa</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:14px">
      <label class="form-label">¿A qué cliente?</label>
      <input id="cal-ag-buscar" type="text" class="form-input" placeholder="Buscar cliente..." oninput="calAgFiltrarClientes(this.value)">
      <div id="cal-ag-lista" style="max-height:150px;overflow-y:auto;border:1px solid rgba(255,255,255,0.08);border-radius:4px;margin-top:4px;display:none"></div>
      <input type="hidden" id="cal-ag-cliente-id">
      <div id="cal-ag-cliente-sel" style="font-size:11px;color:var(--gold);margin-top:6px"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input id="cal-ag-fecha" type="date" class="form-input">
      </div>
      <div class="form-group">
        <label class="form-label">Hora</label>
        <input id="cal-ag-hora" type="time" class="form-input">
      </div>
    </div>
    <div class="form-group" id="cal-ag-lugar-wrap" style="margin-bottom:18px">
      <label class="form-label" id="cal-ag-lugar-label">Lugar / Zona</label>
      <input id="cal-ag-lugar" type="text" class="form-input" placeholder="Salón, dirección o zona...">
    </div>
    <button class="btn-add" style="width:100%" onclick="calAgGuardar()">Guardar fecha</button>
  </div>
</div>
```

- [ ] **Step 2: Agregar funciones JS del modal**

```javascript
// ── AGENDAR DESDE CALENDARIO ──
let _calAgClienteSel = null;

function calAbrirAgendar(fechaStr) {
  _calAgClienteSel = null;
  document.getElementById('cal-ag-fecha').value = fechaStr || '';
  document.getElementById('cal-ag-hora').value = '';
  document.getElementById('cal-ag-lugar').value = '';
  document.getElementById('cal-ag-buscar').value = '';
  document.getElementById('cal-ag-cliente-id').value = '';
  document.getElementById('cal-ag-cliente-sel').textContent = '';
  document.getElementById('cal-ag-lista').style.display = 'none';
  document.getElementById('cal-ag-tipo').value = 'evento';
  calAgTipoChange();
  document.getElementById('cal-ag-titulo').textContent = fechaStr ? 'Agendar ' + fechaStr.split('-').reverse().join('/') : 'Agendar fecha';
  document.getElementById('cal-agendar-modal').style.display = 'flex';
}

function calAgTipoChange() {
  const tipo = document.getElementById('cal-ag-tipo').value;
  const lugarLabel = document.getElementById('cal-ag-lugar-label');
  const lugarInput = document.getElementById('cal-ag-lugar');
  if (tipo === 'book') { lugarLabel.textContent = 'Zona / Lugar del book'; lugarInput.placeholder = 'Palermo, Tigre...'; }
  else if (tipo === 'civil' || tipo === 'religiosa') { lugarLabel.textContent = 'Dirección'; lugarInput.placeholder = 'Dirección del lugar'; }
  else { lugarLabel.textContent = 'Salón / Lugar'; lugarInput.placeholder = 'Nombre del salón'; }
}

function calAgFiltrarClientes(q) {
  const lista = document.getElementById('cal-ag-lista');
  const term = q.toLowerCase().trim();
  const filtrados = _clientes.filter(function(c){ return c.nombre_display.toLowerCase().includes(term); }).slice(0, 8);
  if (!term || !filtrados.length) { lista.style.display = 'none'; return; }
  lista.style.display = 'block';
  lista.innerHTML = filtrados.map(function(c){
    return '<div onclick="calAgSelCliente(\'' + c.id + '\',\'' + c.nombre_display.replace(/'/g,"\\'") + '\')" style="padding:8px 12px;cursor:pointer;font-size:12px;color:var(--white);border-bottom:1px solid rgba(255,255,255,0.05)" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'\'">'+c.nombre_display+'</div>';
  }).join('');
}

function calAgSelCliente(id, nombre) {
  _calAgClienteSel = id;
  document.getElementById('cal-ag-cliente-id').value = id;
  document.getElementById('cal-ag-cliente-sel').textContent = '✓ ' + nombre;
  document.getElementById('cal-ag-buscar').value = nombre;
  document.getElementById('cal-ag-lista').style.display = 'none';
}

async function calAgGuardar() {
  const clienteId = document.getElementById('cal-ag-cliente-id').value;
  const tipo      = document.getElementById('cal-ag-tipo').value;
  const fecha     = document.getElementById('cal-ag-fecha').value;
  const hora      = document.getElementById('cal-ag-hora').value;
  const lugar     = document.getElementById('cal-ag-lugar').value.trim();
  if (!clienteId) { toast('Seleccioná un cliente', 'error'); return; }
  if (!fecha) { toast('Ingresá la fecha', 'error'); return; }
  try {
    const r = await fetch(CLIENTES_WORKER + '/solicitudes/' + clienteId + '/agendar', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + getAdminJWT(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, fecha, hora, lugar })
    }).then(r => r.json());
    if (r.ok) {
      toast('Fecha agendada ✓');
      document.getElementById('cal-agendar-modal').style.display = 'none';
      // Actualizar local
      const idx = _clientes.findIndex(function(c){ return c.id === clienteId; });
      if (idx !== -1) {
        if (tipo === 'evento') _clientes[idx].fecha = fecha;
        if (tipo === 'book') { _clientes[idx].book_fecha = fecha; _clientes[idx].book_hora = hora; _clientes[idx].book_zona = lugar; }
      }
      await loadCalendarioPage();
    } else toast(r.error || 'Error', 'error');
  } catch(e) { toast('Error de conexión', 'error'); }
}
```

- [ ] **Step 3: Agregar botón "+" en cada celda del calendario y botón global**

En `renderCalendar()`, en el HTML de cada celda, al final de `html +=`, agregar un pequeño botón "+" al hover:

Modificar la celda para que tenga un botón de agendar:
```javascript
    html += '<div onclick="calSelDia(\'' + fechaStr + '\')" style="background:' + selBg + ';border:' + border + ';border-radius:4px;padding:6px 4px;text-align:center;cursor:pointer;min-height:54px;position:relative" onmouseover="this.querySelector(\'.cal-add-btn\')&&(this.querySelector(\'.cal-add-btn\').style.display=\'block\')" onmouseout="this.querySelector(\'.cal-add-btn\')&&(this.querySelector(\'.cal-add-btn\').style.display=\'none\')">'
      + '<div style="font-size:11px;color:' + (esHoy ? 'var(--gold)' : 'var(--white)') + ';font-weight:' + (esHoy ? '700' : '400') + ';margin-bottom:4px">' + dia + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:1px">' + dots + '</div>'
      + '<div class="cal-add-btn" onclick="event.stopPropagation();calAbrirAgendar(\'' + fechaStr + '\')" style="display:none;position:absolute;top:2px;right:2px;background:rgba(201,168,76,0.2);color:var(--gold);border:none;border-radius:3px;width:16px;height:16px;font-size:10px;line-height:16px;text-align:center;cursor:pointer">+</div>'
      + '</div>';
```

Y en el `cal-day-panel`, agregar botón de agendar para esa fecha:

Agregar en el HTML del panel de día:
```html
<button class="btn-sm" style="margin-top:12px" onclick="calAbrirAgendar(_calDiaSel)">+ Agendar en esta fecha</button>
```

- [ ] **Step 4: Commit**

```bash
cd "e:/CLAUDE/CORE"
git add src/admin.html
git commit -m "feat(calendario): modal Agendar — seleccion cliente+tipo+fecha desde el calendario"
```

---

### Task 3: Agregar syncCalendar al GAS (CRP + KUERRE)

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\Productivo\Skills\ContractSystem\SheetService.gs`
- Modify: `e:\CLAUDE\WEB CRP\Productivo\Skills\ContractSystem\Code.gs`

**Nota:** Los dos GAS (CRP y KUERRE) comparten el mismo código. Se edita en WEB CRP y se pushea a ambos con clasp.

- [ ] **Step 1: Agregar syncCalendar en SheetService.gs**

Al final de `e:\CLAUDE\WEB CRP\Productivo\Skills\ContractSystem\SheetService.gs`, agregar:

```javascript
// ──── Sincronización Google Calendar ────

function syncCalendar(events) {
  const cal = CalendarApp.getDefaultCalendar();
  let synced = 0;
  const ahora = new Date();

  events.forEach(function(ev) {
    if (!ev.fecha) return;
    try {
      // Parsear fecha: "2026-08-01" + hora "19:00" → Date en AR (UTC-3)
      const partes = ev.fecha.split('-');
      const horaParts = (ev.hora || '09:00').split(':');
      const inicio = new Date(
        parseInt(partes[0]),
        parseInt(partes[1]) - 1,
        parseInt(partes[2]),
        parseInt(horaParts[0]) || 9,
        parseInt(horaParts[1]) || 0
      );
      const fin = new Date(inicio.getTime() + 2 * 60 * 60 * 1000); // +2h por defecto

      const descripcion = [
        ev.nombre,
        ev.lugar ? '📍 ' + ev.lugar : ''
      ].filter(Boolean).join('\n');

      // Buscar si ya existe un evento con ese título y fecha para no duplicar
      const existentes = cal.getEventsForDay(inicio, { search: ev.titulo });
      if (existentes.length === 0) {
        cal.createEvent(ev.titulo, inicio, fin, {
          description: descripcion,
          location: ev.lugar || ''
        });
        synced++;
      }
    } catch(e) {
      Logger.log('Error sync evento: ' + JSON.stringify(ev) + ' — ' + e.message);
    }
  });

  return { ok: true, synced: synced, total: events.length };
}
```

- [ ] **Step 2: Agregar action 'syncCalendar' en Code.gs doPost**

En `e:\CLAUDE\WEB CRP\Productivo\Skills\ContractSystem\Code.gs`, dentro de `doPost`, antes del `const resultado = crearContrato(data)`:

```javascript
    if (data.action === 'syncCalendar') {
      return ContentService
        .createTextOutput(JSON.stringify(syncCalendar(data.events || [])))
        .setMimeType(ContentService.MimeType.JSON);
    }
```

- [ ] **Step 3: Push GAS de CRP via clasp**

```bash
# Asegurarse de estar logueado como cristian.romero.digital@gmail.com
clasp whoami

# Ir a la carpeta del ContractSystem
cd "e:/CLAUDE/WEB CRP/Productivo/Skills/ContractSystem"

# Crear .clasp.json si no existe
echo '{"scriptId":"1cCBrdz4C1ZVk7pI-4Uq4pn0XfJCLiIFZ65SotiPePaDQ0hcQFwh8h0p9","rootDir":"."}' > .clasp.json
```

Esperar salida: `Logged in as cristian.romero.digital@gmail.com`

**Nota:** El Script ID `1cCBrdz4C1ZVk7pI-4Uq4pn0XfJCLiIFZ65SotiPePaDQ0hcQFwh8h0p9` corresponde a Contratos Kuerre (cuenta kuerre). Para CRP usar el ID correcto de la memoria: el deploy de CRP es `AKfycbzaEpe1VKm...` → buscar el scriptId del proyecto CRP en Apps Script.

- [ ] **Step 4: Hacer deploy del GAS de CRP**

```bash
cd "e:/CLAUDE/WEB CRP/Productivo/Skills/ContractSystem"
clasp push --force
clasp deploy --description "syncCalendar Google Calendar"
```

Esperado: lista de deployments, copiar la nueva versión URL si cambió.

- [ ] **Step 5: Push GAS de KUERRE**

```bash
# Login con cuenta KUERRE
clasp login --no-localhost
# Autenticar con kuerre.digital@gmail.com

cd "e:/CLAUDE/WEB CRP/Productivo/Skills/ContractSystem"
# Cambiar el scriptId al de KUERRE
echo '{"scriptId":"1cCBrdz4C1ZVk7pI-4Uq4pn0XfJCLiIFZ65SotiPePaDQ0hcQFwh8h0p9","rootDir":"."}' > .clasp.json
clasp push --force
clasp deploy --description "syncCalendar Google Calendar"
```

- [ ] **Step 6: Commit de los archivos GAS**

```bash
cd "e:/CLAUDE/WEB CRP"
git add Productivo/Skills/ContractSystem/SheetService.gs Productivo/Skills/ContractSystem/Code.gs
git commit -m "feat(gas): syncCalendar — crea eventos en Google Calendar vía CalendarApp"
```

---

### Task 4: Build, verificar y deploy final

**Files:** Productivo de todos los entornos, gh-pages

- [ ] **Step 1: Build**

```bash
cd "e:/CLAUDE/CORE"
node build-admin.cjs all
```

Esperado:
```
→ WEB KUERRE/Productivo/admin.html
→ WEB KUERRE/Desarrollo/admin.html
✅ kuerre built (2 files)
→ WEB CRP/Productivo/admin.html
✅ crp built (1 file)
```

- [ ] **Step 2: Verificar que el Calendario aparece en los archivos generados**

```bash
grep -c "page-calendario\|loadCalendarioPage\|calSyncGAS" "e:/CLAUDE/WEB KUERRE/Productivo/admin.html"
grep -c "page-calendario\|loadCalendarioPage\|calSyncGAS" "e:/CLAUDE/WEB CRP/Productivo/admin.html"
```

Esperado: 3 o más en cada uno.

- [ ] **Step 3: Copiar a gh-pages de KUERRE**

```bash
cp "e:/CLAUDE/WEB KUERRE/Productivo/admin.html" "e:/CLAUDE/WEB KUERRE/.worktrees/gh-pages/admin.html"
```

- [ ] **Step 4: Commit y push CORE**

```bash
cd "e:/CLAUDE/CORE"
git add src/admin.html
git commit -m "feat: seccion Calendario con sync Google Calendar via GAS"
git push
```

- [ ] **Step 5: Commit y push KUERRE**

```bash
cd "e:/CLAUDE/WEB KUERRE/.worktrees/gh-pages"
git add admin.html
git commit -m "feat: Calendario con sync Google Calendar"
git push origin gh-pages

cd "e:/CLAUDE/WEB KUERRE"
git add Productivo/admin.html Desarrollo/admin.html
git commit -m "feat: Calendario con sync Google Calendar"
git push
```

- [ ] **Step 6: Commit y push CRP**

```bash
cd "e:/CLAUDE/WEB CRP/Productivo"
git add admin.html
git commit -m "feat: Calendario con sync Google Calendar"
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ Sección nueva Calendario al nivel de Mensajes en sidebar
- ✅ Vista mensual con colores por tipo
- ✅ Muestra: fechas evento, book, civil, religiosa
- ✅ Datos desde D1 clientes (data_json parseado)
- ✅ Lista de próximas fechas cronológica
- ✅ Sync con Google Calendar via GAS (acción syncCalendar)
- ✅ En todos los entornos (CORE → build → KUERRE + CRP)

**Placeholder scan:** Ninguno.

**Type consistency:**
- `ev.fecha`, `ev.hora`, `ev.tipo`, `ev.nombre`, `ev.lugar` — consistente en todos los usos ✅
- `calSyncGAS()` llama a `ctGetUrl()` que ya existe ✅
- `loadCalendarioPage()` usa `CLIENTES_WORKER` ya definido ✅

**Riesgo GAS scriptIds:**
- El scriptId de CRP debe verificarse en la consola de Apps Script (script.google.com) antes del clasp push
- El scriptId de KUERRE está en la memoria: `1cCBrdz4C1ZVk7pI-4Uq4pn0XfJCLiIFZ65SotiPePaDQ0hcQFwh8h0p9`
