import { json, nowISO, generateEventId, makeEventSlug, resolveEventId, arrayBufferToBase64, fotoIdFromUrl, hasBadWord } from './helpers.js';
import { isAdmin } from './auth.js';

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function handleEventosAdmin(path, method, request, env) {
  if ((path === '/eventos/admin/list' || path === '/eventos/admin') && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM eventos_foto ORDER BY fecha DESC'
    ).all();
    return json({ eventos: results });
  }

  if (path === '/eventos/admin' && method === 'POST') {
    const { nombre, fecha, cierre_auto, folder_id, portada, estado, moderacion } = await request.json();
    if (!nombre || !fecha || !folder_id) return json({ error: 'Faltan campos obligatorios' }, 400);
    const id = generateEventId();
    const slug = makeEventSlug(nombre, fecha);
    await env.DB.prepare(`
      INSERT INTO eventos_foto (id, nombre, fecha, cierre_auto, folder_id, portada, estado, moderacion, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, nombre, fecha, cierre_auto || null, folder_id, portada || null,
        estado || 'activo', moderacion ? 1 : 0, nowISO()).run();
    await env.KV.put('fiesta_slug_' + slug, id);
    return json({ ok: true, id, slug });
  }

  if (path === '/eventos/admin/config' && method === 'GET') {
    const gas_url = await env.KV.get('fiestas_gas_url');
    return json({ gas_url: gas_url || '' });
  }

  if (path === '/eventos/admin/config' && method === 'POST') {
    const { gas_url } = await request.json();
    if (!gas_url) return json({ error: 'gas_url requerido' }, 400);
    await env.KV.put('fiestas_gas_url', gas_url);
    return json({ ok: true });
  }

  const putMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})$/);
  if (putMatch && method === 'PUT') {
    const id = putMatch[1];
    const body = await request.json();
    const fields = [], vals = [];
    const allowed = ['nombre', 'fecha', 'cierre_auto', 'folder_id', 'portada', 'estado', 'moderacion'];
    for (const k of allowed) {
      if (body[k] !== undefined) {
        fields.push(`${k} = ?`);
        vals.push(k === 'moderacion' ? (body[k] ? 1 : 0) : (body[k] || null));
      }
    }
    if (!fields.length) return json({ error: 'Nada que actualizar' }, 400);
    vals.push(id);
    await env.DB.prepare(`UPDATE eventos_foto SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
    return json({ ok: true });
  }

  const delMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})$/);
  if (delMatch && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM eventos_foto WHERE id = ?').bind(delMatch[1]).run();
    return json({ ok: true });
  }

  const rankingMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})\/ranking$/);
  if (rankingMatch && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT foto_id, COUNT(*) as likes FROM foto_likes WHERE evento_id=? GROUP BY foto_id ORDER BY likes DESC'
    ).bind(rankingMatch[1]).all();
    return json({ ranking: results });
  }

  const pendMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})\/pendientes$/);
  if (pendMatch && method === 'GET') {
    const evento = await env.DB.prepare('SELECT folder_id FROM eventos_foto WHERE id = ?').bind(pendMatch[1]).first();
    if (!evento) return json({ error: 'Evento no encontrado' }, 404);
    const gasUrl = await env.KV.get('fiestas_gas_url');
    if (!gasUrl) return json({ error: 'GAS URL no configurada' }, 500);
    const res = await fetch(`${gasUrl}?action=getPendientes&folderId=${encodeURIComponent(evento.folder_id)}`);
    return json(await res.json());
  }

  const aprobarMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})\/pendientes\/([^/]+)\/aprobar$/);
  if (aprobarMatch && method === 'POST') {
    const [, eventoId, fileId] = aprobarMatch;
    const evento = await env.DB.prepare('SELECT folder_id FROM eventos_foto WHERE id = ?').bind(eventoId).first();
    if (!evento) return json({ error: 'Evento no encontrado' }, 404);
    const gasUrl = await env.KV.get('fiestas_gas_url');
    if (!gasUrl) return json({ error: 'GAS URL no configurada' }, 500);
    const res = await fetch(gasUrl, {
      method: 'POST',
      body: JSON.stringify({ action: 'aprobarFoto', folderId: evento.folder_id, fileId }),
      headers: { 'Content-Type': 'application/json' }
    });
    return json(await res.json());
  }

  const rechazarMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})\/pendientes\/([^/]+)$/);
  if (rechazarMatch && method === 'DELETE') {
    const [, , fileId] = rechazarMatch;
    const gasUrl = await env.KV.get('fiestas_gas_url');
    if (!gasUrl) return json({ error: 'GAS URL no configurada' }, 500);
    const res = await fetch(gasUrl, {
      method: 'POST',
      body: JSON.stringify({ action: 'rechazarFoto', fileId }),
      headers: { 'Content-Type': 'application/json' }
    });
    return json(await res.json());
  }

  const delFotoMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})\/fotos\/([^/]+)$/);
  if (delFotoMatch && method === 'DELETE') {
    const [, eventoId, fileId] = delFotoMatch;
    await env.DB.prepare('DELETE FROM foto_likes WHERE evento_id=? AND foto_id=?').bind(eventoId, fileId).run();
    const gasUrl = await env.KV.get('fiestas_gas_url');
    if (!gasUrl) return json({ ok: true });
    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        body: JSON.stringify({ action: 'rechazarFoto', fileId }),
        headers: { 'Content-Type': 'application/json' }
      });
      return json(await res.json());
    } catch { return json({ ok: true }); }
  }

  return json({ error: 'Route not found' }, 404);
}

// ─── Público ─────────────────────────────────────────────────────────────────

export async function handleEventoPublico(id, env) {
  const evento = await env.DB.prepare(
    'SELECT id, nombre, fecha, portada, estado, moderacion, cierre_auto FROM eventos_foto WHERE id = ?'
  ).bind(id).first();
  if (!evento) return json({ error: 'Evento no encontrado' }, 404);
  return json(evento);
}

export async function handleEventoFotos(id, env, sessionId) {
  const evento = await env.DB.prepare('SELECT folder_id FROM eventos_foto WHERE id = ?').bind(id).first();
  if (!evento) return json({ error: 'Evento no encontrado' }, 404);
  const gasUrl = await env.KV.get('fiestas_gas_url');
  if (!gasUrl) return json({ error: 'GAS URL no configurada' }, 500);
  const res = await fetch(`${gasUrl}?action=getFotos&folderId=${encodeURIComponent(evento.folder_id)}`);
  const data = await res.json();

  if (!data.files || !data.files.length) return json(data);

  const fotoIds = data.files.map(f => fotoIdFromUrl(f.url));
  const ph = fotoIds.map(() => '?').join(',');

  const { results: likeCounts } = await env.DB.prepare(
    `SELECT foto_id, COUNT(*) as total FROM foto_likes WHERE evento_id=? AND foto_id IN (${ph}) GROUP BY foto_id`
  ).bind(id, ...fotoIds).all();

  const countMap = {};
  likeCounts.forEach(r => { countMap[r.foto_id] = r.total; });

  let likedSet = new Set();
  if (sessionId) {
    const { results: myLikes } = await env.DB.prepare(
      `SELECT foto_id FROM foto_likes WHERE evento_id=? AND session_id=? AND foto_id IN (${ph})`
    ).bind(id, sessionId, ...fotoIds).all();
    myLikes.forEach(r => likedSet.add(r.foto_id));
  }

  const files = data.files.map(f => {
    const fotoId = fotoIdFromUrl(f.url);
    return { ...f, foto_id: fotoId, likes: countMap[fotoId] || 0, liked: likedSet.has(fotoId) };
  });
  return json({ files });
}

export async function handleEventoUpload(id, request, env) {
  const evento = await env.DB.prepare(
    'SELECT folder_id, estado, moderacion, cierre_auto FROM eventos_foto WHERE id = ?'
  ).bind(id).first();
  if (!evento) return json({ error: 'Evento no encontrado' }, 404);
  if (evento.estado !== 'activo') return json({ error: 'Evento cerrado' }, 403);
  if (evento.cierre_auto && new Date() > new Date(evento.cierre_auto)) return json({ error: 'Evento cerrado' }, 403);

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return json({ error: 'No se recibió archivo' }, 400);

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > 15 * 1024 * 1024) return json({ error: 'Archivo demasiado grande (máx 15MB)' }, 400);

  const base64 = arrayBufferToBase64(buffer);
  const gasUrl = await env.KV.get('fiestas_gas_url');
  if (!gasUrl) return json({ error: 'GAS URL no configurada' }, 500);

  const res = await fetch(gasUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'uploadFoto',
      folderId: evento.folder_id,
      moderacion: evento.moderacion === 1,
      base64,
      filename: file.name || `foto_${Date.now()}.jpg`,
      mimeType: file.type || 'image/jpeg'
    }),
    headers: { 'Content-Type': 'application/json' }
  });
  return json(await res.json());
}

// ─── Frases ──────────────────────────────────────────────────────────────────

export async function handleFrasesGet(realId, env) {
  const { results } = await env.DB.prepare(
    'SELECT id, texto, nombre, created_at FROM evento_frases WHERE evento_id=? ORDER BY created_at DESC LIMIT 50'
  ).bind(realId).all();
  return json({ frases: results });
}

export async function handleFrasesPost(realId, request, env, adminUser) {
  const { texto, nombre } = await request.json().catch(() => ({}));
  if (!texto || texto.trim().length < 3) return json({ error: 'Frase muy corta (mínimo 3 caracteres)' }, 400);
  if (texto.trim().length > 150) return json({ error: 'Frase demasiado larga (máx 150 caracteres)' }, 400);
  if (!adminUser && hasBadWord(texto)) return json({ error: 'La frase contiene palabras no permitidas' }, 400);
  const evento = await env.DB.prepare('SELECT id FROM eventos_foto WHERE id=?').bind(realId).first();
  if (!evento) return json({ error: 'Evento no encontrado' }, 404);
  const nombreClean = nombre ? nombre.trim().slice(0, 40) : null;
  await env.DB.prepare('INSERT INTO evento_frases (evento_id, texto, nombre) VALUES (?,?,?)').bind(realId, texto.trim(), nombreClean).run();
  return json({ ok: true });
}

export async function handleFrasesDelete(realId, fraseId, env) {
  const result = await env.DB.prepare('DELETE FROM evento_frases WHERE id=? AND evento_id=?').bind(Number(fraseId), realId).run();
  if (result.meta?.changes === 0) return json({ error: 'Frase no encontrada' }, 404);
  return json({ ok: true });
}

// ─── Likes ───────────────────────────────────────────────────────────────────

export async function handleLikeToggle(realId, fotoId, request, env) {
  const { session_id } = await request.json().catch(() => ({}));
  if (!session_id) return json({ error: 'session_id requerido' }, 400);
  const existing = await env.DB.prepare(
    'SELECT 1 FROM foto_likes WHERE evento_id=? AND foto_id=? AND session_id=?'
  ).bind(realId, fotoId, session_id).first();
  if (existing) {
    await env.DB.prepare('DELETE FROM foto_likes WHERE evento_id=? AND foto_id=? AND session_id=?').bind(realId, fotoId, session_id).run();
  } else {
    await env.DB.prepare('INSERT INTO foto_likes (evento_id, foto_id, session_id) VALUES (?,?,?)').bind(realId, fotoId, session_id).run();
  }
  const row = await env.DB.prepare('SELECT COUNT(*) as total FROM foto_likes WHERE evento_id=? AND foto_id=?').bind(realId, fotoId).first();
  return json({ ok: true, liked: !existing, likes: row.total });
}
