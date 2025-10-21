import { createProgram, createBuffer, createTexture } from './gl-utils.js';
import { createSphere } from './geometry.js';
import {
  mat4Identity,
  mat4RotateX,
  mat4RotateY,
  mat4Scale,
  mat3FromMat4,
  mat3InvertTranspose,
} from './math.js';
import { ATMOSPHERE_CONFIG, LIGHT_CONFIG } from './config.js';

const EARTH_VERTEX_SHADER = `
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

const EARTH_FRAGMENT_SHADER = `
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

const ATMOSPHERE_VERTEX_SHADER = `
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

const ATMOSPHERE_FRAGMENT_SHADER = `
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

export class EarthRenderer {
  constructor(gl) {
    this.gl = gl;
    this.ready = false;
    this.sphere = createSphere(96, 96);

    this.program = createProgram(gl, EARTH_VERTEX_SHADER, EARTH_FRAGMENT_SHADER);
    this.atmosphereProgram = createProgram(gl, ATMOSPHERE_VERTEX_SHADER, ATMOSPHERE_FRAGMENT_SHADER);

    this.buffers = this.createBuffers();
    this.texture = null;

    this.modelMatrix = mat4Identity();
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

  createBuffers() {
    const { gl, sphere } = this;
    return {
      position: createBuffer(gl, sphere.positions),
      normal: createBuffer(gl, sphere.normals),
      texCoord: createBuffer(gl, sphere.texCoords),
      indices: createBuffer(gl, sphere.indices, gl.ELEMENT_ARRAY_BUFFER),
    };
  }

  setTexture(image) {
    this.texture = createTexture(this.gl, image);
    this.ready = true;
  }

  updateModel(scale, rotationX, rotationY) {
    const model = this.modelMatrix;
    model[0] = 1; model[1] = 0; model[2] = 0; model[3] = 0;
    model[4] = 0; model[5] = 1; model[6] = 0; model[7] = 0;
    model[8] = 0; model[9] = 0; model[10] = 1; model[11] = 0;
    model[12] = 0; model[13] = 0; model[14] = 0; model[15] = 1;
    mat4RotateX(model, model, rotationX);
    mat4RotateY(model, model, rotationY);
    mat4Scale(model, model, [scale, scale, scale]);

    const scratch = this.normalScratch;
    mat3FromMat4(scratch, model);
    mat3InvertTranspose(this.normalMatrix, scratch);
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

    // Atmosphere pass
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
