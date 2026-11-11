// Efectos de sonido sintetizados (sin archivos de audio).
let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem('tr-muted') === '1';
} catch (e) {
  /* nada */
}

// lo que tiene que enterarse cuando el audio se desbloquea o se vuelve a bloquear (la música, el aviso)
const stateFns = [];
export const onAudioState = (fn) => stateFns.push(fn);
const changed = () => stateFns.forEach((fn) => fn());
export const audioRunning = () => !!ctx && ctx.state === 'running';

// iPhone: con el interruptor de silencio puesto, Safari calla el audio de las webs como este (música y voces).
// En «playback» suena como un vídeo; el botón 🔊 del juego sigue callándolo todo. Silenciado, vuelve a «ambient»
// (no corta la música de otras apps).
function audioSession() {
  try {
    const s = navigator.audioSession;
    const want = muted ? 'ambient' : 'playback';
    if (s && s.type !== want) s.type = want;
  } catch (e) {
    /* este navegador no tiene la opción */
  }
}

export function unlockAudio() {
  try {
    audioSession();
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.onstatechange = changed;
    }
    if (ctx.state !== 'running') {
      const p = ctx.resume();
      if (p && p.then) p.then(changed, () => {});
    } else changed();
  } catch (e) {
    ctx = null;
  }
}

export const isMuted = () => muted;
export const audioCtx = () => ctx;
export function setMuted(v) {
  muted = v;
  audioSession();
  try {
    localStorage.setItem('tr-muted', v ? '1' : '0');
  } catch (e) {
    /* nada */
  }
}

function tone(freq, dur, { type = 'square', vol = 0.06, when = 0, to = null } = {}) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function rumble(dur, when = 0) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + when;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / 90));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(400, t0);
  f.frequency.linearRampToValueAtTime(1600, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0);
}

export const sfx = {
  bid: () => tone(700, 0.07, { vol: 0.05 }),
  cash: () => {
    tone(1568, 0.05, { type: 'sine', vol: 0.04 });
    tone(2093, 0.09, { type: 'sine', vol: 0.04, when: 0.05 });
  },
  face: () => tone(880, 0.04, { type: 'sine', vol: 0.03 }),
  myBid: () => {
    tone(660, 0.06, { vol: 0.05 });
    tone(990, 0.08, { vol: 0.05, when: 0.06 });
  },
  outbid: () => {
    tone(520, 0.09, { vol: 0.06 });
    tone(360, 0.16, { vol: 0.06, when: 0.09 });
  },
  tick: () => tone(1300, 0.03, { type: 'sine', vol: 0.05 }),
  // trucos
  // llamada: timbre de teléfono de los de toda la vida, «ring-ring… ring-ring»
  phone: () => {
    const ring = (at) => {
      for (let i = 0; i < 10; i++) {
        tone(i % 2 ? 1568 : 1319, 0.045, { type: 'square', vol: 0.05, when: at + i * 0.04 });
        tone(i % 2 ? 784 : 659, 0.045, { type: 'sine', vol: 0.09, when: at + i * 0.04 });
      }
    };
    [0, 0.5, 1.35, 1.85].forEach(ring);
  },
  // famoso: un «¡oooh!» y los clics de las cámaras, uno por flash
  famous: () => {
    tone(392, 0.5, { type: 'sine', vol: 0.05, to: 784 });
    tone(494, 0.5, { type: 'sine', vol: 0.04, to: 988, when: 0.03 });
    [0, 0.22, 0.4, 0.62, 0.85, 1.05, 1.3, 1.5, 1.75, 2.0, 2.25, 2.5].forEach((w) => {
      tone(2600, 0.025, { type: 'square', vol: 0.028, when: w + 0.06 });
      tone(1900, 0.03, { type: 'square', vol: 0.02, when: w + 0.1 });
    });
  },
  // prisa: un tic-tac que se acelera y una alarma corta
  hurry: () => {
    [0, 0.17, 0.31, 0.43, 0.53, 0.61, 0.68, 0.74].forEach((w, i) => tone(i % 2 ? 1750 : 1150, 0.045, { type: 'triangle', vol: 0.11, when: w }));
    [0.84, 0.98, 1.12].forEach((w) => {
      tone(1319, 0.06, { type: 'square', vol: 0.06, when: w });
      tone(988, 0.06, { type: 'square', vol: 0.06, when: w + 0.065 });
    });
  },
  // trastero especial: un toque de aviso
  special: () => [784, 988, 1319, 1568].forEach((f, i) => tone(f, 0.09, { type: 'sine', vol: 0.06, when: i * 0.06 })),
    // reloj de los últimos segundos de la subasta: tic (agudo) y tac (grave), como de madera
  clock: (n) => {
    const f = n % 2 ? 1750 : 1150;
    tone(f, 0.035, { type: 'triangle', vol: 0.09 });
    tone(f * 2.01, 0.02, { type: 'sine', vol: 0.025 });
  },
  sold: () => {
    tone(220, 0.08, { type: 'triangle', vol: 0.1 });
    tone(180, 0.18, { type: 'triangle', vol: 0.1, when: 0.08 });
  },
  door: () => rumble(0.9),
  item: (v) => {
    if (v >= 300) {
      tone(880, 0.08, { type: 'triangle', vol: 0.07 });
      tone(1320, 0.14, { type: 'triangle', vol: 0.07, when: 0.08 });
    } else if (v > 0) tone(660, 0.08, { type: 'triangle', vol: 0.06 });
    else if (v < 0) tone(150, 0.25, { type: 'sawtooth', vol: 0.05, to: 90 });
    else tone(300, 0.08, { type: 'sine', vol: 0.05 });
  },
  // la cuenta del trastero: ha salido ganando o perdiendo dinero
  gain: () => [1047, 1319, 1568].forEach((f, i) => tone(f, 0.1, { type: 'triangle', vol: 0.06, when: i * 0.07 })),
  loss: () => {
    tone(330, 0.14, { type: 'triangle', vol: 0.06 });
    tone(247, 0.26, { type: 'triangle', vol: 0.06, when: 0.14 });
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.07, when: i * 0.12 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.06, when: i * 0.16 })),
  join: () => tone(880, 0.06, { type: 'sine', vol: 0.05 }),
};
