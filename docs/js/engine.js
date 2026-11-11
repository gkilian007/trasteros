// Motor del juego. Lo ejecuta SOLO el móvil anfitrión (autoridad única).
// Es puro: recibe el estado y la hora (now) y lo modifica; no toca red ni DOM,
// así que se puede probar en Node simulando partidas completas.

import { ITEMS, ITEM, itemEV, SLOT_EV, SET_NEED, SET_BONUS, SET_EXTRA, setCounts, SAFE_CONTENTS, SAFE_CLOSED, safeDraw } from './items.js';
import { FACES, PLAYER_LOOKS } from './art.js';

export const MAX_VERSUS = 7; // jugadores totales (humanos + bots)
export const MAX_COOP = 5; // humanos en cooperativo
export const MAX_HUMANS = 7;
export const COOP_ROUNDS = 6;

export const PITCHES = [
  { text: '¡Aquí hay algo GORDO!', emoji: '🔥', tone: 1 },
  { text: 'Yo pujaría fuerte…', emoji: '💰', tone: 0.6 },
  { text: 'Os juro que es buena compra.', emoji: '😇', tone: 0.8 },
  { text: 'Ni fu ni fa.', emoji: '🤷', tone: 0 },
  { text: 'Sin comentarios.', emoji: '🤐', tone: 0 },
  { text: 'Mejor no miréis dentro…', emoji: '🙈', tone: -0.7 },
];
export const DEFAULT_PITCH = 4;
export const OPENINGS = [50, 100, 200, 300];

export const SIGNALS = [
  { id: 'gem', emoji: '💎', label: '¡Joya!' },
  { id: 'good', emoji: '👍', label: 'Algo bueno' },
  { id: 'risk', emoji: '🎲', label: 'Arriesgado' },
  { id: 'meh', emoji: '😐', label: 'Poca cosa' },
  { id: 'danger', emoji: '☠️', label: '¡Peligro!' },
];

export const SIZES = [
  { id: 'pequeño', count: 3, w: 0.3 },
  { id: 'mediano', count: 4, w: 0.4 },
  { id: 'grande', count: 5, w: 0.3 },
];

// ---------- modo carrera ----------
// Cada día de carrera es una partida en solitario contra los rivales (como el cooperativo con una sola persona),
// de 3 trasteros, con el dinero que llevas en tu carrera. La zona decide qué suele salir (por tipo de objeto),
// de qué tamaño son los trasteros y cuánto dinero y ganas tienen los rivales.
export const CAREER_ROUNDS = 3;
export const ZONES = {
  // rivalMoney: con lo que empiezan cada día los rivales (en el Barrio, 1000 €: el mismo dinero que tú al empezar)
  // shark: [probabilidad de que el Tiburón suba tras una puja tuya, hasta cuántas veces lo que cree que vale]
  barrio: { sizes: { pequeño: 5, mediano: 4, grande: 1 }, kinds: { tesoro: 0.5, normal: 2, basura: 2.4, trampa: 1, misterio: 0.8 }, rivalMult: 0.56, rivalMoney: 1000, shark: [0.12, 1.05], rivals: ['r-urraca', 'r-tortuga'], rounds: 4, trickMult: 1 },
  poligono: { sizes: { pequeño: 2, mediano: 4.5, grande: 3.5 }, kinds: { tesoro: 1, normal: 2.4, basura: 1.4, trampa: 1, misterio: 1 }, rivalMult: 0.72, rivalMoney: 1800, shark: [0.25, 1.2], rounds: 4, trickMult: 1.5 },
  puerto: { sizes: { pequeño: 1, mediano: 3, grande: 6 }, kinds: { tesoro: 1.6, normal: 2, basura: 1.4, trampa: 1.6, misterio: 1.8 }, rivalMult: 0.9, rivalMoney: 4500, shark: [0.5, 1.5], trickMult: 3 },
  mansiones: { sizes: { pequeño: 2, mediano: 4, grande: 4 }, kinds: { tesoro: 2.6, normal: 2, basura: 0.8, trampa: 1, misterio: 1.4 }, rivalMult: 0.95, rivalMoney: 12000, shark: [0.55, 1.6], trickMult: 6 },
};
// Trucos: se compran con tu dinero en plena subasta para distraer a los rivales. Uno de cada por partida (o por día).
// ms: lo que dura con el juego a velocidad normal.
export const TRICKS = {
  movil: { name: 'Llamada', emoji: '📱', cost: 40, ms: 10000 }, // a un rival le suena el móvil: no puja
  famoso: { name: 'Famoso', emoji: '🤩', cost: 70, ms: 4000 }, // pasa un famoso: nadie más puja y vuelven despistados
  prisa: { name: 'Prisa', emoji: '⏱️', cost: 30 }, // el reloj se corta a la mitad (solo si vas ganando)
};
export const TRICK_ORDER = ['movil', 'famoso', 'prisa'];
const DAZED_MISS = 0.67;
const trickCost = (s, id) => Math.round((TRICKS[id].cost * (s.career ? ZONES[s.career.zone].trickMult || 1 : 1)) / 10) * 10;

// prepara una sala de anfitrión para un día de carrera (antes de «start»)
export function setupCareer(s, { zone, money, lupa = 0 }) {
  if (!ZONES[zone]) throw new Error('zona desconocida: ' + zone);
  s.mode = 'coop';
  s.players = humans(s);
  s.career = { zone, money: Math.max(0, Math.round(money)), lupa: Math.max(0, Math.min(3, lupa | 0)) };
  bump(s);
}
// mazo de la zona: cada objeto aparece más o menos según su tipo
function zoneDeck(s) {
  const z = ZONES[s.career.zone];
  const ids = [];
  for (const it of ITEMS) for (let k = Math.round((z.kinds[it.kind] || 0) * 2); k > 0; k--) ids.push(it.id);
  return shuffle(s, ids);
}

// cuánto se fían los rivales del cooperativo de lo que han visto (0 = nada, 1 = del todo)
export const TUNING = { rivalPeek: 0.5 };

// calibrado con test/sim.mjs: un equipo que se comunica bien gana ~70 % en fácil, ~55-65 % en normal y ~50 % en difícil
export const DIFFICULTIES = {
  facil: { label: 'Fácil', rivalMult: 0.56, tarp: false, stars: [2000, 2500] },
  normal: { label: 'Normal', rivalMult: 0.85, tarp: false, stars: [2150, 2600] },
  dificil: { label: 'Difícil', rivalMult: 0.79, tarp: true, stars: [2150, 2650] },
};

export const START_MONEY_VS = 1000;
export const START_MONEY_COOP = 1500;
export const RIVAL_MONEY = 1500;
export const COMMISSION = 0.5;

const DUR = {
  intro: 5600, // da tiempo a que el subastador «venda» el trastero con la persiana bajada
  pitch: 20000,
  peek: 22000,
  peekGrace: 1500,
  auctionOpen: 10000,
  bidExtend: 6000,
  flashOpen: 6000, // trastero relámpago
  flashExtend: 3000,
  revealPerItem: 2000,
  revealTail: 4800, // tiempo para leer la cuenta final (si ha ganado o perdido dinero)
};
// segundos que tarda en salir cada objeto al abrir la persiana (la pantalla lo usa para animar)
export const REVEAL_PER = DUR.revealPerItem / 1000;

const AVATARS = ['🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🦉', '🐙', '🦄', '🐷', '🐰'];
const COLORS = ['#ff7a1a', '#2bb0ff', '#ff4d8d', '#7ad94a', '#b47bff', '#ffd23f', '#22d3c5', '#ff6b5e'];
const BOT_NAMES = [
  ['Don Regateo', 'vaquero', '🤠'],
  ['Lola Lotes', 'lola', '👵'],
  ['Tito Trastos', 'chandal', '🧔'],
  ['Mari Mercadillo', 'pelirroja', '👩‍🦰'],
  ['El Chatarrero', 'abuelo', '👨‍🔧'],
  ['Paca Pujas', 'punk', '👩‍🎤'],
];
const RIVALS = [
  { id: 'r-tiburon', name: 'El Tiburón', look: 'tiburon', emoji: '🦈', style: 'Agresivo: lee tus pujas', base: 0.95, reads: true },
  { id: 'r-urraca', name: 'La Urraca', look: 'urraca', emoji: '🐦', style: 'Le pierde lo que brilla', base: 0.8, shiny: true },
  { id: 'r-tortuga', name: 'La Tortuga', look: 'tortuga', emoji: '🐢', style: 'Prudente y paciente', base: 0.68 },
];
// Subastador de la casa (modo cooperativo)
export const HOUSE = { id: 'house', name: 'Don Martillo', look: 'martillo' };

// ---------- utilidades ----------
export function rand(s) {
  // mulberry32 sobre s.seed (serializable)
  let t = (s.seed = (s.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (s, a, b) => a + (b - a) * rand(s);
const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];
const r10 = (x) => Math.max(0, Math.round(x / 10) * 10);
function shuffle(s, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function weighted(s, entries) {
  const total = entries.reduce((t, e) => t + e[1], 0);
  let x = rand(s) * total;
  for (const [v, w] of entries) {
    if ((x -= w) <= 0) return v;
  }
  return entries[entries.length - 1][0];
}
const dur = (s, key) => Math.round(DUR[key] / (s.settings.speed || 1));
export const worthOf = (o) => o.money + o.items.reduce((t, it) => t + it.v, 0);

// ---------- creación ----------
export function createRoom({ code, hostId, hostName, seed = Date.now(), now = Date.now(), speed = 1 }) {
  const s = {
    v: 1,
    code,
    hostId,
    seed: seed >>> 0,
    phase: 'lobby',
    mode: 'versus',
    settings: { laps: 0, difficulty: 'normal', speed },
    players: [],
    round: 0,
    totalRounds: 0,
    endsAt: null,
    phaseDur: null,
    unit: null,
    auctioneerId: null,
    pitch: null,
    auction: null,
    signals: {},
    faces: {},
    results: null,
    team: null,
    rivals: null,
    final: null,
    deck: [],
    log: [],
  };
  addHuman(s, hostId, hostName, now);
  ensureMinPlayers(s);
  return s;
}

function usedAvatars(s) {
  return new Set(s.players.map((p) => p.avatar));
}

function freeLook(s, { forBot = false } = {}) {
  const taken = new Set(s.players.map((p) => p.look));
  const humanTaken = new Set(s.players.filter((p) => !p.bot).map((p) => p.look));
  const free = PLAYER_LOOKS.filter((l) => !taken.has(l));
  if (free.length) {
    if (forBot) return free[0];
    // a las personas les toca uno al azar, mejor de los que no llevan los bots
    const botLooks = new Set(BOT_NAMES.map((b) => b[1]));
    const nice = free.filter((l) => !botLooks.has(l));
    return pick(s, nice.length ? nice : free);
  }
  return (forBot ? null : PLAYER_LOOKS.find((l) => !humanTaken.has(l))) || pick(s, PLAYER_LOOKS);
}

function addHuman(s, id, name, now) {
  const used = usedAvatars(s);
  const avatar = AVATARS.find((a) => !used.has(a)) || pick(s, AVATARS);
  const color = COLORS[s.players.length % COLORS.length];
  const look = freeLook(s);
  // si un bot llevaba ese personaje, se convierte en otro bot (nombre y personaje a juego)
  for (const b of s.players) if (b.bot && b.look === look) rebot(s, b, null, look);
  s.players.push({
    id,
    name: cleanName(name),
    bot: false,
    avatar,
    look,
    color,
    online: true,
    lastSeen: now,
    money: 0,
    items: [],
  });
}

const BAD_CHARS = new RegExp('[<>&`' + String.fromCharCode(34, 39) + ']', 'g');
export function cleanName(name) {
  const n = String(name || '').replace(BAD_CHARS, '').trim().slice(0, 14);
  return n || 'Jugador';
}

const humans = (s) => s.players.filter((p) => !p.bot);
const bots = (s) => s.players.filter((p) => p.bot);

// ---------- entrada de jugadores ----------
// Devuelve { ok: true } o { ok: false, reason }
export function join(s, id, name, now) {
  const existing = s.players.find((p) => p.id === id);
  if (existing) {
    if (name && cleanName(name) !== existing.name && s.phase === 'lobby') existing.name = uniqueName(s, cleanName(name), id);
    if (!existing.online) existing.online = true;
    existing.lastSeen = now;
    bump(s);
    return { ok: true };
  }
  if (s.phase !== 'lobby') return { ok: false, reason: 'started' };
  if (humans(s).length >= MAX_HUMANS) return { ok: false, reason: 'full' };
  if (s.mode === 'versus' && s.players.length >= MAX_VERSUS) {
    // deja sitio quitando un bot
    const b = bots(s).pop();
    if (b) s.players = s.players.filter((p) => p !== b);
    else return { ok: false, reason: 'full' };
  }
  addHuman(s, id, uniqueName(s, cleanName(name), id), now);
  bump(s);
  return { ok: true };
}

function uniqueName(s, name, id) {
  let n = name;
  let k = 2;
  while (s.players.some((p) => p.id !== id && p.name.toLowerCase() === n.toLowerCase())) n = `${name.slice(0, 12)} ${k++}`;
  return n;
}

export function ping(s, id, now) {
  const p = s.players.find((x) => x.id === id);
  if (!p) return false;
  p.lastSeen = now;
  if (!p.online) {
    p.online = true;
    bump(s);
    return true;
  }
  return false;
}

export function leave(s, id) {
  const p = s.players.find((x) => x.id === id);
  if (!p) return;
  if (s.phase === 'lobby' && id !== s.hostId) s.players = s.players.filter((x) => x.id !== id);
  else p.online = false;
  bump(s);
}

function bump(s) {
  s.v++;
}

// ---------- acciones ----------
// a = { type, ... }. Devuelve { ok, reason? }
export function act(s, pid, a, now) {
  const isHost = pid === s.hostId;
  const me = s.players.find((p) => p.id === pid);
  if (!me) return { ok: false, reason: 'unknown' };
  if (s.pausedAt != null && ['pitch', 'signal', 'bid', 'appraise', 'trick'].includes(a.type)) return no('paused');
  if (a.type === 'appraise') return appraise(s, pid);
  switch (a.type) {
    case 'setMode': {
      if (!isHost || s.phase !== 'lobby') return no('forbidden');
      if (a.mode !== 'versus' && a.mode !== 'coop') return no('bad');
      s.mode = a.mode;
      if (s.mode === 'coop') s.players = humans(s);
      else ensureMinPlayers(s);
      bump(s);
      return yes();
    }
    case 'setDifficulty': {
      if (!isHost || s.phase !== 'lobby' || !DIFFICULTIES[a.value]) return no('bad');
      s.settings.difficulty = a.value;
      bump(s);
      return yes();
    }
    case 'setLaps': {
      if (!isHost || s.phase !== 'lobby' || ![0, 1, 2].includes(a.value)) return no('bad');
      s.settings.laps = a.value;
      bump(s);
      return yes();
    }
    case 'addBot': {
      if (!isHost || s.phase !== 'lobby' || s.mode !== 'versus') return no('bad');
      if (s.players.length >= MAX_VERSUS) return no('full');
      addBot(s);
      bump(s);
      return yes();
    }
    case 'removeBot': {
      if (!isHost || s.phase !== 'lobby') return no('bad');
      const b = a.id ? s.players.find((p) => p.id === a.id && p.bot) : bots(s).pop();
      if (!b) return no('bad');
      s.players = s.players.filter((p) => p !== b);
      bump(s);
      return yes();
    }
    case 'kick': {
      if (!isHost || s.phase !== 'lobby' || a.id === s.hostId) return no('bad');
      s.players = s.players.filter((p) => p.id !== a.id);
      bump(s);
      return yes();
    }
    case 'start': {
      if (!isHost || s.phase !== 'lobby') return no('bad');
      const err = canStart(s);
      if (err) return no(err);
      startGame(s, now);
      return yes();
    }
    case 'toLobby': {
      if (!isHost || s.phase !== 'end') return no('bad');
      toLobby(s);
      return yes();
    }
    case 'rematch': {
      if (!isHost || s.phase !== 'end') return no('bad');
      toLobby(s);
      const err = canStart(s);
      if (err) return no(err);
      startGame(s, now);
      return yes();
    }
    case 'setLook': {
      if (s.phase !== 'lobby' || !PLAYER_LOOKS.includes(a.look)) return no('bad');
      if (s.players.some((p) => p.id !== pid && !p.bot && p.look === a.look)) return no('taken');
      const old = me.look;
      me.look = a.look;
      for (const b of s.players) if (b.bot && b.look === a.look) rebot(s, b, old);
      bump(s);
      return yes();
    }
    case 'face': {
      if (!FACES.includes(a.face)) return no('bad');
      setFace(s, pid, a.face);
      return yes();
    }
    case 'pitch': {
      if (s.mode !== 'versus' || s.phase !== 'pitch' || pid !== s.auctioneerId) return no('bad');
      const phrase = Number.isInteger(a.phrase) && PITCHES[a.phrase] ? a.phrase : DEFAULT_PITCH;
      const opening = OPENINGS.includes(a.opening) ? a.opening : OPENINGS[0];
      if (FACES.includes(a.face)) setFace(s, pid, a.face);
      s.pitch = { phrase, opening };
      openAuction(s, now);
      return yes();
    }
    case 'signal': {
      if (s.mode !== 'coop' || (s.phase !== 'peek' && s.phase !== 'auction')) return no('bad');
      if (!SIGNALS.some((x) => x.id === a.kind)) return no('bad');
      s.signals[pid] = a.kind;
      bump(s);
      if (s.phase === 'peek') maybeEndPeek(s, now);
      return yes();
    }
    case 'bid': {
      if (s.phase !== 'auction') return no('late');
      const key = s.mode === 'coop' ? 'team' : pid;
      return placeBid(s, key, Number(a.amount), now, pid);
    }
    case 'trick':
      return useTrick(s, pid, a.trick, now);
    default:
      return no('bad');
  }
}
function setFace(s, key, face) {
  if (!s.faces) s.faces = {};
  if (s.faces[key] !== face) {
    s.faces[key] = face;
    bump(s);
  }
}
const yes = () => ({ ok: true });
const no = (reason) => ({ ok: false, reason });

export function canStart(s) {
  if (s.mode === 'versus') {
    if (s.players.length < 3) return 'Hacen falta 3 jugadores (añade bots)';
    if (s.players.length > MAX_VERSUS) return `Máximo ${MAX_VERSUS} jugadores`;
  } else {
    const h = humans(s).length;
    if (h < 1) return 'Hace falta al menos 1 jugador';
    if (h > MAX_COOP) return `En cooperativo el máximo es ${MAX_COOP}`;
  }
  return null;
}

function ensureMinPlayers(s) {
  while (s.players.length < 3) addBot(s);
}

// un bot que pierde su personaje pasa a ser otro de la lista, con su nombre y su personaje
function rebot(s, b, spare = null, taken = null) {
  const usedNames = new Set(s.players.filter((p) => p !== b).map((p) => p.name));
  const usedLooks = new Set(s.players.filter((p) => p !== b).map((p) => p.look));
  if (taken) usedLooks.add(taken);
  const entry = BOT_NAMES.find(([n, l]) => !usedNames.has(n) && !usedLooks.has(l));
  if (entry) {
    [b.name, b.look, b.avatar] = entry;
    return;
  }
  b.look = spare && !usedLooks.has(spare) ? spare : PLAYER_LOOKS.find((l) => !usedLooks.has(l)) || b.look;
}

function addBot(s) {
  const usedNames = new Set(s.players.map((p) => p.name));
  const usedLooks = new Set(s.players.map((p) => p.look));
  const entry =
    BOT_NAMES.find(([n, l]) => !usedNames.has(n) && !usedLooks.has(l)) ||
    BOT_NAMES.find(([n]) => !usedNames.has(n)) || [`Bot ${s.players.length}`, null, '🤖'];
  const [name, prefLook, avatar] = entry;
  const look = prefLook && !usedLooks.has(prefLook) ? prefLook : freeLook(s, { forBot: true }) || prefLook || 'vaquero';
  s.players.push({
    id: 'bot-' + Math.floor(rand(s) * 1e9).toString(36),
    name,
    bot: true,
    avatar,
    look,
    color: COLORS[s.players.length % COLORS.length],
    online: true,
    lastSeen: 0,
    money: 0,
    items: [],
    trait: { factor: between(s, 0.72, 0.98), trust: between(s, 0.1, 0.4) },
  });
}

function toLobby(s) {
  s.phase = 'lobby';
  s.round = 0;
  s.totalRounds = 0;
  s.endsAt = null;
  s.phaseDur = null;
  s.unit = null;
  s.auctioneerId = null;
  s.pitch = null;
  s.auction = null;
  s.signals = {};
  s.faces = {};
  s.results = null;
  s.team = null;
  s.rivals = null;
  s.final = null;
  for (const p of s.players) {
    p.money = 0;
    p.items = [];
  }
  if (s.mode === 'versus') ensureMinPlayers(s);
  bump(s);
}

function startGame(s, now) {
  s.deck = shuffle(s, ITEMS.map((i) => i.id));
  s.lastSpecial = null;
  s.game = (s.game || 0) + 1; // número de partida en esta sala (para no contar dos veces los récords)
  s.tricks = {}; // trucos ya gastados en esta partida, por jugador (o 'team')
  s.final = null;
  s.results = null;
  s.round = 0;
  if (s.mode === 'versus') {
    s.players = shuffle(s, s.players); // orden de subastador aleatorio
    for (const p of s.players) {
      p.money = START_MONEY_VS;
      p.items = [];
    }
    const n = s.players.length;
    const laps = s.settings.laps || (n <= 4 ? 2 : 1);
    s.totalRounds = n * laps;
    s.team = null;
    s.rivals = null;
  } else {
    for (const p of s.players) {
      p.money = 0;
      p.items = [];
    }
    s.totalRounds = s.career ? ZONES[s.career.zone].rounds || CAREER_ROUNDS : COOP_ROUNDS;
    s.team = { money: s.career ? s.career.money : START_MONEY_COOP, items: [] };
    const pick = s.career && ZONES[s.career.zone].rivals;
    s.rivals = RIVALS.filter((r) => !pick || pick.includes(r.id)).map((r) => ({ ...r, money: s.career ? ZONES[s.career.zone].rivalMoney : RIVAL_MONEY, items: [] }));
    if (s.career) s.deck = zoneDeck(s);
  }
  startRound(s, now);
}

function draw(s, n) {
  const out = [];
  let guard = 0;
  while (out.length < n) {
    if (!s.deck.length) s.deck = s.career ? zoneDeck(s) : shuffle(s, ITEMS.map((i) => i.id).filter((id) => !out.includes(id)));
    const id = s.deck.pop();
    // en el mazo de la carrera hay copias: en un mismo trastero, cada objeto una sola vez
    if (out.includes(id) && guard++ < 200) {
      s.deck.unshift(id);
      continue;
    }
    out.push(id);
  }
  return out;
}

// ---------- trasteros especiales ----------
// De vez en cuando (nunca en la primera ronda ni dos seguidas) el trastero viene con una regla distinta:
//  misterio:  nadie mira dentro, ni el subastador
//  relampago: la subasta abre con 6 s y cada puja da solo 3
//  tasador:   cada jugador puede pagar 50 € (una vez) para mirar una caja más
export const SPECIALS = ['misterio', 'relampago', 'tasador'];
export const APPRAISE_COST = 50;
const SPECIAL_CHANCE = 0.3;
function pickSpecial(s) {
  if (s.forceSpecial !== undefined) return s.forceSpecial; // pruebas
  const last = s.lastSpecial || null;
  if (s.round < 2 || (last && last.round === s.round - 1) || rand(s) >= SPECIAL_CHANCE) return null;
  return pick(s, SPECIALS.filter((k) => !last || k !== last.kind));
}
const isFlash = (s) => !!(s.unit && s.unit.special === 'relampago');
const extendKey = (s) => (isFlash(s) ? 'flashExtend' : 'bidExtend');

function startRound(s, now) {
  s.round++;
  const size = weighted(s, SIZES.map((z) => [z, s.career ? ZONES[s.career.zone].sizes[z.id] || 0 : z.w]));
  const ids = draw(s, size.count);
  const special = pickSpecial(s);
  if (special) s.lastSpecial = { kind: special, round: s.round };
  // no hay objeto a la vista de todos: cada uno solo sabe lo que ha mirado él (door se queda siempre en null)
  const unit = { size: size.id, count: size.count, ids, door: null, tarp: null, seen: {}, values: null, special, appraised: {} };
  s.signals = {};
  s.faces = s.mode === 'coop' ? { house: 'feliz' } : {};
  s.pitch = null;
  s.auction = null;
  s.results = null;
  if (s.mode === 'versus') {
    s.auctioneerId = s.players[(s.round - 1) % s.players.length].id;
    unit.seen[s.auctioneerId] = ids.map((_, i) => i);
    // cada uno de los demás (personas y bots) mira en secreto un objeto, distinto al del resto si se puede
    const hidden = shuffle(s, ids.map((_, i) => i).filter((i) => i !== unit.door));
    shuffle(s, s.players.filter((p) => p.id !== s.auctioneerId)).forEach((p, k) => {
      unit.seen[p.id] = [hidden[k % hidden.length]];
    });
  } else {
    s.auctioneerId = null;
    const hidden = ids.map((_, i) => i).filter((i) => i !== unit.door);
    const diff = DIFFICULTIES[s.settings.difficulty] || DIFFICULTIES.normal;
    let pool = shuffle(s, hidden);
    if (diff.tarp && pool.length > 1) {
      unit.tarp = pool.pop();
    }
    const hs = shuffle(s, humans(s));
    if (s.career) {
      // carrera: miras una caja, y una más por cada nivel de la lupa
      unit.seen[hs[0].id] = pool.slice(0, Math.min(pool.length, 1 + s.career.lupa)).sort((a, b) => a - b);
    } else {
      // cooperativo: cada uno mira una caja, distinta a la de los demás mientras haya
      hs.forEach((h, k) => (unit.seen[h.id] = pool.length ? [pool[k % pool.length]] : []));
    }
    // los rivales también han echado un vistazo: cada uno a un objeto distinto (nadie ve bajo la lona)
    const rpool = shuffle(s, hidden.filter((i) => i !== unit.tarp));
    if (rpool.length) shuffle(s, s.rivals).forEach((r, k) => (unit.seen[r.id] = [rpool[k % rpool.length]]));
  }
  if (special === 'misterio') {
    // nadie ha mirado nada: ni el subastador, ni los demás, ni los rivales
    unit.tarp = null;
    for (const pid in unit.seen) unit.seen[pid] = [];
  }
  s.unit = unit;
  setPhase(s, 'intro', now, dur(s, 'intro'));
}

// Tasador: pagar para mirar una caja más (una vez por trastero; en cooperativo paga la caja del equipo)
function appraise(s, pid) {
  const u = s.unit;
  if (!u || u.special !== 'tasador' || !['pitch', 'peek', 'auction'].includes(s.phase)) return no('bad');
  if (s.mode === 'versus' && pid === s.auctioneerId) return no('bad');
  if (u.appraised[pid]) return no('done');
  const seen = u.seen[pid] || (u.seen[pid] = []);
  const left = u.ids.map((_, i) => i).filter((i) => !seen.includes(i) && i !== u.door && i !== u.tarp);
  if (!left.length) return no('done');
  const payer = s.mode === 'coop' ? s.team : s.players.find((p) => p.id === pid);
  const akey = s.mode === 'coop' ? 'team' : pid;
  const held = s.phase === 'auction' && s.auction && s.auction.leader === akey ? s.auction.amount : 0; // lo pujado está comprometido
  if (!payer || payer.money - APPRAISE_COST < held) return no('funds');
  payer.money -= APPRAISE_COST;
  u.appraised[pid] = true;
  seen.push(pick(s, left));
  seen.sort((a, b) => a - b);
  bump(s);
  return yes();
}

function setPhase(s, phase, now, ms) {
  s.phase = phase;
  s.endsAt = ms == null ? null : now + ms;
  s.phaseDur = ms;
  bump(s);
}

function maybeEndPeek(s, now) {
  const online = humans(s).filter((p) => p.online);
  if (online.length && online.every((p) => s.signals[p.id])) {
    const t = now + dur(s, 'peekGrace');
    if (s.endsAt > t) {
      s.endsAt = t;
      bump(s);
    }
  }
}

// ---------- subasta ----------
function publicEstimate(s) {
  const u = s.unit;
  if (u.door == null) return u.count * SLOT_EV;
  return itemEV(u.ids[u.door]) + (u.count - 1) * SLOT_EV;
}

// lo que vale el trastero para alguien según lo que ha visto (puerta + sus objetos) y la media para el resto
function estimateFor(s, pid) {
  const u = s.unit;
  const known = new Set([...(u.door == null ? [] : [u.door]), ...(u.seen[pid] || [])]);
  let est = 0;
  for (let i = 0; i < u.count; i++) est += known.has(i) ? itemEV(u.ids[i]) : SLOT_EV;
  return est;
}
const seenKinds = (s, pid) => (s.unit.seen[pid] || []).map((i) => ITEM[s.unit.ids[i]].kind);

function trueEstimate(s) {
  return s.unit.ids.reduce((t, id) => t + itemEV(id), 0);
}

function openAuction(s, now) {
  const opening = s.mode === 'versus' ? (s.pitch ? s.pitch.opening : OPENINGS[0]) : 50;
  if (s.mode === 'versus' && !s.pitch) s.pitch = { phrase: DEFAULT_PITCH, opening };
  s.auction = {
    amount: 0,
    opening,
    leader: null,
    leaderName: null,
    byPlayer: null,
    history: [],
    startedAt: now,
    plans: {},
  };
  // planes de los bots
  const pub = publicEstimate(s);
  if (s.mode === 'versus') {
    const tone = PITCHES[s.pitch.phrase].tone;
    for (const b of bots(s)) {
      if (b.id === s.auctioneerId) continue;
      // cada bot puja según lo que ha visto él, ajustado por lo que dice el subastador
      const own = estimateFor(s, b.id);
      const est = own * (1 + tone * b.trait.trust) * between(s, 0.85, 1.15);
      const max = r10(est * b.trait.factor);
      s.auction.plans[b.id] = { max, nextAt: null };
      // los bots también ponen cara (a veces dice la verdad, a veces farolean)
      if (rand(s) < 0.45) {
        const keen = own > pub * 1.05 || max > pub * 0.95;
        const honest = rand(s) < 0.65;
        const pool = keen === honest ? [['codicia', 2], ['picaro', 2], ['feliz', 1]] : [['nervios', 2], ['poker', 2], ['triste', 1]];
        setFace(s, b.id, weighted(s, pool));
      }
    }
  } else {
    const diff = s.career ? { rivalMult: ZONES[s.career.zone].rivalMult } : DIFFICULTIES[s.settings.difficulty] || DIFFICULTIES.normal;
    const door = s.unit.door == null ? null : ITEM[s.unit.ids[s.unit.door]]; // en el misterioso no hay nada a la vista
    for (const r of s.rivals) {
      let f = r.base * diff.rivalMult * between(s, 0.85, 1.15);
      const kinds = [...(door ? [door.kind] : []), ...seenKinds(s, r.id)];
      if (r.shiny && kinds.some((k) => k === 'tesoro' || k === 'misterio')) f *= 1.3;
      if (r.shiny && kinds.length && kinds.every((k) => k === 'basura' || k === 'trampa')) f *= 0.8;
      const est = pub + (estimateFor(s, r.id) - pub) * TUNING.rivalPeek;
      s.auction.plans[r.id] = { max: r10(est * f), nextAt: null };
      if (rand(s) < 0.4) setFace(s, r.id, weighted(s, [['picaro', 2], ['poker', 2], ['codicia', 1], ['nervios', 1]]));
    }
    setFace(s, HOUSE.id, weighted(s, [['feliz', 2], ['picaro', 2], ['codicia', 1]]));
  }
  setPhase(s, 'auction', now, dur(s, isFlash(s) ? 'flashOpen' : 'auctionOpen'));
}

function nextMin(s) {
  const a = s.auction;
  return a.leader ? a.amount + 10 : a.opening;
}

function fundsOf(s, key) {
  if (key === 'team') return s.team.money;
  if (s.mode === 'coop') {
    const r = s.rivals.find((x) => x.id === key);
    return r ? r.money : 0;
  }
  const p = s.players.find((x) => x.id === key);
  return p ? p.money : 0;
}

function nameOf(s, key) {
  if (key === 'team') return s.career ? 'Tú' : 'Vuestro equipo';
  if (s.mode === 'coop') {
    const r = s.rivals.find((x) => x.id === key);
    return r ? r.name : '?';
  }
  const p = s.players.find((x) => x.id === key);
  return p ? p.name : '?';
}

export function placeBid(s, key, amount, now, byPlayer = null) {
  const a = s.auction;
  if (s.phase !== 'auction' || !a) return no('late');
  if (s.mode === 'versus' && key === s.auctioneerId) return no('auctioneer');
  if (a.leader === key) return no('leading');
  if (isBlocked(a, key, now)) return no('distracted');
  if (!Number.isFinite(amount) || amount % 10 !== 0) return no('bad');
  if (amount < nextMin(s)) return no('low');
  if (amount > fundsOf(s, key)) return no('funds');
  a.amount = amount;
  a.leader = key;
  a.leaderName = nameOf(s, key);
  a.byPlayer = byPlayer;
  const byName = byPlayer && key === 'team' ? (s.players.find((p) => p.id === byPlayer) || {}).name : null;
  a.history.unshift({ key, name: a.leaderName, by: byName, amount });
  a.lastAt = now;
  if (a.history.length > 6) a.history.length = 6;
  // cada puja deja siempre 6 s para contestar: sin tope de tiempo, nadie se queda sin poder responder
  // a una puja de última hora (la subasta acaba cuando pasan 6 s sin que nadie suba)
  s.endsAt = Math.max(s.endsAt, now + dur(s, extendKey(s)));
  s.phaseDur = dur(s, extendKey(s));
  // los bots reaccionan
  for (const k in a.plans) a.plans[k].nextAt = null;
  if (key === 'team') {
    // El Tiburón lee las pujas del equipo: si pujáis fuerte, sospecha que hay algo bueno
    const t = s.rivals.find((r) => r.reads);
    const plan = t && a.plans[t.id];
    // en la carrera depende de la zona: en el barrio apenas te persigue, en el puerto va a por todas
    const [sp, sc] = s.career ? ZONES[s.career.zone].shark : [0.55, 1.6];
    if (plan && rand(s) < sp) {
      const ceiling = r10(Math.max(publicEstimate(s), estimateFor(s, t.id)) * sc);
      plan.max = Math.min(ceiling, Math.max(plan.max, r10(amount + between(s, 10, 80))));
      setFace(s, t.id, 'codicia');
    }
  }
  if (s.mode === 'coop' && rand(s) < 0.25) setFace(s, HOUSE.id, rand(s) < 0.5 ? 'codicia' : 'feliz');
  bump(s);
  return yes();
}

const isBlocked = (a, key, now) => !!(a.blocked && a.blocked[key] > now);

// Un truco: lo paga quien lo usa (la caja del equipo en cooperativo) y deja a los rivales sin pujar un rato
function useTrick(s, pid, id, now) {
  const a = s.auction;
  const T = TRICKS[id];
  if (s.phase !== 'auction' || !a) return no('late');
  if (!T) return no('bad');
  if (s.mode === 'versus' && pid === s.auctioneerId) return no('auctioneer');
  const key = s.mode === 'coop' ? 'team' : pid;
  if (isBlocked(a, key, now)) return no('distracted');
  if (!s.tricks) s.tricks = {};
  const used = s.tricks[key] || (s.tricks[key] = {});
  if (used[id]) return no('used');
  if (a.trick && now < a.trick.until) return no('busy');
  if (id === 'prisa' && a.leader !== key) return no('notleading');
  const others = s.mode === 'coop' ? s.rivals.map((r) => r.id) : s.players.filter((p) => p.id !== pid && p.id !== s.auctioneerId).map((p) => p.id);
  if (!others.length) return no('bad');
  const payer = s.mode === 'coop' ? s.team : s.players.find((p) => p.id === pid);
  const cost = trickCost(s, id);
  // si vas ganando, lo que has pujado está comprometido: el truco se paga con lo que sobra
  if (!payer || payer.money - cost < (a.leader === key ? a.amount : 0)) return no('funds');
  payer.money -= cost;
  used[id] = true;
  if (!a.blocked) a.blocked = {};
  if (!a.blockedBy) a.blockedBy = {}; // qué truco tiene distraído a cada uno
  const sp = s.settings.speed || 1;
  let targets;
  let until;
  if (id === 'prisa') {
    // el reloj se corta a la mitad; a los bots les pilla por sorpresa a uno de cada dos
    const ms = Math.round(dur(s, extendKey(s)) / 2);
    s.endsAt = Math.min(s.endsAt, now + ms);
    s.phaseDur = ms;
    until = s.endsAt;
    targets = [];
    for (const k in a.plans) {
      const plan = a.plans[k];
      plan.nextAt = null;
      if (k === a.leader || plan.max < nextMin(s) || fundsOf(s, k) < nextMin(s)) continue;
      if (rand(s) < 0.5) {
        a.blocked[k] = until;
        a.blockedBy[k] = id;
        targets.push(k);
      }
    }
  } else {
    until = now + Math.round(T.ms / sp);
    if (id === 'famoso') targets = others;
    else {
      // la llamada es para el rival más peligroso: contra bots, el que más ganas tiene de los que siguen pujando;
      // entre personas, quien te va ganando o el último que te ha pujado
      const min = nextMin(s);
      const keen = others.filter((k) => a.plans[k] && (k === a.leader || (a.plans[k].max >= min && fundsOf(s, k) >= min))).sort((x, y) => a.plans[y].max - a.plans[x].max)[0];
      const last = a.leader && a.leader !== key ? a.leader : (a.history.find((h) => h.key !== key) || {}).key;
      let who = s.mode === 'coop' ? keen || last : last || keen;
      if (!who || !others.includes(who)) who = others[Math.floor(rand(s) * others.length)];
      targets = [who];
    }
    for (const k of targets) {
      a.blocked[k] = until;
      a.blockedBy[k] = id;
      if (a.plans[k]) {
        a.plans[k].nextAt = null;
        a.plans[k].dazed = true; // al volver puede seguir despistado
      }
    }
  }
  for (const k of targets) setFace(s, k, 'sorpresa');
  a.trickN = (a.trickN || 0) + 1;
  a.trick = { id, by: key, byName: nameOf(s, key), byPlayer: pid, targets, n: a.trickN, until };
  bump(s);
  return yes();
}

function runBots(s, now) {
  const a = s.auction;
  const remaining = s.endsAt - now;
  const keys = Object.keys(a.plans);
  if (a.blocked) {
    // se acabó la distracción: se avisa a las pantallas. Un bot recién distraído (llamada o famoso) vuelve
    // despistado: dos de cada tres veces no se centra hasta que acaba esta cuenta atrás
    for (const k in a.blocked)
      if (a.blocked[k] <= now) {
        const plan = a.plans[k];
        if (plan && plan.dazed && s.endsAt > now && rand(s) < DAZED_MISS) a.blocked[k] = s.endsAt;
        else delete a.blocked[k];
        if (plan) plan.dazed = false;
        bump(s);
      }
  }
  for (const k of keys) {
    const plan = a.plans[k];
    if (a.leader === k) continue;
    if (isBlocked(a, k, now)) {
      plan.nextAt = null;
      continue;
    }
    const min = nextMin(s);
    const funds = fundsOf(s, k);
    if (plan.max < min || funds < min) {
      if (!plan.dropped && a.history.length) {
        plan.dropped = true;
        if (rand(s) < 0.35) setFace(s, k, rand(s) < 0.5 ? 'nervios' : 'triste');
      }
      continue;
    }
    if (plan.nextAt == null) {
      // Como una persona: tarda en decidirse (más al abrir y cuanto más cerca está de su límite),
      // a veces duda con cara de nervios, y nunca puja casi a la vez que otro bot
      const sp = s.settings.speed || 1;
      const close = Math.min(1, min / Math.max(1, plan.max));
      let delay = (a.history.length ? between(s, 1300, 3300) : between(s, 1800, 4200)) + close * close * between(s, 0, 2200);
      if (rand(s) < 0.2) {
        delay += between(s, 800, 2000);
        setFace(s, k, rand(s) < 0.5 ? 'nervios' : 'poker');
      }
      delay /= sp;
      if (a.lastAt != null && now + delay < a.lastAt + 1200 / sp) delay = a.lastAt + 1200 / sp - now + between(s, 0, 500) / sp;
      if (delay > remaining - 500 / sp) delay = Math.max(50, remaining - between(s, 500, 1400) / sp);
      plan.nextAt = now + delay;
      continue;
    }
    if (now >= plan.nextAt) {
      plan.nextAt = null;
      const cap = Math.min(plan.max, funds);
      // con mucho margen sube a saltos más grandes (como hace la gente al principio)
      const jump = cap - min >= 250 ? weighted(s, [[0, 3], [40, 3], [90, 2]]) : weighted(s, [[0, 5], [40, 3], [90, 1]]);
      const amount = Math.min(cap, min + jump);
      const r = placeBid(s, k, Math.floor(amount / 10) * 10, now);
      if (r.ok) {
        if (rand(s) < 0.3) setFace(s, k, weighted(s, [['picaro', 2], ['feliz', 1], ['codicia', 1], ['poker', 2]]));
        return true; // una puja por tick
      }
    }
  }
  return false;
}

function botPitch(s, now) {
  const auct = s.players.find((p) => p.id === s.auctioneerId);
  if (!auct || !auct.bot) return false;
  if (s.unit.botPitchAt == null) {
    s.unit.botPitchAt = now + between(s, 2500, 6500) / (s.settings.speed || 1);
    return false;
  }
  if (now < s.unit.botPitchAt) return false;
  const P = publicEstimate(s);
  const T = s.unit.special === 'misterio' ? P : trueEstimate(s); // en el misterioso tampoco sabe lo que hay
  let phrase;
  let opening;
  let face;
  if (T > P * 1.25) {
    // es bueno: a veces lo vende, a veces lo esconde para quedárselo gratis
    phrase = weighted(s, [[0, 3], [1, 2], [4, 2], [3, 2], [5, 1]]);
    opening = weighted(s, [[100, 3], [200, 3], [300, 1]]);
    face = weighted(s, [['poker', 3], ['picaro', 3], ['feliz', 2], ['nervios', 1]]);
  } else if (T < P * 0.75) {
    // es malo: farol para que alguien pague de más
    phrase = weighted(s, [[0, 3], [2, 3], [1, 2], [4, 1]]);
    opening = weighted(s, [[50, 3], [100, 2]]);
    face = weighted(s, [['feliz', 3], ['codicia', 2], ['picaro', 2], ['poker', 1]]);
  } else {
    phrase = Math.floor(rand(s) * PITCHES.length);
    opening = pick(s, [50, 100, 100, 200]);
    face = pick(s, FACES.slice(0, 6));
  }
  setFace(s, auct.id, face);
  s.pitch = { phrase, opening };
  openAuction(s, now);
  return true;
}

// ---------- revelado ----------
function resolveValues(s) {
  const ids = s.unit.ids;
  const notes = [];
  const safe = {}; // caja fuerte: qué ha salido al abrirla (-1: va cerrada al almacén de la carrera)
  const values = ids.map((id, i) => {
    const it = ITEM[id];
    if (it.safe) {
      if (s.career) {
        safe[i] = -1;
        notes.push({ k: 'safeClosed' });
        return SAFE_CLOSED;
      }
      const k = safeDraw(rand(s));
      safe[i] = k;
      notes.push({ k: 'safe', out: k, value: SAFE_CONTENTS[k].value });
      return SAFE_CONTENTS[k].value;
    }
    if (it.kind === 'misterio') {
      let x = rand(s);
      for (const [p, v] of it.odds) {
        if ((x -= p) <= 0) return v;
      }
      return it.odds[it.odds.length - 1][1];
    }
    return it.value;
  });
  ids.forEach((id, i) => {
    if (ITEM[id].effect === 'halveBest') {
      let best = -1;
      values.forEach((v, j) => {
        if (j !== i && v > 0 && safe[j] !== -1 && (best < 0 || v > values[best])) best = j;
      });
      if (best >= 0) {
        const lost = values[best] - r10(values[best] / 2);
        values[best] -= lost;
        notes.push({ k: 'carcoma', item: ids[best], lost }); // el texto lo pone cada móvil en su idioma
      }
    }
  });
  return { values, notes, safe };
}

// El que se lo lleva se queda con lo que vale algo y paga las trampas. Si con esto junta una colección
// (3 piezas) cobra el premio al momento, y cada pieza más de esa colección, un poco más.
// Nadie se queda con dinero negativo: las trampas se pagan con lo que quede y el resto se perdona
// (owed: lo que costaban; paid: lo que se ha podido pagar).
function giveUnit(owner, ids, values, noSets = false) {
  const before = setCounts(owner.items);
  let owed = 0;
  let paid = 0;
  ids.forEach((id, i) => {
    const v = values[i];
    if (v > 0) owner.items.push({ id, v });
    else if (v < 0) {
      const pay = Math.min(-v, Math.max(0, owner.money));
      owner.money -= pay;
      owed += -v;
      paid += pay;
    }
  });
  if (noSets) return { sets: [], bonus: 0, owed, paid }; // carrera: las colecciones se cobran en el almacén
  const after = setCounts(owner.items);
  const sets = [];
  for (const c in after) {
    const a = before[c] || 0;
    const b = after[c];
    if (b < SET_NEED || b === a) continue;
    const bonus = (a < SET_NEED ? SET_BONUS : 0) + SET_EXTRA * (b - Math.max(a, SET_NEED));
    if (bonus > 0) sets.push({ set: c, n: b, bonus });
  }
  const bonus = sets.reduce((t, x) => t + x.bonus, 0);
  owner.money += bonus;
  return { sets, bonus, owed, paid };
}

// Caras automáticas al abrir el trastero
function react(s, res) {
  const bidders = new Set(s.auction.history.map((h) => h.key));
  const good = (p) => (p >= 200 ? 'codicia' : p > 0 ? 'feliz' : p <= -100 ? 'enfado' : 'triste');
  if (s.mode === 'versus') {
    for (const p of s.players) {
      let f = 'poker';
      if (res.winner === p.id) f = good(res.profit);
      else if (p.id === s.auctioneerId) f = res.commission >= 100 ? 'codicia' : res.commission > 0 ? 'feliz' : 'poker';
      else if (bidders.has(p.id)) f = res.profit >= 200 ? 'enfado' : res.profit < 0 ? 'picaro' : 'poker';
      else if (res.profit >= 300) f = 'sorpresa';
      s.faces[p.id] = f;
    }
  } else {
    let teamF = 'poker';
    if (res.winner === 'team') teamF = good(res.profit);
    else if (res.winner && res.profit >= 200) teamF = bidders.has('team') ? 'enfado' : 'sorpresa';
    else if (res.winner && res.profit < 0) teamF = 'picaro';
    for (const p of humans(s)) s.faces[p.id] = teamF;
    for (const r of s.rivals) s.faces[r.id] = res.winner === r.id ? good(res.profit) : bidders.has(r.id) && res.profit >= 200 ? 'enfado' : 'poker';
    s.faces[HOUSE.id] = res.winner ? (res.price >= 300 ? 'codicia' : 'feliz') : 'triste';
  }
}

function closeAuction(s, now) {
  const a = s.auction;
  const { values, notes, safe } = resolveValues(s);
  s.unit.values = values;
  s.unit.safe = safe;
  const total = values.reduce((t, v) => t + v, 0);
  const res = { winner: null, winnerName: null, price: 0, total, profit: 0, notes, commission: 0, free: false, bonus: 0 };
  if (s.mode === 'versus') {
    const auct = s.players.find((p) => p.id === s.auctioneerId);
    if (a.leader) {
      const w = s.players.find((p) => p.id === a.leader);
      w.money -= a.amount;
      const com = r10(a.amount * COMMISSION);
      if (auct) auct.money += com;
      const g = giveUnit(w, s.unit.ids, values);
      Object.assign(res, { winner: w.id, winnerName: w.name, price: a.amount, profit: total - a.amount + (g.owed - g.paid), commission: com, bonus: g.bonus });
      if (g.owed > g.paid) notes.push({ k: 'sinDinero', owed: g.owed, paid: g.paid, who: w.id });
      g.sets.forEach((x) => notes.push({ k: 'coleccion', ...x, who: w.id }));
    } else if (auct) {
      const g = giveUnit(auct, s.unit.ids, values);
      Object.assign(res, { winner: auct.id, winnerName: auct.name, price: 0, profit: total + (g.owed - g.paid), free: true, bonus: g.bonus });
      if (g.owed > g.paid) notes.push({ k: 'sinDinero', owed: g.owed, paid: g.paid, who: auct.id });
      g.sets.forEach((x) => notes.push({ k: 'coleccion', ...x, who: auct.id }));
    }
  } else if (a.leader) {
    const owner = a.leader === 'team' ? s.team : s.rivals.find((r) => r.id === a.leader);
    owner.money -= a.amount;
    const g = giveUnit(owner, s.unit.ids, values, !!s.career);
    Object.assign(res, { winner: a.leader, winnerName: a.leaderName, price: a.amount, profit: total - a.amount + (g.owed - g.paid), bonus: g.bonus });
    if (g.owed > g.paid) notes.push({ k: 'sinDinero', owed: g.owed, paid: g.paid, who: a.leader });
    g.sets.forEach((x) => notes.push({ k: 'coleccion', ...x, who: a.leader }));
  }
  s.results = res;
  react(s, res);
  s.log.push({ round: s.round, winner: res.winnerName, price: res.price, total, byTeam: res.winner === 'team' });
  if (s.log.length > 20) s.log.shift();
  setPhase(s, 'reveal', now, dur(s, 'revealPerItem') * s.unit.count + dur(s, 'revealTail'));
}

// Lo que vuelve a la carrera de un día (al acabar o si lo dejas a medias): el dinero y lo que va al almacén
export function careerFinal(s) {
  const items = s.team.items.map((it) => (ITEM[it.id].safe ? { id: it.id, v: it.v, closed: true } : { id: it.id, v: it.v }));
  return {
    career: true,
    zone: s.career.zone,
    startMoney: s.career.money,
    money: s.team.money,
    items,
    won: s.log.filter((l) => l.winner && l.byTeam).length,
    profit: s.team.money + items.reduce((t, it) => t + it.v, 0) - s.career.money,
    rivals: s.rivals.map((r) => ({ id: r.id, name: r.name, look: r.look, worth: worthOf(r) })),
    rounds: s.totalRounds,
    played: s.log.length,
  };
}

function endGame(s, now) {
  if (s.mode === 'versus') {
    const ranking = s.players
      .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, look: p.look, bot: p.bot, money: p.money, worth: worthOf(p), items: p.items.length }))
      .sort((x, y) => y.worth - x.worth || y.money - x.money);
    s.final = { ranking };
  } else if (s.career) {
    s.final = careerFinal(s);
  } else {
    const team = worthOf(s.team);
    const rivals = s.rivals.map((r) => ({ id: r.id, name: r.name, look: r.look, emoji: r.emoji, money: r.money, items: r.items.length, worth: worthOf(r) })).sort((x, y) => y.worth - x.worth);
    const win = rivals.every((r) => team > r.worth);
    const th = (DIFFICULTIES[s.settings.difficulty] || DIFFICULTIES.normal).stars;
    const stars = win ? 1 + (team >= th[0] ? 1 : 0) + (team >= th[1] ? 1 : 0) : 0;
    s.final = { team, teamMoney: s.team.money, teamItems: s.team.items.length, rivals, win, stars, thresholds: th };
  }
  setPhase(s, 'end', now, null);
}

// ---------- pausa ----------
// Mientras el anfitrión está fuera de la app el reloj se para (nadie puja, los bots esperan) y al volver
// se corre todo lo que depende de la hora lo que haya durado la ausencia: la partida sigue donde estaba.
const TIMED = ['intro', 'pitch', 'peek', 'auction', 'reveal'];
export function pause(s, now) {
  if (s.pausedAt != null || !TIMED.includes(s.phase)) return false;
  s.pausedAt = now;
  bump(s);
  return true;
}
export function resume(s, now) {
  if (s.pausedAt == null) return false;
  const d = Math.max(0, now - s.pausedAt);
  s.pausedAt = null;
  if (s.endsAt != null) s.endsAt += d;
  const a = s.auction;
  if (a) {
    if (a.startedAt) a.startedAt += d;
    for (const k in a.plans) if (a.plans[k].nextAt != null) a.plans[k].nextAt += d;
    if (a.lastAt != null) a.lastAt += d;
    for (const k in a.blocked || {}) a.blocked[k] += d;
    if (a.trick) a.trick.until += d;
  }
  if (s.unit && s.unit.botPitchAt != null) s.unit.botPitchAt += d;
  for (const p of s.players) if (p.lastSeen) p.lastSeen += d; // nadie se marca desconectado por la pausa
  bump(s);
  return true;
}

// ---------- reloj ----------
// Avanza el juego. Devuelve true si el estado cambió.
export function tick(s, now) {
  const v0 = s.v;
  if (s.pausedAt != null) return false;
  // conexión de jugadores (el anfitrión nunca se marca desconectado)
  for (const p of s.players) {
    if (!p.bot && p.id !== s.hostId && p.online && now - p.lastSeen > 12000) {
      p.online = false;
      bump(s);
    }
  }
  switch (s.phase) {
    case 'intro':
      if (now >= s.endsAt) {
        if (s.mode === 'versus') setPhase(s, 'pitch', now, dur(s, 'pitch'));
        else if (s.unit.special === 'misterio' || s.career) openAuction(s, now); // en la carrera no hay señales que mandar
        else setPhase(s, 'peek', now, dur(s, 'peek'));
      }
      break;
    case 'pitch': {
      const auct = s.players.find((p) => p.id === s.auctioneerId);
      if (auct && auct.bot) botPitch(s, now);
      else if (now >= s.endsAt) openAuction(s, now);
      break;
    }
    case 'peek':
      if (now >= s.endsAt) openAuction(s, now);
      break;
    case 'auction':
      if (now >= s.endsAt) closeAuction(s, now);
      else runBots(s, now);
      break;
    case 'reveal':
      if (now >= s.endsAt) {
        if (s.round >= s.totalRounds) endGame(s, now);
        else startRound(s, now);
      }
      break;
    default:
      break;
  }
  return s.v !== v0;
}

// ---------- vistas ----------
// Lo que ve todo el mundo (sin información secreta)
export function publicView(s, now) {
  const u = s.unit;
  const vnow = s.pausedAt != null ? s.pausedAt : now;
  const open = s.phase === 'reveal' || s.phase === 'end';
  return {
    v: s.v,
    code: s.code,
    game: s.game || 0,
    career: s.career ? { zone: s.career.zone, lupa: s.career.lupa } : null,
    hostId: s.hostId,
    phase: s.phase,
    mode: s.mode,
    settings: { laps: s.settings.laps, difficulty: s.settings.difficulty },
    round: s.round,
    totalRounds: s.totalRounds,
    rem: s.endsAt ? Math.max(0, s.endsAt - (s.pausedAt != null ? s.pausedAt : now)) : null,
    paused: s.pausedAt != null,
    dur: s.phaseDur,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      bot: p.bot,
      avatar: p.avatar,
      look: p.look,
      color: p.color,
      online: p.online,
      money: p.money,
      worth: worthOf(p),
      items: p.items.slice(-12),
      count: p.items.length,
      sets: setCounts(p.items),
    })),
    team: s.team && { money: s.team.money, worth: worthOf(s.team), items: s.team.items.slice(-12), count: s.team.items.length, sets: setCounts(s.team.items) },
    rivals: s.rivals && s.rivals.map((r) => ({ id: r.id, name: r.name, look: r.look, emoji: r.emoji, style: r.style, money: r.money, worth: worthOf(r), count: r.items.length, sets: setCounts(r.items) })),
    house: s.mode === 'coop' ? HOUSE : null,
    faces: s.faces || {},
    auctioneerId: s.auctioneerId,
    unit: u && {
      size: u.size,
      count: u.count,
      door: u.door,
      doorId: u.door == null ? null : u.ids[u.door],
      tarp: u.tarp,
      special: u.special || null,
      ids: open ? u.ids : null,
      values: open ? u.values : null,
      safe: open ? u.safe || {} : null,
    },
    pitch: s.phase === 'pitch' ? null : s.pitch,
    auction: s.auction && {
      amount: s.auction.amount,
      opening: s.auction.opening,
      leader: s.auction.leader,
      leaderName: s.auction.leaderName,
      byPlayer: s.auction.byPlayer,
      history: s.auction.history.slice(),
      nextMin: nextMin(s),
      // truco en marcha y quién está distraído (con lo que le queda, en ms)
      trick: s.auction.trick ? { id: s.auction.trick.id, by: s.auction.trick.by, byName: s.auction.trick.byName, byPlayer: s.auction.trick.byPlayer, targets: s.auction.trick.targets, n: s.auction.trick.n, rem: Math.max(0, s.auction.trick.until - vnow) } : null,
      blocked: Object.fromEntries(Object.entries(s.auction.blocked || {}).filter(([, u]) => u > vnow).map(([k, u]) => [k, u - vnow])),
      blockedBy: s.auction.blockedBy || {},
    },
    // trucos: lo que cuesta cada uno y cuáles ha gastado ya cada jugador (o el equipo)
    tricks: { cost: Object.fromEntries(TRICK_ORDER.map((id) => [id, trickCost(s, id)])), used: s.tricks || {} },
    signals: s.mode === 'coop' ? s.signals : null,
    results: s.results,
    final: s.final,
  };
}

// Lo que solo ve cada jugador: los objetos que ha mirado
export function privateViews(s) {
  const out = {};
  const u = s.unit;
  if (!u || !['pitch', 'peek', 'auction'].includes(s.phase)) return out;
  const people = new Set(s.players.filter((p) => !p.bot).map((p) => p.id));
  for (const pid in u.seen) {
    if (!people.has(pid)) continue;
    out[pid] = { seen: u.seen[pid].map((i) => ({ i, id: u.ids[i] })), appraised: !!(u.appraised && u.appraised[pid]) };
  }
  return out;
}

// Estado completo para una persona (lo que usa la interfaz)
export function viewFor(s, pid, now) {
  return { ...publicView(s, now), me: pid, priv: privateViews(s)[pid] || null };
}
