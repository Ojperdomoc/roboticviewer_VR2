/* ============================================================
   robotics.js — dibujo de la capa robótica sobre la cámara
   ------------------------------------------------------------
   - Mano robótica (21 puntos de MediaPipe Hands)
   - Exoesqueleto (33 puntos de MediaPipe Pose)
   - Visor facial
   - Partículas, ondas expansivas y retícula de "sin señal"
   ============================================================ */

export const ACCENT = '#46f3ff';
export const ACCENT2 = '#ff8a2a';
const STEEL_HI = '#e9f0f8';
const STEEL_MID = '#9aa9bd';
const STEEL_LO = '#3d4759';
const DARK = '#0b111a';

const TAU = Math.PI * 2;

function d2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function lerpPt(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/* ---------- primitivas ---------- */

/** Cilindro metálico (capsula) con gradiente perpendicular. */
function capsule(ctx, ax, ay, bx, by, w) {
  const outlineW = w * 2 + Math.max(1.5, w * 0.5);
  ctx.lineCap = 'round';
  // contorno oscuro
  ctx.strokeStyle = 'rgba(7,11,17,0.9)';
  ctx.lineWidth = outlineW;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  // cuerpo metálico
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const g = ctx.createLinearGradient(ax + nx * w, ay + ny * w, ax - nx * w, ay - ny * w);
  g.addColorStop(0, STEEL_LO);
  g.addColorStop(0.35, STEEL_HI);
  g.addColorStop(0.62, STEEL_MID);
  g.addColorStop(1, STEEL_LO);
  ctx.strokeStyle = g;
  ctx.lineWidth = w * 2;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

/** Arco "robótico" que rota. */
function rotArc(ctx, x, y, r, rot, span, color, lw, glow) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.beginPath();
  ctx.arc(x, y, r, rot, rot + span);
  ctx.stroke();
  ctx.restore();
}

/** Hexágono (socket / tuerca). */
function hexPath(ctx, x, y, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * TAU;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Socket articular: hexágono + aro + perno central. */
function joint(ctx, p, r, t, kind = 'small', power = 0) {
  ctx.save();
  hexPath(ctx, p.x, p.y, r, t * 0.4);
  ctx.fillStyle = 'rgba(10,15,23,0.88)';
  ctx.fill();
  ctx.strokeStyle = STEEL_MID;
  ctx.lineWidth = Math.max(1.4, r * 0.16);
  ctx.stroke();
  // aro de energía
  const glow = 4 + power * 10;
  ctx.strokeStyle = power > 0.4 ? ACCENT2 : ACCENT;
  ctx.globalAlpha = 0.55 + power * 0.45;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = glow;
  ctx.lineWidth = Math.max(1.2, r * 0.12);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 0.62, 0, TAU);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  // perno central
  ctx.fillStyle = STEEL_LO;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 0.24, 0, TAU);
  ctx.fill();
  ctx.restore();
  // arcos giratorios en articulaciones grandes
  if (kind === 'large') {
    rotArc(ctx, p.x, p.y, r * 1.32, t * 1.8, 1.1, ACCENT, 1.6, 3 + power * 6);
    rotArc(ctx, p.x, p.y, r * 1.32, t * 1.8 + Math.PI, 1.1, ACCENT, 1.6, 3 + power * 6);
  }
}

/** Reactor (núcleo de energía pulsante). */
function reactor(ctx, x, y, r, t, power = 0, color = ACCENT) {
  ctx.save();
  const pulse = 1 + 0.14 * Math.sin(t * 4);
  ctx.shadowColor = color;
  ctx.shadowBlur = 8 + power * 22;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(1.4, r * 0.14);
  ctx.beginPath();
  ctx.arc(x, y, r * pulse, 0, TAU);
  ctx.stroke();
  rotArc(ctx, x, y, r * 1.5 * pulse, -t * 2.2, 1.4, color, Math.max(1.2, r * 0.1), 5 + power * 10);
  rotArc(ctx, x, y, r * 1.5 * pulse, -t * 2.2 + Math.PI, 1.4, color, Math.max(1.2, r * 0.1), 5 + power * 10);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.34 * (1 + 0.2 * Math.sin(t * 6)), 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.14, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** LED de punta de dedo. */
function led(ctx, p, r, color, power = 0) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 8 + power * 14;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 0.45, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ============================================================
   MANO ROBÓTICA — 21 landmarks
   0 muñeca · 1-4 pulgar · 5-8 índice · 9-12 medio · 13-16 anular · 17-20 meñique
   ============================================================ */
export function drawRobotHand(ctx, pts, t, power = 0) {
  const P = pts;
  const palmBase = d2(P[0], P[9]);
  if (palmBase < 8) return false;
  const w = Math.max(2.5, palmBase * 0.155); // semiancho de los dedos

  ctx.save();

  // ---- placa palmar ----
  ctx.beginPath();
  ctx.moveTo(P[0].x, P[0].y);
  for (const i of [5, 9, 13, 17]) ctx.lineTo(P[i].x, P[i].y);
  ctx.closePath();
  const cg = ctx.createLinearGradient(P[0].x, P[0].y, P[9].x, P[9].y);
  cg.addColorStop(0, STEEL_LO);
  cg.addColorStop(0.55, '#5c6a7e');
  cg.addColorStop(1, STEEL_MID);
  ctx.fillStyle = cg;
  ctx.globalAlpha = 0.94;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = power > 0.4 ? 'rgba(255,138,42,0.9)' : 'rgba(70,243,255,0.5)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // ---- circuito de la palma ----
  const cx = (P[0].x + P[5].x + P[9].x + P[13].x + P[17].x) / 5;
  const cy = (P[0].y + P[5].y + P[9].y + P[13].y + P[17].y) / 5;
  ctx.strokeStyle = 'rgba(70,243,255,0.4)';
  ctx.lineWidth = 1;
  for (const i of [5, 9, 13, 17]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(P[i].x, P[i].y);
    ctx.stroke();
    // perno en cada articulación base
    ctx.fillStyle = STEEL_LO;
    ctx.beginPath();
    ctx.arc(P[i].x, P[i].y, w * 0.55, 0, TAU);
    ctx.fill();
  }
  reactor(ctx, cx, cy, w * 1.05, t, power);

  // ---- dedos ----
  const fingers = [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [17, 18, 19, 20],
  ];
  for (const chain of fingers) {
    for (let i = 0; i < chain.length - 1; i++) {
      const a = P[chain[i]];
      const b = P[chain[i + 1]];
      const isLast = i === chain.length - 2;
      const ww = isLast ? w * 0.78 : w;
      capsule(ctx, a.x, a.y, b.x, b.y, ww);
    }
    // articulaciones intermedias (PIP / DIP)
    for (let i = 1; i < chain.length - 1; i++) {
      const j = P[chain[i]];
      ctx.save();
      ctx.fillStyle = DARK;
      ctx.beginPath();
      ctx.arc(j.x, j.y, w * 0.62, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = ACCENT;
      ctx.shadowColor = ACCENT;
      ctx.shadowBlur = 3 + power * 8;
      ctx.lineWidth = Math.max(1.1, w * 0.16);
      ctx.stroke();
      ctx.restore();
    }
    // LED de punta
    const tip = P[chain[chain.length - 1]];
    led(ctx, tip, w * 0.5, power > 0.4 ? ACCENT2 : ACCENT, power);
  }

  // ---- muñeca: servo ----
  const wp = P[0];
  ctx.save();
  hexPath(ctx, wp.x, wp.y, w * 1.5, t * 0.7);
  ctx.fillStyle = 'rgba(10,15,23,0.9)';
  ctx.fill();
  ctx.strokeStyle = STEEL_MID;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
  rotArc(ctx, wp.x, wp.y, w * 1.95, -t * 1.6, 1.5, ACCENT2, 2, 5 + power * 10);
  rotArc(ctx, wp.x, wp.y, w * 1.95, -t * 1.6 + Math.PI, 1.5, ACCENT2, 2, 5 + power * 10);
  ctx.fillStyle = ACCENT2;
  ctx.beginPath();
  ctx.arc(wp.x, wp.y, w * 0.3, 0, TAU);
  ctx.fill();

  // ---- modo poder: anillo expansivo desde la palma ----
  if (power > 0.05) {
    const frac = (t * 0.9) % 1;
    ctx.save();
    ctx.globalAlpha = (1 - frac) * power * 0.8;
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, palmBase * (0.4 + frac * 1.6), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
  return true;
}

/* ============================================================
   EXOESQUELETO — 33 landmarks de pose
   ============================================================ */
const POSE = {
  NOSE: 0, LEYE: 2, REYE: 5, LEAR: 7, REAR: 8,
  ML: 9, MR: 10,
  LSH: 11, RSH: 12, LEL: 13, REL: 14, LWR: 15, RWR: 16,
  LHIP: 23, RHIP: 24, LKN: 25, RKN: 26, LAK: 27, RAK: 28,
  LHE: 29, RHE: 30, LFT: 31, RFT: 32,
};

export function poseUnit(U, pts) {
  const L = pts[POSE.LSH];
  const R = pts[POSE.RSH];
  if (L.v > 0.5 && R.v > 0.5) return d2(L, R);
  const Lh = pts[POSE.LHIP];
  const Rh = pts[POSE.RHIP];
  if (Lh.v > 0.5 && Rh.v > 0.5) return d2(Lh, Rh) * 1.05;
  return U;
}

function truss(ctx, a, b, off, color, lw, innerColor, power = 0) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * off;
  const ny = (dx / len) * off;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(7,11,17,0.85)';
  ctx.lineWidth = lw + 2.5;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(a.x + nx, a.y + ny);
  ctx.lineTo(b.x + nx, b.y + ny);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(a.x - nx, a.y - ny);
  ctx.lineTo(b.x - nx, b.y - ny);
  ctx.stroke();
  // línea de energía central
  if (innerColor) {
    ctx.strokeStyle = innerColor;
    ctx.globalAlpha = 0.35 + power * 0.6;
    ctx.lineWidth = Math.max(1, lw * 0.4);
    if (power > 0.3) {
      ctx.shadowColor = innerColor;
      ctx.shadowBlur = 6;
    }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawRobotBody(ctx, pts, U, t, power = 0) {
  const P = pts;
  const v = (i) => (P[i].v ?? 1) > 0.5;
  let visibleJoints = 0;
  for (let i = 11; i <= 32; i++) if (v(i)) visibleJoints++;
  if (visibleJoints < 4) return false;

  const Uu = poseUnit(U, P);
  const chestL = P[POSE.LSH];
  const chestR = P[POSE.RSH];
  const hipL = P[POSE.LHIP];
  const hipR = P[POSE.RHIP];

  ctx.save();

  // ---- placa torácica ----
  if (v(POSE.LSH) && v(POSE.RSH) && v(POSE.LHIP) && v(POSE.RHIP)) {
    ctx.beginPath();
    ctx.moveTo(chestL.x, chestL.y);
    ctx.lineTo(chestR.x, chestR.y);
    ctx.lineTo(hipR.x, hipR.y);
    ctx.lineTo(hipL.x, hipL.y);
    ctx.closePath();
    const tg = ctx.createLinearGradient(chestL.x, chestL.y, hipL.x, hipL.y);
    tg.addColorStop(0, 'rgba(72,86,106,0.72)');
    tg.addColorStop(0.5, 'rgba(38,47,62,0.62)');
    tg.addColorStop(1, 'rgba(20,26,36,0.66)');
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.strokeStyle = power > 0.4 ? 'rgba(255,138,42,0.85)' : 'rgba(70,243,255,0.45)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // costillas
    const nA = lerpPt(chestL, hipL, 0.42);
    const nB = lerpPt(chestR, hipR, 0.42);
    const nC = lerpPt(chestL, hipL, 0.62);
    const nD = lerpPt(chestR, hipR, 0.62);
    ctx.strokeStyle = 'rgba(154,169,189,0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(nA.x, nA.y);
    ctx.lineTo(nB.x, nB.y);
    ctx.moveTo(nC.x, nC.y);
    ctx.lineTo(nD.x, nD.y);
    ctx.stroke();
  }

  // ---- núcleo de energía (pecho) ----
  if (v(POSE.LSH) && v(POSE.RSH)) {
    const midSh = lerpPt(chestL, chestR, 0.5);
    let midHip = lerpPt(hipL, hipR, 0.5);
    if (!v(POSE.LHIP) || !v(POSE.RHIP)) midHip = { x: midSh.x, y: midSh.y + Uu * 0.9 };
    const core = lerpPt(midSh, midHip, 0.32);
    reactor(ctx, core.x, core.y, Uu * 0.16, t, power);
  }

  // ---- extremidades (trusses) ----
  const limbOff = Math.max(2, Uu * 0.045);
  const limbLw = Math.max(2, Uu * 0.05);
  const limbs = [
    [POSE.LSH, POSE.LEL], [POSE.LEL, POSE.LWR],
    [POSE.RSH, POSE.REL], [POSE.REL, POSE.RWR],
    [POSE.LHIP, POSE.LKN], [POSE.LKN, POSE.LAK],
    [POSE.RHIP, POSE.RKN], [POSE.RKN, POSE.RAK],
  ];
  for (const [a, b] of limbs) {
    if (v(a) && v(b)) {
      truss(ctx, P[a], P[b], limbOff, STEEL_MID, limbLw, power > 0.3 ? ACCENT2 : ACCENT, power);
    }
  }
  // pies (líneas finas)
  const feet = [
    [POSE.LAK, POSE.LHE], [POSE.LHE, POSE.LFT],
    [POSE.RAK, POSE.RHE], [POSE.RHE, POSE.RFT],
  ];
  for (const [a, b] of feet) {
    if (v(a) && v(b)) truss(ctx, P[a], P[b], 1.5, STEEL_LO, Math.max(1.5, Uu * 0.025), null, power);
  }

  // ---- barra de cadera ----
  if (v(POSE.LHIP) && v(POSE.RHIP)) {
    truss(ctx, hipL, hipR, limbOff * 0.7, STEEL_MID, limbLw * 0.9, null, power);
  }

  // ---- omoplatos ----
  for (const i of [POSE.LSH, POSE.RSH]) {
    if (!v(i)) continue;
    const s = P[i];
    ctx.save();
    ctx.strokeStyle = STEEL_HI;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = Math.max(2, Uu * 0.035);
    ctx.lineCap = 'round';
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = 4 + power * 8;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Uu * 0.21, -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.stroke();
    ctx.restore();
  }

  // ---- articulaciones ----
  const joints = [
    [POSE.LSH, 'large'], [POSE.RSH, 'large'],
    [POSE.LEL, 'small'], [POSE.REL, 'small'],
    [POSE.LWR, 'small'], [POSE.RWR, 'small'],
    [POSE.LHIP, 'large'], [POSE.RHIP, 'large'],
    [POSE.LKN, 'large'], [POSE.RKN, 'large'],
    [POSE.LAK, 'small'], [POSE.RAK, 'small'],
  ];
  for (const [i, kind] of joints) {
    if (v(i)) {
      const r =
        kind === 'large' ? Math.max(7, Uu * 0.16) : Math.max(5, Uu * 0.11);
      joint(ctx, P[i], r, t, kind, power);
    }
  }

  // ---- cuello (montura de cabeza) ----
  if (v(POSE.LSH) && v(POSE.RSH) && v(POSE.NOSE)) {
    const midSh = lerpPt(chestL, chestR, 0.5);
    const neckTop = lerpPt(midSh, P[POSE.NOSE], 0.55);
    truss(ctx, midSh, neckTop, Math.max(2, Uu * 0.03), STEEL_MID, Math.max(2, Uu * 0.04), null, power);
  }

  ctx.restore();
  return true;
}

/* ============================================================
   VISOR FACIAL
   ============================================================ */
export function drawRobotFace(ctx, pts, U, t, power = 0) {
  const P = pts;
  const v = (i) => (P[i].v ?? 1) > 0.5;
  if (!v(POSE.NOSE) || !v(POSE.LEYE) || !v(POSE.REYE)) return false;

  const nose = P[POSE.NOSE];
  const eyeL = P[POSE.LEYE];
  const eyeR = P[POSE.REYE];
  const Uu = poseUnit(U, P) || U;
  const rEye = Math.max(10, Uu * 0.13);

  ctx.save();

  // ---- casco ----
  let earL = P[POSE.LEAR];
  let earR = P[POSE.REAR];
  let headR = rEye * 3.1;
  if (v(POSE.LEAR) && v(POSE.REAR)) {
    headR = d2(earL, earR) * 0.98;
  }
  ctx.save();
  ctx.strokeStyle = power > 0.4 ? ACCENT2 : ACCENT;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 2;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 6 + power * 12;
  ctx.beginPath();
  ctx.arc(nose.x, nose.y, headR, -Math.PI * 0.88, -Math.PI * 0.12);
  ctx.stroke();
  // marcas radiales
  ctx.globalAlpha = 0.5;
  for (let a = -Math.PI * 0.85; a <= -Math.PI * 0.15; a += Math.PI / 14) {
    ctx.beginPath();
    ctx.moveTo(nose.x + Math.cos(a) * headR, nose.y + Math.sin(a) * headR);
    ctx.lineTo(nose.x + Math.cos(a) * (headR + rEye * 0.3), nose.y + Math.sin(a) * (headR + rEye * 0.3));
    ctx.stroke();
  }
  ctx.restore();

  // ---- rieles de visor (oreja → ojo) ----
  if (v(POSE.LEAR) && v(POSE.REAR)) {
    ctx.strokeStyle = 'rgba(154,169,189,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(earL.x, earL.y);
    ctx.lineTo(eyeL.x, eyeL.y);
    ctx.moveTo(earR.x, earR.y);
    ctx.lineTo(eyeR.x, eyeR.y);
    ctx.stroke();
    for (const e of [earL, earR]) {
      ctx.fillStyle = STEEL_LO;
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(2.5, Uu * 0.025), 0, TAU);
      ctx.fill();
    }
  }

  // ---- retículas de los ojos ----
  const color = power > 0.4 ? ACCENT2 : ACCENT;
  for (const e of [eyeL, eyeR]) {
    rotArc(ctx, e.x, e.y, rEye, t * 1.9, 1.5, color, 1.8, 5 + power * 10);
    rotArc(ctx, e.x, e.y, rEye, t * 1.9 + Math.PI, 1.5, color, 1.8, 5 + power * 10);
    rotArc(ctx, e.x, e.y, rEye * 1.45, -t * 1.3, 0.9, color, 1.2, 3);
    rotArc(ctx, e.x, e.y, rEye * 1.45, -t * 1.3 + Math.PI, 0.9, color, 1.2, 3);
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(e.x, e.y, Math.max(2, rEye * 0.18), 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // ---- nariz: triángulo escáner ----
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.4;
  ctx.shadowColor = color;
  ctx.shadowBlur = 4;
  const nR = Math.max(4, Uu * 0.045);
  ctx.beginPath();
  ctx.moveTo(nose.x, nose.y + nR * 0.4);
  ctx.lineTo(nose.x - nR, nose.y + nR * 1.5);
  ctx.lineTo(nose.x + nR, nose.y + nR * 1.5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // ---- boca: LEDs secuenciales ----
  if (v(POSE.ML) && v(POSE.MR)) {
    const m1 = P[POSE.ML];
    const m2 = P[POSE.MR];
    const nLed = 3;
    const lit = Math.floor(t * 3.5) % nLed;
    for (let i = 0; i < nLed; i++) {
      const p = lerpPt(m1, m2, (i + 0.5) / nLed);
      const on = i === lit;
      ctx.save();
      ctx.fillStyle = on ? color : 'rgba(154,169,189,0.5)';
      if (on) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.8, Uu * 0.02), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore();
  return true;
}

/* ============================================================
   RETÍCULA "BUSCANDO OBJETIVO" (centro, sin detección)
   ============================================================ */
export function drawCrosshair(ctx, cx, cy, t, alpha = 0.4, refSize = 300) {
  const r = Math.max(40, refSize * 0.16);
  ctx.save();
  ctx.globalAlpha = alpha * (0.75 + 0.25 * Math.sin(t * 2.4));
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.6;
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 6;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.arc(cx, cy, r, t * 0.5, t * 0.5 + TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14));
    ctx.lineTo(cx + Math.cos(a) * (r + 14), cy + Math.sin(a) * (r + 14));
    ctx.stroke();
  }
  ctx.restore();
}

/* ============================================================
   PARTÍCULAS Y ONDAS (transformación)
   ============================================================ */
export function makeFx() {
  return { particles: [], rings: [] };
}

export function spawnBurst(fx, x, y, n = 60, colors = [ACCENT, ACCENT2, '#ffffff']) {
  const max = 320;
  for (let i = 0; i < n && fx.particles.length < max; i++) {
    const a = Math.random() * TAU;
    const sp = 60 + Math.random() * 420;
    fx.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 60,
      life: 0.7 + Math.random() * 0.9,
      age: 0,
      r: 1.5 + Math.random() * 3,
      c: colors[Math.floor(Math.random() * colors.length)],
    });
  }
}

export function spawnRing(fx, x, y, maxR) {
  fx.rings.push({ x, y, r: 8, maxR, age: 0, life: 0.9 });
}

export function updateFx(fx, dt) {
  for (const p of fx.particles) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 420 * dt;
    p.vx *= 0.985;
  }
  fx.particles = fx.particles.filter((p) => p.age < p.life);
  for (const r of fx.rings) r.age += dt;
  fx.rings = fx.rings.filter((r) => r.age < r.life);
}

export function drawFx(ctx, fx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of fx.particles) {
    const k = 1 - p.age / p.life;
    ctx.globalAlpha = k * 0.9;
    ctx.fillStyle = p.c;
    ctx.shadowColor = p.c;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (0.5 + k * 0.8), 0, TAU);
    ctx.fill();
  }
  for (const r of fx.rings) {
    const k = r.age / r.life;
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.strokeStyle = ACCENT;
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 3 * (1 - k) + 1;
    ctx.beginPath();
    ctx.arc(r.x, r.y, 8 + (r.maxR - 8) * (1 - Math.pow(1 - k, 2.4)), 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}
