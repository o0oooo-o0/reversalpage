/* bg.js — Liquid parallax background */
(function () {
  const canvas = document.getElementById('bg-canvas');
  const ctx    = canvas.getContext('2d');

  let W, H;
  let mouse = { x: 0.5, y: 0.5 };
  let target = { x: 0.5, y: 0.5 };

  // Blue palette
  const PALETTE = [
    [88,  101, 242],  // discord blurple
    [58,  120, 255],  // bright blue
    [30,  80,  200],  // deep blue
    [100, 160, 255],  // sky blue
    [20,  50,  160],  // navy
    [140, 180, 255],  // light blue
  ];

  let blobs = [];
  let lines = [];

  /* ── BLOBS (liquid base) ── */
  function makeBlob() {
    const [r,g,b] = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: 120 + Math.random() * 220,
      alpha: 0.04 + Math.random() * 0.09,
      r, g, b,
      px: (Math.random() - 0.5) * 120,
      py: (Math.random() - 0.5) * 120,
    };
  }

  /* ── LINES (flowing) ── */
  function makeLine() {
    const [r,g,b] = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const segs = 5 + Math.floor(Math.random() * 5);
    const pts  = [];
    let cx = Math.random() * W;
    let cy = Math.random() * H;
    for (let i = 0; i <= segs; i++) {
      pts.push({ x: cx, y: cy });
      cx += (Math.random() - 0.5) * W * 0.55;
      cy += (Math.random() - 0.5) * H * 0.55;
    }
    return {
      pts, r, g, b,
      alpha: 0,
      targetAlpha: 0.05 + Math.random() * 0.12,
      baseW: 0.6 + Math.random() * 3,
      wAmp:  0.3 + Math.random() * 1.5,
      wFreq: 0.3 + Math.random() * 1.0,
      speed: 0.0004 + Math.random() * 0.0007,
      offset: Math.random() * Math.PI * 2,
      px: (Math.random() - 0.5) * 80,
      py: (Math.random() - 0.5) * 80,
      life: 0,
      maxLife: 280 + Math.random() * 420,
    };
  }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    init();
  }

  function init() {
    blobs = Array.from({ length: 10 }, makeBlob);
    lines = Array.from({ length: Math.max(12, Math.floor(W * H / 70000)) }, () => {
      const l = makeLine();
      l.life = Math.random() * l.maxLife;
      return l;
    });
  }

  function drawCurve(pts, ox, oy) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x + ox, pts[0].y + oy);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i+1].x) / 2;
      const my = (pts[i].y + pts[i+1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x + ox, pts[i].y + oy, mx + ox, my + oy);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x + ox, last.y + oy);
  }

  function draw(ts) {
    ctx.clearRect(0, 0, W, H);

    const t  = ts * 0.001;
    const px = (mouse.x - 0.5) * 2;
    const py = (mouse.y - 0.5) * 2;

    /* ── Draw blobs ── */
    for (const b of blobs) {
      // Liquid drift
      b.x += b.vx + Math.sin(t * 0.4 + b.offset2) * 0.4;
      b.y += b.vy + Math.cos(t * 0.35 + b.offset2) * 0.4;

      // Wrap
      if (b.x < -b.radius) b.x = W + b.radius;
      if (b.x > W + b.radius) b.x = -b.radius;
      if (b.y < -b.radius) b.y = H + b.radius;
      if (b.y > H + b.radius) b.y = -b.radius;

      const ox = b.px * px + Math.sin(t * 0.6 + b.offset2) * 18;
      const oy = b.py * py + Math.cos(t * 0.5 + b.offset2) * 18;

      // Pulsing radius for liquid feel
      const pulse = b.radius * (1 + Math.sin(t * 0.8 + b.offset2) * 0.12);

      const grad = ctx.createRadialGradient(
        b.x + ox, b.y + oy, 0,
        b.x + ox, b.y + oy, pulse
      );
      grad.addColorStop(0,   `rgba(${b.r},${b.g},${b.b},${b.alpha})`);
      grad.addColorStop(0.5, `rgba(${b.r},${b.g},${b.b},${b.alpha * 0.4})`);
      grad.addColorStop(1,   `rgba(${b.r},${b.g},${b.b},0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(b.x + ox, b.y + oy, pulse, pulse * (0.85 + Math.sin(t * 0.7 + b.offset2) * 0.15), t * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    /* ── Draw lines ── */
    for (const l of lines) {
      l.life++;
      const prog = l.life / l.maxLife;

      if      (prog < 0.15) l.alpha = l.targetAlpha * (prog / 0.15);
      else if (prog < 0.75) l.alpha = l.targetAlpha;
      else                  l.alpha = l.targetAlpha * (1 - (prog - 0.75) / 0.25);

      if (l.life >= l.maxLife) { Object.assign(l, makeLine()); continue; }

      const wave = Math.sin(t * l.wFreq * 2 + l.offset) * 18;
      const ox = l.px * px + wave;
      const oy = l.py * py + Math.cos(t * l.wFreq * 1.5 + l.offset) * 14;

      const animW = Math.max(0.2, l.baseW + Math.sin(t * l.wFreq + l.offset) * l.wAmp);

      ctx.strokeStyle = `rgba(${l.r},${l.g},${l.b},${l.alpha.toFixed(3)})`;
      ctx.lineWidth = animW;
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';

      drawCurve(l.pts, ox, oy);
      ctx.stroke();
    }

    requestAnimationFrame(draw);
  }

  // Smooth mouse follow
  window.addEventListener('mousemove', e => { target.x = e.clientX / W; target.y = e.clientY / H; });
  window.addEventListener('touchmove', e => {
    target.x = e.touches[0].clientX / W;
    target.y = e.touches[0].clientY / H;
  }, { passive: true });

  (function lerpMouse() {
    mouse.x += (target.x - mouse.x) * 0.05;
    mouse.y += (target.y - mouse.y) * 0.05;
    requestAnimationFrame(lerpMouse);
  })();

  // Init missing offset2
  function init2() {
    blobs.forEach(b => b.offset2 = Math.random() * Math.PI * 2);
  }

  window.addEventListener('resize', resize);
  resize();
  init2();
  requestAnimationFrame(draw);
})();
