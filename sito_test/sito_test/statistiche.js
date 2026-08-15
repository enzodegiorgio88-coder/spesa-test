// ════════════════════════════════════════════════════════════════
// statistiche.js — Il riepilogo di quello che avete comprato
// ════════════════════════════════════════════════════════════════
// NUOVO SETTEMBRE 2026 (Fase 2): archivio.js mette da parte la spesa
// ogni volta che si preme "Rimuovi spuntati"; questo file è quello che
// finalmente la fa vedere. Si apre dal Menu (☰).
//
// SOLA LETTURA. Qui dentro non si scrive niente da nessuna parte: non
// su Firebase, non nella lista, non in localStorage. È la ragione per
// cui questo file non può rompere la spesa di nessuno — al massimo può
// mostrare un numero sbagliato.
//
// ARCHITETTURA: modulo foglia, importa solo config.js e state.js.
// Espone le funzioni su window perché i pulsanti sono onclick nell'HTML,
// come già fanno menu.js, backup.js e share.js.
//
// TESTO DELL'UTENTE: i nomi degli articoli e delle persone li scrivono
// loro. Qui vengono messi a schermo SEMPRE con textContent, mai con
// innerHTML — stessa disciplina del resto dell'app.

import { ref, get }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { db, ARCHIVIO_PATH, LABELS, COLORS } from './config.js';
import { state } from './state.js';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
              'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

// Quanti articoli mostrare nella classifica dei più comprati.
const QUANTI_TOP = 5;

// L'archivio letto una volta sola, tenuto qui finché la schermata resta
// aperta: { '2026-09': [pacchetto, pacchetto...] }. Così cambiare mese
// con le frecce è istantaneo e non fa una richiesta a ogni tocco.
let archivio   = {};
let meseAperto = '';   // '2026-09'

// ── FIREBASE RESTITUISCE GLI ARRAY COME OGGETTI ────
// Un array senza buchi torna come array, ma non è garantito: Firebase
// può sempre rispondere con { 0:…, 1:… }. Vale per l'elenco dei
// pacchetti di un mese e per le righe dentro ogni pacchetto. Stessa
// accortezza già presa in normalizzaListaBackup() e normalizzaLista().
function normalizza(v) {
  if (Array.isArray(v)) return v.filter(x => x);
  if (v && typeof v === 'object') return Object.values(v).filter(x => x);
  return [];
}

function chiaveMese(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// '2026-09' → 'settembre 2026'
function meseLeggibile(chiave) {
  const [anno, mese] = chiave.split('-').map(Number);
  return `${MESI[mese - 1]} ${anno}`;
}

// '2026-09' spostato di N mesi → '2026-08'. Il giorno 1 prima di
// setMonth() serve a non inciampare nei mesi corti (vedi archivio.js).
function meseSpostato(chiave, quanti) {
  const [anno, mese] = chiave.split('-').map(Number);
  const d = new Date(anno, mese - 1, 1);
  d.setMonth(d.getMonth() + quanti);
  return chiaveMese(d);
}

function soldi(n) {
  return n.toFixed(2).replace('.', ',');
}

// Il prezzo è una stringa scritta a mano: "1.29", ma anche "1,29" se
// qualcuno ha usato la virgola. parseFloat da solo su "1,29" darebbe 1.
function prezzoDi(riga) {
  const n = parseFloat(String(riga.prezzo || '').replace(',', '.'));
  return isFinite(n) && n > 0 ? n : 0;
}

// ── I CONTI ────────────────────────────────────────
// Da un elenco di pacchetti a tutti i numeri di un mese, in un giro solo.
function calcolaMese(pacchetti) {
  const r = {
    spese: pacchetti.length, articoli: 0, totale: 0,
    perPersona: {}, perCategoria: [0, 0, 0], perArticolo: {}, perGiorno: [0,0,0,0,0,0,0]
  };

  pacchetti.forEach(p => {
    const righe = normalizza(p.righe);
    if (p.quando) r.perGiorno[new Date(p.quando).getDay()] += righe.length;

    righe.forEach(riga => {
      const nome = String(riga.testo || '').trim();
      if (!nome) return;

      r.articoli++;
      r.totale += prezzoDi(riga) * (riga.qty && riga.qty > 1 ? riga.qty : 1);

      // Chi ha AGGIUNTO l'articolo, non chi ha svuotato la lista: è la
      // domanda vera ("chi aggiunge di più"). Se la riga è vecchia e non
      // ha autore, non la attribuiamo a nessuno per non falsare tutto.
      if (riga.autore) r.perPersona[riga.autore] = (r.perPersona[riga.autore] || 0) + 1;

      const c = Number(riga.col);
      if (c >= 0 && c <= 2) r.perCategoria[c]++;

      // "Latte", "latte" e "  LATTE " sono lo stesso articolo. Teniamo da
      // parte anche una versione scritta bene da mostrare a schermo.
      const chiave = nome.toLowerCase();
      if (!r.perArticolo[chiave]) r.perArticolo[chiave] = { nome, volte: 0 };
      r.perArticolo[chiave].volte++;
    });
  });

  return r;
}

// ── MATTONCINI DI INTERFACCIA ──────────────────────

function scheda(titolo) {
  const box = document.createElement('div');
  box.className = 'stat-card';
  const h = document.createElement('h3');
  h.className = 'stat-card-titolo';
  h.textContent = titolo;
  box.appendChild(h);
  return box;
}

// Una riga con etichetta, barra proporzionale e valore.
function barra(etichetta, valore, massimo, colore, suffisso) {
  const riga = document.createElement('div');
  riga.className = 'stat-bar-row';

  const testa = document.createElement('div');
  testa.className = 'stat-bar-testa';
  const nome = document.createElement('span');
  nome.className = 'stat-bar-nome';
  nome.textContent = etichetta;              // testo dell'utente: mai innerHTML
  const num = document.createElement('span');
  num.className = 'stat-bar-num';
  num.textContent = valore + (suffisso || '');
  testa.append(nome, num);

  const pista = document.createElement('div');
  pista.className = 'stat-bar';
  const piena = document.createElement('div');
  piena.className = 'stat-bar-fill';
  piena.style.width = (massimo > 0 ? Math.round(valore / massimo * 100) : 0) + '%';
  piena.style.background = colore;
  pista.appendChild(piena);

  riga.append(testa, pista);
  return riga;
}

function frase(testo, forte) {
  const p = document.createElement('p');
  p.className = 'stat-frase';
  if (forte) {
    const b = document.createElement('b');
    b.textContent = forte;
    p.append(document.createTextNode(testo), b);
  } else {
    p.textContent = testo;
  }
  return p;
}

// ── IL CONFRONTO COL MESE PRIMA ────────────────────
// Un numero da solo non dice niente: "142 articoli" diventa interessante
// solo accanto a "erano 130". Se il mese prima non esiste, non inventiamo
// un confronto: si scrive semplicemente che è il primo mese.
function confronto(oggi, prima) {
  const box = document.createElement('div');
  box.className = 'stat-confronto';

  if (!prima) {
    box.appendChild(frase('È il primo mese registrato: dal prossimo si potranno confrontare.'));
    return box;
  }

  const dArt = oggi.articoli - prima.articoli;
  const dTot = oggi.totale   - prima.totale;
  const segno = n => (n > 0 ? '+' : n < 0 ? '−' : '=');

  const riga = document.createElement('div');
  riga.className = 'stat-confronto-righe';

  [[segno(dArt) + (dArt ? Math.abs(dArt) : ''), 'articoli', dArt],
   [segno(dTot) + (dTot ? ' € ' + soldi(Math.abs(dTot)) : ''), 'spesa', dTot]
  ].forEach(([valore, etichetta, delta]) => {
    const d = document.createElement('div');
    d.className = 'stat-delta ' + (delta > 0 ? 'su' : delta < 0 ? 'giu' : 'pari');
    const v = document.createElement('span');
    v.className = 'stat-delta-val';
    v.textContent = valore;
    const e = document.createElement('span');
    e.className = 'stat-delta-lab';
    e.textContent = etichetta;
    d.append(v, e);
    riga.appendChild(d);
  });

  box.appendChild(riga);
  box.appendChild(frase('rispetto a ', meseLeggibile(meseSpostato(meseAperto, -1))));
  return box;
}

// ── DISEGNO DELLA SCHERMATA ────────────────────────

function disegna() {
  const corpo = document.getElementById('statBody');
  const titolo = document.getElementById('statMeseTitolo');
  if (!corpo || !titolo) return;

  corpo.textContent = '';                       // svuota, niente innerHTML
  titolo.textContent = meseLeggibile(meseAperto);

  // La freccia "avanti" si spegne se siamo già al mese corrente: non ha
  // senso navigare nel futuro.
  const avanti = document.getElementById('statAvanti');
  if (avanti) avanti.disabled = meseAperto >= chiaveMese(new Date());

  const pacchetti = normalizza(archivio[meseAperto]);

  if (!pacchetti.length) {
    const vuoto = document.createElement('div');
    vuoto.className = 'stat-vuoto';
    vuoto.textContent = '🛒 Nessuna spesa registrata in questo mese';
    const sotto = document.createElement('span');
    sotto.textContent = 'Il riepilogo si riempie quando premi "Rimuovi spuntati" dopo la spesa.';
    vuoto.appendChild(sotto);
    corpo.appendChild(vuoto);
    return;
  }

  const s      = calcolaMese(pacchetti);
  const prima  = archivio[meseSpostato(meseAperto, -1)]
               ? calcolaMese(normalizza(archivio[meseSpostato(meseAperto, -1)])) : null;

  // 1. I due numeri grossi
  const grossi = document.createElement('div');
  grossi.className = 'stat-grossi';
  [[s.articoli, s.articoli === 1 ? 'articolo' : 'articoli'],
   ['€ ' + soldi(s.totale), 'spesi']
  ].forEach(([n, lab]) => {
    const d = document.createElement('div');
    d.className = 'stat-grosso';
    const v = document.createElement('div'); v.className = 'stat-grosso-num'; v.textContent = n;
    const e = document.createElement('div'); e.className = 'stat-grosso-lab'; e.textContent = lab;
    d.append(v, e);
    grossi.appendChild(d);
  });
  corpo.appendChild(grossi);
  corpo.appendChild(frase(
    `in ${s.spese} ${s.spese === 1 ? 'spesa' : 'spese'}` +
    (s.articoli ? ` · media € ${soldi(s.totale / s.articoli)} ad articolo` : '')
  ));

  // 2. Confronto col mese prima
  corpo.appendChild(confronto(s, prima));

  // 3. Chi ha aggiunto di più
  const persone = Object.entries(s.perPersona).sort((a, b) => b[1] - a[1]);
  if (persone.length) {
    const box = scheda('🏆 Chi ha aggiunto di più');
    const max = persone[0][1];
    // Niente "ultimo posto" in evidenza: le medaglie si fermano al terzo
    // e da lì in giù sono tutti uguali. È una lista della spesa di
    // famiglia, non una classifica da esporre in cucina.
    const medaglie = ['🥇', '🥈', '🥉'];
    persone.forEach(([nome, n], i) => {
      box.appendChild(barra((medaglie[i] ? medaglie[i] + ' ' : '') + nome, n, max, '#6c5ce7', ''));
    });
    corpo.appendChild(box);
  }

  // 4. Categorie
  const maxCat = Math.max(...s.perCategoria);
  if (maxCat > 0) {
    const box = scheda('📂 Categorie');
    s.perCategoria.forEach((n, c) => box.appendChild(barra(LABELS[c], n, maxCat, COLORS[c], '')));
    corpo.appendChild(box);
  }

  // 5. I più comprati
  const top = Object.values(s.perArticolo)
    .filter(a => a.volte > 1)                    // comprato una volta sola non è una classifica
    .sort((a, b) => b.volte - a.volte)
    .slice(0, QUANTI_TOP);
  if (top.length) {
    const box = scheda('🔁 I più comprati');
    const max = top[0].volte;
    top.forEach(a => box.appendChild(barra(a.nome, a.volte, max, '#00b894', ' volte')));
    corpo.appendChild(box);
  }

  // 6. Il giorno della spesa
  const maxG = Math.max(...s.perGiorno);
  if (maxG > 0) {
    const giorno = GIORNI[s.perGiorno.indexOf(maxG)];
    const box = scheda('📅 Il giorno della spesa');
    box.appendChild(frase('Di solito si fa la spesa di ', giorno));
    corpo.appendChild(box);
  }
}

// ── APERTURA E CHIUSURA ────────────────────────────

window.apriStatistiche = async () => {
  const schermata = document.getElementById('statScreen');
  if (!schermata) return;

  schermata.classList.add('show');
  document.body.classList.add('menu-open');

  const corpo = document.getElementById('statBody');
  const titolo = document.getElementById('statMeseTitolo');
  if (titolo) titolo.textContent = '';
  if (corpo) {
    corpo.textContent = '';
    const attesa = document.createElement('div');
    attesa.className = 'stat-vuoto';
    attesa.textContent = '⏳ Leggo l\'archivio...';
    corpo.appendChild(attesa);
  }

  // Leggiamo tutto l'archivio in un colpo solo, non un mese alla volta:
  // serve comunque il mese precedente per il confronto, e archivio.js
  // cancella da sé tutto quello che supera i 13 mesi, quindi la quantità
  // resta piccola per sempre. In cambio, le frecce sono istantanee.
  try {
    const snap = await get(ref(db, `${ARCHIVIO_PATH}/${state.currentFamilyId}`));
    archivio = snap.exists() ? (snap.val() || {}) : {};
  } catch (e) {
    console.warn('[Statistiche] archivio non leggibile:', e.code || e.message);
    archivio = {};
    if (corpo) {
      corpo.textContent = '';
      const err = document.createElement('div');
      err.className = 'stat-vuoto';
      err.textContent = '⚠️ Non riesco a leggere l\'archivio';
      const sotto = document.createElement('span');
      sotto.textContent = 'Controlla la connessione e riprova tra poco.';
      err.appendChild(sotto);
      corpo.appendChild(err);
    }
    return;
  }

  // Si apre sempre sul mese corrente, anche se è ancora vuoto: è quello
  // che la gente si aspetta di vedere per primo.
  meseAperto = chiaveMese(new Date());
  disegna();
};

window.chiudiStatistiche = () => {
  const schermata = document.getElementById('statScreen');
  if (!schermata) return;
  schermata.classList.remove('show');
  // Il menu resta aperto dietro: togliamo il blocco dello scorrimento
  // solo se anche quello è stato chiuso.
  const menu = document.getElementById('menuScreen');
  if (!menu || !menu.classList.contains('show')) document.body.classList.remove('menu-open');
};

// Frecce ‹ › — si può tornare indietro finché c'è archivio, e mai oltre
// il mese corrente in avanti.
window.statCambiaMese = (quanti) => {
  const nuovo = meseSpostato(meseAperto, quanti);
  if (quanti > 0 && nuovo > chiaveMese(new Date())) return;
  meseAperto = nuovo;
  disegna();
};
