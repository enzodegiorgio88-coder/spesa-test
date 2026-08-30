// ════════════════════════════════════════════════════════════════
// totals.js — Totale spesa (prezzo × quantità) e barra del totale
// ════════════════════════════════════════════════════════════════

import { NOVITA_RELEASE } from './config.js';
import { state } from './state.js';
// Il totale si scrive come tutti gli altri importi dell'app: le migliaia
// col punto, i centesimi con la virgola. Vedi soldi() in utils.js.
import { aNumero, soldi } from './utils.js';

export function updateTotale() {
  let totale = 0, conPrezzo = 0;
  state.data.flat().forEach(r => {
    const p = aNumero(r.price);
    if (p > 0) { totale += p * (r.qty || 1); conPrezzo++; }
  });
  const afterRelease = new Date() >= NOVITA_RELEASE;
  document.getElementById('totaleBar').style.display = afterRelease ? 'flex' : 'none';
  // Nell'HTML il simbolo € è già scritto accanto: qui va solo la cifra.
  document.getElementById('totaleAmount').textContent = soldi(totale);
  document.getElementById('totaleDetail').textContent =
    conPrezzo + (conPrezzo === 1 ? ' articolo con prezzo' : ' articoli con prezzo');
}
