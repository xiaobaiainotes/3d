export const CAMERA_CONFIG = {
  fov: 45 * (Math.PI / 180),
  near: 0.1,
  far: 100,
  baseDistance: 3.4,
  closeDistance: 2.4,
  farDistance: 4.2,
  tiltMax: 0.35,
};

export const EARTH_CONFIG = {
  baseRotationSpeed: 0.08, // radians per second
  boostedRotationSpeed: 0.18,
  scrollRotationDegrees: 120,
  extraRotationDegreesEnd: 60,
  baseScale: 1,
  zoomedScale: 1.3,
};

export const ATMOSPHERE_CONFIG = {
  baseIntensity: 0.4,
  boostedIntensity: 0.9,
  radius: 1.02,
  color: [0.33, 0.53, 1.0],
};

export const LIGHT_CONFIG = {
  direction: [-0.6, 0.4, 0.8],
  ambient: 0.35,
  diffuse: 0.85,
  specular: 0.4,
};

export const SCROLL_SPRING = {
  stiffness: 8.0,
  damping: 12.0,
};
