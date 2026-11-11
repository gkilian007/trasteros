// Escena 3D del trastero (Three.js).
// Persiana enrollable con textura real, paredes de chapa, suelo de garaje,
// cajas de cartón 3D (Kenney, CC0) y objetos como iconos 3D (Fluent Emoji, MIT).
import * as THREE from '../vendor/three.module.min.js';
import { OBJLoader } from '../vendor/OBJLoader.js';
import { MTLLoader } from '../vendor/MTLLoader.js';

const W = 3.2; // ancho interior
const D = 2.6; // fondo
const H = 2.3; // alto
const DOOR = { closed: 0, peek: 0.74, up: 1 };

const KIND_GLOW = {
  tesoro: '#ffc31f',
  normal: '#8cc6ff',
  basura: '#b9c0c8',
  trampa: '#ff4a36',
  misterio: '#c09bff',
};

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function questionTexture() {
  // pegatina con interrogación para las cajas cerradas
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#f3e7c9';
  g.beginPath();
  g.roundRect(14, 14, 100, 100, 18);
  g.fill();
  g.fillStyle = '#7a5326';
  g.font = '900 86px Bungee, Arial Black, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function createStage3D(container, { base = './assets/' } = {}) {
  let running = false;
  let last = performance.now();
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // las sombras solo cambian cuando se mueve la persiana o cambian las cajas
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  container.appendChild(renderer.domElement);
  renderer.domElement.className = 'stage3d-canvas';

  const overlay = document.createElement('div');
  overlay.className = 'stage3d-overlay';
  container.appendChild(overlay);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2b2230');
  scene.fog = new THREE.Fog('#2b2230', 7, 13);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
  camera.position.set(0, 1.42, 5.1);
  camera.lookAt(0, 0.76, 0);

  const texLoader = new THREE.TextureLoader();
  const tex = (name, repeatX, repeatY, srgb) => {
    const t = texLoader.load(base + 'tex/' + name);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const pbr = (prefix, rx, ry, opts = {}) =>
    new THREE.MeshStandardMaterial({
      map: tex(prefix + '_diff.jpg', rx, ry, true),
      normalMap: tex(prefix + '_nor.jpg', rx, ry),
      roughnessMap: tex(prefix + '_rough.jpg', rx, ry),
      ...opts,
    });

  // suelo (entra dentro y sale hacia la cámara)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), pbr('garage_floor', 4, 3.2, { roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 1.2);
  floor.receiveShadow = true;
  scene.add(floor);

  // paredes interiores de chapa
  const wallMat = pbr('corrugated_iron_02', 2.2, 1.4, { color: '#8d97a6', metalness: 0.55, roughness: 0.8 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat);
  back.position.set(0, H / 2, -D / 2);
  back.receiveShadow = true;
  scene.add(back);
  const sideMat = pbr('corrugated_iron_02', 1.8, 1.4, { color: '#76808f', metalness: 0.55, roughness: 0.8 });
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(D, H), sideMat);
    w.rotation.y = -s * Math.PI / 2;
    w.position.set((s * W) / 2, H / 2, 0);
    w.receiveShadow = true;
    scene.add(w);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#2a313d', roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, H, 0);
  scene.add(ceil);

  // fachada exterior alrededor de la puerta
  const facadeMat = pbr('corrugated_iron_02', 1.2, 1.6, { color: '#e2c9a8', metalness: 0.4, roughness: 0.75 });
  const facadeTopMat = pbr('corrugated_iron_02', 3, 0.5, { color: '#e2c9a8', metalness: 0.4, roughness: 0.75 });
  const pillarW = 1.4;
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(pillarW, H + 0.9, 0.12), facadeMat);
    p.position.set(s * (W / 2 + pillarW / 2), (H + 0.9) / 2, D / 2 + 0.06);
    p.castShadow = p.receiveShadow = true;
    scene.add(p);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(W, 0.9, 0.12), facadeTopMat);
  lintel.position.set(0, H + 0.45, D / 2 + 0.06);
  scene.add(lintel);

  // marco de la puerta
  const frameMat = new THREE.MeshStandardMaterial({ color: '#39465a', metalness: 0.7, roughness: 0.45 });
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.09, H, 0.18), frameMat);
    f.position.set(s * (W / 2 + 0.03), H / 2, D / 2 + 0.1);
    f.castShadow = true;
    scene.add(f);
  }

  // número del trastero pintado en la fachada
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 256;
  signCanvas.height = 96;
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.36), new THREE.MeshStandardMaterial({ map: signTex, transparent: true, roughness: 0.9 }));
  sign.position.set(0, H + 0.48, D / 2 + 0.125);
  sign.visible = false; // el número va pintado en grande en la persiana
  function paintSign(text) {
    const g = signCanvas.getContext('2d');
    g.clearRect(0, 0, 256, 96);
    g.fillStyle = '#ffc31f';
    g.beginPath();
    g.roundRect(6, 6, 244, 84, 14);
    g.fill();
    g.fillStyle = '#2a1d00';
    g.font = '400 54px Bungee, Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 52);
    signTex.needsUpdate = true;
  }
  paintSign('Nº 1');

  // número pintado con plantilla en la persiana (sube con ella al abrir) y candado
  const numCanvas = document.createElement('canvas');
  numCanvas.width = 256;
  numCanvas.height = 256;
  const numTex = new THREE.CanvasTexture(numCanvas);
  numTex.colorSpace = THREE.SRGBColorSpace;
  const doorNum = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshStandardMaterial({ map: numTex, transparent: true, roughness: 0.85, depthWrite: false }));
  scene.add(doorNum);
  function paintNumber(n) {
    const g = numCanvas.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(255, 246, 228, 0.88)';
    g.font = '400 220px Bungee, Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 128, 140);
    numTex.needsUpdate = true;
  }
  let curNum = 1;
  paintNumber(1);
  // si la fuente aún no había cargado, se repinta con ella
  if (document.fonts && document.fonts.load) document.fonts.load('400 40px Bungee').then(() => paintNumber(curNum), () => {});
  const lock = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: '#d9a23a', metalness: 0.85, roughness: 0.32 });
  const lockBody = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.05), brass);
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.012, 8, 16, Math.PI), new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.9, roughness: 0.25 }));
  shackle.position.y = 0.055;
  lock.add(lockBody, shackle);
  scene.add(lock);

  // persiana enrollable
  const shutterMat = pbr('rusty_metal_shutter', 1.6, 1.25, { color: '#ffae5c', metalness: 0.35, roughness: 0.6 });
  const shutter = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.04, H), shutterMat);
  shutter.position.set(0, H / 2, D / 2 + 0.13);
  shutter.castShadow = true;
  scene.add(shutter);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.07, 0.07), new THREE.MeshStandardMaterial({ color: '#4c5a6d', metalness: 0.8, roughness: 0.35 }));
  scene.add(bar);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.07), new THREE.MeshStandardMaterial({ color: '#222a35', metalness: 0.6, roughness: 0.4 }));
  scene.add(handle);
  const drum = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.26, 0.34), new THREE.MeshStandardMaterial({ color: '#4c5a6d', metalness: 0.75, roughness: 0.4 }));
  drum.position.set(0, H + 0.02, D / 2 + 0.2);
  drum.castShadow = true;
  scene.add(drum);

  let doorOpen = 0; // 0 cerrada, 1 abierta
  let doorTarget = 0;
  function placeDoor() {
    const h = Math.max(0.1, H * (1 - doorOpen) + 0.06);
    shutter.scale.y = h / H;
    shutter.position.y = H - h / 2;
    for (const t of [shutterMat.map, shutterMat.normalMap, shutterMat.roughnessMap]) t.repeat.y = 1.25 * (h / H);
    bar.position.set(0, H - h + 0.03, D / 2 + 0.16);
    handle.position.set(0, H - h + 0.12, D / 2 + 0.17);
    handle.visible = doorOpen < 0.97;
    // el número sube con la persiana y desaparece al enrollarse; el candado solo está con la puerta cerrada
    doorNum.position.set(0, 1.2 + (H - h + 0.06), D / 2 + 0.145);
    doorNum.visible = doorNum.position.y < H - 0.25;
    lock.position.set(0.32, H - h + 0.17, D / 2 + 0.2);
    lock.visible = doorOpen < 0.04;
    renderer.shadowMap.needsUpdate = true;
  }
  placeDoor();

  // luces
  scene.add(new THREE.HemisphereLight('#ffd9b0', '#3b2c1c', 0.6));
  const outside = new THREE.DirectionalLight('#ffd6a0', 2.3);
  outside.position.set(2.5, 4, 8);
  scene.add(outside);
  const front = new THREE.DirectionalLight('#ffe2c0', 0.9);
  front.position.set(-3, 1.2, 6);
  scene.add(front);
  const bulbPos = new THREE.Vector3(0, H - 0.32, -0.1);
  const spot = new THREE.SpotLight('#ffd49a', 38, 0, 1.05, 0.65, 1.6);
  spot.position.copy(bulbPos);
  spot.target.position.set(0, 0, 0.2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0015;
  scene.add(spot, spot.target);
  const fill = new THREE.PointLight('#ffb870', 3, 4, 1.8);
  fill.position.copy(bulbPos);
  scene.add(fill);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff1c8' }));
  bulb.position.copy(bulbPos);
  scene.add(bulb);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3), new THREE.MeshBasicMaterial({ color: '#111' }));
  cable.position.set(0, H - 0.15, -0.1);
  scene.add(cable);
  const bulbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffd38a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
  bulbGlow.scale.set(0.55, 0.55, 1);
  bulbGlow.position.copy(bulbPos);
  scene.add(bulbGlow);

  // cajas de Kenney
  const mtl = new MTLLoader();
  const obj = new OBJLoader();
  async function loadBox(name) {
    const mats = await mtl.setPath(base + 'models/').loadAsync(name + '.mtl');
    mats.preload();
    const o = await obj.setMaterials(mats).setPath(base + 'models/').loadAsync(name + '.obj');
    o.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = m.receiveShadow = true;
        const arr = Array.isArray(m.material) ? m.material : [m.material];
        m.material = arr.map((mm) => {
          const c = mm.color ? mm.color.clone() : new THREE.Color('#c99a5b');
          return new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0 });
        });
        if (m.material.length === 1) m.material = m.material[0];
      }
    });
    const bb = new THREE.Box3().setFromObject(o);
    const size = bb.getSize(new THREE.Vector3());
    const center = bb.getCenter(new THREE.Vector3());
    o.position.sub(new THREE.Vector3(center.x, bb.min.y, center.z));
    const wrap = new THREE.Group();
    wrap.add(o);
    wrap.userData.size = size;
    return wrap;
  }
  const [closedProto, openProto] = await Promise.all([loadBox('cardboardBoxClosed'), loadBox('cardboardBoxOpen')]);
  const unit = Math.max(closedProto.userData.size.x, closedProto.userData.size.z);

  // trastos decorativos al fondo
  const deco = new THREE.Group();
  [
    [-1.25, -1.0, 0.62, 0.3],
    [-1.22, -1.0, 0.46, 0.15, 0.6],
    [1.25, -1.0, 0.7, -0.25],
  ].forEach(([x, z, s, r, y = 0]) => {
    const b = closedProto.clone();
    b.scale.setScalar(s / unit);
    b.position.set(x, y, z);
    b.rotation.y = r;
    b.traverse((m) => {
      if (!m.isMesh) return;
      const dim = (mm) => {
        const c = mm.clone();
        c.color.multiplyScalar(0.45);
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(dim) : dim(m.material);
    });
    deco.add(b);
  });
  scene.add(deco);

  const qTex = questionTexture();
  const glowTex = glowTexture();
  const iconCache = new Map();
  const iconTex = (url) => {
    if (!iconCache.has(url)) {
      const t = texLoader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      iconCache.set(url, t);
    }
    return iconCache.get(url);
  };

  let slotObjs = [];
  const slotGroup = new THREE.Group();
  scene.add(slotGroup);

  function clearSlots() {
    slotGroup.clear();
    slotObjs = [];
    overlay.innerHTML = '';
  }

  // slots: [{ state: 'closed'|'door'|'mine'|'tarp'|'open', icon, kind, tag, label, value, delay }]
  function setSlots(slots) {
    clearSlots();
    const n = slots.length;
    const size = n >= 5 ? 0.58 : 0.66;
    // iconos lo más grandes que permite el hueco entre cajas
    const isz = n <= 2 ? 1.0 : n === 3 ? 0.92 : n === 4 ? 0.8 : 0.7;
    const span = Math.min(2.3, (size + 0.07) * (n - 1));
    slots.forEach((sl, i) => {
      const x = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
      const z = 0.3 + (i % 2 ? -0.22 : 0.04);
      const open = sl.state !== 'closed' && sl.state !== 'tarp';
      const box = (open ? openProto : closedProto).clone();
      const s = size / unit;
      box.scale.setScalar(s);
      box.position.set(x, 0, z);
      box.rotation.y = ((i * 37) % 11) / 30 - 0.18;
      if (sl.state === 'tarp') {
        box.traverse((m) => m.isMesh && (m.material = new THREE.MeshStandardMaterial({ color: '#3f6f5c', roughness: 1 })));
      }
      slotGroup.add(box);
      const top = closedProto.userData.size.y * s;
      const o = { box, x, z, top, isz, icon: null, glow: null, phase: i * 1.3, delay: sl.delay || 0, born: performance.now() };
      if (sl.state === 'closed') {
        const q = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshStandardMaterial({ map: qTex, transparent: true, roughness: 0.8 }));
        q.position.set(0, top * 0.52 / s, (closedProto.userData.size.z / 2 + 0.002));
        q.scale.setScalar(1 / s);
        box.add(q);
      }
      if (open && sl.icon) {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: KIND_GLOW[sl.kind] || '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
        glow.scale.set(isz * 1.6, isz * 1.6, 1);
        glow.position.set(x, top + isz * 0.5, z);
        const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex(sl.icon), transparent: true, depthWrite: false }));
        icon.scale.set(isz, isz, 1);
        icon.position.set(x, top + isz * 0.5, z + 0.01);
        slotGroup.add(glow, icon);
        o.icon = icon;
        o.glow = glow;
      }
      if (sl.label) {
        const tag = document.createElement('div');
        tag.className = 'stage3d-tag ' + (sl.tagClass || '');
        tag.innerHTML = sl.label;
        if (sl.delay) tag.style.opacity = '0';
        overlay.appendChild(tag);
        o.tag = tag;
        o.tagShown = !sl.delay;
      }
      slotObjs.push(o);
    });
    renderer.shadowMap.needsUpdate = true;
    kick();
  }

  // tamaño
  let width = 1;
  let height = 1;
  let insetLeft = 0; // hueco a la izquierda para el retrato del subastador
  function resize() {
    const r = container.getBoundingClientRect();
    width = Math.max(1, r.width);
    height = Math.max(1, r.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // en pantallas estrechas aleja la cámara para que quepa el trastero
    const inset = Math.min(insetLeft, width * 0.4);
    camera.position.z = 5.1 * Math.max(1, 1.2 / camera.aspect) * (1 + (inset / width) * 0.5);
    camera.lookAt(0, 0.76, 0);
    // corre la escena a la derecha para dejar sitio al subastador
    if (inset) camera.setViewOffset(width, height, -inset * 0.5, 0, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    kick();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // bucle de dibujo (solo mientras algo se mueve)
  const v = new THREE.Vector3();
  let lastDraw = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let moving = false;
    let busy = false; // algo cambia de verdad: se dibuja a tope; si solo flotan los iconos, a 20 fps
    if (Math.abs(doorTarget - doorOpen) > 0.002) {
      doorOpen += (doorTarget - doorOpen) * Math.min(1, dt * 3.2);
      placeDoor();
      moving = busy = true;
    }
    for (const o of slotObjs) {
      if (o.icon) {
        const age = (now - o.born) / 1000 - o.delay;
        const pop = Math.max(0, Math.min(1, age / 0.45));
        if (pop < 1) busy = true;
        const ease = pop < 1 ? 1 - Math.pow(1 - pop, 3) * Math.cos(pop * 6) * 0.9 : 1;
        const bob = Math.sin(now / 600 + o.phase) * 0.035;
        const y = o.top + 0.1 + (o.isz * 0.5 - 0.02) * ease + bob;
        o.icon.position.y = y;
        o.glow.position.y = y;
        o.icon.scale.setScalar(o.isz * Math.max(0.001, ease));
        o.glow.scale.setScalar(o.isz * 1.6 * Math.max(0.001, ease));
        o.glow.material.opacity = 0.85 * ease;
        moving = true;
      }
      // la etiqueta con el valor aparece cuando sale el objeto, no antes
      if (o.tag && o.delay) {
        const show = (now - o.born) / 1000 >= o.delay;
        if (o.tagShown !== show) {
          o.tag.style.opacity = show ? '1' : '0';
          o.tagShown = show;
        }
        if (!show) moving = true;
      }
      if (o.tag) {
        v.set(o.x, -0.02, o.z + 0.36).project(camera);
        const sx = (v.x * 0.5 + 0.5) * width;
        const sy = (-v.y * 0.5 + 0.5) * height;
        const t = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, 0)`;
        if (o.tagT !== t) {
          o.tag.style.transform = t;
          o.tagT = t;
        }
      }
    }
    if (busy || !moving || now - lastDraw > 48) {
      bulbGlow.material.opacity = 0.7 + Math.sin(now / 90) * 0.04 * Math.random();
      renderer.render(scene, camera);
      lastDraw = now;
    }
    if (moving && !document.hidden) requestAnimationFrame(frame);
    else running = false;
  }
  document.addEventListener('visibilitychange', () => document.hidden || kick());
  function kick() {
    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }

  return {
    setDoor(state, instant = false) {
      doorTarget = DOOR[state] ?? 0;
      if (instant) {
        doorOpen = doorTarget;
        placeDoor();
      }
      kick();
    },
    setNumber(n) {
      paintSign('Nº ' + n);
      curNum = n;
      paintNumber(n);
      kick();
    },
    setSlots,
    setInsetLeft(px) {
      if (px === insetLeft) return;
      insetLeft = px;
      resize();
    },
    render: kick,
    dispose() {
      renderer.dispose();
      container.innerHTML = '';
    },
  };
}
