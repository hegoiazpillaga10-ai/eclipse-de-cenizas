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
  if (grass) grass.count = settings.quality === 'low' ? Math.floor(grassTotal * 0.45) : grassTotal;
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
    say('Despiertas entre cenizas frías, ' + playerName + '. Estás en la aldea y las fogatas son lo único que aún late. Cuatro caminos de piedra salen de aquí. Al norte, un farol naranja arde junto a una figura encapuchada.');
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

// Graznido de cuervo (solo suena si la música está activada; el volumen baja con la distancia)
function caw(vol) {
  if (!actx || !musicOn || vol < 0.03) return;
  const t = actx.currentTime;
  for (let k = 0; k < 2; k++) {
    const t0 = t + k * 0.32;
    const o = actx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(520, t0);
    o.frequency.exponentialRampToValueAtTime(250, t0 + 0.2);
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 950; f.Q.value = 2.5;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.14 * vol, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
    o.connect(f); f.connect(g); g.connect(bus);
    o.start(t0); o.stop(t0 + 0.28);
  }
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
let hemi, moonLight, torch, fireLight, grass, grassTotal = 0;
let moonSprite, stars, moonTex, starPh, starSp;
let sunSprite, sunGlow, fireflies, ffBase, ffPh, glowTexCache = null;
let time = 0, walkT = 0, walkAmp = 0, air = 0, knightYaw = Math.PI;
let vy = 0, onGround = true, jumpSaid = false, moonSaid = false, sunSaid = false;
const pos = new THREE.Vector3(0, 0, 0);
const focus = new THREE.Vector3();
let focusReady = false;
const obstacles = [];
const arches = [];
const fires = [];
const crows = [];
const perches = [];
const pathSegs = [];
let boat = null;
const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();

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

// =====================================================
//  TERRENO, BIOMAS Y CAMINOS
// =====================================================
const MAP = 120;                 // el mapa va de -120 a 120
const WATER_Y = -0.6;
const LAKE = { x: -50, z: 62, r: 14 };
const BZ = 58;                   // z del puente (x = 0)
const riverZ = x => 58 + 4 * Math.sin(x * 0.05);
function sm(a, b, x) {           // suavizado (a -> 0, b -> 1)
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
// Montañas escalables (x, z, altura, anchura): pendiente suave de unos 30 grados como máximo
const PEAKS = [[-62, 108, 17, 26], [8, 114, 24, 26], [66, 104, 18, 24], [-24, 100, 9, 16], [38, 112, 12, 16]];

function terrain(x, z) {
  const f = sm(14, 38, Math.hypot(x, z)); // la aldea es llana
  let h = (2.3 + Math.sin(x * 0.06) * Math.cos(z * 0.07) * 1.8 + Math.sin(x * 0.15 + z * 0.11) * 0.5) * f;
  for (const p of PEAKS) {
    const dx = x - p[0], dz = z - p[1], q = (dx * dx + dz * dz) / (2 * p[3] * p[3]);
    if (q < 9) h += p[2] * Math.exp(-q);
  }
  const wl = sm(LAKE.r, LAKE.r * 0.55, Math.hypot(x - LAKE.x, z - LAKE.z)); // lago
  h += (-2.8 - h) * wl;
  const wr = sm(7, 3.2, Math.abs(z - riverZ(x))) * sm(-62, -44, x) * sm(78, 66, x); // río
  h += (-2.5 - h) * wr;
  return h;
}
// Suelo real: terreno + cubierta del puente
function heightAt(x, z) {
  const h = terrain(x, z);
  if (Math.abs(x) < 2.6) {
    const dz = z - BZ;
    if (Math.abs(dz) < 9.5) return Math.max(h, 2.35 + 0.9 * (1 - (dz / 9.5) * (dz / 9.5)));
  }
  return h;
}

// Biomas (peso 0..1)
const BIO = { forest: { x: -80, z: -4, r: 48 }, autumn: { x: 80, z: -4, r: 48 }, snow: { x: 0, z: 92, r: 66 } };
const bw = (b, x, z) => sm(b.r, b.r * 0.55, Math.hypot(x - b.x, z - b.z));

const colBase = new THREE.Color(0x1c1a24), colVill = new THREE.Color(0x2c2520), colFor = new THREE.Color(0x14281f);
const colAut = new THREE.Color(0x3d2c15), colSnow = new THREE.Color(0xd2dcf2), colBed = new THREE.Color(0x0d1a26);
function groundColor(x, z, h, out) {
  out.copy(colBase).lerp(colFor, bw(BIO.forest, x, z)).lerp(colAut, bw(BIO.autumn, x, z))
    .lerp(colSnow, bw(BIO.snow, x, z)).lerp(colVill, sm(28, 14, Math.hypot(x, z)));
  if (h < 0.6) out.lerp(colBed, Math.min(1, (0.6 - h) / 1.5));
  return out;
}

// Caminos de losas que conectan la aldea con todas las zonas
const PATHS = [
  [[-12, 1], [-30, -2], [-50, -6], [-66, -4], [-80, -4]],   // oeste: bosque encantado
  [[12, 1], [30, -2], [50, -6], [66, -4], [80, -4]],        // este: bosque dorado
  [[0, 14], [0, 30], [2, 46], [0, 49]],                     // sur hasta el puente
  [[0, 67], [0, 80], [2, 95], [8, 106]],                    // tras el puente: montañas
  [[1, 72], [-20, 70], [-40, 68]],                          // hacia el lago
  [[0, -10], [-1, -28], [3, -42], [14, -52], [24, -52]],    // norte: cementerio
  [[-1, -30], [-14, -44], [-28, -50]]                       // norte: templo en ruinas
];
PATHS.forEach(p => { for (let i = 0; i < p.length - 1; i++) pathSegs.push([p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]]); });
function distPath(x, z) {
  let best = 1e9;
  for (const s of pathSegs) {
    const dx = s[2] - s[0], dz = s[3] - s[1];
    const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - (s[0] + dx * t), z - (s[1] + dz * t));
    if (d < best) best = d;
  }
  return best;
}

// Zonas con descripción: al entrar se muestra el texto una vez
const zones = [
  { x: -80, z: -4, r: 26, seen: false, text: 'El bosque encantado respira a tu alrededor. Setas de luz fría brotan entre las raíces y miles de luciérnagas parecen susurrar tu nombre.' },
  { x: 80, z: -4, r: 26, seen: false, text: 'Hojas doradas y anaranjadas cubren el suelo. Es un otoño eterno... y los cuervos observan desde las ramas.' },
  { x: 0, z: 92, r: 18, seen: false, text: 'Aquí la nieve no se derrite ni cae. Las montañas se alzan como murallas. Con paciencia, se pueden subir.' },
  { x: 8, z: 108, r: 12, seen: false, text: 'Desde lo alto, el mundo entero parece un tablero apagado. La luna te sonríe desde el norte.' },
  { x: -50, z: 62, r: 22, seen: false, text: 'Un lago negro como un espejo roto. Un barquito vacío flota a la deriva, con un farol aún encendido.' },
  { x: 0, z: 58, r: 9, seen: false, text: 'El puente de piedra cruza el río. Bajo tus pies, el agua susurra historias de quienes no llegaron al otro lado.' },
  { x: 25, z: -52, r: 18, seen: false, text: 'Lápidas torcidas se alzan del barro. Algunas llevan nombres que el tiempo borró. Algo susurra bajo la tierra.' },
  { x: -32, z: -52, r: 16, seen: false, text: 'Columnas rotas de un templo olvidado. Aquí alguien rezó una última vez... y nadie respondió.' },
  { x: 48, z: 40, r: 15, seen: false, text: 'Cristales violetas palpitan en la oscuridad como corazones helados. El aire vibra con una magia antigua y hambrienta.' },
  { x: -40, z: 30, r: 15, seen: false, text: 'Monolitos retorcidos se inclinan hacia ti, como si la piedra se hubiera cansado de estar quieta.' },
  { x: 62, z: 60, r: 24, seen: false, text: 'Arcos de piedra flotan sobre tu cabeza, sin pilares, sin motivo. Ninguno lleva a ningún sitio... o quizá a todos.' },
  { x: 88, z: 40, r: 14, seen: false, text: 'Una escalera asciende en espiral hacia la nada. El primer peldaño está demasiado alto. Nadie ha subido en siglos.' }
];

function scatter(cx, cz, radius) {
  const a = rnd() * 6.283, d = Math.sqrt(rnd()) * radius;
  return [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
}
// Punto válido para colocar objetos: fuera de la aldea, del agua y de los caminos
function pick(cx, cz, r, pathM) {
  for (let i = 0; i < 12; i++) {
    const [x, z] = scatter(cx, cz, r);
    if (Math.abs(x) > MAP - 3 || Math.abs(z) > MAP - 3) continue;
    if (terrain(x, z) < 0.35) continue;
    if (Math.hypot(x, z) < 22) continue;
    if (distPath(x, z) < pathM) continue;
    return [x, z];
  }
  return null;
}

function addObs(x, z, r, h) {
  obstacles.push({ x, z, r, h, gy: heightAt(x, z) });
}

// Malla instanciada. fn(i) coloca la instancia (con dummy); cf(i) devuelve su color (opcional)
function addInstanced(geo, mat, n, fn, cf) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  for (let i = 0; i < n; i++) {
    dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    fn(i);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
    if (cf) m.setColorAt(i, tmpC.set(cf(i)));
  }
  m.count = n;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.frustumCulled = false; // necesario para que las instancias lejanas no desaparezcan
  scene.add(m);
  return m;
}

function glowTex() {
  if (glowTexCache) return glowTexCache;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTexCache = new THREE.CanvasTexture(c);
  return glowTexCache;
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

function lam(c) { return new THREE.MeshLambertMaterial({ color: c, flatShading: true }); }
function bas(c) { return new THREE.MeshBasicMaterial({ color: c }); }
function part(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// ---------- SUELO, AGUA, HIERBA Y CAMINOS ----------
function buildGround() {
  const gg = new THREE.PlaneGeometry(400, 400, 140, 140);
  gg.rotateX(-Math.PI / 2);
  const p = gg.attributes.position;
  const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = terrain(x, z);
    p.setY(i, h);
    groundColor(x, z, h, tmpC);
    cols[i * 3] = tmpC.r; cols[i * 3 + 1] = tmpC.g; cols[i * 3 + 2] = tmpC.b;
  }
  gg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  gg.computeVertexNormals();
  scene.add(new THREE.Mesh(gg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));

  // Agua del lago y del río
  const wg = new THREE.PlaneGeometry(300, 300);
  wg.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: 0x1d3a63, emissive: 0x0a1430, transparent: true, opacity: 0.82 }));
  water.position.y = WATER_Y;
  scene.add(water);

  // Hierba: un solo dibujo para todos los mechones, con color según el bioma
  grassTotal = 4200;
  const gx = [], gz = [], tint = new THREE.Color();
  grass = addInstanced(makeGrassGeo(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), grassTotal, i => {
    let x = 0, z = 0, ok = false;
    for (let t = 0; t < 8 && !ok; t++) {
      x = (rnd() - 0.5) * MAP * 2; z = (rnd() - 0.5) * MAP * 2;
      if (terrain(x, z) < 0.3) continue;
      if (distPath(x, z) < 1.6) continue;
      if (Math.hypot(x, z) < 24 && rnd() < 0.8) continue;
      if (bw(BIO.snow, x, z) > 0.5 && rnd() < 0.8) continue;
      ok = true;
    }
    gx[i] = x; gz[i] = z;
    dummy.position.set(x, ok ? heightAt(x, z) : -60, z);
    dummy.rotation.y = rnd() * 6.28;
    const s = 0.8 + rnd() * 0.8;
    dummy.scale.set(s, 0.7 + rnd() * 0.9, s);
  }, i => {
    const wf = bw(BIO.forest, gx[i], gz[i]), wa = bw(BIO.autumn, gx[i], gz[i]), ws = bw(BIO.snow, gx[i], gz[i]);
    const k = 0.8 + rnd() * 0.6;
    return tint.setRGB((1 + 2 * wa + 2.5 * ws) * k, (1 + 0.6 * wf + 0.5 * wa + 2.8 * ws) * k, Math.max(0.2, 1 + 0.5 * wf - 0.6 * wa + 3.8 * ws) * k);
  });

  // Losas de piedra con musgo
  const slabs = [], moss = [];
  for (const s of pathSegs) {
    const len = Math.hypot(s[2] - s[0], s[3] - s[1]);
    const dx = (s[2] - s[0]) / len, dz = (s[3] - s[1]) / len, nx = -dz, nz = dx;
    for (let d = 0; d < len; d += 1.7) {
      for (const lane of [-0.95, 0.95]) {
        const x = s[0] + dx * d + nx * lane + (rnd() - 0.5) * 0.4, z = s[1] + dz * d + nz * lane + (rnd() - 0.5) * 0.4;
        if (terrain(x, z) < 0.3) continue;
        if (Math.abs(x) < 4.2 && Math.abs(z - BZ) < 10.5) continue; // el puente tiene su propia cubierta
        slabs.push([x, z, Math.atan2(dx, dz) + (rnd() - 0.5) * 0.5, 1.1 + rnd() * 0.6, 0.9 + rnd() * 0.5]);
        if (rnd() < 0.45) moss.push([x + (rnd() - 0.5) * 0.8, z + (rnd() - 0.5) * 0.8, 0.35 + rnd() * 0.4]);
      }
    }
  }
  const stoneCols = [0x5a5866, 0x4c4a58, 0x676370, 0x585e5a, 0x4a5846];
  addInstanced(new THREE.BoxGeometry(1, 0.18, 1), new THREE.MeshLambertMaterial({ flatShading: true }), slabs.length, i => {
    const [x, z, r, w, h] = slabs[i];
    dummy.position.set(x, heightAt(x, z) + 0.08, z);
    dummy.rotation.y = r;
    dummy.scale.set(w, 1, h);
  }, () => stoneCols[(rnd() * stoneCols.length) | 0]);
  const mossCols = [0x2f5a2c, 0x3b6b34, 0x26492a];
  addInstanced(new THREE.SphereGeometry(1, 5, 3), new THREE.MeshLambertMaterial({ flatShading: true }), moss.length, i => {
    const [x, z, s] = moss[i];
    dummy.position.set(x, heightAt(x, z) + 0.14, z);
    dummy.rotation.y = rnd() * 6;
    dummy.scale.set(s, 0.1, s * 0.8);
  }, () => mossCols[(rnd() * mossCols.length) | 0]);
}

// ---------- CARTELES DE MADERA ----------
function makeSign(x, z, text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#7a4f2c'); gr.addColorStop(1, '#5a3820');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2;
  for (let i = 10; i < 128; i += 14) { g.beginPath(); g.moveTo(0, i); g.lineTo(512, i + (i % 3)); g.stroke(); }
  g.strokeStyle = '#2a170a'; g.lineWidth = 8; g.strokeRect(4, 4, 504, 120);
  g.font = '700 32px Cinzel, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,214,160,.55)'; g.fillText(text, 257, 66);
  g.fillStyle = '#140803'; g.fillText(text, 256, 64);
  const wood = lam(0x5a3a22);
  const grp = new THREE.Group();
  part(new THREE.BoxGeometry(0.22, 2.8, 0.22), wood, 0, 1.4, 0, grp);
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.9, 0.12), [wood, wood, wood, wood, new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(c) }), wood]);
  board.position.set(0, 2.35, 0.1);
  grp.add(board);
  grp.position.set(x, heightAt(x, z), z);
  grp.rotation.y = Math.atan2(-x, -z); // mira hacia la aldea
  scene.add(grp);
  addObs(x, z, 0.4, 3);
}
function buildSigns() {
  makeSign(-4, -4, 'ALDEA DE CENIZA');
  makeSign(-22, 3, '◄ BOSQUE ENCANTADO');
  makeSign(22, 3, 'BOSQUE DORADO ►');
  makeSign(3, 26, '▼ TIERRAS NEVADAS');
  makeSign(-4, -24, '▲ CEMENTERIO');
  makeSign(-4, 46, 'PUENTE DE PIEDRA');
  makeSign(5, 90, 'MONTAÑAS DEL SILENCIO');
  makeSign(-30, 66, 'LAGO DE ESPEJOS');
}

// ---------- ÁRBOLES (instanciados) ----------
const trunkGeo = new THREE.CylinderGeometry(0.12, 0.35, 1, 5); trunkGeo.translate(0, 0.5, 0);
function mkTrees(n, cx, cz, rad, h0, h1, pathM) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pick(cx, cz, rad, pathM);
    if (p) out.push({ x: p[0], z: p[1], h: h0 + rnd() * (h1 - h0), r: rnd() * 6.28, c: (rnd() * 8) | 0 });
  }
  return out;
}
function addTrees(list, trunkCol, layers, cols, perch) {
  if (!list.length) return;
  addInstanced(trunkGeo, lam(trunkCol), list.length, i => {
    const t = list[i];
    dummy.position.set(t.x, terrain(t.x, t.z), t.z);
    dummy.scale.set(1, t.h, 1);
  });
  for (const L of layers) {
    addInstanced(L.geo, new THREE.MeshLambertMaterial({ flatShading: true, emissive: L.em || 0x000000 }), list.length, i => {
      const t = list[i];
      dummy.position.set(t.x, terrain(t.x, t.z) + t.h * L.y, t.z);
      dummy.rotation.y = t.r;
      dummy.scale.set(t.h * L.w, t.h * L.s, t.h * L.w);
    }, i => cols[list[i].c % cols.length]);
  }
  for (const t of list) {
    addObs(t.x, t.z, 0.7, 99);
    if (perch) perches.push({ x: t.x, y: terrain(t.x, t.z) + t.h * 0.97, z: t.z });
  }
}
const coneGeo = new THREE.ConeGeometry(1, 1, 6); coneGeo.translate(0, 0.5, 0);
const blobGeo = new THREE.DodecahedronGeometry(1, 0);

// ---------- ALDEA: casas abiertas y fogatas ----------
function makeHouse(v) {
  const g = new THREE.Group();
  const wall = lam(v.wall), roof = lam(v.roof), wood = lam(0x3a2a1c), stone = lam(0x3b3944);
  part(new THREE.BoxGeometry(6.6, 0.25, 5.6), stone, 0, 0.1, 0, g);          // suelo
  part(new THREE.BoxGeometry(6, 3, 0.4), wall, 0, 1.6, -2.5, g);             // pared trasera
  part(new THREE.BoxGeometry(0.4, 3, 5), wall, -3, 1.6, 0, g);               // pared izquierda
  part(new THREE.BoxGeometry(0.4, 3, 5), wall, 3, 1.6, 0, g);                // pared derecha
  part(new THREE.BoxGeometry(6.8, 0.35, 0.4), wood, 0, 3.2, 2.6, g);         // viga: el frente queda abierto
  const r = part(new THREE.ConeGeometry(5, 2.6, 4), roof, 0, 4.5, 0, g);     // tejado
  r.rotation.y = Math.PI / 4; r.scale.set(1.05, 1, 0.9);
  part(new THREE.BoxGeometry(1.3, 0.7, 0.8), wood, -1.2, 0.55, -1.3, g);     // mesa
  part(new THREE.SphereGeometry(0.18, 6, 5), bas(0xffb050), -1.2, 1.15, -1.3, g); // lámpara
  part(new THREE.BoxGeometry(1.4, 0.4, 2.2), lam(v.bed), 1.8, 0.45, -0.9, g); // cama
  return g;
}
function buildVillage() {
  const variants = [
    { wall: 0x5a4636, roof: 0x4a1d1d, bed: 0x6b2a2a }, { wall: 0x4a4a52, roof: 0x2f3a4a, bed: 0x2f4f6a },
    { wall: 0x5a5040, roof: 0x3a2a14, bed: 0x4a5a2a }, { wall: 0x463a4a, roof: 0x3a1a4a, bed: 0x5a2a5a }
  ];
  [55, 125, 235, 305].forEach((deg, k) => {
    const a = deg * Math.PI / 180, x = Math.cos(a) * 20, z = Math.sin(a) * 20;
    const h = makeHouse(variants[k]);
    h.position.set(x, heightAt(x, z), z);
    const rot = Math.atan2(-x, -z);
    h.rotation.y = rot;
    scene.add(h);
    // Colisiones de las paredes (la entrada queda libre)
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const wallPts = [[-3, -2.5], [-1.5, -2.5], [0, -2.5], [1.5, -2.5], [3, -2.5], [-3, -1], [-3, 0.5], [-3, 2], [3, -1], [3, 0.5], [3, 2]];
    for (const [lx, lz] of wallPts) addObs(x + lx * cs + lz * sn, z - lx * sn + lz * cs, 0.8, 3);
  });

  // Fogatas: piedras y troncos instanciados, llama animada
  const spots = [[-9, -7], [7, 6], [-4, 22]], stones = [], logs = [];
  const glowMat = () => new THREE.SpriteMaterial({ map: glowTex(), color: 0xff8a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  for (const [x, z] of spots) {
    const y = heightAt(x, z);
    for (let k = 0; k < 8; k++) stones.push([x + Math.cos(k * 0.785) * 0.95, y + 0.12, z + Math.sin(k * 0.785) * 0.95]);
    for (let k = 0; k < 3; k++) logs.push([x, y + 0.18, z, k * 1.05]);
    const f1 = part(new THREE.ConeGeometry(0.45, 1.3, 6), bas(0xff7a1e), x, y + 0.8, z, scene);
    const f2 = part(new THREE.ConeGeometry(0.26, 0.9, 5), bas(0xffd36a), x, y + 0.6, z, scene);
    const glow = new THREE.Sprite(glowMat());
    glow.scale.set(7, 7, 1); glow.position.set(x, y + 1.3, z);
    scene.add(glow);
    fires.push({ x, z, y, f1, f2, glow, ph: rnd() * 6 });
    addObs(x, z, 1.0, 0.8);
  }
  addInstanced(new THREE.DodecahedronGeometry(0.28, 0), lam(0x4a4854), stones.length, i => {
    dummy.position.set(stones[i][0], stones[i][1], stones[i][2]);
    dummy.rotation.set(i, i * 2, i * 3);
  });
  const logGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.4, 5); logGeo.rotateZ(Math.PI / 2);
  addInstanced(logGeo, lam(0x3a2414), logs.length, i => {
    dummy.position.set(logs[i][0], logs[i][1], logs[i][2]);
    dummy.rotation.y = logs[i][3];
  });
}

// ---------- BOSQUE ENCANTADO ----------
function buildForest() {
  const trees = mkTrees(60, -80, -4, 44, 6, 11, 3);
  addTrees(trees, 0x1a1024, [
    { geo: coneGeo, y: 0.35, w: 0.28, s: 0.55, em: 0x061a1a },
    { geo: coneGeo, y: 0.62, w: 0.2, s: 0.45, em: 0x061a1a }
  ], [0x1b4a45, 0x24605a, 0x2f4a6a, 0x3a2a6a], true);

  // Setas brillantes
  const sh = [];
  for (let i = 0; i < 110; i++) { const p = pick(-80, -4, 44, 2.5); if (p) sh.push([p[0], p[1], 0.4 + rnd() * 1.0]); }
  addInstanced(new THREE.CylinderGeometry(0.12, 0.16, 1, 5).translate(0, 0.5, 0), lam(0xd8d0c0), sh.length, i => {
    const [x, z, s] = sh[i];
    dummy.position.set(x, terrain(x, z), z);
    dummy.scale.set(s * 0.5, s * 0.9, s * 0.5);
  });
  const mushCols = [0x39f5ff, 0xff4fd8, 0x9d6bff, 0x5cff9a];
  addInstanced(new THREE.SphereGeometry(1, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), bas(0xffffff), sh.length, i => {
    const [x, z, s] = sh[i];
    dummy.position.set(x, terrain(x, z) + 0.9 * s, z);
    dummy.scale.set(0.55 * s, 0.4 * s, 0.55 * s);
  }, i => mushCols[i % mushCols.length]);

  // Arbustos (en el bosque y repartidos por el mapa)
  const bushes = [];
  for (let i = 0; i < 90; i++) { const p = pick(-80, -4, 44, 2.2); if (p) bushes.push([p[0], p[1], 0.6 + rnd() * 0.9]); }
  for (let i = 0; i < 30; i++) { const p = pick(0, 0, MAP, 2.2); if (p) bushes.push([p[0], p[1], 0.6 + rnd() * 0.8]); }
  const bushCols = [0x173a2b, 0x1f4a33, 0x2a4a2a];
  addInstanced(blobGeo, new THREE.MeshLambertMaterial({ flatShading: true }), bushes.length, i => {
    const [x, z, s] = bushes[i];
    dummy.position.set(x, terrain(x, z) + s * 0.25, z);
    dummy.rotation.y = rnd() * 6;
    dummy.scale.set(s, s * 0.7, s);
  }, i => bushCols[i % bushCols.length]);

  // Luciérnagas flotando
  const n = 140, pp = new Float32Array(n * 3), cc = new Float32Array(n * 3);
  ffBase = []; ffPh = [];
  for (let i = 0; i < n; i++) {
    const [x, z] = scatter(-80, -4, 42);
    const y = Math.max(terrain(x, z), 0) + 0.8 + rnd() * 3.5;
    ffBase.push([x, y, z]); ffPh.push(rnd() * 6.28);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  fg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  fireflies = new THREE.Points(fg, new THREE.PointsMaterial({
    map: glowTex(), size: 1.1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true
  }));
  fireflies.frustumCulled = false;
  scene.add(fireflies);
}

// ---------- ZONA DE OTOÑO ----------
function buildAutumn() {
  const trees = mkTrees(50, 80, -4, 46, 6, 9.5, 3);
  addTrees(trees, 0x3a2414, [
    { geo: blobGeo, y: 0.72, w: 0.32, s: 0.28 },
    { geo: blobGeo, y: 0.5, w: 0.25, s: 0.2 }
  ], [0xd9822b, 0xe0a030, 0xb8541f, 0xc99a2e, 0x8a4a1c], true);
}

// ---------- ZONA NEVADA: pinos, puente, barquito ----------
function buildSnow() {
  const trees = mkTrees(42, 0, 92, 60, 6, 10, 3);
  addTrees(trees, 0x2a1d16, [
    { geo: coneGeo, y: 0.25, w: 0.26, s: 0.4 },
    { geo: coneGeo, y: 0.5, w: 0.2, s: 0.35 },
    { geo: coneGeo, y: 0.72, w: 0.13, s: 0.3 }
  ], [0xdfe8ff, 0xc8d4ee, 0x9fb2d0], false);
}

function buildBridge() {
  const stone = lam(0x5a5866), dark = lam(0x45434f);
  const seg = [];
  for (let i = 0; i < 10; i++) { const dz = -8.55 + i * 1.9; seg.push(dz); }
  const deckY = dz => 2.35 + 0.9 * (1 - (dz / 9.5) * (dz / 9.5));
  const rotX = dz => Math.atan(1.8 * dz / 90.25);
  addInstanced(new THREE.BoxGeometry(5.2, 0.4, 2.2), stone, seg.length, i => {
    dummy.position.set(0, deckY(seg[i]) - 0.2, BZ + seg[i]);
    dummy.rotation.x = rotX(seg[i]);
  });
  addInstanced(new THREE.BoxGeometry(0.4, 0.9, 2.2), dark, seg.length * 2, i => {
    const dz = seg[i >> 1];
    dummy.position.set((i & 1 ? 2.4 : -2.4), deckY(dz) + 0.45, BZ + dz);
    dummy.rotation.x = rotX(dz);
  });
  for (const dz of [-4.2, 4.2]) part(new THREE.BoxGeometry(5, 4.2, 1.1), dark, 0, 0.3, BZ + dz, scene); // pilares en el agua
}

function buildBoat() {
  const g = new THREE.Group();
  const wood = lam(0x4a3020), inner = lam(0x2a1a10);
  part(new THREE.BoxGeometry(1.5, 0.45, 3.4), wood, 0, 0, 0, g);
  part(new THREE.BoxGeometry(1.2, 0.3, 3.0), inner, 0, 0.14, 0, g);
  const bow = part(new THREE.ConeGeometry(0.75, 1.3, 4), wood, 0, 0, 2.35, g);
  bow.rotation.x = Math.PI / 2; bow.scale.set(1, 1, 0.55);
  part(new THREE.BoxGeometry(1.3, 0.1, 0.4), wood, 0, 0.3, 0.2, g);        // asiento
  const oar = part(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 4), wood, 0.95, 0.55, 0.3, g);
  oar.rotation.z = Math.PI / 2 * 0.9;
  part(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 4), wood, 0, 0.7, 1.3, g); // poste
  part(new THREE.SphereGeometry(0.16, 6, 5), bas(0xffb050), 0, 1.3, 1.3, g);  // farol
  g.position.set(-52, WATER_Y + 0.12, 61);
  scene.add(g);
  boat = g;
  addObs(-52, 61, 1.5, 99);
}

// ---------- TIERRAS MUERTAS: cementerio, templo, cristales y rarezas ----------
function buildOddities() {
  // Árboles muertos (con ramas) en el norte
  const dead = mkTrees(14, 25, -52, 20, 4, 8, 3).concat(mkTrees(12, -32, -52, 18, 4, 8, 3), mkTrees(8, 0, 0, 100, 4, 7, 3));
  addTrees(dead, 0x0f0b12, [], [0], true);
  const branchGeo = new THREE.CylinderGeometry(0.03, 0.1, 1, 4); branchGeo.translate(0, 0.5, 0);
  addInstanced(branchGeo, lam(0x0f0b12), dead.length * 2, i => {
    const t = dead[i >> 1];
    dummy.position.set(t.x, terrain(t.x, t.z) + t.h * (0.55 + rnd() * 0.35), t.z);
    dummy.rotation.set(0, rnd() * 6.28, (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.6));
    dummy.scale.set(1, 1.5 + rnd() * 1.8, 1);
  });

  // Lápidas (se pueden saltar)
  const graves = [];
  for (let i = 0; i < 26; i++) { const p = pick(25, -52, 16, 2); if (p) { graves.push(p); addObs(p[0], p[1], 0.6, 1.1); } }
  addInstanced(new THREE.BoxGeometry(0.8, 1.2, 0.2), lam(0x3a3a46), graves.length, i => {
    const [x, z] = graves[i];
    dummy.position.set(x, terrain(x, z) + 0.45, z);
    dummy.rotation.set((rnd() - 0.5) * 0.3, rnd() * 6.28, (rnd() - 0.5) * 0.3);
  });

  // Rocas repartidas
  const rocks = [];
  for (let i = 0; i < 40; i++) { const p = pick(0, 0, MAP, 3); if (p) { const s = 0.7 + rnd() * 1.6; rocks.push([p[0], p[1], s]); addObs(p[0], p[1], s * 0.9, s * 0.85); } }
  addInstanced(new THREE.DodecahedronGeometry(1, 0), lam(0x2a2a34), rocks.length, i => {
    const [x, z, s] = rocks[i];
    dummy.position.set(x, terrain(x, z) + s * 0.3, z);
    dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    dummy.scale.set(s, s * 0.7, s);
  });

  // Columnas del templo en ruinas
  const pillars = [];
  for (let i = 0; i < 9; i++) { const p = pick(-32, -52, 11, 2.5); if (p) { const h = 1.5 + rnd() * 3.5; pillars.push([p[0], p[1], h]); addObs(p[0], p[1], 0.9, h); } }
  const pillarGeo = new THREE.CylinderGeometry(0.55, 0.65, 1, 6); pillarGeo.translate(0, 0.5, 0);
  addInstanced(pillarGeo, lam(0x4a4854), pillars.length, i => {
    const [x, z, h] = pillars[i];
    dummy.position.set(x, terrain(x, z), z);
    dummy.scale.set(1, h, 1);
  });

  // Cristales (brillan sin gastar luces)
  const crystals = [];
  for (let i = 0; i < 14; i++) { const p = pick(48, 40, 13, 2); if (p) crystals.push([p[0], p[1], 0.6 + rnd() * 0.9]); }
  addInstanced(new THREE.OctahedronGeometry(1, 0), bas(0x9a5cff), crystals.length, i => {
    const [x, z, s] = crystals[i];
    dummy.position.set(x, terrain(x, z) + s * 1.5, z);
    dummy.rotation.y = rnd() * 3;
    dummy.scale.set(s * 0.6, s * 1.8, s * 0.6);
  });

  // ===== ARQUITECTURA SURREALISTA =====
  const strange = lam(0x4a4260);
  const monoGeo = new THREE.BoxGeometry(1.4, 1, 1.4, 1, 12, 1);
  const mp = monoGeo.attributes.position;
  for (let i = 0; i < mp.count; i++) {
    const t = mp.getY(i) + 0.5, a = t * 1.6, k = 1 - t * 0.5;
    const x = mp.getX(i) * k, z = mp.getZ(i) * k;
    mp.setX(i, x * Math.cos(a) - z * Math.sin(a));
    mp.setZ(i, x * Math.sin(a) + z * Math.cos(a));
  }
  monoGeo.translate(0, 0.5, 0);
  monoGeo.computeVertexNormals();
  const monos = [];
  for (let i = 0; i < 10; i++) { const p = pick(-40, 30, 14, 3); if (p) { monos.push([p[0], p[1], 7 + rnd() * 9]); addObs(p[0], p[1], 1.1, 99); } }
  addInstanced(monoGeo, strange, monos.length, i => {
    const [x, z, h] = monos[i];
    dummy.position.set(x, terrain(x, z) - 0.5, z);
    dummy.rotation.set((rnd() - 0.5) * 0.7, rnd() * 6.28, (rnd() - 0.5) * 0.7);
    dummy.scale.set(1, h, 1);
  });

  // Arcos flotantes (se mecen despacio), en el sureste
  const archGeo = new THREE.TorusGeometry(4, 0.8, 5, 10, Math.PI);
  for (let i = 0; i < 6; i++) {
    const [x, z] = scatter(62, 60, 22);
    const m = new THREE.Mesh(archGeo, strange);
    m.scale.setScalar(0.8 + rnd() * 1.1);
    m.position.set(x, 7 + rnd() * 9, z);
    m.rotation.set((rnd() - 0.5) * 0.9, rnd() * 6.28, (rnd() - 0.5) * 1.2);
    scene.add(m);
    arches.push({ m, y: m.position.y, ph: rnd() * 6.28, ry: m.rotation.y });
  }

  // Rocas invertidas colgando en el aire
  const inv = new THREE.ConeGeometry(1, 1, 6); inv.rotateX(Math.PI);
  addInstanced(inv, lam(0x2c2838), 8, () => {
    const [x, z] = scatter(62, 60, 28);
    const s = 2 + rnd() * 3;
    dummy.position.set(x, 14 + rnd() * 14, z);
    dummy.rotation.y = rnd() * 6.28;
    dummy.scale.set(s, s * 1.8, s);
  });

  // Escalera en espiral que sube a la nada (con un arco al final)
  const CX = 88, CZ = 40, R = 6, STEPS = 16;
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
}

function buildWorld() {
  buildGround();
  buildSigns();
  buildVillage();
  buildForest();
  buildAutumn();
  buildSnow();
  buildBridge();
  buildBoat();
  buildOddities();
  buildSky();
}

// =====================================================
//  CIELO: media luna, sol y estrellas
// =====================================================
function buildSky() {
  // Media luna vertical con cara (solo la parte iluminada)
  const mc = document.createElement('canvas');
  mc.width = mc.height = 256;
  moonTex = new THREE.CanvasTexture(mc);
  moonTex.userData = { c: mc.getContext('2d') };
  drawMoon(1, 0.6, 0.6);
  moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, transparent: true, depthWrite: false }));
  moonSprite.scale.set(56, 56, 1);
  moonSprite.renderOrder = 2;
  scene.add(moonSprite);

  // Sol rojo oscuro: aparece de vez en cuando y no aclara el cielo
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sg2 = sc.getContext('2d');
  const sgr = sg2.createRadialGradient(64, 64, 6, 64, 64, 60);
  sgr.addColorStop(0, '#ffb27a'); sgr.addColorStop(0.55, '#d9532c');
  sgr.addColorStop(0.62, 'rgba(150,25,50,0.55)'); sgr.addColorStop(1, 'rgba(120,20,60,0)');
  sg2.fillStyle = sgr; sg2.fillRect(0, 0, 128, 128);
  sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sc), fog: false, transparent: true, depthWrite: false }));
  sunSprite.scale.set(38, 38, 1); sunSprite.renderOrder = 2; sunSprite.visible = false;
  sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xb01d3a, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sunGlow.scale.set(95, 95, 1); sunGlow.renderOrder = 1; sunGlow.visible = false;
  scene.add(sunSprite, sunGlow);

  // Estrellas que parpadean (cada una a su ritmo)
  const N = 500, sp = new Float32Array(N * 3), sc2 = new Float32Array(N * 3);
  starPh = []; starSp = [];
  for (let i = 0; i < N; i++) {
    const u = rnd() * 6.28, v = rnd() * 1.3 + 0.1, r = 160;
    sp[i * 3] = Math.cos(u) * Math.cos(v) * r; sp[i * 3 + 1] = Math.sin(v) * r; sp[i * 3 + 2] = Math.sin(u) * Math.cos(v) * r;
    starPh.push(rnd() * 6.28); starSp.push(0.8 + rnd() * 2.6);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(sc2, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, fog: false, vertexColors: true }));
  stars.frustumCulled = false;
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

// =====================================================
//  CABALLERO Y NPCs LOW-POLY
// =====================================================
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
  if (quest === 1) return { lines: ['¿Buscas fragmentos, ' + playerName + '? Brillan casi tanto como mi gorro. Casi.', 'Sigue los caminos de piedra: una columna está en el bosque encantado, al oeste; otra en el bosque dorado, al este; y la última, en lo alto de la montaña nevada, al sur. Cruza el puente.'] };
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
  addNPC(makeVillager(), 3, -14, 'Aldeano encapuchado', villagerDialogue);
  addNPC(makeGnome(), -10, 3, 'Gnomo del gorro rojo', gnomeDialogue);
  addNPC(makeGoblin(), 14, 5, 'Duende', goblinDialogue);

  // 3 fragmentos de reliquia (columna de luz + cristal flotante): bosque encantado, bosque dorado y montaña
  const spots = [[-84, 12], [86, -20], [8, 106]];
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
        say('Los tres fragmentos vibran juntos en tu mano. Vuelve con el aldeano encapuchado, al norte de la aldea.', 'Reliquia');
      } else {
        say('Fragmento de reliquia recogido (' + frags + '/3). Su luz late como un corazón herido.', 'Reliquia');
      }
      updateQuestUI();
    }
  }
}

// =====================================================
//  CUERVOS CON IA: se posan, esperan, despegan y vuelan alto a otro árbol
// =====================================================
function makeCrow() {
  const g = new THREE.Group();
  const blk = lam(0x0a0a10), beakM = lam(0x3a3320);
  const body = part(new THREE.SphereGeometry(0.28, 6, 5), blk, 0, 0, 0, g);
  body.scale.set(0.8, 0.75, 1.5);
  const head = part(new THREE.SphereGeometry(0.17, 6, 5), blk, 0, 0.12, 0.38, g);
  const beak = part(new THREE.ConeGeometry(0.06, 0.26, 4), beakM, 0, 0.1, 0.6, head.parent);
  beak.rotation.x = Math.PI / 2;
  part(new THREE.BoxGeometry(0.22, 0.04, 0.4), blk, 0, 0, -0.45, g);
  const wl = new THREE.Group(), wr = new THREE.Group();
  wl.position.set(-0.18, 0.08, 0); wr.position.set(0.18, 0.08, 0);
  part(new THREE.BoxGeometry(0.75, 0.04, 0.38), blk, -0.38, 0, 0, wl);
  part(new THREE.BoxGeometry(0.75, 0.04, 0.38), blk, 0.38, 0, 0, wr);
  g.add(wl, wr);
  g.userData = { wl, wr, head };
  g.scale.setScalar(1.5);
  return g;
}
function buildCrows() {
  if (perches.length < 3) return;
  const used = [];
  for (let i = 0; i < 5; i++) {
    let p = perches[(rnd() * perches.length) | 0], tries = 0;
    while (used.includes(p) && tries++ < 10) p = perches[(rnd() * perches.length) | 0];
    used.push(p);
    const m = makeCrow();
    m.position.set(p.x, p.y + 0.25, p.z);
    m.rotation.y = rnd() * 6.28;
    scene.add(m);
    crows.push({ m, state: 'perch', timer: 3 + rnd() * 10, cur: p, from: p, to: p, t: 0, dur: 1, peak: 12, ph: rnd() * 6 });
  }
}
function updateCrows(dt) {
  for (const c of crows) {
    const d = c.m.userData;
    if (c.state === 'perch') {
      c.timer -= dt;
      d.wl.rotation.z = 0.9; d.wr.rotation.z = -0.9;               // alas plegadas
      d.head.rotation.y = Math.sin(time * 0.7 + c.ph) * 0.5;       // mira a su alrededor
      if (c.timer <= 0) {
        let best = null, bd = 0;
        for (let k = 0; k < 10 && !best; k++) {
          const p = perches[(Math.random() * perches.length) | 0];
          const dd = Math.hypot(p.x - c.cur.x, p.z - c.cur.z);
          if (dd > 25 && dd < 80 && !crows.some(o => o !== c && (o.cur === p || o.to === p))) { best = p; bd = dd; }
        }
        if (!best) { c.timer = 3; continue; }
        c.from = c.cur; c.to = best; c.t = 0; c.dur = Math.max(5, bd / 8); c.peak = 10 + Math.random() * 7;
        c.state = 'fly';
        d.head.rotation.y = 0;
        caw(Math.max(0, 1 - Math.hypot(pos.x - c.from.x, pos.z - c.from.z) / 70));
      }
    } else {
      c.t += dt / c.dur;
      const t = Math.min(1, c.t), e = t * t * (3 - 2 * t);
      const x = c.from.x + (c.to.x - c.from.x) * e, z = c.from.z + (c.to.z - c.from.z) * e;
      const y = c.from.y + (c.to.y - c.from.y) * e + Math.sin(Math.PI * t) * c.peak + 0.25;
      let a = Math.atan2(c.to.x - c.from.x, c.to.z - c.from.z) - c.m.rotation.y;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      c.m.rotation.y += a * Math.min(1, dt * 3);
      c.m.rotation.x = -0.25 * Math.cos(Math.PI * t);               // sube al despegar, baja al aterrizar
      const f = Math.sin(time * 16 + c.ph) * 0.8;
      d.wl.rotation.z = f; d.wr.rotation.z = -f;
      c.m.position.set(x, y, z);
      if (c.t >= 1) {
        c.state = 'perch'; c.cur = c.to; c.timer = 8 + Math.random() * 10; // espera antes de volver a despegar
        c.m.rotation.x = 0;
        c.m.position.set(c.to.x, c.to.y + 0.25, c.to.z);
      }
    }
  }
}

function initGame() {
  renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: false, powerPreference: 'low-power' });
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b0a2e);
  scene.fog = new THREE.FogExp2(0x1b0a2e, 0.032); // niebla densa

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 320);
  clock = new THREE.Clock();

  hemi = new THREE.HemisphereLight(0x6a3fb0, 0x050308, 0.7);
  scene.add(hemi);
  moonLight = new THREE.DirectionalLight(0x9a8cff, 0.6);
  scene.add(moonLight, moonLight.target);
  torch = new THREE.PointLight(0xff7a2a, 1.2, 18);
  scene.add(torch);
  fireLight = new THREE.PointLight(0xff8a3a, 0, 24); // una sola luz para la fogata más cercana
  scene.add(fireLight);

  buildWorld();
  buildNPCs();
  buildCrows();
  knight = makeKnight();
  scene.add(knight);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
  animate();
}

// ---------- CIELO CAMBIANTE, ESTRELLAS Y SOL ----------
const SUN_START = 50, SUN_PERIOD = 150, SUN_LEN = 48;
function updateSky() {
  const n = (Math.sin(time * 0.08) + Math.sin(time * 0.035 + 1.3) + Math.sin(time * 0.014 + 4)) / 3;
  const t = Math.max(0, Math.min(1, n * 0.75 + 0.5));
  const f = t * (palette.length - 1);
  const i = Math.min(Math.floor(f), palette.length - 2);
  skyColor.copy(palette[i]).lerp(palette[i + 1], f - i);
  scene.background.copy(skyColor);
  scene.fog.color.copy(skyColor);
  hemi.color.copy(skyColor).offsetHSL(0, 0.1, 0.18);

  // Estrellas parpadeantes
  const ca = stars.geometry.attributes.color;
  for (let k = 0; k < starPh.length; k++) {
    const b = 0.35 + 0.65 * Math.max(0, Math.sin(time * starSp[k] + starPh[k]));
    ca.setXYZ(k, b, b * 0.95, b);
  }
  ca.needsUpdate = true;
  stars.position.copy(camera.position);

  // La luna está fija en el cielo del norte (no gira con la cámara)
  moonSprite.position.set(camera.position.x + 40, camera.position.y + 52, camera.position.z - 170);

  // Sol rojo oscuro: cruza el cielo del sur de vez en cuando (no cambia la luz ni el color del cielo)
  const ph = time < SUN_START ? -1 : ((time - SUN_START) % SUN_PERIOD) / SUN_LEN;
  if (ph < 0 || ph > 1) {
    sunSprite.visible = false; sunGlow.visible = false;
  } else {
    const a = ph * Math.PI, fade = Math.min(1, ph / 0.12, (1 - ph) / 0.12);
    const sx = camera.position.x + Math.cos(a) * 180, sy = camera.position.y + 6 + Math.sin(a) * 72, sz = camera.position.z + 60 + Math.sin(a) * 80;
    sunSprite.position.set(sx, sy, sz); sunGlow.position.set(sx, sy, sz - 1);
    sunSprite.material.opacity = 0.9 * fade; sunGlow.material.opacity = 0.28 * fade;
    sunSprite.visible = true; sunGlow.visible = true;
    if (!sunSaid && ph > 0.1 && !dlg) {
      sunSaid = true;
      say('Un sol rojo como una brasa asoma por el este. No da calor... y el cielo sigue siendo de noche.');
    }
  }
}

function updateArches() {
  for (const a of arches) {
    a.m.position.y = a.y + Math.sin(time * 0.5 + a.ph) * 0.9;
    a.m.rotation.y = a.ry + Math.sin(time * 0.2 + a.ph) * 0.25;
  }
}

function updateFires() {
  let nf = null, bd = 1e9;
  for (const f of fires) {
    const s = 1 + 0.12 * Math.sin(time * 11 + f.ph) + 0.08 * Math.sin(time * 23 + f.ph * 2);
    f.f1.scale.set(0.9 + 0.1 * Math.sin(time * 9 + f.ph), s, 0.9 + 0.1 * Math.cos(time * 8 + f.ph));
    f.f2.scale.set(0.9, s * 1.1, 0.9);
    f.glow.material.opacity = 0.7 + 0.3 * Math.sin(time * 7 + f.ph);
    const d = Math.hypot(pos.x - f.x, pos.z - f.z);
    if (d < bd) { bd = d; nf = f; }
  }
  if (nf && bd < 30) {
    fireLight.position.set(nf.x, nf.y + 1.6, nf.z);
    fireLight.intensity = Math.max(0, 1 - bd / 30) * 2.4 * (0.85 + 0.15 * Math.sin(time * 13) + 0.08 * Math.sin(time * 29));
  } else fireLight.intensity = 0;
}

function updateFireflies() {
  const pa = fireflies.geometry.attributes.position, ca = fireflies.geometry.attributes.color;
  for (let i = 0; i < ffBase.length; i++) {
    const b = ffBase[i], p = ffPh[i];
    pa.setXYZ(i, b[0] + Math.sin(time * 0.5 + p) * 1.6, b[1] + Math.sin(time * 0.8 + p * 2) * 0.7, b[2] + Math.cos(time * 0.45 + p) * 1.6);
    const k = 0.25 + 0.75 * Math.max(0, Math.sin(time * 1.7 + p * 3));
    ca.setXYZ(i, 0.75 * k, 1.0 * k, 0.3 * k);
  }
  pa.needsUpdate = true; ca.needsUpdate = true;
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
  const wading = pos.y < WATER_Y + 0.1;             // dentro del agua se avanza más despacio
  const speed = (keys['shift'] ? 9 : 5) * (wading ? 0.55 : 1);

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
    const dx = pos.x - o.x, dz = pos.z - o.z;
    if (dx * dx + dz * dz > 36) continue;
    if (pos.y - o.gy >= o.h) continue;
    const d = Math.hypot(dx, dz), min = o.r + 0.5;
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
  updateFires();
  updateFireflies();
  updateCrows(dt);
  if (boat) {
    boat.position.y = WATER_Y + 0.12 + Math.sin(time * 1.2) * 0.06;
    boat.rotation.z = Math.sin(time * 0.9) * 0.04;
    boat.rotation.x = Math.sin(time * 0.7 + 1) * 0.03;
  }
  renderer.render(scene, camera);
}
