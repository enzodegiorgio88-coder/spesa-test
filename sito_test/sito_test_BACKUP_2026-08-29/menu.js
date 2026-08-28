// ════════════════════════════════════════════════════════════════
// menu.js — Schermata "Menu" (icona ☰ nell'intestazione)
// ════════════════════════════════════════════════════════════════
// NUOVO LUGLIO 2026: il pulsante con le tre linee, in alto a sinistra
// accanto al carrello, apre una schermata a tutto schermo. Per ora è
// vuota di proposito: è il cassetto dove metteremo le prossime funzioni,
// una alla volta, senza affollare la schermata della lista.
//
// Modulo "foglia": non importa nessun altro modulo locale e si limita a
// esporre due funzioni su window, perché vengono richiamate dagli
// onclick scritti direttamente nell'HTML.

window.apriMenu = () => {
  const schermata = document.getElementById('menuScreen');
  if (!schermata) return;
  schermata.classList.add('show');
  // La lista dietro non deve scorrere mentre il menu è aperto
  // (stessa tecnica usata per i popup Copia e Backup).
  document.body.classList.add('menu-open');
};

window.chiudiMenu = () => {
  const schermata = document.getElementById('menuScreen');
  if (!schermata) return;
  schermata.classList.remove('show');
  document.body.classList.remove('menu-open');
};
