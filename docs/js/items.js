// Catálogo de objetos que pueden aparecer en un trastero.
// kind: tesoro | normal | basura | trampa | misterio
// value: valor en euros (las trampas restan dinero al ganador)
// odds (misterio): [[probabilidad, valor], ...] — se resuelve al abrir el trastero

export const ITEMS = [
  // Tesoros
  { id: 'anillo', name: 'Anillo de diamantes', emoji: '💍', kind: 'tesoro', value: 550 },
  { id: 'moto', name: 'Moto clásica', emoji: '🏍️', kind: 'tesoro', value: 600 },
  { id: 'guitarra', name: 'Guitarra firmada', emoji: '🎸', kind: 'tesoro', value: 420 },
  { id: 'monedas', name: 'Monedas antiguas', emoji: '🪙', kind: 'tesoro', value: 380 },
  { id: 'recreativa', name: 'Máquina recreativa', emoji: '🕹️', kind: 'tesoro', value: 350 },
  { id: 'violin', name: 'Violín antiguo', emoji: '🎻', kind: 'tesoro', value: 480 },
  { id: 'trofeo', name: 'Trofeo de plata', emoji: '🏆', kind: 'tesoro', value: 300 },
  { id: 'reloj', name: 'Reloj suizo', emoji: '⌚', kind: 'tesoro', value: 400 },
  { id: 'disco', name: 'Disco de oro', emoji: '📀', kind: 'tesoro', value: 320 },
  { id: 'estatua', name: 'Estatua tallada', emoji: '🗿', kind: 'tesoro', value: 360 },
  // Normales
  { id: 'bici', name: 'Bici vintage', emoji: '🚲', kind: 'normal', value: 160 },
  { id: 'tele', name: 'Tele retro', emoji: '📺', kind: 'normal', value: 90 },
  { id: 'consola', name: 'Consola retro', emoji: '🎮', kind: 'normal', value: 180 },
  { id: 'camara', name: 'Cámara de fotos', emoji: '📷', kind: 'normal', value: 140 },
  { id: 'silla', name: 'Silla de diseño', emoji: '🪑', kind: 'normal', value: 120 },
  { id: 'maleta', name: 'Maleta de cuero', emoji: '🧳', kind: 'normal', value: 80 },
  { id: 'skate', name: 'Monopatín', emoji: '🛹', kind: 'normal', value: 60 },
  { id: 'comics', name: 'Cómics antiguos', emoji: '📚', kind: 'normal', value: 200 },
  { id: 'deporte', name: 'Raquetas', emoji: '🎾', kind: 'normal', value: 70 },
  { id: 'peluches', name: 'Peluches', emoji: '🧸', kind: 'normal', value: 110 },
  { id: 'cocina', name: 'Sartenes', emoji: '🍳', kind: 'normal', value: 50 },
  { id: 'herramientas', name: 'Herramientas', emoji: '🧰', kind: 'normal', value: 100 },
  // Basura
  { id: 'calcetines', name: 'Calcetines', emoji: '🧦', kind: 'basura', value: 0 },
  { id: 'cubo', name: 'Cubo roto', emoji: '🪣', kind: 'basura', value: 5 },
  { id: 'cajas', name: 'Cajas vacías', emoji: '📦', kind: 'basura', value: 10 },
  { id: 'latas', name: 'Latas caducadas', emoji: '🥫', kind: 'basura', value: 0 },
  { id: 'extintor', name: 'Extintor vacío', emoji: '🧯', kind: 'basura', value: 15 },
  { id: 'planta', name: 'Planta seca', emoji: '🪴', kind: 'basura', value: 0 },
  { id: 'papeles', name: 'Papeles viejos', emoji: '🗞️', kind: 'basura', value: 5 },
  { id: 'cables', name: 'Cables', emoji: '🔌', kind: 'basura', value: 20 },
  // Trampas
  { id: 'bidon', name: 'Bidón tóxico', emoji: '☣️', kind: 'trampa', value: -150, desc: 'Retirarlo cuesta 150 €' },
  { id: 'ratas', name: 'Nido de ratas', emoji: '🐀', kind: 'trampa', value: -100, desc: 'Plaga de ratas: 100 €' },
  { id: 'multa', name: 'Multa municipal', emoji: '📜', kind: 'trampa', value: -80, desc: 'Pagas 80 € de multa' },
  { id: 'carcoma', name: 'Termitas', emoji: '🐛', kind: 'trampa', value: 0, effect: 'halveBest', desc: 'El objeto más valioso pierde la mitad' },
  // Misterio
  { id: 'cajafuerte', name: 'Caja fuerte', emoji: '🔐', kind: 'misterio', safe: true, odds: [], desc: 'Cerrada: nadie sabe qué hay. Puede estar vacía… o tener un saco de oro' },
  { id: 'cuadro', name: 'Cuadro dudoso', emoji: '🖼️', kind: 'misterio', odds: [[0.5, 450], [0.5, 20]], desc: '50 %: obra de arte (450 €) · 50 %: copia (20 €)' },
  // Puerto: solo salen en Rey de las subastas, desde esa zona
  { id: 'ancla', name: 'Ancla antigua', emoji: '⚓', kind: 'tesoro', value: 520, zone: 'puerto' },
  { id: 'brujula', name: 'Brújula', emoji: '🧭', kind: 'normal', value: 260, zone: 'puerto' },
  { id: 'catalejo', name: 'Catalejo', emoji: '🔭', kind: 'tesoro', value: 340, zone: 'puerto' },
  { id: 'velero', name: 'Maqueta de velero', emoji: '⛵', kind: 'tesoro', value: 420, zone: 'puerto' },
  { id: 'anfora', name: 'Ánfora', emoji: '🏺', kind: 'tesoro', value: 600, zone: 'puerto' },
  { id: 'perlas', name: 'Perlas', emoji: '🦪', kind: 'tesoro', value: 700, zone: 'puerto' },
  { id: 'mapa', name: 'Mapa del tesoro', emoji: '🗺️', kind: 'misterio', odds: [[0.25, 1500], [0.75, 30]], desc: '25 %: lleva a un tesoro (1.500 €) · 75 %: es de mentira (30 €)', zone: 'puerto' },
  { id: 'buceo', name: 'Equipo de buceo', emoji: '🤿', kind: 'normal', value: 180, zone: 'puerto' },
  { id: 'scooter', name: 'Moto scooter', emoji: '🛵', kind: 'tesoro', value: 650, zone: 'puerto' },
  { id: 'portatil', name: 'Portátiles', emoji: '💻', kind: 'normal', value: 380, zone: 'puerto' },
  { id: 'piano', name: 'Piano eléctrico', emoji: '🎹', kind: 'normal', value: 300, zone: 'puerto' },
  { id: 'auriculares', name: 'Auriculares', emoji: '🎧', kind: 'normal', value: 150, zone: 'puerto' },
  { id: 'pescado', name: 'Pescado podrido', emoji: '🐟', kind: 'trampa', value: -200, desc: 'Limpiar el contenedor cuesta 200 €', zone: 'puerto' },
  { id: 'aduana', name: 'Tasas de aduana', emoji: '🛃', kind: 'trampa', value: -300, desc: 'Pagas 300 € de tasas', zone: 'puerto' },
  { id: 'boleto', name: 'Lotería', emoji: '🎟️', kind: 'misterio', odds: [[0.15, 900], [0.85, 0]], desc: '15 %: premio de 900 €' },
];

// Lo que puede haber dentro de la caja fuerte: nadie lo sabe (ni el subastador) hasta que se abre
export const SAFE_CONTENTS = [
  { name: 'Vacía', emoji: '🙈', value: 0, p: 0.32 },
  { name: 'Papeles del banco', emoji: '📜', value: 10, p: 0.2 },
  { name: 'Fajo de billetes', emoji: '💵', value: 250, p: 0.24 },
  { name: 'Joyas', emoji: '💎', value: 500, p: 0.15 },
  { name: 'Saco de oro', emoji: '💰', value: 1000, p: 0.09 },
];
ITEMS.find((it) => it.safe).odds = SAFE_CONTENTS.map((c) => [c.p, c.value]);
export const SAFE_CLOSED = 160; // en Rey de las subastas va cerrada al almacén: lo que te dan por ella sin abrir
export const LOCKSMITH = 50; // lo que cobra el cerrajero por abrirla
// índice de lo que sale al abrirla (x entre 0 y 1)
export function safeDraw(x) {
  for (let k = 0; k < SAFE_CONTENTS.length; k++) if ((x -= SAFE_CONTENTS[k].p) <= 0) return k;
  return SAFE_CONTENTS.length - 1;
}

export const ITEM = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
// Los objetos con zona solo salen en Rey de las subastas, en esa zona y las siguientes
export const ZONE_RANK = { barrio: 0, poligono: 1, puerto: 2, mansiones: 3 };
export const inZone = (it, zone) => !it.zone || (ZONE_RANK[zone] ?? -1) >= ZONE_RANK[it.zone];
export const BASE_ITEMS = ITEMS.filter((it) => !it.zone); // los de siempre: competitivo, cooperativo y primeras zonas

// Colecciones: juntar 3 objetos de la misma a lo largo de la partida da un premio (y cada pieza más, otro)
export const COLLECTIONS = [
  { id: 'lujo', name: 'Lujo', emoji: '💎', items: ['anillo', 'reloj', 'monedas', 'trofeo', 'cajafuerte'] },
  { id: 'arte', name: 'Arte y música', emoji: '🎨', items: ['guitarra', 'violin', 'disco', 'estatua', 'cuadro'] },
  { id: 'retro', name: 'Retro', emoji: '🕹️', items: ['recreativa', 'consola', 'tele', 'comics', 'camara'] },
  { id: 'aventura', name: 'Aventura', emoji: '🏍️', items: ['moto', 'bici', 'skate', 'deporte', 'maleta'] },
  { id: 'hogar', name: 'Hogar', emoji: '🏠', items: ['silla', 'cocina', 'herramientas', 'peluches'] },
  // se abren al llegar al Puerto
  { id: 'nautica', name: 'Náutica', emoji: '⚓', zone: 'puerto', items: ['ancla', 'brujula', 'catalejo', 'velero'] },
  { id: 'hundido', name: 'Tesoro hundido', emoji: '🏺', zone: 'puerto', items: ['anfora', 'perlas', 'mapa', 'buceo'] },
  { id: 'importacion', name: 'Importación', emoji: '🚢', zone: 'puerto', items: ['scooter', 'portatil', 'piano', 'auriculares'] },
];
export const COLLECTION = Object.fromEntries(COLLECTIONS.map((c) => [c.id, c]));
export const SET_OF = Object.fromEntries(COLLECTIONS.flatMap((c) => c.items.map((id) => [id, c.id])));
export const SET_NEED = 3; // piezas para la colección
export const SET_BONUS = 200; // al juntar la tercera
export const SET_EXTRA = 100; // por cada pieza más
// cuántas piezas de cada colección tiene alguien (sus objetos)
export function setCounts(items) {
  const out = {};
  for (const it of items || []) {
    const c = SET_OF[it.id];
    if (c) out[c] = (out[c] || 0) + 1;
  }
  return out;
}

export const KIND_LABEL = {
  tesoro: 'Tesoro',
  normal: 'Normal',
  basura: 'Basura',
  trampa: 'Trampa',
  misterio: 'Misterio',
};

// Valor esperado de un objeto (lo que un experto pagaría de media)
export function itemEV(id) {
  const it = ITEM[id];
  if (!it) return 0;
  if (it.kind === 'misterio') return it.odds.reduce((s, [p, v]) => s + p * v, 0);
  if (it.effect === 'halveBest') return -60;
  return it.value;
}

// Valor medio de un hueco desconocido
export const SLOT_EV = BASE_ITEMS.reduce((s, it) => s + itemEV(it.id), 0) / BASE_ITEMS.length;

export function valueLabel(id) {
  const it = ITEM[id];
  if (!it) return '';
  if (it.kind === 'misterio') return '¿?';
  if (it.effect) return '½';
  if (it.value < 0) return `${it.value} €`;
  return `${it.value} €`;
}
