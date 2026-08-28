// ════════════════════════════════════════════════════════════════
// family.js — Famiglie condivise, cambio famiglia, inviti, membri
// ════════════════════════════════════════════════════════════════

import { ref, get, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { auth, db, INVITE_PATH, INVITE_IDX_PATH, INVITE_EXPIRY_MS, MEMBRI_PATH } from './config.js';
import { state } from './state.js';
import { showToast, fbCopy } from './utils.js';
import { loadAlimentiVietati } from './content-filter.js';
import { startListening } from './sync.js';

// Stato locale a questo modulo: usato solo dal flusso di generazione link.
let tipoInvito   = 'famiglia';
let linkGenerato = '';

// ── INVITI ─────────────────────────────────────────

export async function processInvito(token) {
  try {
    const snap = await get(ref(db, `${INVITE_PATH}/${token}`));
    if (!snap.exists()) { showToast('❌ Link invito non valido', 4000); return null; }
    const inv = snap.val();
    if (Date.now() - (inv.creato || 0) > INVITE_EXPIRY_MS) {
      showToast('❌ Link invito scaduto (valido 7 giorni)', 4000); return null;
    }
    return { famiglia: inv.famiglia, token };
  } catch (e) {
    showToast('❌ Errore verifica invito'); return null;
  }
}

export function checkInvitoParam() {
  const invito = new URLSearchParams(window.location.search).get('invito');
  if (invito) localStorage.setItem('pendingInvito', invito);
}

// ── GESTIONE FAMIGLIA ──────────────────────────────

export function updateFamilyButton() {
  const btn = document.getElementById('btnSwitchFamily');
  const lbl = document.getElementById('familyLabel');
  if (!btn) return;
  if (state.userFamilies.length > 1) {
    const otherIdx = (state.currentFamilyIndex + 1) % state.userFamilies.length;
    btn.style.display  = 'flex';
    btn.textContent    = '⇄ ' + state.userFamilies[otherIdx].label;
    if (lbl) lbl.textContent = state.userFamilies[state.currentFamilyIndex].label;
  } else {
    btn.style.display = 'none';
    if (lbl) lbl.textContent = '';
  }
}

window.switchFamily = async () => {
  if (state.userFamilies.length < 2) return;
  state.currentFamilyIndex = (state.currentFamilyIndex + 1) % state.userFamilies.length;
  state.currentFamilyId    = state.userFamilies[state.currentFamilyIndex].id;
  localStorage.setItem(`lastFamily_${auth.currentUser?.uid}`, state.currentFamilyId);
  updateFamilyButton();
  await loadAlimentiVietati(state.currentFamilyId);
  if (state.dbUnsubscribe) state.dbUnsubscribe();
  state.data = [[], [], []];
  startListening();
  registraMembro();
  showToast('📂 Sei in: ' + state.userFamilies[state.currentFamilyIndex].label);
};

export async function registraMembro(joinToken = null) {
  const user = auth.currentUser;
  if (!user || !state.currentFamilyId) return;
  try {
    const membro = {
      nome: state.currentUserName,
      ultimoAccesso: new Date().toISOString()
    };
    if (joinToken) membro.joinToken = joinToken;
    await set(ref(db, `${MEMBRI_PATH}/${state.currentFamilyId}/${user.uid}`), membro);
  } catch { /* non bloccante */ }
}

// ── LINK INVITO ────────────────────────────────────

window.openInvitoModal = () => {
  tipoInvito = 'famiglia'; linkGenerato = '';
  document.getElementById('invitoRisultato').style.display  = 'none';
  document.getElementById('btnGeneraLink').style.display    = 'block';
  document.getElementById('btnCopiaLink').style.display     = 'none';
  document.getElementById('invitoNome').value               = '';
  setTipoInvito('famiglia');
  document.getElementById('invitoModal').style.display      = 'flex';
};

window.closeInvitoModal = (e) => {
  if (!e || e.target === document.getElementById('invitoModal'))
    document.getElementById('invitoModal').style.display = 'none';
};

function setTipoInvito(tipo) {
  tipoInvito  = tipo;
  const isFam = tipo === 'famiglia';
  const btnF  = document.getElementById('btnTipoFamiglia');
  const btnP  = document.getElementById('btnTipoPrivato');
  const on    = { background: '#00b894', borderColor: '#00b894', color: 'white' };
  const off   = { background: 'white',   borderColor: '#eee',    color: '#636e72' };
  Object.assign(btnF.style, isFam ? on : off);
  Object.assign(btnP.style, isFam ? off : on);
  document.getElementById('invitoDesc').textContent =
    isFam ? 'La persona entrerà nella lista della tua famiglia e vedrà tutto.'
          : 'Verrà creata una lista privata solo tra te e questa persona.';
  document.getElementById('invitoNomeWrap').style.display = isFam ? 'none' : 'block';
  document.getElementById('invitoRisultato').style.display = 'none';
  document.getElementById('btnGeneraLink').style.display   = 'block';
  document.getElementById('btnCopiaLink').style.display    = 'none';
}
window.setTipoInvito = setTipoInvito;

window.generaLink = async () => {
  if (state.isOffline) { showToast('❌ Non disponibile offline'); return; }
  if (tipoInvito === 'privato') {
    const nome = document.getElementById('invitoNome').value.trim();
    if (!nome) { showToast('Inserisci un nome per la lista!'); return; }
  }
  const token        = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  const familyTarget = tipoInvito === 'famiglia' ? state.currentFamilyId : `privato_${token}`;
  const creato        = Date.now();
  const scadenza       = creato + INVITE_EXPIRY_MS;
  try {
    // Scrittura 1: il record dell'invito. Deve completarsi PRIMA della scrittura
    // sull'indice, perché le regole dell'indice leggono questo record da root
    // (root riflette lo stato precedente alla scrittura corrente, quindi le due
    // operazioni vanno mantenute separate e non in un unico update() atomico).
    await set(ref(db, `${INVITE_PATH}/${token}`), {
      tipo: tipoInvito, famiglia: familyTarget,
      creatore: state.currentUserName, creatoreUid: auth.currentUser.uid, creato
    });
    // Scrittura 2: l'indice per famiglia, ora che l'invito esiste già in root.
    await set(ref(db, `${INVITE_IDX_PATH}/${familyTarget}/${token}`), scadenza);
    linkGenerato = `${window.location.origin}${window.location.pathname}?invito=${token}`;
    document.getElementById('invitoLinkTesto').textContent  = linkGenerato;
    document.getElementById('invitoRisultato').style.display = 'block';
    document.getElementById('btnGeneraLink').style.display   = 'none';
    document.getElementById('btnCopiaLink').style.display    = 'block';
  } catch (e) {
    showToast('❌ Errore generazione link');
  }
};

window.copiaLink = () => {
  if (!linkGenerato) return;
  const tipo  = tipoInvito === 'famiglia' ? 'lista della famiglia' : 'lista privata';
  const testo = `🛒 Ciao! Ti invito nella nostra ${tipo} della spesa.\nClicca qui:\n${linkGenerato}\nFai login con la tua email e sei dentro!`;
  const done  = () => { document.getElementById('invitoModal').style.display = 'none'; showToast('Link copiato! Incollalo su WhatsApp'); };
  if (navigator.clipboard) navigator.clipboard.writeText(testo).then(done).catch(() => fbCopy(testo, done));
  else fbCopy(testo, done);
};
