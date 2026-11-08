// Raymarching shader for the weather-radar volume (object space = box of `uSize` km, centered).
export const RADAR_VERT = /* glsl */ `
out vec3 vPos;
out vec3 vCam;
void main() {
  vPos = position;
  vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const RADAR_FRAG = /* glsl */ `
precision highp float;
precision highp sampler3D;
in vec3 vPos;
in vec3 vCam;
out vec4 outColor;
uniform sampler3D uVol;
uniform sampler2D uLut;
uniform vec3 uSize;
uniform vec3 uOrigin;      // world position of the box center
uniform float uVK;         // vertical exaggeration (world y = object y * uVK)
uniform float uMinStep;
uniform float uMaxStep;
uniform float uGrow;
uniform float uSigma;      // extinction per km at full density
uniform vec2 uFogCenter;
uniform float uFogNear;
uniform float uFogFar;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec3 ro = vCam;
  vec3 rd = normalize(vPos - ro);
  vec3 h = 0.5 * uSize;
  vec3 inv = 1.0 / rd;
  vec3 t0 = (-h - ro) * inv;
  vec3 t1 = (h - ro) * inv;
  vec3 tmn = min(t0, t1);
  vec3 tmx = max(t0, t1);
  float tN = max(max(tmn.x, tmn.y), max(tmn.z, 0.0));
  float tF = min(min(tmx.x, tmx.y), tmx.z);
  if (tF <= tN) discard;

  // Steps grow with distance from the eye (constant screen-space footprint): fewer samples for far weather.
  float k = length(rd * vec3(1.0, uVK, 1.0)); // world length per object-space unit along the ray
  float t = tN + uMinStep * hash(gl_FragCoord.xy);
  vec3 col = vec3(0.0);
  float acc = 0.0;
  for (int i = 0; i < 96; i++) {
    if (t >= tF) break;
    float dt = clamp(t * uGrow, uMinStep, uMaxStep);
    float wStep = dt * k;
    vec3 p = ro + rd * t;
    vec3 u = p / uSize + 0.5;
    float v = texture(uVol, vec3(u.x, 1.0 - u.z, u.y)).r;
    if (v > 0.05) {
      vec4 c = texture(uLut, vec2((v * 255.0 + 0.5) / 256.0, 0.5));
      // soft edges: box sides + top/bottom, and the scene's radial ground fog
      vec2 e = min(u.xz, 1.0 - u.xz);
      float edge = smoothstep(0.0, 0.06, min(e.x, e.y)) * smoothstep(0.0, 0.04, u.y);
      float fog = 1.0 - smoothstep(uFogFar, uFogFar + 40.0, distance(p.xz + uOrigin.xz, uFogCenter));
      // gentle near-camera reduction (not a cutout) so the volume never becomes a solid wall around the eye
      float nearF = mix(0.25, 1.0, smoothstep(1.0, 10.0, t * k));
      float a = c.a * edge * fog * nearF;
      if (a > 0.003) {
        float s = 1.0 - exp(-a * uSigma * wStep);
        vec3 glow = c.rgb * (1.0 + 0.5 * a);
        col += (1.0 - acc) * s * glow;
        acc += (1.0 - acc) * s;
        if (acc > 0.97) break;
      }
    }
    t += dt;
  }
  if (acc < 0.004) discard;
  outColor = vec4(col, acc);
}
`
