// ════════════════════════════════════════════════════════════════
// totals.js — Totale spesa (prezzo × quantità) e barra del totale
// ════════════════════════════════════════════════════════════════

import { NOVITA_RELEASE } from './config.js';
import { state } from './state.js';

export function updateTotale() {
  let totale = 0, conPrezzo = 0;
  state.data.flat().forEach(r => {
    const p = parseFloat(r.price);
    if (p > 0) { totale += p * (r.qty || 1); conPrezzo++; }
  });
  const afterRelease = new Date() >= NOVITA_RELEASE;
  document.getElementById('totaleBar').style.display = afterRelease ? 'flex' : 'none';
  document.getElementById('totaleAmount').textContent = totale.toFixed(2).replace('.', ',');
  document.getElementById('totaleDetail').textContent =
    conPrezzo + (conPrezzo === 1 ? ' articolo con prezzo' : ' articoli con prezzo');
}
