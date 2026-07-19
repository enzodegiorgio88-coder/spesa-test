// ════════════════════════════════════════════════════════════════
// countdown.js — Countdown, aggiornamento timer, popup countdown
// ════════════════════════════════════════════════════════════════
// Script indipendente, NON un modulo ES: viene caricato con un
// normale <script src="countdown.js"></script> (senza type="module"),
// esattamente come nello script originale inline, così da restare
// sincrono ed eseguire prima ancora che main.js parta. Non dipende da
// Firebase né da nessun altro file di questo progetto.

// Countdown e error reporting — script normale, non modulo
// Eseguito subito, indipendente da Firebase
(function() {
  const TARGET = new Date('2026-07-01T00:00:00');
  function pad2(n) { return String(n).padStart(2,'0'); }
  function tick() {
    const diff = TARGET - new Date();
    const ids1 = ['cd-giorni','cd-ore','cd-min','cd-sec'];
    const ids2 = ['cd-giorni2','cd-ore2','cd-min2','cd-sec2'];
    const vals = diff > 0
      ? [Math.floor(diff/86400000), Math.floor((diff%86400000)/3600000),
         Math.floor((diff%3600000)/60000), Math.floor((diff%60000)/1000)]
      : [0,0,0,0];
    [...ids1,...ids2].forEach((id,i) => {
      const el = document.getElementById(id);
      if (el) el.textContent = pad2(vals[i % 4]);
    });
    if (diff <= 0) {
      const sub = document.getElementById('cd-sub');
      if (sub) sub.textContent = '🎉 La novità è disponibile!';
      const btn = document.getElementById('btnCountdown');
      if (btn) btn.style.display = 'none';
    }
  }
  tick();
  setInterval(tick, 1000);

  // Mostra errori JS visibili in pagina per debug
  window.addEventListener('error', function(e) {
    console.error('[Modulo]', e.message, e.filename, e.lineno);
  });
  window.addEventListener('unhandledrejection', function(e) {
    console.error('[Promise]', e.reason);
  });
})();

// toggleCountdownPopup esposto su window — usato dagli onclick HTML.
// Spostato qui dal modulo Firebase: è pura UI del popup countdown e
// non ha alcuna dipendenza da Firebase o dagli altri moduli.
window.toggleCountdownPopup = () => {
  const popup = document.getElementById('countdownPopup');
  if (!popup) return;
  popup.style.display = popup.style.display === 'none' ? 'flex' : 'none';
};
