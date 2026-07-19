// ════════════════════════════════════════════════════════════════
// state.js — Stato condiviso dell'applicazione
// ════════════════════════════════════════════════════════════════
// Tutte le variabili che nello script originale erano `let` a livello
// di modulo e venivano lette/scritte da più punti dell'app vivono qui
// come proprietà di un unico oggetto `state`. Gli altri moduli
// importano `{ state }` e leggono/scrivono `state.xxx`: così ogni
// modulo vede sempre il valore aggiornato (binding live) senza dover
// riassegnare l'import stesso, cosa che gli ES Modules non permettono.
//
// Variabili rimaste locali ai rispettivi moduli (non qui) perché non
// sono mai lette da altri file: tipoInvito/linkGenerato (family.js),
// _bloccoTimeout/_confirmResolve (modals.js).

import { MIN_ROWS } from './config.js';

export const state = {
  data:               [[], [], []],
  currentTab:         0,
  currentView:        'tab',
  dbUnsubscribe:      null,
  currentUserName:    '',
  currentFamilyId:    '',
  userFamilies:       [],
  currentFamilyIndex: 0,
  paroleBannate:      [],
  alimentiVietati:    [],
  localSaveId:        null,
  saveTimeout:        null,
  loadingTimer:       null,
  isOffline:          false,
  wsBlocked:          false,
  restPollInterval:   null
};

export const emptyRow = () => ({
  text: '', done: false, photo: null, qty: 1,
  urgent: false, lastAction: '', actions: [], price: ''
});

export const ensureRows = (col) => {
  while (state.data[col].length < MIN_ROWS) state.data[col].push(emptyRow());
};
