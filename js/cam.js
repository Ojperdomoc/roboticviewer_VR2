/* ============================================================
   cam.js — gestión de cámaras (frontal / trasera)
   ============================================================ */

let currentStream = null;

function stopStream() {
  if (currentStream) {
    for (const t of currentStream.getTracks()) t.stop();
    currentStream = null;
  }
}

function gumError(e) {
  const name = e && e.name ? e.name : 'Error desconocido';
  let code = name;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') code = 'permission';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') code = 'nocamera';
  if (name === 'NotReadableError' || name === 'TrackStartError') code = 'busy';
  return { code, message: name };
}

/**
 * Enciende la cámara con la orientación indicada ('user' | 'environment').
 */
export async function startCamera(videoEl, facing) {
  stopStream();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  currentStream = stream;
  const track = stream.getVideoTracks()[0];
  track.onended = () => {
    if (currentStream === stream) currentStream = null;
    window.dispatchEvent(new CustomEvent('robo:camera-lost'));
  };
  videoEl.srcObject = stream;
  try {
    await videoEl.play();
  } catch {
    // iOS/Safari: reintentar el play() en el próximo toque del usuario
    const retry = () => {
      videoEl.play().catch(() => {});
      window.removeEventListener('pointerdown', retry, true);
    };
    window.addEventListener('pointerdown', retry, true);
  }
  return stream;
}

/**
 * Busca la otra cámara del dispositivo.
 * Devuelve { deviceId } o null si solo hay una cámara.
 */
export async function findOtherCamera(currentFacing) {
  let devices = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    return null;
  }
  const cams = devices.filter((d) => d.kind === 'videoinput');
  if (cams.length < 2) return null;

  const target = currentFacing === 'user' ? 'environment' : 'user';
  const frontWords = /front|selfie|delanter|frente|user|internal|c\u00e1mara frontal/i;
  const backWords = /back|rear|trasera|dorso|environment|extern/i;

  const byLabel = cams.find((d) => {
    if (!d.label) return false;
    return target === 'user' ? frontWords.test(d.label) : backWords.test(d.label);
  });
  if (byLabel) return { deviceId: byLabel.deviceId };

  // Sin pistas de etiqueta: asumimos que con 2+ cámaras la otra es la opuesta.
  const firstId = cams[0].deviceId;
  const alt = cams.find((d) => d.deviceId !== firstId);
  return alt ? { deviceId: alt.deviceId } : null;
}

/**
 * Cambia entre cámara frontal y trasera.
 * Devuelve la nueva orientación activa.
 */
export async function switchCamera(videoEl, currentFacing) {
  const target = currentFacing === 'user' ? 'environment' : 'user';
  let stream = null;

  // 1) Intento directo pidiendo la orientación opuesta.
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { exact: target },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch {
    // 2) Intento con "ideal" (algunos navegadores rechazan "exact").
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: target },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch {
      stream = null;
    }
  }

  // 3) Si el navegador devolvió la misma cámara, probar con deviceId explícito.
  if (stream) {
    const got = stream.getVideoTracks()[0].getSettings().facingMode;
    if (got && got === currentFacing) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }
  if (!stream) {
    const alt = await findOtherCamera(currentFacing);
    if (!alt) throw Object.assign(new Error('solo-hay-una-camara'), { code: 'single-cam' });
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { exact: alt.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  }

  stopStream();
  currentStream = stream;
  stream.getVideoTracks()[0].onended = () => {
    if (currentStream === stream) currentStream = null;
    window.dispatchEvent(new CustomEvent('robo:camera-lost'));
  };
  videoEl.srcObject = stream;
  await videoEl.play().catch(() => {});
  return target;
}

export function stopEverything() {
  stopStream();
}

export { gumError };
