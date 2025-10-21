import { EarthRenderer } from './earthRenderer.js';
import { ScrollController } from './scrollController.js';
import {
  CAMERA_CONFIG,
  EARTH_CONFIG,
  ATMOSPHERE_CONFIG,
} from './config.js';
import {
  mat4Perspective,
  mat4LookAt,
  lerp,
  degToRad,
} from './math.js';

const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl', { antialias: true });

if (!gl) {
  throw new Error('WebGL not supported in this browser.');
}

const renderer = new EarthRenderer(gl);
const scrollController = new ScrollController();

const projectionMatrix = new Float32Array(16);
const viewMatrix = new Float32Array(16);
const cameraPosition = new Float32Array(3);

let accumulatedRotation = 0;
let lastTime = performance.now() * 0.001;

gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);

function resizeCanvas() {
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.floor(canvas.clientWidth * pixelRatio);
  const height = Math.floor(canvas.clientHeight * pixelRatio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
  const aspect = canvas.width / canvas.height;
  mat4Perspective(projectionMatrix, CAMERA_CONFIG.fov, aspect, CAMERA_CONFIG.near, CAMERA_CONFIG.far);
}

function updateCamera(tilt, distance) {
  cameraPosition[0] = 0;
  cameraPosition[1] = Math.sin(tilt) * distance;
  cameraPosition[2] = Math.cos(tilt) * distance;
  mat4LookAt(viewMatrix, cameraPosition, [0, 0, 0], [0, 1, 0]);
}

function updateScene(dt) {
  scrollController.update(dt);
  const section1 = scrollController.sectionProgress(0, 0.33);
  const section2 = scrollController.sectionProgress(0.33, 0.66);
  const section3 = scrollController.sectionProgress(0.66, 1.0);

  const rotationSpeed = lerp(
    EARTH_CONFIG.baseRotationSpeed,
    EARTH_CONFIG.boostedRotationSpeed,
    section1,
  );
  accumulatedRotation += rotationSpeed * dt;

  const scrollRotation = degToRad(EARTH_CONFIG.scrollRotationDegrees) * section2
    + degToRad(EARTH_CONFIG.extraRotationDegreesEnd) * section3;

  const scale = lerp(EARTH_CONFIG.baseScale, EARTH_CONFIG.zoomedScale, section1);

  const nearDistance = lerp(CAMERA_CONFIG.baseDistance, CAMERA_CONFIG.closeDistance, section1);
  const distance = lerp(nearDistance, CAMERA_CONFIG.farDistance, section3);
  const tilt = lerp(0, CAMERA_CONFIG.tiltMax, section2);
  updateCamera(tilt, distance);

  const atmosphereIntensity = lerp(
    ATMOSPHERE_CONFIG.baseIntensity,
    ATMOSPHERE_CONFIG.boostedIntensity,
    section3,
  );

  gl.clearColor(0.02, 0.02, 0.05, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  renderer.render(viewMatrix, projectionMatrix, cameraPosition, {
    scale,
    rotationX: -tilt * 0.35,
    rotationY: accumulatedRotation + scrollRotation,
    atmosphereIntensity,
  });
}

function renderLoop(nowMs) {
  const now = nowMs * 0.001;
  const dt = Math.min(now - lastTime, 1 / 30); // clamp to avoid large jumps
  lastTime = now;

  updateScene(dt);
  requestAnimationFrame(renderLoop);
}

function init() {
  resizeCanvas();
  const textureImage = new Image();
  textureImage.src = './assets/earth_daymap_2048.jpg';
  textureImage.onload = () => {
    renderer.setTexture(textureImage);
    requestAnimationFrame(renderLoop);
  };
}

window.addEventListener('resize', resizeCanvas);
init();
