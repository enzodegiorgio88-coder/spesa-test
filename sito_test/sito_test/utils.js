// ════════════════════════════════════════════════════════════════
// utils.js — Utility comuni (toast, loading, banner, helper generici)
// ════════════════════════════════════════════════════════════════
// Modulo "foglia": non importa da nessun altro file locale, così può
// essere usato da qualunque modulo senza creare dipendenze circolari.

export const pad2 = (n) => String(n).padStart(2, '0');

export const showToast = (msg, dur = 2500) => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
};

export const setLoadingVisible = (show, msg = '') => {
  document.getElementById('loadingOverlay').classList.toggle('show', show);
  if (msg) document.getElementById('loadingMsg').textContent = msg;
};

export const showConnError = (debugMsg = '') => {
  setLoadingVisible(false);
  const dbg = document.getElementById('connErrorDebug');
  if (dbg) dbg.textContent = debugMsg ? ('Dettaglio tecnico: ' + debugMsg) : '';
  document.getElementById('connError').classList.add('show');
};

export const hideConnError = () => {
  document.getElementById('connError').classList.remove('show');
};

window.reloadApp = () => window.location.reload();

// ── PRIVACY ────────────────────────────────────────

export function showPrivacyNotice() {
  if (localStorage.getItem('privacy_accepted')) return;
  document.getElementById('privacyNotice').classList.add('show');
}

window.acceptPrivacy = () => {
  localStorage.setItem('privacy_accepted', '1');
  document.getElementById('privacyNotice').classList.remove('show');
};

// ── HELPER COMUNI ──────────────────────────────────

export function fbCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch { /* fallback silent */ }
  document.body.removeChild(ta); cb();
}

// ── IMPORTI IN EURO ────────────────────────────────
// CORREZIONE SETTEMBRE 2026: un solo posto in tutta l'app dove si decide
// come si scrive una cifra di soldi. Prima ogni file aveva il suo
// `toFixed(2).replace('.', ',')` copiato a mano — otto copie fra riga,
// totale, WhatsApp, urgenti, backup, statistiche e memoria prezzi — e
// nessuna di quelle copie metteva il punto delle migliaia: mille euro si
// leggevano "1000,00 €" invece di "1.000,00 €". Adesso tutte passano da
// qui e cambiano tutte insieme.
//
// Formato italiano: punto per le migliaia, virgola per i centesimi.
//   5        → "5,00"
//   999      → "999,00"
//   1000     → "1.000,00"
//   25500.5  → "25.500,50"

// Il prezzo di un articolo è una stringa scritta a mano: di solito "1.29",
// ma anche "1,29" se qualcuno ha usato la virgola, oppure "" se non c'è.
// parseFloat("1,29") da solo darebbe 1, e parseFloat("") darebbe NaN.
export function aNumero(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}

// Solo la cifra: "1.250,50". Serve dove il simbolo € è già scritto
// nell'HTML, come nella barra del totale.
//
// I punti delle migliaia li mettiamo a mano invece di usare
// Intl.NumberFormat('it-IT'): in italiano quello raggruppa solo da cinque
// cifre in su (regola "min2" del CLDR), quindi scriverebbe "10.000,00" ma
// anche "1000,00" — proprio il caso che qui deve venire "1.000,00". Fatto
// così il risultato è anche identico su tutti i telefoni, senza dipendere
// dalla tabella delle lingue installata sul dispositivo.
export function soldi(v) {
  const n     = aNumero(v);
  const fisso = Math.abs(n).toFixed(2);            // "1250.50"
  const punto = fisso.indexOf('.');
  const interi     = fisso.slice(0, punto);
  const centesimi  = fisso.slice(punto + 1);
  // Un punto ogni tre cifre partendo da destra: 1250 → 1.250
  const migliaia = interi.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + migliaia + ',' + centesimi;
}

// Con il simbolo davanti: "€ 1.250,50". È il formato che si vede nelle
// righe della lista, nei popup e nelle statistiche.
export const euro = (v) => '€ ' + soldi(v);

// Con il simbolo dopo: "1.250,50 €". È il formato del testo per WhatsApp
// e del totale nell'anteprima dei backup.
export const euroDopo = (v) => soldi(v) + ' €';
