export * from './helpers.js';
export * from './auth.js';
export * from './eventos.js';

import adminHtml from './admin.html';
import { json, corsHeaders, resolveEventId } from './helpers.js';
import { isAdmin, handleAdminLogin, handleAdminChangePassword } from './auth.js';
import {
  handleEventosAdmin, handleEventoPublico, handleEventoFotos,
  handleEventoUpload, handleFrasesGet, handleFrasesPost,
  handleFrasesDelete, handleLikeToggle
} from './eventos.js';

export async function mountCoreRouter(request, env, url, options = {}) {
  const path = url.pathname;
  const method = request.method;
  const modules = options.modules || {};
  const brand   = options.brand   || '';

  // ── Admin UI ──────────────────────────────────────────────────────────────
  if (path === '/admin' && method === 'GET') {
    return new Response(adminHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // ── Modules config ────────────────────────────────────────────────────────
  if (path === '/admin/modules' && method === 'GET') {
    return json({ modules, brand });
  }

  // ── Admin auth ────────────────────────────────────────────────────────────
  if (path === '/admin/login' && method === 'POST') return handleAdminLogin(request, env);
  if (path === '/admin/change-password' && method === 'POST') {
    if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
    return handleAdminChangePassword(request, env);
  }

  // ── Eventos admin — va primero para no matchear como slug público ──────────
  if (path.startsWith('/eventos/admin')) {
    if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
    return handleEventosAdmin(path, method, request, env);
  }

  // ── Frases delete (admin) — va antes del match genérico ───────────────────
  const fraseDelMatch = path.match(/^\/eventos\/([a-zA-Z0-9][a-zA-Z0-9-]{2,49})\/frases\/(\d+)$/);
  if (fraseDelMatch && method === 'DELETE') {
    if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
    const [, identifier, fraseId] = fraseDelMatch;
    const realId = await resolveEventId(identifier, env);
    if (!realId) return json({ error: 'Evento no encontrado' }, 404);
    return handleFrasesDelete(realId, fraseId, env);
  }

  // ── Evento público ────────────────────────────────────────────────────────
  const eventoIdMatch = path.match(/^\/eventos\/([a-zA-Z0-9][a-zA-Z0-9-]{2,49})$/);
  if (eventoIdMatch && method === 'GET') {
    const realId = await resolveEventId(eventoIdMatch[1], env);
    if (!realId) return json({ error: 'Evento no encontrado' }, 404);
    return handleEventoPublico(realId, env);
  }

  // ── Frases ────────────────────────────────────────────────────────────────
  const frasesMatch = path.match(/^\/eventos\/([a-zA-Z0-9][a-zA-Z0-9-]{2,49})\/frases$/);
  if (frasesMatch) {
    const realId = await resolveEventId(frasesMatch[1], env);
    if (!realId) return json({ error: 'Evento no encontrado' }, 404);
    const adminUser = await isAdmin(request, env);
    if (method === 'GET') return handleFrasesGet(realId, env);
    if (method === 'POST') return handleFrasesPost(realId, request, env, adminUser);
  }

  // ── Likes ─────────────────────────────────────────────────────────────────
  const likeMatch = path.match(/^\/eventos\/([a-zA-Z0-9][a-zA-Z0-9-]{2,49})\/fotos\/([^/]+)\/like$/);
  if (likeMatch && method === 'POST') {
    const [, identifier, fotoId] = likeMatch;
    const realId = await resolveEventId(identifier, env);
    if (!realId) return json({ error: 'Evento no encontrado' }, 404);
    return handleLikeToggle(realId, fotoId, request, env);
  }

  // ── Fotos ─────────────────────────────────────────────────────────────────
  const eventoFotosMatch = path.match(/^\/eventos\/([a-zA-Z0-9][a-zA-Z0-9-]{2,49})\/fotos$/);
  if (eventoFotosMatch) {
    const realId = await resolveEventId(eventoFotosMatch[1], env);
    if (!realId) return json({ error: 'Evento no encontrado' }, 404);
    if (method === 'GET') return handleEventoFotos(realId, env, url.searchParams.get('session'));
    if (method === 'POST') return handleEventoUpload(realId, request, env);
  }

  return null; // sin match — el caller maneja el 404
}
