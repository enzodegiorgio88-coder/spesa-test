// ════════════════════════════════════════════════════════════════
// prezzi.js — Memoria dei prezzi + tesserina di suggerimento
// ════════════════════════════════════════════════════════════════
// NUOVO LUGLIO 2026: l'app si ricorda quanto è stato pagato ogni
// articolo. Quando si riscrive lo stesso nome in una riga ancora senza
// prezzo, dopo una piccola pausa di digitazione scivola dentro da destra
// una tesserina che dice chi l'aveva messo e quanto. Con "Aggiungi" il
// prezzo finisce nel campo €, con "Annulla" la tesserina se ne va: in
// tutti e due i casi con la stessa animazione dell'entrata, al contrario.
//
// Il ricordo vive su Firebase (nodo PREZZI_PATH, quindi prezzi_test sul
// sito di test) ed è di tutta la famiglia: se il prezzo lo mette papà, il
// suggerimento lo vede anche chi scrive dal proprio telefono.
//
// ARCHITETTURA: questo modulo importa solo config.js, state.js e
// utils.js. NON importa list.js — altrimenti nascerebbe una dipendenza
// circolare, visto che è list.js a chiamare noi. Il pulsante "Aggiungi"
// quindi non sa scrivere nella riga da solo: riceve da list.js la
// funzione da eseguire, come si fa già con onDataChange/onPhotoChange.

import { ref, onValue, set }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { db, PREZZI_PATH } from './config.js';
import { state } from './state.js';
// euro(): "€ 1.250,50" — l'unico modo di scrivere un importo in tutta
// l'app. aNumero(): legge il prezzo salvato, che è una stringa.
import { showToast, aNumero, euro } from './utils.js';

// Quanto aspettiamo dopo l'ultimo tasto premuto prima di proporre il
// prezzo: abbastanza da non disturbare mentre si scrive, abbastanza poco
// da sembrare immediato appena ci si ferma.
const ATTESA_PROPOSTA = 600;

// ── MEMORIA (copia locale sempre aggiornata) ───────
// Teniamo in memoria una copia del nodo dei prezzi della famiglia: così
// la ricerca mentre si scrive è istantanea, senza una richiesta di rete
// a ogni pausa. Firebase ci avvisa da solo quando qualcun altro cambia
// un prezzo e la copia si aggiorna.
let memoria            = {};     // { chiave: { prezzo, autore, quando } }
let memoriaPronta      = false;  // Firebase ha già risposto almeno una volta?
let famigliaAgganciata = null;   // per quale famiglia stiamo ascoltando
let stopAscolto        = null;   // funzione per staccare il vecchio ascolto
let erroreGiaSegnalato = false;  // il toast d'errore lo mostriamo una volta sola

// Dal nome scritto dall'utente alla "chiave" con cui salviamo il ricordo:
// tutto minuscolo, senza accenti, senza spazi doppi e senza i caratteri
// che Firebase non accetta nelle chiavi ( . $ # [ ] / ).
// Così "Mozzarella", "  mozzarella " e "MOZZARELLA" sono la stessa cosa.
function chiaveDa(testo) {
  return (testo || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // caffè → caffe
    .toLowerCase()
    .replace(/[.$#\[\]\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);                                     // chiavi cortissime, per sicurezza
}

function segnalaErroreUnaVolta(e) {
  console.warn('[Memoria prezzi]', e && (e.code || e.message) ? (e.code || e.message) : e);
  if (erroreGiaSegnalato) return;
  erroreGiaSegnalato = true;
  showToast('⚠️ Memoria prezzi non disponibile', 3000);
}

// Ci agganciamo al nodo della famiglia attuale. Se nel frattempo si è
// cambiata famiglia (pulsante in alto), stacchiamo il vecchio ascolto e
// ripartiamo puliti: i prezzi di una famiglia non devono finire in un'altra.
function agganciaSeServe() {
  if (!state.currentFamilyId) return;
  if (famigliaAgganciata === state.currentFamilyId) return;

  if (stopAscolto) { stopAscolto(); stopAscolto = null; }
  famigliaAgganciata = state.currentFamilyId;
  memoria       = {};
  memoriaPronta = false;

  stopAscolto = onValue(
    ref(db, `${PREZZI_PATH}/${state.currentFamilyId}`),
    (snap) => { memoria = snap.val() || {}; memoriaPronta = true; },
    (err)  => { memoriaPronta = true; segnalaErroreUnaVolta(err); }
  );
}

// ── SCRITTURA: "ricordati questo prezzo" ───────────
// Chiamata da list.js ogni volta che si scrive nel campo €. Aspettiamo
// mezzo secondo di pausa per non scrivere sul database a ogni tasto.
const timerScrittura = {};

export function ricordaPrezzo(nome, prezzo, autore) {
  const chiave = chiaveDa(nome);
  const valore = aNumero(prezzo);
  if (!chiave || !(valore > 0)) return;

  agganciaSeServe();
  const prezzoTesto = valore.toFixed(2);

  clearTimeout(timerScrittura[chiave]);
  timerScrittura[chiave] = setTimeout(() => {
    // Se il ricordo è già identico non riscriviamo niente: meno traffico
    // e la data "quando" resta quella vera dell'ultimo cambio.
    const vecchio = memoria[chiave];
    if (vecchio && vecchio.prezzo === prezzoTesto && vecchio.autore === (autore || '')) return;

    const dati = { prezzo: prezzoTesto, autore: autore || '', quando: Date.now() };
    memoria[chiave] = dati;   // copia locale subito aggiornata
    set(ref(db, `${PREZZI_PATH}/${famigliaAgganciata}/${chiave}`), dati)
      .catch(segnalaErroreUnaVolta);
  }, 500);
}

// ── LETTURA: "quanto costava?" ─────────────────────
export function cercaPrezzo(nome) {
  agganciaSeServe();
  const chiave = chiaveDa(nome);
  if (!chiave) return null;
  const v = memoria[chiave];
  if (!v || !v.prezzo) return null;
  return { prezzo: v.prezzo, autore: v.autore || '', quando: v.quando || 0 };
}

// ── LA TESSERINA ───────────────────────────────────

let tessera        = null;   // elemento a schermo, se c'è
let tesseraMarchio = '';     // per quale riga+articolo è aperta
let timerProposta  = null;
const rifiutate    = new Set();   // proposte già scartate in questa sessione

// Piccolo "ding" fatto con due note generate dal browser: niente file da
// caricare, funziona anche offline. Sull'iPhone, se il telefono è in
// silenzioso, il suono non parte comunque: è iOS che zittisce tutto.
let ctxAudio = null;
function suonaDing() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctxAudio) ctxAudio = new AC();
    if (ctxAudio.state === 'suspended') ctxAudio.resume();
    const ora = ctxAudio.currentTime;
    [[880, 0], [1245, 0.09]].forEach(([nota, ritardo]) => {
      const osc = ctxAudio.createOscillator();
      const vol = ctxAudio.createGain();
      osc.type = 'sine';
      osc.frequency.value = nota;
      vol.gain.setValueAtTime(0.0001, ora + ritardo);
      vol.gain.exponentialRampToValueAtTime(0.22, ora + ritardo + 0.015);
      vol.gain.exponentialRampToValueAtTime(0.0001, ora + ritardo + 0.16);
      osc.connect(vol); vol.connect(ctxAudio.destination);
      osc.start(ora + ritardo); osc.stop(ora + ritardo + 0.2);
    });
  } catch (e) {
    console.warn('[Memoria prezzi] Suono non disponibile:', e.message);
  }
}

// La tesserina sta all'altezza della barra del totale (come da progetto).
// Invece di un valore fisso — che sul telefono e sul computer sarebbe
// diverso — misuriamo ogni volta dove si trova DAVVERO la barra: così è
// giusta anche quando scorrendo la barra si inchioda in alto (.tot-fixed).
function posizionaTessera(el) {
  const barra = document.getElementById('totaleBar');
  let sotto = 90;
  if (barra && barra.offsetHeight > 0) sotto = barra.getBoundingClientRect().bottom + 8;
  el.style.top = Math.max(8, sotto) + 'px';
}

function chiudiTessera(subito) {
  const c = tessera;
  tessera = null; tesseraMarchio = '';
  if (!c) return;
  window.removeEventListener('scroll', c._segui);
  window.removeEventListener('resize', c._segui);
  if (subito) { c.remove(); return; }
  // Stessa animazione dell'entrata, al contrario: torna fuori a destra.
  c.classList.remove('dentro');
  setTimeout(() => c.remove(), 450);
}

function mostraTessera({ nome, prezzo, autore, marchio, onAggiungi, onAnnulla }) {
  chiudiTessera(true);   // una sola tesserina alla volta

  const card = document.createElement('div');
  card.className = 'prezzo-card';

  // Testo costruito pezzo per pezzo (mai innerHTML): il nome dell'articolo
  // lo scrive l'utente, e così qualunque cosa scriva resta solo testo.
  const testo = document.createElement('div');
  testo.className = 'prezzo-testo';
  const b1 = document.createElement('b'); b1.textContent = nome.toUpperCase();
  const b2 = document.createElement('b'); b2.textContent = (autore || 'qualcuno').toUpperCase();
  const b3 = document.createElement('b'); b3.textContent = euro(prezzo);
  testo.append(
    document.createTextNode('🏷️ '), b1,
    document.createTextNode(' — l\'ultima volta l\'ha messa '), b2,
    document.createTextNode(' a '), b3
  );

  const azioni = document.createElement('div');
  azioni.className = 'prezzo-azioni';

  const btnNo = document.createElement('button');
  btnNo.type = 'button'; btnNo.className = 'btn-prezzo-annulla'; btnNo.textContent = 'Annulla';
  btnNo.onclick = () => { chiudiTessera(); if (onAnnulla) onAnnulla(); };

  const btnSi = document.createElement('button');
  btnSi.type = 'button'; btnSi.className = 'btn-prezzo-ok'; btnSi.textContent = 'Aggiungi';
  btnSi.onclick = () => { chiudiTessera(); if (onAggiungi) onAggiungi(); };

  azioni.append(btnNo, btnSi);
  card.append(testo, azioni);
  document.body.appendChild(card);

  // Mentre la pagina scorre la barra del totale si sposta: la tesserina
  // la segue, così resta sempre alla sua altezza.
  card._segui = () => posizionaTessera(card);
  window.addEventListener('scroll', card._segui, { passive: true });
  window.addEventListener('resize', card._segui, { passive: true });
  posizionaTessera(card);

  tessera = card; tesseraMarchio = marchio;

  // Un frame di attesa: serve al browser per "vedere" la posizione di
  // partenza (fuori a destra) e animare davvero l'entrata.
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('dentro')));
  suonaDing();
}

// ── IL CERVELLO: quando proporre ───────────────────
// Chiamata da list.js a ogni tasto premuto nel campo dell'articolo.
// Tutti i freni stanno qui dentro, così list.js resta pulita.
export function proponiPrezzoSeConosciuto(col, i, onAggiungi) {
  agganciaSeServe();
  clearTimeout(timerProposta);
  timerProposta = setTimeout(() => valuta(col, i, onAggiungi, 1), ATTESA_PROPOSTA);
}

function valuta(col, i, onAggiungi, tentativo) {
  const riga = state.data[col] && state.data[col][i];
  if (!riga) return;

  // Freno 1: se il prezzo c'è già, non c'è niente da suggerire.
  if (aNumero(riga.price) > 0) return;

  const chiave = chiaveDa(riga.text);
  if (!chiave) return;

  // Freno 2: proposta già scartata per questa riga e questo nome.
  const marchio = col + ':' + i + ':' + chiave;
  if (rifiutate.has(marchio)) return;

  // Freno 3: se è già aperta per la stessa cosa, la lasciamo stare
  // (altrimenti a ogni lettera ripartirebbe l'animazione e il suono).
  if (tessera && tesseraMarchio === marchio) return;

  // Appena aperta l'app, Firebase potrebbe non aver ancora risposto:
  // invece di dire "non lo conosco", riproviamo un paio di volte.
  if (!memoriaPronta && tentativo < 3) {
    timerProposta = setTimeout(() => valuta(col, i, onAggiungi, tentativo + 1), 500);
    return;
  }

  const ricordo = memoria[chiave];
  if (!ricordo || !ricordo.prezzo) return;

  mostraTessera({
    nome:    riga.text.trim(),
    prezzo:  ricordo.prezzo,
    autore:  ricordo.autore,
    marchio,
    onAggiungi: () => { rifiutate.add(marchio); onAggiungi(ricordo.prezzo); },
    onAnnulla:  () => { rifiutate.add(marchio); }
  });
}