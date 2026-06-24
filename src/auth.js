import { json } from './helpers.js';

// ─── JWT (HMAC-SHA256) ───────────────────────────────────────────────────────

function b64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromb64url(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

export async function signJWT(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = b64url(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${sigB64}`;
}

export async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const [header, body, sig] = parts;
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const sigBytes = Uint8Array.from(fromb64url(sig), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
  if (!valid) throw new Error('Invalid token');
  const payload = JSON.parse(fromb64url(body));
  if (payload.exp && payload.exp < Date.now() / 1000) throw new Error('Token expired');
  return payload;
}

// ─── Admin auth ──────────────────────────────────────────────────────────────

export async function isAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  try {
    const payload = await verifyJWT(auth.slice(7), env.ADMIN_JWT_SECRET);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

export async function handleAdminLogin(request, env) {
  const { user, pass } = await request.json().catch(() => ({}));
  if (!user || !pass) return json({ error: 'Credenciales requeridas' }, 400);

  const stored = await env.KV.get('admin_creds');
  const creds = stored ? JSON.parse(stored) : { user: env.ADMIN_USER, pass: env.ADMIN_PASS };

  if (!creds || user !== creds.user || pass !== creds.pass) {
    return json({ error: 'Usuario o contraseña incorrectos' }, 401);
  }

  const token = await signJWT(
    { role: 'admin', exp: Math.floor(Date.now() / 1000) + 8 * 3600 },
    env.ADMIN_JWT_SECRET
  );
  return json({ token, cf_auth: env.CF_AUTH_TOKEN || '' });
}

export async function handleAdminChangePassword(request, env) {
  const { pass } = await request.json().catch(() => ({}));
  if (!pass || pass.length < 6) return json({ error: 'Mínimo 6 caracteres' }, 400);

  const stored = await env.KV.get('admin_creds');
  const current = stored ? JSON.parse(stored) : { user: env.ADMIN_USER || 'admin' };

  await env.KV.put('admin_creds', JSON.stringify({ user: current.user, pass }));
  return json({ ok: true });
}
