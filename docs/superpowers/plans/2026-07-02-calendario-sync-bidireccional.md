# Calendario CRP — Eliminar fechas + Sync bidireccional Google Calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar fechas agendadas desde el admin (D1 + Google Calendar) y sync bidireccional automática GCal↔sistema vía cron del worker CRP cada 10 minutos, con el botón "Sincronizar" como disparo inmediato.

**Architecture:** La reconciliación vive en el worker CRP (`calendarFullSync`): lee fechas del sistema de D1 + mapa de IDs (`gcal_map`), llama al GAS (`action=fullSync`) server-side, y aplica el resultado a D1 (incluida la tabla nueva `agenda` para eventos externos de GCal). El admin solo dispara `POST /calendario/sync` y hace DELETE de fechas. Los guardados desde admin empujan a GCal al instante vía `ctx.waitUntil`.

**Tech Stack:** Cloudflare Worker (crclub-worker, D1 crclub-db, KV CRCLUB_KV), Google Apps Script (CalendarApp, clasp), vanilla JS inline en CORE/src/admin.html.

**Spec:** `e:\CLAUDE\CORE\docs\superpowers\specs\2026-07-02-calendario-sync-bidireccional-design.md`

## Global Constraints

- Sin npm en frontend — todo vanilla JS inline en admin.html (CORE → build).
- Worker CRP es monolítico: `e:\CLAUDE\WEB CRP\worker\src\index.js` — seguir ese patrón, no crear archivos nuevos de worker.
- El GAS se edita en `e:\CLAUDE\WEB CRP\Productivo\Skills\ContractSystem\` y se deploya con clasp **actualizando el deployment existente** (`clasp deploy -i <deploymentId>`), NUNCA `clasp deploy` pelado (crearía URL nueva y rompería la config). Probar el GAS después del deploy (regla de memoria).
- Título de eventos del sistema en GCal: `🎉 Evento — `, `📸 Book — `, `⚖️ Civil — `, `⛪ Religiosa — ` + nombre (idéntico al frontend actual).
- Convención `key` de eventos del sistema: `solicitud_id + '|' + tipo`.
- Ventana de escaneo GCal: 1 mes atrás → 24 meses adelante.
- Bump versión CORE V1.87 → V1.88 (configs con regex: crp replace → V1.88; kuerre replace → V1.55).
- Solo build de CRP en este plan (`node build-admin.cjs crp`). NO buildear kuerre: su worker aún no tiene los endpoints nuevos.
- No hay framework de tests en este stack (convención del proyecto: "No tests") — cada task cierra con verificación por comando/manual en lugar de unit tests.

---

## Archivos

| Archivo | Acción | Propósito |
|---------|--------|-----------|
| `WEB CRP/worker/schema.sql` | Modificar | Tablas `gcal_map` y `agenda` |
| `WEB CRP/worker/src/index.js` | Modificar | Módulo sync + endpoints + push inmediato + cron |
| `WEB CRP/Productivo/Skills/ContractSystem/SheetService.gs` | Modificar | `fullSyncCalendar`, `upsertCalendarEvent`, `deleteCalendarEvent` |
| `WEB CRP/Productivo/Skills/ContractSystem/Code.gs` | Modificar | Dispatch de las 3 acciones nuevas en doPost |
| `CORE/src/admin.html` | Modificar | Notas 📌, botones 🗑, calSyncGAS → worker, quitar calSyncEvento, V1.88 |
| `CORE/brands/crp/config.json`, `CORE/brands/kuerre/config.json` | Modificar | Version patch |

---

### Task 1: Tablas D1 `gcal_map` y `agenda`

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\worker\schema.sql` (al final del archivo)

**Interfaces:**
- Produces: tablas `gcal_map (solicitud_id, tipo, gcal_id)` PK compuesta, y `agenda (id, titulo, fecha, hora, lugar, gcal_id UNIQUE, created_at)` — las consumen Tasks 2 y 4.

- [ ] **Step 1: Agregar al final de schema.sql**

```sql
-- Sync bidireccional Google Calendar
CREATE TABLE IF NOT EXISTS gcal_map (
  solicitud_id TEXT NOT NULL,
  tipo         TEXT NOT NULL,
  gcal_id      TEXT NOT NULL,
  PRIMARY KEY (solicitud_id, tipo)
);

CREATE TABLE IF NOT EXISTS agenda (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo     TEXT NOT NULL,
  fecha      TEXT NOT NULL,
  hora       TEXT DEFAULT '',
  lugar      TEXT DEFAULT '',
  gcal_id    TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Crear las tablas en D1 remoto**

```bash
cd "/e/CLAUDE/WEB CRP/worker"
npx wrangler d1 execute crclub-db --remote --command "CREATE TABLE IF NOT EXISTS gcal_map (solicitud_id TEXT NOT NULL, tipo TEXT NOT NULL, gcal_id TEXT NOT NULL, PRIMARY KEY (solicitud_id, tipo)); CREATE TABLE IF NOT EXISTS agenda (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, fecha TEXT NOT NULL, hora TEXT DEFAULT '', lugar TEXT DEFAULT '', gcal_id TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')));"
```

Esperado: `success: true`.

- [ ] **Step 3: Verificar**

```bash
npx wrangler d1 execute crclub-db --remote --command "SELECT name FROM sqlite_master WHERE name IN ('gcal_map','agenda')"
```

Esperado: 2 filas.

- [ ] **Step 4: Commit**

```bash
cd "/e/CLAUDE/WEB CRP" && git add worker/schema.sql && git commit -m "feat(calendario): tablas gcal_map y agenda para sync bidireccional GCal"
```

---

### Task 2: Módulo de sync en el worker CRP + endpoints + cron

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\worker\src\index.js`
  - Funciones nuevas antes de `async function handleContratosDelete` (~línea 1369)
  - Endpoints en el router (junto al bloque `agendarMatch`, ~línea 1938)
  - Cron en `scheduled` (~línea 1975)

**Interfaces:**
- Consumes: tablas Task 1; patrón existente `env.CRCLUB_KV.get('crd_contratos_cfg')` (línea 1373); `isAdmin(request, env)`; `json()`.
- Produces (para Task 3 y 4):
  - GAS payloads: `{action:'fullSync', calendarId, system:[{key,titulo,fecha,hora,lugar,gcal_id}], known_external_ids:[...]}`, `{action:'upsertCalendarEvent', calendarId, event:{titulo,fecha,hora,lugar,gcal_id}}`, `{action:'deleteCalendarEvent', calendarId, gcal_id}`.
  - HTTP: `POST /calendario/sync` → `{ok, created, deleted, moved, imported, removed}`; `GET /agenda` → `{agenda:[...]}`; `DELETE /agenda/:id` → `{ok}`; `DELETE /solicitudes/:id/agendar` body `{tipo}` → `{ok}`.

- [ ] **Step 1: Verificar la firma del fetch handler**

```bash
grep -n "async fetch" "/e/CLAUDE/WEB CRP/worker/src/index.js"
```

Esperado: `async fetch(request, env, ctx)`. Si el tercer parámetro no existe o tiene otro nombre, usar ese nombre en los `ctx.waitUntil` de los pasos siguientes.

- [ ] **Step 2: Agregar funciones del módulo (antes de `handleContratosDelete`)**

```javascript
// ──────────────────────────────────────────────
// SYNC BIDIRECCIONAL GOOGLE CALENDAR
// ──────────────────────────────────────────────
const CAL_ICONOS = { evento: '🎉 Evento — ', book: '📸 Book — ', civil: '⚖️ Civil — ', religiosa: '⛪ Religiosa — ' };

async function gasCfg(env) {
  const raw = await env.CRCLUB_KV.get('crd_contratos_cfg').catch(() => null);
  try { const c = JSON.parse(raw); return { url: c?.url || null, calendarId: c?.calendarId || null }; }
  catch (e) { return { url: null, calendarId: null }; }
}

async function gasPost(url, payload) {
  const r = await fetch(url, { method: 'POST', redirect: 'follow', body: JSON.stringify(payload) });
  return r.json();
}

async function getSystemCalEvents(env) {
  const { results } = await env.CRCLUB_DB.prepare(`
    SELECT s.id, e.nombre AS nombre, e.fecha AS ev_fecha, s.hora_inicio, s.salon,
           s.book_fecha, s.book_hora, s.book_zona,
           s.civil_fecha, s.civil_hora, s.civil_dir,
           s.reli_fecha, s.reli_hora, s.reli_dir
    FROM solicitudes s LEFT JOIN eventos e ON e.id = s.evento_id
  `).all();
  const { results: maps } = await env.CRCLUB_DB.prepare('SELECT solicitud_id, tipo, gcal_id FROM gcal_map').all();
  const mapIdx = {};
  for (const m of maps) mapIdx[m.solicitud_id + '|' + m.tipo] = m.gcal_id;
  const out = [];
  for (const s of results) {
    const push = (tipo, fecha, hora, lugar) => {
      if (!fecha) return;
      out.push({ sid: s.id, tipo, titulo: (CAL_ICONOS[tipo] || '📅 ') + (s.nombre || ''), fecha, hora: hora || '', lugar: lugar || '', gcal_id: mapIdx[s.id + '|' + tipo] || null });
    };
    push('evento', s.ev_fecha, s.hora_inicio, s.salon);
    push('book', s.book_fecha, s.book_hora, s.book_zona);
    push('civil', s.civil_fecha, s.civil_hora, s.civil_dir);
    push('religiosa', s.reli_fecha, s.reli_hora, s.reli_dir);
  }
  return out;
}

async function clearSystemDate(env, sid, tipo) {
  if (tipo === 'evento') {
    const sol = await env.CRCLUB_DB.prepare('SELECT evento_id FROM solicitudes WHERE id=?').bind(sid).first();
    if (sol?.evento_id) await env.CRCLUB_DB.prepare("UPDATE eventos SET fecha='' WHERE id=?").bind(sol.evento_id).run();
  } else if (tipo === 'book') {
    await env.CRCLUB_DB.prepare("UPDATE solicitudes SET book_fecha='', book_hora='', book_zona='' WHERE id=?").bind(sid).run();
  } else if (tipo === 'civil') {
    await env.CRCLUB_DB.prepare("UPDATE solicitudes SET civil_fecha='', civil_hora='', civil_dir='' WHERE id=?").bind(sid).run();
  } else if (tipo === 'religiosa') {
    await env.CRCLUB_DB.prepare("UPDATE solicitudes SET reli_fecha='', reli_hora='', reli_dir='' WHERE id=?").bind(sid).run();
  }
  await env.CRCLUB_DB.prepare('DELETE FROM gcal_map WHERE solicitud_id=? AND tipo=?').bind(sid, tipo).run();
}

async function setSystemDate(env, sid, tipo, fecha, hora) {
  if (tipo === 'evento') {
    const sol = await env.CRCLUB_DB.prepare('SELECT evento_id FROM solicitudes WHERE id=?').bind(sid).first();
    if (sol?.evento_id) await env.CRCLUB_DB.prepare('UPDATE eventos SET fecha=? WHERE id=?').bind(fecha, sol.evento_id).run();
  } else if (tipo === 'book') {
    await env.CRCLUB_DB.prepare('UPDATE solicitudes SET book_fecha=?, book_hora=? WHERE id=?').bind(fecha, hora || '', sid).run();
  } else if (tipo === 'civil') {
    await env.CRCLUB_DB.prepare('UPDATE solicitudes SET civil_fecha=?, civil_hora=? WHERE id=?').bind(fecha, hora || '', sid).run();
  } else if (tipo === 'religiosa') {
    await env.CRCLUB_DB.prepare('UPDATE solicitudes SET reli_fecha=?, reli_hora=? WHERE id=?').bind(fecha, hora || '', sid).run();
  }
}

async function gcalPushUpsert(env, sid, tipo) {
  const { url, calendarId } = await gasCfg(env);
  if (!url) return;
  const system = await getSystemCalEvents(env);
  const ev = system.find(e => e.sid === sid && e.tipo === tipo);
  if (!ev) return;
  const res = await gasPost(url, { action: 'upsertCalendarEvent', calendarId, event: { titulo: ev.titulo, fecha: ev.fecha, hora: ev.hora, lugar: ev.lugar, gcal_id: ev.gcal_id } }).catch(() => null);
  if (res?.ok && res.gcal_id) {
    await env.CRCLUB_DB.prepare('INSERT OR REPLACE INTO gcal_map (solicitud_id, tipo, gcal_id) VALUES (?,?,?)').bind(sid, tipo, res.gcal_id).run();
  }
}

async function gasDeleteEvent(env, gcalId) {
  const { url, calendarId } = await gasCfg(env);
  if (!url || !gcalId) return;
  await gasPost(url, { action: 'deleteCalendarEvent', calendarId, gcal_id: gcalId }).catch(() => {});
}

async function calendarFullSync(env) {
  const { url, calendarId } = await gasCfg(env);
  if (!url) return { ok: false, error: 'GAS URL no configurada' };
  const system = await getSystemCalEvents(env);
  const { results: agendaRows } = await env.CRCLUB_DB.prepare('SELECT id, gcal_id FROM agenda WHERE gcal_id IS NOT NULL').all();
  const res = await gasPost(url, {
    action: 'fullSync',
    calendarId,
    system: system.map(ev => ({ key: ev.sid + '|' + ev.tipo, titulo: ev.titulo, fecha: ev.fecha, hora: ev.hora, lugar: ev.lugar, gcal_id: ev.gcal_id })),
    known_external_ids: agendaRows.map(a => a.gcal_id),
  });
  if (!res?.ok) return { ok: false, error: res?.error || 'GAS error' };
  for (const c of (res.created || [])) {
    const i = c.key.indexOf('|');
    await env.CRCLUB_DB.prepare('INSERT OR REPLACE INTO gcal_map (solicitud_id, tipo, gcal_id) VALUES (?,?,?)').bind(c.key.slice(0, i), c.key.slice(i + 1), c.gcal_id).run();
  }
  for (const key of (res.deleted || [])) {
    const i = key.indexOf('|');
    await clearSystemDate(env, key.slice(0, i), key.slice(i + 1));
  }
  for (const mv of (res.moved || [])) {
    const i = mv.key.indexOf('|');
    await setSystemDate(env, mv.key.slice(0, i), mv.key.slice(i + 1), mv.fecha, mv.hora);
  }
  for (const ex of (res.externals_new || [])) {
    await env.CRCLUB_DB.prepare("INSERT OR IGNORE INTO agenda (titulo, fecha, hora, lugar, gcal_id) VALUES (?,?,?,?,?)").bind(ex.titulo || '(sin título)', ex.fecha, ex.hora || '', ex.lugar || '', ex.gcal_id).run();
  }
  for (const ex of (res.externals_updated || [])) {
    await env.CRCLUB_DB.prepare('UPDATE agenda SET titulo=?, fecha=?, hora=?, lugar=? WHERE gcal_id=?').bind(ex.titulo || '(sin título)', ex.fecha, ex.hora || '', ex.lugar || '', ex.gcal_id).run();
  }
  for (const gid of (res.externals_gone || [])) {
    await env.CRCLUB_DB.prepare('DELETE FROM agenda WHERE gcal_id=?').bind(gid).run();
  }
  return {
    ok: true,
    created: (res.created || []).length,
    deleted: (res.deleted || []).length,
    moved: (res.moved || []).length,
    imported: (res.externals_new || []).length,
    removed: (res.externals_gone || []).length,
  };
}
```

- [ ] **Step 3: Endpoints en el router**

3a. En el bloque `agendarMatch` PATCH existente (~línea 1939), después de los updates de cada tipo y ANTES del `return json({ ok: true })`, agregar:

```javascript
        ctx.waitUntil(gcalPushUpsert(env, sid, tipo));
```

3b. Después del cierre del bloque `agendarMatch` PATCH, agregar:

```javascript
      if (agendarMatch && method === 'DELETE') {
        if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        const { tipo } = await request.json().catch(() => ({}));
        if (!tipo) return json({ error: 'tipo requerido' }, 400);
        const sid = agendarMatch[1];
        const row = await env.CRCLUB_DB.prepare('SELECT gcal_id FROM gcal_map WHERE solicitud_id=? AND tipo=?').bind(sid, tipo).first();
        await clearSystemDate(env, sid, tipo);
        if (row?.gcal_id) ctx.waitUntil(gasDeleteEvent(env, row.gcal_id));
        return json({ ok: true });
      }
      if (path === '/agenda' && method === 'GET') {
        if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        const { results } = await env.CRCLUB_DB.prepare('SELECT id, titulo, fecha, hora, lugar FROM agenda ORDER BY fecha').all();
        return json({ agenda: results });
      }
      const agendaDelMatch = path.match(/^\/agenda\/(\d+)$/);
      if (agendaDelMatch && method === 'DELETE') {
        if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        const row = await env.CRCLUB_DB.prepare('SELECT gcal_id FROM agenda WHERE id=?').bind(agendaDelMatch[1]).first();
        await env.CRCLUB_DB.prepare('DELETE FROM agenda WHERE id=?').bind(agendaDelMatch[1]).run();
        if (row?.gcal_id) ctx.waitUntil(gasDeleteEvent(env, row.gcal_id));
        return json({ ok: true });
      }
      if (path === '/calendario/sync' && method === 'POST') {
        if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        return json(await calendarFullSync(env));
      }
```

3c. En el bloque `bookMatch` PATCH (~línea 1918), antes de su `return json({ ok: true })`, agregar:

```javascript
        ctx.waitUntil(gcalPushUpsert(env, bookMatch[1], 'book'));
```

3d. En `handleContratosUpsert`, dentro del `if (eid) { ... }` que hace `UPDATE eventos SET fecha=?` (~línea 1363), después del `.run()` agregar (la función recibe `env`; verificar si recibe `ctx` — si no, pasar `ctx` desde el router donde se llama, o usar `await`):

```javascript
      const solRow = await env.CRCLUB_DB.prepare('SELECT id FROM solicitudes WHERE evento_id=?').bind(eid).first();
      if (solRow) await gcalPushUpsert(env, solRow.id, 'evento');
```

(Acá se usa `await` directo y no `ctx.waitUntil` porque el handler no recibe ctx; el costo es ~1s en el guardado de contrato, aceptable.)

- [ ] **Step 4: Cron cada 10 minutos en `scheduled`**

En `async scheduled(event, env, ctx)` (~línea 1975), agregar después del bloque mundial:

```javascript
    if (new Date().getMinutes() % 10 === 0) {
      try {
        const r = await calendarFullSync(env);
        if (!r.ok) console.error('gcal sync skipped:', r.error);
      } catch (e) {
        console.error('gcal sync cron failed:', e.message);
      }
    }
```

- [ ] **Step 5: Deploy y verificar rutas**

```bash
cd "/e/CLAUDE/WEB CRP/worker" && npx wrangler deploy 2>&1 | tail -4
curl -s -X POST "https://crclub-worker.cristian-romero-digital.workers.dev/calendario/sync" | head -c 200
curl -s "https://crclub-worker.cristian-romero-digital.workers.dev/agenda" | head -c 200
```

Esperado: deploy OK; ambos curl → `{"error":"Unauthorized"}` (401, rutas vivas). El GAS aún no tiene fullSync — el cron va a loguear error hasta Task 3; aceptable (try/catch).

- [ ] **Step 6: Commit**

```bash
cd "/e/CLAUDE/WEB CRP" && git add worker/src/index.js && git commit -m "feat(calendario): sync bidireccional GCal en worker — fullSync via cron 10min, push inmediato en agendar/book/contrato, endpoints agenda y DELETE agendar"
```

---

### Task 3: Acciones GAS — fullSync, upsert, delete

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\Productivo\Skills\ContractSystem\SheetService.gs` (después de `syncCalendar`, ~línea 317)
- Modify: `e:\CLAUDE\WEB CRP\Productivo\Skills\ContractSystem\Code.gs` (doPost, antes de `if (data.action === 'getCalendars')`, ~línea 94)

**Interfaces:**
- Consumes: payloads definidos en Task 2.
- Produces: `fullSync` → `{ok, created:[{key,gcal_id}], deleted:[key], moved:[{key,fecha,hora}], externals_new:[{gcal_id,titulo,fecha,hora,lugar}], externals_updated:[ídem], externals_gone:[gcal_id]}`. `upsertCalendarEvent` → `{ok, gcal_id}`. `deleteCalendarEvent` → `{ok}`.
- Nota migración: eventos ya creados por el `syncCalendar` viejo (sin ID trackeado) se **adoptan** por título+día en el primer upsert, evitando duplicados.

- [ ] **Step 1: Agregar funciones en SheetService.gs**

```javascript
// ──── Sync bidireccional Google Calendar ────

function _calGet(calendarId) {
  var cal = calendarId ? CalendarApp.getCalendarById(calendarId) : CalendarApp.getDefaultCalendar();
  return cal || CalendarApp.getDefaultCalendar();
}

function _calInicio(fecha, hora) {
  var p = fecha.split('-');
  var h = (hora || '09:00').split(':');
  return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]), parseInt(h[0]) || 9, parseInt(h[1]) || 0);
}

function _fmtFecha(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function _fmtHora(d) {
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}

function upsertCalendarEvent(ev, calendarId) {
  var cal = _calGet(calendarId);
  var inicio = _calInicio(ev.fecha, ev.hora);
  var fin = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);
  var existente = null;
  if (ev.gcal_id) {
    try { existente = cal.getEventById(ev.gcal_id); } catch (e) {}
  }
  if (!existente) {
    // Adoptar evento legacy creado por el syncCalendar viejo (mismo título, mismo día)
    var candidatos = cal.getEventsForDay(inicio, { search: ev.titulo });
    if (candidatos.length) existente = candidatos[0];
  }
  if (existente) {
    existente.setTitle(ev.titulo);
    existente.setTime(inicio, fin);
    existente.setLocation(ev.lugar || '');
    return { ok: true, gcal_id: existente.getId() };
  }
  var nuevo = cal.createEvent(ev.titulo, inicio, fin, { location: ev.lugar || '' });
  return { ok: true, gcal_id: nuevo.getId() };
}

function deleteCalendarEvent(gcalId, calendarId) {
  var cal = _calGet(calendarId);
  try {
    var ev = cal.getEventById(gcalId);
    if (ev) ev.deleteEvent();
  } catch (e) {}
  return { ok: true };
}

function fullSyncCalendar(payload) {
  var cal = _calGet(payload.calendarId);
  var system = payload.system || [];
  var knownExternal = payload.known_external_ids || [];
  var created = [], deleted = [], moved = [];
  var externalsNew = [], externalsUpdated = [], externalsGone = [];
  var systemIds = {};

  system.forEach(function(ev) {
    try {
      if (!ev.gcal_id) {
        var r = upsertCalendarEvent(ev, payload.calendarId);
        created.push({ key: ev.key, gcal_id: r.gcal_id });
        systemIds[r.gcal_id] = true;
        return;
      }
      systemIds[ev.gcal_id] = true;
      var gEv = null;
      try { gEv = cal.getEventById(ev.gcal_id); } catch (e) {}
      if (!gEv) { deleted.push(ev.key); return; }
      var f = _fmtFecha(gEv.getStartTime());
      var h = gEv.isAllDayEvent() ? '' : _fmtHora(gEv.getStartTime());
      if (f !== ev.fecha || (h && ev.hora && h !== ev.hora)) {
        moved.push({ key: ev.key, fecha: f, hora: h || ev.hora });
      }
    } catch (e) {
      Logger.log('fullSync system error ' + ev.key + ': ' + e.message);
    }
  });

  var knownSet = {};
  knownExternal.forEach(function(gid) {
    knownSet[gid] = true;
    var gEv = null;
    try { gEv = cal.getEventById(gid); } catch (e) {}
    if (!gEv) { externalsGone.push(gid); return; }
    externalsUpdated.push({
      gcal_id: gid,
      titulo: gEv.getTitle(),
      fecha: _fmtFecha(gEv.getStartTime()),
      hora: gEv.isAllDayEvent() ? '' : _fmtHora(gEv.getStartTime()),
      lugar: gEv.getLocation() || ''
    });
  });

  var hoy = new Date();
  var desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  var hasta = new Date(hoy.getFullYear() + 2, hoy.getMonth(), 1);
  var vistos = {};
  cal.getEvents(desde, hasta).forEach(function(gEv) {
    var gid = gEv.getId();
    if (systemIds[gid] || knownSet[gid] || vistos[gid]) return;
    vistos[gid] = true;
    externalsNew.push({
      gcal_id: gid,
      titulo: gEv.getTitle(),
      fecha: _fmtFecha(gEv.getStartTime()),
      hora: gEv.isAllDayEvent() ? '' : _fmtHora(gEv.getStartTime()),
      lugar: gEv.getLocation() || ''
    });
  });

  return { ok: true, created: created, deleted: deleted, moved: moved, externals_new: externalsNew, externals_updated: externalsUpdated, externals_gone: externalsGone };
}
```

- [ ] **Step 2: Dispatch en Code.gs doPost**

Antes de `if (data.action === 'getCalendars')` (~línea 94), agregar:

```javascript
    if (data.action === 'fullSync') {
      return _jsonResponse(fullSyncCalendar(data));
    }
    if (data.action === 'upsertCalendarEvent') {
      return _jsonResponse(upsertCalendarEvent(data.event || {}, data.calendarId || null));
    }
    if (data.action === 'deleteCalendarEvent') {
      return _jsonResponse(deleteCalendarEvent(data.gcal_id || '', data.calendarId || null));
    }
```

- [ ] **Step 3: Verificar identidad clasp y deployment existente**

```bash
cd "/e/CLAUDE/WEB CRP/Productivo/Skills/ContractSystem"
clasp whoami
clasp deployments
```

Esperado: `cristian.romero.digital@gmail.com` (si es otra cuenta, PARAR y avisar al usuario). Anotar el `deploymentId` (empieza con `AKfycb...`) del deployment web app activo — debe coincidir con la URL configurada en el admin (Contratos → Configuración).

- [ ] **Step 4: Push + redeploy del MISMO deployment**

```bash
clasp push --force
clasp deploy -i <deploymentId-anotado> --description "sync bidireccional calendario"
```

- [ ] **Step 5: Probar el GAS post-deploy (regla de memoria)**

```bash
curl -sL "<GAS_URL>?action=getCalendars" | head -c 300
```

(`<GAS_URL>` es la URL del deployment, `https://script.google.com/macros/s/<deploymentId>/exec`.)
Esperado: JSON con lista de calendarios (prueba que el script parsea y ejecuta). Después probar fullSync vacío:

```bash
curl -sL -X POST "<GAS_URL>" -d '{"action":"fullSync","system":[],"known_external_ids":[]}' | head -c 500
```

Esperado: `{"ok":true,"created":[],...,"externals_new":[...]}` — externals_new trae los eventos reales del calendario (aún no se aplican a D1 porque lo llama curl, no el worker).

- [ ] **Step 6: Commit**

```bash
cd "/e/CLAUDE/WEB CRP" && git add Productivo/Skills/ContractSystem/SheetService.gs Productivo/Skills/ContractSystem/Code.gs && git commit -m "feat(gas): fullSyncCalendar + upsert/deleteCalendarEvent — sync bidireccional con adopcion de eventos legacy por titulo+dia"
```

---

### Task 4: UI en CORE admin.html — notas, eliminar, sync via worker

**Files:**
- Modify: `e:\CLAUDE\CORE\src\admin.html`

**Interfaces:**
- Consumes: `GET /agenda`, `DELETE /agenda/:id`, `DELETE /solicitudes/:id/agendar` (body `{tipo}`), `POST /calendario/sync` (Task 2). Todos con header `Authorization: Bearer getAdminJWT()`.
- Callers de `calSyncEvento` a eliminar (verificados por grep): líneas ~3826 (book), ~8962 (contrato), ~10216 (calAgGuardar). La función (~10118) se elimina — el push a GCal ahora lo hace el worker.

- [ ] **Step 1: loadCalendarioPage — agregar book + notas**

En `loadCalendarioPage()` (~línea 10004), después de la línea de `c.fecha` (evento) agregar la línea book (hoy falta — fix colateral aprobado en spec):

```javascript
      if (c.book_fecha) _calEventos.push({ fecha: c.book_fecha, hora: c.book_hora || '', tipo: 'book', nombre: c.nombre_display, lugar: c.book_zona || '', id: c.id });
```

Y después del `for` de solicitudes, antes de `renderCalendar()`:

```javascript
    try {
      const ag = await fetch(CLIENTES_WORKER + '/agenda', { headers: { 'Authorization': 'Bearer ' + getAdminJWT() } }).then(function(r){ return r.json(); });
      for (const n of (ag.agenda || [])) {
        _calEventos.push({ fecha: n.fecha, hora: n.hora || '', tipo: 'nota', nombre: n.titulo, lugar: n.lugar || '', agendaId: n.id });
      }
    } catch(e) {}
```

- [ ] **Step 2: Tipo nota en colores/iconos/leyenda**

En cada mapa `colores` (renderCalendar, calSelDia, renderProximas) agregar `, nota: 'var(--gray)'`. En cada mapa `iconos`/`etiquetas`: renderProximas `, nota: '📌'`; calSelDia etiquetas `, nota: 'Nota'`. En la leyenda HTML (~línea 2280, junto a `● Religiosa`) agregar:

```html
              <span style="color:var(--gray);margin-left:8px">●</span> Nota
```

- [ ] **Step 3: Botón 🗑 en panel del día y próximas**

En `calSelDia` (~línea 10074), el item del listado: agregar al final del div (antes del `</div></div>` de cierre), y agregar `justify-content:space-between` no — mantener estructura, solo append del botón como último hijo del contenedor flex:

```javascript
      + '<button onclick="calEliminar(\'' + (ev.tipo === 'nota' ? ev.agendaId : ev.id) + '\',\'' + ev.tipo + '\',\'' + String(ev.nombre).replace(/'/g, "\\'") + '\')" title="Eliminar de la agenda y de Google Calendar" style="margin-left:auto;background:none;border:none;color:var(--gray2);cursor:pointer;font-size:13px;padding:0 2px">🗑</button>'
```

Mismo botón (idéntico código) en `renderProximas` (~línea 10107), como último elemento de cada fila.

- [ ] **Step 4: Función calEliminar**

Después de `calAgGuardar` (~línea 10220):

```javascript
async function calEliminar(id, tipo, nombre) {
  if (!confirm('¿Eliminar "' + nombre + '" (' + tipo + ') de la agenda y de Google Calendar?')) return;
  try {
    let r;
    if (tipo === 'nota') {
      r = await fetch(CLIENTES_WORKER + '/agenda/' + id, {
        method: 'DELETE', headers: { 'Authorization': 'Bearer ' + getAdminJWT() }
      }).then(function(x){ return x.json(); });
    } else {
      r = await fetch(CLIENTES_WORKER + '/solicitudes/' + id + '/agendar', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + getAdminJWT(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo })
      }).then(function(x){ return x.json(); });
    }
    if (r.ok) { toast('Fecha eliminada ✓'); await loadCalendarioPage(); }
    else toast(r.error || 'Error', 'error');
  } catch(e) { toast('Error de conexión', 'error'); }
}
```

- [ ] **Step 5: calSyncGAS → worker**

Reemplazar el cuerpo completo de `calSyncGAS` (~línea 10131):

```javascript
async function calSyncGAS() {
  const btn = document.getElementById('cal-btn-sync');
  if (btn) { btn.disabled = true; btn.textContent = 'Sincronizando...'; }
  try {
    const res = await fetch(CLIENTES_WORKER + '/calendario/sync', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + getAdminJWT() }
    }).then(function(r){ return r.json(); });
    if (res.ok) {
      toast('Sync ✓ — ' + res.created + ' creados, ' + res.deleted + ' borrados, ' + res.moved + ' movidos, ' + res.imported + ' importados, ' + res.removed + ' quitados');
      await loadCalendarioPage();
    } else toast(res.error || 'Error al sincronizar', 'error');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Sincronizar con Google Calendar'; } }
}
```

- [ ] **Step 6: Eliminar calSyncEvento y sus 3 llamadas**

Grep primero para confirmar los callers actuales:

```bash
grep -n "calSyncEvento" "/e/CLAUDE/CORE/src/admin.html"
```

Eliminar: la función `calSyncEvento` completa (~10118-10129) y las 3 líneas que la llaman (~3826 book, ~8962 contrato, ~10216 calAgGuardar). No tocar nada más de esas funciones.

- [ ] **Step 7: Bump versión**

Los configs de brands usan patch regex `>V1\.\d+<` (no se rompen con el bump de CORE); lo que hay que subir es el `replace` de cada uno:

- `CORE/src/admin.html`: `V1.87` → `V1.88` (1 ocurrencia, línea ~397).
- `CORE/brands/crp/config.json`: patch 1, `"replace": ">V1.87<"` → `">V1.88<"`.
- `CORE/brands/kuerre/config.json`: patch 1, `"replace": ">V1.54<"` → `">V1.55<"`.

- [ ] **Step 8: Build CRP y verificar**

```bash
cd /e/CLAUDE/CORE && node build-admin.cjs crp
grep -c "calEliminar\|/calendario/sync\|tipo: 'nota'" "/e/CLAUDE/WEB CRP/Desarrollo/admin.html"
grep -c "calSyncEvento" "/e/CLAUDE/WEB CRP/Desarrollo/admin.html"
```

Esperado: build OK; primer grep ≥ 3; segundo grep → 0 (o error "no match").

- [ ] **Step 9: Commit CORE**

```bash
cd /e/CLAUDE/CORE && git add src/admin.html brands/crp/config.json brands/kuerre/config.json && git commit -m "feat(calendario): eliminar fechas, notas externas de GCal, sync via worker (V1.88) — quita calSyncEvento (push lo hace el worker)"
```

---

### Task 5: Deploy final + verificación E2E

**Files:** ninguno nuevo — deploys y pruebas.

- [ ] **Step 1: Deploy admin (ofusca + push a GitHub)**

```bash
cd "/e/CLAUDE/WEB CRP" && node deploy-admin.js 2>&1 | tail -5
```

Esperado: `✓ Pusheado a GitHub.`

- [ ] **Step 2: Sync inicial vía cron y verificación en D1**

Esperar al próximo minuto múltiplo de 10 (o pedir al usuario que apriete "Sincronizar" en el admin). Verificar que el mapa se pobló:

```bash
cd "/e/CLAUDE/WEB CRP/worker"
npx wrangler d1 execute crclub-db --remote --command "SELECT COUNT(*) AS mapeados FROM gcal_map; SELECT COUNT(*) AS notas FROM agenda"
```

Esperado: `mapeados` ≈ cantidad de fechas del sistema (eventos+books+civil+religiosa con fecha); `notas` = eventos sueltos que tenga el GCal.

- [ ] **Step 3: E2E con el usuario (checklist del spec)**

Pedir al usuario que pruebe en el admin live:
1. Agendar una fecha → aparece en GCal.
2. 🗑 en una fecha de prueba → desaparece del admin y de GCal.
3. Crear un evento suelto en GCal → "Sincronizar" → aparece como 📌 nota.
4. Borrar en GCal un evento del sistema → "Sincronizar" → se limpia en el admin.
5. Mover una fecha en GCal → "Sincronizar" → fecha actualizada.
6. "Sincronizar" dos veces seguidas → segunda vez todo en 0.

- [ ] **Step 4: Commits/push finales + memoria**

```bash
cd /e/CLAUDE/CORE && git push
cd "/e/CLAUDE/WEB CRP" && git add -u && git commit -m "build: admin V1.88 con calendario bidireccional" 
```

Actualizar memoria: nota en `project_crp_drive_clientes` o memoria nueva sobre el módulo de sync (cron 10min, gcal_map/agenda, GAS fullSync) + pendiente KUERRE: **no buildear kuerre hasta replicar los endpoints `/agenda`, `DELETE /agendar` y `/calendario/sync` en kuerre-worker** (el admin V1.88 los requiere).

---

## Self-Review

**Spec coverage:**
- ✅ Eliminar desde admin (panel día + próximas) con confirm → D1 + GCal (Task 2 DELETE endpoints, Task 4 UI)
- ✅ Tablas gcal_map + agenda (Task 1)
- ✅ fullSync con created/deleted/moved/externals (Tasks 2-3)
- ✅ Cron 10 min + botón = mismo módulo (Task 2)
- ✅ Push inmediato al guardar (agendar/book/contrato) reemplaza calSyncEvento (Tasks 2 y 4)
- ✅ Notas 📌 en UI (Task 4)
- ✅ Adopción de eventos legacy por título+día — evita duplicados en migración (Task 3)
- ✅ Deploy GAS con `-i` al deployment existente + prueba post-deploy (Task 3, regla de memoria)
- ✅ E2E checklist (Task 5)

**Placeholder scan:** `<deploymentId-anotado>` y `<GAS_URL>` en Task 3 son valores runtime que se obtienen en el Step 3 de esa misma task — no son TBD.

**Type consistency:** `key = sid|tipo` con split por primer `|` consistente; `gcal_id` naming uniforme; respuesta fullSync GAS = lo que consume calendarFullSync; `{agenda:[...]}` = lo que consume loadCalendarioPage. `ctx` verificado en Task 2 Step 1 antes de usarse.

**Riesgos conocidos:**
- `hora_inicio` de evento NO se actualiza desde GCal (solo fecha) — decisión: es dato contractual.
- Si el usuario mueve un evento del sistema en GCal Y en el admin entre ciclos, gana el último escrito.
- KUERRE queda con UI vieja hasta replicar endpoints (anotado en memoria, Task 5).
