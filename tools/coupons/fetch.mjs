// Baja de Tradedoubler los cupones en vigor del sitio «Trasteros» y los deja en coupons.json (src y docs).
// Lo lanza cada día .github/workflows/coupons.yml. Necesita cuatro secretos del repositorio:
//   TD_CLIENT_ID y TD_CLIENT_SECRET (Tradedoubler > Tools > API Info > Add Client), TD_USERNAME y TD_PASSWORD.
// Sin ellos no hace nada y deja el archivo como está. Nunca escribe las claves en la salida.
// API: https://docs.tradedoubler.com/docs/publisher (GET /publisher/vouchers, OAuth 2.0).
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://connect.tradedoubler.com';
const SOURCE = process.env.TD_SOURCE_ID || '3508024'; // sitio «Trasteros — juego de subastas»
const TYPES = [1, 2, 4]; // cupón con código, descuento y envío gratis (fuera sorteos y promociones sin descuento)
const DAY = 86400000;

// «2029-12-12T19:27:24.320+0100» → fecha
const when = (s) => Date.parse(String(s || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
const clean = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// De la respuesta de la API a lo que enseña el juego. El texto va tal cual lo da la marca.
export function toCoupons(items, now = Date.now()) {
  const seen = new Set();
  const perProgram = {};
  const out = [];
  for (const v of [...items].sort((a, b) => when(a.endDate) - when(b.endDate))) {
    const start = when(v.publishStartDate || v.startDate);
    const end = Math.min(when(v.endDate), when(v.publishEndDate) || Infinity);
    if (!TYPES.includes(v.voucherTypeId) || !(end > now + 2 * DAY) || start > now) continue;
    if (v.languageId && v.languageId !== 'es') continue;
    if (!/^https:\/\//.test(v.defaultTrackUri || '') || !v.programName || !v.title) continue;
    const code = clean(v.code);
    if (v.voucherTypeId === 1 && !code) continue;
    const key = v.programId + '|' + (code || clean(v.title));
    if (seen.has(key) || (perProgram[v.programId] || 0) >= 3) continue;
    seen.add(key);
    perProgram[v.programId] = (perProgram[v.programId] || 0) + 1;
    out.push({ id: 'td-' + v.voucherId, merchant: clean(v.programName), title: clean(v.title), code, text: clean(v.description || v.shortDescription).slice(0, 700), ends: new Date(end).toISOString(), url: v.defaultTrackUri });
    if (out.length >= 60) break;
  }
  return out;
}

async function token() {
  const { TD_CLIENT_ID: id, TD_CLIENT_SECRET: secret, TD_USERNAME: user, TD_PASSWORD: pass } = process.env;
  const r = await fetch(API + '/uaa/oauth/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: user, password: pass }),
  });
  if (!r.ok) throw new Error('Tradedoubler no da acceso (HTTP ' + r.status + '): revisa los cuatro secretos');
  return (await r.json()).access_token;
}

async function main() {
  const need = ['TD_CLIENT_ID', 'TD_CLIENT_SECRET', 'TD_USERNAME', 'TD_PASSWORD'];
  if (need.some((k) => !process.env[k])) {
    console.log('Cupones: faltan secretos de Tradedoubler; no se toca coupons.json');
    return;
  }
  const auth = { Authorization: 'Bearer ' + (await token()), Accept: 'application/json' };
  const items = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const r = await fetch(`${API}/publisher/vouchers?sourceId=${SOURCE}&limit=100&offset=${offset}`, { headers: auth });
    if (!r.ok) throw new Error('No se pueden leer los cupones (HTTP ' + r.status + ')');
    const page = (await r.json()).items || [];
    items.push(...page);
    if (page.length < 100) break;
  }
  const coupons = toCoupons(items);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const same = (f) => existsSync(f) && JSON.stringify(JSON.parse(readFileSync(f, 'utf8')).coupons) === JSON.stringify(coupons);
  // en el repositorio público solo existe docs/; en el del código, también src/
  for (const f of [root + 'src/coupons.json', root + 'docs/coupons.json']) if (existsSync(f) && !same(f)) writeFileSync(f, JSON.stringify({ updated: new Date().toISOString(), coupons }) + '\n');
  console.log(`Cupones: ${items.length} en Tradedoubler, ${coupons.length} publicados en el juego`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
