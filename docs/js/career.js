// Modo carrera: lo que se guarda entre días en este móvil (sin cuentas).
// Dinero, día, reputación (nivel y título), zonas abiertas, mejoras y el almacén con lo que has comprado.
// Cada día se juega con el motor normal (E.setupCareer) y al acabar se apunta aquí una sola vez.
import { SET_OF, COLLECTION, SET_NEED, SAFE_CONTENTS, LOCKSMITH, safeDraw } from './items.js';

const KEY = 'tr-career';
export const START_MONEY = 1000;
export const SET_SALE_BONUS = 0.5; // vender una colección entera: +50 %
const r10 = (x) => Math.round(x / 10) * 10;

// Reputación necesaria para cada nivel (el 1 empieza en 0). Después del 10, +3.000 por nivel.
const LEVEL_XP = [0, 0, 200, 600, 1200, 2000, 3000, 4300, 6000, 8000, 10500];
export function xpFor(level) {
  if (level < LEVEL_XP.length) return LEVEL_XP[level];
  return LEVEL_XP[LEVEL_XP.length - 1] + (level - (LEVEL_XP.length - 1)) * 3000;
}
export const TITLES = [
  [30, 'Rey de las subastas'],
  [20, 'Maestro'],
  [15, 'Experto'],
  [10, 'Profesional'],
  [6, 'Cazagangas'],
  [3, 'Aficionado'],
  [1, 'Novato'],
];
export function levelOf(xp) {
  let level = 1;
  while (xp >= xpFor(level + 1)) level++;
  const title = TITLES.find(([l]) => level >= l)[1];
  return { level, title, from: xpFor(level), to: xpFor(level + 1) };
}

// Zonas: nivel que piden y lo que cuesta abrirlas (una vez). Puerto y mansiones llegan en la fase 2.
export const ZONE_INFO = {
  barrio: { level: 1, price: 0, name: 'Barrio', sub: 'Trasteros pequeños' },
  poligono: { level: 3, price: 1500, name: 'Polígono', sub: 'Herramientas y muebles' },
  puerto: { level: 10, price: 5000, name: 'Puerto', sub: 'Contenedores enteros' },
  mansiones: { level: 20, price: 25000, soon: true, name: 'Mansiones', sub: 'Herencias de lujo' },
};
export const ZONE_ORDER = ['barrio', 'poligono', 'puerto', 'mansiones'];

// Mejoras: precio de cada nivel y nivel de reputación que piden
export const UPGRADES = {
  // zoneAt: a partir de ese nivel de la mejora hace falta haber abierto el Puerto
  lupa: { costs: [600, 2000, 5000, 12000], need: [1, 3, 5, 12], zoneAt: 3, name: 'Lupa', emoji: '👁️' }, // +1 caja vista por nivel
  furgoneta: { costs: [700, 2500, 6000, 12000], need: [1, 3, 5, 11], zoneAt: 3, cap: [10, 18, 28, 40, 55], name: 'Furgoneta', emoji: '🚚' }, // sitio en el almacén
  tienda: { costs: [900, 3000, 7000, 14000], need: [2, 4, 6, 12], zoneAt: 3, bonus: [0, 0.05, 0.1, 0.15, 0.2], name: 'Tienda', emoji: '💰' }, // vendes más caro
  // se abren al llegar al Puerto
  contactos: { costs: [1500, 4000, 9000], need: [10, 12, 14], zone: 'puerto', off: [0, 0.2, 0.35, 0.5], name: 'Contactos', emoji: '📞' }, // los trucos cuestan menos
  seguro: { costs: [2000, 5000, 10000], need: [10, 13, 16], zone: 'puerto', off: [0, 0.35, 0.7, 1], name: 'Seguro', emoji: '🛡️' }, // las trampas cuestan menos
  cerrajero: { costs: [1200, 3000, 6000], need: [10, 11, 12], zone: 'puerto', price: [50, 30, 15, 0], name: 'Cerrajero propio', emoji: '🔑' }, // abrir cajas fuertes sale más barato
};
export const UPGRADE_ORDER = ['lupa', 'furgoneta', 'tienda', 'contactos', 'seguro', 'cerrajero'];
export const UPGRADE_ZONE = 'puerto';

const empty = () => ({
  v: 1,
  money: START_MONEY,
  day: 1,
  xp: 0,
  zone: 'barrio',
  zones: { barrio: true },
  up: { lupa: 0, furgoneta: 0, tienda: 0, contactos: 0, seguro: 0, cerrajero: 0 },
  items: [], // { id, v, k } k: identificador único en el almacén
  nextK: 1,
  best: 0, // mejor día (ganancia)
  sold: 0, // dinero ganado vendiendo
  helps: 0, // veces que te han echado una mano al arruinarte
  done: [], // días ya apuntados (para no contar dos veces al recargar)
  last: null, // resumen del último día
});

export function load() {
  try {
    const st = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (st && st.v === 1) return { ...empty(), ...st, up: { ...empty().up, ...(st.up || {}) }, zones: { barrio: true, ...(st.zones || {}) } };
  } catch (e) {
    /* nada */
  }
  return empty();
}
export function save(st) {
  try {
    localStorage.setItem(KEY, JSON.stringify(st));
  } catch (e) {
    /* nada */
  }
}
export const exists = () => {
  try {
    return !!localStorage.getItem(KEY);
  } catch (e) {
    return false;
  }
};
export function reset() {
  const st = empty();
  save(st);
  return st;
}

export const capacity = (st) => UPGRADES.furgoneta.cap[st.up.furgoneta] || UPGRADES.furgoneta.cap[0];
export const shopBonus = (st) => UPGRADES.tienda.bonus[st.up.tienda] || 0;
export const trickOff = (st) => UPGRADES.contactos.off[st.up.contactos || 0] || 0;
export const trapOff = (st) => UPGRADES.seguro.off[st.up.seguro || 0] || 0;
export const locksmith = (st) => UPGRADES.cerrajero.price[st.up.cerrajero || 0] ?? LOCKSMITH;
export const sellPrice = (st, it) => r10(it.v * (1 + shopBonus(st)));
export const warehouseValue = (st) => st.items.reduce((t, it) => t + sellPrice(st, it), 0);

// piezas de cada colección que hay en el almacén
export function setsIn(st) {
  const out = {};
  for (const it of st.items) {
    const c = SET_OF[it.id];
    if (c) (out[c] = out[c] || []).push(it);
  }
  return out;
}
// lo que dan las piezas de una colección vendidas juntas (con el extra), si hay suficientes
export function setSale(st, set) {
  const pieces = setsIn(st)[set] || [];
  if (pieces.length < SET_NEED || !COLLECTION[set]) return null;
  const base = pieces.reduce((t, it) => t + sellPrice(st, it), 0);
  return { pieces, base, price: r10(base * (1 + SET_SALE_BONUS)) };
}

// Regateo: un comprador ofrece algo cercano al precio normal y puedes pedirle más.
// Pedir poco casi siempre cuela; pedir mucho, casi nunca. Si se cansa, se va y ese día ya solo vendes al precio normal.
export const HAGGLE_MIN = 100; // con menos no viene nadie a regatear: se vende sin más
export const canHaggle = (st, it) => !it.closed && it.haggled !== st.day && sellPrice(st, it) >= HAGGLE_MIN;
const r10h = (n) => Math.max(10, Math.round(n / 10) * 10);
export function haggleStart(st, it, x = Math.random()) {
  const base = sellPrice(st, it);
  return { k: it.k, base, offer: r10h(base * (0.85 + 0.2 * x)), asks: 0 };
}
export const haggleAsk = (h) => r10h(Math.min(h.base * 1.3, Math.max(h.offer * 1.15, h.offer + 10)));
// lo que pasa al pedirle más: 'yes' (vendido por lo pedido), 'meet' (sube a medio camino) o 'leave' (se va)
export function haggleTry(st, h, x = Math.random(), y = Math.random()) {
  const ask = haggleAsk(h);
  const p = Math.min(0.9, Math.max(0.1, 1.7 - ask / h.base));
  h.asks++;
  if (x < p) return { kind: 'yes', price: ask };
  if (h.asks < 2 && y < 0.5) {
    h.offer = r10h((h.offer + ask) / 2);
    return { kind: 'meet', price: h.offer };
  }
  const it = st.items.find((o) => o.k === h.k);
  if (it) it.haggled = st.day;
  return { kind: 'leave' };
}
export function sellAt(st, k, price) {
  const i = st.items.findIndex((it) => it.k === k);
  if (i < 0) return 0;
  st.items.splice(i, 1);
  st.money += price;
  st.sold += price;
  return price;
}

// Caja fuerte cerrada: el cerrajero la abre (cobra LOCKSMITH) y sale lo que haya dentro
export function openSafe(st, k, x = Math.random()) {
  const it = st.items.find((o) => o.k === k);
  const fee = locksmith(st);
  if (!it || !it.closed || st.money < fee) return null;
  st.money -= fee;
  const out = safeDraw(x);
  it.v = SAFE_CONTENTS[out].value;
  it.out = out;
  delete it.closed;
  return { out, value: it.v };
}

export function sell(st, k) {
  const i = st.items.findIndex((it) => it.k === k);
  if (i < 0) return 0;
  const price = sellPrice(st, st.items[i]);
  st.items.splice(i, 1);
  st.money += price;
  st.sold += price;
  return price;
}
// vende todo lo que no sea pieza de una colección (para hacer sitio rápido)
export function sellLoose(st) {
  let total = 0;
  for (const it of st.items.filter((x) => !SET_OF[x.id])) total += sell(st, it.k);
  return total;
}
export function sellSet(st, set) {
  const sale = setSale(st, set);
  if (!sale) return 0;
  const ks = new Set(sale.pieces.map((it) => it.k));
  st.items = st.items.filter((it) => !ks.has(it.k));
  st.money += sale.price;
  st.sold += sale.price;
  return sale.price;
}

// Mejoras
export function upgradeInfo(st, key) {
  const u = UPGRADES[key];
  const lv = st.up[key] || 0;
  if (lv >= u.costs.length) return { lv, max: true };
  const cost = u.costs[lv];
  const need = u.need[lv];
  const level = levelOf(st.xp).level;
  // las mejoras nuevas y el cuarto nivel de las de siempre piden haber abierto el Puerto
  const zone = (u.zone || (u.zoneAt != null && lv >= u.zoneAt)) && !st.zones[UPGRADE_ZONE] ? UPGRADE_ZONE : null;
  return { lv, cost, need, zone, locked: level < need || !!zone, afford: st.money >= cost };
}
export function buyUpgrade(st, key) {
  const info = upgradeInfo(st, key);
  if (info.max || info.locked || !info.afford) return false;
  st.money -= info.cost;
  st.up[key] = info.lv + 1;
  return true;
}

// Zonas
export function zoneState(st, zone) {
  const z = ZONE_INFO[zone];
  if (st.zones[zone]) return { open: true };
  const level = levelOf(st.xp).level;
  return { open: false, soon: !!z.soon, level: z.level, price: z.price, locked: z.soon || level < z.level, afford: st.money >= z.price };
}
export function unlockZone(st, zone) {
  const z = zoneState(st, zone);
  if (z.open || z.locked || !z.afford) return false;
  st.money -= z.price;
  st.zones[zone] = true;
  st.zone = zone;
  return true;
}

// ¿Se puede ir a la subasta? (sitio en el almacén)
export function canGo(st) {
  if (st.items.length >= capacity(st)) return { ok: false, why: 'full' };
  return { ok: true };
}
// Si te arruinas (sin dinero para la salida y sin nada que vender), te echan una mano para seguir jugando
export const HELP_MONEY = 300;
export const MIN_TO_GO = 100; // con menos no llegas ni a la salida
export function needsHelp(st) {
  return st.money < MIN_TO_GO && st.items.length === 0;
}
export function help(st) {
  if (!needsHelp(st)) return false;
  st.money = HELP_MONEY;
  st.helps++;
  return true;
}

// Reputación que da un día: por jugar, por cada trastero ganado y por lo que has ganado
export function dayXp(final) {
  const whole = final.played == null || final.played >= final.rounds; // el día entero (no a medias)
  return (whole ? 40 : 0) + 30 * (final.won || 0) + Math.max(0, Math.round((final.profit || 0) / 4));
}
// Apunta el día (una vez por clave). Devuelve el resumen o null si ya estaba apuntado.
export function commitDay(st, final, key) {
  if (!final || !final.career || st.done.includes(key)) return null;
  st.done.push(key);
  if (st.done.length > 30) st.done.splice(0, st.done.length - 30);
  // dejado antes de subastar nada: no cuenta como día
  if (final.played === 0 && !final.items.length && final.money === final.startMoney) return null;
  const before = levelOf(st.xp).level;
  const xp = dayXp(final);
  st.money = final.money;
  for (const it of final.items) st.items.push({ id: it.id, v: it.v, k: st.nextK++, ...(it.closed ? { closed: true } : {}) });
  st.xp += xp;
  const after = levelOf(st.xp).level;
  st.best = Math.max(st.best, final.profit);
  const summary = { day: st.day, zone: final.zone, profit: final.profit, won: final.won, items: final.items.length, xp, levelUp: after > before ? after : null };
  st.day++;
  st.last = summary;
  return summary;
}
