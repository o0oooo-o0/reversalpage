/* bg.js — Liquid parallax background (Canvas 2D) */
(function () {
  const canvas = document.getElementById('bg-canvas');
  const ctx    = canvas.getContext('2d');

  let W, H;
  let mouse  = { x: 0.5, y: 0.5 };
  let target = { x: 0.5, y: 0.5 };

  const PALETTE = [
    [58,  120, 255],
    [88,  101, 242],
    [30,  80,  200],
    [100, 160, 255],
    [20,  50,  160],
    [140, 180, 255],
    [10,  40,  130],
  ];

  let blobs = [];
  let lines = [];

  /* ── BLOBS ── */
  function makeBlob() {
    const [r,g,b] = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      radius: 140 + Math.random() * 260,
      alpha: 0.055 + Math.random() * 0.085,
      r, g, b,
      px: (Math.random() - 0.5) * 100,
      py: (Math.random() - 0.5) * 100,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.003 + Math.random() * 0.007,
    };
  }

  /* ── LINES ── */
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
      targetAlpha: 0.06 + Math.random() * 0.12,
      baseW: 0.6 + Math.random() * 3.5,
      wAmp:  0.4 + Math.random() * 1.8,
      wFreq: 0.3 + Math.random() * 1.2,
      offset: Math.random() * Math.PI * 2,
      px: (Math.random() - 0.5) * 80,
      py: (Math.random() - 0.5) * 80,
      life: 0,
      maxLife: 280 + Math.random() * 450,
    };
  }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    blobs = Array.from({ length: 12 }, makeBlob);
    lines = Array.from({ length: Math.max(14, Math.floor(W * H / 65000)) }, () => {
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

    /* ── BLOBS ── */
    for (const b of blobs) {
      b.phase += b.phaseSpeed;

      // Drift
      b.x += b.vx + Math.sin(b.phase * 0.7) * 0.4;
      b.y += b.vy + Math.cos(b.phase * 0.55) * 0.4;

      // Wrap
      if (b.x < -b.radius) b.x = W + b.radius;
      if (b.x > W + b.radius) b.x = -b.radius;
      if (b.y < -b.radius) b.y = H + b.radius;
      if (b.y > H + b.radius) b.y = -b.radius;

      // Parallax offset
      const ox = b.px * px + Math.sin(b.phase * 0.6) * 20;
      const oy = b.py * py + Math.cos(b.phase * 0.5) * 20;

      // Pulsing, slightly elliptical (liquid feel)
      const pulse  = b.radius * (1 + Math.sin(b.phase * 0.9) * 0.1);
      const scaleY = 0.82 + Math.sin(b.phase * 0.7) * 0.12;

      ctx.save();
      ctx.translate(b.x + ox, b.y + oy);
      ctx.scale(1, scaleY);

      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, pulse);
      grad.addColorStop(0,    `rgba(${b.r},${b.g},${b.b},${(b.alpha * 1.4).toFixed(3)})`);
      grad.addColorStop(0.45, `rgba(${b.r},${b.g},${b.b},${b.alpha.toFixed(3)})`);
      grad.addColorStop(1,    `rgba(${b.r},${b.g},${b.b},0)`);

      ctx.beginPath();
      ctx.arc(0, 0, pulse, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Specular highlight — small bright spot top-left of each blob
      const specR = pulse * 0.28;
      const specX = -pulse * 0.28;
      const specY = -pulse * 0.28;
      const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, specR);
      specGrad.addColorStop(0, `rgba(200,225,255,${(b.alpha * 1.8).toFixed(3)})`);
      specGrad.addColorStop(1, `rgba(200,225,255,0)`);
      ctx.beginPath();
      ctx.arc(specX, specY, specR, 0, Math.PI * 2);
      ctx.fillStyle = specGrad;
      ctx.fill();

      ctx.restore();
    }

    /* ── LINES ── */
    for (const l of lines) {
      l.life++;
      const prog = l.life / l.maxLife;
      if      (prog < 0.15) l.alpha = l.targetAlpha * (prog / 0.15);
      else if (prog < 0.75) l.alpha = l.targetAlpha;
      else                  l.alpha = l.targetAlpha * (1 - (prog - 0.75) / 0.25);
      if (l.life >= l.maxLife) { Object.assign(l, makeLine()); continue; }

      const wave = Math.sin(t * l.wFreq * 2 + l.offset) * 20;
      const ox   = l.px * px + wave;
      const oy   = l.py * py + Math.cos(t * l.wFreq * 1.5 + l.offset) * 14;
      const animW = Math.max(0.3, l.baseW + Math.sin(t * l.wFreq + l.offset) * l.wAmp);

      ctx.strokeStyle = `rgba(${l.r},${l.g},${l.b},${l.alpha.toFixed(3)})`;
      ctx.lineWidth   = animW;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      drawCurve(l.pts, ox, oy);
      ctx.stroke();
    }

    requestAnimationFrame(draw);
  }

  /* ── Mouse lerp ── */
  window.addEventListener('mousemove', e => {
    target.x = e.clientX / W;
    target.y = e.clientY / H;
  });
  window.addEventListener('touchmove', e => {
    target.x = e.touches[0].clientX / W;
    target.y = e.touches[0].clientY / H;
  }, { passive: true });

  (function lerpMouse() {
    mouse.x += (target.x - mouse.x) * 0.05;
    mouse.y += (target.y - mouse.y) * 0.05;
    requestAnimationFrame(lerpMouse);
  })();

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
})();
