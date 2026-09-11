/* ============================================================
   main.js — ROBO·VIEWER VR
   Orquestador: pantallas, cámara, detección, juego y HUD
   ============================================================ */

import { startCamera, switchCamera, stopEverything, gumError } from './cam.js';
import {
  drawRobotHand,
  drawRobotBody,
  drawRobotFace,
  drawCrosshair,
  makeFx,
  spawnBurst,
  spawnRing,
  updateFx,
  drawFx,
} from './robotics.js';

/* ---------- utilidades ---------- */
const $ = (id) => document.getElementById(id);
const screens = {
  home: $('screen-home'),
  loading: $('screen-loading'),
  app: $('screen-app'),
  error: $('screen-error'),
};
function show(name) {
  for (const k in screens) screens[k].classList.toggle('active', k === name);
}
function setLoad(pct, msg) {
  $('loading-fill').style.width = Math.min(100, pct) + '%';
  $('loading-status').textContent = msg;
}
function toast(msg, kind = '') {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3100);
  while (box.children.length > 3) box.firstChild.remove();
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

/* ---------- estado persistido ---------- */
const LS_KEY = 'roboviewer_v1';
function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch {
    return {};
  }
}
const save = Object.assign({ transforms: 0, ach: {} }, loadSave());
function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(save));
  } catch {
    /* almacenamiento no disponible */
  }
}

/* ---------- audio ---------- */
const AudioFX = {
  ctx: null,
  on: true,
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },
  beep(f = 880, dur = 0.07, type = 'square', vol = 0.12, delay = 0) {
    if (!this.on || !this.ctx) return;
    try {
      const t0 = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    } catch {
      /* sin audio */
    }
  },
  sweep(f0 = 160, f1 = 1500, dur = 0.85, type = 'sawtooth', vol = 0.13) {
    if (!this.on || !this.ctx) return;
    try {
      const t0 = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    } catch {
      /* sin audio */
    }
  },
  tick() {
    this.beep(1150, 0.05, 'square', 0.07);
  },
  level() {
    this.beep(660, 0.08, 'square', 0.1);
    this.beep(990, 0.1, 'square', 0.1, 0.09);
  },
  transform() {
    this.sweep(150, 1500, 0.9);
    this.beep(1800, 0.12, 'triangle', 0.12, 0.72);
    this.beep(2200, 0.16, 'triangle', 0.1, 0.88);
  },
  ach() {
    this.beep(784, 0.09, 'triangle', 0.12);
    this.beep(1175, 0.15, 'triangle', 0.12, 0.1);
  },
  click() {
    this.beep(420, 0.06, 'square', 0.07);
  },
};

/* ---------- logros ---------- */
const ACH = {
  firstHand: '🤖 Primer contacto: mano robótica detectada',
  bothHands: '🦾 Puños de acero: ¡ambas manos en línea!',
  body: '⚙️ Exoesqueleto: cuerpo completo detectado',
  face: '👁 Visor facial calibrado',
  t1: '⚡ ¡TRANSFORMACIÓN COMPLETADA!',
  t5: '🏆 CIBORG COMPLETO: 5 transformaciones',
};
function unlock(key) {
  if (save.ach[key]) return;
  save.ach[key] = true;
  persist();
  AudioFX.ach();
  toast(ACH[key], 'gold');
}

/* ---------- estado de la app ---------- */
const video = $('cam');
const canvas = $('fx');
const ctx = canvas.getContext('2d');

const state = {
  running: false,
  facing: 'user',
  mirror: true,
  layers: { hands: true, body: true, face: true },
  meter: 0,
  power: 0,
  powerUntil: 0,
  handBusy: false,
  poseBusy: false,
  frame: 0,
  quality: 'alta',
  lowFps: 0,
  highFps: 0,
  fps: 60,
  lastHud: 0,
  lastSignalAt: 0,
  everSignal: false,
  camBusy: false,
  handVel: 0,
  poseVel: 0,
  lastTick: 0, // último umbral de batería superado
};

let hands = null;
let pose = null;
const latest = { hands: null, pose: null };
const prev = { hands: null, handsT: 0, pose: null, poseT: 0 };
const fx = makeFx();
let rafId = 0;
let lastT = 0;
let lastVideoTime = -1;

/* ---------- vista (cover + espejo) ---------- */
const view = { W: 0, H: 0, dw: 0, dh: 0, dx: 0, dy: 0, dpr: 1 };

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  view.W = canvas.clientWidth || window.innerWidth;
  view.H = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(view.W * dpr);
  canvas.height = Math.round(view.H * dpr);
  view.dpr = dpr;
}
function cover() {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const s = Math.max(view.W / vw, view.H / vh);
  view.dw = vw * s;
  view.dh = vh * s;
  view.dx = (view.W - view.dw) / 2;
  view.dy = (view.H - view.dh) / 2;
}
function mapX(x) {
  const px = x * view.dw + view.dx;
  return state.mirror ? view.W - px : px;
}
function mapY(y) {
  return y * view.dh + view.dy;
}

/* ---------- detección: resultados ---------- */
function onHands(r) {
  const now = performance.now();
  if (prev.hands) {
    const dt = Math.max(0.008, (now - prev.handsT) / 1000);
    const count = Math.min(r.landmarks.length, prev.hands.length);
    let total = 0;
    let n = 0;
    for (let h = 0; h < count; h++) {
      for (let i = 0; i < 21; i++) {
        total += Math.hypot(
          r.landmarks[h][i].x - prev.hands[h][i].x,
          r.landmarks[h][i].y - prev.hands[h][i].y
        );
        n++;
      }
    }
    state.handVel = n ? total / n / dt : 0;
  }
  prev.hands = r.landmarks;
  prev.handsT = now;
  latest.hands = r;
}

function onPose(r) {
  const now = performance.now();
  const pts = r.poseLandmarks;
  if (prev.pose && pts && pts.length === prev.pose.length) {
    const dt = Math.max(0.008, (now - prev.poseT) / 1000);
    let total = 0;
    let n = 0;
    for (let i = 0; i < 33; i++) {
      if ((pts[i].visibility ?? 1) > 0.5 && (prev.pose[i].visibility ?? 1) > 0.5) {
        total += Math.hypot(pts[i].x - prev.pose[i].x, pts[i].y - prev.pose[i].y);
        n++;
      }
    }
    state.poseVel = n ? total / n / dt : 0;
  } else {
    state.poseVel = 0;
  }
  prev.pose = pts;
  prev.poseT = now;
  latest.pose = r;
}

/* ---------- transformación ---------- */
function fireTransform(now) {
  save.transforms = (save.transforms || 0) + 1;
  persist();
  $('score').textContent = save.transforms;
  state.meter = 0;
  state.powerUntil = now + 2600;
  state.lastTick = 0;

  // centro del cuerpo (o del centro de la pantalla)
  let cx = view.W / 2;
  let cy = view.H * 0.45;
  const pr = latest.pose;
  if (pr && pr.poseLandmarks && pr.poseLandmarks.length) {
    const L = pr.poseLandmarks[11];
    const R = pr.poseLandmarks[12];
    if ((L.visibility ?? 1) > 0.5 && (R.visibility ?? 1) > 0.5) {
      cx = mapX((L.x + R.x) / 2);
      cy = mapY((L.y + R.y) / 2);
    }
  }
  spawnBurst(fx, cx, cy, 90);
  spawnRing(fx, cx, cy, Math.min(view.W, view.H) * 0.75);

  const hr = latest.hands;
  if (hr) {
    for (const lms of hr.landmarks) {
      const palm = lms[9];
      const hx = mapX(palm.x);
      const hy = mapY(palm.y);
      spawnBurst(fx, hx, hy, 26);
      spawnRing(fx, hx, hy, Math.min(view.W, view.H) * 0.3);
    }
  }

  // banner + flash
  const banner = $('transform-banner');
  banner.classList.add('hidden');
  void banner.offsetWidth;
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 2400);
  const flash = $('flash');
  flash.classList.remove('go');
  void flash.offsetWidth;
  flash.classList.add('go');

  AudioFX.transform();
  unlock('t1');
  if (save.transforms === 5) unlock('t5');
}

/* ---------- bucle principal ---------- */
function loop(now) {
  if (!state.running) return;
  rafId = requestAnimationFrame(loop);

  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
  lastT = now;
  const t = now / 1000;

  if (video.readyState >= 2 && video.videoWidth) {
    cover();

    // 1) enviar cuadro a los detectores
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      state.frame++;
      const eco = state.quality === 'eco';
      if (!state.handBusy && state.layers.hands) {
        state.handBusy = true;
        hands
          .send({ image: video })
          .catch(() => {})
          .finally(() => {
            state.handBusy = false;
          });
      }
      if (
        !state.poseBusy &&
        (state.layers.body || state.layers.face) &&
        (eco ? state.frame % 3 === 0 : true)
      ) {
        state.poseBusy = true;
        pose
          .send({ image: video })
          .catch(() => {})
          .finally(() => {
            state.poseBusy = false;
          });
      }
    }

    // 2) limpiar lienzo y calcular unidades
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.W, view.H);
    const U = Math.min(view.W, view.H) * 0.22;

    // Si una capa está apagada, su detector no se alimenta: no usar datos viejos
    const hr = state.layers.hands ? latest.hands : null;
    const pr = state.layers.body || state.layers.face ? latest.pose : null;
    if (!state.layers.hands) state.handVel = 0;
    if (!state.layers.body && !state.layers.face) state.poseVel = 0;
    const handCount = hr ? hr.landmarks.length : 0;

    let posePts = null;
    let visiblePose = 0;
    if (pr && pr.poseLandmarks && pr.poseLandmarks.length) {
      posePts = pr.poseLandmarks.map((p) => ({
        x: mapX(p.x),
        y: mapY(p.y),
        v: p.visibility ?? 1,
      }));
      for (let i = 11; i <= 32; i++) if (posePts[i].v > 0.5) visiblePose++;
    }

    const signal = handCount > 0 || visiblePose >= 8;
    if (signal) {
      state.lastSignalAt = now;
      state.everSignal = true;
    }

    // 3) batería robótica
    const motion = Math.max(state.handVel, state.poseVel);
    if (signal) {
      if (motion > 0.035) {
        state.meter = Math.min(100, state.meter + (motion - 0.035) * 240 * dt);
      } else {
        state.meter = Math.max(0, state.meter - 9 * dt);
      }
    } else {
      state.meter = Math.max(0, state.meter - 14 * dt);
    }
    for (const th of [25, 50, 75]) {
      if (state.meter >= th && state.lastTick < th) {
        state.lastTick = th;
        if (th < 100) AudioFX.tick();
      }
    }
    if (state.meter < 20) state.lastTick = Math.min(state.lastTick, 0);
    if (state.meter >= 100) fireTransform(now);

    // 4) capas robóticas
    let drewFace = false;
    if (posePts) {
      if (state.layers.body) drawRobotBody(ctx, posePts, U, t, state.power);
      if (state.layers.face) drewFace = drawRobotFace(ctx, posePts, U, t, state.power);
    }
    if (hr && state.layers.hands) {
      for (const lms of hr.landmarks) {
        const pts = lms.map((p) => ({ x: mapX(p.x), y: mapY(p.y), v: p.visibility ?? 1 }));
        drawRobotHand(ctx, pts, t, state.power);
      }
    }

    // 5) efectos
    state.power = Math.max(0, 1 - (now - state.powerUntil) / 2600);
    updateFx(fx, dt);
    drawFx(ctx, fx);

    if (!signal)
      drawCrosshair(ctx, view.W / 2, view.H * 0.45, t, 0.38, Math.min(view.W, view.H));

    // 6) logros
    if (handCount >= 1) unlock('firstHand');
    if (handCount >= 2) unlock('bothHands');
    if (visiblePose >= 10) unlock('body');
    if (drewFace) unlock('face');

    // 7) HUD (throttled)
    if (now - state.lastHud > 200) {
      state.lastHud = now;
      const gap = state.everSignal ? (now - state.lastSignalAt) / 1000 : 99;
      const dot = $('link-dot');
      const lt = $('link-text');
      if (!state.everSignal) {
        dot.className = 'dot search';
        lt.textContent = 'CALIBRANDO…';
      } else if (gap < 2) {
        dot.className = 'dot';
        lt.textContent = 'ENLACE ACTIVO';
      } else if (gap < 7) {
        dot.className = 'dot search';
        lt.textContent = 'SEÑAL DÉBIL';
      } else {
        dot.className = 'dot off';
        lt.textContent = 'BUSCANDO OBJETIVO…';
      }
      $('mode-text').textContent =
        'MANOS: ' + handCount + '/2 · CUERPO: ' + (visiblePose >= 8 ? 'SÍ' : 'NO') +
        (state.quality === 'eco' ? ' · ECO' : '');
    }

    // barra de batería (cada frame)
    const m = Math.round(state.meter);
    $('meter-fill').style.width = m + '%';
    $('meter-fill').classList.toggle('hot', m >= 75);
    $('meter-pct').textContent = m + '%';
    $('meter-hint').textContent = state.power > 0
      ? '⚡ MODO MÁXIMO ⚡'
      : signal
        ? 'Muévete para cargar la energía'
        : 'Muestra tus manos a la cámara';

    // FPS + calidad automática
    state.fps = state.fps * 0.92 + (1 / Math.max(dt, 0.001)) * 0.08;
    if (now - (loop._fpsAt || 0) > 500) {
      loop._fpsAt = now;
      $('fps-text').textContent = 'FPS ' + Math.min(120, Math.round(state.fps));
    }
    if (state.quality === 'alta') {
      if (state.fps < 15) state.lowFps += dt;
      else state.lowFps = 0;
      if (state.lowFps > 4) {
        state.quality = 'eco';
        toast('⚡ Modo eco activado (mejor rendimiento)');
      }
    } else {
      if (state.fps > 24) state.highFps += dt;
      else state.highFps = 0;
      if (state.highFps > 8) {
        state.quality = 'alta';
        toast('Reactivando calidad máxima');
      }
    }
  }
}

/* ---------- ciclo de vida ---------- */
function closeDetectors() {
  try {
    if (hands) hands.close();
  } catch {}
  try {
    if (pose) pose.close();
  } catch {}
  hands = null;
  pose = null;
  latest.hands = null;
  latest.pose = null;
  prev.hands = null;
  prev.pose = null;
}

async function startExperience() {
  const facing = document.querySelector('input[name="cam"]:checked').value || 'user';
  const btn = $('btn-start');
  btn.disabled = true;
  try {
    show('loading');
    setLoad(8, 'Cargando núcleo robótico (WASM)…');
    AudioFX.unlock();

    closeDetectors();
    if (!window.Hands) await loadScript('vendor/hands/hands.js');
    if (!window.Pose) await loadScript('vendor/pose/pose.js');

    setLoad(30, 'Inicializando escáner de manos…');
    hands = new window.Hands({ locateFile: (f) => `vendor/hands/${f}` });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    hands.onResults(onHands);
    await hands.initialize();

    setLoad(60, 'Calibrando sensores de pose…');
    pose = new window.Pose({ locateFile: (f) => `vendor/pose/${f}` });
    pose.setOptions({
      modelComplexity: 0,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      enableSegmentation: false,
    });
    pose.onResults(onPose);
    await pose.initialize();

    setLoad(85, 'Encendiendo cámara…');
    state.facing = facing;
    state.mirror = facing === 'user';
    video.style.transform = state.mirror ? 'scaleX(-1)' : '';
    $('cam-text').textContent = 'CAM: ' + (state.mirror ? 'FRONTAL' : 'TRASERA');
    await startCamera(video, facing);
    resize();
    setLoad(100, '¡SISTEMA EN LÍNEA!');
    $('score').textContent = save.transforms || 0;

    await new Promise((r) => setTimeout(r, 350));
    show('app');
    resize();
    state.running = true;
    lastT = performance.now();
    lastVideoTime = -1;
    state.meter = 0;
    state.lastTick = 0;
    state.everSignal = false;
    state.lastSignalAt = 0;
    rafId = requestAnimationFrame(loop);
    toast('🤖 Sistema robótico activo. Muestra tus manos a la cámara');
  } catch (e) {
    console.error(e);
    stopEverything();
    video.srcObject = null;
    show('error');
    const err = e && e.code ? e : gumError(e);
    const msgs = {
      permission:
        'El navegador no autorizó el acceso a la cámara. Toca el icono 🔒 junto a la URL, permite la cámara y reintenta.',
      nocamera: 'No se encontró ninguna cámara en este dispositivo.',
      busy: 'La cámara está en uso por otra aplicación. Ciérrala y reintenta.',
      notsecure: 'Este sitio necesita HTTPS para acceder a la cámara. Ábrelo desde GitHub Pages (siempre es HTTPS).',
      default:
        'Ocurrió un error al iniciar: ' +
        (e && (e.message || e.code) || 'desconocido'),
    };
    $('error-msg').textContent = msgs[err.code] || msgs.default;
  } finally {
    btn.disabled = false;
  }
}

function exitApp() {
  state.running = false;
  cancelAnimationFrame(rafId);
  stopEverything();
  video.srcObject = null;
  closeDetectors();
  AudioFX.click();
  show('home');
}

function showError(code, message) {
  state.running = false;
  cancelAnimationFrame(rafId);
  const msgs = {
    permission: 'El navegador no autorizó el acceso a la cámara.',
    nocamera: 'No se encontró ninguna cámara en este dispositivo.',
    busy: 'La cámara se desconectó o está en uso por otra aplicación.',
    notsecure: 'Este sitio necesita HTTPS para acceder a la cámara.',
    default: message || 'Error desconocido.',
  };
  $('error-msg').textContent = msgs[code] || msgs.default;
  show('error');
}

/* ---------- interfaz ---------- */
$('btn-start').addEventListener('click', startExperience);
$('btn-retry').addEventListener('click', () => show('home'));
$('btn-exit').addEventListener('click', exitApp);
$('btn-exit2').addEventListener('click', exitApp);

$('btn-cam').addEventListener('click', async () => {
  if (state.camBusy) return;
  state.camBusy = true;
  const label = $('cam-btn-label');
  label.textContent = '…';
  try {
    const facing = await switchCamera(video, state.facing);
    state.facing = facing;
    state.mirror = facing === 'user';
    video.style.transform = state.mirror ? 'scaleX(-1)' : '';
    $('cam-text').textContent = 'CAM: ' + (state.mirror ? 'FRONTAL' : 'TRASERA');
    AudioFX.click();
    toast(facing === 'user' ? '📷 Cámara frontal' : '📷 Cámara trasera');
  } catch (e) {
    if (e && e.code === 'single-cam') {
      toast('Este dispositivo solo tiene una cámara disponible', 'err');
    } else {
      console.error(e);
      toast('No se pudo cambiar de cámara', 'err');
    }
  } finally {
    label.textContent = 'CAM';
    state.camBusy = false;
  }
});

$('btn-fs').addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else if (video.webkitEnterFullscreen) {
    video.webkitEnterFullscreen();
  }
  setTimeout(resize, 350);
});

$('btn-sound').addEventListener('click', () => {
  state.sound = !state.sound;
  AudioFX.on = state.sound;
  $('btn-sound').textContent = state.sound ? '🔊' : '🔇';
  if (state.sound) AudioFX.click();
});

function bindChip(id, key) {
  $(id).addEventListener('click', () => {
    state.layers[key] = !state.layers[key];
    $(id).classList.toggle('active', state.layers[key]);
    AudioFX.click();
  });
}
bindChip('chip-hands', 'hands');
bindChip('chip-body', 'body');
bindChip('chip-face', 'face');

window.addEventListener('robo:camera-lost', () => {
  if (state.running) {
    stopEverything();
    showError('busy', 'La cámara se desconectó.');
  }
});

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 300));

/* si el navegador no puede usar cámara (no HTTPS o antiguo) */
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
  $('btn-start').addEventListener('click', () => {
    $('error-msg').textContent =
      'Tu navegador no soporta el acceso a la cámara en este contexto (se necesita HTTPS).';
    show('error');
  });
}

resize();
