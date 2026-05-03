/**
 * bg.js — Realistic 3D liquid WebGL background
 * Fluid simulation: velocity field + density advection (Jos Stam style)
 * Rendering: normal map from height field → Phong specular + refraction tint
 */
(function () {

/* ═══════════════════════════════════════════════
   FLUID SIMULATION (CPU grid, N×N)
   ═══════════════════════════════════════════════ */
const N    = 128;   // grid resolution
const ITER = 16;    // pressure solver iterations
const DT   = 0.12;
const VISC = 0.0000015;
const DIFF = 0.000005;

const SIZE = (N + 2) * (N + 2);
function idx(x, y) { return x + (N + 2) * y; }

let vx   = new Float32Array(SIZE);
let vy   = new Float32Array(SIZE);
let vx0  = new Float32Array(SIZE);
let vy0  = new Float32Array(SIZE);
let dens = new Float32Array(SIZE);
let dens0= new Float32Array(SIZE);

function setBnd(b, x) {
  for (let i = 1; i <= N; i++) {
    x[idx(0,   i)] = b === 1 ? -x[idx(1, i)] : x[idx(1, i)];
    x[idx(N+1, i)] = b === 1 ? -x[idx(N, i)] : x[idx(N, i)];
    x[idx(i,   0)] = b === 2 ? -x[idx(i, 1)] : x[idx(i, 1)];
    x[idx(i, N+1)] = b === 2 ? -x[idx(i, N)] : x[idx(i, N)];
  }
  x[idx(0,0)]     = 0.5*(x[idx(1,0)]   + x[idx(0,1)]);
  x[idx(0,N+1)]   = 0.5*(x[idx(1,N+1)] + x[idx(0,N)]);
  x[idx(N+1,0)]   = 0.5*(x[idx(N,0)]   + x[idx(N+1,1)]);
  x[idx(N+1,N+1)] = 0.5*(x[idx(N,N+1)] + x[idx(N+1,N)]);
}

function linSolve(b, x, x0, a, c) {
  const cInv = 1.0 / c;
  for (let k = 0; k < ITER; k++) {
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        x[idx(i,j)] = (x0[idx(i,j)] + a*(x[idx(i-1,j)]+x[idx(i+1,j)]+x[idx(i,j-1)]+x[idx(i,j+1)])) * cInv;
      }
    }
    setBnd(b, x);
  }
}

function diffuse(b, x, x0, diff) {
  const a = DT * diff * N * N;
  linSolve(b, x, x0, a, 1 + 4*a);
}

function advect(b, d, d0, u, v) {
  const dt0 = DT * N;
  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      let x = i - dt0 * u[idx(i,j)];
      let y = j - dt0 * v[idx(i,j)];
      x = Math.max(0.5, Math.min(N + 0.5, x));
      y = Math.max(0.5, Math.min(N + 0.5, y));
      const i0 = Math.floor(x), i1 = i0 + 1;
      const j0 = Math.floor(y), j1 = j0 + 1;
      const s1 = x - i0, s0 = 1 - s1;
      const t1 = y - j0, t0 = 1 - t1;
      d[idx(i,j)] = s0*(t0*d0[idx(i0,j0)] + t1*d0[idx(i0,j1)]) +
                    s1*(t0*d0[idx(i1,j0)] + t1*d0[idx(i1,j1)]);
    }
  }
  setBnd(b, d);
}

function project(u, v, p, div) {
  const h = 1.0 / N;
  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      div[idx(i,j)] = -0.5*h*(u[idx(i+1,j)]-u[idx(i-1,j)]+v[idx(i,j+1)]-v[idx(i,j-1)]);
      p[idx(i,j)] = 0;
    }
  }
  setBnd(0, div); setBnd(0, p);
  linSolve(0, p, div, 1, 4);
  const scale = 0.5 / h;
  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      u[idx(i,j)] -= scale * (p[idx(i+1,j)] - p[idx(i-1,j)]);
      v[idx(i,j)] -= scale * (p[idx(i,j+1)] - p[idx(i,j-1)]);
    }
  }
  setBnd(1, u); setBnd(2, v);
}

function velStep(u, v, u0, v0) {
  // Add viscosity
  for (let i = 0; i < SIZE; i++) { u0[i] += DT * u[i]; v0[i] += DT * v[i]; }
  [u, u0] = swap(u, u0); diffuse(1, u, u0, VISC);
  [v, v0] = swap(v, v0); diffuse(2, v, v0, VISC);
  project(u, v, u0, v0);
  [u0, u] = swap(u0, u); [v0, v] = swap(v0, v);
  advect(1, u, u0, u0, v0);
  advect(2, v, v0, u0, v0);
  project(u, v, u0, v0);
  // write back
  for (let i = 0; i < SIZE; i++) { vx[i]=u[i]; vy[i]=v[i]; vx0[i]=u0[i]; vy0[i]=v0[i]; }
}

function densStep(d, d0, u, v) {
  for (let i = 0; i < SIZE; i++) d0[i] += DT * d[i];
  [d, d0] = swap(d, d0); diffuse(0, d, d0, DIFF);
  [d0, d] = swap(d0, d); advect(0, d, d0, u, v);
  for (let i = 0; i < SIZE; i++) { dens[i]=d[i]; dens0[i]=d0[i]; }
}

function swap(a, b) { return [b, a]; }

/* ═══════════════════════════════════════════════
   WEBGL RENDERER
   ═══════════════════════════════════════════════ */
const canvas = document.getElementById('bg-canvas');
const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });

if (!gl) {
  // Fallback: hide canvas, show plain bg
  canvas.style.display = 'none';
  document.body.style.background = '#0d1117';
  return;
}

let W, H;

/* ── Shaders ── */
const VS = `
attribute vec2 a_pos;
varying   vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FS = `
precision highp float;
varying vec2 v_uv;

uniform sampler2D u_height;  // R=density height field
uniform vec2      u_res;
uniform float     u_time;
uniform vec2      u_mouse;   // 0..1

// ── Normal from height ──
vec3 getNormal(vec2 uv) {
  vec2 texel = 1.0 / u_res;
  float hL = texture2D(u_height, uv - vec2(texel.x, 0.0)).r;
  float hR = texture2D(u_height, uv + vec2(texel.x, 0.0)).r;
  float hD = texture2D(u_height, uv - vec2(0.0, texel.y)).r;
  float hU = texture2D(u_height, uv + vec2(0.0, texel.y)).r;
  // Scale controls "bumpiness"
  return normalize(vec3((hL - hR) * 18.0, (hD - hU) * 18.0, 0.35));
}

void main() {
  vec2 uv = v_uv;

  // ── Height sample ──
  float h = texture2D(u_height, uv).r;

  // ── Normal map ──
  vec3 N = getNormal(uv);

  // ── Light direction (slightly above, from top-left) ──
  vec3 L = normalize(vec3(-0.4, 0.7, 1.2));

  // ── View direction ──
  vec3 V = vec3(0.0, 0.0, 1.0);

  // ── Diffuse ──
  float diff = max(dot(N, L), 0.0);

  // ── Specular (Blinn-Phong) ──
  vec3 H2 = normalize(L + V);
  float spec = pow(max(dot(N, H2), 0.0), 96.0);

  // ── Fresnel rim ──
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.5);

  // ── Base deep-blue color ──
  vec3 deepBlue  = vec3(0.02, 0.04, 0.14);
  vec3 midBlue   = vec3(0.05, 0.15, 0.45);
  vec3 highBlue  = vec3(0.25, 0.55, 1.00);
  vec3 specColor = vec3(0.70, 0.85, 1.00);

  // Mix based on height and diffuse
  vec3 base = mix(deepBlue, midBlue, h * 2.5);
  base = mix(base, highBlue, diff * 0.5);

  // Add specular highlight
  base += spec * specColor * 1.8;

  // Fresnel edge glow
  base += fresnel * vec3(0.1, 0.3, 0.8) * 0.6;

  // ── Refraction-like tint at surface crests ──
  float crest = smoothstep(0.3, 0.7, h);
  base += crest * vec3(0.05, 0.15, 0.35) * 0.8;

  // ── Subsurface scatter fake ──
  float scatter = pow(h, 2.0) * 0.4;
  base += scatter * vec3(0.0, 0.1, 0.5);

  // Darken edges
  float vignette = smoothstep(1.0, 0.3, length(v_uv - 0.5));
  base *= 0.4 + 0.6 * vignette;

  gl_FragColor = vec4(base, 1.0);
}`;

function compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

const prog = gl.createProgram();
gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, VS));
gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);
gl.useProgram(prog);

// Full-screen quad
const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(prog, 'a_pos');
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

// Texture for height field
const tex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

const uHeight = gl.getUniformLocation(prog, 'u_height');
const uRes    = gl.getUniformLocation(prog, 'u_res');
const uTime   = gl.getUniformLocation(prog, 'u_time');
const uMouse  = gl.getUniformLocation(prog, 'u_mouse');

// Texture data buffer (RGBA, N+2 square)
const TEX_SIZE = N + 2;
const texData  = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);

function uploadTexture() {
  // Build RGBA from density field, normalize
  let maxD = 0.0001;
  for (let i = 0; i < SIZE; i++) if (dens[i] > maxD) maxD = dens[i];
  const inv = 1.0 / maxD;
  for (let j = 0; j < TEX_SIZE; j++) {
    for (let i = 0; i < TEX_SIZE; i++) {
      const val = Math.min(1, dens[idx(i,j)] * inv);
      const v8  = (val * 255) | 0;
      const p   = (j * TEX_SIZE + i) * 4;
      texData[p] = texData[p+1] = texData[p+2] = v8;
      texData[p+3] = 255;
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, TEX_SIZE, TEX_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, texData);
}

/* ── Resize ── */
function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  gl.viewport(0, 0, W, H);
}
resize();
window.addEventListener('resize', resize);

/* ── Input ── */
let mouse = { x: 0.5, y: 0.5 };
let prevMouse = { x: 0.5, y: 0.5 };

window.addEventListener('mousemove', e => {
  prevMouse.x = mouse.x; prevMouse.y = mouse.y;
  mouse.x = e.clientX / window.innerWidth;
  mouse.y = 1.0 - e.clientY / window.innerHeight;
});
window.addEventListener('touchmove', e => {
  const t = e.touches[0];
  prevMouse.x = mouse.x; prevMouse.y = mouse.y;
  mouse.x = t.clientX / window.innerWidth;
  mouse.y = 1.0 - t.clientY / window.innerHeight;
}, { passive: true });

/* ── Auto-swirl (ambient motion when no mouse) ── */
let autoT = 0;

function addAutoForce(t) {
  autoT += 0.008;
  // Multiple orbiting sources
  const sources = [
    { ax: 0.5 + 0.35*Math.cos(autoT*0.7),      ay: 0.5 + 0.35*Math.sin(autoT*0.5),      str: 0.6 },
    { ax: 0.5 + 0.25*Math.cos(autoT*0.9 + 2),  ay: 0.5 + 0.25*Math.sin(autoT*0.6 + 2),  str: 0.4 },
    { ax: 0.5 + 0.15*Math.cos(autoT*1.3 + 4),  ay: 0.5 + 0.15*Math.sin(autoT*1.1 + 4),  str: 0.25 },
  ];
  for (const s of sources) {
    const gx = Math.floor(s.ax * N) + 1;
    const gy = Math.floor(s.ay * N) + 1;
    if (gx < 1 || gx > N || gy < 1 || gy > N) continue;
    const angle = autoT * 1.5;
    vx0[idx(gx,gy)] += Math.cos(angle) * s.str;
    vy0[idx(gx,gy)] += Math.sin(angle) * s.str;
    dens0[idx(gx,gy)] += 0.3 * s.str;
  }
}

function addMouseForce() {
  const gx = Math.floor(mouse.x * N) + 1;
  const gy = Math.floor(mouse.y * N) + 1;
  if (gx < 1 || gx > N || gy < 1 || gy > N) return;
  const dx = (mouse.x - prevMouse.x) * N * 5;
  const dy = (mouse.y - prevMouse.y) * N * 5;
  vx0[idx(gx,gy)] += dx;
  vy0[idx(gx,gy)] += dy;
  dens0[idx(gx,gy)] += 1.5;
  // Spread to neighbors for thicker plume
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const nx = gx+ox, ny = gy+oy;
      if (nx<1||nx>N||ny<1||ny>N) continue;
      vx0[idx(nx,ny)] += dx * 0.4;
      vy0[idx(nx,ny)] += dy * 0.4;
      dens0[idx(nx,ny)] += 0.6;
    }
  }
}

/* ── Density decay (keep it alive, not stale) ── */
function decayDensity() {
  for (let i = 0; i < SIZE; i++) {
    dens[i] *= 0.992;
  }
}

/* ── Main loop ── */
let startTime = performance.now();

function frame(ts) {
  const t = (ts - startTime) * 0.001;

  addAutoForce(t);
  addMouseForce();

  // Run fluid sim
  velStep(vx, vy, vx0, vy0);
  densStep(dens, dens0, vx, vy);
  decayDensity();

  // Clear sources
  for (let i = 0; i < SIZE; i++) { vx0[i]=0; vy0[i]=0; dens0[i]=0; }

  // Upload to GPU and render
  uploadTexture();

  gl.uniform1i(uHeight, 0);
  gl.uniform2f(uRes, TEX_SIZE, TEX_SIZE);
  gl.uniform1f(uTime, t);
  gl.uniform2f(uMouse, mouse.x, mouse.y);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

})();
