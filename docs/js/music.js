// Música de fondo: un tema para el menú (inicio, sala de espera y final) y otro más suave para la partida.
// Cada archivo trae un bucle de compases enteros sin salto (tools/music/loop.py). Al cambiar de pista hay
// un fundido, y la música baja sola mientras habla un personaje. Se puede quitar desde el menú «⋯»;
// el botón del altavoz lo silencia todo.
import { audioCtx, isMuted, onAudioState } from './sound.js';
import { LOOPS } from './music-loops.js';

const TRACKS = {
  menu: { url: 'assets/music/menu.mp3', vol: 1 },
  game: { url: 'assets/music/game.mp3', vol: 0.36 }, // ~9 dB por debajo: va debajo de las voces
};
const FADE = 1.2; // s del fundido al cambiar de pista
const DUCK = 0.45; // cuánto baja mientras habla alguien (~7 dB)

let on = true;
try {
  on = localStorage.getItem('tr-music') !== '0';
} catch (e) {
  /* nada */
}
let want = null; // pista que toca ahora según la pantalla
let cur = null; // { name, src, gain } la que está sonando
let bus = null; // ganancia común: aquí se aparta la música cuando hablan
let ducked = 0;
const buffers = new Map(); // nombre -> Promise<AudioBuffer|null>

export const musicOn = () => on;
export function setMusicOn(v) {
  on = !!v;
  try {
    localStorage.setItem('tr-music', on ? '1' : '0');
  } catch (e) {
    /* nada */
  }
  sync();
}
// la pantalla dice qué pista toca: 'menu', 'game' o null
export function setMusic(name) {
  want = TRACKS[name] ? name : null;
  sync();
}
// descarga la pista con antelación (sin decodificarla hasta que haga falta)
const raw = new Map();
function fetchRaw(name) {
  if (!raw.has(name)) {
    const p = fetch(TRACKS[name].url)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    raw.set(name, p);
    p.then((b) => b || raw.delete(name));
  }
  return raw.get(name);
}
export function preloadMusic(name) {
  if (on && TRACKS[name]) fetchRaw(name);
}
// mientras habla un personaje
export function duckMusic(v) {
  ducked = Math.max(0, ducked + (v ? 1 : -1));
  const ctx = audioCtx();
  if (!bus || !ctx) return;
  const t = ctx.currentTime;
  bus.gain.cancelScheduledValues(t);
  bus.gain.setValueAtTime(bus.gain.value, t);
  if (ducked) bus.gain.setTargetAtTime(DUCK, t, 0.06);
  else bus.gain.setTargetAtTime(1, t + 0.2, 0.25);
}
// Tensión de los últimos segundos de la subasta (0 = normal, 1 = a tope): la música de partida
// se acelera un poco y sube; cuando alguien puja y el reloj vuelve a 6 s, se relaja sola.
let tension = 0;
export function setTension(x) {
  tension = Math.max(0, Math.min(1, x || 0));
  applyTension();
}
function applyTension() {
  if (!cur || cur.name !== 'game') return;
  const was = cur.tension || 0;
  if (Math.abs(was - tension) < 0.03 && !(tension === 0 && was > 0)) return;
  cur.tension = tension;
  const ctx = audioCtx();
  const t = ctx.currentTime;
  cur.src.playbackRate.setTargetAtTime(1 + 0.1 * tension, t, 0.12);
  cur.gain.gain.cancelScheduledValues(t);
  cur.gain.gain.setTargetAtTime(TRACKS.game.vol * (1 + 0.6 * tension), t, 0.12);
}

// para las pruebas
export const musicState = () => ({ on, want, playing: cur ? cur.name : null, ducked: ducked > 0, tension: cur && cur.tension ? +cur.tension.toFixed(2) : 0, rate: cur ? +cur.src.playbackRate.value.toFixed(3) : 1 });

function buffer(name) {
  const ctx = audioCtx();
  if (!ctx) return Promise.resolve(null);
  if (!buffers.has(name)) {
    const p = fetchRaw(name).then((ab) =>
      ab
        ? new Promise((res) => {
            try {
              ctx.decodeAudioData(ab.slice(0), res, () => res(null));
            } catch (e) {
              res(null);
            }
          })
        : null,
    );
    buffers.set(name, p);
    p.then((b) => b || buffers.delete(name));
  }
  return buffers.get(name);
}

function target() {
  return on && !isMuted() && !document.hidden ? want : null;
}

function fadeOut(c, secs) {
  const ctx = audioCtx();
  const t = ctx.currentTime;
  c.gain.gain.cancelScheduledValues(t);
  c.gain.gain.setValueAtTime(c.gain.gain.value, t);
  c.gain.gain.linearRampToValueAtTime(0.0001, t + secs);
  try {
    c.src.stop(t + secs + 0.05);
  } catch (e) {
    /* ya parada */
  }
}

let loading = null;
export function sync() {
  const ctx = audioCtx();
  if (!ctx || ctx.state !== 'running') return; // se vuelve a llamar al desbloquear el audio
  const name = target();
  if ((cur ? cur.name : null) === name) return;
  if (cur) {
    // al cambiar de pista, fundido; al silenciar o quitar la música, rápido
    fadeOut(cur, name ? FADE : 0.35);
    cur = null;
  }
  if (!name || loading === name) return;
  loading = name;
  buffer(name).then((buf) => {
    if (loading === name) loading = null;
    if (!buf) return; // sin red: se reintenta en la siguiente pantalla
    if (target() !== name || cur) return sync();
    if (!bus) {
      bus = ctx.createGain();
      bus.gain.value = ducked ? DUCK : 1;
      bus.connect(ctx.destination);
    }
    const loop = LOOPS[name];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = loop.start;
    src.loopEnd = Math.min(loop.end, buf.duration);
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(TRACKS[name].vol, t + FADE);
    src.connect(gain).connect(bus);
    src.start(t, loop.start);
    cur = { name, src, gain };
    if (name === 'game' && tension) setTimeout(applyTension, FADE * 1000);
  });
}

onAudioState(sync);
document.addEventListener('visibilitychange', sync);
