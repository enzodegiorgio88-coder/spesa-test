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

// ── NUOVO: vista doppia Urgenti/Importanti ─────────────────────────
// Il popup ora mostra, a scelta, gli articoli 🔴 URGENTI oppure quelli
// 🟠 IMPORTANTI. Si cambia vista con la tendina in alto (stessa grafica
// e stesse didascalie del menu priorità delle righe): ridondanza voluta,
// le stesse informazioni raggiungibili da più punti ma sempre con lo
// stesso aspetto, così non ci si perde mai.
let filtroUrgenti = 'urgente';

function renderUrgentiBody() {
  const body         = document.getElementById('urgentiBody');
  const afterRelease = new Date() >= NOVITA_RELEASE;
  const rosso        = filtroUrgenti === 'urgente';
  const campo        = rosso ? 'urgent' : 'important';
  body.innerHTML     = '';
  let totale         = 0;

  for (let c = 0; c < 3; c++) {
    const items = state.data[c].filter(r => r[campo] && !r.done && r.text.trim());
    if (!items.length) continue;
    totale += items.length;
    body.appendChild(buildUrgentiCategory(c, items, afterRelease));
  }
  if (!totale)
    body.innerHTML = rosso
      ? '<div class="urg-empty">🎉 Nessun articolo urgente!<br><span style="font-size:13px;font-weight:600;">Tutto sotto controllo.</span></div>'
      : '<div class="urg-empty">🟠 Nessun articolo importante!<br><span style="font-size:13px;font-weight:600;">Niente promemoria per ora.</span></div>';

  document.getElementById('urgModalTitle').textContent = rosso ? '🔴 Articoli Urgenti' : '🟠 Articoli Importanti';
  document.getElementById('urgModalSub').textContent = totale > 0
    ? `${totale} ${totale === 1
        ? (rosso ? 'articolo da prendere' : 'articolo da non dimenticare')
        : (rosso ? 'articoli da prendere' : 'articoli da non dimenticare')}`
    : (rosso ? 'Nessun urgente' : 'Nessun importante');
  document.getElementById('btnUrgFiltro').textContent = rosso ? '🔴 Urgenti ▾' : '🟠 Importanti ▾';
  document.getElementById('urgentiModal').classList.toggle('importanti', !rosso);
}

window.openUrgentiModal = () => {
  // Vista iniziale furba: se non c'è nessun urgente ma c'è almeno un
  // importante, il popup parte direttamente sugli importanti.
  const cheUrg = state.data.flat().some(r => r.urgent    && !r.done && r.text.trim());
  const cheImp = state.data.flat().some(r => r.important && !r.done && r.text.trim());
  filtroUrgenti = (!cheUrg && cheImp) ? 'importante' : 'urgente';
  renderUrgentiBody();
  document.getElementById('urgentiModal').classList.add('show');
};

// Tendina del popup: apertura/chiusura e scelta della vista. Stesso
// posizionamento del menu priorità: centrato sullo schermo (vedi
// .prio-menu in style.css), sotto il pulsante o sopra se manca spazio.
window.toggleUrgFiltro = (ev) => {
  ev.stopPropagation();
  const btn  = document.getElementById('btnUrgFiltro');
  const menu = document.getElementById('urgFiltroMenu');
  const era  = menu.classList.contains('show');
  document.querySelectorAll('.prio-menu.show').forEach(m => m.classList.remove('show'));
  if (era) return;
  menu.classList.add('show');
  const r = btn.getBoundingClientRect();
  let top = r.bottom + 6;
  if (top + menu.offsetHeight > window.innerHeight - 8)
    top = Math.max(8, r.top - menu.offsetHeight - 6);
  menu.style.top = top + 'px';
};

window.setUrgFiltro = (tipo) => {
  filtroUrgenti = tipo;
  document.querySelectorAll('.prio-menu.show').forEach(m => m.classList.remove('show'));
  renderUrgentiBody();
};

window.closeUrgentiModal = (e) => {
  if (!e || e.target === document.getElementById('urgentiModal'))
    document.getElementById('urgentiModal').classList.remove('show');
};