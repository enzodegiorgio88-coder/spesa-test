// ════════════════════════════════════════════════════════════════
// content-filter.js — Parole vietate, alimenti vietati, validazioni
// ════════════════════════════════════════════════════════════════

import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from './config.js';
import { state } from './state.js';

// ── LISTE LOCALI: funzionano SUBITO, anche senza Firebase ─────────
// Scrivi qui le parole e gli alimenti da bloccare, tra apici e separati
// da virgola. Maiuscole/minuscole non contano. Esempio:
//   const PAROLE_VIETATE_LOCALI = ['parola1', 'parola2', 'frase intera'];
// Le liste su Firebase (se esistono e sono leggibili) vengono AGGIUNTE
// a queste: Firebase serve solo per aggiungere voci senza toccare il codice.
const PAROLE_VIETATE_LOCALI = [
  // 'scrivi qui le parole da bloccare'
];
const ALIMENTI_VIETATI_LOCALI = [
  // 'scrivi qui gli alimenti da bloccare (valgono per tutte le famiglie)'
];

// ── NORMALIZZAZIONE ────────────────────────────────
// Firebase può restituire array O oggetti {chiave: valore}; le voci
// vuote bloccherebbero qualsiasi testo e quelle non testuali andrebbero
// in errore: qui tutto viene reso minuscolo, ripulito e filtrato.
function normalizzaLista(val) {
  if (!val) return [];
  const arr = Array.isArray(val) ? val : Object.values(val);
  return arr.map(v => String(v).toLowerCase().trim()).filter(v => v.length > 0);
}

// Unione locale + Firebase, senza doppioni.
function unisci(locale, remoto) {
  return [...new Set([...normalizzaLista(locale), ...normalizzaLista(remoto)])];
}

// ── WORD FILTER ────────────────────────────────────
// Le liste in state sono già normalizzate (minuscole, senza voci vuote).

export function haBlasfemia(testo) {
  const t  = (testo || '').toLowerCase();
  const tc = t.replace(/\s+/g, '');
  return state.paroleBannate.some(p => t.includes(p) || tc.includes(p.replace(/\s+/g, '')));
}

export function haAlimentoVietato(testo) {
  if (!state.alimentiVietati.length) return null;
  const t = (testo || '').toLowerCase().trim();
  return state.alimentiVietati.find(a => t.includes(a)) || null;
}

// ── CONFIG DA FIREBASE ─────────────────────────────
// I messaggi [Filtro] nella console del browser (tasto F12 sul PC)
// dicono ESATTAMENTE cosa è stato caricato o quale problema c'è.

export async function loadParoleBannate() {
  const percorso = 'config/parole_vietate';
  try {
    const snap = await get(ref(db, percorso));
    if (snap.exists()) {
      state.paroleBannate = unisci(PAROLE_VIETATE_LOCALI, snap.val());
      console.log(`[Filtro] Parole vietate attive: ${state.paroleBannate.length} (Firebase + locali)`);
    } else {
      state.paroleBannate = normalizzaLista(PAROLE_VIETATE_LOCALI);
      console.warn(`[Filtro] Su Firebase il nodo "${percorso}" NON esiste: uso solo la lista locale (${state.paroleBannate.length} parole). Se il numero è 0, il filtro non può bloccare niente.`);
    }
  } catch (e) {
    state.paroleBannate = normalizzaLista(PAROLE_VIETATE_LOCALI);
    console.error(`[Filtro] Firebase NON permette di leggere "${percorso}" (${e.message}). Quasi sicuramente è un problema di REGOLE del database. Uso solo la lista locale (${state.paroleBannate.length} parole).`);
  }
}

export async function loadAlimentiVietati(familyId) {
  const percorso = `config/alimenti_vietati/${familyId}`;
  try {
    const snap = await get(ref(db, percorso));
    if (snap.exists()) {
      state.alimentiVietati = unisci(ALIMENTI_VIETATI_LOCALI, snap.val());
      console.log(`[Filtro] Alimenti vietati attivi per ${familyId}: ${state.alimentiVietati.length}`);
    } else {
      state.alimentiVietati = normalizzaLista(ALIMENTI_VIETATI_LOCALI);
      console.warn(`[Filtro] Su Firebase "${percorso}" non esiste: uso solo la lista locale (${state.alimentiVietati.length} alimenti).`);
    }
  } catch (e) {
    state.alimentiVietati = normalizzaLista(ALIMENTI_VIETATI_LOCALI);
    console.error(`[Filtro] Firebase non permette di leggere "${percorso}" (${e.message}). Controlla le regole del database. Uso solo la lista locale (${state.alimentiVietati.length} alimenti).`);
  }
}

// ── TEST RAPIDO DALLA CONSOLE ──────────────────────
// Apri il sito sul PC, premi F12 → scheda "Console" e scrivi:
//   testFiltro('una parola di prova')
// Ti dice quante voci sono caricate e se quel testo verrebbe bloccato.
window.testFiltro = (testo = '') => {
  console.log(`[Filtro] Parole vietate caricate: ${state.paroleBannate.length} | Alimenti vietati: ${state.alimentiVietati.length}`);
  if (!testo) { console.log('[Filtro] Uso: testFiltro("testo di prova")'); return; }
  if (haBlasfemia(testo))            console.log(`[Filtro] "${testo}" → BLOCCATO (parola vietata)`);
  else if (haAlimentoVietato(testo)) console.log(`[Filtro] "${testo}" → BLOCCATO (alimento vietato)`);
  else                               console.log(`[Filtro] "${testo}" → passa, nessun blocco`);
};
