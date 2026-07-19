// ════════════════════════════════════════════════════════════════
// sync.js — Sincronizzazione realtime, fallback REST, offline
// ════════════════════════════════════════════════════════════════
// Per evitare una dipendenza circolare con list.js (che a sua volta
// importa saveToFirebase da qui), questo modulo NON importa list.js.
// Quando arrivano nuovi dati da Firebase, invece di chiamare
// direttamente renderAll(), invoca una callback registrata dall'esterno
// tramite onDataChange(). main.js collega renderAll() a questa callback
// una sola volta, all'avvio.

import { ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { auth, db, firebaseConfig, PATH_PREFIX } from './config.js';
import { state, ensureRows } from './state.js';
import { showToast, setLoadingVisible, showConnError, hideConnError } from './utils.js';
import { customConfirm } from './modals.js';

let renderCallback = () => {};
export function onDataChange(callback) { renderCallback = callback; }

const setSynced = (ok) => {
  const el = document.getElementById('syncDot');
  el.textContent = ok ? '☁️ Sync' :  (state.isOffline ? '📴 In attesa di rete' : '🔄 Salvataggio...');
  el.style.opacity = ok ? '0.85' : '1';
};

function parseSnapshotData(val) {
  let raw;
  if (!val)          raw = [[], [], []];
  else if (Array.isArray(val)) raw = val;       // formato vecchio, compatibilità
  else if (val.lista) raw = val.lista;
  else               raw = [[], [], []];

  return raw.map(col => (col || []).map(r => ({
    text:       r.text       || '',
    done:       !!r.done,
    photo:      r.photo      || null,
    qty:        r.qty        || 1,
    urgent:     !!r.urgent,
    lastAction: r.lastAction || '',
    actions:    r.actions    || [],
    price:      r.price      || ''
  })));
}

// ── FALLBACK HTTPS (usato quando il canale realtime/WebSocket è bloccato
//    dalla rete ma la normale connessione internet funziona) ─────────
async function restGet(path) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(`${firebaseConfig.databaseURL}/${path}.json?auth=${token}`);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function restSet(path, value) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(`${firebaseConfig.databaseURL}/${path}.json?auth=${token}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function applySnapshot(val) {
  // Ignora echo del nostro ultimo salvataggio
  if (val && val._saveId && val._saveId === state.localSaveId) {
    setSynced(true); return;
  }
  state.data = parseSnapshotData(val);
  for (let c = 0; c < 3; c++) ensureRows(c);
  setSynced(true);
  renderCallback();
}

async function tryRestFallback(motivo) {
  console.warn('[Realtime non risponde]', motivo, '— provo con una richiesta HTTPS normale...');
  try {
    const val = await restGet(`${PATH_PREFIX}/${state.currentFamilyId}`);
    // La richiesta HTTPS normale funziona: il problema è solo nel canale
    // "sempre aperto" del realtime, bloccato da questa rete/dispositivo.
    // Passiamo a un aggiornamento periodico invece che istantaneo.
    state.wsBlocked = true;
    setLoadingVisible(false);
    hideConnError();
    document.getElementById('limitedBanner').classList.add('show');
    applySnapshot(val);
    if (!state.restPollInterval) {
      state.restPollInterval = setInterval(async () => {
        try { applySnapshot(await restGet(`${PATH_PREFIX}/${state.currentFamilyId}`)); }
        catch { /* riproviamo al giro successivo, silenzioso */ }
      }, 20000);
    }
  } catch (e) {
    // Anche la richiesta HTTPS normale fallisce: qui il problema è reale
    // (rete che non raggiunge affatto Firebase, non solo il canale realtime).
    setLoadingVisible(false);
    showConnError(motivo + ' — e nemmeno la richiesta HTTPS di riserva funziona (' + e.message + ')');
  }
}

// ── PUNTO 11: MODIFICHE OFFLINE CHE SOPRAVVIVONO ALLA CHIUSURA ────
// Ogni salvataggio viene PRIMA copiato in localStorage e la copia viene
// eliminata solo quando Firebase conferma la scrittura. Se l'app viene
// chiusa mentre si è offline (Firebase non ha ancora confermato), alla
// riapertura la copia è ancora lì: un popup chiede se ripristinarla.
// La chiave è per-famiglia, così il cambio famiglia non fa confusione.

const pendingKey = () => `pendingSave_${state.currentFamilyId}`;

function salvaPendingLocale(payload) {
  try {
    localStorage.setItem(pendingKey(), JSON.stringify({ quando: Date.now(), payload }));
  } catch (e) {
    // localStorage pieno (capita con molte foto in base64): non bloccante,
    // in quel caso vale il comportamento di prima (modifiche solo in coda).
    console.warn('[Offline] Copia locale non salvata:', e.message);
  }
}

function rimuoviPendingLocale() {
  try { localStorage.removeItem(pendingKey()); } catch { /* non bloccante */ }
}

async function controllaPendingOffline() {
  let salvato = null;
  try { salvato = JSON.parse(localStorage.getItem(pendingKey())); } catch { /* corrotto */ }
  if (!salvato || !salvato.payload || !salvato.payload.lista) { rimuoviPendingLocale(); return; }

  const quando = new Date(salvato.quando || Date.now());
  const g = quando.toLocaleDateString('it-IT');
  const h = quando.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const ok = await customConfirm({
    icon: '📴',
    title: 'Modifiche non salvate',
    message: `Hai delle modifiche fatte offline il ${g} alle ${h}, mai arrivate su Firebase perché l'app è stata chiusa prima che tornasse la rete. Vuoi ripristinarle e salvarle adesso? Se scegli Annulla verranno scartate.`,
    okText: 'Sì, ripristina',
    tema: 'neutro'
  });
  if (!ok) { rimuoviPendingLocale(); showToast('Modifiche offline scartate'); return; }

  state.data = parseSnapshotData(salvato.payload);
  for (let c = 0; c < 3; c++) ensureRows(c);
  renderCallback();
  doSave();   // parte subito, o resta in coda finché non c'è rete
  showToast('✅ Modifiche offline ripristinate');
}

export function startListening() {
  setLoadingVisible(true, 'Caricamento lista...');
  if (state.dbUnsubscribe) { state.dbUnsubscribe(); state.dbUnsubscribe = null; }
  if (state.restPollInterval) { clearInterval(state.restPollInterval); state.restPollInterval = null; }
  state.wsBlocked = false;
  document.getElementById('limitedBanner').classList.remove('show');

  state.loadingTimer = setTimeout(() => {
    tryRestFallback('Nessuna risposta dal canale realtime dopo 10 secondi');
  }, 10000);

  const spesaRef = ref(db, `${PATH_PREFIX}/${state.currentFamilyId}`);
  state.dbUnsubscribe = onValue(spesaRef, (snap) => {
    clearTimeout(state.loadingTimer);
    setLoadingVisible(false);
    hideConnError();

    if (state.wsBlocked) {
      // Il canale realtime è tornato disponibile: torniamo alla modalità normale.
      state.wsBlocked = false;
      if (state.restPollInterval) { clearInterval(state.restPollInterval); state.restPollInterval = null; }
      document.getElementById('limitedBanner').classList.remove('show');
      showToast('✅ Connessione in tempo reale ripristinata');
    }
    applySnapshot(snap.val());
  }, (err) => {
    clearTimeout(state.loadingTimer);
    tryRestFallback('Errore dal canale realtime (' + (err.code || err.message) + ')');
  });

  // Modifiche rimaste in sospeso da una sessione precedente?
  // (fire-and-forget: il popup gestisce tutto da solo)
  controllaPendingOffline();
}

async function doSave() {
  const saveId  = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  state.localSaveId = saveId;
  const payload = {
    _saveId: saveId,
    lista: state.data.map(col => col.map(r => ({
      text: r.text || '', done: !!r.done, photo: r.photo || null,
      qty: r.qty || 1, urgent: !!r.urgent,
      lastAction: r.lastAction || '', actions: r.actions || [], price: r.price || ''
    })))
  };
  // Copia di sicurezza locale PRIMA di tentare la rete: se l'app viene
  // chiusa prima della conferma di Firebase, la ritroviamo alla riapertura.
  salvaPendingLocale(payload);
  try {
    if (state.wsBlocked) {
      await restSet(`${PATH_PREFIX}/${state.currentFamilyId}`, payload);
    } else {
      await set(ref(db, `${PATH_PREFIX}/${state.currentFamilyId}`), payload);
    }
    rimuoviPendingLocale();   // Firebase ha confermato: la copia non serve più
    setSynced(true);
  } catch (e) {
    state.localSaveId = null;
    setSynced(false);
    showToast('❌ Errore salvataggio');
  }
}

export function saveToFirebase() {
  setSynced(false);
  clearTimeout(state.saveTimeout);
  state.saveTimeout = setTimeout(doSave, 300);
}

// ── OFFLINE ────────────────────────────────────────

export function monitorConnection() {
  onValue(ref(db, '.info/connected'), (snap) => {
    state.isOffline = !snap.val();
    document.getElementById('offlineBanner').classList.toggle('show', state.isOffline);
    // Niente più campi in sola lettura: offline si può aggiungere e
    // modificare tutto. L'SDK di Firebase tiene le scritture in coda
    // (set() resta in attesa) e le invia da solo al ritorno della rete,
    // finché la pagina resta aperta. Restano bloccate solo le azioni che
    // richiedono per forza la rete (foto e link invito).
  });
}
