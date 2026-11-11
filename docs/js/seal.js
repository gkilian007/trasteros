// Cifrado de lo que ve cada jugador en secreto.
// Todos los móviles reciben los mismos mensajes del canal, así que el anfitrión cifra la parte
// privada de cada uno con una clave que solo comparten él y ese jugador (ECDH P-256 + AES-GCM).
const subtle = globalThis.crypto && globalThis.crypto.subtle;
const ALG = { name: 'ECDH', namedCurve: 'P-256' };
export const canSeal = !!subtle;

const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// par de claves propio, guardado para sobrevivir a recargas
export async function myKeys(load, save) {
  const saved = load();
  if (saved && saved.pub && saved.priv) return saved;
  const kp = await subtle.generateKey(ALG, true, ['deriveKey']);
  const keys = { pub: await subtle.exportKey('jwk', kp.publicKey), priv: await subtle.exportKey('jwk', kp.privateKey) };
  // solo lo imprescindible de la clave pública (viaja en cada mensaje)
  keys.pub = { kty: keys.pub.kty, crv: keys.pub.crv, x: keys.pub.x, y: keys.pub.y };
  save(keys);
  return keys;
}

const shared = new Map();
// clave común con el otro lado (se calcula una vez por pareja de claves)
export function sharedKey(myPrivJwk, theirPubJwk) {
  const id = myPrivJwk.d + '|' + theirPubJwk.x + theirPubJwk.y;
  if (!shared.has(id)) {
    shared.set(
      id,
      (async () => {
        const priv = await subtle.importKey('jwk', myPrivJwk, ALG, false, ['deriveKey']);
        const pub = await subtle.importKey('jwk', { ...theirPubJwk, ext: true }, ALG, false, []);
        return subtle.deriveKey({ name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      })(),
    );
  }
  return shared.get(id);
}

export async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

export async function unseal(key, box) {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
