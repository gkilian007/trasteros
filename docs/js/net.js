// Capa de red: un canal por sala donde todos difunden mensajes.
//  - 'supabase': Supabase Realtime (producción)
//  - 'local': BroadcastChannel entre pestañas del mismo navegador (pruebas)
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_FALLBACK_KEY } from './config.js';

let sbPromise = null;
function loadSupabase() {
  if (window.supabase) return Promise.resolve(window.supabase);
  if (!sbPromise) {
    sbPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/supabase.js', import.meta.url).href;
      s.onload = () => (window.supabase ? resolve(window.supabase) : reject(new Error('supabase')));
      s.onerror = () => {
        sbPromise = null;
        reject(new Error('No se pudo cargar la conexión'));
      };
      document.head.appendChild(s);
    });
  }
  return sbPromise;
}

let sbClient = null;
let sbKey = SUPABASE_KEY;
function client(sb) {
  if (!sbClient) {
    sbClient = sb.createClient(SUPABASE_URL, sbKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 40 }, heartbeatIntervalMs: 15000 },
    });
  }
  return sbClient;
}

function supabaseNet(code, onMessage, onStatus) {
  let ch = null;
  let queue = [];
  let closed = false;
  let joined = false;
  let attempts = 0;

  async function open() {
    const sb = await loadSupabase();
    if (closed) return;
    const c = client(sb);
    ch = c.channel('trasteros-' + code, { config: { broadcast: { self: false, ack: false } } });
    ch.on('broadcast', { event: 'm' }, ({ payload }) => {
      try {
        onMessage(payload);
      } catch (e) {
        console.error(e);
      }
    });
    ch.subscribe((status) => {
      if (closed) return;
      if (status === 'SUBSCRIBED') {
        joined = true;
        attempts = 0;
        const q = queue;
        queue = [];
        q.forEach((m) => ch.send({ type: 'broadcast', event: 'm', payload: m }));
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        joined = false;
        attempts++;
        // la clave nueva podría no estar habilitada para Realtime: prueba la clásica
        if (attempts === 2 && sbKey !== SUPABASE_FALLBACK_KEY) {
          sbKey = SUPABASE_FALLBACK_KEY;
          sbClient = null;
          reopen();
          return;
        }
      }
      onStatus(status);
    });
  }

  async function reopen() {
    joined = false;
    const old = ch;
    ch = null;
    if (old) {
      try {
        await old.unsubscribe();
        if (sbClient) sbClient.removeChannel(old);
      } catch (e) {
        /* nada */
      }
    }
    if (!closed) open().catch((e) => onStatus('ERROR', e));
  }

  open().catch((e) => onStatus('ERROR', e));

  return {
    send(msg) {
      if (ch && joined) ch.send({ type: 'broadcast', event: 'm', payload: msg });
      else {
        queue.push(msg);
        if (queue.length > 30) queue.shift();
      }
    },
    get ready() {
      return joined;
    },
    reconnect: reopen,
    close() {
      closed = true;
      if (ch) {
        try {
          ch.unsubscribe();
          if (sbClient) sbClient.removeChannel(ch);
        } catch (e) {
          /* nada */
        }
      }
    },
  };
}

function localNet(code, onMessage, onStatus) {
  const bc = new BroadcastChannel('trasteros-' + code);
  bc.onmessage = (e) => onMessage(e.data);
  setTimeout(() => onStatus('SUBSCRIBED'), 0);
  return {
    send(msg) {
      bc.postMessage(msg);
    },
    get ready() {
      return true;
    },
    reconnect() {},
    close() {
      bc.close();
    },
  };
}

export function connect(kind, code, onMessage, onStatus = () => {}) {
  return kind === 'local' ? localNet(code, onMessage, onStatus) : supabaseNet(code, onMessage, onStatus);
}
