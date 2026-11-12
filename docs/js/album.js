// Álbum de objetos: todo lo que has encontrado en los trasteros que te has llevado (en cualquier modo).
// Se guarda en este móvil. Cada grupo completo da un premio para Rey de las subastas.
import { ITEMS, COLLECTIONS, SET_OF } from './items.js';

const KEY = 'tr-album';

export const GROUPS = [
  ...COLLECTIONS.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, items: c.items, reward: 300 })),
  { id: 'chatarra', name: 'Chatarra y sorpresas', emoji: '📦', items: ITEMS.filter((it) => !SET_OF[it.id] && it.kind !== 'trampa').map((it) => it.id), reward: 100 },
  { id: 'trampas', name: 'Trampas', emoji: '☣️', items: ITEMS.filter((it) => it.kind === 'trampa').map((it) => it.id), reward: 150 },
];
export const TOTAL = GROUPS.reduce((t, g) => t + g.items.length, 0);

export function load() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (a && a.found) return { found: a.found, claimed: a.claimed || {}, keys: a.keys || [] };
  } catch (e) {}
  return { found: {}, claimed: {}, keys: [] };
}
export function save(a) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch (e) {}
}

// Apunta los objetos de un trastero ganado (una sola vez por trastero, aunque se recargue).
// Devuelve los que son nuevos en el álbum.
export function record(ids, key) {
  const a = load();
  if (key && a.keys.includes(key)) return [];
  const fresh = [];
  for (const id of ids) {
    if (!a.found[id]) fresh.push(id);
    a.found[id] = (a.found[id] || 0) + 1;
  }
  if (key) {
    a.keys.push(key);
    if (a.keys.length > 40) a.keys.splice(0, a.keys.length - 40);
  }
  save(a);
  return [...new Set(fresh)];
}

// lo que falta por encontrar
export const missing = (a) => GROUPS.flatMap((g) => g.items).filter((id) => !a.found[id]);
export const have = (a) => GROUPS.reduce((t, g) => t + g.items.filter((id) => a.found[id]).length, 0);
export const complete = (a, g) => g.items.every((id) => a.found[id]);
export const claimable = (a) => GROUPS.filter((g) => complete(a, g) && !a.claimed[g.id]);

// Cobra el premio de un grupo completo (una vez). Devuelve el dinero o 0.
export function claim(a, gid) {
  const g = GROUPS.find((x) => x.id === gid);
  if (!g || !complete(a, g) || a.claimed[gid]) return 0;
  a.claimed[gid] = true;
  save(a);
  return g.reward;
}
