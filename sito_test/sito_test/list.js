// ════════════════════════════════════════════════════════════════
// list.js — Rendering liste, modifica articoli, statistiche
// ════════════════════════════════════════════════════════════════

import { NOVITA_RELEASE } from './config.js';
import { state, ensureRows, emptyRow } from './state.js';
import { haBlasfemia, haAlimentoVietato } from './content-filter.js';
import { mostraBlocco, customConfirm } from './modals.js';
import { saveToFirebase } from './sync.js';
import { buildPhotoWrap } from './photo.js';
import { inviaNotificaUrgente } from './notifications.js';
import { updateTotale } from './totals.js';

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
  ensureRows(col);
  saveToFirebase();
  renderCol(col, `list-${col}`);
  renderCol(col, `all-${col}`);
  updateStats();
}

function buildDelBtn(col, i) {
  const btn = document.createElement('button');
  btn.className = 'del-btn'; btn.textContent = '✕';
  btn.onclick = () => onDeleteRow(col, i);
  return btn;
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

  // Aggiorna solo il numero a schermo, senza ridisegnare la riga:
  // così il pulsante resta "vivo" durante la pressione continua.
  const cambia = (delta) => {
    const cur  = state.data[col][i].qty || 1;
    const next = Math.max(1, cur + delta);
    if (next === cur) return;
    state.data[col][i].qty = next;
    val.textContent = 'x' + next;
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
const PRIORITA = [
  { val: 'normale',    txt: '⚪ Normale',    desc: 'Senza fretta: si prende al solito giro di spesa.' },
  { val: 'importante', txt: '🟠 Importante', desc: 'Da non dimenticare: mettilo nel carrello alla prossima spesa.' },
  { val: 'urgente',    txt: '🔴 Urgente',    desc: 'Serve subito: avvisa tutta la famiglia con una notifica.' }
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

function buildPriorityMenu(col, i, item) {
  const wrap = document.createElement('div'); wrap.className = 'prio-wrap';
  const cur  = item.urgent ? 'urgente' : (item.important ? 'importante' : 'normale');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'priority-select'
    + (cur === 'urgente' ? ' urgente' : cur === 'importante' ? ' importante' : '');
  btn.textContent = PRIORITA.find(s => s.val === cur).txt + ' ▾';

  const menu = document.createElement('div'); menu.className = 'prio-menu';
  PRIORITA.forEach(s => {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'prio-option' + (s.val === cur ? ' attiva' : '');
    const nome = document.createElement('span'); nome.className = 'prio-name'; nome.textContent = s.txt;
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
    // NUOVO: il menu è centrato sullo schermo (vedi .prio-menu nel CSS),
    // qui decidiamo solo l'altezza: subito sotto il pulsante; se verso il
    // basso non c'è spazio, si apre sopra. Così non viene mai tagliato.
    const r = btn.getBoundingClientRect();
    let top = r.bottom + 6;
    if (top + menu.offsetHeight > window.innerHeight - 8)
      top = Math.max(8, r.top - menu.offsetHeight - 6);
    menu.style.top = top + 'px';
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
    saveToFirebase(); updateStats();
  };
  // Mentre si scrive il prezzo la tastiera occupa mezzo schermo: nascondiamo
  // la barra dei pulsanti in basso (stessa logica del campo articolo).
  inp.onfocus = onFieldFocus;
  inp.onblur  = onFieldBlur;
  wrap.append(icon, inp);
  if (item.price && parseFloat(item.price) > 0 && item.qty > 1) {
    const line = document.createElement('span'); line.className = 'price-line';
    line.textContent = '= €' + (parseFloat(item.price) * item.qty).toFixed(2);
    wrap.appendChild(line);
  }
  return wrap;
}

function buildRowHeader(col, i, item) {
  const inner = document.createElement('div'); inner.className = 'item-inner';
  const chk   = document.createElement('button');
  chk.className = `chk${item.done ? ` done-${col}` : ''}`;
  chk.textContent = item.done ? '✓' : '';
  chk.onclick = () => onCheckToggle(col, i);

  // Icona 🔗 visibile solo se il testo contiene un URL: aprendola si va
  // direttamente al sito, mentre il testo resta modificabile nell'input.
  const link = document.createElement('a');
  link.className = 'link-btn'; link.textContent = '🔗';
  link.target = '_blank'; link.rel = 'noopener noreferrer';
  const aggiornaLink = (testo) => {
    const url = estraiUrl(testo);
    if (url) { link.href = url; link.style.display = ''; }
    else     { link.removeAttribute('href'); link.style.display = 'none'; }
  };
  aggiornaLink(item.text);

  inner.append(chk, buildPhotoWrap(col, i, item), buildTextInput(col, i, item, aggiornaLink), link, buildDelBtn(col, i));
  return inner;
}

function buildRowExtra(col, i, item) {
  const extra = document.createElement('div'); extra.className = 'item-extra';
  extra.append(buildQtyWrap(col, i, item), buildPriorityMenu(col, i, item));
  if (new Date() >= NOVITA_RELEASE) extra.appendChild(buildPriceWrap(col, i, item));
  return extra;
}

function makeRow(col, i, item) {
  const li = document.createElement('li');
  li.className = `item-row${item.urgent && !item.done ? ' urgent'
                          : item.important && !item.done ? ' important' : ''}`;
  li.dataset.col = col;
  li.dataset.idx = i;
  li.append(buildRowHeader(col, i, item), buildRowExtra(col, i, item));
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

  // NUOVO: il pulsante in alto compare anche quando ci sono SOLO articoli
  // importanti (e diventa arancione); se c'è almeno un urgente resta
  // rosso e conta gli urgenti, come prima.
  const imp    = all.filter(r => r.important && !r.done);
  const urgBtn = document.getElementById('btnUrgenti');
  if (urg.length || imp.length) {
    const rosso = urg.length > 0;
    urgBtn.style.display = 'flex';
    urgBtn.classList.toggle('importanti', !rosso);
    urgBtn.innerHTML = (rosso ? '🔴 Urgenti ' : '🟠 Importanti ')
      + `<span class="urg-count" id="urgBtnCount">${rosso ? urg.length : imp.length}</span>`;
  } else {
    urgBtn.style.display = 'none';
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

window.addRow = (col) => {
  const r = emptyRow();
  r.author     = state.currentUserName;
  r.actions    = ['aggiunto da ' + state.currentUserName];
  r.lastAction = r.actions[0];
  state.data[col].push(r);
  saveToFirebase();
  renderCol(col, `list-${col}`);
  updateStats();
  setTimeout(() => {
    const inputs = document.querySelectorAll(`#list-${col} .item-input`);
    const last   = inputs[inputs.length - 1];
    if (last) { last.focus(); last.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }, 60);
};

window.clearDone = async () => {
  const ok = await customConfirm({
    icon: '🗑️',
    title: 'Rimuovere articoli?',
    message: 'Vuoi rimuovere tutti gli articoli già spuntati dalla lista?',
    okText: 'Sì, rimuovi',
    tema: 'rosso'
  });
  if (!ok) return;
  for (let c = 0; c < 3; c++) { state.data[c] = state.data[c].filter(r => !r.done); ensureRows(c); }
  saveToFirebase(); renderAll();
};