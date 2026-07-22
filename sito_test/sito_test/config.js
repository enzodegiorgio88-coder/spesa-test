// ════════════════════════════════════════════════════════════════
// config.js — Configurazione Firebase, OneSignal, costanti globali
// ════════════════════════════════════════════════════════════════
// Nessun modulo locale viene importato qui: config.js è una foglia
// dell'albero delle dipendenze, così può essere importata da
// qualsiasi altro modulo senza creare dipendenze circolari.

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
// Firebase Storage importato dinamicamente in photo.js per non bloccare il modulo se non disponibile

export const firebaseConfig = {
  apiKey: "AIzaSyCIz9GPY5owaUibwPPSdo26VUOpU8oXMhI",
  authDomain: "spesa-68973.firebaseapp.com",
  databaseURL: "https://spesa-68973-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "spesa-68973",
  storageBucket: "spesa-68973.firebasestorage.app",
  messagingSenderId: "39058140627",
  appId: "1:39058140627:web:81170db04b23a468de1326"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth        = getAuth(firebaseApp);
export const db          = getDatabase(firebaseApp);
export const provider    = new GoogleAuthProvider();

// ── AMBIENTE: SITO UFFICIALE oppure SITO DI TEST ───
// QUESTA È L'UNICA RIGA DA CAMBIARE tra le due copie del sito:
//   true  → versione di TEST:     tutti i dati vanno nei nodi *_test
//   false → versione UFFICIALE:   tutti i dati vanno nei nodi "puliti"
// Stesso progetto Firebase, dati completamente separati. Tutti i
// percorsi qui sotto si costruiscono DA SOLI in base a questa scelta:
// non va toccato nient'altro in nessun altro file.
export const IS_TEST = true;  // ← QUESTA COPIA: SITO UFFICIALE (nodi puliti: spesa, membri, inviti...)

// Suffisso dei percorsi: '_test' nella versione di test, niente in quella ufficiale.
const T = IS_TEST ? '_test' : '';

// ── PERCORSI DATI (derivati automaticamente da IS_TEST) ──
export const PATH_PREFIX     = 'spesa'  + T;                  // lista della spesa
export const INVITE_PATH     = 'inviti' + T;                  // inviti
export const INVITE_IDX_PATH = 'inviti' + T + '_by_famiglia'; // indice inviti per famiglia
export const MEMBRI_PATH     = 'membri' + T;                  // membri delle famiglie
export const BACKUP_PATH     = 'backup' + T;                  // copie di backup nell'app (usato da backup.js)
export const STORAGE_PREFIX  = 'famiglie' + T;                // cartella foto su Firebase Storage (usato da photo.js)

// ── COSTANTI ───────────────────────────────────────
export const LABELS           = ['Casa', 'Persona', 'Alimentari'];
export const COLORS           = ['#FF6B6B', '#4ECDC4', '#45B7D1'];
export const NOVITA_RELEASE   = new Date('2026-07-01T00:00:00');
export const NOVITA_KEY       = 'novita_v5_priorita_visto';

// ── NUOVO LUGLIO 2026: popup "Sono in vacanza" ─────
// Per le PROSSIME vacanze basta cambiare QUESTE DUE date: giorni nel
// messaggio, periodo di comparsa e "già visto" si aggiornano DA SOLI.
// Il popup compare dalle 00:00 di VACANZA_INIZIO (primo giorno di
// vacanza) e sparisce alle 00:00 di VACANZA_FINE (giorno del ritorno).
export const VACANZA_INIZIO = new Date('2026-07-25T00:00:00');
export const VACANZA_FINE   = new Date('2026-07-28T00:00:00');

export const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_ROWS         = 15;

// ── ONESIGNAL ──────────────────────────────────────
// Stesso ID usato nello script inline in <head> di index.html (che deve
// restare inline e sincrono per inizializzare la coda OneSignalDeferred
// prima ancora che l'SDK esterno venga eseguito) e in notifications.js.
export const ONESIGNAL_APP_ID = '6181803b-9cf7-494c-8a8a-d22c6584c065';