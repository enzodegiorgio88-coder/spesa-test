// ════════════════════════════════════════════════════════════════
// urgent.js — Articoli urgenti: popup dedicato, contatori, rendering
// ════════════════════════════════════════════════════════════════

import { COLORS, NOVITA_RELEASE } from './config.js';
import { state } from './state.js';

function buildUrgentiCategory(c, items, showPrices) {
  const cat   = document.createElement('div'); cat.className = 'urg-category';
  const title = document.createElement('div'); title.className = 'urg-cat-title';
  title.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${COLORS[c]};flex-shrink:0;display:inline-block;"></span> ${ ['🏠 Casa','👤 Persona','🛒 Alimentari'][c] }`;
  cat.appendChild(title);

  items.forEach(item => {
    const row = document.createElement('div'); row.className = 'urg-item';
    const txt = document.createElement('span'); txt.className = 'urg-item-text'; txt.textContent = item.text;
    row.appendChild(txt);
    if (item.qty > 1) {
      const q = document.createElement('span'); q.className = 'urg-item-qty'; q.textContent = 'x' + item.qty; row.appendChild(q);
    }
    if (showPrices && parseFloat(item.price) > 0) {
      const p = document.createElement('span'); p.className = 'urg-item-price';
      p.textContent = '€ ' + (parseFloat(item.price) * (item.qty || 1)).toFixed(2).replace('.', ','); row.appendChild(p);
    }
    cat.appendChild(row);
  });
  return cat;
}

window.openUrgentiModal = () => {
  const body        = document.getElementById('urgentiBody');
  const afterRelease = new Date() >= NOVITA_RELEASE;
  body.innerHTML    = '';
  let totalUrg      = 0;

  for (let c = 0; c < 3; c++) {
    const items = state.data[c].filter(r => r.urgent && !r.done && r.text.trim());
    if (!items.length) continue;
    totalUrg += items.length;
    body.appendChild(buildUrgentiCategory(c, items, afterRelease));
  }
  if (!totalUrg)
    body.innerHTML = '<div class="urg-empty">🎉 Nessun articolo urgente!<br><span style="font-size:13px;font-weight:600;">Tutto sotto controllo.</span></div>';

  document.getElementById('urgModalSub').textContent =
    totalUrg > 0 ? `${totalUrg} ${totalUrg === 1 ? 'articolo da prendere' : 'articoli da prendere'}` : 'Nessun urgente';
  document.getElementById('urgentiModal').classList.add('show');
};

window.closeUrgentiModal = (e) => {
  if (!e || e.target === document.getElementById('urgentiModal'))
    document.getElementById('urgentiModal').classList.remove('show');
};
