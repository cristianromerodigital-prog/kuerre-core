export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
  });
}

export function corsHeaders() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
  });
}

export function nowISO() {
  return new Date().toISOString();
}

export function generateEventId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) id += chars[b % chars.length];
  return id;
}

export function makeEventSlug(nombre, fecha) {
  const base = (nombre || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  return (fecha ? `${base}-${fecha}` : base).slice(0, 55);
}

export async function resolveEventId(identifier, env) {
  if (/^[A-Z2-9]{6}$/.test(identifier)) return identifier;
  return await env.KV.get('fiesta_slug_' + identifier);
}

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fotoIdFromUrl(url) {
  const m = url.match(/\/d\/([^/?#]+)/);
  return m ? m[1] : url;
}

const _MALAS_W = ['pija','poronga','verga','chota','garcha','concha','cajeta','orto','culo','teta','garchar','culear','coger','pete','petera','petero','chuparla','chupame','chupala','pajero','pajera','pajerear','paja','bolas','pelotas','huevos','forro','forrear','boludo','boluda','pelotudo','pelotuda','sorete','gil','garca','cagon','cagona','puto','puta','trola','choto','degenerado','degenerada','baboso','satiro','lacra','rompebolas','rompepelotas','hinchapelotas','tocapelotas','chupapija','mierda','carajo','cagar'];
const _MALAS_F = ['hijo de puta','hdp','la concha','la puta','la re puta','la reput','me chupa','andate a la mierda','cerr el orto'];

export function hasBadWord(text) {
  const norm = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/0/g,'o').replace(/1/g,'i').replace(/3/g,'e').replace(/4/g,'a')
    .replace(/\$/g,'s').replace(/@/g,'a').replace(/!/g,'i');
  return [..._MALAS_F, ..._MALAS_W].some(w => norm.includes(w));
}
