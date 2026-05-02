/* bg.js — Canvas parallax con líneas orgánicas animadas */
(function () {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');

  let W, H, mouse = { x: 0.5, y: 0.5 };
  let lines = [];
  let raf;

  // Paleta de colores fría/oscura — tonos azules, violetas, grises
  const PALETTE = [
    [88,  101, 242],   // blurple Discord
    [59,  165, 92],    // verde
    [250, 166, 26],    // amarillo
    [237, 66,  69],    // rojo
    [114, 137, 218],   // azul suave
  ];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    initLines();
  }

  /* Crea una línea orgánica con múltiples puntos de control */
  function makeLine() {
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const segments = 6 + Math.floor(Math.random() * 4);
    const points = [];

    // Punto de inicio aleatorio en cualquier borde
    const edge = Math.floor(Math.random() * 4);
    let sx, sy;
    if (edge === 0) { sx = Math.random() * W; sy = 0; }
    else if (edge === 1) { sx = W; sy = Math.random() * H; }
    else if (edge === 2) { sx = Math.random() * W; sy = H; }
    else { sx = 0; sy = Math.random() * H; }

    let cx = sx, cy = sy;
    for (let i = 0; i <= segments; i++) {
      points.push({ x: cx, y: cy });
      cx += (Math.random() - 0.5) * W * 0.6;
      cy += (Math.random() - 0.5) * H * 0.6;
    }

    return {
      points,
      color,
      alpha: 0,
      targetAlpha: 0.04 + Math.random() * 0.1,
      width: 0.8 + Math.random() * 2.2,
      speed: 0.0003 + Math.random() * 0.0006,
      offset: Math.random() * Math.PI * 2,
      parallaxX: (Math.random() - 0.5) * 80,
      parallaxY: (Math.random() - 0.5) * 80,
      life: 0,
      maxLife: 300 + Math.random() * 400,
    };
  }

  function initLines() {
    lines = [];
    const count = Math.max(14, Math.floor((W * H) / 80000));
    for (let i = 0; i < count; i++) {
      const l = makeLine();
      l.life = Math.random() * l.maxLife; // empieza en punto aleatorio del ciclo
      lines.push(l);
    }
  }

  /* Dibuja una curva catmull-rom suavizada */
  function drawCurve(pts, offsetX, offsetY) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x + offsetX, pts[0].y + offsetY);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(
        pts[i].x + offsetX,
        pts[i].y + offsetY,
        mx + offsetX,
        my + offsetY
      );
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x + offsetX, last.y + offsetY);
  }

  function draw(ts) {
    ctx.clearRect(0, 0, W, H);

    const t = ts * 0.001;

    // Parallax offset suave basado en posición del mouse
    const px = (mouse.x - 0.5) * 2;
    const py = (mouse.y - 0.5) * 2;

    for (let l of lines) {
      l.life++;

      // Ciclo de vida: fade in → sostenido → fade out → reset
      const progress = l.life / l.maxLife;
      if (progress < 0.15) {
        l.alpha = l.targetAlpha * (progress / 0.15);
      } else if (progress < 0.75) {
        l.alpha = l.targetAlpha;
      } else {
        l.alpha = l.targetAlpha * (1 - (progress - 0.75) / 0.25);
      }

      if (l.life >= l.maxLife) {
        // Regenerar línea
        Object.assign(l, makeLine());
        continue;
      }

      // Movimiento orgánico: desplazar puntos con seno
      const wave = Math.sin(t * l.speed * 1000 + l.offset) * 15;
      const ox = l.parallaxX * px + wave;
      const oy = l.parallaxY * py + Math.cos(t * l.speed * 800 + l.offset) * 12;

      const [r, g, b] = l.color;
      ctx.strokeStyle = `rgba(${r},${g},${b},${l.alpha.toFixed(3)})`;
      ctx.lineWidth = l.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      drawCurve(l.points, ox, oy);
      ctx.stroke();
    }

    raf = requestAnimationFrame(draw);
  }

  // Seguir el mouse suavemente
  let targetMouse = { x: 0.5, y: 0.5 };
  window.addEventListener('mousemove', e => {
    targetMouse.x = e.clientX / W;
    targetMouse.y = e.clientY / H;
  });
  window.addEventListener('touchmove', e => {
    const t = e.touches[0];
    targetMouse.x = t.clientX / W;
    targetMouse.y = t.clientY / H;
  }, { passive: true });

  // Lerp del mouse
  function lerpMouse() {
    mouse.x += (targetMouse.x - mouse.x) * 0.04;
    mouse.y += (targetMouse.y - mouse.y) * 0.04;
    requestAnimationFrame(lerpMouse);
  }
  lerpMouse();

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
})();
