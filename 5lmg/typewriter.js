/* typewriter.js — Efecto typewriter con cursor parpadeante */
(function () {
  const PHRASES = [
    'biggest catboy',
    'f3kels catboy',
    'catboy',
    'exploit finder',
    'f3kel friend',
  ];

  const el = document.getElementById('tw-text');

  const TYPE_SPEED   = 65;   // ms por carácter al escribir
  const DELETE_SPEED = 35;   // ms por carácter al borrar
  const HOLD_TIME    = 10000; // ms que se queda el texto completo (10s)
  const PAUSE_AFTER_DELETE = 400; // ms de pausa antes de escribir el siguiente

  let phraseIndex = 0;
  let charIndex   = 0;
  let deleting    = false;

  function tick() {
    const phrase = PHRASES[phraseIndex];

    if (!deleting) {
      // Escribir
      charIndex++;
      el.textContent = phrase.slice(0, charIndex);

      if (charIndex === phrase.length) {
        // Llegamos al final — esperar antes de borrar
        deleting = true;
        setTimeout(tick, HOLD_TIME);
        return;
      }
      setTimeout(tick, TYPE_SPEED);
    } else {
      // Borrar
      charIndex--;
      el.textContent = phrase.slice(0, charIndex);

      if (charIndex === 0) {
        // Borrado completo — pasar al siguiente
        deleting = false;
        phraseIndex = (phraseIndex + 1) % PHRASES.length;
        setTimeout(tick, PAUSE_AFTER_DELETE);
        return;
      }
      setTimeout(tick, DELETE_SPEED);
    }
  }

  // Empezar después del delay de entrada de la card (1s card + 0.6s fade = ~2.2s)
  setTimeout(tick, 2200);
})();
