// ════════════════════════════════════════════════════════════════
// main.js — Punto di ingresso dell'applicazione
// ════════════════════════════════════════════════════════════════
// Bootstrap, inizializzazione, collegamento tra moduli. Caricato da
// index.html come <script type="module" src="main.js">.

import { onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { auth, IS_TEST } from './config.js';
import { state } from './state.js';
import { loadUserConfig, saveUserEmailConfig, handleRedirect } from './auth.js';
import { processInvito, updateFamilyButton, registraMembro, checkInvitoParam } from './family.js';
import { loadParoleBannate, loadAlimentiVietati } from './content-filter.js';
import { startListening, monitorConnection, onDataChange } from './sync.js';
import { showPrivacyNotice } from './utils.js';
import { controllaNovita, controllaVacanza } from './novita.js';
import { registraServiceWorker } from './notifications.js';
import { renderAll, renderRow } from './list.js';
import { onPhotoChange } from './photo.js';

// Moduli "a foglia" che espongono solo funzioni su window (richiamate
// dagli onclick nell'HTML) e non vengono importati da nessun altro
// modulo: vanno importati qui esplicitamente per soli effetti
// collaterali, altrimenti il browser non li caricherebbe mai.
import './urgent.js';
import './share.js';
import './backup.js';

// ── COLLEGAMENTO TRA MODULI ─────────────────────────
// sync.js e photo.js non importano list.js (per evitare dipendenze
// circolari list.js ↔ sync.js e list.js ↔ photo.js): registriamo qui,
// una sola volta, le funzioni di list.js che devono essere richiamate
// dopo un aggiornamento dati o una modifica foto.
onDataChange(renderAll);
onPhotoChange(renderRow);

// ── INIT APP POST-LOGIN ────────────────────────────

function setUserUI(user) {
  document.getElementById('loginScreen').style.display  = 'none';
  document.getElementById('appScreen').style.display    = 'block';
  document.getElementById('userAvatar').src             = user.photoURL || '';
  document.getElementById('userName').textContent       = user.displayName?.split(' ')[0] || user.email;
}

function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display   = 'none';
  if (state.dbUnsubscribe) { state.dbUnsubscribe(); state.dbUnsubscribe = null; }
  state.data = [[], [], []];
}

async function setupApp(user) {
  setUserUI(user);

  const config          = await loadUserConfig(user);
  state.currentUserName = config.nome;
  state.userFamilies    = config.famiglie || [];

  const pendingInvito = localStorage.getItem('pendingInvito');
  let joinToken = null;
  if (pendingInvito) {
    localStorage.removeItem('pendingInvito');
    history.replaceState({}, '', window.location.pathname);
    const fromInvite = await processInvito(pendingInvito);
    state.currentFamilyId = fromInvite ? fromInvite.famiglia : config.famiglia;
    joinToken              = fromInvite ? fromInvite.token   : null;
    if (fromInvite) await saveUserEmailConfig(user, state.currentFamilyId);
  } else {
    const savedFamily = localStorage.getItem(`lastFamily_${user.uid}`);
    const hasSaved     = savedFamily && state.userFamilies.some(f => f.id === savedFamily);
    state.currentFamilyIndex = hasSaved ? state.userFamilies.findIndex(f => f.id === savedFamily) : 0;
    state.currentFamilyId    = hasSaved ? savedFamily : config.famiglia;
  }

  await Promise.all([loadParoleBannate(), loadAlimentiVietati(state.currentFamilyId)]);

  updateFamilyButton();
  registraMembro(joinToken);
  startListening();
  monitorConnection();
  showPrivacyNotice();
     setTimeout(controllaNovita, 800);
  // NUOVO LUGLIO 2026: poco dopo il controllo Novità, controlliamo se
  // siamo nel periodo del popup "Sono in vacanza" (date in config.js).
  setTimeout(controllaVacanza, 1200);
}

// ── AVVIO ──────────────────────────────────────────

// Banner "SITO DI TEST": solo nella copia di test (IS_TEST = true in
// config.js) il badge in cima alla pagina diventa visibile e il titolo
// della scheda del browser viene marcato con 🧪 TEST, così le due copie
// del sito non si confondono mai, nemmeno tra le schede aperte. Nella
// copia ufficiale (IS_TEST = false) non compare niente di tutto questo.
if (IS_TEST) {
  document.body.classList.add('sito-test');
  document.title = '🧪 TEST — ' + document.title;
}

checkInvitoParam();
handleRedirect();
registraServiceWorker();

onAuthStateChanged(auth, (user) => {
  // Punto 5 (flash iniziale): lo script inline in <head> nasconde la schermata
  // di login se l'utente risultava già collegato (flag wasLoggedIn) e mostra
  // subito l'app in caricamento. Qui, appena Firebase risponde, aggiorniamo
  // il flag e togliamo lo stato "in attesa".
  document.documentElement.classList.remove('auth-pending');
  if (user) {
    try { localStorage.setItem('wasLoggedIn', '1'); } catch (e) {}
    setupApp(user);
  } else {
    try { localStorage.removeItem('wasLoggedIn'); } catch (e) {}
    showLoginScreen();
  }
});