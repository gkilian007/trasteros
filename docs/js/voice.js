// Voces de los personajes: diseñadas con Gemini 3.8 Flash TTS y dichas con Higgsfield (ver tools/voices).
// Cada móvil las oye en su idioma. Si falta un archivo, simplemente no suena.
import { getLang } from './i18n.js';
import { isMuted, audioCtx } from './sound.js';
import { VOICES } from './voice-list.js';
import { duckMusic } from './music.js';

export const voiceUrl = (look, key, lang = getLang()) => `assets/voice/${lang}/${look}/${key}.mp3`;
// solo se piden los archivos que existen (así no hay errores 404 en la consola)
const has = (look, key, lang = getLang()) => !!(VOICES[lang] && VOICES[lang][look] && VOICES[lang][look].includes(key));

const raw = new Map(); // url -> Promise<ArrayBuffer|null>
const decoded = new Map(); // url -> Promise<AudioBuffer|null>

function fetchRaw(url) {
  if (!raw.has(url)) {
    const p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    raw.set(url, p);
    p.then((b) => b || raw.delete(url)); // si falla, se reintenta otra vez
  }
  return raw.get(url);
}
function buffer(url) {
  const ctx = audioCtx();
  if (!ctx) return Promise.resolve(null);
  if (!decoded.has(url)) {
    const p = fetchRaw(url).then((ab) =>
      ab
        ? new Promise((res) => {
            // copia: decodeAudioData se queda con el ArrayBuffer
            try {
              ctx.decodeAudioData(ab.slice(0), res, () => res(null));
            } catch (e) {
              res(null);
            }
          })
        : null,
    );
    decoded.set(url, p);
    p.then((b) => b || decoded.delete(url));
  }
  return decoded.get(url);
}

export function preloadVoices(look, keys) {
  if (!look) return;
  keys.forEach((k) => has(look, k) && fetchRaw(voiceUrl(look, k)));
}

// lo que ha sonado (las pruebas lo consultan en window.__trasteros.voiceLog)
export const voiceLog = [];
let current = null;
let chainId = 0;
export function stopVoice() {
  chainId++;
  if (current) {
    try {
      current.stop();
    } catch (e) {
      /* ya había parado */
    }
    current = null;
  }
}

function playOne(url, id) {
  return buffer(url).then(
    (buf) =>
      new Promise((done) => {
        const ctx = audioCtx();
        if (!buf || !ctx || ctx.state !== 'running' || isMuted() || id !== chainId) return done();
        const src = ctx.createBufferSource();
        const g = ctx.createGain();
        g.gain.value = 0.95;
        src.buffer = buf;
        src.connect(g).connect(ctx.destination);
        src.onended = () => {
          if (current === src) current = null;
          duckMusic(false);
          done();
        };
        current = src;
        duckMusic(true); // la música se aparta mientras habla
        src.start();
        voiceLog.push(url.split('assets/voice/')[1]);
        if (voiceLog.length > 200) voiceLog.shift();
      }),
  );
}

// dice una o varias frases seguidas: [{ look, key }, …]; corta lo que estuviera sonando
export function say(lines, { delay = 0, gap = 0.15 } = {}) {
  if (isMuted() || !audioCtx()) return;
  stopVoice();
  const id = chainId;
  const list = (Array.isArray(lines) ? lines : [lines]).filter((x) => x && x.look && x.key && has(x.look, x.key));
  if (!list.length) return;
  list.forEach((x) => fetchRaw(voiceUrl(x.look, x.key)));
  setTimeout(async () => {
    for (const x of list) {
      if (id !== chainId) return;
      await playOne(voiceUrl(x.look, x.key), id);
      await new Promise((r) => setTimeout(r, gap * 1000));
    }
  }, delay * 1000);
}
