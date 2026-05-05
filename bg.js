/* bg.js — WebGL fluid shader — dark realistic ocean */
(function () {

const canvas = document.getElementById('bg-canvas');
let gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

if (!gl) {
  canvas.style.background = 'linear-gradient(135deg,#010408,#020b1a,#010408)';
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

/* ──────────────────────────────────────────────────────────
   FRAGMENT SHADER
   Dark deep-ocean look:
   - Domain-warped fBm with 7 octaves for fine detail
   - Analytical normals → Blinn-Phong + Fresnel
   - Caustic-like shimmer layer
   - Near-black base, deep teal/navy accents
   - Mouse creates realistic surface perturbation + wave burst
   ────────────────────────────────────────────────────────── */
const FS = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;
uniform float uClick;     /* 0..1 fade of last click pulse */
uniform vec2  uClickPos;  /* NDC 0..1 of last click */

/* ── Noise ─────────────────────────────────────────────── */
vec3 hash3(vec2 p){
  vec3 q = vec3(dot(p,vec2(127.1,311.7)),
                dot(p,vec2(269.5,183.3)),
                dot(p,vec2(419.2,371.9)));
  return fract(sin(q)*43758.5453);
}

float valueNoise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  float a=fract(sin(dot(i,            vec2(127.1,311.7)))*43758.5453);
  float b=fract(sin(dot(i+vec2(1,0),  vec2(127.1,311.7)))*43758.5453);
  float c=fract(sin(dot(i+vec2(0,1),  vec2(127.1,311.7)))*43758.5453);
  float d=fract(sin(dot(i+vec2(1,1),  vec2(127.1,311.7)))*43758.5453);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}

/* Gradient noise — smoother than value noise */
float gradNoise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);
  vec2 ga=hash3(i           ).xy*2.0-1.0;
  vec2 gb=hash3(i+vec2(1,0) ).xy*2.0-1.0;
  vec2 gc=hash3(i+vec2(0,1) ).xy*2.0-1.0;
  vec2 gd=hash3(i+vec2(1,1) ).xy*2.0-1.0;
  float va=dot(ga,f           );
  float vb=dot(gb,f-vec2(1,0) );
  float vc=dot(gc,f-vec2(0,1) );
  float vd=dot(gd,f-vec2(1,1) );
  return 0.5+0.5*mix(mix(va,vb,u.x),mix(vc,vd,u.x),u.y);
}

/* fBm with rotation — 7 octaves */
float fbm(vec2 p){
  float v=0.0,a=0.52;
  mat2 rot=mat2(0.8660,-0.5,0.5,0.8660); /* 30° */
  for(int i=0;i<7;i++){
    v+=a*gradNoise(p);
    p=rot*p*2.07;
    a*=0.46;
  }
  return v;
}

/* ── Domain warp — triple layer ───────────────────────── */
float ocean(vec2 uv, float t){
  /* Layer 1 */
  vec2 q=vec2(fbm(uv+vec2(t*0.07,t*0.05)),
              fbm(uv+vec2(t*0.05,t*0.09)+vec2(5.2,1.3)));
  /* Layer 2 */
  vec2 r=vec2(fbm(uv+2.8*q+vec2(1.7,9.2)+t*0.055),
              fbm(uv+2.8*q+vec2(8.3,2.8)+t*0.035));
  /* Layer 3 — fine micro-ripples */
  vec2 s=vec2(fbm(uv+1.6*r+vec2(3.1,5.7)+t*0.08),
              fbm(uv+1.6*r+vec2(7.4,0.9)+t*0.06));
  return fbm(uv+2.2*s);
}

/* ── Normal ─────────────────────────────────────────────── */
vec3 getNormal(vec2 uv, float t){
  float e=0.003;
  float hC=ocean(uv,      t);
  float hR=ocean(uv+vec2(e,0),t);
  float hU=ocean(uv+vec2(0,e),t);
  return normalize(vec3((hC-hR)*32.0,(hC-hU)*32.0,1.0));
}

/* ── Caustics shimmer ─────────────────────────────────── */
float caustics(vec2 uv, float t){
  float c=0.0;
  for(int i=0;i<3;i++){
    float fi=float(i);
    vec2 off=vec2(sin(t*0.3+fi*2.1),cos(t*0.25+fi*1.7));
    c+=gradNoise((uv+off*0.08)*6.0+t*0.12*(fi+1.0));
  }
  return pow(c/3.0,3.5)*2.2;
}

/* ── Wave ring from mouse burst ──────────────────────── */
float waveRing(vec2 uv, vec2 center, float t, float age, float speed){
  float r=length(uv-center);
  float wavefront=age*speed;
  float ring=exp(-pow((r-wavefront)*18.0,2.0));
  float fade=exp(-age*2.5);
  float ripple=sin(r*55.0-age*22.0)*0.5+0.5;
  return ring*fade*ripple;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 asp= vec2(uRes.x/uRes.y,1.0);

  float t  = uTime*0.32;
  vec2 sUV = (uv-0.5)*asp*2.4+0.5;

  /* Mouse surface pull — subtle warp */
  vec2 mOff=(uMouse-0.5)*0.28;
  float mDist=length((uv-0.5)*asp)*2.0;
  sUV+=mOff*smoothstep(1.8,0.0,mDist);

  /* Continuous mouse micro-ripple on surface */
  float mProx=1.0-smoothstep(0.0,0.35,length(uv-uMouse));
  float mRipple=sin(length((uv-uMouse)*asp)*80.0-uTime*8.0)*mProx*0.018;
  sUV+=normalize((uv-uMouse)+0.001)*mRipple;

  /* ── Ocean height ── */
  float h=ocean(sUV*1.9,t);

  /* ── Normal ── */
  vec3 N=getNormal(sUV*1.9,t);

  /* ── Click wave rings ── */
  float clickWave=0.0;
  if(uClick>0.0){
    float age=1.0-uClick;
    clickWave+=waveRing(uv,uClickPos,uTime,age,0.55)*0.9;
    clickWave+=waveRing(uv,uClickPos,uTime,age+0.05,0.40)*0.6;
    clickWave+=waveRing(uv,uClickPos,uTime,age+0.12,0.28)*0.4;
  }
  /* Perturb normal by click wave */
  vec2 cDir=normalize(uv-uClickPos+0.001);
  N.xy+=cDir*clickWave*0.35;
  N=normalize(N);

  /* ── Lighting ── */
  vec3 L1=normalize(vec3(0.3,0.7,1.2));
  vec3 L2=normalize(vec3(-0.6,-0.2,0.8));
  vec3 L3=normalize(vec3(0.0,-1.0,0.6));  /* moonlight straight down */
  vec3 V =vec3(0.0,0.0,1.0);

  float diff1=max(dot(N,L1),0.0);
  float diff2=max(dot(N,L2),0.0)*0.18;
  float diff3=max(dot(N,L3),0.0)*0.12;

  /* Blinn-Phong — sharp high-gloss */
  vec3  H1   =normalize(L1+V);
  float spec1=pow(max(dot(N,H1),0.0),320.0)*3.5;
  vec3  H2   =normalize(L2+V);
  float spec2=pow(max(dot(N,H2),0.0),80.0)*0.5;

  /* Fresnel */
  float fres=pow(1.0-abs(dot(N,V)),4.5);

  /* ── Color palette — very dark ocean ── */
  vec3 colAbyss  =vec3(0.004,0.008,0.018); /* near black */
  vec3 colDeep   =vec3(0.008,0.022,0.055); /* deep navy */
  vec3 colMid    =vec3(0.015,0.055,0.14);  /* dark teal-blue */
  vec3 colSurface=vec3(0.03, 0.11, 0.28);  /* surface blue */
  vec3 colSpec   =vec3(0.70, 0.88, 1.00);  /* specular white-blue */
  vec3 colFresnel=vec3(0.06, 0.20, 0.55);  /* fresnel rim */

  /* Height-based blend */
  vec3 col=colAbyss;
  col=mix(col, colDeep,    smoothstep(0.0,  0.35, h));
  col=mix(col, colMid,     smoothstep(0.28, 0.62, h)*0.85);
  col=mix(col, colSurface, smoothstep(0.55, 0.88, h)*0.6);

  /* Lighting contributions */
  col+=diff1*colMid   *0.55;
  col+=diff2*colDeep  *0.3;
  col+=diff3*colAbyss *0.2;
  col+=spec1*colSpec;
  col+=spec2*colSpec  *0.4;
  col+=fres *colFresnel*0.9;

  /* Subsurface at crests */
  col+=smoothstep(0.65,1.0,h)*vec3(0.005,0.04,0.14)*0.7;

  /* Caustics — subtle shimmer in mid-depth areas */
  float caust=caustics(sUV*2.5,uTime*0.4);
  col+=caust*smoothstep(0.2,0.7,h)*vec3(0.01,0.04,0.12)*0.6;

  /* Click wave brightening */
  col+=clickWave*vec3(0.04,0.14,0.38)*1.2;

  /* Mouse proximity glow — very subtle */
  col+=mProx*0.012*vec3(0.03,0.10,0.30);

  /* Vignette */
  float vig=1.0-smoothstep(0.35,1.0,length((uv-0.5)*1.35));
  col*=0.15+0.85*vig;

  /* Tone map — keep dark, no gamma blowout */
  col=col/(col+0.12)*1.18;
  col=pow(max(col,0.0),vec3(0.92));

  gl_FragColor=vec4(col,1.0);
}
`;

const program = prog(VS, FS);
gl.useProgram(program);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
const aP = gl.getAttribLocation(program, 'p');
gl.enableVertexAttribArray(aP);
gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);

const uRes      = gl.getUniformLocation(program, 'uRes');
const uTime     = gl.getUniformLocation(program, 'uTime');
const uMouse    = gl.getUniformLocation(program, 'uMouse');
const uClick    = gl.getUniformLocation(program, 'uClick');
const uClickPos = gl.getUniformLocation(program, 'uClickPos');

let mx=0.5, my=0.5, tmx=0.5, tmy=0.5;
let clickAlpha=0.0, clickX=0.5, clickY=0.5;

window.addEventListener('mousemove', e => {
  tmx = e.clientX / W;
  tmy = 1.0 - e.clientY / H;
});
window.addEventListener('touchmove', e => {
  tmx = e.touches[0].clientX / W;
  tmy = 1.0 - e.touches[0].clientY / H;
}, { passive: true });

/* Click / tap → wave burst */
function onTap(x, y) {
  clickX = x / W;
  clickY = 1.0 - y / H;
  clickAlpha = 1.0;
}
window.addEventListener('click',      e => onTap(e.clientX, e.clientY));
window.addEventListener('touchstart', e => onTap(e.touches[0].clientX, e.touches[0].clientY), { passive: true });

const t0 = performance.now();

(function frame() {
  mx += (tmx - mx) * 0.05;
  my += (tmy - my) * 0.05;
  clickAlpha *= 0.975; /* fade over ~1.5s */

  const t = (performance.now() - t0) * 0.001;

  gl.uniform2f(uRes,      W, H);
  gl.uniform1f(uTime,     t);
  gl.uniform2f(uMouse,    mx, my);
  gl.uniform1f(uClick,    clickAlpha);
  gl.uniform2f(uClickPos, clickX, clickY);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
})();

})();
