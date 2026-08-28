// ════════════════════════════════════════════════════════════════
// modals.js — Popup blocco contenuti e popup conferma personalizzato
// ════════════════════════════════════════════════════════════════
// Modulo "foglia": nessuna dipendenza da altri moduli locali.

let _bloccoTimeout  = null;
let _confirmResolve = null;

// ── POPUP BLOCCO (parole vietate / alimenti vietati) ──────────────

window.chiudiBlocco = () => {
  clearTimeout(_bloccoTimeout);
  document.getElementById('bloccoScreen').classList.remove('show');
};

export function mostraBlocco(tipo) {
  const msgs = {
    blasfemia: { ico: '🤬', tit: 'Parola non consentita!', msg: 'Questa espressione non è permessa. Usa un linguaggio rispettoso! 🙏' },
    alimento:  { ico: '🥴', tit: 'Alimento non consentito!', msg: 'Questo alimento non può essere aggiunto alla lista!' }
  };
  const m = msgs[tipo] || msgs.blasfemia;
  document.getElementById('bloccoIco').textContent  = m.ico;
  document.getElementById('bloccoTit').textContent  = m.tit;
  document.getElementById('bloccoMsg').textContent  = m.msg;
  document.getElementById('bloccoScreen').classList.add('show');
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  clearTimeout(_bloccoTimeout);
  _bloccoTimeout = setTimeout(chiudiBlocco, 5000);
}

// ── CONFERMA PERSONALIZZATA (sostituisce confirm() nativo) ──
// Restituisce una Promise<boolean>: true se l'utente conferma, false se annulla
// o chiude toccando fuori dalla card. 'tema' sceglie i colori: 'rosso' per le
// azioni distruttive (es. rimuovere articoli), 'neutro' per le altre (es. esci).
export function customConfirm({ icon = '❓', title = 'Conferma', message = '', okText = 'Conferma', tema = 'rosso' } = {}) {
  document.getElementById('confirmIco').textContent   = icon;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent   = message;
  document.getElementById('confirmTop').className     = 'confirm-top tema-' + tema;
  const okBtn = document.getElementById('confirmOkBtn');
  okBtn.textContent = okText;
  okBtn.className   = 'btn-confirm-ok ' + tema;
  document.getElementById('confirmModal').classList.add('show');
  return new Promise((resolve) => { _confirmResolve = resolve; });
}

window.respondConfirm = (val) => {
  document.getElementById('confirmModal').classList.remove('show');
  if (_confirmResolve) { _confirmResolve(val); _confirmResolve = null; }
};

window.closeCustomConfirm = (e) => {
  if (!e || e.target === document.getElementById('confirmModal')) window.respondConfirm(false);
};
