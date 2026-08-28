// ════════════════════════════════════════════════════════════════
// icone.js — Le icone disegnate dell'app (NUOVO SETTEMBRE 2026)
// ════════════════════════════════════════════════════════════════
// Prima i pulsanti usavano le emoji (🗑 📋 🔗 💾 📂 🏠 👤 🛒). Il problema
// delle emoji è che NON le disegniamo noi: il cestino di un Samsung è
// diverso da quello di un iPhone, cambiano di misura e di altezza sulla
// riga, e soprattutto NON possono prendere il colore del pulsante — su
// un pulsante verde restava una macchia multicolore che non c'entrava
// niente. È lo stesso ragionamento già fatto per il pulsante ☰, dove le
// tre linee sono disegnate a mano invece che con un carattere speciale.
//
// COME FUNZIONA
// I disegni veri stanno UNA VOLTA SOLA dentro index.html, nel blocco
// <svg id="sprite-icone"> in cima al <body>, ognuno dentro un <symbol>
// con il suo id (i-cestino, i-casa, ...). Qui dentro costruiamo solo dei
// richiami a quei disegni: <svg class="ico"><use href="#i-cestino"></use></svg>.
// Il disegno pesa una volta sola anche se la stessa icona compare in
// cinquanta righe.
//
// IL COLORE non si imposta mai qui: le icone sono disegnate con
// stroke="currentColor", cioè prendono DA SOLE il colore del testo del
// pulsante che le contiene. Per questo l'icona della linguetta "Casa"
// diventa rossa quando la linguetta è attiva, senza una riga in più.
//
// Modulo "foglia": non importa nessun altro file locale.

// Elenco dei nomi disponibili, che devono esistere come <symbol> in
// index.html. Serve solo a dare un errore chiaro in console se qualcuno
// scrive un nome sbagliato, invece di lasciare un buco invisibile.
export const NOMI_ICONE = [
  'casa', 'persona', 'carrello', 'cestino', 'copia', 'link', 'scarica',
  'cartella', 'foto', 'euro', 'statistiche', 'busta', 'chiudi', 'spunta',
  'freccia', 'nuvola', 'piu'
];

// Costruisce l'icona come elemento vero (per il codice che lavora col DOM).
// classe: eventuali classi in più, es. ico('cestino', 'ico-grande').
export function ico(nome, classe = '') {
  if (!NOMI_ICONE.includes(nome)) console.warn('[icone] nome sconosciuto:', nome);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ico' + (classe ? ' ' + classe : ''));
  svg.setAttribute('aria-hidden', 'true');   // decorativa: i lettori di schermo la saltano
  svg.setAttribute('focusable', 'false');    // niente tabulazione dentro l'icona su Edge
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-' + nome);
  svg.appendChild(use);
  return svg;
}

// Stessa cosa ma come testo, per i punti dove si costruisce l'HTML con
// una stringa (innerHTML) invece che elemento per elemento.
export function icoHTML(nome, classe = '') {
  if (!NOMI_ICONE.includes(nome)) console.warn('[icone] nome sconosciuto:', nome);
  return `<svg class="ico${classe ? ' ' + classe : ''}" aria-hidden="true" focusable="false"><use href="#i-${nome}"></use></svg>`;
}

// ── PALLINI DI PRIORITÀ ────────────────────────────
// ⚪ 🟠 🔴 non erano icone: erano STATI. Per uno stato non serve un
// disegno, basta un cerchio colorato fatto in CSS — più semplice, e con
// il colore esatto dell'app invece di quello deciso dal telefono.
// livello: 'normale' | 'importante' | 'urgente'
export function pallino(livello) {
  const s = document.createElement('span');
  s.className = 'pallino pallino-' + livello;
  s.setAttribute('aria-hidden', 'true');
  return s;
}

export function pallinoHTML(livello) {
  return `<span class="pallino pallino-${livello}" aria-hidden="true"></span>`;
}
