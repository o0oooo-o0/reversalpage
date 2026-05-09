/* discord.js — Integración con Lanyard API para estado de Discord */
(function () {
  const DISCORD_ID = '1172068037541765170';

  const STATUS_LABELS = {
    online:  'Online',
    idle:    'Idle',
    dnd:     'Do Not Disturb',
    offline: 'Offline',
  };

  const el = {
    avatar:      document.getElementById('avatar-img'),
    ring:        document.getElementById('status-ring'),
    dot:         document.getElementById('status-dot'),
    username:    document.getElementById('username'),
    displayName: document.getElementById('display-name'),
    customWrap:  document.getElementById('custom-status-wrap'),
    customEmoji: document.getElementById('custom-emoji'),
    customText:  document.getElementById('custom-text'),
    badgeDot:    document.getElementById('badge-dot'),
    badgeLabel:  document.getElementById('badge-label'),
  };

  function setStatus(status) {
    const s = status || 'offline';
    // Dot en el avatar
    el.dot.className  = `status-dot ${s}`;
    // Ring de color
    el.ring.className = `status-ring ${s}`;
    // Badge inferior
    el.badgeDot.className   = `badge-dot ${s}`;
    el.badgeLabel.className = `badge-label ${s}`;
    el.badgeLabel.textContent = STATUS_LABELS[s] || 'Desconectado';
  }

  async function fetchStatus() {
    try {
      const res  = await fetch(`https://api.lanyard.rest/v1/users/${DISCORD_ID}`);
      const json = await res.json();

      if (!json.success) {
        setStatus('offline');
        el.username.textContent = '??';
        return;
      }

      const data = json.data;
      const user = data.discord_user;

      // ── Avatar ──────────────────────────────────────────
      const hash = user.avatar;
      const ext  = hash && hash.startsWith('a_') ? 'gif' : 'png';
      el.avatar.src = `https://cdn.discordapp.com/avatars/${DISCORD_ID}/${hash}.${ext}?size=256`;

      // ── Nombre ──────────────────────────────────────────
      el.username.textContent = user.username || '??';

      const dname = user.global_name || user.display_name || '';
      el.displayName.textContent = dname !== user.username ? dname : '';
      el.displayName.style.display = el.displayName.textContent ? 'block' : 'none';

      // ── Estado personalizado ─────────────────────────────
      const activities = data.activities || [];
      const customAct  = activities.find(a => a.type === 4); // type 4 = Custom Status

      if (customAct) {
        const emoji = customAct.emoji
          ? (customAct.emoji.id
              ? ''   // emoji personalizado (no podemos renderizarlo fácil, lo omitimos)
              : customAct.emoji.name)
          : '';
        const text = customAct.state || '';

        el.customEmoji.textContent = emoji;
        el.customText.textContent  = text || 'No status set';
        el.customWrap.style.opacity = '1';
      } else {
        el.customEmoji.textContent = '';
        el.customText.textContent  = 'No status set';
        el.customWrap.style.opacity = '0.45';
      }

      // ── Status ───────────────────────────────────────────
      setStatus(data.discord_status);

    } catch (err) {
      console.warn('[discord.js] Error al obtener datos:', err);
      setStatus('offline');
    }
  }

  // Primera carga
  fetchStatus();

  // Actualizar cada 15 segundos
  setInterval(fetchStatus, 15000);

  // ── Websocket Lanyard para updates en tiempo real ────────
  function connectWS() {
    const ws = new WebSocket('wss://api.lanyard.rest/socket');
    let heartbeat;

    ws.onopen = () => {
      // Lanyard pide un heartbeat cada ~30s
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      switch (msg.op) {
        case 1: // Hello — iniciar heartbeat y subscribe
          heartbeat = setInterval(() => {
            ws.send(JSON.stringify({ op: 3 }));
          }, msg.d.heartbeat_interval);

          ws.send(JSON.stringify({
            op: 2,
            d: { subscribe_to_id: DISCORD_ID },
          }));
          break;

        case 0: // Event
          if (
            msg.t === 'INIT_STATE' ||
            msg.t === 'PRESENCE_UPDATE'
          ) {
            // Recargar datos via REST para consistencia
            fetchStatus();
          }
          break;
      }
    };

    ws.onclose = () => {
      clearInterval(heartbeat);
      // Reconectar después de 5 segundos
      setTimeout(connectWS, 5000);
    };

    ws.onerror = () => ws.close();
  }

  connectWS();
})();
