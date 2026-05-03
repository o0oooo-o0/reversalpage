/* bg.js — WebGL fluid shader, fully visible 3D liquid */
(function () {

const canvas = document.getElementById('bg-canvas');

/* Try WebGL2 first, fall back to WebGL1 */
let gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

if (!gl) {
  canvas.style.background = 'linear-gradient(135deg,#0a0e1a,#0d1f4a,#0a0e1a)';
  return;
}

let W, H;

function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  gl.viewport(0, 0, W, H);
}
resize();
window.addEventListener('resize', resize);

/* ── Compile shader ── */
function sh(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    console.error(gl.getShaderInfoLog(s));
  return s;
}

function prog(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER,   vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  return p;
}

const VS = `
attribute vec2 p;
void main(){ gl_Position = vec4(p,0,1); }
`;

/* ─────────────────────────────────────────────────────────
   FRAGMENT SHADER
   Procedural 3D liquid using:
   - layered fbm noise for height field
   - analytical normals from height gradient
   - Blinn-Phong specular
   - Fresnel
   - animated mouse-driven warp
   ───────────────────────────────────────────────────────── */
const FS = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;   /* 0..1 */

/* ── Hash & noise ── */
vec2 hash2(vec2 p){
  p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
  return fract(sin(p)*43758.5453);
}

float valueNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = fract(sin(dot(i,              vec2(127.1,311.7)))*43758.5453);
  float b = fract(sin(dot(i+vec2(1,0),    vec2(127.1,311.7)))*43758.5453);
  float c = fract(sin(dot(i+vec2(0,1),    vec2(127.1,311.7)))*43758.5453);
  float d = fract(sin(dot(i+vec2(1,1),    vec2(127.1,311.7)))*43758.5453);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

/* ── fBm (fractal Brownian motion) — gives liquid depth ── */
float fbm(vec2 p){
  float v=0.0, a=0.5;
  mat2 rot = mat2(cos(0.5),sin(0.5),-sin(0.5),cos(0.5));
  for(int i=0;i<6;i++){
    v += a * valueNoise(p);
    p  = rot * p * 2.1;
    a *= 0.48;
  }
  return v;
}

/* ── Domain-warped fbm = realistic fluid swirl ── */
float liquidHeight(vec2 uv, float t){
  /* Slow primary flow */
  vec2 flow = vec2(
    fbm(uv + vec2(t*0.09, t*0.07)),
    fbm(uv + vec2(t*0.07, t*0.11) + vec2(5.2,1.3))
  );
  /* Secondary warp layer */
  vec2 warp = vec2(
    fbm(uv + 2.5*flow + vec2(1.7, 9.2) + t*0.06),
    fbm(uv + 2.5*flow + vec2(8.3, 2.8) + t*0.04)
  );
  return fbm(uv + 2.0*warp);
}

/* ── Analytical normal from height (finite diff) ── */
vec3 getNormal(vec2 uv, float t){
  float eps = 0.004;
  float hC = liquidHeight(uv,           t);
  float hR = liquidHeight(uv+vec2(eps,0),t);
  float hU = liquidHeight(uv+vec2(0,eps),t);
  vec3  N  = normalize(vec3((hC-hR)*28.0, (hC-hU)*28.0, 1.0));
  return N;
}

void main(){
  vec2 uv  = gl_FragCoord.xy / uRes;
  vec2 asp = vec2(uRes.x/uRes.y, 1.0);

  /* Slow zoom/pan */
  float t   = uTime * 0.38;
  vec2  sUV = (uv - 0.5) * asp * 2.2 + 0.5;

  /* Mouse pulls the fluid */
  vec2  mOff = (uMouse - 0.5) * 0.35;
  sUV += mOff * smoothstep(1.5, 0.0, length((uv-0.5)*asp)*2.0);

  /* ── Height field ── */
  float h = liquidHeight(sUV * 1.8, t);

  /* ── Normal ── */
  vec3 N = getNormal(sUV * 1.8, t);

  /* ── Lighting ── */
  vec3 L  = normalize(vec3(0.5, 0.8, 1.4));   /* key light */
  vec3 L2 = normalize(vec3(-0.7, -0.3, 1.0)); /* fill light */
  vec3 V  = vec3(0.0, 0.0, 1.0);

  float diff  = max(dot(N, L),  0.0);
  float diff2 = max(dot(N, L2), 0.0) * 0.3;

  /* Blinn-Phong specular */
  vec3  H1   = normalize(L + V);
  float spec = pow(max(dot(N, H1), 0.0), 180.0) * 2.2;

  /* Fresnel */
  float fres = pow(1.0 - abs(dot(N, V)), 3.8);

  /* ── Color ── */
  /* Deep base: very dark navy */
  vec3 colDeep  = vec3(0.01, 0.03, 0.10);
  /* Mid water: rich blue */
  vec3 colMid   = vec3(0.04, 0.14, 0.48);
  /* Surface crest: bright cyan-blue */
  vec3 colCrest = vec3(0.18, 0.52, 1.00);
  /* Specular: near-white blue */
  vec3 colSpec  = vec3(0.80, 0.92, 1.00);

  /* Mix by height & lighting */
  vec3 col = mix(colDeep, colMid,   smoothstep(0.0, 0.55, h));
       col = mix(col,     colCrest, smoothstep(0.45, 1.0, h) * 0.7);
       col += diff  * colCrest * 0.45;
       col += diff2 * colMid   * 0.2;
       col += spec  * colSpec;
       col += fres  * vec3(0.12, 0.35, 0.90) * 0.7;

  /* Subsurface scatter at crests */
  col += smoothstep(0.6, 1.0, h) * vec3(0.0, 0.18, 0.55) * 0.6;

  /* Vignette */
  float vig = 1.0 - smoothstep(0.45, 1.0, length((uv - 0.5) * 1.4));
  col *= 0.25 + 0.75 * vig;

  /* Boost overall brightness so it's clearly visible */
  col = pow(col * 1.6, vec3(0.88));

  gl_FragColor = vec4(col, 1.0);
}
`;

const program = prog(VS, FS);
gl.useProgram(program);

/* Full-screen triangle */
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
const aP = gl.getAttribLocation(program, 'p');
gl.enableVertexAttribArray(aP);
gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);

const uRes   = gl.getUniformLocation(program, 'uRes');
const uTime  = gl.getUniformLocation(program, 'uTime');
const uMouse = gl.getUniformLocation(program, 'uMouse');

let mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5;

window.addEventListener('mousemove', e => {
  tmx = e.clientX / W;
  tmy = 1.0 - e.clientY / H;
});
window.addEventListener('touchmove', e => {
  tmx = e.touches[0].clientX / W;
  tmy = 1.0 - e.touches[0].clientY / H;
}, { passive: true });

const t0 = performance.now();

(function frame() {
  mx += (tmx - mx) * 0.04;
  my += (tmy - my) * 0.04;

  const t = (performance.now() - t0) * 0.001;

  gl.uniform2f(uRes,   W, H);
  gl.uniform1f(uTime,  t);
  gl.uniform2f(uMouse, mx, my);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
})();

})();
