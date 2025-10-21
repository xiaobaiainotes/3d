(() => {
  // Configuration -----------------------------------------------------------
  const CAMERA_CONFIG = {
    fov: 45 * (Math.PI / 180),
    near: 0.1,
    far: 100,
    baseDistance: 3.4,
    closeDistance: 2.4,
    farDistance: 4.2,
    tiltMax: 0.35,
  };

  const EARTH_CONFIG = {
    baseRotationSpeed: 0.08,
    boostedRotationSpeed: 0.18,
    scrollRotationDegrees: 120,
    extraRotationDegreesEnd: 60,
    baseScale: 1,
    zoomedScale: 1.3,
  };

  const ATMOSPHERE_CONFIG = {
    baseIntensity: 0.4,
    boostedIntensity: 0.9,
    radius: 1.02,
    color: [0.33, 0.53, 1.0],
  };

  const LIGHT_CONFIG = {
    direction: [-0.6, 0.4, 0.8],
    ambient: 0.35,
    diffuse: 0.85,
    specular: 0.4,
  };

  const SCROLL_SPRING = {
    stiffness: 8.0,
    damping: 12.0,
  };

  // Math helpers ------------------------------------------------------------
  const MathUtils = (() => {
    function mat4Identity() {
      return new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]);
    }

    function mat4Perspective(out, fovY, aspect, near, far) {
      const f = 1.0 / Math.tan(fovY / 2);
      out[0] = f / aspect;
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;

      out[4] = 0;
      out[5] = f;
      out[6] = 0;
      out[7] = 0;

      out[8] = 0;
      out[9] = 0;
      out[11] = -1;

      if (far != null && far !== Infinity) {
        const nf = 1 / (near - far);
        out[10] = (far + near) * nf;
        out[14] = (2 * far * near) * nf;
      } else {
        out[10] = -1;
        out[14] = -2 * near;
      }

      out[12] = 0;
      out[13] = 0;
      out[15] = 0;
      return out;
    }

    function mat4LookAt(out, eye, center, up) {
      const x0 = eye[0], x1 = eye[1], x2 = eye[2];
      let fx = center[0] - x0;
      let fy = center[1] - x1;
      let fz = center[2] - x2;

      const rlf = 1 / Math.hypot(fx, fy, fz);
      fx *= rlf;
      fy *= rlf;
      fz *= rlf;

      let sx = fy * up[2] - fz * up[1];
      let sy = fz * up[0] - fx * up[2];
      let sz = fx * up[1] - fy * up[0];

      const rls = 1 / Math.hypot(sx, sy, sz);
      sx *= rls;
      sy *= rls;
      sz *= rls;

      let ux = sy * fz - sz * fy;
      let uy = sz * fx - sx * fz;
      let uz = sx * fy - sy * fx;

      out[0] = sx;
      out[1] = ux;
      out[2] = -fx;
      out[3] = 0;

      out[4] = sy;
      out[5] = uy;
      out[6] = -fy;
      out[7] = 0;

      out[8] = sz;
      out[9] = uz;
      out[10] = -fz;
      out[11] = 0;

      out[12] = -(sx * x0 + sy * x1 + sz * x2);
      out[13] = -(ux * x0 + uy * x1 + uz * x2);
      out[14] = fx * x0 + fy * x1 + fz * x2;
      out[15] = 1;
      return out;
    }

    function mat4RotateX(out, a, rad) {
      const s = Math.sin(rad);
      const c = Math.cos(rad);
      const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];

      if (a !== out) {
        out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
        out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
      }

      out[4] = a10 * c + a20 * s;
      out[5] = a11 * c + a21 * s;
      out[6] = a12 * c + a22 * s;
      out[7] = a13 * c + a23 * s;

      out[8] = a20 * c - a10 * s;
      out[9] = a21 * c - a11 * s;
      out[10] = a22 * c - a12 * s;
      out[11] = a23 * c - a13 * s;
      return out;
    }

    function mat4RotateY(out, a, rad) {
      const s = Math.sin(rad);
      const c = Math.cos(rad);
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];

      if (a !== out) {
        out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
        out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
      }

      out[0] = a00 * c - a20 * s;
      out[1] = a01 * c - a21 * s;
      out[2] = a02 * c - a22 * s;
      out[3] = a03 * c - a23 * s;

      out[8] = a00 * s + a20 * c;
      out[9] = a01 * s + a21 * c;
      out[10] = a02 * s + a22 * c;
      out[11] = a03 * s + a23 * c;
      return out;
    }

    function mat4Scale(out, a, v) {
      const x = v[0], y = v[1], z = v[2];
      out[0] = a[0] * x; out[1] = a[1] * x; out[2] = a[2] * x; out[3] = a[3] * x;
      out[4] = a[4] * y; out[5] = a[5] * y; out[6] = a[6] * y; out[7] = a[7] * y;
      out[8] = a[8] * z; out[9] = a[9] * z; out[10] = a[10] * z; out[11] = a[11] * z;
      out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
      return out;
    }

    function mat3FromMat4(out, m) {
      out[0] = m[0]; out[1] = m[1]; out[2] = m[2];
      out[3] = m[4]; out[4] = m[5]; out[5] = m[6];
      out[6] = m[8]; out[7] = m[9]; out[8] = m[10];
      return out;
    }

    function mat3InvertTranspose(out, m) {
      const [
        a00, a01, a02,
        a10, a11, a12,
        a20, a21, a22,
      ] = m;
      const b01 = a22 * a11 - a12 * a21;
      const b11 = -a22 * a10 + a12 * a20;
      const b21 = a21 * a10 - a11 * a20;

      const det = a00 * b01 + a01 * b11 + a02 * b21;
      if (!det) {
        return null;
      }
      const invDet = 1 / det;

      out[0] = b01 * invDet;
      out[1] = (-a22 * a01 + a02 * a21) * invDet;
      out[2] = (a12 * a01 - a02 * a11) * invDet;
      out[3] = b11 * invDet;
      out[4] = (a22 * a00 - a02 * a20) * invDet;
      out[5] = (-a12 * a00 + a02 * a10) * invDet;
      out[6] = b21 * invDet;
      out[7] = (-a21 * a00 + a01 * a20) * invDet;
      out[8] = (a11 * a00 - a01 * a10) * invDet;
      return out;
    }

    function clamp01(v) {
      return Math.min(1, Math.max(0, v));
    }

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    function degToRad(deg) {
      return (deg * Math.PI) / 180;
    }

    return {
      mat4Identity,
      mat4Perspective,
      mat4LookAt,
      mat4RotateX,
      mat4RotateY,
      mat4Scale,
      mat3FromMat4,
      mat3InvertTranspose,
      clamp01,
      lerp,
      degToRad,
    };
  })();

  // GL utilities ------------------------------------------------------------
  const GLUtils = (() => {
    function createShader(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compile failed: ${log}`);
      }
      return shader;
    }

    function createProgram(gl, vertexSrc, fragmentSrc) {
      const program = gl.createProgram();
      const vShader = createShader(gl, gl.VERTEX_SHADER, vertexSrc.trim());
      const fShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSrc.trim());
      gl.attachShader(program, vShader);
      gl.attachShader(program, fShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Program link failed: ${log}`);
      }
      gl.deleteShader(vShader);
      gl.deleteShader(fShader);
      return program;
    }

    function createBuffer(gl, data, target = gl.ARRAY_BUFFER, usage = gl.STATIC_DRAW) {
      const buffer = gl.createBuffer();
      gl.bindBuffer(target, buffer);
      gl.bufferData(target, data, usage);
      gl.bindBuffer(target, null);
      return buffer;
    }

    function createTexture(gl, image) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return texture;
    }

    return {
      createProgram,
      createBuffer,
      createTexture,
    };
  })();

  // Geometry ---------------------------------------------------------------
  const Geometry = (() => {
    function createSphere(latitudeBands = 64, longitudeBands = 64) {
      const positions = [];
      const normals = [];
      const texCoords = [];
      const indices = [];

      for (let lat = 0; lat <= latitudeBands; lat++) {
        const theta = (lat * Math.PI) / latitudeBands;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let lon = 0; lon <= longitudeBands; lon++) {
          const phi = (lon * 2 * Math.PI) / longitudeBands - Math.PI / 2;
          const sinPhi = Math.sin(phi);
          const cosPhi = Math.cos(phi);

          const x = cosPhi * sinTheta;
          const y = cosTheta;
          const z = sinPhi * sinTheta;

          positions.push(x, y, z);
          normals.push(x, y, z);
          texCoords.push(1 - lon / longitudeBands, 1 - lat / latitudeBands);
        }
      }

      for (let lat = 0; lat < latitudeBands; lat++) {
        for (let lon = 0; lon < longitudeBands; lon++) {
          const first = lat * (longitudeBands + 1) + lon;
          const second = first + longitudeBands + 1;

          indices.push(first, second, first + 1);
          indices.push(second, second + 1, first + 1);
        }
      }

      return {
        vertexCount: indices.length,
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        texCoords: new Float32Array(texCoords),
        indices: new Uint16Array(indices),
      };
    }

    return { createSphere };
  })();

  // Scroll controller ------------------------------------------------------
  class ScrollController {
    constructor() {
      this.target = 0;
      this.value = 0;
      this.velocity = 0;
      this.stiffness = SCROLL_SPRING.stiffness;
      this.damping = SCROLL_SPRING.damping;
    }

    update(dt) {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      this.target = maxScroll > 0 ? window.scrollY / maxScroll : 0;
      this.target = MathUtils.clamp01(this.target);

      const displacement = this.target - this.value;
      const acceleration = displacement * this.stiffness - this.velocity * this.damping;
      this.velocity += acceleration * dt;
      this.value += this.velocity * dt;
      this.value = MathUtils.clamp01(this.value);
      return this.value;
    }

    sectionProgress(start, end) {
      const length = end - start;
      if (length <= 0) return 0;
      return MathUtils.clamp01((this.value - start) / length);
    }
  }

  // Earth renderer ---------------------------------------------------------
  class EarthRenderer {
    constructor(gl) {
      this.gl = gl;
      this.ready = false;
      this.sphere = Geometry.createSphere(96, 96);

      this.program = GLUtils.createProgram(gl, EarthRenderer.EARTH_VERTEX_SHADER, EarthRenderer.EARTH_FRAGMENT_SHADER);
      this.atmosphereProgram = GLUtils.createProgram(gl, EarthRenderer.ATMOSPHERE_VERTEX_SHADER, EarthRenderer.ATMOSPHERE_FRAGMENT_SHADER);

      this.buffers = this.createBuffers();
      this.texture = null;

      this.modelMatrix = MathUtils.mat4Identity();
      this.normalMatrix = new Float32Array(9);
      this.normalScratch = new Float32Array(9);
      this.lightScratch = new Float32Array(3);

      this.attribLocations = {
        position: gl.getAttribLocation(this.program, 'aPosition'),
        normal: gl.getAttribLocation(this.program, 'aNormal'),
        texCoord: gl.getAttribLocation(this.program, 'aTexCoord'),
      };

      this.uniformLocations = {
        modelMatrix: gl.getUniformLocation(this.program, 'uModelMatrix'),
        viewMatrix: gl.getUniformLocation(this.program, 'uViewMatrix'),
        projectionMatrix: gl.getUniformLocation(this.program, 'uProjectionMatrix'),
        normalMatrix: gl.getUniformLocation(this.program, 'uNormalMatrix'),
        lightDirection: gl.getUniformLocation(this.program, 'uLightDirection'),
        ambient: gl.getUniformLocation(this.program, 'uAmbient'),
        diffuse: gl.getUniformLocation(this.program, 'uDiffuse'),
        specular: gl.getUniformLocation(this.program, 'uSpecular'),
        cameraPosition: gl.getUniformLocation(this.program, 'uCameraPosition'),
        texture: gl.getUniformLocation(this.program, 'uTexture'),
      };

      this.atmosphereLocations = {
        position: gl.getAttribLocation(this.atmosphereProgram, 'aPosition'),
        modelMatrix: gl.getUniformLocation(this.atmosphereProgram, 'uModelMatrix'),
        viewMatrix: gl.getUniformLocation(this.atmosphereProgram, 'uViewMatrix'),
        projectionMatrix: gl.getUniformLocation(this.atmosphereProgram, 'uProjectionMatrix'),
        scale: gl.getUniformLocation(this.atmosphereProgram, 'uScale'),
        color: gl.getUniformLocation(this.atmosphereProgram, 'uAtmosphereColor'),
        intensity: gl.getUniformLocation(this.atmosphereProgram, 'uIntensity'),
      };
    }

    static get EARTH_VERTEX_SHADER() {
      return `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aTexCoord;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vTexCoord;

void main() {
  vec4 worldPosition = uModelMatrix * vec4(aPosition, 1.0);
  vPosition = worldPosition.xyz;
  vNormal = normalize(uNormalMatrix * aNormal);
  vTexCoord = aTexCoord;
  gl_Position = uProjectionMatrix * uViewMatrix * worldPosition;
}
`;
    }

    static get EARTH_FRAGMENT_SHADER() {
      return `
precision mediump float;

uniform sampler2D uTexture;
uniform vec3 uLightDirection;
uniform float uAmbient;
uniform float uDiffuse;
uniform float uSpecular;
uniform vec3 uCameraPosition;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vTexCoord;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLightDirection);
  vec3 viewDir = normalize(uCameraPosition - vPosition);

  float lambert = max(dot(normal, lightDir), 0.0);
  vec3 reflectDir = reflect(-lightDir, normal);
  float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);

  vec4 color = texture2D(uTexture, vTexCoord);
  vec3 lighting = color.rgb * (uAmbient + uDiffuse * lambert) + uSpecular * spec;
  gl_FragColor = vec4(lighting, 1.0);
}
`;
    }

    static get ATMOSPHERE_VERTEX_SHADER() {
      return `
attribute vec3 aPosition;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform float uScale;

varying vec3 vNormal;

void main() {
  vNormal = normalize(aPosition);
  vec4 scaledPosition = uModelMatrix * vec4(aPosition * uScale, 1.0);
  gl_Position = uProjectionMatrix * uViewMatrix * scaledPosition;
}
`;
    }

    static get ATMOSPHERE_FRAGMENT_SHADER() {
      return `
precision mediump float;

uniform vec3 uAtmosphereColor;
uniform float uIntensity;

varying vec3 vNormal;

void main() {
  float fresnel = pow(1.0 - abs(vNormal.y), 1.5);
  float alpha = clamp(uIntensity * fresnel, 0.0, 1.0);
  gl_FragColor = vec4(uAtmosphereColor * alpha, alpha);
}
`;
    }


    createBuffers() {
      const { gl, sphere } = this;
      return {
        position: GLUtils.createBuffer(gl, sphere.positions),
        normal: GLUtils.createBuffer(gl, sphere.normals),
        texCoord: GLUtils.createBuffer(gl, sphere.texCoords),
        indices: GLUtils.createBuffer(gl, sphere.indices, gl.ELEMENT_ARRAY_BUFFER),
      };
    }

    setTexture(image) {
      this.texture = GLUtils.createTexture(this.gl, image);
      this.ready = true;
    }

    updateModel(scale, rotationX, rotationY) {
      const model = this.modelMatrix;
      model[0] = 1; model[1] = 0; model[2] = 0; model[3] = 0;
      model[4] = 0; model[5] = 1; model[6] = 0; model[7] = 0;
      model[8] = 0; model[9] = 0; model[10] = 1; model[11] = 0;
      model[12] = 0; model[13] = 0; model[14] = 0; model[15] = 1;
      MathUtils.mat4RotateX(model, model, rotationX);
      MathUtils.mat4RotateY(model, model, rotationY);
      MathUtils.mat4Scale(model, model, [scale, scale, scale]);

      const scratch = this.normalScratch;
      MathUtils.mat3FromMat4(scratch, model);
      MathUtils.mat3InvertTranspose(this.normalMatrix, scratch);
    }

    render(viewMatrix, projectionMatrix, cameraPosition, {
      scale,
      rotationX,
      rotationY,
      atmosphereIntensity,
      lightDirection = LIGHT_CONFIG.direction,
    }) {
      if (!this.ready) return;
      const { gl } = this;

      this.updateModel(scale, rotationX, rotationY);
      const model = this.modelMatrix;
      const normalMatrix = this.normalMatrix;

      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
      gl.enableVertexAttribArray(this.attribLocations.position);
      gl.vertexAttribPointer(this.attribLocations.position, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.normal);
      gl.enableVertexAttribArray(this.attribLocations.normal);
      gl.vertexAttribPointer(this.attribLocations.normal, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
      gl.enableVertexAttribArray(this.attribLocations.texCoord);
      gl.vertexAttribPointer(this.attribLocations.texCoord, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);

      gl.uniformMatrix4fv(this.uniformLocations.modelMatrix, false, model);
      gl.uniformMatrix4fv(this.uniformLocations.viewMatrix, false, viewMatrix);
      gl.uniformMatrix4fv(this.uniformLocations.projectionMatrix, false, projectionMatrix);
      gl.uniformMatrix3fv(this.uniformLocations.normalMatrix, false, normalMatrix);
      const light = this.lightScratch;
      const length = Math.hypot(lightDirection[0], lightDirection[1], lightDirection[2]) || 1;
      light[0] = lightDirection[0] / length;
      light[1] = lightDirection[1] / length;
      light[2] = lightDirection[2] / length;
      gl.uniform3fv(this.uniformLocations.lightDirection, light);
      gl.uniform1f(this.uniformLocations.ambient, LIGHT_CONFIG.ambient);
      gl.uniform1f(this.uniformLocations.diffuse, LIGHT_CONFIG.diffuse);
      gl.uniform1f(this.uniformLocations.specular, LIGHT_CONFIG.specular);
      gl.uniform3fv(this.uniformLocations.cameraPosition, cameraPosition);
      gl.uniform1i(this.uniformLocations.texture, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);

      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.drawElements(gl.TRIANGLES, this.sphere.vertexCount, gl.UNSIGNED_SHORT, 0);

      gl.useProgram(this.atmosphereProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
      gl.enableVertexAttribArray(this.atmosphereLocations.position);
      gl.vertexAttribPointer(this.atmosphereLocations.position, 3, gl.FLOAT, false, 0, 0);

      gl.uniformMatrix4fv(this.atmosphereLocations.modelMatrix, false, model);
      gl.uniformMatrix4fv(this.atmosphereLocations.viewMatrix, false, viewMatrix);
      gl.uniformMatrix4fv(this.atmosphereLocations.projectionMatrix, false, projectionMatrix);
      gl.uniform1f(this.atmosphereLocations.scale, ATMOSPHERE_CONFIG.radius);
      gl.uniform3fv(this.atmosphereLocations.color, ATMOSPHERE_CONFIG.color);
      gl.uniform1f(this.atmosphereLocations.intensity, atmosphereIntensity);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.cullFace(gl.FRONT);

      gl.drawElements(gl.TRIANGLES, this.sphere.vertexCount, gl.UNSIGNED_SHORT, 0);

      gl.cullFace(gl.BACK);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }
  }

  // Bootstrap --------------------------------------------------------------
  function main() {
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
      MathUtils.mat4Perspective(projectionMatrix, CAMERA_CONFIG.fov, aspect, CAMERA_CONFIG.near, CAMERA_CONFIG.far);
    }

    function updateCamera(tilt, distance) {
      cameraPosition[0] = 0;
      cameraPosition[1] = Math.sin(tilt) * distance;
      cameraPosition[2] = Math.cos(tilt) * distance;
      MathUtils.mat4LookAt(viewMatrix, cameraPosition, [0, 0, 0], [0, 1, 0]);
    }

    function updateScene(dt) {
      scrollController.update(dt);
      const section1 = scrollController.sectionProgress(0, 0.33);
      const section2 = scrollController.sectionProgress(0.33, 0.66);
      const section3 = scrollController.sectionProgress(0.66, 1.0);

      const rotationSpeed = MathUtils.lerp(
        EARTH_CONFIG.baseRotationSpeed,
        EARTH_CONFIG.boostedRotationSpeed,
        section1,
      );
      accumulatedRotation += rotationSpeed * dt;

      const scrollRotation = MathUtils.degToRad(EARTH_CONFIG.scrollRotationDegrees) * section2
        + MathUtils.degToRad(EARTH_CONFIG.extraRotationDegreesEnd) * section3;

      const scale = MathUtils.lerp(EARTH_CONFIG.baseScale, EARTH_CONFIG.zoomedScale, section1);

      const nearDistance = MathUtils.lerp(CAMERA_CONFIG.baseDistance, CAMERA_CONFIG.closeDistance, section1);
      const distance = MathUtils.lerp(nearDistance, CAMERA_CONFIG.farDistance, section3);
      const tilt = MathUtils.lerp(0, CAMERA_CONFIG.tiltMax, section2);
      updateCamera(tilt, distance);

      const atmosphereIntensity = MathUtils.lerp(
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
      const dt = Math.min(now - lastTime, 1 / 30);
      lastTime = now;

      updateScene(dt);
      requestAnimationFrame(renderLoop);
    }

    function init() {
      resizeCanvas();
      const textureImage = new Image();
      if (window.EARTH_TEXTURE_DATA_URI) {
        textureImage.src = window.EARTH_TEXTURE_DATA_URI;
      } else {
        textureImage.crossOrigin = 'anonymous';
        textureImage.src = './assets/earth_daymap_2048.jpg';
      }
      textureImage.onload = () => {
        renderer.setTexture(textureImage);
        requestAnimationFrame(renderLoop);
      };
      textureImage.onerror = () => {
        console.error('Failed to load Earth texture image.');
      };
    }

    window.addEventListener('resize', resizeCanvas);
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
