// Récords y logros de este móvil (sin cuentas: se guardan en el propio navegador).
// Cada móvil apunta lo suyo al abrir cada trastero y al acabar cada partida; una clave por ronda y por partida
// evita contar dos veces si se recarga la página.
const KEY = 'tr-stats';

// Logros: icono, nombre y cómo se consigue (los textos se traducen en la interfaz)
export const ACHIEVEMENTS = [
  { id: 'win1', icon: '🏆', name: 'Primera victoria', desc: 'Gana una partida.' },
  { id: 'games10', icon: '🧾', name: 'Veterano', desc: 'Juega 10 partidas.' },
  { id: 'streak3', icon: '🔥', name: 'Racha', desc: 'Gana 3 partidas seguidas.' },
  { id: 'jackpot', icon: '💰', name: '¡Premio gordo!', desc: 'Gana 500 € o más con un solo trastero.' },
  { id: 'flop', icon: '🐀', name: 'Menudo chasco', desc: 'Pierde 200 € o más con un trastero.' },
  { id: 'free', icon: '🎁', name: 'Gratis total', desc: 'Quédate un trastero gratis porque nadie puja.' },
  { id: 'bluff', icon: '🎩', name: 'Rey del farol', desc: 'Como subastador, cobra 200 € o más de comisión.' },
  { id: 'set1', icon: '💎', name: 'Coleccionista', desc: 'Junta una colección.' },
  { id: 'set2', icon: '🗃️', name: 'Gran coleccionista', desc: 'Junta dos colecciones en la misma partida.' },
  { id: 'blind', icon: '🎲', name: 'A ciegas', desc: 'Gana dinero con un trastero misterioso.' },
  { id: 'flash', icon: '⚡', name: 'Rayo', desc: 'Llévate una subasta relámpago.' },
  { id: 'eye', icon: '🔎', name: 'Buen ojo', desc: 'Usa la pista extra y gana dinero con ese trastero.' },
  { id: 'gold', icon: '🤝', name: 'Equipo de oro', desc: 'Gana en cooperativo con 3 estrellas.' },
];

const empty = () => ({
  v: 1,
  games: 0,
  wins: 0,
  streak: 0,
  bestStreak: 0,
  units: 0,
  best: null, // { profit, item }
  worst: null, // { profit }
  maxPaid: 0,
  sets: 0,
  got: {}, // logro -> fecha
  done: [], // claves de rondas y partidas ya contadas
  gameSets: {}, // colecciones juntadas en la partida en curso
});

export function loadStats() {
  try {
    const st = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (st && st.v === 1) return { ...empty(), ...st };
  } catch (e) {
    /* nada */
  }
  return empty();
}
function save(st) {
  try {
    localStorage.setItem(KEY, JSON.stringify(st));
  } catch (e) {
    /* nada */
  }
}
function once(st, key) {
  if (st.done.includes(key)) return false;
  st.done.push(key);
  if (st.done.length > 60) st.done.splice(0, st.done.length - 60);
  return true;
}
function unlock(st, id, out) {
  if (st.got[id]) return;
  st.got[id] = Date.now();
  out.push(ACHIEVEMENTS.find((a) => a.id === id));
}

// Al abrir un trastero. mine: lo que me toca a mí (yo o mi equipo). Devuelve los logros nuevos.
export function recordRound(v, myId, extra = {}) {
  const r = v.results;
  if (!r || !v.code) return [];
  const st = loadStats();
  if (!once(st, `r:${v.code}:${v.game}:${v.round}`)) return [];
  const out = [];
  const me = v.mode === 'coop' ? 'team' : myId;
  if (r.winner === me) {
    st.units++;
    if (!r.free) st.maxPaid = Math.max(st.maxPaid, r.price);
    if (!st.best || r.profit > st.best.profit) st.best = { profit: r.profit, at: Date.now() };
    if (!st.worst || r.profit < st.worst.profit) st.worst = { profit: r.profit, at: Date.now() };
    if (r.profit >= 500) unlock(st, 'jackpot', out);
    if (r.profit <= -200) unlock(st, 'flop', out);
    if (r.free && v.mode === 'versus') unlock(st, 'free', out);
    const sp = v.unit && v.unit.special;
    if (sp === 'misterio' && r.profit > 0) unlock(st, 'blind', out);
    if (sp === 'relampago') unlock(st, 'flash', out);
    if (sp === 'tasador' && extra.appraised && r.profit > 0) unlock(st, 'eye', out);
  }
  if (v.mode === 'versus' && v.auctioneerId === myId && r.commission >= 200) unlock(st, 'bluff', out);
  const sets = (r.notes || []).filter((n) => n.k === 'coleccion' && n.who === me && n.n === 3).length;
  if (sets) {
    st.sets += sets;
    const g = `${v.code}:${v.game}`;
    st.gameSets = { [g]: ((st.gameSets || {})[g] || 0) + sets };
    unlock(st, 'set1', out);
    if (st.gameSets[g] >= 2) unlock(st, 'set2', out);
  }
  save(st);
  return out;
}

// Al acabar la partida. Devuelve los logros nuevos.
export function recordEnd(v, myId) {
  const f = v.final;
  if (!f || !v.code) return [];
  const st = loadStats();
  if (!once(st, `e:${v.code}:${v.game}`)) return [];
  const out = [];
  st.games++;
  const won = v.mode === 'coop' ? !!f.win : !!(f.ranking && f.ranking[0] && f.ranking[0].id === myId);
  if (won) {
    st.wins++;
    st.streak++;
    st.bestStreak = Math.max(st.bestStreak, st.streak);
    unlock(st, 'win1', out);
    if (st.streak >= 3) unlock(st, 'streak3', out);
    if (v.mode === 'coop' && f.stars >= 3) unlock(st, 'gold', out);
  } else st.streak = 0;
  if (st.games >= 10) unlock(st, 'games10', out);
  save(st);
  return out;
}
