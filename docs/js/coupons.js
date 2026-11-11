// Cupones de descuento de tiendas reales (afiliación) que se ganan jugando.
// La lista sale de coupons.json, que una tarea diaria rellena desde Tradedoubler (tools/coupons/fetch.mjs).
// Con la lista vacía no se enseña nada. Los cupones ganados se guardan en este móvil.
import { getLang } from './i18n.js';

const KEY = 'tr-coupons';
const DAY = 86400000;
const KEEP = 7 * DAY; // un cupón caducado sigue una semana en la cartera, marcado como caducado
let list = [];

const valid = (c) => !!(c && c.id && c.merchant && c.title && /^https:\/\//.test(c.url || '') && Date.parse(c.ends) > 0);
export const setList = (l) => (list = Array.isArray(l) ? l.filter(valid) : []);
// los que se pueden regalar: en vigor al menos un día más
export const live = (now = Date.now()) => list.filter((c) => Date.parse(c.ends) > now + DAY);
export const expired = (c, now = Date.now()) => Date.parse(c.ends) <= now;
const dayOf = (now) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.won)) return s;
  } catch (e) {
    /* sin datos */
  }
  return { won: [], day: '' };
}
function save(st) {
  try {
    localStorage.setItem(KEY, JSON.stringify(st));
  } catch (e) {
    /* sin sitio */
  }
}
// cartera: lo ganado, lo último primero
export const wallet = (now = Date.now()) => load().won.filter((c) => Date.parse(c.ends) > now - KEEP);
export const unseen = () => load().won.some((c) => !c.seen);
// se enseña solo a quien juega en español (las ofertas son de España) y si hay algo que enseñar
export const enabled = (now = Date.now()) => getLang() === 'es' && (live(now).length > 0 || wallet(now).length > 0);

// Premio por ganar: un cupón que no tengas, como mucho uno al día. Devuelve el cupón o null.
export function award(now = Date.now(), rnd = Math.random) {
  if (getLang() !== 'es') return null;
  const st = load();
  if (st.day === dayOf(now)) return null;
  const have = new Set(st.won.map((c) => c.id));
  const pool = live(now).filter((c) => !have.has(c.id));
  if (!pool.length) return null;
  const c = pool[Math.floor(rnd() * pool.length) % pool.length];
  const got = { id: c.id, merchant: c.merchant, title: c.title, code: c.code || '', text: c.text || '', ends: c.ends, url: c.url, at: now, seen: false };
  st.won = [got, ...st.won.filter((w) => Date.parse(w.ends) > now - KEEP)].slice(0, 30);
  st.day = dayOf(now);
  save(st);
  return got;
}
export function markSeen() {
  const st = load();
  if (!st.won.some((c) => !c.seen)) return;
  st.won.forEach((c) => (c.seen = true));
  save(st);
}
export async function fetchList(url = 'coupons.json') {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (r.ok) setList((await r.json()).coupons);
  } catch (e) {
    /* sin red: no hay cupones */
  }
  return list;
}
