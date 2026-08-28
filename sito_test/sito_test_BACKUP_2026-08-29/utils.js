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
