# 🤖 ROBO·VIEWER VR — Visualizador robótico del cuerpo humano

Juego de **realidad aumentada en el navegador**: apunta la cámara de tu celular
(frontal o trasera) a tu cuerpo y mira cómo tus **manos, dedos, brazos, torso y
cara** se convierten en **mecánica robótica** en tiempo real.

Todo el procesamiento ocurre **localmente en tu dispositivo** (MediaPipe en
WASM): ninguna imagen sale de tu teléfono. El sitio es 100% estático y corre
directamente en **GitHub Pages**.

## ▶ Cómo jugar

1. Toca **INICIAR EXPERIENCIA** y permite el acceso a la cámara.
2. Muestra tus **manos** (o tu cuerpo completo) a la cámara.
3. **Muévete** para cargar la *batería robótica*.
4. Al llegar a **100%** se activa una **⚡ TRANSFORMACIÓN**: tu exoesqueleto
   entra en modo máximo con partículas y ondas de energía.
5. Desbloquea logros: primer contacto, puños de acero, exoesqueleto completo,
   visor facial, y el título **CIBORG COMPLETO** (5 transformaciones).

Controles en pantalla (HUD):

| Botón | Función |
| --- | --- |
| 📷 CAM | Cambiar entre cámara frontal y trasera |
| ⛶ | Pantalla completa (modo VR inmersivo) |
| 🔊 | Activar/desactivar sonido |
| ✕ / SALIR | Salir de la experiencia |
| ✋ MANOS · ⚙️ CUERPO · 👁 CARA | Mostrar/ocultar cada capa robótica |

## 🌐 Publicar en GitHub Pages

Este repositorio ya incluye el workflow
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Para activarlo:

1. En tu repositorio: **Settings → Pages → Build and deployment → Source**
   → selecciona **GitHub Actions**.
2. Empuja a `main` (o usa *Run workflow* en la pestaña *Actions*).
3. Tu juego quedará en `https://<tu-usuario>.github.io/roboticviewer_VR2/`.

No se necesita compilación ni dependencias externas: todos los modelos y el
runtime WASM de MediaPipe vienen dentro del repo (`vendor/`).

## ⚙️ Tecnologías

- **MediaPipe Hands** (soluciones legacy, 21 puntos por mano) → manos robóticas
  con cilindros metálicos, articulaciones, LEDs de punta, reactores palmares y
  servo de muñeca.
- **MediaPipe Pose** (soluciones legacy, 33 puntos) → exoesqueleto: placa
  torácica con núcleo de energía, trusses en brazos/piernas, sockets hexagonales
  en hombros, codos, cadera, rodillas y tobillos.
- **Visor facial**: casco escáner, retículas de ojos giratorias, LEDs de boca.
- Canvas 2D + CSS (efecto scanlines/CRT), WebAudio para efectos de sonido.
- Detección de movimiento → sistema de carga de batería y logros
  (guardados en `localStorage`).
- Rendimiento: si los FPS bajan, se activa automáticamente un *modo eco*
  (pose cada 3 frames) y vuelve a la calidad máxima al estabilizarse.

## 📁 Estructura

```
index.html                 # Pantallas (portada, carga, app, error) + HUD
css/style.css              # Estética AR/HUD
js/main.js                 # Orquestador: cámara, detección, juego, HUD
js/robotics.js             # Dibujo robótico (manos, cuerpo, cara, FX)
js/cam.js                  # Gestión de cámara frontal/trasera
vendor/hands/…             # MediaPipe Hands (JS + WASM + modelos)
vendor/pose/…              # MediaPipe Pose  (JS + WASM + modelos)
.github/workflows/         # Despliegue automático a GitHub Pages
```

## 🔒 Privacidad

- Las imágenes de cámara se procesan 100% en el navegador (WASM local).
- No hay servidores, cookies, analytics ni subida de datos.
- Solo se usa `localStorage` para tu récord de transformaciones y logros.

## 🧰 Solución de problemas

| Problema | Solución |
| --- | --- |
| "Señal perdida" al iniciar | Permite la cámara (icono 🔒 junto a la URL). Asegúrate de estar en HTTPS. |
| La cámara no aparece | Cierra otras apps que la usen; revisa los permisos del navegador. |
| Va lento en móviles antiguos | Se activa el modo eco automáticamente; también puedes ocultar capas con los chips del HUD. |
| Solo hay una cámara | El botón 📷 CAM informa que no hay otra cámara disponible. |

## 📄 Créditos y licencias

- **MediaPipe** (Google) — Apache License 2.0. Los modelos y runtimes de
  `vendor/` son los binarios oficiales de los paquetes npm `@mediapipe/hands`
  v0.4.1675469240 y `@mediapipe/pose` v0.5.1675469404 (incluidos en el repo
  para que el sitio funcione sin dependencias externas).
