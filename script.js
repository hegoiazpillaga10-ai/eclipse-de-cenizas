const $ = id => document.getElementById(id);

// ---------- PANTALLAS ----------
const screens = ['intro', 'menu', 'options'];
function show(id) {
  screens.forEach(s => $(s).classList.add('hidden'));
  if (id) $(id).classList.remove('hidden');
}
const settings = { quality: 'mid' };
let playing = false, started = false, introDone = false;

function endIntro() { if (introDone) return; introDone = true; show('menu'); }
setTimeout(endIntro, 9000);
$('intro').addEventListener('click', endIntro);
window.addEventListener('keydown', () => { if (!introDone) endIntro(); });

function updateUI() {
  $('qLow').classList.toggle('active', settings.quality === 'low');
  $('qMid').classList.toggle('active', settings.quality === 'mid');
}
function applyQuality() {
  if (!renderer) return;
  renderer.setPixelRatio(settings.quality === 'low' ? 0.6 : 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (grass) grass.count = settings.quality === 'low' ? 1000 : 2400;
}
function startPlaying() {
  show(null);
  if (document.activeElement) document.activeElement.blur();
  $('hud').classList.remove('hidden');
  $('story').classList.remove('hidden');
  if (!started) {
    initGame();
    started = true;
    say('Despiertas entre cenizas frías. El aire huele a hierro y a tumba. Un caballero sin nombre... eres tú. Camina.');
  }
  applyQuality();
  playing = true;
  $('btnPlay').textContent = 'Continuar';
  updateUI();
}
function pause() {
  playing = false;
  for (const k in keys) keys[k] = false;
  $('hud').classList.add('hidden');
  $('story').classList.add('hidden');
  show('menu');
}
$('btnPlay').onclick = startPlaying;
$('btnOptions').onclick = () => show('options');
$('btnBack').onclick = () => show('menu');
$('qLow').onclick = () => { settings.quality = 'low'; updateUI(); applyQuality(); };
$('qMid').onclick = () => { settings.quality = 'mid'; updateUI(); applyQuality(); };

// ---------- CUADRO DE TEXTO (estilo aventura) ----------
let typeTimer = null, fadeTimer = null;
function say(text) {
  clearInterval(typeTimer);
  clearTimeout(fadeTimer);
  const el = $('storyText');
  $('story').classList.remove('faded');
  el.textContent = '';
  let i = 0;
  typeTimer = setInterval(() => {
    el.textContent = text.slice(0, ++i);
    if (i >= text.length) {
      clearInterval(typeTimer);
      fadeTimer = setTimeout(() => $('story').classList.add('faded'), 9000);
    }
  }, 28);
}

// ---------- CONTROLES ----------
const keys = {};
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (!playing) return;
  if (k === 'escape' || k === 'p') pause();
  if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---------- VARIABLES DEL MUNDO ----------
let renderer, scene, camera, clock, knight, legL, legR, armL, armR;
let hemi, moonLight, torch, grass;
let moonSprite, moonGlow, stars, moonTex;
let time = 0, walkT = 0, walkAmp = 0, air = 0, knightYaw = Math.PI;
let vy = 0, onGround = true, jumpSaid = false, moonSaid = false;
const pos = new THREE.Vector3(0, 0, 0);
const obstacles = [];
const arches = [];
const dummy = new THREE.Object3D();

// Cámara fija (ángulo constante) que sigue suavemente
const camPos = new THREE.Vector3(), look = new THREE.Vector3();
const camTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3();
let camReady = false;

// Aleatorio con semilla: el mapa es siempre el mismo
let seed = 1337;
function rnd() {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

const palette = [0x1b0a2e, 0x2d1248, 0x3b1a5c, 0x120824, 0x4a1d6e, 0x240f3a, 0x5a2a5a].map(c => new THREE.Color(c));
const skyColor = new THREE.Color();

const MAP = 90; // el mapa va de -90 a 90

function heightAt(x, z) {
  const d = Math.sqrt(x * x + z * z);
  const f = Math.min(1, Math.max(0, (d - 10) / 25));
  return (Math.sin(x * 0.06) * Math.cos(z * 0.07) * 3 + Math.sin(x * 0.15 + z * 0.11) * 0.7) * f;
}

// Zonas con descripción: al entrar se muestra el texto una vez
const zones = [
  { x: 32, z: -28, r: 17, seen: false, text: 'Lápidas torcidas se alzan del barro. Algunas llevan nombres que el tiempo borró. Algo susurra bajo la tierra.' },
  { x: -38, z: -32, r: 20, seen: false, text: 'Un bosque de árboles muertos te rodea. Sus ramas parecen manos que intentan aferrar un cielo que ya no les pertenece.' },
  { x: -32, z: 38, r: 15, seen: false, text: 'Columnas rotas de un templo olvidado. Aquí alguien rezó una última vez... y nadie respondió.' },
  { x: 40, z: 40, r: 15, seen: false, text: 'Cristales violetas palpitan en la oscuridad como corazones helados. El aire vibra con una magia antigua y hambrienta.' },
  { x: -62, z: 5, r: 16, seen: false, text: 'Monolitos retorcidos se inclinan hacia ti, como si la piedra se hubiera cansado de estar quieta. Cuanto más los miras, más parecen girar.' },
  { x: 5, z: -62, r: 22, seen: false, text: 'Arcos de piedra flotan sobre tu cabeza, sin pilares, sin motivo. Ninguno lleva a ningún sitio... o quizá a todos.' },
  { x: 62, z: 8, r: 16, seen: false, text: 'Una escalera asciende en espiral hacia la nada. El primer peldaño está demasiado alto. Nadie ha subido en siglos. O eso quieres creer.' }
];

function scatter(cx, cz, radius) {
  const a = rnd() * 6.283, d = Math.sqrt(rnd()) * radius;
  return [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
}

function addObs(x, z, r, h) {
  obstacles.push({ x, z, r, h, gy: heightAt(x, z) });
}

function addInstanced(geo, mat, n, fn) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  for (let i = 0; i < n; i++) {
    dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    fn(i);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
  }
  m.instanceMatrix.needsUpdate = true;
  m.frustumCulled = false; // necesario para que las instancias lejanas no desaparezcan
  scene.add(m);
  return m;
}

// Mechón de hierba: 5 hojitas triangulares (15 vértices)
function makeGrassGeo() {
  const verts = [], cols = [];
  const base = new THREE.Color(0x070d0b), tip = new THREE.Color(0x2e4d3e);
  for (let b = 0; b < 5; b++) {
    const a = b * 1.26 + 0.3;
    const ox = (Math.random() - 0.5) * 0.25, oz = (Math.random() - 0.5) * 0.25;
    const pts = [[-0.07, 0, 0, 0], [0.07, 0, 0, 0], [0.05, 1, 0.22, 1]];
    for (const [x, y, z, t] of pts) {
      const rx = x * Math.cos(a) + z * Math.sin(a);
      const rz = -x * Math.sin(a) + z * Math.cos(a);
      verts.push(rx + ox, y, rz + oz);
      const c = t ? tip : base;
      cols.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

function buildWorld() {
  // Suelo (pocos polígonos)
  const gg = new THREE.PlaneGeometry(MAP * 2 + 160, MAP * 2 + 160, 70, 70);
  gg.rotateX(-Math.PI / 2);
  const p = gg.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  gg.computeVertexNormals();
  scene.add(new THREE.Mesh(gg, new THREE.MeshLambertMaterial({ color: 0x1c1a24, flatShading: true })));

  // Hierba oscura (un solo dibujo para todos los mechones)
  grass = addInstanced(makeGrassGeo(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 2400, () => {
    const x = (rnd() - 0.5) * MAP * 2, z = (rnd() - 0.5) * MAP * 2;
    dummy.position.set(x, heightAt(x, z), z);
    dummy.rotation.y = rnd() * 6.28;
    const s = 0.8 + rnd() * 0.8;
    dummy.scale.set(s, 0.7 + rnd() * 0.9, s);
  });

  // Árboles muertos
  const trees = [];
  for (let i = 0; i < 70; i++) {
    let x, z;
    if (i < 35) [x, z] = scatter(-38, -32, 22);
    else { x = (rnd() - 0.5) * MAP * 2; z = (rnd() - 0.5) * MAP * 2; }
    if (Math.hypot(x, z) < 9) { x += 14; }
    trees.push({ x, z, h: 4 + rnd() * 4 });
    addObs(x, z, 0.7, 99);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.35, 1, 5); trunkGeo.translate(0, 0.5, 0);
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x0f0b12 });
  addInstanced(trunkGeo, treeMat, trees.length, i => {
    const t = trees[i];
    dummy.position.set(t.x, heightAt(t.x, t.z), t.z);
    dummy.scale.set(1, t.h, 1);
  });
  const branchGeo = new THREE.CylinderGeometry(0.03, 0.1, 1, 4); branchGeo.translate(0, 0.5, 0);
  addInstanced(branchGeo, treeMat, trees.length * 2, i => {
    const t = trees[i >> 1];
    dummy.position.set(t.x, heightAt(t.x, t.z) + t.h * (0.55 + rnd() * 0.35), t.z);
    dummy.rotation.set(0, rnd() * 6.28, (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.6));
    dummy.scale.set(1, 1.5 + rnd() * 1.8, 1);
  });

  // Lápidas (se pueden saltar)
  const graves = [];
  for (let i = 0; i < 28; i++) {
    const [x, z] = i < 20 ? scatter(32, -28, 15) : scatter(0, 0, 70);
    if (Math.hypot(x, z) < 7) continue;
    graves.push([x, z]);
    addObs(x, z, 0.6, 1.1);
  }
  addInstanced(new THREE.BoxGeometry(0.8, 1.2, 0.2), new THREE.MeshLambertMaterial({ color: 0x3a3a46 }), graves.length, i => {
    const [x, z] = graves[i];
    dummy.position.set(x, heightAt(x, z) + 0.45, z);
    dummy.rotation.set((rnd() - 0.5) * 0.3, rnd() * 6.28, (rnd() - 0.5) * 0.3);
  });

  // Rocas
  const rocks = [];
  for (let i = 0; i < 30; i++) {
    const [x, z] = scatter(0, 0, MAP);
    if (Math.hypot(x, z) < 8) continue;
    const s = 0.7 + rnd() * 1.6;
    rocks.push([x, z, s]);
    addObs(x, z, s * 0.9, s * 0.85);
  }
  addInstanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x2a2a34, flatShading: true }), rocks.length, i => {
    const [x, z, s] = rocks[i];
    dummy.position.set(x, heightAt(x, z) + s * 0.3, z);
    dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    dummy.scale.set(s, s * 0.7, s);
  });

  // Columnas del templo en ruinas
  const pillars = [];
  for (let i = 0; i < 9; i++) {
    const [x, z] = scatter(-32, 38, 11);
    const h = 1.5 + rnd() * 3.5;
    pillars.push([x, z, h]);
    addObs(x, z, 0.9, h);
  }
  const pillarGeo = new THREE.CylinderGeometry(0.55, 0.65, 1, 6); pillarGeo.translate(0, 0.5, 0);
  addInstanced(pillarGeo, new THREE.MeshLambertMaterial({ color: 0x4a4854, flatShading: true }), pillars.length, i => {
    const [x, z, h] = pillars[i];
    dummy.position.set(x, heightAt(x, z), z);
    dummy.scale.set(1, h, 1);
  });

  // Cristales (brillan sin gastar luces)
  const crystals = [];
  for (let i = 0; i < 16; i++) {
    const [x, z] = i < 11 ? scatter(40, 40, 13) : scatter(0, 0, 80);
    crystals.push([x, z, 0.6 + rnd() * 0.9]);
  }
  addInstanced(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0x9a5cff }), crystals.length, i => {
    const [x, z, s] = crystals[i];
    dummy.position.set(x, heightAt(x, z) + s * 1.5, z);
    dummy.rotation.y = rnd() * 3;
    dummy.scale.set(s * 0.6, s * 1.8, s * 0.6);
  });

  // ===== ARQUITECTURA SURREALISTA =====
  const strange = new THREE.MeshLambertMaterial({ color: 0x4a4260, flatShading: true });

  // Monolitos retorcidos e inclinados
  const monoGeo = new THREE.BoxGeometry(1.4, 1, 1.4, 1, 12, 1);
  const mp = monoGeo.attributes.position;
  for (let i = 0; i < mp.count; i++) {
    const t = mp.getY(i) + 0.5;
    const a = t * 1.6, k = 1 - t * 0.5;
    const x = mp.getX(i) * k, z = mp.getZ(i) * k;
    mp.setX(i, x * Math.cos(a) - z * Math.sin(a));
    mp.setZ(i, x * Math.sin(a) + z * Math.cos(a));
  }
  monoGeo.translate(0, 0.5, 0);
  monoGeo.computeVertexNormals();
  const monos = [];
  for (let i = 0; i < 16; i++) {
    const [x, z] = i < 11 ? scatter(-62, 5, 15) : scatter(0, 0, 80);
    if (Math.hypot(x, z) < 10) continue;
    monos.push([x, z, 7 + rnd() * 9]);
    addObs(x, z, 1.1, 99);
  }
  addInstanced(monoGeo, strange, monos.length, i => {
    const [x, z, h] = monos[i];
    dummy.position.set(x, heightAt(x, z) - 0.5, z);
    dummy.rotation.set((rnd() - 0.5) * 0.7, rnd() * 6.28, (rnd() - 0.5) * 0.7);
    dummy.scale.set(1, h, 1);
  });

  // Arcos flotantes (se mecen despacio)
  const archGeo = new THREE.TorusGeometry(4, 0.8, 5, 10, Math.PI);
  for (let i = 0; i < 8; i++) {
    const [x, z] = i < 5 ? scatter(5, -62, 20) : scatter(0, 0, 75);
    const m = new THREE.Mesh(archGeo, strange);
    m.scale.setScalar(0.8 + rnd() * 1.1);
    m.position.set(x, 7 + rnd() * 9, z);
    m.rotation.set((rnd() - 0.5) * 0.9, rnd() * 6.28, (rnd() - 0.5) * 1.2);
    scene.add(m);
    arches.push({ m, y: m.position.y, ph: rnd() * 6.28, ry: m.rotation.y });
  }

  // Rocas invertidas colgando en el aire
  const coneGeo = new THREE.ConeGeometry(1, 1, 6); coneGeo.rotateX(Math.PI);
  addInstanced(coneGeo, new THREE.MeshLambertMaterial({ color: 0x2c2838, flatShading: true }), 9, () => {
    const [x, z] = scatter(0, 0, 80);
    const s = 2 + rnd() * 3;
    dummy.position.set(x, 14 + rnd() * 14, z);
    dummy.rotation.y = rnd() * 6.28;
    dummy.scale.set(s, s * 1.8, s);
  });

  // Escalera en espiral que sube a la nada (con un arco al final)
  const CX = 62, CZ = 8, R = 6, STEPS = 16;
  addInstanced(new THREE.BoxGeometry(3.2, 0.5, 1.6), strange, STEPS, i => {
    const a = i * 0.38;
    dummy.position.set(CX + Math.cos(a) * R, 4 + i * 0.85, CZ + Math.sin(a) * R);
    dummy.rotation.y = -a;
  });
  const la = (STEPS - 1) * 0.38;
  const gate = new THREE.Mesh(archGeo, strange);
  gate.scale.setScalar(0.45);
  gate.position.set(CX + Math.cos(la) * R, 4 + (STEPS - 1) * 0.85 + 0.25, CZ + Math.sin(la) * R);
  gate.rotation.y = -la;
  scene.add(gate);

  // ===== LUNA CON CARA =====
  const mc = document.createElement('canvas');
  mc.width = mc.height = 256;
  moonTex = new THREE.CanvasTexture(mc);
  moonTex.userData = { c: mc.getContext('2d') };
  drawMoon(1, -0.75, 0.9);
  moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, transparent: true, depthWrite: false }));
  moonSprite.scale.set(46, 46, 1);
  moonSprite.renderOrder = 2;

  const gc = document.createElement('canvas');
  gc.width = gc.height = 128;
  const g2 = gc.getContext('2d');
  const gr = g2.createRadialGradient(64, 64, 20, 64, 64, 64);
  gr.addColorStop(0, 'rgba(190,150,255,0.55)');
  gr.addColorStop(1, 'rgba(190,150,255,0)');
  g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128);
  moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), fog: false, transparent: true, depthWrite: false }));
  moonGlow.scale.set(105, 105, 1);
  moonGlow.renderOrder = 1;
  scene.add(moonGlow, moonSprite);

  // Estrellas
  const sp = [];
  for (let i = 0; i < 250; i++) {
    const u = rnd() * 6.28, v = rnd() * 1.3 + 0.1, r = 160;
    sp.push(Math.cos(u) * Math.cos(v) * r, Math.sin(v) * r, Math.sin(u) * Math.cos(v) * r);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false, fog: false, transparent: true }));
  scene.add(stars);
}

// Dibuja la cara de la luna: open = 1 (ojos abiertos) a 0 (cerrados); px/py = hacia dónde miran
function drawMoon(open, px, py) {
  const c = moonTex.userData.c;
  c.clearRect(0, 0, 256, 256);

  const g = c.createRadialGradient(110, 100, 10, 128, 128, 122);
  g.addColorStop(0, '#f4eeff'); g.addColorStop(0.7, '#cdbcf2'); g.addColorStop(1, '#9d86d6');
  c.fillStyle = g;
  c.beginPath(); c.arc(128, 128, 122, 0, Math.PI * 2); c.fill();

  c.fillStyle = 'rgba(90,60,140,0.22)';
  [[60, 70, 16], [190, 80, 12], [205, 170, 18], [70, 195, 13], [150, 38, 8], [38, 140, 9]].forEach(([x, y, r]) => {
    c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
  });

  // Cejas enfadadas
  c.strokeStyle = '#1a0830'; c.lineWidth = 7; c.lineCap = 'round';
  c.beginPath(); c.moveTo(76, 76); c.lineTo(116, 94); c.stroke();
  c.beginPath(); c.moveTo(180, 76); c.lineTo(140, 94); c.stroke();

  // Ojos
  for (const ex of [88, 168]) {
    c.fillStyle = '#14041f';
    c.beginPath(); c.ellipse(ex, 112, 25, 18, 0, 0, 6.283); c.fill();
    const ry = 15 * open;
    if (ry > 1) {
      c.save();
      c.beginPath(); c.ellipse(ex, 112, 20, ry, 0, 0, 6.283); c.clip();
      c.fillStyle = '#fff3b0'; c.fillRect(ex - 22, 90, 44, 44);
      c.fillStyle = '#0a0010';
      c.beginPath(); c.ellipse(ex + px * 8, 112 + py * 6, 5, 9, 0, 0, 6.283); c.fill();
      c.restore();
    }
  }

  // Boca con dientes
  c.fillStyle = '#14041f';
  c.beginPath();
  c.moveTo(78, 172);
  c.quadraticCurveTo(128, 222, 178, 172);
  c.quadraticCurveTo(128, 188, 78, 172);
  c.fill();
  c.fillStyle = '#fff3b0';
  for (let i = 1; i < 7; i++) {
    const t = i / 7, u = 1 - t;
    const x = u * u * 78 + 2 * u * t * 128 + t * t * 178;
    const y = u * u * 172 + 2 * u * t * 188 + t * t * 172;
    c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x + 4, y); c.lineTo(x, y + 6); c.fill();
  }
  moonTex.needsUpdate = true;
}

// Parpadeo aleatorio
let nextBlink = 3, blinkT = -1, moonOpen = 1, moonKey = '';
function updateMoon(dt) {
  if (blinkT < 0 && time > nextBlink) blinkT = 0;
  if (blinkT >= 0) {
    blinkT += dt;
    const D = 0.3;
    if (blinkT >= D) {
      blinkT = -1; moonOpen = 1;
      nextBlink = time + (Math.random() < 0.25 ? 0.35 : 2.5 + Math.random() * 5); // a veces parpadea dos veces
    } else {
      moonOpen = Math.abs(1 - 2 * blinkT / D);
    }
  }
  const o = Math.round(moonOpen * 5) / 5;
  const px = Math.round((-0.75 + Math.sin(time * 0.3) * 0.5) * 4) / 4; // mira hacia abajo y a la izquierda (hacia el mapa)
  const key = o + '|' + px;
  if (key !== moonKey) { moonKey = key; drawMoon(o, px, 0.9); }
}

function makeKnight() {
  const g = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: 0x9096a2 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const cloth = new THREE.MeshLambertMaterial({ color: 0x6b0f1a, side: THREE.DoubleSide });
  const blk = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const blade = new THREE.MeshLambertMaterial({ color: 0xcfd3dc });

  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  legL = new THREE.Group(); legL.position.set(-0.22, 0.95, 0);
  legR = new THREE.Group(); legR.position.set(0.22, 0.95, 0);
  box(0.3, 0.95, 0.32, dark, 0, -0.475, 0, legL);
  box(0.3, 0.95, 0.32, dark, 0, -0.475, 0, legR);
  box(0.34, 0.2, 0.45, steel, 0, -0.9, 0.06, legL);
  box(0.34, 0.2, 0.45, steel, 0, -0.9, 0.06, legR);
  g.add(legL, legR);

  box(0.85, 0.95, 0.48, steel, 0, 1.45, 0, g);   // torso
  box(0.9, 0.18, 0.5, dark, 0, 0.98, 0, g);      // cinturón
  box(0.46, 0.5, 0.46, steel, 0, 2.15, 0, g);    // casco
  box(0.36, 0.07, 0.05, blk, 0, 2.17, 0.24, g);  // visor
  box(0.08, 0.3, 0.3, cloth, 0, 2.5, -0.05, g);  // penacho

  armL = new THREE.Group(); armL.position.set(-0.58, 1.8, 0);
  armR = new THREE.Group(); armR.position.set(0.58, 1.8, 0);
  box(0.24, 0.85, 0.26, steel, 0, -0.4, 0, armL);
  box(0.24, 0.85, 0.26, steel, 0, -0.4, 0, armR);
  box(0.36, 0.22, 0.36, dark, 0, 0.05, 0, armL);
  box(0.36, 0.22, 0.36, dark, 0, 0.05, 0, armR);
  box(0.1, 0.75, 0.55, dark, -0.2, -0.5, 0.1, armL); // escudo
  const sword = box(0.09, 1.3, 0.03, blade, 0, -0.4, 0.55, armR);
  sword.rotation.x = Math.PI / 2 - 0.2;
  box(0.3, 0.06, 0.06, dark, 0, -0.85, 0.2, armR);
  g.add(armL, armR);

  const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.4), cloth);
  cape.position.set(0, 1.35, -0.3);
  cape.rotation.x = 0.12;
  g.add(cape);
  return g;
}

function initGame() {
  renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: false, powerPreference: 'low-power' });
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b0a2e);
  scene.fog = new THREE.FogExp2(0x1b0a2e, 0.035); // niebla densa

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300);
  clock = new THREE.Clock();

  hemi = new THREE.HemisphereLight(0x6a3fb0, 0x050308, 0.7);
  scene.add(hemi);
  moonLight = new THREE.DirectionalLight(0x9a8cff, 0.6);
  scene.add(moonLight, moonLight.target);
  torch = new THREE.PointLight(0xff7a2a, 1.2, 18);
  scene.add(torch);

  buildWorld();
  knight = makeKnight();
  scene.add(knight);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
  animate();
}

// ---------- CIELO CAMBIANTE + LUNA ----------
function updateSky() {
  const n = (Math.sin(time * 0.08) + Math.sin(time * 0.035 + 1.3) + Math.sin(time * 0.014 + 4)) / 3;
  const t = Math.max(0, Math.min(1, n * 0.75 + 0.5));
  const f = t * (palette.length - 1);
  const i = Math.min(Math.floor(f), palette.length - 2);
  skyColor.copy(palette[i]).lerp(palette[i + 1], f - i);
  scene.background.copy(skyColor);
  scene.fog.color.copy(skyColor);
  hemi.color.copy(skyColor).offsetHSL(0, 0.1, 0.18);
  stars.material.opacity = 0.65 + 0.35 * Math.sin(time * 0.6);
  stars.position.copy(camera.position);
  // La luna está siempre en el mismo sitio de la pantalla, vigilando el mapa
  moonSprite.position.set(camera.position.x + 28, camera.position.y + 36, camera.position.z - 170);
  moonGlow.position.set(camera.position.x + 28, camera.position.y + 36, camera.position.z - 172);
}

function updateArches() {
  for (const a of arches) {
    a.m.position.y = a.y + Math.sin(time * 0.5 + a.ph) * 0.9;
    a.m.rotation.y = a.ry + Math.sin(time * 0.2 + a.ph) * 0.25;
  }
}

// ---------- ACTUALIZAR CADA FRAME ----------
function update(dt) {
  // Cámara con ángulo fijo: W = hacia el fondo, S = hacia ti, A = izquierda, D = derecha
  const ix = ((keys['d'] || keys['arrowright']) ? 1 : 0) - ((keys['a'] || keys['arrowleft']) ? 1 : 0);
  const iz = ((keys['w'] || keys['arrowup']) ? 1 : 0) - ((keys['s'] || keys['arrowdown']) ? 1 : 0);
  const mx = ix, mz = -iz;
  const moving = ix !== 0 || iz !== 0;
  const speed = keys['shift'] ? 9 : 5;

  if (moving) {
    const len = Math.hypot(mx, mz);
    pos.x += (mx / len) * speed * dt;
    pos.z += (mz / len) * speed * dt;
    pos.x = Math.max(-MAP, Math.min(MAP, pos.x));
    pos.z = Math.max(-MAP, Math.min(MAP, pos.z));
    walkT += dt * speed * 1.6;
    let d = Math.atan2(mx, mz) - knightYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    knightYaw += d * Math.min(1, dt * 10);
  }

  // Colisiones (solo con obstáculos más altos que el caballero en ese momento)
  for (const o of obstacles) {
    if (pos.y - o.gy >= o.h) continue;
    const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz), min = o.r + 0.5;
    if (d < min && d > 0.0001) { pos.x = o.x + dx / d * min; pos.z = o.z + dz / d * min; }
  }

  // Gravedad y salto
  const ground = heightAt(pos.x, pos.z);
  if (keys[' '] && onGround) {
    vy = 10.5; onGround = false;
    if (!jumpSaid) { jumpSaid = true; say('El suelo te suelta un instante. Allá arriba, la luna te mira... y no parece sorprendida.'); }
  }
  if (!onGround) {
    vy -= 26 * dt;
    pos.y += vy * dt;
    if (pos.y <= ground && vy <= 0) { pos.y = ground; vy = 0; onGround = true; }
  } else {
    pos.y = ground;
  }

  // Animación del caballero (caminar + salto)
  air += ((onGround ? 0 : 1) - air) * Math.min(1, dt * 12);
  walkAmp += ((moving ? 1 : 0) - walkAmp) * Math.min(1, dt * 8);
  const w = walkAmp * (1 - air);
  legL.rotation.x = Math.sin(walkT) * 0.7 * w - 0.7 * air;
  legR.rotation.x = -Math.sin(walkT) * 0.7 * w + 0.3 * air;
  armL.rotation.x = -Math.sin(walkT) * 0.5 * w - 2.4 * air;
  armR.rotation.x = Math.sin(walkT) * 0.5 * w - 2.4 * air;

  knight.position.set(pos.x, pos.y + Math.abs(Math.sin(walkT)) * 0.08 * w, pos.z);
  knight.rotation.y = knightYaw;

  // Cámara: detrás y arriba, ángulo fijo, seguimiento suave
  camTarget.set(pos.x, pos.y + 5.2, pos.z + 11);
  lookTarget.set(pos.x, pos.y + 2.5, pos.z - 3);
  if (!camReady) { camPos.copy(camTarget); look.copy(lookTarget); camReady = true; }
  const k = 1 - Math.exp(-dt * 3.5);
  camPos.lerp(camTarget, k);
  look.lerp(lookTarget, k);
  camPos.y = Math.max(camPos.y, heightAt(camPos.x, camPos.z) + 1.2);
  camera.position.copy(camPos);
  camera.lookAt(look);

  // Luces que siguen al caballero
  torch.position.set(pos.x, pos.y + 2.5, pos.z);
  torch.intensity = 1.1 + Math.sin(time * 13) * 0.15 + Math.sin(time * 31) * 0.1;
  moonLight.position.set(pos.x - 30, pos.y + 50, pos.z - 20);
  moonLight.target.position.copy(pos);

  // Zonas: mostrar descripción al entrar por primera vez
  for (const z of zones) {
    if (!z.seen && Math.hypot(pos.x - z.x, pos.z - z.z) < z.r) {
      z.seen = true;
      say(z.text);
    }
  }

  if (!moonSaid && time > 40) {
    moonSaid = true;
    say('Alzas la vista. La luna tiene ojos. Juraría que acaba de parpadear.');
  }
}

function animate() {
  requestAnimationFrame(animate);
  if (!playing) return; // en el menú no se gasta GPU
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  update(dt);
  updateSky();
  updateMoon(dt);
  updateArches();
  renderer.render(scene, camera);
}
