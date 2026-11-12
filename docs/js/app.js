// Interfaz y coordinación de red.
// Un móvil crea la sala y hace de anfitrión: ejecuta el motor y difunde el estado.
// Los demás se unen con el código y mandan sus acciones al anfitrión.
import * as E from './engine.js';
import { ITEM, SAFE_CONTENTS, SAFE_CLOSED, LOCKSMITH, itemEV, COLLECTIONS, COLLECTION, SET_OF, SET_NEED, SET_BONUS, SET_EXTRA } from './items.js';
import { FACES, FACE_LABEL, PLAYER_LOOKS, LOOK_LABEL, iconUrl, faceUrl, animUrl, winnerUrl, loserUrl, auctUrl, lineupUrl, winLine, winLineIdx, SALES_LINES, PUSH_LINES, salesIdx, pushIdx, salesLine, pushLine, starLine } from './art.js';
import { say, stopVoice, preloadVoices, voiceLog } from './voice.js';
import { canSeal, myKeys, sharedKey, seal, unseal } from './seal.js';
import { connect } from './net.js';
import { sfx, unlockAudio, isMuted, setMuted, onAudioState, audioRunning } from './sound.js';
import { setMusic, preloadMusic, musicOn, setMusicOn, sync as syncMusic, musicState, setTension } from './music.js';
import { ACHIEVEMENTS, loadStats, recordRound, recordEnd } from './stats.js';
import * as C from './career.js';
import * as A from './album.js';
import * as K from './coupons.js';
import { t, tn, tname, money, num, getLang, setLang } from './i18n.js';
import qrcode from '../vendor/qrcode.mjs';

// ---------- arranque y almacenamiento ----------
const params = new URLSearchParams(location.search);
const NET = params.get('net') === 'local' ? 'local' : 'supabase';
const SPEED = Math.max(1, Math.min(20, Number(params.get('speed')) || 1));
const TAB_IDS = params.get('ids') === 'tab'; // pruebas: una identidad por pestaña
const store = NET === 'local' || TAB_IDS ? sessionStorage : localStorage;
const sget = (k, d = null) => {
  try {
    const v = store.getItem(k);
    return v == null ? d : JSON.parse(v);
  } catch (e) {
    return d;
  }
};
const sset = (k, v) => {
  try {
    store.setItem(k, JSON.stringify(v));
  } catch (e) {
    /* almacenamiento lleno o bloqueado */
  }
};
const sdel = (k) => {
  try {
    store.removeItem(k);
  } catch (e) {
    /* nada */
  }
};
function rid(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join('');
}
const myId =
  sget('tr-id') ||
  (() => {
    const id = 'p-' + rid(12);
    sset('tr-id', id);
    return id;
  })();

const TAB = (() => {
  try {
    let t = sessionStorage.getItem('tr-tab');
    if (!t) {
      t = rid(8);
      sessionStorage.setItem('tr-tab', t);
    }
    return t;
  } catch (e) {
    return rid(8);
  }
})();
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ';
function genCode() {
  const a = new Uint8Array(4);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => CODE_ABC[x % CODE_ABC.length]).join('');
}
const cleanCode = (c) =>
  String(c || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);

const RESUME_MS = 3 * 60 * 60 * 1000;
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const buzz = (pattern) => {
  try {
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(pattern);
  } catch (e) {
    /* nada */
  }
};
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
ESC[String.fromCharCode(34)] = '&quot;';
ESC[String.fromCharCode(39)] = '&#39;';
const ESC_RE = new RegExp('[&<>' + String.fromCharCode(34, 39) + ']', 'g');
const esc = (s) => String(s ?? '').replace(ESC_RE, (c) => ESC[c]);

const app = {
  screen: 'home',
  role: null,
  code: null,
  net: null,
  netStatus: null,
  netSince: 0,
  state: null,
  view: null,
  deadline: 0,
  lastStateAt: 0,
  joinedOnce: false,
  homeMsg: null,
  invite: null,
  pitchSel: null,
  guestKeys: {},
  guestPlain: {},
  auctSmall: sget('tr-auct-small2', false) === true,
  bidLockUntil: 0,
  timers: [],
  lastTickSec: null,
};

const root = document.getElementById('app');
const toastEl = document.getElementById('toast');
const modalEl = document.getElementById('modal');

// ---------- utilidades de interfaz ----------
let toastTimer = null;
function toast(text, ms = 2200) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// «¡Logro desbloqueado!» arriba unos segundos
function showAch(a) {
  if (!a) return;
  const el = document.createElement('div');
  el.className = 'achpop';
  el.setAttribute('role', 'status');
  el.innerHTML = `${ic(a.icon, 'ic ach-ic')}<div><small>${t('¡Logro desbloqueado!')}</small><b>${esc(t(a.name))}</b></div>`;
  document.body.appendChild(el);
  sfx.gain();
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3200);
}

// Récords y logros de este móvil
const statsSheet = () => {
  const st = loadStats();
  const got = ACHIEVEMENTS.filter((a) => st.got[a.id]).length;
  const cell = (label, val) => `<div class='stc'><b>${val}</b><span>${label}</span></div>`;
  const amount = (n) => (n == null ? '—' : n < 0 ? signed(n) : (n > 0 ? '+' : '') + money(n));
  return `<div class='rules stats'>
  <div class='row'><h2 class='grow'>${t('Tus récords')}</h2><button class='iconbtn' data-act='close' aria-label='${t('Cerrar')}'>✕</button></div>
  <div class='stgrid'>
    ${cell(t('Partidas'), st.games)}
    ${cell(t('Ganadas'), st.wins)}
    ${cell(t('Mejor racha'), st.bestStreak)}
    ${cell(t('Trasteros comprados'), st.units)}
    ${cell(t('Tu mejor trastero'), amount(st.best && st.best.profit))}
    ${cell(t('Tu peor compra'), amount(st.worst && st.worst.profit < 0 ? st.worst.profit : null))}
    ${cell(t('Lo más caro que has pagado'), st.maxPaid ? money(st.maxPaid) : '—')}
    ${cell(t('Colecciones'), st.sets)}
  </div>
  <h3>${t('Logros')} <small class='muted'>${got}/${ACHIEVEMENTS.length}</small></h3>
  <div class='achs'>${ACHIEVEMENTS.map(
    (a) => `<div class='ach${st.got[a.id] ? ' got' : ''}'>${ic(a.icon, 'ic ach-ic')}<div><b>${esc(t(a.name))}</b><span>${esc(t(a.desc))}</span></div></div>`,
  ).join('')}</div>
  <p class='muted small' style='margin-top:10px'>${t('Se guardan en este móvil.')}</p>
  <button class='btn primary block' style='margin-top:12px' data-act='close'>${t('Entendido')}</button>
</div>`;
};

function sec(name) {
  let el = root.querySelector(`[data-sec='${name}']`);
  if (!el) {
    el = document.createElement('div');
    el.dataset.sec = name;
    root.appendChild(el);
  }
  return el;
}
// Pinta una sección cambiando solo lo que ha cambiado: los botones no se
// recrean mientras el dedo los pulsa y las imágenes no parpadean.
function setHTML(el, html) {
  if (el._html === html) return;
  el._html = html;
  if (!el.firstChild) {
    el.innerHTML = html;
    return;
  }
  const t = document.createElement('template');
  t.innerHTML = html;
  morphChildren(el, t.content);
}
function morphChildren(a, b) {
  const an = Array.from(a.childNodes);
  const bn = Array.from(b.childNodes);
  for (let i = 0; i < bn.length; i++) {
    const x = an[i];
    const y = bn[i];
    if (!x) {
      a.appendChild(y);
      continue;
    }
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) {
      a.replaceChild(y, x);
      continue;
    }
    if (x.nodeType !== 1) {
      if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue;
      continue;
    }
    syncAttrs(x, y);
    morphChildren(x, y);
  }
  for (let i = bn.length; i < an.length; i++) an[i].remove();
}
function syncAttrs(x, y) {
  for (const { name } of Array.from(x.attributes)) if (!y.hasAttribute(name)) x.removeAttribute(name);
  for (const { name, value } of Array.from(y.attributes)) if (x.getAttribute(name) !== value) x.setAttribute(name, value);
}
function layout(names) {
  const key = names.join(',');
  if (root.dataset.layout !== key) {
    root.innerHTML = names.map((n) => `<div data-sec='${n}'></div>`).join('');
    root.dataset.layout = key;
  }
}

function setUrl(code) {
  const q = new URLSearchParams();
  if (code) q.set('sala', code);
  if (NET === 'local') q.set('net', 'local');
  if (SPEED !== 1) q.set('speed', String(SPEED));
  if (TAB_IDS) q.set('ids', 'tab');
  if (params.get('3d') === '0') q.set('3d', '0');
  if (params.get('lang')) q.set('lang', params.get('lang'));
  const s = q.toString();
  history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
}
function shareUrl(code) {
  const q = new URLSearchParams({ sala: code });
  if (NET === 'local') q.set('net', 'local');
  if (SPEED !== 1) q.set('speed', String(SPEED));
  return `${location.origin}${location.pathname}?${q}`;
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) {
    wakeLock = null;
  }
}

function every(ms, fn) {
  const t = setInterval(fn, ms);
  app.timers.push(t);
  return t;
}
function clearTimers() {
  app.timers.forEach(clearInterval);
  app.timers = [];
}

// ---------- secretos ----------
// Lo que ve cada uno en secreto viaja cifrado: solo su móvil puede leerlo.
let mine = null;
const keysReady = canSeal
  ? myKeys(() => sget('tr-keys'), (k) => sset('tr-keys', k))
      .then((k) => (mine = k))
      .catch((e) => console.warn('sin cifrado:', e && e.message))
  : Promise.resolve(null);
const sealCache = new Map();
let sealChain = Promise.resolve();
const validJwk = (k) => k && typeof k === 'object' && typeof k.x === 'string' && typeof k.y === 'string' && k.x.length < 80 && k.y.length < 80;
function noteGuestKey(m) {
  if (validJwk(m.k)) {
    const old = app.guestKeys[m.id];
    if (!old || old.x !== m.k.x || old.y !== m.k.y) {
      app.guestKeys[m.id] = { kty: 'EC', crv: 'P-256', x: m.k.x, y: m.k.y };
      return true;
    }
  } else if (m.plain && !app.guestPlain[m.id]) {
    app.guestPlain[m.id] = true; // su navegador no sabe cifrar: le llega sin cifrar
    return true;
  }
  return false;
}

// ---------- anfitrión ----------
function startHosting(state, savedAt) {
  // al recuperar una partida guardada (recarga del anfitrión), el rato sin la página cuenta como pausa
  if (savedAt) {
    if (state.pausedAt == null) E.pause(state, savedAt);
    E.resume(state, Date.now());
  }
  app.lastTick = Date.now();
  const save = sget('tr-host');
  app.guestKeys = (save && save.code === state.code && save.keys) || {};
  app.guestPlain = (save && save.code === state.code && save.plain) || {};
  sealCache.clear();
  app.screen = 'room';
  app.role = 'host';
  app.code = state.code;
  app.state = state;
  app.view = null;
  app.netStatus = null;
  app.netSince = Date.now();
  app.net = connect(state.career ? 'local' : NET, state.code, onHostMessage, onNetStatus);
  setUrl(state.code);
  sset('tr-last', { code: state.code, role: 'host', at: Date.now() });
  every(200, hostTick);
  every(2500, () => hostBroadcast());
  const beat = () => app.role === 'host' && sset('tr-host-alive', { code: app.code, tab: TAB, at: Date.now() });
  beat();
  every(1000, beat);
  every(1000, watchdog);
  keepAwake(true);
  hostDirty();
}

function hostTick() {
  if (app.role !== 'host') return;
  const now = Date.now();
  // el móvil congeló la página sin avisar (pantalla bloqueada…): ese rato también cuenta como pausa
  if (app.lastTick && now - app.lastTick > 2500 && app.state.pausedAt == null && E.pause(app.state, app.lastTick)) {
    E.resume(app.state, now);
    hostDirty();
  }
  app.lastTick = now;
  if (E.tick(app.state, now)) hostDirty();
}

// El anfitrión sale de la app (otra app, pantalla bloqueada): la partida se pausa para todos y sigue al volver
function hostAway(away) {
  if (app.role !== 'host' || !app.state) return;
  const now = Date.now();
  const changed = away ? E.pause(app.state, now) : E.resume(app.state, now);
  if (!away) app.lastTick = now;
  if (changed) {
    hostDirty();
    hostBroadcast(); // ya: puede que el móvil congele la página enseguida
  }
}
document.addEventListener('visibilitychange', () => hostAway(document.hidden));
window.addEventListener('pagehide', () => hostAway(true));
window.addEventListener('pageshow', () => document.hidden || hostAway(false));

let bTimer = null;
let lastB = 0;
let saveTimer = null;
function hostDirty() {
  setView(E.viewFor(app.state, myId, Date.now()));
  if (!bTimer) {
    const wait = Math.max(0, 90 - (Date.now() - lastB));
    bTimer = setTimeout(() => {
      bTimer = null;
      hostBroadcast();
    }, wait);
  }
  if (!saveTimer) {
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (app.role === 'host') {
        sset('tr-host', { code: app.code, state: app.state, at: Date.now(), keys: app.guestKeys, plain: app.guestPlain });
        sset('tr-last', { code: app.code, role: 'host', at: Date.now() });
      }
    }, 800);
  }
}

function hostBroadcast() {
  if (app.role !== 'host' || !app.net) return;
  lastB = Date.now();
  const pub = E.publicView(app.state, lastB);
  const priv = E.privateViews(app.state);
  if (!mine) {
    // este navegador no puede cifrar: se envía como antes
    app.net.send({ t: 's', pub, priv });
    return;
  }
  pub.hk = mine.pub;
  sealChain = sealChain
    .then(async () => {
      const sec = {};
      const plain = {};
      for (const pid in priv) {
        if (pid === myId) continue;
        const gk = app.guestKeys[pid];
        if (!gk) {
          if (app.guestPlain[pid]) plain[pid] = priv[pid];
          continue;
        }
        const json = JSON.stringify(priv[pid]);
        const c = sealCache.get(pid);
        if (c && c.json === json && c.gk === gk) {
          sec[pid] = c.box;
          continue;
        }
        const box = await seal(await sharedKey(mine.priv, gk), priv[pid]);
        sealCache.set(pid, { json, gk, box });
        sec[pid] = box;
      }
      if (app.role === 'host' && app.net) app.net.send({ t: 's', pub, sec, priv: Object.keys(plain).length ? plain : undefined });
    })
    .catch((e) => console.warn('no se pudo cifrar:', e && e.message));
}

function onHostMessage(m) {
  if (!m || app.role !== 'host' || typeof m.id !== 'string') return;
  const now = Date.now();
  const s = app.state;
  switch (m.t) {
    case 'hello': {
      const before = s.players.length;
      const r = E.join(s, m.id, m.name, now);
      if (r.ok && noteGuestKey(m)) hostDirty();
      if (!r.ok) app.net.send({ t: 'rej', to: m.id, reason: r.reason });
      else {
        if (s.players.length > before) sfx.join();
        hostDirty();
      }
      break;
    }
    case 'act': {
      const r = E.act(s, m.id, m.a || {}, now);
      if (r.ok) hostDirty();
      else app.net.send({ t: 'nack', to: m.id, reason: r.reason });
      break;
    }
    case 'ping': {
      const changed = E.ping(s, m.id, now);
      if (noteGuestKey(m) || changed) hostDirty();
      break;
    }
    case 'bye':
      E.leave(s, m.id);
      hostDirty();
      break;
    default:
      break;
  }
}

// ---------- invitado ----------
function joinRoom(code, name) {
  app.screen = 'room';
  app.role = 'guest';
  app.code = code;
  app.view = null;
  app.state = null;
  app.joinedOnce = false;
  app.lastStateAt = 0;
  app.netStatus = null;
  app.netSince = Date.now();
  app.joinStarted = Date.now();
  app.myName = name;
  app.net = connect(NET, code, onGuestMessage, onNetStatus);
  setUrl(code);
  sset('tr-last', { code, role: 'guest', at: Date.now() });
  const keyMsg = () => (mine ? { k: mine.pub } : { plain: !canSeal });
  const hello = () => app.net && app.net.send({ t: 'hello', id: myId, name: app.myName, ...keyMsg() });
  app.sendHello = hello;
  app.secBox = null;
  app.secPriv = null;
  keysReady.then(hello);
  every(1500, () => {
    if (!app.joinedOnce) hello();
  });
  every(4000, () => app.net && app.net.send({ t: 'ping', id: myId, ...keyMsg() }));
  every(1000, watchdog);
  keepAwake(true);
  render();
}

// lo privado llega cifrado solo para mí; se descifra y se pinta (el resto de la vista no espera)
function receivePriv(m, pub) {
  const box = m.sec && m.sec[myId];
  const plain = m.priv && m.priv[myId];
  if (plain || !box || !mine || !pub.hk) {
    setView({ ...pub, me: myId, priv: plain || null });
    return;
  }
  if (app.secBox && app.secBox.ct === box.ct) {
    setView({ ...pub, me: myId, priv: app.secPriv });
    return;
  }
  // mientras se descifra se mantiene lo de este mismo trastero, si ya lo tenía
  const keep = app.secPriv && app.secRound === pub.round ? app.secPriv : null;
  setView({ ...pub, me: myId, priv: keep });
  const seq = (app.secSeq = (app.secSeq || 0) + 1);
  sharedKey(mine.priv, pub.hk)
    .then((key) => unseal(key, box))
    .then((priv) => {
      if (seq !== app.secSeq || app.role !== 'guest') return;
      app.secBox = box;
      app.secPriv = priv;
      app.secRound = pub.round;
      if (app.view) setView({ ...app.view, priv });
    })
    .catch((e) => console.warn('no se pudo leer lo tuyo:', e && e.message));
}

function onGuestMessage(m) {
  if (!m || app.role !== 'guest') return;
  if (m.to && m.to !== myId) return;
  switch (m.t) {
    case 's': {
      const pub = m.pub;
      if (!pub || pub.code !== app.code) return;
      if (app.view && pub.v < app.view.v && Date.now() - app.lastStateAt < 5000) return;
      const me = pub.players.find((p) => p.id === myId);
      if (!me) {
        if (app.joinedOnce && pub.phase === 'lobby') leaveRoom(t('El dueño de la sala te ha sacado.'));
        return;
      }
      app.lastStateAt = Date.now();
      if (!app.joinedOnce) {
        app.joinedOnce = true;
        sset('tr-last', { code: app.code, role: 'guest', at: Date.now() });
      }
      receivePriv(m, pub);
      break;
    }
    case 'rej':
      leaveRoom(
        m.reason === 'started'
          ? t('La partida de la sala {code} ya ha empezado. Espera a que termine.', { code: app.code })
          : m.reason === 'full'
            ? t('La sala {code} está llena.', { code: app.code })
            : t('No has podido entrar en la sala.'),
      );
      break;
    case 'nack':
      toast(t(m.reason === 'leading' && app.view && app.view.mode === 'coop' ? 'Tu equipo ya va ganando.' : NACK[m.reason] || 'No se ha podido hacer.'));
      break;
    case 'closed':
      leaveRoom(t('El dueño ha cerrado la sala.'));
      break;
    default:
      break;
  }
}

const NACK = {
  low: 'Alguien ha pujado antes. Mira el precio nuevo.',
  funds: 'No tienes dinero suficiente.',
  leading: 'Ya vas ganando esta puja.',
  late: 'La subasta ya ha terminado.',
  paused: 'La partida está en pausa.',
  done: 'Ya has mirado una caja más en este trastero.',
  auctioneer: 'El subastador no puede pujar.',
  distracted: 'Estás distraído: espera unos segundos.',
  used: 'Ese truco ya lo has gastado.',
  busy: 'Espera a que acabe el otro truco.',
  notleading: 'Solo puedes meter prisa cuando vas ganando.',
};

function onNetStatus(status) {
  if (status !== app.netStatus) {
    app.netStatus = status;
    app.netSince = Date.now();
    if (status === 'SUBSCRIBED') {
      if (app.role === 'guest' && app.sendHello) app.sendHello();
      if (app.role === 'host') hostBroadcast();
    }
    render();
  }
}

function watchdog() {
  if (!app.net) return;
  const now = Date.now();
  if (app.role === 'guest') {
    if (!app.joinedOnce && now - app.joinStarted > 30000) {
      leaveRoom(t('No encuentro la sala {code}. Revisa el código o pide que te envíen el enlace otra vez.', { code: app.code }));
      return;
    }
    if (app.joinedOnce && now - app.lastStateAt > 12000 && now - (app.lastReconnect || 0) > 10000) {
      app.lastReconnect = now;
      app.net.reconnect();
    }
  } else if (app.role === 'host') {
    if (app.netStatus !== 'SUBSCRIBED' && now - app.netSince > 8000 && now - (app.lastReconnect || 0) > 10000) {
      app.lastReconnect = now;
      app.net.reconnect();
    }
  }
  render();
}

function leaveRoom(msg = null, { notify = true, to = 'home' } = {}) {
  if (app.net && notify) {
    if (app.role === 'guest') app.net.send({ t: 'bye', id: myId });
    if (app.role === 'host') app.net.send({ t: 'closed', id: myId });
  }
  const net = app.net;
  setTimeout(() => net && net.close(), 300);
  if (app.role === 'host') {
    sdel('tr-host');
    sdel('tr-host-alive');
  }
  sdel('tr-last');
  clearTimers();
  Object.assign(app, { screen: to, ctab: 'hub', role: null, code: null, net: null, state: null, view: null, joinedOnce: false, invite: null });
  setUrl(null);
  keepAwake(false);
  app.homeMsg = msg;
  closeModal();
  render();
}

// ---------- acciones del jugador ----------
function doAct(a) {
  if (app.role === 'host') {
    const r = E.act(app.state, myId, a, Date.now());
    if (r.ok) hostDirty();
    else if (r.reason === 'leading' && app.state.mode === 'coop') toast(app.state.career ? t('Ya vas ganando.') : t('Tu equipo ya va ganando.'));
    else if (NACK[r.reason]) toast(t(NACK[r.reason]));
    else if (r.reason && r.reason.length > 12) toast(t(r.reason));
    return r.ok;
  }
  if (app.net) app.net.send({ t: 'act', id: myId, a });
  return true;
}

// ---------- estado recibido ----------
const GUEST_LAG = 350; // ms: lo que tarda de sobra un mensaje entre móviles
function setView(v) {
  const prev = app.view;
  app.view = v;
  if (v.rem != null) {
    // a los invitados el estado les llega con retraso: en la subasta su reloj acaba un poco antes
    // para que una puja hecha con el último segundo en pantalla llegue a tiempo al anfitrión
    const d = performance.now() + v.rem - (app.role === 'guest' && v.phase === 'auction' ? GUEST_LAG : 0);
    if (!prev || prev.phase !== v.phase || prev.v !== v.v || Math.abs(d - app.deadline) > 350) app.deadline = d;
  } else app.deadline = 0;
  // trucos: hasta cuándo dura el que está en marcha y la distracción de cada uno (en el reloj de este móvil)
  app.blockUntil = {};
  if (v.auction && v.auction.blocked) for (const k in v.auction.blocked) app.blockUntil[k] = performance.now() + v.auction.blocked[k];
  app.trickUntil = v.auction && v.auction.trick && v.phase === 'auction' ? performance.now() + v.auction.trick.rem : 0;
  if (v.tricks) preloadTrickFx();
  if (v.phase !== 'pitch' || !app.pitchSel || app.pitchSel.round !== v.round) {
    if (v.phase === 'pitch') app.pitchSel = { round: v.round, phrase: null, opening: E.OPENINGS[0], face: 'poker' };
  }
  syncLook(v);
  effects(prev, v);
  render();
}

// el personaje que eligió la última vez viaja con él a cada sala nueva
function syncLook(v) {
  if (v.phase !== 'lobby' || app.lookSynced === v.code) return;
  const me = v.players.find((p) => p.id === myId);
  if (!me) return;
  app.lookSynced = v.code;
  const want = sget('tr-look');
  if (!want) {
    // la primera vez que entra en una sala, que elija su personaje
    setTimeout(() => {
      if (app.view && app.view.phase === 'lobby' && modalEl.hidden && !sget('tr-look')) openLookPicker(true);
    }, 400);
    return;
  }
  if (want === me.look || !PLAYER_LOOKS.includes(want)) return;
  if (v.players.some((p) => !p.bot && p.id !== myId && p.look === want)) return;
  setTimeout(() => doAct({ type: 'setLook', look: want }), 0);
}

function amLeader(v) {
  const a = v.auction;
  if (!a || !a.leader) return false;
  return v.mode === 'coop' ? a.leader === 'team' : a.leader === myId;
}

function effects(prev, v) {
  if (!prev) return;
  // alguien ha usado un truco: aviso y sonido para todos
  const tr = v.phase === 'auction' && v.auction && v.auction.trick;
  const ptr = prev.auction && prev.round === v.round && prev.auction.trick;
  if (tr && (!ptr || ptr.n !== tr.n)) {
    // con animación: sale sobre el trastero, en la misma pantalla de pujas; sin ella, un aviso
    if (!playTrickFx(v, tr, trickToast(v))) toast(trickToast(v), 2600);
    ({ movil: sfx.phone, famoso: sfx.famous, prisa: sfx.hurry })[tr.id]();
    if (tr.targets.includes(myKey(v))) buzz([60, 40, 60]);
  }
  if (prev.phase !== v.phase) {
    if (v.phase === 'reveal' && v.unit && v.unit.values) {
      sfx.door();
      const per = E.REVEAL_PER / SPEED;
      // récords y logros: se enseñan cuando ya se ha dado la cuenta
      const fresh = v.career ? [] : recordRound(v, myId, { appraised: app.appraisedKey === `${v.code}:${v.game}:${v.round}` });
      // álbum: lo que te llevas (tú o tu equipo) se apunta; lo nuevo se avisa al acabar de salir los objetos
      if (v.results && (v.results.winner === myId || (v.results.winner === 'team' && v.mode === 'coop'))) {
        const nu = A.record(v.unit.ids, `${v.code}:${v.game}:${v.round}`);
        if (nu.length)
          setTimeout(
            () => toast(nu.length === 1 ? t('Nuevo en tu álbum: {item}', { item: t(ITEM[nu[0]].name) }) : t('{n} objetos nuevos en tu álbum', { n: nu.length }), 2400),
            ((0.6 + v.unit.count * per) * 1000) + 400,
          );
      }
      fresh.forEach((a, k) => setTimeout(() => showAch(a), ((0.6 + v.unit.count * per) * 1000) + 900 + k * 2600));
      // la caja fuerte suena al abrirse, no antes (si no, el sonido chivaría lo que hay)
      v.unit.values.forEach((val, i) => setTimeout(() => sfx.item(val), (0.6 + i * per + (v.unit.safe && v.unit.safe[i] >= 0 ? per * 0.34 : 0)) * 1000));
      v.unit.ids.forEach(preloadAnim);
      spotlight(v);
      setTimeout(() => v.results && v.results.winner && sfx.sold(), 350);
      buzz(40);
      // «¡Adjudicado!» del subastador y la frase del que se lo lleva, con su voz
      const r = v.results;
      const w = winnerOf(v);
      const au = auctioneerOf(v);
      if (r && r.winner) {
        const round = v.round;
        const at = (0.6 + v.unit.count * per) * 1000;
        setTimeout(() => {
          const now = app.view;
          if (!now || now.phase !== 'reveal' || now.round !== round) return;
          if (r.profit > 0) sfx.gain();
          else if (r.profit < 0) sfx.loss();
        }, at);
      }
      if (r && r.winner && w)
        say([!r.free && au ? { look: au.look, key: 'sold' } : null, { look: w.look, key: 'win-' + winLineIdx(w.look, v.round + ':' + r.winner) }], { delay: 0.45 });
    }
    if (v.phase === 'auction' && v.mode === 'versus' && v.pitch) {
      // la frase que ha elegido el subastador, dicha con su voz
      const au = auctioneerOf(v);
      if (au) say({ look: au.look, key: 'pitch-' + v.pitch.phrase });
    }
    if (v.phase === 'end' && v.final && v.final.career) {
      const sum = careerCommit(v.final, careerKey(v));
      setTimeout(() => (v.final.profit >= 0 ? sfx.win() : sfx.lose()), 300);
      if (sum && sum.levelUp) setTimeout(() => sfx.special(), 1400);
      if (v.final.profit > 0) say({ look: myLook(), key: 'win-' + winLineIdx(myLook(), 'fin:' + v.code + ':' + v.round) }, { delay: 1.3 });
      if (v.final.profit > 0) offerCoupon();
    } else if (v.phase === 'end' && v.final) {
      recordEnd(v, myId).forEach((a, k) => setTimeout(() => showAch(a), 2600 + k * 2600));
      setTimeout(() => app.view && app.view.final && prepareShare(app.view), 1500);
      const won = v.mode === 'coop' ? v.final.win : v.final.ranking[0] && v.final.ranking[0].id === myId;
      setTimeout(() => (won ? sfx.win() : sfx.lose()), 300);
      if (won) offerCoupon();
      const top = endTop(v);
      if (top) say({ look: top.look, key: 'win-' + winLineIdx(top.look, 'fin:' + v.code + ':' + v.round) }, { delay: 1.3 });
    }
    if (v.phase === 'intro' && v.unit && v.unit.special) setTimeout(() => sfx.special(), 250);
    if (v.phase === 'intro') {
      // con la persiana bajada, el subastador «vende» el trastero como un comercial
      const au = auctioneerOf(v);
      if (au) say({ look: au.look, key: 'sales-' + salesIdx(au.look, salesSeed(v)) }, { delay: 0.5 });
    }
    if (v.phase === 'lobby') stopVoice();
    if (v.phase === 'intro' && prev.phase === 'lobby') keepAwake(true);
  }
  const ha = v.auction && v.auction.history[0];
  const hp = prev.auction && prev.auction.history[0];
  if (v.phase === 'auction' && ha && (!hp || ha.amount !== hp.amount || ha.key !== hp.key)) {
    const wasLeader = amLeader(prev) && prev.phase === 'auction';
    if (amLeader(v)) sfx.myBid();
    else if (wasLeader) {
      sfx.outbid();
      buzz([60, 40, 60]);
    } else sfx.bid();
    app.bumpPaddle = true;
    app.pendingBills = { key: ha.key, amount: ha.amount };
  }
}

// ---------- arte ----------
const ic = (emoji, cls = 'ic') => {
  const u = iconUrl(emoji);
  return u ? `<img class='${cls}' src='${u}' alt='' draggable='false'>` : `<span class='${cls} emo'>${emoji}</span>`;
};
const face = (look, f, cls = 'face') => `<img class='${cls}' src='${faceUrl(look, f)}' alt='' draggable='false'>`;
const faceOf = (v, id) => (v.faces && v.faces[id]) || 'poker';
// los bots, rivales y el subastador de la casa tienen nombre en cada idioma; los humanos, el suyo
const pn = (p) => (p ? tname(p.name) : '');
const lookLabel = (l) => t(LOOK_LABEL[l] || '');

function auctioneerOf(v) {
  if (v.mode === 'coop') return v.house ? { id: v.house.id, name: tname(v.house.name), look: v.house.look } : null;
  const p = v.players.find((x) => x.id === v.auctioneerId);
  return p ? { id: p.id, name: pn(p), look: p.look } : null;
}

// voces: las frases de victoria de todos al empezar y las del subastador de cada trastero
function preloadVoicesFor(v) {
  if (v.phase === 'lobby' || v.phase === 'end') return;
  const k = `${v.code}:${v.round}`;
  if (app.voiceKey === k) return;
  app.voiceKey = k;
  const looks = new Set(v.players.map((p) => p.look));
  (v.rivals || []).forEach((r) => looks.add(r.look));
  looks.forEach((l) => preloadVoices(l, ['win-0', 'win-1', 'win-2']));
  const au = auctioneerOf(v);
  if (au) {
    preloadVoices(au.look, v.mode === 'versus' ? ['pitch-0', 'pitch-1', 'pitch-2', 'pitch-3', 'pitch-4', 'pitch-5', 'sold'] : ['sold']);
    preloadVoices(au.look, (SALES_LINES[au.look] || []).map((_, i) => 'sales-' + i));
    preloadVoices(au.look, (PUSH_LINES[au.look] || []).map((_, i) => 'push-' + i));
    preloadVoices(au.look, ['star']);
  }
}
// qué frase de venta toca (la misma en todos los móviles)
const salesSeed = (v) => `${v.code}:${v.round}`;

// Cuando se acaba el tiempo de la subasta, el subastador mete prisa para que pujen un poco más.
// Lo decide cada móvil con su reloj; la frase sale del número de trastero y de cuántas lleva, así que es la misma en todos.
const PUSH_FROM = 3600; // ms que quedan cuando empieza a meter prisa (las frases duran como mucho ~3,3 s)
const PUSH_UNTIL = 900; // con menos tiempo ya no da tiempo a decirla
const PUSH_MAX = 2; // como mucho, dos veces por trastero
function maybePush(v, left) {
  const key = `${v.code}:${v.round}`;
  if (app.pushRound !== key) {
    app.pushRound = key;
    app.pushN = 0;
    app.pushAt = 0;
    app.push = null;
  }
  if (v.phase !== 'auction' || app.pushN >= PUSH_MAX) return;
  if (left > PUSH_FROM / SPEED || left < PUSH_UNTIL / SPEED) return;
  const now = performance.now();
  if (now - app.pushAt < 5000 / SPEED) return;
  const au = auctioneerOf(v);
  if (!au) return;
  const n = (PUSH_LINES[au.look] || PUSH_LINES.martillo).length;
  const i = (pushIdx(au.look, key) + app.pushN) % n;
  app.pushN++;
  app.pushAt = now;
  app.push = { look: au.look, i, until: now + 3400 };
  say({ look: au.look, key: 'push-' + i });
  paintSay(v);
}

// precarga las caras de los que están en la sala para que cambien sin parpadeo
const preloaded = new Set();
function preloadFaces(v) {
  const looks = new Set(v.players.map((p) => p.look));
  (v.rivals || []).forEach((r) => looks.add(r.look));
  if (v.house) looks.add(v.house.look);
  for (const l of looks) {
    if (!l || preloaded.has(l)) continue;
    preloaded.add(l);
    FACES.forEach((f) => {
      const im = new Image();
      im.src = faceUrl(l, f);
    });
    if (l !== 'martillo') {
      const w = new Image();
      w.src = winnerUrl(l);
      if (v.phase === 'intro' || v.phase === 'lobby') new Image().src = lineupUrl(l);
    }
  }
  // el subastador de este trastero, con todas sus caras
  const au = auctioneerOf(v);
  if (au && !preloaded.has('auct:' + au.look)) {
    preloaded.add('auct:' + au.look);
    FACES.forEach((f) => (new Image().src = auctUrl(au.look, f)));
  }
  // en la última ronda se van bajando las caras de pena del podio
  if (v.round && v.round === v.totalRounds && !preloaded.has('losers')) {
    preloaded.add('losers');
    looks.forEach((l) => {
      if (l && l !== 'martillo') new Image().src = loserUrl(l);
    });
  }
  // animaciones: solo de lo que este jugador ya puede ver (no se adelanta nada oculto)
  const u = v.unit;
  if (u && ['pitch', 'peek', 'auction'].includes(v.phase)) {
    preloadAnim(u.doorId);
    (v.priv && v.priv.seen ? v.priv.seen : []).forEach((x) => preloadAnim(x.id));
  }
}
// las animaciones se guardan como blob: cada vez que se muestran empiezan desde el principio
const animCache = new Map();
function preloadAnim(id) {
  if (!id) return Promise.resolve(null);
  if (!animCache.has(id)) {
    const p = fetch(animUrl(id))
      .then((r) => (r.ok ? r.blob() : null))
      .catch(() => null);
    animCache.set(id, p);
    p.then((b) => b || animCache.delete(id)); // si falla, se reintenta la próxima vez
  }
  return animCache.get(id);
}

// ---------- pantallas ----------
// música según la pantalla: el tema del menú en el inicio, la sala y el final; el de partida al jugar
function musicFor() {
  const v = app.view;
  if (app.screen === 'home' || app.screen === 'career') return setMusic('menu');
  if (!v) return; // conectando: sigue lo que sonaba
  const menu = v.phase === 'lobby' || v.phase === 'end';
  setMusic(menu ? 'menu' : 'game');
  if (v.phase === 'lobby') preloadMusic('game');
}

// ---------- primera partida guiada: consejos cortos junto a lo que vas a usar (cada uno sale una vez) ----------
const tipSeen = () => {
  try {
    const x = localStorage.getItem('tr-tips');
    return x === '*' ? '*' : new Set(JSON.parse(x || '[]'));
  } catch (e) {
    return new Set();
  }
};
function markTip(id) {
  const s = tipSeen();
  if (s === '*') return;
  s.add(id);
  try {
    localStorage.setItem('tr-tips', JSON.stringify([...s]));
  } catch (e) {
    /* nada */
  }
}
const meAuctOf = (v) => v.mode === 'versus' && v.auctioneerId === myId;
const TIPS = [
  { id: 'intro', when: (v) => v.phase === 'intro', target: '.stagewrap', text: () => t('El subastador presenta el trastero. Fíjate en el tamaño y en cuántos objetos hay dentro.') },
  { id: 'sets', when: (v) => v.phase === 'intro' && v.round >= 2, target: '.setsrow', text: () => t('Junta 3 objetos de la misma colección y cobras {v}. Toca aquí para verlas.', { v: money(SET_BONUS) }) },
  { id: 'auctioneer', when: (v) => v.phase === 'pitch' && meAuctOf(v), target: '[data-sec=panel]', text: () => t('Te toca subastar: elige precio y cara, y suelta una frase. Puede ser verdad o un farol (algo falso para despistar): cobras la mitad de lo que paguen.') },
  { id: 'peek', when: (v) => v.phase === 'pitch' && !meAuctOf(v) && v.unit && v.unit.special !== 'misterio', target: '.stagewrap', text: () => t('La caja con el ojo es la que has visto tú en secreto. Nadie más sabe qué es.') },
  { id: 'signal', when: (v) => v.phase === 'peek', target: '.signals', text: () => t('No digáis en voz alta qué veis: manda una señal a tu equipo.') },
  { id: 'bid', when: (v) => v.phase === 'auction' && !meAuctOf(v), target: '.bids', text: () => t('Toca una moneda para pujar. Cada puja da más tiempo y gana la más alta.') },
  { id: 'face', after: 'bid', when: (v) => v.phase === 'auction' && !meAuctOf(v), target: '.facebar', text: () => t('Pon cara para despistar: todos ven la de tu personaje.') },
  { id: 'tricks', after: 'bid', when: (v) => v.phase === 'auction' && !meAuctOf(v) && v.round >= 2, target: '.tricks', text: () => t('Trucos: paga para distraer a tus rivales unos segundos. Toca la ? para ver qué hace cada uno.') },
  { id: 'count', when: (v) => v.phase === 'reveal' && v.results && v.results.winner && revealClock(v).done, target: '.ticket', text: () => t('La cuenta: lo que pagó, lo que había dentro y si ha ganado o perdido dinero.') },
];
let tipNow = null; // { id, at }
function paintTip() {
  const v = app.view;
  const seen = tipSeen();
  let tip = null;
  let el = null;
  if (seen !== '*' && v && app.screen === 'room' && modalEl.hidden) {
    for (const x of TIPS) {
      if (seen.has(x.id) || (x.after && !seen.has(x.after)) || !x.when(v)) continue;
      el = root.querySelector(x.target);
      if (el && el.offsetParent !== null) {
        tip = x;
        break;
      }
    }
  }
  let box = document.getElementById('tipbox');
  // el que se estaba enseñando y ya no toca: si se ha visto un rato, cuenta como visto
  if (tipNow && (!tip || tip.id !== tipNow.id)) {
    if (Date.now() - tipNow.at > 2500) markTip(tipNow.id);
    tipNow = null;
  }
  if (!tip) {
    if (box) box.remove();
    return;
  }
  if (!tipNow) tipNow = { id: tip.id, at: Date.now() };
  if (!box) {
    box = document.createElement('div');
    box.id = 'tipbox';
    box.className = 'tipbox';
    box.setAttribute('role', 'note');
    document.body.appendChild(box);
  }
  const html = `<p>${tip.text()}</p><button class='btn' data-act='tipOk' data-v='${tip.id}'>${t('Entendido')}</button>`;
  if (box._html !== html) {
    box.innerHTML = html;
    box._html = html;
    box._anchor = null;
  }
  // encima de lo que explica (o debajo si no cabe), sin taparlo; quieto mientras lo que explica no se mueva
  const r = el.getBoundingClientRect();
  if (box._anchor != null && Math.abs(box._anchor - r.top) < 40) return;
  box._anchor = r.top;
  const h = box.offsetHeight;
  let top = r.top - h - 12;
  let below = false;
  if (top < 8) {
    top = r.bottom + 12;
    below = true;
  }
  top = Math.max(8, Math.min(innerHeight - h - 8, top));
  box.style.top = Math.round(top) + 'px';
  box.classList.toggle('below', below);
}

function render() {
  musicFor();
  paintSoundHint();
  if (app.screen === 'home') return renderHome();
  if (app.screen === 'career') return renderCareer();
  const v = app.view;
  if (!v) return renderConnecting();
  preloadFaces(v);
  preloadVoicesFor(v);
  // el selector de personaje abierto se mantiene al día (quién ha cogido qué)
  if (app.modalKind === 'look') {
    if (v.phase === 'lobby') openLookPicker(app.lookFirst);
    else closeModal();
  }
  if (v.phase === 'lobby') return renderLobby(v);
  return renderGame(v);
}

const PENCIL = `<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg>`;

function careerCard() {
  const st = C.exists() ? C.load() : null;
  const sub = st ? `${t('Día {n}', { n: st.day })} · ${t(C.levelOf(st.xp).title)} · ${money(st.money)}` : t('Empieza en el barrio y llega a las mansiones');
  return `<button class='hcard hcareer' data-act='career'><img class='hcar-img' src='assets/zones/barrio.webp' alt='' loading='lazy'><span class='hcar-txt'><b>${t('Rey de las subastas')}</b><small>${esc(sub)}</small></span><span class='go'>›</span></button>`;
}

function renderHome() {
  setMusic('menu');
  layout(['home']);
  const name = sget('tr-name', '');
  const look = PLAYER_LOOKS.includes(sget('tr-look')) ? sget('tr-look') : null;
  const last = sget('tr-last');
  const hostSave = sget('tr-host');
  const canResume = last && Date.now() - last.at < RESUME_MS && (last.role === 'guest' || (hostSave && hostSave.code === last.code));
  const inv = app.invite;
  const avatar = look
    ? face(look, 'feliz', 'face')
    : `<span class='face qface'>?</span>`;
  const actions = inv
    ? `<button class='hcard hcreate hwide' data-act='join-invite'>${ic('🚪', 'hc-ic')}<b>${t('Entrar en la sala {code}', { code: esc(inv) })}</b><small>${t('Te han invitado')}</small></button>
       <button class='linkish' data-act='no-invite'>${t('Prefiero crear una sala nueva')}</button>`
    : `<div class='hcards'>
         <button class='hcard hcreate' data-act='create'>${ic('🔑', 'hc-ic')}<b>${t('Crear sala')}</b><small>${t('Tú eres el dueño de la sala')}</small></button>
         <div class='hcard hjoin'>${ic('🚪', 'hc-ic')}<b>${t('Unirme')}</b>
           <label class='codebox'>
             <input id='code' maxlength='4' autocapitalize='characters' autocomplete='off' autocorrect='off' spellcheck='false' enterkeyhint='go' aria-label='${t('Código de la sala, 4 letras')}' />
             <span class='cells' aria-hidden='true'><i></i><i></i><i></i><i></i></span>
           </label>
         </div>
       </div>`;
  const html = `
  <section class='home-hero'>
    <img class='hero-art' src='assets/home/hero.webp' srcset='assets/home/hero-640.webp 640w, assets/home/hero.webp 1024w' sizes='(max-width: 480px) 100vw, 480px' alt='' fetchpriority='high' />
    <div class='hero-title'><h1 class='logo'>Trasteros</h1><div class='tagline'>${t('Subastas a ciegas')}</div></div>
  </section>
  ${canResume && !inv ? `<button class='resume' data-act='resume'><i class='dot'></i><span class='grow'>${hostSave && hostSave.state && hostSave.state.career && hostSave.code === last.code ? t('Tienes un día de subastas a medias') : t('Partida en curso · Sala {code}', { code: `<b>${esc(last.code)}</b>` })}</span><span class='go'>${t('Volver')} ›</span></button>` : ''}
  ${app.homeMsg ? `<div class='msg'>${esc(app.homeMsg)}</div>` : ''}
  <div class='whoami'>
    <button class='who-face' data-act='homeLook' aria-label='${look ? t('Cambiar de personaje: {who}', { who: esc(lookLabel(look)) }) : t('Elegir personaje')}'>${avatar}<span class='pen'>${PENCIL}</span></button>
    <label class='who-name' for='name'><span>${t('Juegas como')}</span>
      <span class='who-field'><input id='name' class='input' maxlength='14' autocomplete='nickname' enterkeyhint='go' placeholder='${t('Tu nombre')}' value='${esc(name)}' />${PENCIL}</span>
    </label>
  </div>
  ${actions}
  ${inv ? '' : careerCard()}
  <div class='foot${K.enabled() ? ' has-cpn' : ''}'>
    <button class='linkish' data-act='help'>${t('Cómo se juega')}</button>
    <button class='iconbtn' data-act='stats' aria-label='${t('Tus récords')}' title='${t('Tus récords')}'>${ic('🏆')}</button>
    <button class='iconbtn' data-act='album' aria-label='${t('Tu álbum')}' title='${t('Tu álbum')}'>${ic('📚')}${A.claimable(A.load()).length ? `<span class='nb dot'></span>` : ''}</button>
    ${K.enabled() ? `<button class='iconbtn' data-act='coupons' aria-label='${t('Mis cupones')}' title='${t('Mis cupones')}'>${ic('🎟️')}${K.unseen() ? `<span class='nb dot'></span>` : ''}</button>` : ''}
    <span class='grow'></span>
    <div class='langsw' role='group' aria-label='${t('Idioma')}'>${['es', 'en'].map((l) => `<button data-act='lang' data-v='${l}' aria-pressed='${getLang() === l}'>${l.toUpperCase()}</button>`).join('')}</div>
    <button class='iconbtn' data-act='mute' aria-label='${isMuted() ? t('Activar sonido') : t('Silenciar')}'>${ic(isMuted() ? '🔇' : '🔊')}</button>
  </div>`;
  const el = sec('home');
  if (el._html !== html) {
    // conserva lo que se esté escribiendo
    const typedName = document.getElementById('name')?.value;
    const typedCode = document.getElementById('code')?.value;
    setHTML(el, html);
    if (typedName != null) document.getElementById('name').value = typedName;
    if (typedCode != null && document.getElementById('code')) document.getElementById('code').value = typedCode;
  }
  paintCode();
}

// ---------- modo carrera: tu negocio de trasteros, en solitario y guardado en este móvil ----------
const myLook = () => (PLAYER_LOOKS.includes(sget('tr-look')) ? sget('tr-look') : 'ana');
const zoneName = (z) => t(C.ZONE_INFO[z].name);
// el siguiente paso que le conviene al jugador (o lo que le impide jugar)
function careerGoal(st) {
  const level = C.levelOf(st.xp).level;
  if (C.needsHelp(st)) return { icon: '🤝', text: t('Te has quedado sin nada. Un amigo te presta {v} para volver a empezar.', { v: money(C.HELP_MONEY) }), act: 'careerHelp', btn: t('Aceptar la ayuda') };
  if (st.money < C.MIN_TO_GO) return { icon: '📦', text: t('No te llega para pujar: vende algo en el almacén.'), act: 'ctab', v: 'almacen', btn: t('Ir al almacén'), warn: true };
  if (!C.canGo(st).ok) return { icon: '📦', text: t('El almacén está lleno: vende algo o mejora la furgoneta.'), act: 'ctab', v: 'almacen', btn: t('Ir al almacén'), warn: true };
  if (st.day === 1) return { icon: '🔑', text: t('Empiezas con {v}. Puja por trasteros, vende lo que encuentres y sube de nivel para abrir zonas mejores.', { v: money(C.START_MONEY) }) };
  const pz = C.zoneState(st, 'poligono');
  if (!pz.open) {
    if (level < pz.level) return { icon: '⭐', text: t('Objetivo: llega a nivel {n} para abrir el Polígono.', { n: pz.level }) };
    if (!pz.afford) return { icon: '💰', text: t('Objetivo: junta {v} para abrir el Polígono.', { v: money(pz.price) }) };
    return { icon: '🔑', text: t('¡Ya puedes abrir el Polígono! Allí salen trasteros más grandes.'), act: 'careerZone', v: 'poligono', btn: t('Abrir') };
  }
  const up = C.UPGRADE_ORDER.find((k) => {
    const i = C.upgradeInfo(st, k);
    return !i.max && !i.locked && i.afford;
  });
  if (up) return { icon: C.UPGRADES[up].emoji, text: t('Te llega para mejorar: {name}.', { name: t(C.UPGRADES[up].name) }), act: 'ctab', v: 'mejoras', btn: t('Ver mejoras') };
  const hz = C.zoneState(st, 'puerto');
  if (!hz.open) {
    if (level < hz.level) return { icon: '⭐', text: t('Objetivo: llega a nivel {n} para abrir el Puerto. Allí hay objetos, colecciones y mejoras nuevos.', { n: hz.level }) };
    if (!hz.afford) return { icon: '💰', text: t('Objetivo: junta {v} para abrir el Puerto.', { v: money(hz.price) }) };
    return { icon: '🔑', text: t('¡Ya puedes abrir el Puerto! Allí hay objetos, colecciones y mejoras nuevos.'), act: 'careerZone', v: 'puerto', btn: t('Abrir') };
  }
  return { icon: '🏆', text: t('Objetivo: completa los álbumes del Puerto y llega a nivel {n}. Las Mansiones llegan pronto.', { n: C.ZONE_INFO.mansiones.level }) };
}
function careerTop(st) {
  return `<div class='ctop'>
    <button class='iconbtn' data-act='careerHome' aria-label='${t('Volver al inicio')}'>‹</button>
    <h1 class='ctitle display'>${t('Rey de las subastas')}</h1>
    <div class='cmoney${st.money < 0 ? ' neg' : ''}'><b class='display'>${money(st.money)}</b><small>${t('Tu dinero')}</small></div>
    <div class='cday display'>${t('Día {n}', { n: st.day })}</div>
  </div>`;
}
function careerLevel(st) {
  const L = C.levelOf(st.xp);
  const pct = Math.max(0, Math.min(100, ((st.xp - L.from) / (L.to - L.from)) * 100));
  return `<div class='clevel'>${face(myLook(), 'feliz', 'face clface')}
    <div class='grow'><b class='display'>${t(L.title)} · ${t('Nivel {n}', { n: L.level })}</b>
      <div class='xpbar'><i style='width:${pct.toFixed(1)}%'></i></div>
      <small>${t('{a} / {b} de reputación', { a: num(st.xp), b: num(L.to) })}</small></div>
  </div>`;
}
function zoneCard(st, z) {
  const zs = C.zoneState(st, z);
  const sel = zs.open && st.zone === z;
  const foot = zs.open ? (sel ? t('Aquí vas a pujar') : t(C.ZONE_INFO[z].sub)) : zs.locked ? t('Nivel {n} · {v}', { n: zs.level, v: money(zs.price) }) : t('Abrir por {v}', { v: money(zs.price) });
  const cls = zs.open ? (sel ? ' sel' : '') : zs.locked ? ' locked' : ' buy';
  return `<button class='zone${cls}' data-act='careerZone' data-v='${z}' aria-pressed='${sel}'>
    <img class='zimg' src='assets/zones/${z}.webp' alt='' draggable='false' loading='lazy'>
    ${zs.open ? (sel ? `<span class='zsel'>✓</span>` : '') : `<span class='zlock'>${ic(zs.locked ? '🔐' : '🔑', 'ic')}</span>`}
    ${zs.soon ? `<span class='zsoon'>${t('Próximamente')}</span>` : ''}
    <span class='zlabel'><b class='display'>${zoneName(z)}</b><small>${foot}</small></span>
  </button>`;
}
function careerHub(st) {
  const g = careerGoal(st);
  const go = C.canGo(st).ok && st.money >= C.MIN_TO_GO;
  const goal = `<div class='cgoal${g.warn ? ' warn' : ''}'>${ic(g.icon, 'ic cg-ic')}<p class='grow'>${esc(g.text)}</p>${g.act ? `<button class='btn sm${g.warn ? ' primary' : ''}' data-act='${g.act}' data-v='${g.v || ''}'>${esc(g.btn)}</button>` : ''}</div>`;
  const last = st.last
    ? `<p class='clast small muted'>${t('Ayer, día {n} · {zone}: {v}', { n: st.last.day, zone: zoneName(st.last.zone), v: `<b class='${st.last.profit >= 0 ? 'pos' : 'neg'}'>${signed(st.last.profit) || money(0)}</b>` })}</p>`
    : '';
  return `${careerLevel(st)}
    <h2 class='csub display'>${t('Zonas')}</h2>
    <div class='zones'>${C.ZONE_ORDER.map((z) => zoneCard(st, z)).join('')}</div>
    ${goal}${last}
    <button class='btn primary block cgo' data-act='careerGo' ${go ? '' : 'disabled'}><span class='display'>${t('Ir a la subasta')}</span><small>${t('{zone} · {n} trasteros', { zone: zoneName(st.zone), n: E.ZONES[st.zone].rounds })}</small></button>`;
}
function careerStore(st) {
  const cap = C.capacity(st);
  const n = st.items.length;
  const sets = C.setsIn(st);
  const loose = st.items.filter((it) => !SET_OF[it.id]);
  const looseV = loose.reduce((x, it) => x + C.sellPrice(st, it), 0);
  const setRows = COLLECTIONS.filter((c) => sets[c.id])
    .map((c) => {
      const sale = C.setSale(st, c.id);
      const have = sets[c.id].length;
      return `<div class='cset${sale ? ' ready' : ''}'>${ic(c.emoji, 'ic')}<span class='grow'><b>${esc(t(c.name))}</b><small>${
        sale ? t('{n} piezas: juntas valen un {p} % más', { n: have, p: Math.round(C.SET_SALE_BONUS * 100) }) : t('{n} de {m}: con {m} se venden un {p} % más caras', { n: have, m: SET_NEED, p: Math.round(C.SET_SALE_BONUS * 100) })
      }</small></span>${sale ? `<button class='btn sm primary' data-act='careerSellSet' data-v='${c.id}'>${t('Vender')} ${money(sale.price)}</button>` : ''}</div>`;
    })
    .join('');
  const items = [...st.items]
    .sort((a, b) => b.v - a.v)
    .map((it) => {
      const def = ITEM[it.id];
      const sh = def && def.safe ? shownAs(it.id, it.closed ? -1 : it.out == null ? null : it.out) : def;
      const open = it.closed ? `<button class='btn sm primary' data-act='careerSafe' data-v='${it.k}' aria-label='${t('Abrir con el cerrajero')}' ${st.money >= C.locksmith(st) ? '' : 'disabled'}>${ic('🔑', 'ic sm')} ${C.locksmith(st) ? money(C.locksmith(st)) : t('Gratis')}</button>` : '';
      const hint = it.closed ? `<small class='muted'>${t('¿Qué habrá dentro?')}</small>` : def && def.safe && it.out != null ? `<small class='muted'>${ic('🔐', 'ic sm')} ${t('Estaba en la caja fuerte')}</small>` : '';
      return `<li class='${it.closed ? 'safe' : ''}'>${ic(sh ? sh.emoji : '📦', 'ic')}<span class='grow'><b>${esc(sh ? t(sh.name) : it.id)}</b>${setBadge(it.id)}${hint}</span>${open}<button class='btn sm' data-act='careerSell' data-v='${it.k}'>${money(C.sellPrice(st, it))}</button></li>`;
    })
    .join('');
  return `<div class='ccap'><div class='row'><b class='grow'>${t('Almacén')}</b><span class='${n >= cap ? 'neg' : ''}'>${t('{n} de {m} huecos', { n, m: cap })}</span></div><div class='capbar${n >= cap ? ' full' : ''}'><i style='width:${Math.min(100, (n / cap) * 100).toFixed(1)}%'></i></div>
      ${C.shopBonus(st) ? `<small class='muted'>${t('Tu tienda vende un {p} % más caro.', { p: Math.round(C.shopBonus(st) * 100) })}</small>` : ''}</div>
    ${setRows ? `<h2 class='csub display'>${t('Colecciones')}</h2><div class='csets'>${setRows}</div>` : ''}
    ${n ? `<div class='row csellall'><h2 class='csub display grow'>${t('Lo que tienes')}</h2>${loose.length ? `<button class='btn sm primary' data-act='careerSellLoose'>${t('Vender lo suelto')} ${money(looseV)}</button>` : ''}</div><ul class='citems'>${items}</ul>` : `<p class='cempty muted'>${t('Aún no tienes nada. Lo que ganes en las subastas llega aquí y lo vendes cuando quieras.')}</p>`}`;
}
function upEffect(key, lv) {
  if (key === 'lupa') return tn(1 + lv, 'Ves {n} caja de cada trastero', 'Ves {n} cajas de cada trastero');
  if (key === 'furgoneta') return t('Caben {n} objetos en el almacén', { n: C.UPGRADES.furgoneta.cap[lv] });
  if (key === 'contactos') {
    const off = C.UPGRADES.contactos.off[lv];
    return off ? t('Los trucos te cuestan un {p} % menos', { p: Math.round(off * 100) }) : t('Los trucos cuestan lo normal');
  }
  if (key === 'seguro') {
    const off = C.UPGRADES.seguro.off[lv];
    return off >= 1 ? t('Las trampas no te cuestan nada') : off ? t('Las trampas te cuestan un {p} % menos', { p: Math.round(off * 100) }) : t('Las trampas se pagan enteras');
  }
  if (key === 'cerrajero') {
    const fee = C.UPGRADES.cerrajero.price[lv];
    return fee ? t('Abrir una caja fuerte cuesta {v}', { v: money(fee) }) : t('Abrir cajas fuertes es gratis');
  }
  const b = C.UPGRADES.tienda.bonus[lv];
  return b ? t('Vendes un {p} % más caro', { p: Math.round(b * 100) }) : t('Vendes al precio normal');
}
function careerUpgrades(st) {
  return C.UPGRADE_ORDER.map((k) => {
    const u = C.UPGRADES[k];
    const i = C.upgradeInfo(st, k);
    const pips = u.costs.map((_, n) => `<i class='${n < i.lv ? 'on' : ''}'></i>`).join('');
    const action = i.max
      ? `<span class='upmax'>${t('Al máximo')}</span>`
      : i.zone
        ? `<span class='uplock'>${ic('🔐', 'ic')} ${t('Se abre en el Puerto')}</span>`
        : i.locked
          ? `<span class='uplock'>${ic('🔐', 'ic')} ${t('Nivel {n}', { n: i.need })}</span>`
        : `<button class='btn sm${i.afford ? ' primary' : ''}' data-act='careerUp' data-v='${k}' ${i.afford ? '' : 'disabled'}>${money(i.cost)}</button>`;
    return `<div class='upcard'>${ic(u.emoji, 'ic up-ic')}
      <div class='grow'><b class='display'>${t(u.name)}</b><span class='pips'>${pips}</span>
        <small>${upEffect(k, i.lv)}</small>${i.max ? '' : `<small class='upnext'>${t('Siguiente')}: ${upEffect(k, i.lv + 1)}</small>`}</div>
      ${action}</div>`;
  }).join('') + `<button class='linkish creset' data-act='careerReset'>${t('Empezar todo de cero')}</button>`;
}
function careerNav(st, tab) {
  const canUp = C.UPGRADE_ORDER.some((k) => {
    const i = C.upgradeInfo(st, k);
    return !i.max && !i.locked && i.afford;
  });
  const full = !C.canGo(st).ok;
  const tabs = [
    ['hub', '🏆', t('Zonas'), ''],
    ['almacen', '📦', t('Almacén'), st.items.length ? `<span class='nb${full ? ' warn' : ''}'>${st.items.length}</span>` : ''],
    ['mejoras', '🧰', t('Mejoras'), canUp ? `<span class='nb dot'></span>` : ''],
    ['album', '📚', t('Álbum'), A.claimable(A.load()).length ? `<span class='nb dot'></span>` : ''],
  ];
  return `<nav class='cnav'>${tabs.map(([k, e, l, b]) => `<button data-act='ctab' data-v='${k}' aria-pressed='${tab === k}'>${ic(e, 'ic')}${b}<span>${l}</span></button>`).join('')}</nav>`;
}
function renderCareer() {
  setMusic('menu');
  const st = C.load();
  const tab = app.ctab || 'hub';
  layout(['ctop', 'cbody', 'cnav']);
  setHTML(sec('ctop'), careerTop(st));
  setHTML(sec('cbody'), `<div class='cbody ${tab}'>${tab === 'almacen' ? careerStore(st) : tab === 'mejoras' ? careerUpgrades(st) : tab === 'album' ? albumHTML() : careerHub(st)}</div>`);
  setHTML(sec('cnav'), careerNav(st, tab));
}
// Apunta el día en la carrera una sola vez (al acabar, o al dejarlo a medias con lo que haya pasado)
function careerCommit(final, key) {
  const st = C.load();
  const sum = C.commitDay(st, final, key);
  if (sum) C.save(st);
  return sum;
}
const careerKey = (v) => `${v.code}:${v.game}`;
function careerEnd(v) {
  careerCommit(v.final, careerKey(v));
  const st = C.load();
  const s = st.last || { profit: v.final.profit, won: v.final.won, items: v.final.items.length, xp: 0, day: st.day - 1 };
  const L = C.levelOf(st.xp);
  const pct = Math.max(0, Math.min(100, ((st.xp - L.from) / (L.to - L.from)) * 100));
  // qué te trae el nivel nuevo: título nuevo, zona que ya puedes abrir o el próximo título
  const before = C.levelOf(Math.max(0, st.xp - (s.xp || 0)));
  const nextTitle = [...C.TITLES].reverse().find(([l]) => l > L.level);
  const opens = C.ZONE_ORDER.find((z) => !C.ZONE_INFO[z].soon && C.ZONE_INFO[z].level > before.level && C.ZONE_INFO[z].level <= L.level && !st.zones[z]);
  const news = [before.title !== L.title ? t('Ahora eres {title}.', { title: t(L.title) }) : '', opens ? t('Ya puedes abrir la zona {zone}.', { zone: zoneName(opens) }) : ''].filter(Boolean).join(' ');
  const upText = news || (nextTitle ? t('En el nivel {n} serás {title}.', { n: nextTitle[0], title: t(nextTitle[1]) }) : '');
  const up = s.levelUp
    ? `<div class='lvup'>${ic('🎉', 'ic')}<span><b class='display'>${t('¡Nivel {n}!', { n: s.levelUp })}</b>${upText ? `<small>${upText}</small>` : ''}</span></div>`
    : '';
  const tone = s.profit > 0 ? 'pos' : s.profit < 0 ? 'neg' : '';
  return `<div class='dayend'>
    <img class='de-char' src='${(s.profit >= 0 ? winnerUrl : loserUrl)(myLook())}' alt=''>
    <p class='de-k muted'>${t('Fin del día {n} · {zone}', { n: s.day, zone: zoneName(v.final.zone) })}</p>
    <div class='de-profit display ${tone}'>${signed(s.profit) || money(0)}</div>
    <p class='de-sub'>${s.profit > 0 ? t('Buen día de negocio.') : s.profit < 0 ? t('Hoy has perdido dinero.') : t('Te quedas igual.')}</p>
    <ul class='de-rows'>
      <li><span>${t('Trasteros ganados')}</span><b>${s.won} / ${v.final.rounds}</b></li>
      <li><span>${t('Al almacén')}</span><b>${tn(s.items, '{n} objeto', '{n} objetos')}</b></li>
      <li><span>${t('Reputación')}</span><b class='pos'>+${num(s.xp)}</b></li>
      <li><span>${t('Tu dinero')}</span><b>${money(st.money)}</b></li>
    </ul>
    <div class='xpbar big'><i style='width:${pct.toFixed(1)}%'></i></div>
    <small class='muted'>${t(L.title)} · ${t('Nivel {n}', { n: L.level })} · ${t('{a} / {b} de reputación', { a: num(st.xp), b: num(L.to) })}</small>
    ${up}
    <button class='btn primary block' data-act='careerBack'>${t('Continuar')}</button>
  </div>`;
}
// Álbum: todos los objetos del juego; los que aún no has encontrado salen en sombra
function albumHTML() {
  const a = A.load();
  const n = A.have(a);
  const zones = C.load().zones;
  const groups = A.GROUPS.map((g) => {
    if (g.zone && !zones[g.zone])
      return `<section class='al-g locked'><div class='row al-h'>${ic(g.emoji, 'ic')}<b class='grow'>${esc(t(g.name))} <small>${g.items.length}</small></b><span class='al-rw'>${ic('🔐', 'ic')} ${t('Se abre en el Puerto')}</span></div></section>`;
    const got = g.items.filter((id) => a.found[id]).length;
    const done = got === g.items.length;
    const status = a.claimed[g.id]
      ? `<span class='al-ok'>✓ ${t('Premio cobrado')}</span>`
      : done
        ? `<button class='btn sm primary' data-act='albumClaim' data-v='${g.id}'>${t('Cobrar {v}', { v: money(g.reward) })}</button>`
        : `<span class='al-rw'>${t('Premio: {v}', { v: money(g.reward) })}</span>`;
    const tiles = g.items
      .map((id) => {
        const it = ITEM[id];
        const c = a.found[id] || 0;
        return c
          ? `<div class='al-t'>${ic(it.emoji, 'ic')}<span>${esc(t(it.name))}</span>${c > 1 ? `<b class='al-n'>×${c}</b>` : ''}</div>`
          : `<div class='al-t unk'>${ic(it.emoji, 'ic')}<span>???</span></div>`;
      })
      .join('');
    return `<section class='al-g${done ? ' done' : ''}'><div class='row al-h'>${ic(g.emoji, 'ic')}<b class='grow'>${esc(t(g.name))} <small>${got}/${g.items.length}</small></b>${status}</div><div class='al-grid'>${tiles}</div></section>`;
  }).join('');
  return `<div class='album'>
    <div class='al-top'><b class='display'>${t('{n} de {m} objetos', { n, m: A.TOTAL })}</b><div class='capbar'><i style='width:${((n / A.TOTAL) * 100).toFixed(1)}%'></i></div>
    <small class='muted'>${t('Se rellena con lo que ganas en cualquier modo. Cada grupo completo da un premio para Rey de las subastas.')}</small></div>
    ${groups}
  </div>`;
}
function albumSheet() {
  return `<div class='stack'><div class='row'><h2 class='grow'>${ic('📚')} ${t('Tu álbum')}</h2><button class='iconbtn' data-act='close' aria-label='${t('Cerrar')}'>✕</button></div>${albumHTML()}</div>`;
}

// Cupones de descuento de tiendas reales: se ganan al ganar una partida (como mucho uno al día)
function couponCard(c) {
  const old = K.expired(c);
  const date = new Date(c.ends).toLocaleDateString('es-ES');
  return `<article class='cpn${old ? ' old' : ''}'>
    <div class='cpn-top'>${ic('🎟️', 'ic cpn-ic')}<div><small>${esc(c.merchant)}</small><b>${esc(c.title)}</b></div></div>
    ${c.code ? `<div class='cpn-code'><code>${esc(c.code)}</code><button class='btn sm' data-act='couponCopy' data-v='${esc(c.id)}' ${old ? 'disabled' : ''}>${t('Copiar')}</button></div>` : `<p class='small muted'>${t('Sin código: el descuento se aplica al entrar por el enlace.')}</p>`}
    ${c.text ? `<p class='cpn-text small'>${esc(c.text)}</p>` : ''}
    <p class='small ${old ? 'warnline' : 'muted'}'>${old ? t('Caducado') : t('Válido hasta el {d}', { d: date })}</p>
    ${old ? '' : `<a class='btn primary block' href='${esc(c.url)}' target='_blank' rel='noopener sponsored'>${t('Ir a la tienda')}</a>`}
  </article>`;
}
const LEGAL_LINK = () => `<p class='small center legal-link'><a href='legal.html?lang=${getLang()}' target='_blank' rel='noopener'>${t('Privacidad y aviso legal')}</a></p>`;
const COUPON_AD = () => `<p class='small muted cpn-ad'>${t('Publicidad · Trasteros puede recibir una comisión si compras con este código o enlace.')}</p>${LEGAL_LINK()}`;
function couponWonSheet(c) {
  return `<div class='stack'><div class='row'><h2 class='grow'>${ic('🎁')} ${t('¡Premio! Un cupón de descuento')}</h2><button class='iconbtn' data-act='close' aria-label='${t('Cerrar')}'>✕</button></div>${couponCard(c)}<p class='small muted center'>${t('Guardado en «Mis cupones», en la portada.')}</p>${COUPON_AD()}</div>`;
}
function couponsSheet() {
  const w = K.wallet();
  return `<div class='stack'><div class='row'><h2 class='grow'>${ic('🎟️')} ${t('Mis cupones')}</h2><button class='iconbtn' data-act='close' aria-label='${t('Cerrar')}'>✕</button></div>
    ${w.length ? w.map(couponCard).join('') : `<p class='muted'>${t('Gana partidas para conseguir cupones de descuento de tiendas reales. Como mucho, uno al día.')}</p>`}${COUPON_AD()}</div>`;
}
function offerCoupon() {
  const c = K.award();
  if (!c) return;
  // tras el podio y los sonidos de victoria; si hay otra hoja abierta, queda guardado con el aviso en la portada
  setTimeout(() => {
    if (!modalEl.hidden) return;
    openModal(couponWonSheet(c), 'coupon');
    K.markSeen();
    sfx.special();
  }, 4200);
}

// Regateo: el comprador, lo que dice y qué puedes hacer
function paintHaggle() {
  const h = app.haggle;
  if (!h) return;
  if (!h.item) {
    // lo que se vende, apuntado al empezar (al venderlo ya no está en el almacén)
    const it = C.load().items.find((o) => o.k === h.k);
    const def = it ? ITEM[it.id] : null;
    const sh = def && def.safe ? shownAs(it.id, it.out == null ? null : it.out) : def;
    h.item = sh ? { emoji: sh.emoji, name: sh.name } : { emoji: '📦', name: '' };
  }
  const item = `${ic(h.item.emoji, 'ic')}<span class='grow'><b>${esc(t(h.item.name))}</b><small class='muted'>${t('Precio normal')}: ${money(h.base)}</small></span>`;
  const line = {
    offer: t('Te doy {v}. ¿Hay trato?', { v: money(h.offer) }),
    meet: t('Ni para ti ni para mí: {v}.', { v: money(h.offer) }),
    deal: t('Trato hecho: {v}.', { v: money(h.price) }),
    leave: t('Uf, demasiado caro. Me voy.'),
  }[h.said];
  const buttons = h.end
    ? `<button class='btn primary block' data-act='hgNo'>${h.end === 'sold' ? t('¡Vendido!') : t('Vale')}</button>${h.end === 'leave' ? `<p class='small muted center'>${t('Hoy ya no viene nadie más por esto: si lo vendes, será al precio normal.')}</p>` : ''}`
    : `<button class='btn primary block' data-act='hgYes'>${t('Vender por {v}', { v: money(h.offer) })}</button>
       <div class='row'><button class='btn grow' data-act='hgNo'>${t('No vender')}</button><button class='btn grow' data-act='hgAsk'>${t('Pedir {v}', { v: money(C.haggleAsk(h)) })}</button></div>`;
  openModal(
    `<div class='stack haggle'>
      <div class='hg-top'>${face(h.look, h.face, 'face hg-face')}<div class='hg-bub'><small>${esc(t(LOOK_LABEL[h.look] || ''))}</small><p>${esc(line)}</p></div></div>
      <div class='hg-item'>${item}</div>
      ${buttons}
    </div>`,
    'haggle',
  );
}
function startCareerDay() {
  const st = C.load();
  if (!C.canGo(st).ok || st.money < C.MIN_TO_GO) return;
  const now = Date.now();
  const state = E.createRoom({ code: genCode(), hostId: myId, hostName: sget('tr-name', '') || 'Tú', seed: crypto.getRandomValues(new Uint32Array(1))[0], now, speed: SPEED });
  E.act(state, myId, { type: 'setLook', look: myLook() }, now);
  // si al álbum le faltan pocos objetos, esos salen más a menudo en las subastas del día
  const miss = A.missing(A.load(), st.zone);
  E.setupCareer(state, { zone: st.zone, money: st.money, lupa: st.up.lupa, trickOff: C.trickOff(st), trapOff: C.trapOff(st), wanted: miss.length <= E.WANTED_MAX ? miss : [] });
  const r = E.act(state, myId, { type: 'start' }, now);
  if (!r.ok) return toast(t('No se ha podido hacer.'));
  startHosting(state);
}

// las 4 casillas del código reflejan lo que hay en el campo (invisible) que va encima
function paintCode() {
  const inp = document.getElementById('code');
  if (!inp) return;
  const box = inp.closest('.codebox');
  const v = cleanCode(inp.value);
  const focused = document.activeElement === inp;
  box.querySelectorAll('.cells i').forEach((c, i) => {
    c.textContent = v[i] || '';
    c.classList.toggle('cur', focused && i === Math.min(v.length, 3));
  });
  box.classList.toggle('full', v.length === 4);
}

function openHomeLookPicker() {
  const cur = sget('tr-look');
  const cells = PLAYER_LOOKS.map(
    (l) => `<button class='lookbtn' data-act='look' data-v='${l}' aria-pressed='${cur === l}'>${face(l, cur === l ? 'feliz' : 'poker', 'face')}<span>${esc(lookLabel(l))}</span></button>`,
  ).join('');
  openModal(
    `<div class='stack'>
      <div class='row'><h2 class='grow'>${t('Elige tu personaje')}</h2><button class='iconbtn' data-act='close' aria-label='${t('Cerrar')}'>✕</button></div>
      <p class='small muted'>${t('Durante la partida podrás ponerle 8 caras distintas para despistar a los demás. Si al entrar en la sala ya lo tiene otro, te tocará uno distinto.')}</p>
      <div class='lookgrid'>${cells}</div>
    </div>`,
    'homeLook',
  );
}

function renderConnecting() {
  layout(['conn']);
  const late = app.role === 'guest' && Date.now() - app.joinStarted > 5000;
  setHTML(
    sec('conn'),
    `<div class='stack center' style='margin-top:30vh'>
      <div class='spinner'></div>
      <p>${t('Entrando en la sala {code}…', { code: `<b>${esc(app.code)}</b>` })}</p>
      ${late ? `<p class='small muted'>${t('Si tarda, pide al dueño de la sala que vuelva a abrir el juego en su móvil.')}</p>` : ''}
      <button class='linkish' data-act='leave-now'>${t('Cancelar')}</button>
    </div>`,
  );
}

function banner() {
  if (!app.net) return '';
  const now = Date.now();
  if (app.netStatus && app.netStatus !== 'SUBSCRIBED' && now - app.netSince > 2500) return `<div class='banner'>${t('Sin conexión. Reconectando…')}</div>`;
  const v = app.view;
  if (app.role === 'guest' && v && v.paused) {
    const h = v.players.find((p) => p.id === v.hostId);
    return `<div class='banner pause'>${t('Pausa: {name} ha salido del juego. Seguimos en cuanto vuelva.', { name: esc(h ? pn(h) : t('el dueño de la sala')) })}</div>`;
  }
  if (app.role === 'guest' && app.joinedOnce && now - app.lastStateAt > 7000) return `<div class='banner'>${t('No llega nada del dueño de la sala. Esperando a que vuelva…')}</div>`;
  return '';
}

function playerList(v, host) {
  const max = v.mode === 'versus' ? E.MAX_VERSUS : E.MAX_COOP;
  const rows = v.players
    .map((p) => {
      const tags = [p.id === myId ? t('tú') : '', p.id === v.hostId ? t('dueño') : '', p.bot ? 'bot' : ''].filter(Boolean).join(', ');
      const x =
        host && p.id !== myId
          ? p.bot
            ? `<button class='x' data-act='removeBot' data-id='${esc(p.id)}' aria-label='${t('Quitar a {name}', { name: esc(pn(p)) })}'>✕</button>`
            : `<button class='x' data-act='kick' data-id='${esc(p.id)}' aria-label='${t('Sacar a {name}', { name: esc(pn(p)) })}'>✕</button>`
          : '';
      return `<li class='${p.online ? '' : 'off'}'>${face(p.look, faceOf(v, p.id), 'face lface')}<span class='nm'>${esc(pn(p))}${tags ? `<small>(${tags})</small>` : ''}${
        p.online ? '' : `<small>${t('sin conexión')}</small>`
      }</span>${x}</li>`;
    })
    .join('');
  return `<div class='row'><h2 class='grow'>${t('Jugadores')}</h2><span class='muted small'>${t('{n} de {max}', { n: v.players.length, max })}</span></div><ul class='plist'>${rows}</ul>`;
}

function meCard(v) {
  const me = v.players.find((p) => p.id === myId);
  if (!me) return '';
  return `<button class='mecard' data-act='pickLook'>${face(me.look, 'feliz', 'face')}<span class='grow'><small>${t('Tu personaje')}</small><b>${esc(lookLabel(me.look))}</b></span><span class='btn sm'>${t('Cambiar')}</span></button>`;
}

function openLookPicker(first = false) {
  const v = app.view;
  if (!v || v.phase !== 'lobby') return;
  const me = v.players.find((p) => p.id === myId);
  const takenBy = new Map(v.players.filter((p) => !p.bot && p.id !== myId).map((p) => [p.look, p.name]));
  const cells = PLAYER_LOOKS.map((l) => {
    const by = takenBy.get(l);
    const mine = me && me.look === l;
    return `<button class='lookbtn' data-act='look' data-v='${l}' ${by ? 'disabled' : ''} aria-pressed='${mine}'>${face(l, mine ? 'feliz' : 'poker', 'face')}<span>${esc(by ? by : lookLabel(l))}</span></button>`;
  }).join('');
  openModal(`<div class='stack'>
    <div class='row'><h2 class='grow'>${first ? t('¿Quién eres?') : t('Elige tu personaje')}</h2><button class='iconbtn' data-act='${first ? 'keepLook' : 'close'}' aria-label='${t('Cerrar')}'>✕</button></div>
    <p class='small muted'>${t('Durante la partida podrás ponerle 8 caras distintas para despistar a los demás.')}</p>
    <div class='lookgrid'>${cells}</div>
    ${first && me ? `<button class='btn ghost block' data-act='keepLook'>${t('Me quedo con {who}', { who: esc(lookLabel(me.look) || t('este')) })}</button>` : ''}
  </div>`, 'look');
  app.lookFirst = first;
}

function renderLobby(v) {
  layout(['banner', 'lobby']);
  setHTML(sec('banner'), banner());
  const host = v.hostId === myId;
  const url = shareUrl(v.code);
  if (!app.qr || app.qr.url !== url) {
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    app.qr = { url, svg: q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) };
  }
  const hostP = v.players.find((p) => p.id === v.hostId);
  const err = E.canStart({ ...v, players: v.players });
  const modeBtn = (id, emoji, title, desc) =>
    `<button class='mode' data-act='mode' data-v='${id}' aria-pressed='${v.mode === id}' ${host ? '' : 'disabled'}>${ic(emoji, 'ic mode-ic')}<b>${t(title)}</b><span>${t(desc)}</span></button>`;
  const humans = v.players.filter((p) => !p.bot).length;
  const bots = v.players.length - humans;
  let settings = '';
  if (v.mode === 'versus') {
    const laps = v.settings.laps;
    const autoLaps = v.players.length <= 4 ? 2 : 1;
    settings = host
      ? `<div class='setting'><span>${t('Bots que juegan')}</span>
          <div class='row'><button class='iconbtn' data-act='removeBot' ${bots ? '' : 'disabled'} aria-label='${t('Quitar bot')}'>−</button>
          <b class='display' style='min-width:2ch;text-align:center'>${bots}</b>
          <button class='iconbtn' data-act='addBot' ${v.players.length >= E.MAX_VERSUS ? 'disabled' : ''} aria-label='${t('Añadir bot')}'>+</button>
          <span class='small muted grow'>${t('Rellenan la mesa si sois pocos. También farolean.')}</span></div></div>
        <div class='setting'><span>${t('Veces que subasta cada uno')}</span>
          <div class='seg'>${[0, 1, 2]
            .map((n) => `<button data-act='laps' data-v='${n}' aria-pressed='${laps === n}'>${n === 0 ? `${t('Auto')} (${autoLaps})` : n}</button>`)
            .join('')}</div></div>`
      : `<p class='small muted'>${tn(laps || autoLaps, 'Cada uno subasta {n} vez.', 'Cada uno subasta {n} veces.')}</p>`;
  } else {
    const d = v.settings.difficulty;
    settings = host
      ? `<div class='setting'><span>${t('Dificultad')}</span><div class='seg'>${Object.entries(E.DIFFICULTIES)
          .map(([k, x]) => `<button data-act='diff' data-v='${k}' aria-pressed='${d === k}'>${t(x.label)}</button>`)
          .join('')}</div>
          <span class='small muted'>${t(d === 'dificil' ? 'Un objeto de cada trastero queda tapado: nadie lo ve.' : d === 'facil' ? 'Los rivales se cortan más al pujar.' : 'Rivales con ganas de pelea.')} ${t('Cada rival ha visto un objeto que vosotros no sabéis.')}</span></div>
        <div class='rivals-row'>${['tiburon', 'urraca', 'tortuga'].map((l) => `<div>${face(l, 'picaro', 'face lface')}<span>${esc(lookLabel(l))}</span></div>`).join('')}</div>`
      : `<p class='small muted'>${t('Dificultad: {d}.', { d: t(E.DIFFICULTIES[d].label) })}</p>`;
  }
  const html = `
  <div class='row'><button class='iconbtn' data-act='leave' aria-label='${t('Salir de la sala')}'>✕</button><h2 class='grow'>${t('Sala de espera')}</h2><button class='linkish' data-act='help'>${t('Reglas')}</button></div>
  <div class='panel roomcode'>
    <div class='qr' aria-label='${t('Código QR para entrar')}'>${app.qr.svg}</div>
    <div class='stack grow'>
      <div><span class='muted small'>${t('Código de la sala')}</span><div class='code'>${esc(v.code)}</div></div>
      <button class='btn sm' data-act='share'>${t('Invitar amigos')}</button>
    </div>
  </div>
  ${meCard(v)}
  <div class='modes'>
    ${modeBtn('versus', '🔨', 'Competitivo', 'Todos contra todos. Por turnos haces de subastador y puedes ir de farol: decir algo falso para despistar.')}
    ${modeBtn('coop', '🤝', 'Cooperativo', 'En equipo contra 3 rivales. Cada uno ve un objeto distinto y solo vale hacer señales.')}
  </div>
  <div class='panel stack'>${settings}</div>
  ${playerList(v, host)}
  ${
    host
      ? `<div class='startbar'><button class='btn primary block' data-act='start' ${err ? 'disabled' : ''}>${t('Empezar partida')}</button>${err ? `<p class='small muted center'>${esc(t(err))}</p>` : ''}</div>`
      : `<p class='center muted'>${t('Esperando a que {name} empiece la partida…', { name: esc(hostP ? pn(hostP) : t('el dueño de la sala')) })}</p>`
  }
  ${v.mode === 'coop' && humans === 1 ? `<p class='small muted center'>${t('Puedes jugar solo, pero es más divertido con amigos.')}</p>` : ''}`;
  setHTML(sec('lobby'), html);
}

// --- partida ---
function myMoney(v) {
  if (v.mode === 'coop') return v.team ? v.team.money : 0;
  const me = v.players.find((p) => p.id === myId);
  return me ? me.money : 0;
}

function valueTxt(it) {
  if (it.kind === 'misterio') return t('¿?');
  if (it.effect) return '½';
  return it.value < 0 ? signed(it.value) : money(it.value);
}

// Cómo se ve un objeto: la caja fuerte, una vez abierta, enseña lo que había dentro (out: índice; -1 si va cerrada)
function shownAs(id, out) {
  const it = ITEM[id];
  if (it && it.safe && out != null) return out < 0 ? { emoji: '🔐', name: 'Caja fuerte cerrada' } : SAFE_CONTENTS[out];
  return it;
}
function boxHTML(id, { tag = '', mine = false, value = null, delay = null, open = true, out = null } = {}) {
  const it = ITEM[id];
  if (!it || !open) return `<div class='box'><span class='q'>?</span></div>`;
  const sh = shownAs(id, out);
  if (it.safe && out != null && !tag) tag = ic('🔐', 'tagic');
  let val;
  if (value != null) val = value < 0 ? `<span class='val neg'>${signed(value)}</span>` : `<span class='val'>${money(value)}</span>`;
  else val = `<span class='val${it.value < 0 || it.effect ? ' neg' : ''}'>${valueTxt(it)}</span>`;
  const big = value != null && value >= 300 ? ' big' : '';
  const style = delay != null ? ` style='--d:${delay.toFixed(2)}s'` : '';
  const title = it.desc ? ` title='${esc(t(it.desc))}'` : '';
  return `<div class='box open kind-${it.kind}${big}'${style}${title}>${tag ? `<span class='tag${mine ? ' mine' : ''}'>${tag}</span>` : ''}${setBadge(id)}${ic(sh.emoji, 'em')}<span class='nm'>${esc(t(sh.name))}</span>${val}</div>`;
}

// Trastero 2D (respaldo si el móvil no tiene 3D)
function stage2D(v, el) {
  if (!el.querySelector('.shutter')) {
    el.innerHTML = `<div class='shutter'><div class='slats'><span class='stencil'></span></div>
      <div class='unit-inside'><div class='unit-meta'></div><div class='boxes'></div></div></div>`;
  }
  const u = v.unit;
  const sh = el.querySelector('.shutter');
  const open = v.phase === 'reveal';
  const cls = v.phase === 'intro' ? '' : open ? 'up' : 'peek';
  sh.className = 'shutter ' + cls;
  setHTML(el.querySelector('.stencil'), `${t('Nº')} ${v.round}`);
  const inside = el.querySelector('.unit-inside');
  inside.classList.toggle('reveal', open);
  const seen = seenMap(v);
  let boxes = '';
  for (let i = 0; i < u.count; i++) {
    if (open && u.ids) boxes += boxHTML(u.ids[i], { value: u.values[i], delay: landAt(i), out: u.safe ? u.safe[i] : null });
    else if (v.phase === 'intro') boxes += boxHTML(null, { open: false });
    else if (i === u.door) boxes += boxHTML(u.doorId, { tag: ic('🚪', 'tagic') });
    else if (seen.has(i)) boxes += boxHTML(seen.get(i), { tag: ic('👁️', 'tagic'), mine: true });
    else if (u.tarp === i) boxes += `<div class='box tarp'><span class='q'>${t('Tapado')}</span></div>`;
    else boxes += boxHTML(null, { open: false });
  }
  const bx = el.querySelector('.boxes');
  bx.className = `boxes n${u.count}`;
  bx.style.setProperty('--n', u.count);
  setHTML(bx, boxes);
  setHTML(el.querySelector('.unit-meta'), `${metaTag(v)}<span>${seeHint(v)}</span>`);
}

// Cartel del trastero: su tamaño y, al abrir la persiana, el sello de cómo ha acabado la subasta
function metaTag(v) {
  const r = v.phase === 'reveal' && v.results;
  if (r) {
    const txt = !r.winner ? t('Nadie la quiere') : r.free ? t('¡Gratis!') : t('¡Vendido!');
    return `<span class='meta-stamp${txt.length > 10 ? ' long' : ''}'>${txt}</span>`;
  }
  const sp = specialText(v.unit.special);
  return `<span><b>${esc(sizeLabel(v.unit.size))}</b> · ${tn(v.unit.count, '{n} objeto', '{n} objetos')}</span>${sp ? `<span class='sp-tag sp-${v.unit.special}'>${ic(sp.icon)} ${sp.tag}</span>` : ''}`;
}
const seenMap = (v) => new Map((v.priv && v.priv.seen ? v.priv.seen : []).map((x) => [x.i, x.id]));
function seeHint(v) {
  if (!['pitch', 'peek', 'auction'].includes(v.phase)) return '';
  const seen = seenMap(v);
  const door = v.unit.door == null || seen.has(v.unit.door) ? 0 : 1;
  return t('Ves {n} de {total}', { n: seen.size + door, total: v.unit.count });
}
const noteText = (n) =>
  typeof n === 'string'
    ? t(n)
    : n && n.k === 'carcoma' && ITEM[n.item]
      ? t('Las termitas se han comido la mitad de: {item} (−{lost})', { item: t(ITEM[n.item].name), lost: money(n.lost) })
      : n && n.k === 'coleccion' && COLLECTION[n.set]
        ? setNote(n)
        : n && n.k === 'safe' && SAFE_CONTENTS[n.out]
          ? n.value
            ? t('Caja fuerte abierta: {item} ({v})', { item: t(SAFE_CONTENTS[n.out].name), v: money(n.value) })
            : t('Caja fuerte abierta: {item}', { item: t(SAFE_CONTENTS[n.out].name) })
          : n && n.k === 'safeClosed'
            ? t('La caja fuerte va cerrada a tu almacén: allí la abres o la vendes.')
            : n && n.k === 'seguro'
              ? t('Tu seguro cubre {v} de las trampas.', { v: money(n.saved) })
              : n && n.k === 'sinDinero'
              ? n.paid > 0
                ? t('No quedaba dinero para las trampas: solo se pagan {a} de {b}.', { a: money(n.paid), b: money(n.owed) })
                : t('No quedaba dinero para las trampas: no se paga nada de los {b}.', { b: money(n.owed) })
              : '';
// «¡Colección Retro! +200 €» para quien la junta (o una pieza más)
function setNote(n) {
  const v = app.view;
  const c = COLLECTION[n.set];
  const set = `${c.emoji} ${t(c.name)}`;
  const mine = n.who === myId || (n.who === 'team' && v && v.mode === 'coop');
  const who = mine ? '' : v && v.mode === 'coop' ? tname(((v.rivals || []).find((r) => r.id === n.who) || {}).name || '') : pn((v && v.players.find((p) => p.id === n.who)) || { name: '' });
  if (n.n === SET_NEED) return mine ? t('¡Colección {set}! +{v}', { set, v: money(n.bonus) }) : t('{name} junta la colección {set}: +{v}', { name: who, set, v: money(n.bonus) });
  return mine ? t('Una pieza más de {set} ({n}): +{v}', { set, n: n.n, v: money(n.bonus) }) : t('{name} suma otra pieza de {set}: +{v}', { name: who, set, v: money(n.bonus) });
}

// Tus colecciones: cuántas piezas llevas de cada una (al tocarlo, la lista de qué entra en cada una)
function setsOf(v) {
  if (!v) return {};
  if (v.mode === 'coop') return (v.team && v.team.sets) || {};
  const me = v.players.find((p) => p.id === myId);
  return (me && me.sets) || {};
}
// en competitivo y cooperativo solo salen las colecciones de siempre (las del Puerto son de Rey de las subastas)
const GAME_SETS = COLLECTIONS.filter((c) => !c.zone);
function setsRow(v) {
  const has = setsOf(v);
  const chips = GAME_SETS.map((c) => {
    const n = has[c.id] || 0;
    return `<span class='setc${n >= SET_NEED ? ' done' : n ? ' some' : ''}'>${ic(c.emoji)}<b>${n >= SET_NEED ? n + '✓' : n + '/' + SET_NEED}</b></span>`;
  }).join('');
  return `<button class='setsrow' data-act='sets'><span class='setsl'>${v.mode === 'coop' && !v.career ? t('Colecciones del equipo') : t('Tus colecciones')}</span><span class='setcs'>${chips}</span></button>`;
}
const setsSheet = () => {
  const has = setsOf(app.view);
  const own = new Set(
    (app.view ? (app.view.mode === 'coop' ? (app.view.team && app.view.team.items) || [] : ((app.view.players.find((p) => p.id === myId) || {}).items || [])) : []).map((x) => x.id),
  );
  return `<div class='rules'>
  <div class='row'><h2 class='grow'>${t('Colecciones')}</h2><button class='iconbtn' data-act='close' aria-label='${t('Cerrar')}'>✕</button></div>
  <p class='muted small' style='margin-top:6px'>${t('Junta {n} objetos de la misma colección y cobras {v} al momento. Cada pieza más, {x}.', { n: SET_NEED, v: money(SET_BONUS), x: money(SET_EXTRA) })}</p>
  ${GAME_SETS.map(
    (c) => `<h3>${ic(c.emoji)} ${t(c.name)} <small class='muted'>${has[c.id] || 0}/${SET_NEED}</small></h3>
    <p class='setitems'>${c.items.map((id) => `<span class='${own.has(id) ? 'own' : ''}'>${ic(ITEM[id].emoji)} ${esc(t(ITEM[id].name))}</span>`).join('')}</p>`,
  ).join('')}
  <button class='btn primary block' style='margin-top:16px' data-act='close'>${t('Entendido')}</button>
</div>`;
};
// icono de la colección de un objeto (si tiene)
const setBadge = (id) => (SET_OF[id] ? `<i class='setb' title='${esc(t(COLLECTION[SET_OF[id]].name))}'>${ic(COLLECTION[SET_OF[id]].emoji)}</i>` : '');
const sizeLabel = (s) => t(String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1));

// Trastero 3D (Three.js), cargado solo al empezar la partida
const S3 = { state: 'idle', api: null, el: null, doorKey: null, slotKey: null, num: null };
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}
function load3D() {
  if (S3.state !== 'idle') return;
  if (params.get('3d') === '0' || !webglOK()) {
    S3.state = 'failed';
    return;
  }
  S3.state = 'loading';
  S3.el = document.createElement('div');
  S3.el.className = 'stage3d';
  import('./stage3d.js')
    .then((m) => m.createStage3D(S3.el, { base: 'assets/' }))
    .then((api) => {
      S3.api = api;
      S3.state = 'ready';
      S3.doorKey = S3.slotKey = S3.num = null;
      render();
    })
    .catch((e) => {
      console.warn('Trastero 3D no disponible:', e && e.message);
      S3.state = 'failed';
      render();
    });
}
function slotsFor(v) {
  const u = v.unit;
  const seen = seenMap(v);
  const out = [];
  for (let i = 0; i < u.count; i++) {
    if (v.phase === 'reveal' && u.ids) {
      const it = ITEM[u.ids[i]];
      const val = u.values[i];
      out.push({ state: 'open', icon: iconUrl(shownAs(u.ids[i], u.safe ? u.safe[i] : null).emoji), kind: it.kind, label: `<b>${val < 0 ? signed(val) : money(val)}</b>`, tagClass: val >= 300 ? 'val-up' : val < 0 ? 'val-down' : '', delay: landAt(i) });
    } else if (v.phase === 'intro') out.push({ state: 'closed' });
    else if (i === u.door) {
      const it = ITEM[u.doorId];
      out.push({ state: 'door', icon: iconUrl(it.emoji), kind: it.kind, label: `${ic('🚪')} <b>${valueTxt(it)}</b>` });
    } else if (seen.has(i)) {
      const it = ITEM[seen.get(i)];
      out.push({ state: 'mine', icon: iconUrl(it.emoji), kind: it.kind, label: `${ic('👁️')} <b>${valueTxt(it)}</b>`, tagClass: 'mine' });
    } else if (u.tarp === i) out.push({ state: 'tarp', label: t('Tapado') });
    else out.push({ state: 'closed' });
  }
  return out;
}
function update3D(v) {
  const api = S3.api;
  if (S3.num !== v.round) {
    api.setNumber(v.round);
    S3.num = v.round;
  }
  const slots = slotsFor(v);
  const sk = v.round + JSON.stringify(slots);
  if (sk !== S3.slotKey) {
    api.setSlots(slots);
    S3.slotKey = sk;
  }
  const door = v.phase === 'intro' ? 'closed' : v.phase === 'reveal' ? 'up' : 'peek';
  if (door !== S3.doorKey) {
    api.setDoor(door, S3.doorKey == null);
    S3.doorKey = door;
  }
}

function stage(v) {
  const el = sec('stage');
  if (!el.querySelector('.stagewrap')) {
    el.innerHTML = `<div class='stagewrap'><div class='stage2d'></div><div class='stage-meta'></div><div class='auct'></div><div class='spotlight'></div></div>`;
  }
  const wrap = el.querySelector('.stagewrap');
  load3D();
  const use3D = S3.state === 'ready';
  wrap.classList.toggle('is3d', use3D);
  if (use3D) {
    if (S3.el.parentNode !== wrap) {
      wrap.insertBefore(S3.el, wrap.firstChild);
      S3.doorKey = S3.slotKey = S3.num = null;
    }
    update3D(v);
    setHTML(wrap.querySelector('.stage-meta'), `${metaTag(v)}${seeHint(v) ? `<span>${seeHint(v)}</span>` : ''}`);
  } else stage2D(v, wrap.querySelector('.stage2d'));
  // el subastador de medio cuerpo con el mazo, delante de la persiana; su cara cambia con la que ponga.
  // Al abrir la persiana (o si lo pide el jugador) se queda en un retrato pequeño para que se vea todo el trastero.
  const au = auctioneerOf(v);
  const auEl = wrap.querySelector('.auct');
  // en el trastero 2D las cajas ocupan todo el ancho: ahí solo sale de cuerpo entero con la persiana bajada
  const small = app.auctSmall || v.phase === 'reveal' || (!use3D && v.phase !== 'intro');
  if (use3D) S3.api.setInsetLeft(au && !small ? Math.round(wrap.clientHeight * AUCT_INSET) : 0);
  if (au) {
    const meAu = au.id === myId;
    const f = meAu && v.phase === 'pitch' && app.pitchSel ? app.pitchSel.face : v.phase === 'intro' ? 'feliz' : faceOf(v, au.id);
    auEl.classList.toggle('small', small);
    auEl.classList.toggle('fig', !small);
    const label = small ? t('Ver en grande al subastador') : t('Ver en pequeño al subastador');
    setHTML(
      auEl,
      small
        ? `<button class='auct-face' data-act='auctSize' aria-label='${label}'>${face(au.look, f, 'face')}</button><div class='auct-name'>${ic('🔨')}<span>${esc(meAu ? t('Tú') : au.name)}</span></div>`
        : `<button class='auct-face auct-body' data-act='auctSize' aria-label='${label}'><img class='body' src='${auctUrl(au.look, f)}' alt='' draggable='false'></button><div class='auct-name'>${ic('🔨')}<span>${esc(meAu ? t('Tú') : au.name)}</span></div>`,
    );
    auEl.hidden = false;
    // cuando cambia de cara, salta un poco para que se note
    const key = au.id + ':' + f;
    if (app.auctKey && app.auctKey !== key && app.auctKey.split(':')[0] === au.id) {
      const b = auEl.querySelector('.auct-face');
      b.classList.remove('pop');
      void b.offsetWidth;
      b.classList.add('pop');
    }
    app.auctKey = key;
  } else auEl.hidden = true;
}
const AUCT_INSET = 0.72; // hueco a la izquierda para el subastador, en proporción a la altura del trastero

function topbar(v) {
  const showTimer = ['pitch', 'peek', 'auction'].includes(v.phase);
  return `<div class='topbar'>
    <div class='round'>${t('Trastero {n} de {total}', { n: v.round, total: v.totalRounds })}<small>${v.career ? zoneName(v.career.zone) : v.mode === 'coop' ? t('Cooperativo') : t('Competitivo')}</small></div>
    <div class='wallet'><span class='display'>${money(myMoney(v))}</span><small>${v.mode === 'coop' && !v.career ? t('Caja del equipo') : t('Tu dinero')}</small></div>
    <div class='timer' data-timer ${showTimer ? '' : `style='visibility:hidden'`}></div>
    <button class='iconbtn' data-act='menu' aria-label='${t('Menú')}'>⋯</button>
  </div>
  <div class='bar' data-bar><i></i></div>`;
}

// icono sobre la ficha de quien está distraído por un truco (no puede pujar)
function dzIcon(v, id) {
  const a = v.auction;
  if (v.phase !== 'auction' || !a || !a.blocked || !(a.blocked[id] > 0)) return '';
  const kind = (a.blockedBy && a.blockedBy[id]) || (a.trick ? a.trick.id : '');
  return `<span class='dzi ${kind}'${kind === 'movil' ? ` data-say='${t('¿Diga?')}'` : ''}>${ic(E.TRICKS[kind] ? E.TRICKS[kind].emoji : '💤')}</span>`;
}
function people(v) {
  if (v.phase === 'intro') return '';
  if (v.mode === 'coop') return coopPeople(v);
  const a = v.auction;
  const html = v.players
    .map((p) => {
      const lead = a && v.phase === 'auction' && a.leader === p.id;
      const cls = ['pc', p.id === myId ? 'me' : '', lead ? 'lead' : '', p.online ? '' : 'off', dzIcon(v, p.id) ? 'dz' : ''].join(' ');
      const badge = p.id === v.auctioneerId ? `<span class='badge' title='${t('Subastador')}'>${ic('🔨')}</span>` : '';
      const sc = chipValue(v, p.id, p.money, p.worth);
      return `<div class='${cls}' data-pid='${esc(p.id)}' title='${esc(sc.title)}'>${badge}${sc.badge}<div class='av'>${face(p.look, faceOf(v, p.id))}${dzIcon(v, p.id)}</div><div class='nm'>${esc(p.id === myId ? t('Tú') : pn(p))}</div><div class='mn'>${sc.html}</div></div>`;
    })
    .join('');
  return `<div class='people'>${html}</div>`;
}

function coopPeople(v) {
  const a = v.auction;
  const showSignals = ['peek', 'auction'].includes(v.phase);
  const mates = v.players
    .filter((p) => !p.bot)
    .map((p) => {
      const k = showSignals && v.signals && v.signals[p.id];
      const sg = k ? E.SIGNALS.find((x) => x.id === k) : null;
      return `<span class='mate ${p.id === myId ? 'me' : ''} ${p.online ? '' : 'off'}'>${face(p.look, faceOf(v, p.id), 'face mface')}${esc(p.id === myId ? t('Tú') : pn(p))}${sg ? ` ${ic(sg.emoji)}` : ''}</span>`;
    })
    .join('');
  const rivals = (v.rivals || [])
    .map((r) => {
      const lead = a && v.phase === 'auction' && a.leader === r.id;
      const sc = chipValue(v, r.id, r.money, r.worth);
      return `<div class='pc ${lead ? 'lead' : ''}${dzIcon(v, r.id) ? ' dz' : ''}' data-pid='${esc(r.id)}' title='${esc(t(r.style))} · ${esc(sc.title)}'>${sc.badge}<div class='av'>${face(r.look, faceOf(v, r.id))}${dzIcon(v, r.id)}</div><div class='nm'>${esc(tname(r.name))}</div><div class='mn'>${sc.html}</div></div>`;
    })
    .join('');
  const teamLead = a && v.phase === 'auction' && a.leader === 'team';
  const ts = chipValue(v, 'team', v.team ? v.team.money : 0, v.team ? v.team.worth : 0);
  const teamAv = v.career ? face(myLook(), faceOf(v, myId)) : ic('🤝', 'ic team-ic');
  return `<div class='people'><div class='pc ${teamLead ? 'lead' : ''} me' data-pid='team'>${ts.badge}<div class='av'>${teamAv}</div><div class='nm'>${v.career ? t('Tú') : t('Equipo')}</div><div class='mn'>${ts.html}</div></div>${rivals}</div>
    ${v.career ? '' : `<div class='team' aria-label='${t('Tu equipo')}'>${mates}</div>`}`;
}

// Bocadillo del subastador, debajo del trastero: su frase de venta al presentarlo, su farol durante la subasta
// y, cuando se acaba el tiempo, lo que grita para que pujen más.
function sayBubble(v) {
  const au = auctioneerOf(v);
  if (!au) return '';
  const who = au.id === myId ? t('tú') : au.name;
  let quote = '';
  let small = '';
  let cls = '';
  if (v.phase === 'intro') {
    quote = salesLine(au.look, salesIdx(au.look, salesSeed(v)));
    const auct = v.players.find((p) => p.id === v.auctioneerId);
    const meAuct = v.mode === 'versus' && v.auctioneerId === myId;
    small = `<b>${t('Trastero {n}', { n: v.round })}</b> · ${t('{size}, con {n} objetos dentro.', { size: sizeLabel(v.unit.size), n: v.unit.count })} ${
      v.mode === 'versus'
        ? meAuct
          ? t('Te toca subastar. Ahora verás lo que hay dentro.')
          : t('Subasta {name}. Vas a ver en secreto un objeto de dentro.', { name: esc(auct ? pn(auct) : '') })
        : v.career
          ? t('Subasta {name}. Vas a ver en secreto parte de lo que hay dentro.', { name: esc(tname(E.HOUSE.name)) })
          : t('Subasta {name}. Cada uno va a ver un objeto distinto.', { name: esc(tname(E.HOUSE.name)) })
    }`;
    cls = 'intro';
  } else if (v.phase === 'auction' && app.push && app.pushRound === `${v.code}:${v.round}`) {
    quote = app.push.star ? starLine(app.push.look) : pushLine(app.push.look, app.push.i);
    const a = v.auction;
    small = !a || !a.leader
      ? t('Nadie ha pujado todavía')
      : amLeader(v)
        ? t(v.mode === 'coop' && !v.career ? 'Vais ganando con {v}' : 'Vas ganando con {v}', { v: money(a.amount) })
        : t('Va ganando {name} con {v}', { name: esc(tname(a.leaderName)), v: money(a.amount) });
    cls = 'push';
  } else if (v.phase === 'auction' && v.mode === 'versus' && v.pitch) {
    const p = E.PITCHES[v.pitch.phrase];
    quote = `${ic(p.emoji)} ${esc(t(p.text))}`;
    small = t('Lo dice {name}. Salida: {v}', { name: esc(who), v: money(v.pitch.opening) });
    return `<div class='say'><p class='q'>${quote}</p><small>${small}</small></div>`;
  } else return '';
  return `<div class='say ${cls}'><p class='q'>${esc(quote)}</p><small>${small}</small></div>`;
}
function paintSay(v) {
  if (app.screen === 'room' && v && v.phase !== 'lobby' && v.phase !== 'end') setHTML(sec('say'), sayBubble(v));
}

// Presentación del trastero: todos los que pujan, de medio cuerpo, con su dinero
// ---------- trasteros especiales ----------
function specialText(k) {
  if (k === 'misterio') return { icon: '🎲', tag: t('Misterioso'), name: t('Trastero misterioso'), desc: t('Nadie puede mirar dentro, ni el subastador. A ciegas del todo.') };
  if (k === 'relampago') return { icon: '⚡', tag: t('Relámpago'), name: t('Subasta relámpago'), desc: t('Empieza con 6 segundos y cada puja da solo 3. ¡Rápido!') };
  if (k === 'tasador') return { icon: '🔎', tag: t('Pista extra'), name: t('Trastero con pista extra'), desc: t('Paga {v} y mira una caja más (una vez).', { v: money(E.APPRAISE_COST) }) };
  return null;
}
function specialCard(v) {
  const sp = v.unit && specialText(v.unit.special);
  return sp ? `<div class='special sp-${v.unit.special}'>${ic(sp.icon, 'ic sp-ic')}<div><b>${sp.name}</b><span>${sp.desc}</span></div></div>` : '';
}
// botón del tasador: pagar para mirar una caja más
function appraiseBtn(v) {
  const u = v.unit;
  if (!u || u.special !== 'tasador' || !['pitch', 'peek', 'auction'].includes(v.phase)) return '';
  if (v.mode === 'versus' && v.auctioneerId === myId) return '';
  if (!v.priv || v.priv.appraised) return '';
  const seen = new Set((v.priv.seen || []).map((x) => x.i));
  let left = 0;
  for (let i = 0; i < u.count; i++) if (!seen.has(i) && i !== u.door && i !== u.tarp) left++;
  if (!left) return '';
  const funds = v.mode === 'coop' ? (v.team ? v.team.money : 0) : (v.players.find((p) => p.id === myId) || { money: 0 }).money;
  return `<button class='btn appraise' data-act='appraise' ${funds < E.APPRAISE_COST ? 'disabled' : ''}>${ic('🔎')} ${t('Mirar otra caja')} · ${money(E.APPRAISE_COST)}</button>`;
}

// ---------- trucos: se compran en plena subasta para distraer a los rivales ----------
const myKey = (v) => (v.mode === 'coop' ? 'team' : myId);
const TRICK_DESC = {
  movil: () => t('Le suena el móvil a tu rival más peligroso: {n} segundos sin poder pujar.', { n: E.TRICKS.movil.ms / 1000 }),
  famoso: () => t('Pasa un famoso y todos tus rivales se giran a mirar: {n} segundos sin pujar, y más de uno tarda en centrarse.', { n: E.TRICKS.famoso.ms / 1000 }),
  prisa: () => t('Metes prisa al subastador: la cuenta atrás se queda en la mitad. Solo cuando vas ganando.'),
};
// si estoy distraído por un truco: cuál y cuánto me queda
function myDistraction(v) {
  const a = v.auction;
  const key = myKey(v);
  if (!a || !a.blocked || !(a.blocked[key] > 0)) return null;
  const left = app.blockUntil && app.blockUntil[key] ? app.blockUntil[key] - performance.now() : a.blocked[key];
  return left > 0 ? { id: a.blockedBy && a.blockedBy[key] === 'movil' ? 'movil' : 'famoso', rem: left } : null;
}
function tricksRow(v) {
  const a = v.auction;
  if (!a || !v.tricks) return '';
  const key = myKey(v);
  const used = v.tricks.used[key] || {};
  const spare = myMoney(v) - (a.leader === key ? a.amount : 0); // lo ya pujado no se puede gastar en trucos
  const busy = app.trickUntil > performance.now();
  const dz = myDistraction(v);
  const btns = E.TRICK_ORDER.map((id) => {
    const T = E.TRICKS[id];
    const cost = v.tricks.cost[id];
    const off = used[id] || busy || dz || spare < cost || (id === 'prisa' && a.leader !== key);
    return `<button class='trick${used[id] ? ' used' : ''}' data-act='trick' data-v='${id}' aria-label='${t(T.name)}: ${TRICK_DESC[id]()}' ${off ? 'disabled' : ''}>${ic(T.emoji)}<small>${used[id] ? '✓' : money(cost)}</small></button>`;
  }).join('');
  return `<div class='tricks'><button class='trhelp' data-act='trickHelp' aria-label='${t('Qué hacen los trucos')}'><span>${t('Trucos')}</span><i>?</i></button>${btns}</div>`;
}
function tricksHelp(v) {
  const rows = E.TRICK_ORDER.map((id) => `<li>${ic(E.TRICKS[id].emoji)}<span><b>${t(E.TRICKS[id].name)} · ${money(v && v.tricks ? v.tricks.cost[id] : E.TRICKS[id].cost)}</b><small>${TRICK_DESC[id]()}</small></span></li>`).join('');
  return `<div class='stack'><div class='row'><h2 class='grow'>${t('Trucos')}</h2><button class='iconbtn' data-act='close' aria-label='${t('Cerrar')}'>✕</button></div>
    <ul class='trlist'>${rows}</ul>
    <p class='small muted'>${v && v.career ? t('Se pagan al momento con tu dinero. Cada truco, una vez al día.') : t('Se pagan al momento con tu dinero. Cada truco, una vez por partida.')}</p></div>`;
}
// ---------- animaciones de los trucos: ocurren en la misma pantalla de pujas y nunca tapan los botones ----------
// Famoso: cruza andando por delante del trastero (animación con fondo transparente) entre flashes.
// Llamada: un móvil vuela hasta la ficha del rival y se queda sonando. Prisa: tiemblan el subastador y el reloj.
let famosoBlob = null;
let famosoAsked = false;
const FAMOSO_MS = 3100; // lo que dura la animación del famoso
function preloadTrickFx() {
  if (famosoAsked) return;
  famosoAsked = true;
  fetch('assets/anim/truco-famoso.webp')
    .then((r) => (r.ok ? r.blob() : null))
    .then((b) => {
      famosoBlob = b;
      if (!b) famosoAsked = false;
    })
    .catch(() => (famosoAsked = false));
}
// cartel breve sobre el trastero; false si no hay trastero en pantalla
function stageBanner(text) {
  const wrap = root.querySelector('.stagewrap');
  if (!wrap || wrap.offsetParent === null) return false;
  wrap.querySelectorAll('.trbanner').forEach((e) => e.remove());
  const b = document.createElement('div');
  b.className = 'trbanner';
  b.textContent = text;
  wrap.appendChild(b);
  setTimeout(() => b.remove(), 2600);
  return true;
}
const shake = (el, ms = 900, deg = 9) =>
  el && el.animate && el.animate([{ transform: 'rotate(0)' }, { transform: `rotate(-${deg}deg)` }, { transform: `rotate(${deg}deg)` }, { transform: `rotate(-${deg}deg)` }, { transform: `rotate(${deg}deg)` }, { transform: 'rotate(0)' }], { duration: ms / 3, iterations: 3, easing: 'ease-in-out' });
function fxFamoso() {
  const wrap = root.querySelector('.stagewrap');
  if (!wrap) return;
  wrap.querySelectorAll('.trickfx').forEach((e) => e.remove());
  const fx = document.createElement('div');
  fx.className = 'trickfx';
  // flashes de cámara: estrellas blancas con resplandor que saltan por todo el trastero mientras cruza
  // [izquierda %, arriba %, tamaño px, retraso s]
  const spots = [
    [88, 22, 120, 0], [70, 60, 84, 0.22], [34, 20, 76, 0.4], [96, 76, 64, 0.62], [56, 34, 104, 0.85], [16, 58, 80, 1.05],
    [80, 16, 70, 1.3], [44, 66, 92, 1.5], [10, 24, 110, 1.75], [64, 48, 72, 2.0], [28, 40, 96, 2.25], [90, 50, 68, 2.5],
  ];
  fx.innerHTML = `<u></u>` + spots.map(([x, y, sz, d]) => `<i class='flash' style='left:${x}%;top:${y}%;--s:${sz}px;animation-delay:${d}s'><b></b></i>`).join('');
  let url = null;
  if (famosoBlob) {
    url = URL.createObjectURL(famosoBlob); // una URL nueva cada vez: la animación empieza desde el principio
    const img = document.createElement('img');
    img.alt = '';
    img.src = url;
    fx.appendChild(img);
  }
  wrap.appendChild(fx);
  setTimeout(() => {
    fx.remove();
    if (url) URL.revokeObjectURL(url);
  }, FAMOSO_MS);
}
function fxMovil(v, tr) {
  const chip = [...root.querySelectorAll('.pc[data-pid]')].find((e) => e.dataset.pid === tr.targets[0]);
  const to = chip && chip.querySelector('.av');
  if (!to) return;
  const from = (tr.by === myKey(v) && root.querySelector("[data-act='trick'][data-v='movil']")) || root.querySelector('.stagewrap') || to;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'flyphone';
  fly.innerHTML = ic('📱');
  document.body.appendChild(fly);
  const at = (r) => `translate(${r.left + r.width / 2 - 22}px, ${r.top + r.height / 2 - 22}px)`;
  const anim = fly.animate(
    [
      { transform: `${at(a)} scale(0.6) rotate(-30deg)`, opacity: 0.4 },
      { transform: `translate(${(a.left + b.left) / 2 + (a.width + b.width) / 4 - 22}px, ${Math.min(a.top, b.top) - 70}px) scale(1.7) rotate(10deg)`, opacity: 1, offset: 0.55 },
      { transform: `${at(b)} scale(1) rotate(0)`, opacity: 1 },
    ],
    { duration: 520, easing: 'ease-in-out' },
  );
  const done = () => {
    fly.remove();
    shake(to, 900, 7);
  };
  anim.onfinish = done;
  setTimeout(() => fly.isConnected && done(), 700);
}
function fxPrisa() {
  shake(root.querySelector('.stagewrap .auct'), 900, 5);
  const coin = root.querySelector('[data-paddle]');
  shake(coin, 900, 10);
  if (coin && coin.animate) coin.animate([{ filter: 'none' }, { filter: 'hue-rotate(-35deg) saturate(1.8)' }, { filter: 'none' }], { duration: 1100 });
}
// Lanza la animación del truco (tras pintar la pantalla). Devuelve false si no hay trastero donde enseñarla.
function playTrickFx(v, tr, caption) {
  if (!stageBanner(caption)) return false;
  // cuando pasa la famosa, el subastador lo comenta (en su bocadillo y con su voz) y no mete prisa a la vez
  const au = tr.id === 'famoso' && auctioneerOf(v);
  if (au) {
    const now = performance.now();
    const key = `${v.code}:${v.round}`;
    if (app.pushRound !== key) app.pushN = 0;
    app.pushRound = key;
    app.pushAt = now;
    app.push = { look: au.look, star: true, until: now + 3200 };
    say({ look: au.look, key: 'star' }, { delay: 0.35 });
    paintSay(v);
  }
  setTimeout(() => {
    if (tr.id === 'famoso') fxFamoso();
    else if (tr.id === 'movil') fxMovil(v, tr);
    else fxPrisa();
  }, 60);
  return true;
}

// aviso para todos cuando alguien usa un truco
function trickToast(v) {
  const tr = v.auction.trick;
  const key = myKey(v);
  const mine = tr.by === key;
  const hitMe = tr.targets.includes(key);
  const who = mine ? '' : tr.by === 'team' ? t('Vuestro equipo') : tname(tr.byName);
  const names = tr.targets.map((k) => {
    if (k === key) return t('Tú');
    const p = (v.rivals || []).find((r) => r.id === k) || v.players.find((x) => x.id === k);
    return p ? tname(p.name) : '';
  }).filter(Boolean);
  const em = E.TRICKS[tr.id].emoji;
  if (tr.id === 'movil') return hitMe ? `${em} ${t('¡Te suena el móvil!')}` : `${em} ${t('A {name} le suena el móvil', { name: names[0] || '' })}`;
  if (tr.id === 'famoso') return hitMe ? `${em} ${t('¡Pasa un famoso! Te quedas mirando…')}` : mine ? `${em} ${t('¡Pasa un famoso! Tus rivales se despistan')}` : `${em} ${t('¡Pasa un famoso! {name} aprovecha', { name: who })}`;
  return mine ? `${em} ${t('¡Metes prisa! La cuenta atrás, a la mitad')}` : `${em} ${t('{name} mete prisa: ¡la cuenta atrás, a la mitad!', { name: who })}`;
}

function lineup(v) {
  const fig = (look, name, money_, { me = false, auct = false, cls = '' } = {}) =>
    `<div class='lu${me ? ' me' : ''}${cls ? ' ' + cls : ''}'><img src='${lineupUrl(look)}' alt='' draggable='false'><div class='plate'>${auct ? ic('🔨', 'ic lu-g') : ''}<span>${esc(name)}</span>${money_ != null ? `<b>${ic('💵', 'ic mi')}${amount(money_)}</b>` : ''}</div></div>`;
  if (v.mode === 'coop') {
    const mates = v.players.filter((p) => !p.bot);
    const team = mates.map((p) => fig(p.look, p.id === myId ? t('Tú') : pn(p), null, { me: p.id === myId, cls: 'mate' })).join('');
    const rivals = (v.rivals || []).map((r) => fig(r.look, tname(r.name), r.money)).join('');
    return `<div class='lineup coop' style='--n:${mates.length + (v.rivals || []).length};--m:${mates.length}'><div class='lu-team'><div class='lu-row'>${team}</div><div class='plate team'><span>${v.career ? t('Tú') : t('Tu equipo')}</span><b>${ic('💵', 'ic mi')}${amount(v.team ? v.team.money : 0)}</b></div></div><span class='lu-vs'>VS</span>${rivals}</div>`;
  }
  const figs = v.players.map((p) => fig(p.look, p.id === myId ? t('Tú') : pn(p), p.money, { me: p.id === myId, auct: p.id === v.auctioneerId })).join('');
  return `<div class='lineup${v.players.length >= 5 ? ' many' : ''}' style='--n:${v.players.length}'>${figs}</div>`;
}

function faceBar(v) {
  const me = v.players.find((p) => p.id === myId);
  if (!me) return '';
  const meAuct = v.mode === 'versus' && v.auctioneerId === myId;
  const show = v.phase === 'auction' || v.phase === 'peek' || (v.phase === 'pitch' && !meAuct);
  // en cooperativo la cara sirve para hablar con el equipo: sin compañeros no hace falta
  if (!show || (v.mode === 'coop' && v.players.filter((p) => !p.bot).length < 2)) return '';
  const cur = faceOf(v, myId);
  return `<div class='facebar'><span class='fb-label'>${t('Tu cara')}</span><div class='faces'>${FACES.map(
    (f) => `<button class='facebtn' data-act='face' data-v='${f}' aria-pressed='${cur === f}' aria-label='${t(FACE_LABEL[f])}' title='${t(FACE_LABEL[f])}'>${face(me.look, f)}</button>`,
  ).join('')}</div></div>`;
}

function panel(v) {
  const auct = v.players.find((p) => p.id === v.auctioneerId);
  const meAuct = v.mode === 'versus' && v.auctioneerId === myId;
  const u = v.unit;
  switch (v.phase) {
    case 'intro':
      return specialCard(v) + lineup(v) + (v.career ? '' : setsRow(v));
    case 'pitch': {
      if (meAuct) {
        const me = v.players.find((p) => p.id === myId);
        const sel = app.pitchSel || { phrase: null, opening: E.OPENINGS[0], face: 'poker' };
        const ev = (v.priv && v.priv.seen ? v.priv.seen : []).reduce((t, x) => t + itemEV(x.id), 0);
        return `<div class='panel stack'>
          <p class='small muted'>${
            u.special === 'misterio'
              ? `<b style='color:var(--chalk)'>${t('Esta vez ni tú sabes lo que hay dentro.')}</b>`
              : `<b style='color:var(--chalk)'>${t('Solo tú ves lo que hay dentro.')}</b> ${t('Vale unos {v}.', { v: `<b style='color:var(--chalk)'>${money(ev)}</b>` })}`
          } <span class='more'>${t('Cobras la mitad de lo que paguen y, si nadie puja, te lo quedas gratis.')}</span></p>
          <div class='setting'><span>${t('1. Precio de salida')}</span><div class='seg'>${E.OPENINGS.map(
            (o) => `<button data-act='opening' data-v='${o}' aria-pressed='${sel.opening === o}'>${money(o)}</button>`,
          ).join('')}</div></div>
          <div class='setting'><span>${t('2. Pon cara: todos la verán')}</span><div class='faces'>${FACES.map(
            (f) => `<button class='facebtn' data-act='pitchFace' data-v='${f}' aria-pressed='${sel.face === f}' aria-label='${t(FACE_LABEL[f])}' title='${t(FACE_LABEL[f])}'>${face(me.look, f)}</button>`,
          ).join('')}</div></div>
          <div class='setting'><span>${t('3. Di algo para abrir la subasta: verdad o farol')}</span><div class='phrases'>${E.PITCHES.map(
            (p, i) => `<button class='phrase' data-act='phrase' data-v='${i}'>${ic(p.emoji, 'ic pic')}${esc(t(p.text))}</button>`,
          ).join('')}</div></div>
        </div>`;
      }
      return `<div class='panel center stack'>
        <p>${
          u.special === 'misterio'
            ? t('Trastero misterioso: {name} tampoco puede mirar dentro.', { name: `<b>${esc(auct ? pn(auct) : t('El subastador'))}</b>` })
            : t('{name} está mirando dentro del trastero…', { name: `<b>${esc(auct ? pn(auct) : t('El subastador'))}</b>` })
        }</p>
        ${mySeenLine(v)}${appraiseBtn(v)}
        <p class='small muted'>${t('Cada uno ha visto un objeto distinto y nadie sabe cuál ha visto el otro. Fíjate en las caras y pon tú la tuya.')}</p>
      </div>`;
    }
    case 'peek': {
      const mine = v.signals && v.signals[myId];
      const humans = v.players.filter((p) => !p.bot);
      const done = humans.filter((p) => v.signals && v.signals[p.id]).length;
      const solo = humans.length === 1;
      return `<div class='panel stack'>
        <h2>${solo ? t('Mira tu caja') : t('Mira tu caja del trastero')}</h2>
        <p class='small muted'>${
          solo ? t('Solo ves una caja. Elige una señal para acordarte y prepárate para pujar.') : t('No digáis en voz alta qué veis. Elige una señal para tu equipo.')
        }</p>
        <div class='signals'>${E.SIGNALS.map(
          (s) => `<button class='sig' data-act='signal' data-v='${s.id}' aria-pressed='${mine === s.id}'>${ic(s.emoji, 'ic sic')}${esc(t(s.label))}</button>`,
        ).join('')}</div>
        ${appraiseBtn(v)}
        ${solo ? '' : `<p class='small muted center'>${t('{n} de {total} han enviado su señal', { n: done, total: humans.length })}</p>`}
      </div>`;
    }
    case 'auction':
      return auctionPanel(v, auct, meAuct);
    case 'reveal':
      return revealPanel(v, auct);
    default:
      return '';
  }
}

// lo que este jugador ha visto en secreto (solo él lo sabe)
function mySeenLine(v, compact = false) {
  const seen = (v.priv && v.priv.seen ? v.priv.seen : []).filter((x) => x.i !== v.unit.door);
  if (!seen.length) return '';
  const items = seen.map((x) => {
    const it = ITEM[x.id];
    return `${ic(it.emoji)} <b>${esc(t(it.name))}</b>${setBadge(x.id)} <span class='val'>${valueTxt(it)}</span>`;
  });
  return `<p class='myseen${compact ? ' compact' : ''}'>${ic('👁️')} <span>${compact ? t('Viste') : t('Solo tú has visto')}: ${items.join(' · ')}</span></p>`;
}

function leaderFace(v) {
  const a = v.auction;
  if (!a || !a.leader) return '';
  if (a.leader === 'team') return v.career ? face(myLook(), faceOf(v, myId), 'face lface') : `<span class='lface team'>${ic('🤝', 'ic')}</span>`;
  const p = v.players.find((x) => x.id === a.leader) || (v.rivals || []).find((x) => x.id === a.leader);
  return p ? face(p.look, faceOf(v, p.id), 'face lface') : '';
}

function auctionPanel(v, auct, meAuct) {
  const a = v.auction;
  const leaderTxt = a.leader
    ? amLeader(v) && (v.mode === 'versus' || v.career)
      ? `<b>${t('Tú')}</b> ${t('vas ganando')}`
      : `<b>${esc(amLeader(v) ? t('Vuestro equipo') : tname(a.leaderName))}</b> ${t('va ganando')}`
    : t('Nadie ha pujado todavía');
  const hist = a.history
    .slice(1, 4)
    .map((h) => `<li>${esc(tname(h.by ? h.by : h.name))}: ${money(h.amount)}</li>`)
    .join('');
  let buttons;
  if (meAuct) {
    buttons = `<p class='small muted center'>${t('Tú subastas: te llevas la mitad de lo que paguen. Si nadie puja, te lo quedas gratis.')}</p>`;
  } else {
    const funds = myMoney(v);
    const base = a.leader ? a.amount : a.opening;
    const opts = a.leader
      ? [
          [base + 10, '+10'],
          [base + 50, '+50'],
          [base + 100, '+100'],
        ]
      : [
          [base, t('Abrir')],
          [base + 50, '+50'],
          [base + 100, '+100'],
        ];
    const lead = amLeader(v);
    const dz = myDistraction(v); // un rival me ha distraído con un truco: no puedo pujar
    buttons = `<div class='bids${dz ? ' dzd' : ''}'>${opts
      .map(([amt, lbl]) => `<button class='bidbtn' data-act='bid' data-v='${amt}' ${lead || dz || amt > funds ? 'disabled' : ''}><span class='display'>${money(amt)}</span><small>${lbl}</small></button>`)
      .join('')}</div>
      ${dz ? `<p class='dzmsg'>${ic(E.TRICKS[dz.id].emoji)} ${dz.id === 'movil' ? t('¡Te suena el móvil! No puedes pujar hasta que cuelgues.') : t('¡Pasa un famoso! Te has quedado mirando…')}<i style='animation-duration:${Math.round(dz.rem)}ms'></i></p>` : ''}
      <p class='small muted center${!lead && !dz && funds >= (a.leader ? a.amount + 10 : a.opening) ? ' tip' : ''}'${dz || (v.tricks && (lead || funds >= (a.leader ? a.amount + 10 : a.opening))) ? ' hidden' : ''}>${
        lead ? t(v.mode === 'coop' && !v.career ? 'Vais ganando. Que no os la quiten.' : 'Vas ganando. Aguanta.') : funds < (a.leader ? a.amount + 10 : a.opening) ? t('No llegas a esta puja.') : t('Tienes {v}. Cada puja da {n} segundos más.', { v: money(funds), n: v.unit && v.unit.special === 'relampago' ? 3 : 6 })
      }</p>${tricksRow(v)}${appraiseBtn(v)}${v.mode === 'versus' ? mySeenLine(v, true) : ''}`;
  }
  return `<div class='panel stack'>
    <div class='price'><div class='paddle coin' data-paddle><svg class='ring' viewBox='0 0 100 100' aria-hidden='true'><circle class='trk' cx='50' cy='50' r='47'/><circle class='rng' data-ring cx='50' cy='50' r='47' pathLength='100'/></svg><div><span class='display'>${money(a.leader ? a.amount : a.opening)}</span><small>${a.leader ? t('puja') : t('salida')}</small></div></div>
    ${leaderFace(v)}<div class='who'>${leaderTxt}<ul class='history'>${hist}</ul></div></div>
    ${buttons}
  </div>`;
}

// quién celebra el trastero: el jugador o bot que lo gana; en cooperativo, quien hizo la última puja del equipo
function winnerOf(v) {
  const r = v.results;
  if (!r || !r.winner) return null;
  if (v.mode === 'coop') {
    if (r.winner === 'team') {
      const humans = v.players.filter((p) => !p.bot);
      const by = v.auction && v.auction.byPlayer;
      const p = humans.find((x) => x.id === by) || humans.find((x) => x.id === myId) || humans[0];
      return p ? { id: p.id, name: pn(p), look: p.look } : null;
    }
    const rv = (v.rivals || []).find((x) => x.id === r.winner);
    return rv ? { id: rv.id, name: tname(rv.name), look: rv.look } : null;
  }
  const p = v.players.find((x) => x.id === r.winner);
  return p ? { id: p.id, name: pn(p), look: p.look } : null;
}

function revealPanel(v, auct) {
  const r = v.results;
  if (!r) return '';
  const c = revealClock(v);
  const d = (x) => `style='--d:${(c.t0 + x).toFixed(2)}s'`;
  const w = winnerOf(v);
  let line = '';
  let extra = '';
  if (!r.winner) line = t('Nadie ha pujado. Este trastero se queda sin dueño.');
  else if (r.free) line = r.winner === myId ? t('Nadie ha pujado: te lo quedas gratis.') : t('Nadie ha pujado: {name} se lo queda gratis.', { name: esc(w ? w.name : tname(r.winnerName)) });
  else if (v.mode === 'versus' && r.commission)
    extra =
      auct && auct.id === myId
        ? t('Tú cobras {v} de comisión.', { v: money(r.commission) })
        : t('{name} cobra {v} de comisión.', { name: esc(auct ? pn(auct) : t('El subastador')), v: money(r.commission) });
  const notes = r.notes.map((n) => `<p class='note fadein' ${d(0.8)}>${esc(noteText(n))}</p>`).join('');
  const win = w
    ? `<div class='winner' aria-hidden='true'><img src='${winnerUrl(w.look)}' alt=''></div>
       <div class='bubble'>${esc(winLine(w.look, v.round + ':' + r.winner))}<small>${esc(w.id === myId ? t('Tú') : w.name)}</small></div>`
    : '';
  return `<div class='panel result${w ? ' haswin' : ''}'>
    ${win}
    ${line ? `<p class='line fadein' style='--d:0.3s'>${line}</p>` : ''}
    ${r.winner ? ticket(v, r, c, w) : `<p class='small muted fadein' ${d(0.2)}>${t('Dentro había {v}.', { v: amount(r.total) })}</p>`}
    ${extra ? `<p class='note'>${extra}</p>` : ''}
    ${notes}
  </div>`;
}

// La cuenta del que se lo lleva: lo que pagó, lo que va saliendo de dentro (se suma objeto a objeto)
// y, cuando han salido todos, si ha ganado o ha perdido dinero.
function ticket(v, r, c, w) {
  const who = r.winner === 'team' ? (v.career ? 'me' : 'team') : r.winner === myId ? 'me' : 'other';
  const paid = who === 'me' ? t('Pagaste') : who === 'team' ? t('Pagasteis') : t('{name} pagó', { name: esc(w ? w.name : tname(r.winnerName)) });
  const inside = c.done ? r.total : v.unit.values.slice(0, c.landed).reduce((x, y) => x + y, 0);
  const fill = r.price > 0 ? Math.max(0, Math.min(1, inside / r.price)) : 1;
  const ok = inside >= r.price;
  const net = inside - r.price;
  const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'even');
  // última línea: mientras salen los objetos, el saldo en directo; al final, si ha ganado o perdido
  const last = c.done
    ? `<div class='tk-row tk-net done ${tone(r.profit)}'><span>${verdictText(who, r.profit)}</span><b>${signed(r.profit) || money(0)}</b></div>`
    : `<div class='tk-row tk-net ${tone(net)}'><span>${netLabel(who, net)}</span><b>${money(Math.abs(net))}</b></div>`;
  return `<div class='ticket${c.done ? ' done' : ''}'>
    <div class='tk-row'><span>${paid}</span><b>${money(r.price)}</b></div>
    <div class='tk-row'><span>${t('Dentro')}</span><b class='${ok ? 'pos' : 'neg'}'>${amount(inside)}${c.done ? '' : '…'}</b></div>
    ${r.price > 0 ? `<div class='tk-bar${ok ? ' ok' : ''}'><i style='width:${Math.round(fill * 100)}%'></i></div>` : ''}
    ${last}
  </div>`;
}
const amount = (n) => (n < 0 ? signed(n) : money(n));
// mientras salen los objetos: «Ganas 120 €» / «Pierdes 40 €» (o «Gana», «Ganáis»… según de quién sea el trastero)
function netLabel(who, n) {
  const up = n >= 0;
  if (who === 'me') return up ? t('Ganas') : t('Pierdes');
  if (who === 'team') return up ? t('Ganáis') : t('Perdéis');
  return up ? t('Gana') : t('Pierde');
}
function verdictText(who, p) {
  if (p > 0) return t('¡Ganancia!');
  if (p < 0) return t('Pérdida');
  return who === 'me' ? t('Te quedas igual') : who === 'team' ? t('Os quedáis igual') : t('Se queda igual');
}

// Cuánto lleva abierta la persiana: cuántos objetos han caído ya en su caja y si ya se ve la cuenta final
// lo que queda de la fase (ms); en pausa se queda quieto
function leftMs(v) {
  if (v.paused) return v.rem || 0;
  return app.deadline ? Math.max(0, app.deadline - performance.now()) : 0;
}
function revealClock(v) {
  const per = E.REVEAL_PER / SPEED;
  const n = v.unit ? v.unit.count : 0;
  const t0 = 0.6 + n * per;
  const el = v.phase === 'reveal' && v.dur && app.deadline ? (v.dur - leftMs(v)) / 1000 : Infinity;
  let landed = 0;
  while (landed < n && landAt(landed) <= el) landed++;
  return { t0, landed, done: el >= t0 };
}
// Cuánto cambia el total de cada uno con este trastero (se enseña al dar la cuenta, no antes)
function revealDelta(v) {
  const r = v.results;
  const out = {};
  if (!r || !r.winner) return out;
  out[r.winner] = r.profit + (r.bonus || 0);
  if (v.mode === 'versus' && r.commission && v.auctioneerId) out[v.auctioneerId] = (out[v.auctioneerId] || 0) + r.commission;
  return out;
}
// Total de cada uno (dinero + lo que vale lo que tiene) en la fila de abajo; al abrir el trastero
// no cambia hasta que se da la cuenta, y entonces sale lo que ha ganado o perdido.
// Lo que sale bajo cada nombre: mientras se puja, el dinero que tiene para pujar (💵);
// al revelar, el patrimonio (dinero + lo que ha ganado, 🏆), que es lo que decide quién gana.
function chipValue(v, id, cash, worth) {
  if (v.phase === 'reveal') {
    const sc = scoreOf(v, id, worth);
    return { html: `${ic('🏆', 'ic mi')}${amount(sc.shown)}`, badge: sc.badge, title: t('Patrimonio: dinero y objetos') };
  }
  return { html: `${ic('💵', 'ic mi')}${amount(cash)}`, badge: '', title: t('Dinero para pujar') };
}
function scoreOf(v, id, worth) {
  if (v.phase !== 'reveal') return { shown: worth, badge: '' };
  const c = revealClock(v);
  const dl = revealDelta(v)[id] || 0;
  if (!c.done) return { shown: worth - dl, badge: '' };
  return { shown: worth, badge: dl ? `<span class='dl ${dl > 0 ? 'pos' : 'neg'}'>${signed(dl)}</span>` : '' };
}

// ---------- final: podio ----------
// quién queda primero (lo mismo que sale en el podio)
// ---------- compartir el resultado: imagen del podio lista para WhatsApp ----------
const GAME_URL = 'https://gkilian007.github.io/trasteros/';
function shareTexts(v) {
  const f = v.final;
  if (v.mode === 'coop') {
    return f.win
      ? { title: t('¡Hemos ganado!'), text: t('¡Hemos ganado en Trasteros con {n} de 3 estrellas! ¿Os atrevéis?', { n: f.stars }) }
      : { title: t('Nos han ganado'), text: t('Los rivales nos han ganado en Trasteros. ¿Lo hacéis mejor?') };
  }
  const pos = f.ranking.findIndex((r) => r.id === myId);
  const me = f.ranking[pos];
  if (pos === 0) return { title: t('¡He ganado!'), text: t('¡He ganado en Trasteros con {v}! ¿Te atreves?', { v: money(me.worth) }) };
  return {
    title: t('Gana {name}', { name: tname(f.ranking[0].name) }),
    text: pos > 0 ? t('He quedado {n}º en Trasteros con {v}. ¿Me ganas tú?', { n: pos + 1, v: money(me.worth) }) : t('Partida de Trasteros: subastas a ciegas. ¿Te atreves?'),
  };
}
const loadImg = (src) =>
  new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
async function makeShareImage(v) {
  const f = v.final;
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  try {
    await document.fonts.load('80px Bungee');
  } catch (e) {
    /* sin la fuente se usa otra gruesa */
  }
  const display = "'Bungee', 'Arial Black', Impact, sans-serif";
  const body = "800 1em system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  // fondo: noche cálida con foco
  let gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#3a2a36');
  gr.addColorStop(1, '#161d2a');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  gr = g.createRadialGradient(W / 2, 330, 40, W / 2, 330, 620);
  gr.addColorStop(0, 'rgba(255, 214, 140, 0.35)');
  gr.addColorStop(1, 'rgba(255, 214, 140, 0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  // título
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = `110px ${display}`;
  g.lineJoin = 'round';
  g.lineWidth = 14;
  g.strokeStyle = '#3a1d05';
  g.strokeText('TRASTEROS', W / 2, 150);
  g.fillStyle = '#ffc31f';
  g.fillText('TRASTEROS', W / 2, 150);
  g.font = body.replace('1em', '38px');
  g.fillStyle = '#f1ede4';
  g.fillText(t('Subastas a ciegas'), W / 2, 205);
  // podio: los tres primeros con sus personajes
  let entries;
  // quien la recibe no es «tú»: en la imagen va el nombre de cada uno
  if (v.mode === 'versus') entries = f.ranking.map((r) => ({ name: tname(r.name), look: r.look, worth: r.worth, me: r.id === myId }));
  else {
    const humans = v.players.filter((p) => !p.bot);
    const mine = humans.find((p) => p.id === myId) || humans[0];
    entries = [{ name: t('Nuestro equipo'), look: mine ? mine.look : 'ana', worth: f.team, me: true, sad: !f.win }, ...f.rivals.map((r) => ({ name: tname(r.name), look: r.look, worth: r.worth }))].sort(
      (a, b) => b.worth - a.worth,
    );
  }
  const top = entries.slice(0, 3);
  const slots = [
    { x: W / 2, w: 300, h: 210, color: ['#ffd34d', '#e9a800'] },
    { x: W / 2 - 320, w: 280, h: 150, color: ['#e8edf5', '#aab4c4'] },
    { x: W / 2 + 320, w: 280, h: 110, color: ['#e2a26b', '#a8653a'] },
  ];
  const floor = 830;
  const imgs = await Promise.all(top.map((e, i) => loadImg((e.sad || i === 2 ? loserUrl : winnerUrl)(e.look))));
  // primero los de los lados, el ganador delante
  for (const i of [1, 2, 0]) {
    const e = top[i];
    if (!e) continue;
    const sl = slots[i];
    const im = imgs[i];
    const ch = i === 0 ? 440 : 360;
    if (im) {
      const cw = (im.width / im.height) * ch;
      g.drawImage(im, sl.x - cw / 2, floor - sl.h - ch + 18, cw, ch);
    }
    gr = g.createLinearGradient(0, floor - sl.h, 0, floor);
    gr.addColorStop(0, sl.color[0]);
    gr.addColorStop(1, sl.color[1]);
    g.fillStyle = gr;
    rrect(g, sl.x - sl.w / 2, floor - sl.h, sl.w, sl.h, 18);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.font = `${i === 0 ? 120 : 90}px ${display}`;
    g.fillText(String(i + 1), sl.x, floor - sl.h / 2 + (i === 0 ? 45 : 34));
  }
  // titular
  const tx = shareTexts(v);
  g.font = `76px ${display}`;
  g.lineWidth = 12;
  g.strokeStyle = '#3a1d05';
  let title = tx.title.toUpperCase();
  while (g.measureText(title).width > W - 80 && parseInt(g.font, 10) > 40) g.font = `${parseInt(g.font, 10) - 4}px ${display}`;
  g.strokeText(title, W / 2, 935);
  g.fillStyle = '#ffc31f';
  g.fillText(title, W / 2, 935);
  if (v.mode === 'coop') {
    g.font = '56px system-ui, sans-serif';
    g.fillText([1, 2, 3].map((n) => (f.stars >= n ? '★' : '☆')).join(' '), W / 2, 1000);
  }
  // clasificación (solo las filas que caben encima del enlace)
  let y = v.mode === 'coop' ? 1030 : 975;
  const footTop = H - 104;
  const fit = Math.max(1, Math.floor((footTop - 12 - y + 8) / 60));
  // la fila propia (o la del equipo) siempre sale, aunque vaya más abajo
  const list = entries.map((e, k) => ({ ...e, pos: k + 1 })).slice(0, fit);
  const mineK = entries.findIndex((e) => e.me);
  if (mineK >= fit) list[fit - 1] = { ...entries[mineK], pos: mineK + 1 };
  for (let k = 0; k < list.length; k++) {
    const e = list[k];
    g.fillStyle = e.me ? 'rgba(255, 195, 31, 0.18)' : 'rgba(255, 255, 255, 0.06)';
    rrect(g, 110, y, W - 220, 52, 14);
    g.fill();
    g.textAlign = 'left';
    g.fillStyle = '#f1ede4';
    g.font = body.replace('1em', '32px');
    g.fillText(`${e.pos}. ${e.name}`, 140, y + 37);
    g.textAlign = 'right';
    g.fillStyle = '#ffc31f';
    g.font = `32px ${display}`;
    g.fillText(money(e.worth), W - 140, y + 38);
    g.textAlign = 'center';
    y += 60;
  }
  // pie: el enlace
  g.fillStyle = '#ffc31f';
  rrect(g, 140, footTop, W - 280, 76, 38);
  g.fill();
  g.fillStyle = '#1c1306';
  g.font = body.replace('1em', '34px');
  g.fillText(t('¿Te atreves? {url}', { url: GAME_URL.replace('https://', '').replace(/\/$/, '') }), W / 2, footTop + 50);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.88));
}
// se prepara al acabar para que el botón comparta al momento (el móvil exige compartir justo al tocar)
function prepareShare(v) {
  const key = `${v.code}:${v.game}`;
  if (app.shareKey === key) return;
  app.shareKey = key;
  app.shareBlob = null;
  makeShareImage(v).then((b) => app.shareKey === key && (app.shareBlob = b));
}
async function shareResult() {
  const v = app.view;
  if (!v || !v.final) return;
  const blob = app.shareBlob || (await makeShareImage(v));
  const tx = shareTexts(v);
  const file = new File([blob], 'trasteros-resultado.jpg', { type: 'image/jpeg' });
  if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: `${tx.text} ${GAME_URL}` });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  // sin compartir con imagen: se descarga y el texto queda copiado para pegarlo
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'trasteros-resultado.jpg';
  document.body.appendChild(a);
  a.click();
  a.remove();
  try {
    await navigator.clipboard.writeText(`${tx.text} ${GAME_URL}`);
  } catch (e) {
    /* nada */
  }
  toast(t('Imagen guardada. El texto está copiado para pegarlo.'), 3000);
}

function endTop(v) {
  const f = v.final;
  if (!f) return null;
  if (v.mode === 'versus') return f.ranking[0] ? { look: f.ranking[0].look } : null;
  const humans = v.players.filter((p) => !p.bot);
  const mine = humans.find((p) => p.id === myId) || humans[0];
  const best = [...f.rivals].sort((a, b) => b.worth - a.worth)[0];
  if (!best || f.team >= best.worth) return mine ? { look: mine.look } : null;
  return { look: best.look };
}
function endScreen(v) {
  const f = v.final;
  const host = v.hostId === myId;
  const hostP = v.players.find((p) => p.id === v.hostId);
  const share = `<button class='btn block sharebtn' data-act='shareResult'>${ic('📤')} ${t('Compartir resultado')}</button>`;
  const actions = host
    ? `<div class='end-actions'>${share}<div class='row'><button class='btn primary grow' data-act='rematch'>${t('Revancha')}</button><button class='btn' data-act='toLobby'>${t('Cambiar modo')}</button></div></div>`
    : `<div class='end-actions'>${share}<p class='center muted'>${t('Esperando a que {name} elija la siguiente partida…', { name: esc(hostP ? pn(hostP) : t('el dueño de la sala')) })}</p></div>`;
  // quién está en el podio: personas, bots, el equipo o los rivales
  let entries;
  let title;
  let titleCls = '';
  let extra = '';
  if (v.mode === 'versus') {
    entries = f.ranking.map((r) => ({ id: r.id, name: r.id === myId ? t('Tú') : tname(r.name), looks: [r.look], money: r.money, items: r.items, worth: r.worth, me: r.id === myId, look: r.look }));
    title = f.ranking[0].id === myId ? t('¡Has ganado!') : t('Gana {name}', { name: tname(f.ranking[0].name) });
  } else {
    const humans = v.players.filter((p) => !p.bot);
    const mine = humans.find((p) => p.id === myId) || humans[0];
    const team = {
      id: 'team',
      name: t('Vuestro equipo'),
      team: true,
      looks: [mine, ...humans.filter((p) => p !== mine)].filter(Boolean).slice(0, 3).map((p) => p.look),
      look: mine ? mine.look : 'ana',
      money: f.teamMoney != null ? f.teamMoney : f.team,
      items: f.teamItems || 0,
      worth: f.team,
      me: true,
      sad: !f.win,
    };
    entries = [team, ...f.rivals.map((r) => ({ id: r.id, name: tname(r.name), looks: [r.look], look: r.look, money: r.money != null ? r.money : r.worth, items: r.items || 0, worth: r.worth }))].sort((x, y) => y.worth - x.worth);
    title = f.win ? t('¡Habéis ganado!') : t('Os han ganado');
    titleCls = f.win ? '' : ' lost';
    const stars = [1, 2, 3].map((n) => `<span class='${f.stars >= n ? '' : 'off'}'>${ic('⭐', 'ic star')}</span>`).join('');
    extra = `<div class='stars end-stars' aria-label='${t('{n} de 3 estrellas', { n: f.stars })}'>${stars}</div>`;
  }
  const top = entries.slice(0, 3);
  const winner = top[0];
  const line = winLine(winner.look, 'fin:' + v.code + ':' + v.round);
  const art = (e, place) => (e.sad || place === 3 ? loserUrl : winnerUrl);
  const chars = (e, place) =>
    e.looks
      .map((l, k) => `<img class='pc-img${e.looks.length > 1 ? ' grp g' + k : ''}' src='${art(e, place)(l)}' alt=''>`)
      .join('');
  const slot = (e, place) =>
    e
      ? `<div class='pslot p${place}'>
          <div class='pchar${e.looks.length > 1 ? ' n' + e.looks.length : ''}'>${chars(e, place)}</div>
          <div class='pblock'><span class='pnum'>${place}</span>${e.me ? `<span class='pme'>${e.team ? t('Equipo') : t('Tú')}</span>` : ''}</div>
        </div>`
      : `<div class='pslot p${place} empty'></div>`;
  const maxW = Math.max(1, ...entries.map((e) => e.worth));
  const rows = entries
    .map((e, i) => {
      const cash = Math.max(0, e.money);
      const goods = Math.max(0, e.worth - e.money);
      const scale = Math.max(0, e.worth) / maxW;
      const sum = cash + goods || 1;
      const pic = e.team ? `<span class='rteam'>${e.looks.map((l) => face(l, f.win ? 'feliz' : 'triste', 'face')).join('')}</span>` : face(e.look, i === 0 ? 'codicia' : i === entries.length - 1 ? 'triste' : 'feliz', 'face rface');
      return `<li class='${e.me ? 'me' : ''}'>
        <span class='rpos'>${i + 1}</span>${pic}
        <span class='rinfo'><b>${esc(e.name)}</b>
          <span class='rbar' style='--w:${(scale * 100).toFixed(1)}%'><i class='m' style='flex:${(cash / sum).toFixed(3)}'></i><i class='o' style='flex:${(goods / sum).toFixed(3)}'></i></span>
          <small>${money(e.money)} + ${tn(e.items, '{n} objeto', '{n} objetos')}</small></span>
        <span class='rw'>${money(e.worth)}</span>
      </li>`;
    })
    .join('');
  const confetti = Array.from({ length: 22 }, (_, i) => {
    const x = (i * 47) % 100;
    const d = ((i * 37) % 30) / 10;
    const c = ['#ffc31f', '#ffe48a', '#e2412f', '#8cc6ff', '#4fd38e'][i % 5];
    return `<i style='left:${x}%;--d:${d}s;--c:${c};--r:${(i * 53) % 360}deg'></i>`;
  }).join('');
  const coins = Array.from({ length: 5 }, (_, i) => `<img class='coin' src='${iconUrl('🪙')}' alt='' style='left:${8 + i * 21}%;--d:${(i * 0.7).toFixed(1)}s'>`).join('');
  return `<div class='podium-scene${titleCls}' aria-hidden='true'>
      <div class='pod-light'></div>
      <div class='confetti'>${f.win === false ? '' : confetti + coins}</div>
      <div class='pslots'>${slot(top[1], 2)}${slot(top[0], 1)}${slot(top[2], 3)}</div>
      <div class='bubble end-bubble'>${esc(line)}<small>${esc(winner.team ? (winner.looks.length > 1 ? t('Vuestro equipo') : t('Tú')) : winner.name)}</small></div>
    </div>
    <div class='end-title display${titleCls}'>${esc(title)}</div>
    ${extra}
    <ol class='rank${entries.length > 4 ? ' many' : ''}'>${rows}</ol>
    <p class='rank-legend small muted'><i class='m'></i> ${t('dinero')} <i class='o'></i> ${t('objetos')} · ${t('gana quien más vale al final')}</p>
    ${actions}`;
}

// ---------- al abrir la persiana: cada objeto sale en grande y cae en su caja ----------
const LAND = 0.88; // en qué momento del turno de cada objeto aterriza en su caja
const landAt = (i) => 0.6 + (i + LAND) * (E.REVEAL_PER / SPEED);
function spotlight(v) {
  const u = v.unit;
  const per = E.REVEAL_PER / SPEED;
  const round = v.round;
  const still = () => app.view && app.view.phase === 'reveal' && app.view.round === round;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  u.ids.forEach((id, i) => {
    setTimeout(() => {
      const wrap = root.querySelector('.stagewrap');
      if (!still() || !wrap || !document.body.animate) return;
      let layer = wrap.querySelector('.spotlight');
      if (!layer) {
        layer = document.createElement('div');
        layer.className = 'spotlight';
        wrap.appendChild(layer);
      }
      const it = ITEM[id];
      const val = u.values[i];
      const cls = val < 0 ? 'neg' : val >= 300 ? 'big' : '';
      const out = it.safe && u.safe ? u.safe[i] : null;
      const opening = out != null && out >= 0; // caja fuerte: primero sale cerrada, tiembla y se abre
      const name = out === -1 ? t('Caja fuerte cerrada') : t(it.name);
      const card = document.createElement('div');
      card.className = `spot kind-${it.kind}${opening ? ' safe' : ''}`;
      card.innerHTML = `<div class='spot-glow'></div><div class='spot-pic'><img src='${iconUrl(it.emoji)}' alt=''></div><b>${esc(name)}</b><span class='spot-v ${opening ? '' : cls}'>${opening ? t('¿?') : val < 0 ? signed(val) : money(val)}</span>${SET_OF[id] ? `<span class='spot-set'>${ic(COLLECTION[SET_OF[id]].emoji)} ${esc(t(COLLECTION[SET_OF[id]].name))}</span>` : ''}`;
      layer.appendChild(card);
      if (opening)
        setTimeout(() => {
          if (!card.isConnected) return;
          const c = SAFE_CONTENTS[out];
          const img = card.querySelector('.spot-pic img');
          img.src = iconUrl(c.emoji);
          card.querySelector('b').textContent = t(c.name);
          const sv = card.querySelector('.spot-v');
          sv.className = `spot-v ${cls}`;
          sv.textContent = money(val);
          card.classList.remove('anim');
          card.classList.add('opened');
          if (val >= 250) sfx.special();
        }, per * 1000 * 0.34);
      // la animación del objeto sustituye al icono en cuanto está descargada
      preloadAnim(id).then((blob) => {
        if (!blob || !card.isConnected || card.classList.contains('opened')) return;
        const img = card.querySelector('.spot-pic img');
        const url = URL.createObjectURL(blob);
        img.onload = () => card.classList.add('anim');
        img.src = url;
        card._url = url;
      });
      wrap.classList.add('spotting');
      const ms = per * 1000;
      const fd = Math.min(360, ms * 0.24); // lo que tarda en volar a su caja
      const C = 'translate(-50%, -50%)';
      card.animate(
        [
          { transform: `${C} scale(0.2)`, opacity: 0 },
          { transform: `${C} scale(1.1)`, opacity: 1, offset: 0.6 },
          { transform: `${C} scale(1)`, opacity: 1 },
        ],
        { duration: Math.min(380, ms * 0.3), easing: 'cubic-bezier(.2,.8,.3,1.2)', fill: 'both' },
      );
      setTimeout(() => {
        // vuela hasta su caja
        const slots = wrap.classList.contains('is3d') ? wrap.querySelectorAll('.stage3d-tag') : wrap.querySelectorAll('.boxes .box');
        const t = slots[i];
        const a = card.getBoundingClientRect();
        let dx = 0;
        let dy = 60;
        if (t) {
          const b = t.getBoundingClientRect();
          dx = b.left + b.width / 2 - (a.left + a.width / 2);
          dy = b.top - (wrap.classList.contains('is3d') ? 30 : -b.height / 2) - (a.top + a.height / 2);
        }
        const fly = card.animate(
          [
            { transform: `${C} scale(1)`, opacity: 1 },
            { transform: `translate(calc(-50% + ${dx.toFixed(0)}px), calc(-50% + ${dy.toFixed(0)}px)) scale(0.28)`, opacity: reduce ? 0 : 0.85 },
          ],
          { duration: fd, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
        );
        const done = () => {
          card.remove();
          if (card._url) URL.revokeObjectURL(card._url);
          if (!layer.querySelector('.spot')) wrap.classList.remove('spotting');
        };
        fly.onfinish = done;
        fly.oncancel = done;
      }, ms * LAND - fd);
    }, (0.6 + i * per) * 1000);
  });
}

// billetes que vuelan hasta el subastador en cada puja
function flyBills(info) {
  try {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const target = root.querySelector('.auct-face');
    if (!target || !document.body.animate) return;
    const src = root.querySelector(`[data-pid='${CSS.escape(info.key)}']`) || root.querySelector('.bids') || root.querySelector('[data-paddle]');
    if (!src) return;
    const a = src.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const n = Math.min(6, 2 + Math.round(info.amount / 150));
    const url = iconUrl(getLang() === 'en' ? '💵' : '💶');
    for (let i = 0; i < n; i++) {
      const img = new Image();
      img.src = url;
      img.className = 'bill';
      img.alt = '';
      document.body.appendChild(img);
      const x0 = a.left + a.width / 2 + (Math.random() - 0.5) * a.width * 0.5;
      const y0 = a.top + a.height / 2;
      const x1 = b.left + b.width / 2 + (Math.random() - 0.5) * 20;
      const y1 = b.top + b.height * 0.62;
      const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 90;
      const my = Math.min(y0, y1) - 50 - Math.random() * 70;
      const r = (Math.random() * 2 - 1) * 220;
      const anim = img.animate(
        [
          { transform: `translate(${x0}px, ${y0}px) translate(-50%, -50%) rotate(0deg) scale(0.5)`, opacity: 0 },
          { transform: `translate(${mx}px, ${my}px) translate(-50%, -50%) rotate(${r / 2}deg) scale(1.15)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${x1}px, ${y1}px) translate(-50%, -50%) rotate(${r}deg) scale(0.55)`, opacity: 0.85 },
        ],
        { duration: 640 + i * 50, delay: i * 70, easing: 'cubic-bezier(.25,.7,.35,1)', fill: 'both' },
      );
      const done = () => img.remove();
      anim.onfinish = done;
      anim.oncancel = done;
    }
    setTimeout(() => {
      target.classList.remove('gotcash');
      void target.offsetWidth;
      target.classList.add('gotcash');
      sfx.cash();
    }, 620);
  } catch (e) {
    console.warn('billetes:', e && e.message); // la animación es decorativa
  }
}

function renderGame(v) {
  if (v.phase === 'end' && v.career) {
    layout(['end']);
    setHTML(sec('end'), careerEnd(v));
    return;
  }
  if (v.phase === 'end') {
    layout(['banner', 'end']);
    setHTML(sec('banner'), banner());
    setHTML(sec('end'), `<div class='endwrap'><div class='row'><h2 class='grow'>${t('Fin de la partida')}</h2><button class='iconbtn' data-act='menu' aria-label='${t('Menú')}'>⋯</button></div>${endScreen(v)}</div>`);
    return;
  }
  layout(['top', 'banner', 'stage', 'say', 'panel', 'facebar', 'people']);
  setHTML(sec('top'), topbar(v));
  setHTML(sec('banner'), banner());
  stage(v);
  setHTML(sec('say'), sayBubble(v));
  setHTML(sec('panel'), panel(v));
  setHTML(sec('facebar'), faceBar(v));
  setHTML(sec('people'), people(v));
  if (app.bumpPaddle) {
    app.bumpPaddle = false;
    const p = root.querySelector('[data-paddle]');
    if (p) {
      p.classList.remove('bump');
      void p.offsetWidth;
      p.classList.add('bump');
    }
  }
  if (app.pendingBills) {
    const info = app.pendingBills;
    app.pendingBills = null;
    flyBills(info);
  }
  frame(true);
  paintTip();
}

// reloj visual
const TENSE_MS = 5000; // últimos segundos de la subasta con tensión
function frame(once) {
  const v = app.view;
  if (v && app.screen === 'room' && v.phase !== 'lobby' && v.phase !== 'end') {
    const tEl = root.querySelector('[data-timer]');
    const bEl = root.querySelector('[data-bar]');
    if (v.rem != null && app.deadline) {
      const left = leftMs(v);
      const secs = Math.ceil(left / 1000);
      const hot = (v.phase === 'auction' && left < 3000) || (v.phase !== 'auction' && left < 4000 && ['pitch', 'peek'].includes(v.phase));
      if (tEl) {
        const txt = String(secs);
        if (tEl.textContent !== txt) tEl.textContent = txt;
        tEl.classList.toggle('hot', hot);
      }
      if (bEl) {
        const scale = v.dur ? Math.min(1, left / v.dur) : 0;
        bEl.firstChild.style.transform = `scaleX(${scale.toFixed(3)})`;
        bEl.classList.toggle('hot', hot);
      }
      const ring = v.phase === 'auction' && root.querySelector('[data-ring]');
      if (ring) {
        const scale = v.dur ? Math.min(1, left / v.dur) : 0;
        ring.style.strokeDashoffset = (100 - scale * 100).toFixed(1);
        ring.classList.toggle('hot', hot);
      }
      if (v.phase === 'auction') maybePush(v, left);
      if (v.phase === 'reveal' && v.results) {
        const c = revealClock(v);
        const key = `${v.round}:${c.landed}:${c.done}`;
        if (key !== app.revealKey) {
          app.revealKey = key;
          setHTML(sec('panel'), panel(v));
          setHTML(sec('people'), people(v));
          paintTip();
        }
      }
      // últimos 5 s de la subasta: tic-tac y la música se acelera (si alguien puja, vuelve a 6 s y se relaja)
      if (v.phase === 'auction' && !v.paused && secs <= 5 && secs > 0 && secs !== app.lastTickSec) {
        app.lastTickSec = secs;
        sfx.clock(secs);
      }
      if (secs > 5) app.lastTickSec = null;
      setTension(v.phase === 'auction' && !v.paused ? (TENSE_MS - left) / TENSE_MS : 0);
    } else if (bEl) bEl.firstChild.style.transform = 'scaleX(0)';
  }
  // el grito del subastador se quita solo al rato
  if (app.push && performance.now() > app.push.until) {
    app.push = null;
    paintSay(app.view);
  }
  if (!once) requestAnimationFrame(() => frame(false));
}

// ---------- modales ----------
function openModal(html, kind = null) {
  const sheet = modalEl.querySelector('.sheet');
  if (kind && !modalEl.hidden && sheet && app.modalKind === kind) setHTML(sheet, html);
  else {
    modalEl.innerHTML = `<div class='sheet' role='dialog' aria-modal='true'>${html}</div>`;
    modalEl.querySelector('.sheet')._html = html;
  }
  app.modalKind = kind;
  modalEl.hidden = false;
}
function closeModal() {
  modalEl.hidden = true;
  modalEl.innerHTML = '';
  app.modalKind = null;
  paintTip();
}
modalEl.addEventListener('click', (e) => {
  if (e.target === modalEl) closeModal();
});

const rules = () => `
<div class='rules'>
  <div class='row'><h2 class='grow'>${t('Cómo se juega')}</h2><button class='iconbtn' data-act='close' aria-label='${t('Cerrar')}'>✕</button></div>
  <p class='muted small' style='margin-top:6px'>${t('Uno crea la sala y los demás entran con el código o el QR. Cada uno juega desde su móvil.')}</p>
  <h3>${ic('🔨')} ${t('Competitivo (3 a 7, con bots si faltáis)')}</h3>
  <ul>
    <li>${t('Todos empezáis con {v}. Por turnos, uno hace de subastador.', { v: money(1000) })}</li>
    <li>${t('El subastador mira dentro del trastero en su móvil y suelta una frase: puede ser verdad o un farol (algo falso para despistar). También pone el precio de salida.')}</li>
    <li>${t('Cada uno de los demás ve en secreto un solo objeto, distinto al de los otros: nadie sabe lo que ha visto el de al lado. Usa lo que sabes, fíjate en las caras y pujad en directo: cada puja da 6 segundos más y gana la más alta.')}</li>
    <li>${t('El subastador cobra la mitad de lo que se pague. Si nadie puja, se queda el trastero gratis.')}</li>
    <li>${t('Gana quien acabe valiendo más: dinero más objetos.')}</li>
    <li>${t('Pon cara: en cualquier momento puedes cambiar la expresión de tu personaje. Todos la ven, y los bots también farolean.')}</li>
  </ul>
  <h3>${ic('🤝')} ${t('Cooperativo (1 a 5)')}</h3>
  <ul>
    <li>${t('Jugáis en equipo con una caja común de {v} contra tres rivales: el Tiburón, la Urraca y la Tortuga.', { v: money(1500) })}</li>
    <li>${t('En cada trastero, cada uno ve en secreto un objeto distinto. Regla de oro: no digáis qué veis. Solo vale mandar una señal.')}</li>
    <li>${t('Pujad juntos con el dinero del equipo. Cada rival ha visto en secreto un objeto distinto y puja según lo que ha visto; además, el Tiburón se fija en cómo pujáis: si os lanzáis, sospecha.')}</li>
    <li>${t('Son 6 trasteros. Ganáis si acabáis con más que cada rival. Las estrellas premian cuánto valéis.')}</li>
  </ul>
  <h3>${ic('💎')} ${t('Colecciones')}</h3>
  <ul>
    <li>${t('Hay cinco colecciones: lujo, arte y música, retro, aventura y hogar. Junta {n} objetos de la misma y cobras {v} al momento; cada pieza más, {x}.', { n: SET_NEED, v: money(SET_BONUS), x: money(SET_EXTRA) })}</li>
  </ul>
  <h3>${ic('📱')} ${t('Trucos')}</h3>
  <ul>
    <li>${t('En plena subasta puedes pagar un truco para distraer a tus rivales. Cada uno se usa una vez por partida.')}</li>
    ${E.TRICK_ORDER.map((id) => `<li><b>${t(E.TRICKS[id].name)} (${money(E.TRICKS[id].cost)})</b>: ${TRICK_DESC[id]()}</li>`).join('')}
  </ul>
  <h3>${ic('🏆')} ${t('Rey de las subastas (tú solo)')}</h3>
  <ul>
    <li>${t('Empiezas con {v} y cada día pujas por {n} trasteros contra los rivales. Lo que ganas va a tu almacén y lo vendes cuando quieras.', { v: money(C.START_MONEY), n: E.ZONES.barrio.rounds })}</li>
    <li>${t('Cada día da reputación: al subir de nivel abres zonas con trasteros más grandes y rivales más duros, y puedes comprar mejoras.')}</li>
    <li>${t('Aquí las colecciones no se cobran en la subasta: guarda las piezas y vende la colección entera en el almacén, un {p} % más cara.', { p: Math.round(C.SET_SALE_BONUS * 100) })}</li>
  </ul>
  <h3>${ic('⚡')} ${t('Trasteros especiales')}</h3>
  <ul>
    <li>${ic('🎲')} ${t('Misterioso: nadie mira dentro, ni el subastador.')}</li>
    <li>${ic('⚡')} ${t('Relámpago: empieza con 6 segundos y cada puja da solo 3.')}</li>
    <li>${ic('🔎')} ${t('Pista extra: paga {v} y mira una caja más (una vez).', { v: money(E.APPRAISE_COST) })}</li>
  </ul>
  <h3>${t('Qué puede haber dentro')}</h3>
  <ul>
    <li>${ic('⭐')} ${t('Tesoros que valen mucho y {icon} cosas normales.', { icon: ic('📦') })}</li>
    <li>${ic('🧦')} ${t('Basura que no vale nada.')}</li>
    <li>${ic('☣️')} ${t('Trampas: cuestan dinero, como un bidón tóxico o una multa.')} ${ic('🐛')} ${t('Las termitas estropean lo mejor.')}</li>
    <li>${ic('🔐')} ${t('Misterios: una caja fuerte, un cuadro dudoso o un boleto. Se decide al abrir.')}</li>
  </ul>
  <button class='btn primary block' style='margin-top:16px' data-act='close'>${t('Entendido')}</button>
  ${LEGAL_LINK()}
</div>`;

function openMenu() {
  const inGame = app.view && !['lobby', 'end'].includes(app.view.phase);
  openModal(`<div class='stack'>
    <div class='row'><h2 class='grow'>${app.state && app.state.career ? `${t('Rey de las subastas')} · ${zoneName(app.state.career.zone)}` : t('Sala {code}', { code: esc(app.code) })}</h2><button class='iconbtn' data-act='close' aria-label='${t('Cerrar')}'>✕</button></div>
    <button class='btn block' data-act='help'>${t('Cómo se juega')}</button>
    <button class='btn block' data-act='stats'>${ic('🏆')} ${t('Tus récords')}</button>
    <button class='btn block' data-act='tipsAgain'>${t('Ver los consejos otra vez')}</button>
    ${app.state && app.state.career ? '' : `<button class='btn block' data-act='share'>${t('Invitar a la sala')}</button>`}
    <button class='btn block' data-act='mute'>${isMuted() ? t('Activar sonido') : t('Silenciar sonido')}</button>
    <button class='btn block' data-act='music' aria-pressed='${musicOn()}'>${musicOn() ? t('Quitar la música') : t('Poner la música')}</button>
    <div class='langsw wide' role='group' aria-label='${t('Idioma')}'>${['es', 'en'].map((l) => `<button data-act='lang' data-v='${l}' aria-pressed='${getLang() === l}'>${l === 'es' ? 'Español' : 'English'}</button>`).join('')}</div>
    <button class='btn ghost block' data-act='leave'>${app.state && app.state.career ? t('Dejar el día') : app.role === 'host' ? t('Cerrar la sala') : t('Salir de la sala')}</button>
    ${inGame && app.role === 'host' && !(app.state && app.state.career) ? `<p class='small muted'>${t('Si cierras la sala, la partida se acaba para todos.')}</p>` : ''}
  </div>`);
}

function confirmLeave() {
  const v = app.view;
  const inGame = v && !['lobby', 'end'].includes(v.phase);
  if (app.state && app.state.career) {
    if (!inGame) return handle('careerQuit', document.body);
    openModal(`<div class='stack'>
      <h2>${t('¿Dejar el día a medias?')}</h2>
      <p class='muted'>${t('Lo que ya hayas comprado va al almacén y el dinero gastado no vuelve. Los trasteros que faltan se pierden.')}</p>
      <div class='row'><button class='btn grow' data-act='close'>${t('Seguir jugando')}</button><button class='btn primary grow' data-act='careerQuit'>${t('Dejar el día')}</button></div>
    </div>`);
    return;
  }
  if (!inGame && app.role !== 'host') return leaveRoom();
  openModal(`<div class='stack'>
    <h2>${app.role === 'host' ? t('¿Cerrar la sala?') : t('¿Salir de la partida?')}</h2>
    <p class='muted'>${app.role === 'host' ? t('Eres el dueño de la sala: se cierra para todos.') : t('Podrás volver mientras siga la partida.')}</p>
    <div class='row'><button class='btn grow' data-act='close'>${t('Seguir jugando')}</button><button class='btn primary grow' data-act='leave-now'>${app.role === 'host' ? t('Cerrar sala') : t('Salir')}</button></div>
  </div>`);
}

async function share() {
  const url = shareUrl(app.code);
  const text = t('Únete a mi partida de Trasteros. Código: {code}', { code: app.code });
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Trasteros', text, url });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(t('Enlace copiado. Pégalo en el chat del grupo.'));
  } catch (e) {
    toast(t('Diles este código: {code}', { code: app.code }));
  }
}

// ---------- eventos ----------
function readName() {
  const el = document.getElementById('name');
  const n = (el ? el.value : sget('tr-name', '')).trim().slice(0, 14);
  if (!n) {
    if (el) el.focus();
    toast(t('Escribe tu nombre primero.'));
    return null;
  }
  sset('tr-name', n);
  return n;
}

function handle(act, el) {
  unlockAudio();
  const val = el.dataset.v;
  switch (act) {
    case 'create': {
      const name = readName();
      if (!name) return;
      app.homeMsg = null;
      const state = E.createRoom({ code: genCode(), hostId: myId, hostName: name, seed: crypto.getRandomValues(new Uint32Array(1))[0], now: Date.now(), speed: SPEED });
      startHosting(state);
      return;
    }
    case 'career':
      app.homeMsg = null;
      app.screen = 'career';
      app.ctab = 'hub';
      render();
      return;
    case 'careerHome':
      app.screen = 'home';
      render();
      return;
    case 'ctab':
      app.ctab = val || 'hub';
      render();
      window.scrollTo(0, 0);
      return;
    case 'careerZone': {
      const st = C.load();
      const zs = C.zoneState(st, val);
      if (zs.open) {
        st.zone = val;
        C.save(st);
      } else if (zs.soon) toast(t('La zona {zone} llega pronto.', { zone: zoneName(val) }));
      else if (zs.locked) toast(t('Necesitas nivel {n} para abrir la zona {zone}.', { n: zs.level, zone: zoneName(val) }));
      else if (!zs.afford) toast(t('Te faltan {v} para abrir la zona {zone}.', { v: money(zs.price - st.money), zone: zoneName(val) }));
      else {
        const left = st.money - zs.price;
        openModal(`<div class='stack'>
          <h2>${t('¿Abrir la zona {zone}?', { zone: zoneName(val) })}</h2>
          <img class='zconfirm' src='assets/zones/${val}.webp' alt=''>
          <p class='muted'>${t('Cuesta {v} y es para siempre. Te quedarán {left} para pujar.', { v: money(zs.price), left: money(left) })}</p>
          ${left < 500 ? `<p class='small warnline'>${t('Ojo: con tan poco dinero te costará ganar subastas. Puedes vender antes lo del almacén.')}</p>` : ''}
          <div class='row'><button class='btn grow' data-act='close'>${t('Ahora no')}</button><button class='btn primary grow' data-act='careerUnlock' data-v='${val}'>${t('Abrir')}</button></div>
        </div>`);
        return;
      }
      render();
      return;
    }
    case 'careerUnlock': {
      const st = C.load();
      if (C.unlockZone(st, val)) {
        C.save(st);
        sfx.gain();
        toast(t('¡Zona {zone} abierta!', { zone: zoneName(val) }));
      }
      closeModal();
      render();
      return;
    }
    case 'careerSell': {
      // lo valioso se regatea con un comprador; lo demás se vende sin más
      const st = C.load();
      const it = st.items.find((o) => o.k === Number(val));
      if (it && C.canHaggle(st, it)) {
        const looks = PLAYER_LOOKS.filter((l) => l !== myLook());
        app.haggle = { ...C.haggleStart(st, it), look: looks[Math.floor(Math.random() * looks.length)], face: 'poker', said: 'offer', price: null, end: null };
        paintHaggle();
        return;
      }
    }
    // falls through
    case 'careerSellLoose':
    case 'careerSellSet': {
      const st = C.load();
      const got = act === 'careerSell' ? C.sell(st, Number(val)) : act === 'careerSellLoose' ? C.sellLoose(st) : C.sellSet(st, val);
      if (got) {
        C.save(st);
        sfx.cash();
        toast(t('Vendido: +{v}', { v: money(got) }), 1400);
      }
      render();
      return;
    }
    case 'hgYes':
    case 'hgAsk':
    case 'hgNo': {
      const h = app.haggle;
      if (!h || h.end) return closeModal();
      const st = C.load();
      if (act === 'hgNo') {
        app.haggle = null;
        closeModal();
        return;
      }
      if (act === 'hgYes') {
        C.sellAt(st, h.k, h.offer);
        Object.assign(h, { end: 'sold', price: h.offer, face: 'feliz', said: 'deal' });
      } else {
        const r = C.haggleTry(st, h);
        if (r.kind === 'yes') {
          C.sellAt(st, h.k, r.price);
          Object.assign(h, { end: 'sold', price: r.price, face: 'feliz', said: 'deal' });
        } else if (r.kind === 'meet') Object.assign(h, { face: 'picaro', said: 'meet' });
        else Object.assign(h, { end: 'leave', face: 'enfado', said: 'leave' });
      }
      C.save(st);
      if (h.end === 'sold') sfx.cash();
      else if (h.end === 'leave') sfx.lose();
      paintHaggle();
      render();
      return;
    }
    case 'careerSafe': {
      const st = C.load();
      const r = C.openSafe(st, Number(val));
      if (!r) {
        toast(t('No te llega para el cerrajero.'));
        return;
      }
      C.save(st);
      render();
      const c = SAFE_CONTENTS[r.out];
      openModal(`<div class='stack safeopen'>
        <div class='so-pic'>${ic('🔐', 'ic')}</div>
        <h2 class='display so-t'>${t('El cerrajero está abriendo la caja…')}</h2>
        <p class='so-v'>&nbsp;</p>
        <button class='btn primary block so-ok' data-act='close' style='visibility:hidden'>${t('Vale')}</button>
      </div>`);
      setTimeout(() => {
        const m = document.querySelector('.safeopen');
        if (!m) return;
        const pic = m.querySelector('.so-pic');
        pic.innerHTML = ic(c.emoji, 'ic');
        pic.classList.add('opened');
        m.querySelector('.so-t').textContent = r.value ? t('¡{item}!', { item: t(c.name) }) : t('¡Vacía!');
        const sv = m.querySelector('.so-v');
        sv.innerHTML = r.value >= 250 ? `<b class='pos display'>${money(r.value)}</b>` : r.value ? `<b>${money(r.value)}</b>` : esc(t('Mala suerte: no había nada.'));
        m.querySelector('.so-ok').style.visibility = '';
        if (r.value >= 250) sfx.win();
        else sfx.lose();
      }, 1500);
      return;
    }
    case 'careerUp': {
      const st = C.load();
      if (C.buyUpgrade(st, val)) {
        C.save(st);
        sfx.gain();
        toast(t('Mejora comprada: {name}.', { name: t(C.UPGRADES[val].name) }));
      }
      render();
      return;
    }
    case 'careerHelp': {
      const st = C.load();
      if (C.help(st)) C.save(st);
      render();
      return;
    }
    case 'careerReset':
      openModal(`<div class='stack'>
        <h2>${t('¿Empezar de cero?')}</h2>
        <p class='muted'>${t('Pierdes el dinero, el nivel, las zonas, las mejoras y lo que hay en el almacén. No se puede deshacer.')}</p>
        <div class='row'><button class='btn grow' data-act='close'>${t('Cancelar')}</button><button class='btn primary grow' data-act='careerResetNow'>${t('Empezar de cero')}</button></div>
      </div>`);
      return;
    case 'careerResetNow':
      C.reset();
      closeModal();
      app.ctab = 'hub';
      render();
      return;
    case 'careerGo':
      startCareerDay();
      return;
    case 'careerBack':
      if (app.view && app.view.final) careerCommit(app.view.final, careerKey(app.view));
      leaveRoom(null, { notify: false, to: 'career' });
      return;
    case 'careerQuit':
      // dejar el día a medias: lo comprado y lo gastado cuentan, los trasteros que faltan se pierden
      if (app.state && app.state.career) careerCommit(E.careerFinal(app.state), `${app.state.code}:${app.state.game || 0}`);
      leaveRoom(null, { notify: false, to: 'career' });
      return;
    case 'join': {
      const name = readName();
      if (!name) return;
      const code = cleanCode(document.getElementById('code').value);
      if (code.length !== 4) {
        document.getElementById('code').focus();
        toast(t('El código tiene 4 letras.'));
        return;
      }
      app.homeMsg = null;
      joinRoom(code, name);
      return;
    }
    case 'join-invite': {
      const name = readName();
      if (!name) return;
      const code = app.invite;
      app.invite = null;
      app.homeMsg = null;
      joinRoom(code, name);
      return;
    }
    case 'no-invite':
      app.invite = null;
      setUrl(null);
      render();
      return;
    case 'resume':
      resume(sget('tr-last'));
      return;
    case 'help':
      openModal(rules());
      return;
    case 'sets':
      openModal(setsSheet());
      return;
    case 'stats':
      openModal(statsSheet());
      return;
    case 'album':
      openModal(albumSheet(), 'album');
      return;
    case 'coupons':
      openModal(couponsSheet(), 'coupons');
      K.markSeen();
      if (app.screen !== 'room') render();
      return;
    case 'couponCopy': {
      const c = K.wallet().find((x) => x.id === val);
      if (c && navigator.clipboard) navigator.clipboard.writeText(c.code).then(() => toast(t('Código copiado')), () => toast(c.code, 4000));
      else if (c) toast(c.code, 4000);
      return;
    }
    case 'albumClaim': {
      const a = A.load();
      const got = A.claim(a, val);
      if (got) {
        const st = C.load();
        st.money += got;
        C.save(st);
        sfx.win();
        toast(t('+{v} para Rey de las subastas', { v: money(got) }), 2200);
      }
      if (app.modalKind === 'album') openModal(albumSheet(), 'album');
      render();
      return;
    }
    case 'tipOk':
      markTip(val);
      tipNow = null;
      paintTip();
      return;
    case 'tipsAgain':
      try {
        localStorage.removeItem('tr-tips');
      } catch (e) {
        /* nada */
      }
      closeModal();
      toast(t('Los consejos volverán a salir.'), 1600);
      return;
    case 'shareResult':
      shareResult();
      return;
    case 'lang': {
      if (val !== 'es' && val !== 'en' || val === getLang()) return;
      setLang(val);
      const menuOpen = !modalEl.hidden && app.modalKind == null && app.screen === 'room';
      closeModal();
      render();
      if (menuOpen) openMenu();
      return;
    }
    case 'close':
      closeModal();
      return;
    case 'mute':
      setMuted(!isMuted());
      if (isMuted()) stopVoice();
      syncMusic();
      paintSoundHint();
      if (!modalEl.hidden) openMenu();
      if (app.screen === 'home') renderHome();
      toast(isMuted() ? t('Sonido desactivado') : t('Sonido activado'), 1200);
      return;
    case 'menu':
      openMenu();
      return;
    case 'music':
      setMusicOn(!musicOn());
      if (!modalEl.hidden) openMenu();
      toast(musicOn() ? t('Música activada') : t('Música desactivada'), 1200);
      return;
    case 'share':
      share();
      return;
    case 'leave':
      closeModal();
      confirmLeave();
      return;
    case 'leave-now':
      leaveRoom();
      return;
    case 'mode':
      doAct({ type: 'setMode', mode: val });
      return;
    case 'diff':
      doAct({ type: 'setDifficulty', value: val });
      return;
    case 'laps':
      doAct({ type: 'setLaps', value: Number(val) });
      return;
    case 'addBot':
      doAct({ type: 'addBot' });
      return;
    case 'removeBot':
      doAct({ type: 'removeBot', id: el.dataset.id });
      return;
    case 'kick':
      doAct({ type: 'kick', id: el.dataset.id });
      return;
    case 'start':
      doAct({ type: 'start' });
      return;
    case 'rematch':
      doAct({ type: 'rematch' });
      return;
    case 'toLobby':
      doAct({ type: 'toLobby' });
      return;
    case 'phrase':
      if (!app.pitchSel) return;
      app.pitchSel.phrase = Number(val);
      doAct({ type: 'pitch', phrase: app.pitchSel.phrase, opening: app.pitchSel.opening, face: app.pitchSel.face });
      return;
    case 'pitchFace':
      if (!app.pitchSel || !FACES.includes(val)) return;
      app.pitchSel.face = val;
      sfx.face();
      render();
      return;
    case 'pickLook':
      openLookPicker();
      return;
    case 'homeLook':
      openHomeLookPicker();
      return;
    case 'keepLook': {
      // se queda con el que le ha tocado: se guarda para no volver a preguntar
      const me = app.view && app.view.players.find((p) => p.id === myId);
      if (me) sset('tr-look', me.look);
      closeModal();
      return;
    }
    case 'auctSize':
      app.auctSmall = !app.auctSmall;
      sset('tr-auct-small2', app.auctSmall);
      render();
      return;
    case 'look': {
      if (!PLAYER_LOOKS.includes(val)) return;
      sset('tr-look', val);
      closeModal();
      if (app.screen === 'home') {
        sfx.face();
        renderHome();
        return;
      }
      doAct({ type: 'setLook', look: val });
      if (app.role === 'guest' && app.view) {
        app.view = { ...app.view, players: app.view.players.map((p) => (p.id === myId ? { ...p, look: val } : p)) };
        render();
      }
      return;
    }
    case 'face': {
      if (!FACES.includes(val)) return;
      const now = performance.now();
      if (now < (app.faceLockUntil || 0)) return;
      app.faceLockUntil = now + 250;
      doAct({ type: 'face', face: val });
      sfx.face();
      buzz(8);
      if (app.role === 'guest' && app.view) {
        // eco inmediato mientras llega la confirmación
        app.view = { ...app.view, faces: { ...(app.view.faces || {}), [myId]: val } };
        render();
      }
      return;
    }
    case 'opening':
      if (app.pitchSel) app.pitchSel.opening = Number(val);
      render();
      return;
    case 'appraise':
      if (app.view) app.appraisedKey = `${app.view.code}:${app.view.game}:${app.view.round}`;
      doAct({ type: 'appraise' });
      sfx.cash();
      return;
    case 'pitchGo':
      if (!app.pitchSel || app.pitchSel.phrase == null) return;
      doAct({ type: 'pitch', phrase: app.pitchSel.phrase, opening: app.pitchSel.opening, face: app.pitchSel.face });
      return;
    case 'signal':
      doAct({ type: 'signal', kind: val });
      if (app.role === 'guest' && app.view) {
        // eco inmediato mientras llega la confirmación
        app.view = { ...app.view, signals: { ...(app.view.signals || {}), [myId]: val } };
        render();
      }
      return;
    case 'trick':
      doAct({ type: 'trick', trick: val });
      buzz(25);
      return;
    case 'trickHelp':
      openModal(tricksHelp(app.view));
      return;
    case 'bid': {
      const now = performance.now();
      if (now < app.bidLockUntil) return;
      app.bidLockUntil = now + 350;
      doAct({ type: 'bid', amount: Number(val) });
      buzz(15);
      return;
    }
    default:
      return;
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  handle(el.dataset.act, el);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && app.screen === 'home') {
    const id = document.activeElement && document.activeElement.id;
    if (id === 'code') handle('join', document.activeElement);
    else if (id === 'name') {
      // con un código ya escrito, Intro entra en esa sala en vez de crear otra
      const code = document.getElementById('code');
      handle(app.invite ? 'join-invite' : code && cleanCode(code.value).length === 4 ? 'join' : 'create', document.activeElement);
    }
  }
  if (e.key === 'Escape' && !modalEl.hidden) closeModal();
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'code') {
    const c = cleanCode(e.target.value);
    if (e.target.value !== c) e.target.value = c;
    paintCode();
    // con la cuarta letra entra solo
    if (c.length === 4 && app.screen === 'home' && !app.joinPending) {
      app.joinPending = true;
      setTimeout(() => {
        app.joinPending = false;
        const el = document.getElementById('code');
        if (el && cleanCode(el.value).length === 4 && app.screen === 'home') handle('join', el);
      }, 180);
    }
  }
});
document.addEventListener('focusin', (e) => {
  if (e.target.id === 'code') paintCode();
});
document.addEventListener('focusout', (e) => {
  if (e.target.id === 'code') setTimeout(paintCode, 0);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !app.net) return;
  keepAwake(true);
  if (app.role === 'guest') {
    if (app.sendHello) app.sendHello();
  } else if (app.role === 'host') {
    hostTick();
    hostBroadcast();
  }
  if (!app.net.ready) app.net.reconnect();
});
window.addEventListener('pagehide', () => {
  if (app.role === 'host' && app.state) {
    sset('tr-host', { code: app.code, state: app.state, at: Date.now(), keys: app.guestKeys, plain: app.guestPlain });
    const alive = sget('tr-host-alive');
    if (alive && alive.tab === TAB) sdel('tr-host-alive');
  }
});

// ---------- reanudar ----------
function hostOpenElsewhere(code) {
  const alive = sget('tr-host-alive');
  return alive && alive.code === code && alive.tab !== TAB && Date.now() - alive.at < 3500;
}

function resume(last) {
  if (!last) return;
  if (last.role === 'host') {
    const save = sget('tr-host');
    if (save && save.code === last.code && save.state && save.state.hostId === myId) {
      if (hostOpenElsewhere(save.code)) {
        app.homeMsg = t('Esta sala ya está abierta en otra pestaña de este navegador.');
        render();
        return;
      }
      startHosting(save.state, save.at);
      return;
    }
  }
  const name = sget('tr-name', '');
  if (name) joinRoom(last.code, name);
}

function boot() {
  const code = cleanCode(params.get('sala'));
  const last = sget('tr-last');
  const fresh = last && Date.now() - last.at < RESUME_MS;
  if (code.length === 4) {
    const save = sget('tr-host');
    if (save && save.code === code && save.state && save.state.hostId === myId && Date.now() - save.at < RESUME_MS) {
      if (hostOpenElsewhere(code)) {
        app.homeMsg = t('Esta sala ya está abierta en otra pestaña de este navegador.');
        setUrl(null);
        render();
        return;
      }
      startHosting(save.state, save.at);
      return;
    }
    if (fresh && last.code === code && last.role === 'guest' && sget('tr-name')) {
      joinRoom(code, sget('tr-name'));
      return;
    }
    app.invite = code;
  }
  render();
}

boot();
// cupones de descuento: la lista llega después; si hay, aparece el botón en la portada
K.fetchList().then((l) => l.length && app.screen !== 'room' && render());
requestAnimationFrame(() => frame(false));

// para pruebas automatizadas
// el primer toque en cualquier sitio desbloquea el audio (los móviles no dejan sonar nada antes):
// así la música del inicio arranca aunque lo primero sea escribir el nombre
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, () => unlockAudio(), { capture: true, passive: true });

// Aviso mientras el audio está bloqueado (al abrir la web, al volver a una partida sin tocar nada,
// o en el iPhone después de bloquear la pantalla): un toque y se quita.
function paintSoundHint() {
  let el = document.getElementById('sndhint');
  if (isMuted() || audioRunning()) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('button');
    el.id = 'sndhint';
    el.type = 'button';
    el.className = 'sndhint';
    document.body.appendChild(el);
  }
  const txt = '🔊 ' + t('Toca para activar el sonido');
  if (el.textContent !== txt) el.textContent = txt;
}
onAudioState(paintSoundHint);
document.addEventListener('visibilitychange', () => setTimeout(paintSoundHint, 300));
paintSoundHint();

window.__trasteros = { app, E, myId, voiceLog, musicState, offerCoupon, shareImage: () => makeShareImage(app.view) };
