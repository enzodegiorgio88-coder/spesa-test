// ════════════════════════════════════════════════════════════════
// list.js — Rendering liste, modifica articoli, statistiche
// ════════════════════════════════════════════════════════════════

import { NOVITA_RELEASE, statisticheAttive } from './config.js';
import { state, ensureRows, emptyRow } from './state.js';
// showToast: gli avvisi brevi in fondo allo schermo (gli stessi che usa
// "Copia la lista per WhatsApp" quando la lista è vuota).
// aNumero/euro: l'unico modo di leggere e di scrivere un importo in tutta
// l'app — vedi il fondo di utils.js.
import { showToast, aNumero, euro } from './utils.js';
import { haBlasfemia, haAlimentoVietato } from './content-filter.js';
import { mostraBlocco, customConfirm } from './modals.js';
import { saveToFirebase } from './sync.js';
import { buildPhotoMini, buildPhotoBtn } from './photo.js';
import { inviaNotificaUrgente } from './notifications.js';
import { updateTotale } from './totals.js';
// NUOVO LUGLIO 2026: memoria dei prezzi. prezzi.js non importa list.js
// (niente dipendenze circolari): riceve da qui, al momento della chiamata,
// la funzione da eseguire quando premi "Aggiungi" sulla tesserina.
import { ricordaPrezzo, proponiPrezzoSeConosciuto } from './prezzi.js';
// NUOVO SETTEMBRE 2026: archivio della spesa fatta. Stessa regola di
// prezzi.js — archivio.js non importa list.js, quindi nessun ciclo.
import { archiviaSpesa } from './archivio.js';
// NUOVO SETTEMBRE 2026: icone disegnate al posto delle emoji nei pulsanti.
import { ico, pallino, pallinoHTML } from './icone.js';

// ── COSTRUZIONE RIGHE ──────────────────────────────

// Riconosce un URL nel testo di un articolo (https://... oppure www...).
// Il testo resta modificabile nel campo di input: accanto compare
// un'icona 🔗 che apre direttamente il sito in una nuova scheda.
function estraiUrl(testo) {
  const m = (testo || '').match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
  if (!m) return null;
  return /^https?:\/\//i.test(m[0]) ? m[0] : 'https://' + m[0];
}

// ── TASTIERA APERTA: barra in basso nascosta ───────
// Logica unica per il campo ARTICOLO e il campo PREZZO: mentre si scrive,
// la barra dei pulsanti in basso sparisce per lasciare spazio alla tastiera
// dello smartphone (vedi body.editing-field in style.css). Il piccolo
// ritardo sul blur evita che la barra "lampeggi" quando si passa da un
// campo all'altro (es. Invio → riga successiva).
let _editTimer = null;
function aggiornaBarraInBasso() {
  const el = document.activeElement;
  const editing = !!el && !!el.classList &&
    (el.classList.contains('item-input') || el.classList.contains('price-input'));
  document.body.classList.toggle('editing-field', editing);
}
function onFieldFocus() { clearTimeout(_editTimer); aggiornaBarraInBasso(); }
function onFieldBlur()  { clearTimeout(_editTimer); _editTimer = setTimeout(aggiornaBarraInBasso, 120); }

// ── RIGHE APERTE ───────────────────────────────────
// NUOVO SETTEMBRE 2026. Prima ogni articolo mostrava tutto insieme e
// occupava 145px: se ne vedevano tre per schermata. Ora la riga chiusa è
// una riga sola e quantità, priorità, prezzo, foto ed elimina compaiono
// toccandola.
// Quali righe siano aperte lo teniamo QUI e non dentro l'articolo,
// perché l'articolo va su Firebase: se ci finisse dentro, aprire una
// riga la aprirebbe anche sul telefono di tutti gli altri. Ogni riga
// esiste due volte (vista per categoria e vista Tutto): le teniamo
// allineate, così cambiando vista non si richiude da sola.
const righeAperte = new Set();
const chiaveRiga  = (col, i) => col + ':' + i;

function toggleRiga(col, i) {
  const k = chiaveRiga(col, i);
  const aperta = !righeAperte.has(k);
  if (aperta) righeAperte.add(k); else righeAperte.delete(k);
  document.querySelectorAll(`#list-${col} [data-idx="${i}"], #all-${col} [data-idx="${i}"]`)
    .forEach(el => el.classList.toggle('aperta', aperta));
}

// Dopo un'eliminazione gli articoli scalano di posto: la riga 3 diventa
// la 2. Le posizioni memorizzate non valgono più e aprirebbero la riga
// sbagliata, quindi per quella categoria si riparte da tutte chiuse.
// Apre la riga senza mai chiuderla, al contrario di toggleRiga. La usa
// il campo del nome appena si scrive la prima lettera: chi sta
// aggiungendo un articolo nuovo vuole quasi sempre metterci anche il
// prezzo o la foto, e con la riga chiusa avrebbe dovuto aprirla a mano
// ogni volta. Se la riga è già aperta non fa niente, così continuando
// a digitare non si richiude da sola a metà parola.
function apriRiga(col, i) {
  const k = chiaveRiga(col, i);
  if (righeAperte.has(k)) return;
  righeAperte.add(k);
  document.querySelectorAll(`#list-${col} [data-idx="${i}"], #all-${col} [data-idx="${i}"]`)
    .forEach(el => el.classList.add('aperta'));
}

function scordaRigheAperte(col) {
  [...righeAperte].forEach(k => { if (k.startsWith(col + ':')) righeAperte.delete(k); });
}

function pushAction(col, i, label) {
  if (!state.data[col][i].actions) state.data[col][i].actions = [];
  const acts = state.data[col][i].actions;
  if (!acts.length || acts[acts.length - 1] !== label) acts.push(label);
  state.data[col][i].lastAction = acts.join(' · ');
}

function updateAuthorDiv(li, text) {
  if (!li) return;
  let el = li.querySelector('.item-author');
  if (!el && text) { el = document.createElement('div'); el.className = 'item-author'; li.appendChild(el); }
  if (el) el.textContent = text || '';
}

function onCheckToggle(col, i) {
  state.data[col][i].done = !state.data[col][i].done;
  pushAction(col, i, (state.data[col][i].done ? 'spuntato' : 'despuntato') + ' da ' + state.currentUserName);
  saveToFirebase();
  renderRow(col, i);
  updateStats();
}

function onDeleteRow(col, i) {
  state.data[col].splice(i, 1);
  scordaRigheAperte(col);
  ensureRows(col);
  saveToFirebase();
  renderCol(col, `list-${col}`);
  renderCol(col, `all-${col}`);
  updateStats();
}

// Il cestino della singola riga è passato DENTRO la riga aperta: prima
// stava sempre in vista accanto al nome ed era facilissimo sfiorarlo.
// Ora per cancellare un articolo servono due tocchi voluti.
function buildDelBtn(col, i) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'del-btn';
  btn.append(ico('cestino'), document.createTextNode('Elimina'));
  btn.onclick = (ev) => { ev.stopPropagation(); onDeleteRow(col, i); };
  return btn;
}
// NUOVO LUGLIO 2026: cosa succede quando premi "Aggiungi" sulla tesserina
// della memoria prezzi — il prezzo ricordato finisce nel campo € della
// riga, esattamente come se l'avessi scritto a mano.
function applicaPrezzoRicordato(col, i, prezzo) {
  if (!state.data[col] || !state.data[col][i]) return;
  state.data[col][i].price = prezzo;
  saveToFirebase(); renderRow(col, i); updateStats();
}

// ── IMPORTI SEMPRE D'ACCORDO CON L'ARTICOLO ────────
// CORREZIONE SETTEMBRE 2026 — il bug del prezzo che non si vedeva.
//
// Prezzo e quantità compaiono in tre posti della stessa riga: la
// targhetta del prezzo e quella della quantità (che si vedono a riga
// chiusa) e la scritta "= € ..." accanto al campo € (dentro la tendina).
// Tutti e tre venivano costruiti SOLO da makeRow, cioè solo quando la
// riga veniva ridisegnata da capo. Scrivere nel campo € non ridisegnava
// niente: aggiornava lo stato, salvava su Firebase e basta. Il prezzo
// quindi compariva più tardi e apparentemente a caso — cioè al primo
// ×2, alla prima foto o alla prima spunta, che sono le azioni che
// chiamano renderRow(). E al contrario, cancellando il prezzo, la
// vecchia targhetta restava a schermo con il totale di prima.
//
// Qui rimettiamo d'accordo quei tre pezzi con lo stato dell'articolo
// SENZA ridisegnare la riga: ridisegnarla cancellerebbe il campo € che
// si ha ancora sotto le dita. Quello che si vede dipende sempre e solo
// da state.data[col][i], mai da quello che era stato scritto prima.
function sincronizzaImporti(li, item) {
  const inner = li.querySelector('.item-inner');
  if (!inner) return;
  const tog = inner.querySelector('.riga-toggle');
  const p   = aNumero(item.price);
  const qty = item.qty || 1;

  // Targhetta della quantità: solo da ×2 in su.
  let qb = inner.querySelector('.riga-qty');
  if (qty > 1) {
    if (!qb) {
      qb = document.createElement('span'); qb.className = 'riga-qty';
      // Va prima della targhetta del prezzo, come la mette makeRow.
      inner.insertBefore(qb, inner.querySelector('.riga-prezzo') || tog);
    }
    qb.textContent = '×' + qty;
  } else if (qb) qb.remove();

  // Targhetta del prezzo: prezzo × quantità. Se il prezzo viene
  // cancellato la targhetta sparisce, non resta il totale di prima.
  let pb = inner.querySelector('.riga-prezzo');
  if (p > 0) {
    if (!pb) {
      pb = document.createElement('span'); pb.className = 'riga-prezzo';
      inner.insertBefore(pb, tog);
    }
    pb.textContent = euro(p * qty);
  } else if (pb) pb.remove();

  // Dentro la tendina: la scritta "= € ..." accanto al campo €.
  const wrap = li.querySelector('.price-wrap');
  if (wrap) {
    let line = wrap.querySelector('.price-line');
    if (p > 0 && qty > 1) {
      if (!line) { line = document.createElement('span'); line.className = 'price-line'; wrap.appendChild(line); }
      line.textContent = '= ' + euro(p * qty);
    } else if (line) line.remove();
  }

  // Ogni riga esiste due volte (vista per categoria e vista Tutto): la
  // copia in cui non si sta scrivendo va allineata, altrimenti cambiando
  // vista si ritroverebbe il valore di prima. Il campo che si ha sotto
  // le dita non si tocca mai.
  const inp = li.querySelector('.price-input');
  if (inp && inp !== document.activeElement && inp.value !== (item.price || ''))
    inp.value = item.price || '';
  li.querySelectorAll('.qty-val').forEach(v => { v.textContent = 'x' + qty; });
}

function aggiornaImportiRiga(col, i) {
  const item = state.data[col] && state.data[col][i];
  if (!item) return;
  document.querySelectorAll(`#list-${col} [data-idx="${i}"], #all-${col} [data-idx="${i}"]`)
    .forEach(li => sincronizzaImporti(li, item));
}

function buildTextInput(col, i, item, onTextChange) {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = `item-input${item.done ? ' done' : ''}`;
  inp.value = item.text;
  inp.placeholder = `Articolo ${i + 1}...`;

  let typingLogged = false;
  inp.oninput = () => {
    if (haBlasfemia(inp.value)) {
      inp.value = state.data[col][i].text = ''; if (onTextChange) onTextChange('');
      mostraBlocco('blasfemia'); saveToFirebase(); return;
    }
    if (haAlimentoVietato(inp.value)) {
      inp.value = state.data[col][i].text = ''; if (onTextChange) onTextChange('');
      mostraBlocco('alimento'); saveToFirebase(); return;
    }
    state.data[col][i].text = inp.value;
    if (onTextChange) onTextChange(inp.value);
    // Appena si scrive, la riga si apre da sola con prezzo, foto ed
    // elimina già pronti. Vale in tutte e tre le categorie e anche
    // nella vista "Tutto", perché apriRiga apre tutte e due le copie
    // della riga. Non tocca il campo in cui si sta scrivendo: aggiunge
    // solo una classe, non ri-disegna niente, quindi non si perde il
    // punto in cui si è arrivati a digitare.
    apriRiga(col, i);
    if (!typingLogged) {
      typingLogged = true;
      if (!state.data[col][i].actions) state.data[col][i].actions = [];
      const isNew = !state.data[col][i].author;
      const label = (isNew ? 'aggiunto' : 'modificato') + ' da ' + state.currentUserName;
      if (isNew) state.data[col][i].author = state.currentUserName;
      const acts = state.data[col][i].actions;
      if (!acts.length || acts[acts.length - 1] !== label) acts.push(label);
      state.data[col][i].lastAction = acts.join(' · ');
    }
 updateAuthorDiv(inp.closest('li'), state.data[col][i].lastAction);
    saveToFirebase(); updateStats();
    // NUOVO LUGLIO 2026: se questo articolo è già stato pagato in passato,
    // dopo una breve pausa di digitazione compare la tesserina con il
    // prezzo ricordato. Tutti i controlli (prezzo già presente, proposta
    // già scartata, articolo sconosciuto) stanno dentro prezzi.js.
    proponiPrezzoSeConosciuto(col, i, (p) => applicaPrezzoRicordato(col, i, p));
  };
  inp.onkeydown = (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const rows = [...document.querySelectorAll(`#list-${col} .item-input`)];
    const idx  = rows.indexOf(inp);
    if (idx < rows.length - 1) rows[idx + 1].focus(); else window.addRow(col);
  };
  // Come per il prezzo: mentre si scrive il nome dell'articolo la barra
  // in basso si nasconde per lasciare spazio alla tastiera.
  inp.onfocus = onFieldFocus;
  inp.onblur  = onFieldBlur;
  return inp;
}

function buildQtyWrap(col, i, item) {
  const wrap = document.createElement('div'); wrap.className = 'qty-wrap';
  const val  = document.createElement('span'); val.className = 'qty-val'; val.textContent = 'x' + item.qty;

  // Aggiorna il numero e gli importi a schermo, senza ridisegnare la
  // riga: così il pulsante resta "vivo" durante la pressione continua.
  const cambia = (delta) => {
    const cur  = state.data[col][i].qty || 1;
    const next = Math.max(1, cur + delta);
    if (next === cur) return;
    state.data[col][i].qty = next;
    // Numero, targhette e "= € ..." vengono tutti da qui: prima il
    // totale della riga si aggiornava solo al rilascio del pulsante.
    aggiornaImportiRiga(col, i);
  };
  // Salvataggio e ridisegno UNA volta sola, al rilascio o al singolo tap.
  const conferma = () => {
    pushAction(col, i, 'modificato da ' + state.currentUserName);
    saveToFirebase(); renderRow(col, i); updateStats();
  };

  const creaBtn = (testo, delta) => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'qty-btn'; btn.textContent = testo;
    let timer = null, ripeti = null, tenuto = false;
    const stop = () => {
      const eraPressioneLunga = ripeti !== null;
      clearTimeout(timer); clearInterval(ripeti); timer = ripeti = null;
      if (eraPressioneLunga) conferma();
    };
    btn.addEventListener('pointerdown', () => {
      tenuto = false;
      timer = setTimeout(() => {
        tenuto = true; cambia(delta);
        ripeti = setInterval(() => cambia(delta), 130);
      }, 400);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
    btn.addEventListener('click', () => {
      if (tenuto) { tenuto = false; return; }   // click generato dal rilascio della pressione lunga
      clearTimeout(timer); timer = null;
      cambia(delta); conferma();
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault()); // niente menu su tocco prolungato
    return btn;
  };

  wrap.append(creaBtn('−', -1), val, creaBtn('+', +1));
  return wrap;
}

// NUOVO: menu priorità personalizzato, IDENTICO su telefono e computer.
// La <select> nativa sugli smartphone apriva la finestra di sistema
// (grande e diversa dal resto dell'app): ora il menu è disegnato da noi,
// nello stile dell'app, con le tre scelte e una piccola didascalia d'uso
// per ciascuna. Sul computer la didascalia compare SOLO passandoci sopra
// col mouse; sul telefono, dove il mouse non c'è, resta sempre visibile
// dentro il menu (vedi le regole .prio-desc in style.css).
// I pallini ⚪ 🟠 🔴 erano emoji dentro il testo: ogni telefono li
// disegnava a modo suo e non erano nemmeno i colori dell'app. Ora il
// pallino è un cerchio in CSS (vedi pallino() in icone.js) e il testo
// resta testo.
const PRIORITA = [
  { val: 'normale',    txt: 'Normale',    desc: 'Senza fretta: si prende al solito giro di spesa.' },
  { val: 'importante', txt: 'Importante', desc: 'Da non dimenticare: mettilo nel carrello alla prossima spesa.' },
  { val: 'urgente',    txt: 'Urgente',    desc: 'Serve subito: avvisa tutta la famiglia.' }
];

// Un solo menu aperto alla volta: un tocco fuori li chiude tutti.
document.addEventListener('click', (e) => {
  if (!e.target.closest('.prio-wrap'))
    document.querySelectorAll('.prio-menu.show').forEach(m => m.classList.remove('show'));
});
// Scorrendo la pagina il menu si chiude: essendo ancorato allo schermo
// (position:fixed) non può "seguire" la propria riga durante lo scroll.
window.addEventListener('scroll', () => {
  document.querySelectorAll('.prio-menu.show').forEach(m => m.classList.remove('show'));
}, { passive: true });

// CORREZIONE: posizionamento del menu in due modi diversi.
// Sul TELEFONO resta centrato in orizzontale sullo schermo (così non
// viene mai tagliato ai bordi); sul COMPUTER invece si apre attaccato
// al suo pulsante, come una tendina classica, senza mai uscire dallo
// schermo. In verticale sempre sotto il pulsante, o sopra se in basso
// non c'è spazio. Usata sia dal menu priorità sia dai menu Urgenti/
// Importanti (urgent.js la importa da qui).
export function posizionaMenuPrio(btn, menu) {
  const r = btn.getBoundingClientRect();
  // CORREZIONE LUGLIO 2026: prima ci fidavamo SOLO del fatto che il browser
  // dichiarasse "ho il mouse". Alcuni computer (e i portatili con schermo
  // touch) non lo dichiarano, e lì il menu restava piantato in mezzo allo
  // schermo. Ora basta ANCHE che la finestra sia larga almeno 1000px per
  // trattarlo da computer: i telefoni non ci arrivano mai, nemmeno girati
  // in orizzontale, quindi da cellulare non cambia assolutamente nulla.
  const daComputer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
                  || window.innerWidth >= 1000;
  if (daComputer) {
    menu.style.transform = 'none';
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
  } else {
    menu.style.left = '50%';
    menu.style.transform = 'translateX(-50%)';
  }
  let top = r.bottom + 6;
  if (top + menu.offsetHeight > window.innerHeight - 8)
    top = Math.max(8, r.top - menu.offsetHeight - 6);
  menu.style.top = top + 'px';
}

function buildPriorityMenu(col, i, item) {
  const wrap = document.createElement('div'); wrap.className = 'prio-wrap';
  const cur  = item.urgent ? 'urgente' : (item.important ? 'importante' : 'normale');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'priority-select'
    + (cur === 'urgente' ? ' urgente' : cur === 'importante' ? ' importante' : '');
  btn.append(pallino(cur), document.createTextNode(PRIORITA.find(s => s.val === cur).txt + ' ▾'));

  const menu = document.createElement('div'); menu.className = 'prio-menu';
  PRIORITA.forEach(s => {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'prio-option' + (s.val === cur ? ' attiva' : '');
    const nome = document.createElement('span'); nome.className = 'prio-name';
    nome.append(pallino(s.val), document.createTextNode(s.txt));
    const desc = document.createElement('span'); desc.className = 'prio-desc'; desc.textContent = s.desc;
    opt.append(nome, desc);
    opt.onclick = (ev) => {
      ev.stopPropagation();
      state.data[col][i].urgent    = s.val === 'urgente';
      state.data[col][i].important = s.val === 'importante';
      const label = s.val === 'urgente' ? 'urgente' : s.val === 'importante' ? 'importante' : 'tornato normale';
      pushAction(col, i, label + ' da ' + state.currentUserName);
      if (s.val === 'urgente' && state.data[col][i].text.trim())
        inviaNotificaUrgente(state.data[col][i].text, state.currentUserName);
      saveToFirebase(); renderRow(col, i); updateStats();
    };
    menu.appendChild(opt);
  });

  btn.onclick = (ev) => {
    ev.stopPropagation();
    const eraAperto = menu.classList.contains('show');
    document.querySelectorAll('.prio-menu.show').forEach(m => m.classList.remove('show'));
    if (eraAperto) return;
    menu.classList.add('show');
    posizionaMenuPrio(btn, menu);
  };

  wrap.append(btn, menu);
  return wrap;
}

function buildPriceWrap(col, i, item) {
  const wrap = document.createElement('div'); wrap.className = 'price-wrap';
  const icon = document.createElement('span'); icon.className = 'price-icon'; icon.textContent = '€';
  const inp  = document.createElement('input');
  // type="text" + inputmode="decimal": tastiera numerica sugli smartphone,
  // e la validazione qui sotto scarta lettere e simboli non validi
  // (type="number" lasciava passare caratteri come "e", "+", "-").
  inp.type = 'text'; inp.inputMode = 'decimal'; inp.autocomplete = 'off';
  inp.className = 'price-input'; inp.placeholder = '0.00';
  inp.value = item.price || '';
  inp.oninput = () => {
    // Solo numeri: la virgola diventa punto, tutto il resto viene scartato,
    // ed è ammesso un solo separatore decimale.
    let v = inp.value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const parti = v.split('.');
    if (parti.length > 2) v = parti[0] + '.' + parti.slice(1).join('');
    if (v !== inp.value) inp.value = v;
    state.data[col][i].price = v;
    // Il prezzo si vede SUBITO nella riga, senza dover toccare la
    // quantità o aggiungere una foto — e cancellandolo sparisce subito
    // anche la targhetta, invece di restare con il totale di prima.
    aggiornaImportiRiga(col, i);
    saveToFirebase(); updateStats();
    // NUOVO LUGLIO 2026: quello che scrivi qui entra nella memoria dei
    // prezzi di famiglia, così la prossima volta che qualcuno scrive
    // questo stesso articolo l'app propone da sola il prezzo.
    ricordaPrezzo(state.data[col][i].text, v, state.currentUserName);
  };
  // Mentre si scrive il prezzo la tastiera occupa mezzo schermo: nascondiamo
  // la barra dei pulsanti in basso (stessa logica del campo articolo).
  inp.onfocus = onFieldFocus;
  inp.onblur  = onFieldBlur;
  wrap.append(icon, inp);
  if (aNumero(item.price) > 0 && item.qty > 1) {
    const line = document.createElement('span'); line.className = 'price-line';
    // Prima qui il totale restava all'inglese ("= €7.50"): unico punto
    // dell'app con il punto al posto della virgola.
    line.textContent = '= ' + euro(aNumero(item.price) * item.qty);
    wrap.appendChild(line);
  }
  return wrap;
}

// ── QUELLO CHE RESTA IN VISTA A RIGA CHIUSA ────────
// Chiudendo la riga il prezzo e la quantità sparirebbero, e sono proprio
// le due cose che si vogliono vedere a colpo d'occhio mentre si è al
// supermercato. Quindi restano nella riga come due targhette piccole, e
// spariscono solo quando la riga si apre (lì sotto ci sono già il campo
// € e il −x1+, sarebbe scritto due volte).
function buildPrezzoBadge(item) {
  const p = aNumero(item.price);
  if (!(p > 0)) return null;
  const s = document.createElement('span'); s.className = 'riga-prezzo';
  s.textContent = euro(p * (item.qty || 1));
  return s;
}

function buildQtyBadge(item) {
  if (!item.qty || item.qty <= 1) return null;
  const s = document.createElement('span'); s.className = 'riga-qty';
  s.textContent = '×' + item.qty;
  return s;
}

function buildRowHeader(col, i, item, apriChiudi) {
  const inner = document.createElement('div'); inner.className = 'item-inner';
  const chk   = document.createElement('button');
  chk.className = `chk${item.done ? ` done-${col}` : ''}`;
  // La spunta è disegnata e non è più il carattere ✓: stessa ragione
  // delle tre linee del menu ☰, così è identica su tutti i telefoni.
  if (item.done) chk.appendChild(ico('spunta'));
  chk.onclick = () => onCheckToggle(col, i);

  // Icona 🔗 visibile solo se il testo contiene un URL: aprendola si va
  // direttamente al sito, mentre il testo resta modificabile nell'input.
  const link = document.createElement('a');
  link.className = 'link-btn'; link.appendChild(ico('link'));
  link.setAttribute('aria-label', 'Apri il sito di questo articolo');
  link.target = '_blank'; link.rel = 'noopener noreferrer';
  const aggiornaLink = (testo) => {
    const url = estraiUrl(testo);
    if (url) { link.href = url; link.style.display = ''; }
    else     { link.removeAttribute('href'); link.style.display = 'none'; }
  };
  aggiornaLink(item.text);

  // La freccetta che apre e chiude. Gira di 90° quando la riga è aperta
  // (è solo CSS: .item-row.aperta .riga-toggle .ico).
  const tog = document.createElement('button');
  tog.type = 'button'; tog.className = 'riga-toggle';
  tog.setAttribute('aria-label', 'Mostra o nascondi le opzioni di questo articolo');
  tog.appendChild(ico('freccia'));
  tog.onclick = (ev) => { ev.stopPropagation(); apriChiudi(); };

  inner.appendChild(chk);
  // La miniatura c'è solo se la foto c'è davvero: niente più riquadro
  // tratteggiato vuoto su ogni riga.
  const mini = buildPhotoMini(col, i, item);
  if (mini) inner.appendChild(mini);
  inner.appendChild(buildTextInput(col, i, item, aggiornaLink));
  inner.appendChild(link);
  const qb = buildQtyBadge(item);    if (qb) inner.appendChild(qb);
  const pb = buildPrezzoBadge(item); if (pb) inner.appendChild(pb);
  inner.appendChild(tog);

  // Si apre e si chiude toccando un punto qualsiasi della riga: lo spazio
  // vuoto, la targhetta del prezzo, quella della quantità, la freccetta.
  //
  // NUOVO SETTEMBRE 2026: anche il NOME dell'articolo apre la tendina.
  // Prima il campo del nome era escluso come tutti gli altri campi, ma
  // occupa quasi tutta la larghezza della riga (.item-input ha flex:1):
  // si mangiava quasi tutti i tocchi "sulla riga", e in pratica per
  // aprire una riga bisognava mirare la freccetta. Sul nome però la riga
  // si APRE soltanto, non si chiude: il campo deve restare scrivibile, e
  // una riga che si richiude sotto le dita a metà parola sarebbe solo un
  // fastidio. Per chiuderla ci sono la freccetta e il resto della riga.
  //
  // Restano fuori i comandi che hanno già un compito loro — il quadratino
  // della spunta, il link 🔗, la miniatura della foto — che continuano a
  // funzionare esattamente come prima.
  inner.addEventListener('click', (ev) => {
    if (ev.target.closest('button, a, label, .photo-mini')) return;
    if (ev.target.closest('.item-input')) { apriRiga(col, i); return; }
    apriChiudi();
  });
  return inner;
}

// Tutto quello che compare toccando la riga. Dentro ci sono anche il
// pulsante della foto e quello per eliminare, che prima stavano sempre
// in vista.
function buildRowExtra(col, i, item) {
  const extra = document.createElement('div'); extra.className = 'item-extra';
  extra.append(buildQtyWrap(col, i, item), buildPriorityMenu(col, i, item));
  if (new Date() >= NOVITA_RELEASE) extra.appendChild(buildPriceWrap(col, i, item));
  extra.append(buildPhotoBtn(col, i, item), buildDelBtn(col, i));
  return extra;
}

function makeRow(col, i, item) {
  const li = document.createElement('li');
  // Alla riga vengono attaccate anche due classi nuove: "done-riga"
  // (per sbiadire la targhetta del prezzo su un articolo già preso) e
  // "aperta", che ricompare da sola se questa riga era aperta prima di
  // un ri-disegno — per esempio quando arriva una modifica di un altro
  // membro della famiglia mentre la si sta usando.
  li.className = `item-row${item.urgent && !item.done ? ' urgent'
                          : item.important && !item.done ? ' important' : ''}`
    + (item.done ? ' done-riga' : '')
    + (righeAperte.has(chiaveRiga(col, i)) ? ' aperta' : '');
  li.dataset.col = col;
  li.dataset.idx = i;
  li.append(buildRowHeader(col, i, item, () => toggleRiga(col, i)), buildRowExtra(col, i, item));
  if (item.lastAction) {
    const auth = document.createElement('div'); auth.className = 'item-author';
    auth.textContent = item.lastAction; li.appendChild(auth);
  }
  return li;
}

// ── RENDERING ──────────────────────────────────────

function renderCol(col, listId) {
  const ul = document.getElementById(listId);
  if (!ul) return;
  const frag       = document.createDocumentFragment();
  const isAllView  = listId.startsWith('all-');
  let emptyCount   = 0;

  state.data[col].forEach((item, i) => {
    if (isAllView && !item.text.trim() && !item.photo) return;
    if (!isAllView) {
      emptyCount = (item.text || item.photo) ? 0 : emptyCount + 1;
      if (emptyCount > 5) return;
    }
    frag.appendChild(makeRow(col, i, item));
  });

  ul.replaceChildren(frag);
}

export function renderRow(col, i) {
  const item = state.data[col][i];
  const tabEl = document.querySelector(`#list-${col} [data-idx="${i}"]`);
  if (tabEl) tabEl.replaceWith(makeRow(col, i, item));
  const allEl = document.querySelector(`#all-${col} [data-idx="${i}"]`);
  if (allEl) {
    if (item.text.trim() || item.photo) allEl.replaceWith(makeRow(col, i, item));
    else allEl.remove();
  }
}

export function renderAll() {
  for (let c = 0; c < 3; c++) {
    renderCol(c, `list-${c}`);
    renderCol(c, `all-${c}`);
  }
  updateStats();
  // Se un aggiornamento arrivato da un altro utente ha ridisegnato la lista
  // mentre si stava scrivendo, il campo attivo non esiste più: senza questo
  // controllo la barra in basso resterebbe nascosta per sempre.
  aggiornaBarraInBasso();
}

function updateStats() {
  const all  = state.data.flat().filter(r => r.text.trim() || r.photo);
  const done = all.filter(r => r.done);
  const urg  = all.filter(r => r.urgent && !r.done);
  const pct  = all.length ? Math.round(done.length / all.length * 100) : 0;

  document.getElementById('progFill').style.width        = pct + '%';
  document.getElementById('doneCount').textContent       = done.length;
  document.getElementById('urgCount').textContent        = urg.length;
  document.getElementById('totCount').textContent        = all.length;
  for (let c = 0; c < 3; c++)
    document.getElementById('b' + c).textContent = state.data[c].filter(r => r.text.trim() || r.photo).length;

  updateTotale();

  // NUOVO: il pulsante in alto è diventato una tendina ("Urgenti 2 ▾"):
  // compare se c'è almeno un urgente O un importante, mostra il numero
  // che cambia da solo, e i contatori dentro il menu restano aggiornati.
  // Con soli importanti diventa arancione e mostra il loro conteggio.
  const imp     = all.filter(r => r.important && !r.done);
  const urgWrap = document.getElementById('urgBtnWrap');
  const urgBtn  = document.getElementById('btnUrgenti');
  if (urg.length || imp.length) {
    const rosso = urg.length > 0;
    urgWrap.style.display = 'inline-block';
    urgBtn.classList.toggle('importanti', !rosso);
    urgBtn.innerHTML = pallinoHTML(rosso ? 'urgente' : 'importante')
      + (rosso ? ' Urgenti ' : ' Importanti ')
      + `<span class="urg-count" id="urgBtnCount">${rosso ? urg.length : imp.length}</span> ▾`;
    const mUrg = document.getElementById('menuCountUrg');
    const mImp = document.getElementById('menuCountImp');
    if (mUrg) mUrg.textContent = urg.length;
    if (mImp) mImp.textContent = imp.length;
  } else {
    urgWrap.style.display = 'none';
    const menu = document.getElementById('urgBtnMenu');
    if (menu) menu.classList.remove('show');
  }
}

// ── UI ─────────────────────────────────────────────

window.showTab = (i) => {
  state.currentTab = i;
  document.querySelectorAll('.tab').forEach((t, ti) => t.classList.toggle('active', ti === i));
  document.querySelectorAll('.panel').forEach((p, pi) => p.classList.toggle('active', pi === i));
};

window.setView = (v) => {
  state.currentView = v;
  const isTab  = v === 'tab';
  document.getElementById('tabsBar').style.display = isTab ? 'flex' : 'none';
  document.querySelectorAll('.panel').forEach(p => p.style.display = isTab ? '' : 'none');
  document.getElementById('allView').style.display = isTab ? 'none' : 'block';
  document.getElementById('btnTab').classList.toggle('active', isTab);
  document.getElementById('btnAll').classList.toggle('active', !isTab);
  if (isTab) window.showTab(state.currentTab);
};

// CORREZIONE SETTEMBRE 2026 — "＋ Aggiungi voce" che non aggiungeva niente.
//
// Ogni categoria tiene sempre in fondo un certo numero di righe già
// pronte ma vuote (MIN_ROWS in config.js, oggi 15), e renderCol ne mostra
// al massimo cinque di fila: senza quel limite ci si ritrovava davanti a
// un muro di righe vuote. Qui però veniva aggiunta una riga vuota IN
// FONDO A QUELLE: la numero sedici, cioè ben oltre le cinque mostrate.
// Il risultato è che a schermo non succedeva assolutamente niente — e
// intanto ogni tocco allungava di una riga vuota la lista salvata su
// Firebase.
//
// Adesso la voce nuova è la prima riga libera SUBITO DOPO l'ultimo
// articolo scritto — cioè esattamente dove finirebbe una riga nuova — e
// una riga in più si aggiunge solo quando sono tutte occupate. Quella
// riga lì è sempre disegnata, perché è la prima delle cinque vuote che
// renderCol mostra. Da fuori si vede quello che ci si aspetta: un
// articolo vuoto pronto da scrivere, con la sua tendina già aperta.
window.addRow = (col) => {
  let ultimoPieno = -1;
  state.data[col].forEach((r, k) => { if (r.text.trim() || r.photo) ultimoPieno = k; });
  const i = ultimoPieno + 1;
  // La voce nuova parte sempre pulita: in quel posto poteva esserci una
  // riga svuotata a mano, senza più nome ma con dentro ancora il prezzo
  // o la quantità di prima, che non c'entrano niente con l'articolo che
  // si sta per scrivere.
  state.data[col][i] = emptyRow();
  const r = state.data[col][i];
  r.author     = state.currentUserName;
  r.actions    = ['aggiunto da ' + state.currentUserName];
  r.lastAction = r.actions[0];
  // La riga nasce già aperta, come quando si comincia a scrivere in una
  // riga qualsiasi: prezzo, quantità, foto ed elimina sono subito lì.
  // Va segnata PRIMA di ridisegnare, così makeRow la costruisce aperta.
  apriRiga(col, i);
  saveToFirebase();
  renderCol(col, `list-${col}`);
  updateStats();
  setTimeout(() => {
    const inp = document.querySelector(`#list-${col} [data-idx="${i}"] .item-input`);
    if (inp) { inp.focus(); inp.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }, 60);
};

window.clearDone = async () => {
  // CORREZIONE SETTEMBRE 2026: prima di tutto, c'è davvero qualcosa da
  // togliere? Senza questo controllo "Fatti" apriva la richiesta di
  // conferma anche con la lista tutta ancora da fare, e chi rispondeva
  // "Sì, rimuovi" non vedeva succedere niente — con le Statistiche accese
  // finiva pure nell'archivio una spesa vuota. Lo diciamo nello stesso
  // modo in cui "Copia la lista per WhatsApp" dice che la lista è vuota.
  if (!state.data.flat().some(r => r.done)) {
    showToast('⚠️ Nessun articolo spuntato');
    return;
  }
  const ok = await customConfirm({
    icon: '🗑️',
    title: 'Rimuovere articoli?',
    // NUOVO SETTEMBRE 2026: il testo dice la verità su dove finiscono.
    // Sparire dalla lista e sparire davvero non sono più la stessa cosa:
    // meglio dirlo, invece di far credere che si stia cancellando tutto.
    // Finché le Statistiche non sono accese resta la frase di prima,
    // altrimenti prometteremmo un riepilogo che ancora non esiste.
    message: statisticheAttive()
      ? 'Gli articoli spuntati spariscono dalla lista, ma restano nel riepilogo di fine mese.'
      : 'Vuoi rimuovere tutti gli articoli già spuntati dalla lista?',
    okText: 'Sì, rimuovi',
    tema: 'rosso'
  });
  if (!ok) return;
  // NUOVO SETTEMBRE 2026: un attimo prima di buttarle, mettiamo da parte
  // le righe spuntate. Le raccogliamo PRIMA del filter, che è l'ultimo
  // momento in cui esistono ancora — e con il prezzo già dentro, visto
  // che si spunta dopo aver comprato.
  const spuntate = [];
  for (let c = 0; c < 3; c++) {
    state.data[c].forEach(r => { if (r.done) spuntate.push({ riga: r, col: c }); });
    state.data[c] = state.data[c].filter(r => !r.done);
    ensureRows(c);
  }
  archiviaSpesa(spuntate);   // non blocca: se fallisce, lo svuotamento va avanti lo stesso
  saveToFirebase(); renderAll();
};