// Shaders for the radar "blocks" style: flat-shaded voxel faces with edge lines, and the ground footprint.
const FOG_VERT = /* glsl */ `
uniform vec2 uFogCenter;
uniform float uFogFar;
float radarFog(vec3 world) {
  return 1.0 - smoothstep(uFogFar, uFogFar + 40.0, distance(world.xz, uFogCenter));
}
`

export const BLOCKS_VERT = /* glsl */ `
${FOG_VERT}
attribute vec4 aCol;
attribute vec3 aNrm;
attribute vec2 aUv;
varying vec3 vColor;
varying vec2 vUv;
varying float vFog;
void main() {
  vec3 n = normalize(aNrm);
  // fixed key light: top brightest, sides graded by facing, underside darkest
  float shade = 0.5 + 0.5 * max(dot(n, normalize(vec3(-0.5, 0.85, -0.35))), 0.0);
  if (n.y < -0.5) shade = 0.45;
  float alt = aCol.a; // layer height 0-1
  vColor = aCol.rgb * shade * mix(0.9, 1.08, alt);
  vUv = aUv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vFog = radarFog(w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

export const BLOCKS_FRAG = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying vec2 vUv;
varying float vFog;
void main() {
  vec2 e = min(vUv, 1.0 - vUv);
  vec2 fw = fwidth(vUv);
  // ~1.5 px dark edge, faded out once a face is only a few pixels wide
  float px = min(e.x / max(fw.x, 1e-5), e.y / max(fw.y, 1e-5));
  float line = (1.0 - smoothstep(0.4, 1.6, px)) * (1.0 - smoothstep(0.12, 0.3, max(fw.x, fw.y)));
  vec3 c = vColor * (1.0 - 0.5 * line);
  float a = uOpacity * vFog;
  if (a < 0.01) discard;
  gl_FragColor = vec4(c, a);
}
`

export const FOOT_VERT = /* glsl */ `
${FOG_VERT}
varying vec2 vUv;
varying float vFog;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vFog = radarFog(w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

export const FOOT_FRAG = /* glsl */ `
uniform sampler2D uComp;
uniform sampler2D uLut;
uniform float uOpacity;
varying vec2 vUv;
varying float vFog;
void main() {
  float v = texture2D(uComp, vUv).r;
  if (v < 0.0765) discard; // under ~18 dBZ
  vec3 c = texture2D(uLut, vec2((v * 255.0 + 0.5) / 256.0, 0.5)).rgb;
  gl_FragColor = vec4(c, 0.38 * uOpacity * vFog);
}
`
