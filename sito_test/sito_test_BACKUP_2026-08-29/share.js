// ════════════════════════════════════════════════════════════════
// share.js — Testo condivisibile WhatsApp, popup copia
// ════════════════════════════════════════════════════════════════

import { LABELS } from './config.js';
import { state } from './state.js';
import { showToast, fbCopy } from './utils.js';

function buildListText() {
  const oggi  = new Date().toLocaleDateString('it-IT');
  const lines = [`🛒 *LISTA DELLA SPESA* — ${oggi}\n`];
  const urgenti = [];
  const importanti = [];   // NUOVO: come gli urgenti, sezione dedicata in fondo
  let has = false;
  let totale = 0;
  // Formato importi: "2,50 €"
  const fmtE = (n) => n.toFixed(2).replace('.', ',') + ' €';

  for (let c = 0; c < 3; c++) {
    const items = state.data[c].filter(r => r.text.trim());
    if (!items.length) continue;
    has = true;
    lines.push('\n' + ['🏠','👤','🛒'][c] + ` *${LABELS[c]}*`, '─────────────────');
    items.forEach(r => {
      const flag = r.urgent && !r.done ? ' 🔴' : (r.important && !r.done ? ' 🟠' : '');
      const p    = parseFloat(r.price);
      // Sempre chiari prezzo unitario, quantità e totale:
      //  - prezzo e quantità > 1  → "2,00 € × 2 = 4,00 €"
      //  - solo prezzo            → "2,00 €"
      //  - solo quantità > 1      → "x2"
      let dettagli = '';
      if (p > 0 && r.qty > 1)  dettagli = ` — ${fmtE(p)} × ${r.qty} = ${fmtE(p * r.qty)}`;
      else if (p > 0)          dettagli = ` — ${fmtE(p)}`;
      else if (r.qty > 1)      dettagli = ` x${r.qty}`;
      if (p > 0) totale += p * (r.qty || 1);
      lines.push((r.done ? '✅' : '⬜') + ' ' + r.text + dettagli + flag);
      if (r.urgent && !r.done) urgenti.push(r.text + dettagli);
      if (r.important && !r.done) importanti.push(r.text + dettagli);
    });
  }
  if (!has) return null;
  if (urgenti.length) { lines.push('\n⚠️ *DA PRENDERE PER FORZA:*'); urgenti.forEach(u => lines.push('🔴 ' + u)); }
  // NUOVO: gli importanti hanno la loro sezione, come gli urgenti. Il
  // formato dei prezzi (unitario × quantità = totale) resta IDENTICO.
  if (importanti.length) { lines.push('\n🟠 *DA NON DIMENTICARE:*'); importanti.forEach(u => lines.push('🟠 ' + u)); }
  if (totale > 0) lines.push('\n💶 *Totale stimato: ' + fmtE(totale) + '*');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// CORREZIONE luglio 2026: nell'anteprima del popup vogliamo vedere
// il vero GRASSETTO (senza asterischi), ma negli appunti dobbiamo
// comunque copiare il testo CON gli asterischi, perché è così che
// WhatsApp capisce cosa mettere in grassetto. Quindi teniamo da
// parte il testo "originale" e a schermo mostriamo una versione
// convertita in <b>…</b>.
// ─────────────────────────────────────────────────────────────

// Testo originale (con asterischi) che finirà negli appunti.
let testoDaCopiare = '';

// I nomi dei prodotti li scrivi tu a mano: prima rendiamo il testo
// sicuro per l'HTML (< > &), poi trasformiamo *…* nel grassetto vero.
function anteprimaConGrassetto(txt) {
  const sicuro = txt
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Ogni coppia di asterischi sulla stessa riga diventa <b>…</b>.
  return sicuro.replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
}

window.openCopyModal = () => {
  const text = buildListText();
  if (!text) { showToast('⚠️ La lista è vuota!'); return; }
  testoDaCopiare = text;                       // lo conserviamo per la copia (con asterischi)
  // Nell'anteprima mostriamo il grassetto vero, senza asterischi.
  document.getElementById('copyPreview').innerHTML = anteprimaConGrassetto(text);
  document.getElementById('copyModal').classList.add('show');
  document.body.classList.add('copy-modal-open');
};

window.closeCopyModal = (e) => {
  if (!e || e.target === document.getElementById('copyModal')) {
    document.getElementById('copyModal').classList.remove('show');
    document.body.classList.remove('copy-modal-open');
  }
};

window.doCopy = () => {
  // Copiamo il testo ORIGINALE con gli asterischi (non l'anteprima),
  // così quando incolli su WhatsApp il grassetto compare dove serve.
  const text = testoDaCopiare;
  const done = () => { document.getElementById('copyModal').classList.remove('show'); document.body.classList.remove('copy-modal-open'); showToast('✅ Lista copiata!'); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(() => fbCopy(text, done));
  else fbCopy(text, done);
};