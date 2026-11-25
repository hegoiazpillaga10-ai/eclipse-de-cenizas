// ---------- ACCESO SEGURO A LOS ELEMENTOS + COMPROBACIÓN DE IDs ----------
const REQUIRED_IDS = [
  'game', 'splash', 'menu', 'options', 'playerName', 'btnPlay', 'btnOptions', 'btnBack',
  'qLow', 'qMid', 'vol', 'volLabel', 'btnMusic', 'hud', 'quest', 'prompt', 'story', 'storyWho', 'storyText'
];
const missingIds = REQUIRED_IDS.filter(id => !document.getElementById(id));
if (missingIds.length) {
  console.error('Faltan IDs en index.html:', missingIds.join(', '));
  const warn = document.createElement('div');
  warn.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#a00;color:#fff;font:14px sans-serif;padding:8px;text-align:center';
  warn.textContent = 'Faltan IDs en index.html: ' + missingIds.join(', ') + ' (usa el index.html más reciente y recarga con Ctrl+Shift+R)';
  document.body.appendChild(warn);
}
// Si un ID falta, devuelve un elemento vacío en vez de romper el juego
const $ = id => document.getElementById(id) || document.createElement('div');

// ---------- PANTALLAS ----------
const screens = ['menu', 'options'];
function show(id) {
  screens.forEach(s => {
    const el = $(s);
    el.classList.add('hidden');
    el.style.display = 'none';
  });
  if (id) {
    const el = $(id);
    el.classList.remove('hidden');
    el.style.display = '';
  }
}
const settings = { quality: 'mid' };
let playing = false, started = false;

// ---------- NOMBRE Y VOLUMEN (se guardan en el navegador) ----------
let playerName = 'Caballero';
let masterVol = 0.7;
try {
  const n = localStorage.getItem('ayu_name');
  if (n) $('playerName').value = n;
  const v = localStorage.getItem('ayu_vol');
  if (v !== null && !isNaN(parseFloat(v))) masterVol = Math.max(0, Math.min(1, parseFloat(v)));
} catch (e) {}
$('vol').value = Math.round(masterVol * 100);
$('volLabel').textContent = 'Volumen general: ' + Math.round(masterVol * 100) + '%';

// Secuencia: cartel AyuCreations -> menú principal
let stage = 'splash';
function endSplash() {
  if (stage !== 'splash') return;
  stage = 'menu';
  const sp = $('splash');
  sp.classList.add('fadeout'); // se desvanece suavemente
  setTimeout(() => {
    sp.classList.add('hidden');
    sp.style.display = 'none';
    show('menu');
    $('btnMusic').classList.remove('hidden');
  }, 900);
}
setTimeout(endSplash, 3000);
$('splash').addEventListener('click', endSplash);
window.addEventListener('keydown', () => { if (stage === 'splash') endSplash(); });

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

// Instrucciones (arriba izquierda): visibles unos segundos
let hudTimer = null;
function showHud() {
  $('hud').classList.remove('faded');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => $('hud').classList.add('faded'), 10000);
}
// H: vuelve a mostrar las instrucciones y el último texto del narrador
function showHelp() {
  showHud();
  if (!dlg) {
    $('story').classList.remove('faded');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => $('story').classList.add('faded'), 8000);
  }
}

let musicAutoStarted = false;
function startPlaying() {
  // Nombre del jugador
  playerName = $('playerName').value.trim() || 'Caballero';
  try { localStorage.setItem('ayu_name', $('playerName').value.trim()); } catch (e) {}

  show(null);
  if (document.activeElement) document.activeElement.blur();
  for (const k in keys) keys[k] = false;
  $('hud').classList.remove('hidden');
  $('story').classList.remove('hidden');
  showHud();
  if (quest > 0) $('quest').classList.remove('hidden');

  // La música arranca en el momento exacto de pulsar Jugar (la primera vez)
  if (!musicAutoStarted) { musicAutoStarted = true; setMusic(true); }

  if (!started) {
    initGame();
    started = true;
    say('Despiertas entre cenizas frías, ' + playerName + '. El aire huele a hierro y a tumba. Al norte, un farol naranja arde junto a una figura encapuchada. Camina.');
  }
  applyQuality();
  playing = true;
  $('btnPlay').textContent = 'Continuar';
  updateUI();
}
function pause() {
  playing = false;
  dragging = false;
  closeDialogue(false);
  if (document.pointerLockElement) document.exitPointerLock();
  for (const k in keys) keys[k] = false;
  $('hud').classList.add('hidden');
  $('story').classList.add('hidden');
  $('quest').classList.add('hidden');
  $('prompt').classList.add('hidden');
  show('menu');
}
$('btnPlay').onclick = startPlaying;
$('btnOptions').onclick = () => show('options');
$('btnBack').onclick = () => show('menu');
$('qLow').onclick = () => { settings.quality = 'low'; updateUI(); applyQuality(); };
$('qMid').onclick = () => { settings.quality = 'mid'; updateUI(); applyQuality(); };

// Deslizador de volumen general (afecta a toda la música Web Audio)
$('vol').addEventListener('input', e => {
  masterVol = e.target.value / 100;
  $('volLabel').textContent = 'Volumen general: ' + e.target.value + '%';
  try { localStorage.setItem('ayu_vol', String(masterVol)); } catch (err) {}
  if (actx && musicOn && master) {
    master.gain.cancelScheduledValues(actx.currentTime);
    master.gain.setTargetAtTime(targetVol(), actx.currentTime, 0.1);
  }
});

// =====================================================
//  MÚSICA DARK FANTASY (Web Audio API, sin archivos)
// =====================================================
let actx = null, master = null, bus = null, musicOn = false, musicTimer = null;
let drone1 = null, drone2 = null;
let trackIdx = 0, chordIdx = 0, nextChordT = 0, nextBellT = 0;
const MUSIC_VOL = 0.6;
const targetVol = () => MUSIC_VOL * masterVol;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// Playlist: cada tema tiene tonalidad, acordes (en semitonos desde la raíz) y escala para las campanas
const tracks = [
  { name: 'Cenizas Frías',     root: 38, chordLen: 9,  chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], scale: [0, 3, 5, 7, 10, 12, 15] },
  { name: 'Réquiem de Niebla', root: 33, chordLen: 10, chords: [[0, 3, 7], [1, 5, 8], [-2, 2, 5], [-4, 0, 3]],   scale: [0, 1, 3, 7, 8, 12, 13] },
  { name: 'Eclipse',           root: 36, chordLen: 8,  chords: [[0, 3, 7], [-2, 2, 5], [3, 7, 10], [-4, 0, 3]], scale: [0, 2, 3, 7, 8, 12, 14] }
];

function initAudio() {
  if (actx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  actx = new AC();

  const comp = actx.createDynamicsCompressor();
  master = actx.createGain(); master.gain.value = 0;
  master.connect(comp); comp.connect(actx.destination);
  bus = actx.createGain(); bus.connect(master);

  // Reverb generada con ruido que se apaga (sensación de catedral)
  const len = Math.floor(actx.sampleRate * 3.5);
  const ir = actx.createBuffer(2, len, actx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const conv = actx.createConvolver(); conv.buffer = ir;
  const wet = actx.createGain(); wet.gain.value = 0.7;
  bus.connect(conv); conv.connect(wet); wet.connect(master);

  // Drone grave que respira (dos dientes de sierra desafinados + filtro con LFO lento)
  const filt = actx.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = 330; filt.Q.value = 4;
  const dg = actx.createGain(); dg.gain.value = 0.15;
  drone1 = actx.createOscillator(); drone1.type = 'sawtooth';
  drone2 = actx.createOscillator(); drone2.type = 'sawtooth'; drone2.detune.value = 9;
  drone1.frequency.value = mtof(tracks[0].root);
  drone2.frequency.value = mtof(tracks[0].root + 12);
  drone1.connect(filt); drone2.connect(filt); filt.connect(dg); dg.connect(bus);
  const lfo = actx.createOscillator(); lfo.frequency.value = 0.07;
  const lg = actx.createGain(); lg.gain.value = 130;
  lfo.connect(lg); lg.connect(filt.frequency);
  drone1.start(); drone2.start(); lfo.start();

  nextChordT = actx.currentTime + 0.2;
  nextBellT = actx.currentTime + 3;
}

function playChord(t, chord, len, tr) {
  for (const iv of chord) {
    for (const [type, det] of [['triangle', -6], ['sine', 7]]) {
      const o = actx.createOscillator(); o.type = type; o.detune.value = det;
      o.frequency.value = mtof(tr.root + 12 + iv);
      const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = actx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.045, t + len * 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + len + 2);
      o.connect(f); f.connect(g); g.connect(bus);
      o.start(t); o.stop(t + len + 2.2);
    }
  }
}
function bell(t) {
  const tr = tracks[trackIdx];
  const note = tr.root + 24 + tr.scale[Math.floor(Math.random() * tr.scale.length)] + (Math.random() < 0.3 ? 12 : 0);
  for (const [m, v] of [[1, 0.05], [2.76, 0.02], [5.4, 0.008]]) {
    const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(note) * m;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + 5.2);
  }
}
function boom(t) {
  const o = actx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(75, t);
  o.frequency.exponentialRampToValueAtTime(34, t + 1.5);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.3, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + 3.2);
}

function scheduleMusic() {
  if (!actx || !musicOn) return;
  const now = actx.currentTime;
  while (nextChordT < now + 2.5) {
    const tr = tracks[trackIdx];
    const ch = tr.chords[chordIdx % tr.chords.length];
    playChord(nextChordT, ch, tr.chordLen, tr);
    const bass = tr.root + Math.min(...ch);
    drone1.frequency.setTargetAtTime(mtof(bass), nextChordT, 1.5);
    drone2.frequency.setTargetAtTime(mtof(bass + 12), nextChordT, 1.5);
    if (chordIdx % 2 === 0 && Math.random() < 0.8) boom(nextChordT);
    nextChordT += tr.chordLen;
    chordIdx++;
    if (chordIdx >= tr.chords.length * 3) { chordIdx = 0; trackIdx = (trackIdx + 1) % tracks.length; } // siguiente tema
  }
  while (nextBellT < now + 2.5) {
    if (Math.random() < 0.75) bell(nextBellT);
    nextBellT += 2.5 + Math.random() * 5;
  }
}

function setMusic(on) {
  musicOn = on;
  $('btnMusic').textContent = '🎵 Música: ' + (on ? 'ON' : 'OFF');
  if (on) {
    initAudio();
    if (!actx) return;
    actx.resume();
    if (!musicTimer) {
      nextChordT = Math.max(nextChordT, actx.currentTime + 0.2);
      nextBellT = Math.max(nextBellT, actx.currentTime + 3);
      scheduleMusic();
      musicTimer = setInterval(scheduleMusic, 400);
    }
    master.gain.cancelScheduledValues(actx.currentTime);
    master.gain.setTargetAtTime(targetVol(), actx.currentTime, 0.8);
  } else {
    if (actx) {
      master.gain.cancelScheduledValues(actx.currentTime);
      master.gain.setTargetAtTime(0, actx.currentTime, 0.2);
      setTimeout(() => { if (!musicOn && actx) actx.suspend(); }, 900);
    }
    clearInterval(musicTimer); musicTimer = null;
  }
}
$('btnMusic').onclick = () => {
  musicAutoStarted = true;
  setMusic(!musicOn);
  $('btnMusic').blur();
};

// ---------- CUADRO DE TEXTO (estilo aventura) ----------
let typeTimer = null, fadeTimer = null, typing = false, fullText = '';
function say(text, who = 'Narrador', keep = false) {
  clearInterval(typeTimer);
  clearTimeout(fadeTimer);
  const el = $('storyText');
  $('storyWho').textContent = who;
  $('story').classList.remove('faded');
  el.textContent = '';
  fullText = text;
  typing = true;
  let i = 0;
  typeTimer = setInterval(() => {
    el.textContent = text.slice(0, ++i);
    if (i >= text.length) {
      clearInterval(typeTimer);
      typing = false;
      // El texto se oculta solo (salvo durante un diálogo)
      if (!keep) fadeTimer = setTimeout(() => $('story').classList.add('faded'), 8000);
    }
  }, 28);
}
function finishTyping() {
  clearInterval(typeTimer);
  typing = false;
  $('storyText').textContent = fullText;
}

// ---------- CONTROLES ----------
const keys = {};
let yaw = 0, pitch = 0.2; // ángulos de la cámara orbital
let dragging = false, dragDist = 0;

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (!playing) return;
  if (k === 'escape' || k === 'p') pause();
  if (k === 'e' && !e.repeat) interact();
  if (k === 'h' && !e.repeat) showHelp();
  if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; dragging = false; });

// Ratón: arrastrar, o clic para capturar el ratón (pointer lock)
window.addEventListener('mousedown', e => {
  if (playing && e.button === 0) { dragging = true; dragDist = 0; }
});
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', e => {
  if (!playing) return;
  const locked = document.pointerLockElement === $('game');
  if (!locked && !dragging) return;
  dragDist += Math.abs(e.movementX) + Math.abs(e.movementY);
  yaw -= e.movementX * 0.004;
  pitch += e.movementY * 0.004;
  pitch = Math.max(0.05, Math.min(1.3, pitch));
});
$('game').addEventListener('click', () => {
  if (!playing || dragDist > 4) return;
  if (document.pointerLockElement === $('game')) return;
  try {
    const r = $('game').requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch (err) {}
});

// ---------- VARIABLES DEL MUNDO ----------
let renderer, scene, camera, clock, knight, legL, legR, armL, armR;
let hemi, moonLight, torch, grass;
let moonSprite, stars, moonTex;
let time = 0, walkT = 0, walkAmp = 0, air = 0, knightYaw = Math.PI;
let vy = 0, onGround = true, jumpSaid = false, moonSaid = false;
const pos = new THREE.Vector3(0, 0, 0);
const focus = new THREE.Vector3();
let focusReady = false;
const obstacles = [];
const arches = [];
const dummy = new THREE.Object3D();

// Misión y NPCs
let quest = 0;        // 0 = sin aceptar, 1 = en curso, 2 = fragmentos listos, 3 = completada
let frags = 0;
const fragments = [];
const npcs = [];
let nearNpc = null, dlg = null;

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
  { x: 0, z: 62, r: 24, seen: false, text: 'Arcos de piedra flotan sobre tu cabeza, sin pilares, sin motivo. Ninguno lleva a ningún sitio... o quizá a todos.' },
  { x: 62, z: 8, r: 16, seen: false, text: 'Una escalera asciende en espiral hacia la nada. El primer peldaño está demasiado alto. Nadie ha subido en siglos. O eso quieres creer.' }
];

function scatter(cx, cz, radius) {
  const a = rnd() * 6.283, d = Math.sqrt(rnd()) * radius;
  return [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
}
// Igual que scatter, pero solo devuelve puntos con z >= minZ (zona sur, lejos de la luna)
function scatterIn(cx, cz, radius, minZ) {
  let p;
  do { p = scatter(cx, cz, radius); } while (p[1] < minZ);
  return p;
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
  // (Todo lo alto y flotante está en el sur, para que la luna del norte quede despejada)
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
    const [x, z] = i < 11 ? scatter(-62, 5, 15) : scatterIn(10, 55, 32, 30);
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

  // Arcos flotantes (se mecen despacio) - solo en el sur
  const archGeo = new THREE.TorusGeometry(4, 0.8, 5, 10, Math.PI);
  for (let i = 0; i < 8; i++) {
    const [x, z] = scatterIn(0, 62, 26, 36);
    const m = new THREE.Mesh(archGeo, strange);
    m.scale.setScalar(0.8 + rnd() * 1.1);
    m.position.set(x, 7 + rnd() * 9, z);
    m.rotation.set((rnd() - 0.5) * 0.9, rnd() * 6.28, (rnd() - 0.5) * 1.2);
    scene.add(m);
    arches.push({ m, y: m.position.y, ph: rnd() * 6.28, ry: m.rotation.y });
  }

  // Rocas invertidas colgando en el aire - solo en el sur
  const coneGeo = new THREE.ConeGeometry(1, 1, 6); coneGeo.rotateX(Math.PI);
  addInstanced(coneGeo, new THREE.MeshLambertMaterial({ color: 0x2c2838, flatShading: true }), 9, () => {
    const [x, z] = scatterIn(0, 60, 30, 32);
    const s = 2 + rnd() * 3;
    dummy.position.set(x, 14 + rnd() * 14, z);
    dummy.rotation.y = rnd() * 6.28;
    dummy.scale.set(s, s * 1.8, s);
  });

  // Escalera en espiral que sube a la nada (con un arco al final), en el este
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

  // ===== MEDIA LUNA VERTICAL CON CARA (solo la parte iluminada) =====
  const mc = document.createElement('canvas');
  mc.width = mc.height = 256;
  moonTex = new THREE.CanvasTexture(mc);
  moonTex.userData = { c: mc.getContext('2d') };
  drawMoon(1, 0.6, 0.6);
  moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, transparent: true, depthWrite: false }));
  moonSprite.scale.set(56, 56, 1);
  moonSprite.renderOrder = 2;
  scene.add(moonSprite);

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

// Dibuja la media luna vertical (curva a la izquierda, sin círculo oscuro detrás).
// open = 1 (ojos abiertos) a 0 (cerrados); px/py = hacia dónde miran las pupilas
function drawMoon(open, px, py) {
  const c = moonTex.userData.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.shadowBlur = 0;
  c.clearRect(0, 0, 256, 256);

  // Cuerpo: círculo grande con un leve resplandor
  const g = c.createLinearGradient(16, 0, 100, 0);
  g.addColorStop(0, '#fbf8ff'); g.addColorStop(0.55, '#dcd3f5'); g.addColorStop(1, '#a99ede');
  c.save();
  c.shadowColor = 'rgba(190,175,255,0.9)'; c.shadowBlur = 14;
  c.fillStyle = g;
  c.beginPath(); c.arc(138, 128, 122, 0, Math.PI * 2); c.fill();
  c.restore();

  // Cráteres
  c.fillStyle = 'rgba(80,70,130,0.22)';
  [[32, 92, 5], [34, 192, 7], [74, 44, 5], [72, 214, 5]].forEach(([x, y, r]) => {
    c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
  });

  // Recorte: solo queda la media luna iluminada (vertical, con la curva hacia la izquierda)
  c.globalCompositeOperation = 'destination-out';
  c.beginPath(); c.arc(198, 128, 100, 0, 6.283); c.fill();

  // Filo plateado en el borde interior
  c.globalCompositeOperation = 'source-atop';
  c.strokeStyle = 'rgba(225,235,255,0.85)'; c.lineWidth = 4;
  c.beginPath(); c.arc(198, 128, 100, 0, 6.283); c.stroke();
  c.globalCompositeOperation = 'source-over';

  // Cejas enfadadas
  c.strokeStyle = '#1a0830'; c.lineWidth = 5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(35, 92); c.lineTo(58, 100); c.stroke();
  c.beginPath(); c.moveTo(91, 92); c.lineTo(68, 100); c.stroke();

  // Ojos plateados muy brillantes
  for (const ex of [48, 78]) {
    c.fillStyle = '#0c0318';
    c.beginPath(); c.ellipse(ex, 113, 14, 11, 0, 0, 6.283); c.fill();
    const ry = 10 * open;
    if (ry > 0.8) {
      c.save();
      c.shadowColor = '#e6f0ff'; c.shadowBlur = 24;
      c.fillStyle = '#ffffff';
      c.beginPath(); c.ellipse(ex, 113, 11, ry, 0, 0, 6.283); c.fill();
      c.restore();
      c.save();
      c.beginPath(); c.ellipse(ex, 113, 11, ry, 0, 0, 6.283); c.clip();
      const mg = c.createLinearGradient(ex - 11, 113 - ry, ex + 11, 113 + ry);
      mg.addColorStop(0, '#ffffff'); mg.addColorStop(0.45, '#c2cee6');
      mg.addColorStop(0.6, '#ffffff'); mg.addColorStop(1, '#9eb0d0');
      c.fillStyle = mg; c.fillRect(ex - 13, 113 - 12, 26, 24);
      c.fillStyle = '#0a0010';
      c.beginPath(); c.ellipse(ex + px * 3, 113 + py * 2, 2.4, 6, 0, 0, 6.283); c.fill();
      c.restore();
    }
  }

  // Boca sonriente
  c.fillStyle = '#12031d';
  c.beginPath();
  c.moveTo(36, 152);
  c.quadraticCurveTo(63, 172, 90, 152);
  c.quadraticCurveTo(63, 208, 36, 152);
  c.fill();

  // Dientes afilados plateados y muy brillantes (arriba y abajo)
  c.save();
  c.shadowColor = '#eaf2ff'; c.shadowBlur = 14;
  const tg = c.createLinearGradient(0, 150, 0, 185);
  tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, '#b4c4e0');
  c.fillStyle = tg;
  c.beginPath();
  for (let k = 0; k < 5; k++) {
    const t = (k + 1) / 6;
    const x = 36 + 54 * t, y = 152 + 40 * t * (1 - t);
    c.moveTo(x - 4.5, y); c.lineTo(x + 4.5, y); c.lineTo(x, y + 8);
  }
  for (let k = 0; k < 4; k++) {
    const t = (k + 1.5) / 6;
    const x = 36 + 54 * t, y = 152 + 112 * t * (1 - t);
    c.moveTo(x - 4.5, y); c.lineTo(x + 4.5, y); c.lineTo(x, y - 7);
  }
  c.fill();
  c.restore();

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
  const px = Math.round((0.6 + Math.sin(time * 0.3) * 0.4) * 4) / 4; // mira hacia el mapa
  const key = o + '|' + px;
  if (key !== moonKey) { moonKey = key; drawMoon(o, px, 0.6); }
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

// =====================================================
//  NPCs LOW-POLY
// =====================================================
function lam(c) { return new THREE.MeshLambertMaterial({ color: c, flatShading: true }); }
function bas(c) { return new THREE.MeshBasicMaterial({ color: c }); }
function part(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// Aldeano encapuchado con farol
function makeVillager() {
  const g = new THREE.Group();
  const cloak = lam(0x3a3148), dark = lam(0x0c0910), wood = lam(0x4a3220);
  part(new THREE.CylinderGeometry(0.3, 0.85, 1.7, 7), cloak, 0, 0.85, 0, g);      // túnica
  part(new THREE.SphereGeometry(0.33, 7, 6), cloak, 0, 1.85, 0, g);               // cabeza
  const hood = part(new THREE.ConeGeometry(0.46, 0.9, 7), cloak, 0, 2.2, -0.05, g); // capucha
  hood.rotation.x = -0.25;
  part(new THREE.SphereGeometry(0.25, 7, 6), dark, 0, 1.82, 0.14, g);             // rostro en sombra
  part(new THREE.SphereGeometry(0.045, 5, 4), bas(0xffe2b0), -0.1, 1.86, 0.36, g); // ojos
  part(new THREE.SphereGeometry(0.045, 5, 4), bas(0xffe2b0), 0.1, 1.86, 0.36, g);
  part(new THREE.BoxGeometry(0.2, 0.8, 0.22), cloak, -0.5, 1.2, 0.05, g);        // brazos
  part(new THREE.BoxGeometry(0.2, 0.8, 0.22), cloak, 0.5, 1.25, 0.15, g);
  part(new THREE.CylinderGeometry(0.045, 0.045, 2.6, 5), wood, 0.62, 1.3, 0.3, g); // bastón
  part(new THREE.SphereGeometry(0.14, 6, 5), bas(0xff9a3c), 0.62, 2.6, 0.3, g);   // farol
  return g;
}

// Gnomo con gorro puntiagudo
function makeGnome() {
  const g = new THREE.Group();
  const blue = lam(0x2f4f8a), skin = lam(0xe0a98a), nose = lam(0xd6806a);
  const white = lam(0xe8e4dc), red = lam(0xa8141e), brown = lam(0x3a2414);
  part(new THREE.CylinderGeometry(0.32, 0.5, 0.9, 7), blue, 0, 0.55, 0, g);       // cuerpo
  part(new THREE.BoxGeometry(0.26, 0.2, 0.4), brown, -0.18, 0.1, 0.08, g);        // botas
  part(new THREE.BoxGeometry(0.26, 0.2, 0.4), brown, 0.18, 0.1, 0.08, g);
  part(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 7), brown, 0, 0.62, 0, g);       // cinturón
  part(new THREE.SphereGeometry(0.3, 7, 6), skin, 0, 1.25, 0, g);                 // cabeza
  part(new THREE.SphereGeometry(0.11, 6, 5), nose, 0, 1.2, 0.3, g);               // nariz
  part(new THREE.SphereGeometry(0.04, 5, 4), bas(0x000000), -0.11, 1.32, 0.26, g);
  part(new THREE.SphereGeometry(0.04, 5, 4), bas(0x000000), 0.11, 1.32, 0.26, g);
  const beard = part(new THREE.ConeGeometry(0.26, 0.65, 6), white, 0, 0.95, 0.18, g); // barba
  beard.rotation.x = Math.PI;
  part(new THREE.CylinderGeometry(0.44, 0.44, 0.05, 8), red, 0, 1.48, 0, g);      // ala del gorro
  const hat = part(new THREE.ConeGeometry(0.34, 1.0, 6), red, 0, 1.97, 0, g);     // gorro
  hat.rotation.z = 0.22;
  part(new THREE.BoxGeometry(0.14, 0.5, 0.16), blue, -0.42, 0.75, 0.05, g);       // brazos
  part(new THREE.BoxGeometry(0.14, 0.5, 0.16), blue, 0.42, 0.75, 0.05, g);
  g.scale.setScalar(0.72);
  return g;
}

// Duende de orejas largas
function makeGoblin() {
  const g = new THREE.Group();
  const green = lam(0x5d8f37), rag = lam(0x4a3524), steelM = lam(0x9aa0a8);
  const body = part(new THREE.CylinderGeometry(0.3, 0.42, 0.95, 6), rag, 0, 0.8, 0, g); // harapos
  body.rotation.x = 0.15;
  part(new THREE.BoxGeometry(0.14, 0.5, 0.14), green, -0.15, 0.25, 0, g);         // piernas
  part(new THREE.BoxGeometry(0.14, 0.5, 0.14), green, 0.15, 0.25, 0, g);
  const head = part(new THREE.SphereGeometry(0.4, 7, 6), green, 0, 1.5, 0.05, g); // cabeza
  head.scale.set(1.1, 0.95, 1);
  const earL = part(new THREE.ConeGeometry(0.13, 0.7, 4), green, -0.52, 1.6, 0, g); // orejas
  earL.rotation.z = 1.2;
  const earR = part(new THREE.ConeGeometry(0.13, 0.7, 4), green, 0.52, 1.6, 0, g);
  earR.rotation.z = -1.2;
  part(new THREE.SphereGeometry(0.08, 5, 4), bas(0xffe34a), -0.17, 1.55, 0.35, g); // ojos
  part(new THREE.SphereGeometry(0.08, 5, 4), bas(0xffe34a), 0.17, 1.55, 0.35, g);
  part(new THREE.SphereGeometry(0.03, 4, 3), bas(0x000000), -0.17, 1.55, 0.42, g);
  part(new THREE.SphereGeometry(0.03, 4, 3), bas(0x000000), 0.17, 1.55, 0.42, g);
  const nose = part(new THREE.ConeGeometry(0.07, 0.3, 4), green, 0, 1.42, 0.42, g);
  nose.rotation.x = Math.PI / 2;
  part(new THREE.BoxGeometry(0.22, 0.05, 0.05), bas(0x120503), 0, 1.3, 0.38, g);  // boca
  const aL = part(new THREE.BoxGeometry(0.12, 0.7, 0.12), green, -0.42, 0.85, 0.05, g); // brazos
  aL.rotation.z = -0.2;
  const aR = part(new THREE.BoxGeometry(0.12, 0.7, 0.12), green, 0.42, 0.85, 0.1, g);
  aR.rotation.z = 0.2;
  part(new THREE.BoxGeometry(0.05, 0.45, 0.02), steelM, 0.52, 0.55, 0.25, g);     // daga
  g.scale.setScalar(0.85);
  return g;
}

// Diálogos de cada NPC (cambian según el estado de la misión y usan el nombre del jugador)
function villagerDialogue() {
  if (quest === 0) return {
    lines: [
      'Chist... acércate, ' + playerName + '. Pocos caminan por estas tierras, y menos aún sobreviven.',
      'La Reliquia del Eclipse se hizo pedazos cuando el sol murió. Tres fragmentos aún laten bajo este cielo morado.',
      'Tráemelos, ' + playerName + '. Verás su luz celeste alzarse entre la niebla, como columnas. Y cuidado con lo que te mira desde arriba.'
    ],
    after: () => { quest = 1; fragments.forEach(f => f.g.visible = true); updateQuestUI(); }
  };
  if (quest === 1) return { lines: ['Aún faltan fragmentos, ' + playerName + '... ¿Ves las columnas de luz celeste? Sigue su resplandor. Son ' + (3 - frags) + ' los que faltan.'] };
  if (quest === 2) return {
    lines: [
      'Los tienes... los tres. Su luz casi quema.',
      'Gracias, ' + playerName + '. Esto es solo el principio: la reliquia pide algo más que fragmentos. Pero esa es otra historia.'
    ],
    after: () => { quest = 3; updateQuestUI(); }
  };
  return { lines: ['La reliquia duerme por ahora, ' + playerName + '. Pero la luna sigue mirando... y sigue sonriendo.'] };
}
function gnomeDialogue() {
  if (quest === 0) return { lines: ['¡Hi, hi! Un caballero de lata. ¿' + playerName + ', dices? Habla con el aldeano de la capucha, al norte: tiene un encargo para ti.', 'Yo solo cuido mi gorro. Me lo robaron una vez. Una vez fue suficiente.'] };
  if (quest === 1) return { lines: ['¿Buscas fragmentos, ' + playerName + '? Brillan casi tanto como mi gorro. Casi.', 'Busca columnas de luz celeste. Una entre las tumbas, otra en el templo roto y otra junto a los monolitos retorcidos.'] };
  return { lines: ['¡Los has encontrado todos, ' + playerName + '! Yo sabía que lo lograrías. Bueno... en realidad apostaba a que no.'] };
}
function goblinDialogue() {
  if (quest === 0) return { lines: ['¡Shhh! ¡Tú! Sí, tú, lata andante. ¿Tienes monedas, ' + playerName + '? ¿No? Qué lástima.', 'Hay un aldeano al norte que busca héroes. Yo busco cosas brillantes. Quizá podamos... no.'] };
  if (quest === 1) return { lines: ['¿Fragmentos? Yo toqué uno una vez. Me quemó los dedos. ¡Nunca más!', 'Consejo gratis, ' + playerName + ': no los dejes para la noche. Aquí siempre es de noche. ¡Ja, ja!'] };
  return { lines: ['Tienes los tres... ¿seguro que no sobra uno para el pobre duende, ' + playerName + '? ¿No? Vale, vale.'] };
}

function addNPC(mesh, x, z, name, dialogueFn) {
  const gy = heightAt(x, z);
  mesh.position.set(x, gy, z);
  scene.add(mesh);
  addObs(x, z, 0.8, 99);
  npcs.push({ mesh, x, z, gy, name, dialogue: dialogueFn, ph: Math.random() * 6.28 });
}

function buildNPCs() {
  addNPC(makeVillager(), 6, -15, 'Aldeano encapuchado', villagerDialogue);
  addNPC(makeGnome(), -16, 13, 'Gnomo del gorro rojo', gnomeDialogue);
  addNPC(makeGoblin(), 19, 15, 'Duende', goblinDialogue);

  // 3 fragmentos de reliquia (columna de luz + cristal flotante). Ocultos hasta aceptar la misión
  const spots = [[28, -30], [-36, 32], [-58, 2]];
  const crystalGeo = new THREE.OctahedronGeometry(0.7, 0);
  const beamGeo = new THREE.CylinderGeometry(0.12, 0.45, 18, 8, 1, true);
  for (const [x, z] of spots) {
    const g = new THREE.Group();
    const gy = heightAt(x, z);
    g.position.set(x, gy, z);
    const crystal = new THREE.Mesh(crystalGeo, bas(0xbff8ff));
    crystal.scale.set(0.8, 1.4, 0.8);
    crystal.position.y = 1.5;
    g.add(crystal);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: 0x66e6ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false
    }));
    beam.position.y = 9;
    g.add(beam);
    g.visible = false;
    scene.add(g);
    fragments.push({ g, crystal, x, z, y: gy + 1.5, ph: Math.random() * 6.28 });
  }
}

// ---------- MISIÓN / DIÁLOGO ----------
function updateQuestUI() {
  const q = $('quest');
  if (quest === 0) { q.classList.add('hidden'); return; }
  if (playing || quest === 1) q.classList.remove('hidden');
  if (quest === 1) q.innerHTML = 'Misión: Fragmentos de reliquia<br><b>' + frags + ' / 3</b>';
  else if (quest === 2) q.innerHTML = 'Misión: Fragmentos de reliquia<br><b>3 / 3</b> · Vuelve con el aldeano';
  else q.innerHTML = 'Misión completada ✔';
}

function closeDialogue(runAfter) {
  if (!dlg) return;
  const a = dlg.after;
  dlg = null;
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => $('story').classList.add('faded'), 5000);
  if (runAfter && a) a();
}

function interact() {
  if (!playing) return;
  if (dlg) {
    if (typing) { finishTyping(); return; }
    dlg.i++;
    if (dlg.i >= dlg.lines.length) closeDialogue(true);
    else say(dlg.lines[dlg.i], dlg.npc.name, true);
    return;
  }
  if (nearNpc) {
    const d = nearNpc.dialogue();
    dlg = { npc: nearNpc, lines: d.lines, after: d.after, i: 0 };
    $('prompt').classList.add('hidden');
    say(d.lines[0], nearNpc.name, true);
  }
}

function updateNPCs(dt) {
  nearNpc = null;
  let best = 4.2;
  for (const n of npcs) {
    const dx = pos.x - n.x, dz = pos.z - n.z, d = Math.hypot(dx, dz);
    if (d < best) { best = d; nearNpc = n; }
    // Mirar al jugador cuando está cerca, balancearse cuando no
    n.mesh.position.y = n.gy + Math.sin(time * 1.5 + n.ph) * 0.03;
    if (d < 11) {
      let a = Math.atan2(dx, dz) - n.mesh.rotation.y;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      n.mesh.rotation.y += a * Math.min(1, dt * 4);
    } else {
      n.mesh.rotation.y += Math.sin(time * 0.5 + n.ph) * 0.003;
    }
  }
  if (dlg && Math.hypot(pos.x - dlg.npc.x, pos.z - dlg.npc.z) > 8) closeDialogue(false);
  $('prompt').classList.toggle('hidden', !(nearNpc && !dlg));
}

function updateFragments() {
  for (const f of fragments) {
    if (!f.g.visible) continue;
    f.crystal.rotation.y = time * 1.6 + f.ph;
    f.crystal.position.y = 1.5 + Math.sin(time * 2 + f.ph) * 0.25;
    if (Math.hypot(pos.x - f.x, pos.z - f.z) < 3 && Math.abs(pos.y - f.y) < 4) {
      f.g.visible = false;
      frags++;
      if (frags >= 3) {
        quest = 2;
        say('Los tres fragmentos vibran juntos en tu mano. Vuelve con el aldeano encapuchado, al norte del inicio.', 'Reliquia');
      } else {
        say('Fragmento de reliquia recogido (' + frags + '/3). Su luz late como un corazón herido.', 'Reliquia');
      }
      updateQuestUI();
    }
  }
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
  buildNPCs();
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
  // La luna está fija en el cielo del norte (no gira con la cámara)
  moonSprite.position.set(camera.position.x + 40, camera.position.y + 52, camera.position.z - 170);
}

function updateArches() {
  for (const a of arches) {
    a.m.position.y = a.y + Math.sin(time * 0.5 + a.ph) * 0.9;
    a.m.rotation.y = a.ry + Math.sin(time * 0.2 + a.ph) * 0.25;
  }
}

// ---------- ACTUALIZAR CADA FRAME ----------
function update(dt) {
  // Girar cámara con el teclado (flechas)
  yaw += ((keys['arrowleft'] ? 1 : 0) - (keys['arrowright'] ? 1 : 0)) * 2 * dt;
  pitch += ((keys['arrowdown'] ? 1 : 0) - (keys['arrowup'] ? 1 : 0)) * 1.2 * dt;
  pitch = Math.max(0.05, Math.min(1.3, pitch));

  // Movimiento relativo a la cámara
  const cy_ = Math.cos(yaw), sy_ = Math.sin(yaw);
  const fx = -sy_, fz = -cy_;   // hacia donde mira la cámara
  const rx = cy_, rz = -sy_;    // derecha de la cámara
  const ix = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);
  const iz = (keys['w'] ? 1 : 0) - (keys['s'] ? 1 : 0);
  const mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
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
    if (!jumpSaid && !dlg) { jumpSaid = true; say('El suelo te suelta un instante. Allá arriba, la luna te mira... y no parece sorprendida.'); }
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

  // Cámara orbital: sigue al caballero con suavidad y gira según yaw/pitch
  if (!focusReady) { focus.copy(pos); focusReady = true; }
  focus.lerp(pos, 1 - Math.exp(-dt * 7));
  const dist = 9, cp = Math.cos(pitch);
  const cx = focus.x + Math.sin(yaw) * cp * dist;
  const cz = focus.z + Math.cos(yaw) * cp * dist;
  let cy = focus.y + 2 + Math.sin(pitch) * dist;
  cy = Math.max(cy, heightAt(cx, cz) + 0.8);
  camera.position.set(cx, cy, cz);
  camera.lookAt(focus.x, focus.y + 2.8, focus.z);

  // Luces que siguen al caballero
  torch.position.set(pos.x, pos.y + 2.5, pos.z);
  torch.intensity = 1.1 + Math.sin(time * 13) * 0.15 + Math.sin(time * 31) * 0.1;
  moonLight.position.set(pos.x - 30, pos.y + 50, pos.z - 20);
  moonLight.target.position.copy(pos);

  // NPCs y fragmentos
  updateNPCs(dt);
  updateFragments();

  // Zonas: mostrar descripción al entrar por primera vez
  for (const z of zones) {
    if (!z.seen && !dlg && Math.hypot(pos.x - z.x, pos.z - z.z) < z.r) {
      z.seen = true;
      say(z.text);
    }
  }

  if (!moonSaid && !dlg && time > 40) {
    moonSaid = true;
    say('Alzas la vista hacia el norte. Una luna rota te sonríe con dientes de plata. Juraría que acaba de parpadear.');
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
