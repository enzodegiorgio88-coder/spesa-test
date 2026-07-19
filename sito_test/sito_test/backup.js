// ════════════════════════════════════════════════════════════════
// backup.js — Backup della lista: salvati nell'app + file scaricabile
// ════════════════════════════════════════════════════════════════
// Modulo importato da main.js per soli effetti collaterali: espone su
// window le funzioni usate dagli onclick HTML.
//
// COME FUNZIONA:
// - "Fai Backup" salva una copia su Firebase (nodo backup_test, ne
//   teniamo gli ultimi 5 per famiglia) E scarica anche il file .json
//   sul dispositivo come sicurezza extra.
// - "Ripristina Backup" apre una schermata DELL'APP con l'elenco dei
//   backup salvati: si tocca quello desiderato, senza cercare file
//   nelle cartelle del telefono. In fondo resta comunque il pulsante
//   per aprire un file scaricato (funziona anche offline).
// - NUOVO (luglio 2026): scegliendo un file di backup scaricato, il suo
//   contenuto NON si apre in programmi esterni: viene mostrato DENTRO
//   l'app, in una schermata con tutti gli articoli salvati (foto,
//   quantità, prezzi, urgenti, fatti). Solo se si vuole, in fondo, si
//   tocca "Ripristina" e la lista del backup sostituisce quella attuale.

import { ref, get, set, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db, BACKUP_PATH } from './config.js';
import { state, ensureRows } from './state.js';
import { showToast } from './utils.js';
import { customConfirm } from './modals.js';
import { saveToFirebase } from './sync.js';
import { renderAll } from './list.js';

// BACKUP_PATH ora arriva da config.js e segue l'interruttore IS_TEST:
// 'backup_test' nella versione di test, 'backup' in quella ufficiale.
const MAX_BACKUPS = 5;               // per famiglia: i più vecchi si eliminano da soli

// ── HELPER COMUNI ──────────────────────────────────

function normalizzaListaBackup(lista) {
  // CORREZIONE 17/07/2026: Firebase NON salva le colonne vuote di "lista"
  // (per Firebase un array vuoto semplicemente non esiste). Quindi un
  // backup con articoli solo in alcune categorie tornava indietro con
  // MENO di 3 colonne, o addirittura come oggetto {0:..., 2:...} invece
  // che come array. Il vecchio codice si fidava, l'app andava in errore
  // a metà ripristino ("Sì, ripristina" che non faceva niente) e la lista
  // in memoria restava rotta. Ora le 3 colonne (Casa, Persona, Alimentari)
  // vengono SEMPRE ricostruite: quelle mancanti tornano come colonne vuote.
  const grezzo = (lista && typeof lista === 'object') ? lista : {};
  const out = [];
  for (let c = 0; c < 3; c++) {
    const col   = grezzo[c];
    const righe = Array.isArray(col) ? col
                : (col && typeof col === 'object' ? Object.values(col) : []);
    out.push(righe.map(r => {
      r = r || {};
      return {
        text:       r.text       || '',
        done:       !!r.done,
        photo:      r.photo      || null,
        qty:        r.qty        || 1,
        urgent:     !!r.urgent,
        lastAction: r.lastAction || '',
        actions:    r.actions    || [],
        price:      r.price      || ''
      };
    }));
  }
  return out;
}

function dataLeggibile(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return ['data sconosciuta', ''];
  return [d.toLocaleDateString('it-IT'), d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })];
}

// NUOVO: mentre una schermata di backup è aperta (elenco "I tuoi Backup"
// oppure anteprima di un file), la lista della spesa DIETRO non deve
// scorrere con la rotellina del mouse o col dito. Guardiamo cosa è
// realmente aperto (le due schermate possono stare una sopra l'altra)
// e mettiamo/togliamo la classe sul body (vedi style.css).
function aggiornaBloccoScroll() {
  const listaAperta     = document.getElementById('backupModal').classList.contains('show');
  const anteprimaAperta = document.getElementById('backupPreviewModal').classList.contains('show');
  document.body.classList.toggle('backup-modal-open', listaAperta || anteprimaAperta);
}

// ── CODIFICA DEL FILE .spesa (correzione luglio 2026) ─────────────
// Il contenuto del file scaricato viene "offuscato" in Base64 (con
// gestione corretta di emoji e lettere accentate): se qualcuno apre il
// file con il browser o il Blocco Note vede solo la riga SPESABACKUP1
// e una lunga sequenza di lettere senza senso — NON la lista in chiaro.
// Solo l'app, in "Ripristina da un file scaricato", sa decodificarlo.

function codificaBackup(json) {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 32768)
    bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return 'SPESABACKUP1\n' + btoa(bin);
}

function decodificaBackup(b64) {
  const bin = atob(b64.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function confermaEApplica(backup) {
  // CORREZIONE 17/07/2026: la lista viene "riparata" SUBITO (vedi
  // normalizzaListaBackup): da qui in poi abbiamo sempre 3 colonne valide,
  // qualunque cosa arrivi da Firebase o da un file. Prima il conteggio
  // veniva fatto sui dati grezzi e, se Firebase aveva perso le colonne
  // vuote, il ripristino si rompeva a metà senza fare niente.
  const listaOk = normalizzaListaBackup(backup.lista);
  const totale  = listaOk.flat().filter(r => r.text.trim() || r.photo).length;
  const [g, h] = dataLeggibile(backup.creato);
  const altraFamiglia = backup.famiglia && backup.famiglia !== state.currentFamilyId
    ? ` ⚠️ Attenzione: questo backup è di un'altra lista ("${backup.famiglia}").`
    : '';
  const ok = await customConfirm({
    icon: '📂',
    title: 'Ripristinare il backup?',
    message: `Backup del ${g}${h ? ' alle ' + h : ''} con ${totale} ${totale === 1 ? 'articolo' : 'articoli'}.${altraFamiglia} La lista ATTUALE verrà sostituita da quella del backup, per tutta la famiglia. Vuoi continuare?`,
    okText: 'Sì, ripristina',
    tema: 'rosso'
  });
  if (!ok) return false;

  state.data = listaOk;
  for (let c = 0; c < 3; c++) ensureRows(c);
  renderAll();
  saveToFirebase();
  window.closeBackupModal();
  showToast('✅ Backup ripristinato!', 3000);
  return true;
}

// ── FAI BACKUP (salva nell'app + scarica il file) ──

async function eliminaVecchiBackup() {
  try {
    const snap = await get(ref(db, `${BACKUP_PATH}/${state.currentFamilyId}`));
    if (!snap.exists()) return;
    const chiavi = Object.keys(snap.val()).sort((a, b) => Number(b) - Number(a));
    for (const k of chiavi.slice(MAX_BACKUPS)) {
      await remove(ref(db, `${BACKUP_PATH}/${state.currentFamilyId}/${k}`));
    }
  } catch { /* pulizia best-effort, non bloccante */ }
}

window.scaricaBackup = async () => {
  const lista = state.data.map(col => col.filter(r => r.text.trim() || r.photo));
  const totale = lista.flat().length;
  if (!totale) { showToast('⚠️ La lista è vuota!'); return; }

  const ok = await customConfirm({
    icon: '💾',
    title: 'Vuoi fare il backup?',
    message: `La lista di adesso (${totale} ${totale === 1 ? 'articolo' : 'articoli'}, foto comprese) verrà salvata nell'app — teniamo gli ultimi ${MAX_BACKUPS} — e scaricata anche come file sul telefono per sicurezza extra.`,
    okText: 'Sì, fai backup',
    tema: 'neutro'
  });
  if (!ok) return;

  const backup = {
    app:      'Spesa Famiglia',
    versione: 1,
    famiglia: state.currentFamilyId,
    creato:   new Date().toISOString(),
    creatoDa: state.currentUserName,
    articoli: totale,
    lista
  };

  // 1) Copia nell'app (Firebase). Niente await bloccante: se si è offline
  //    la scrittura resta in coda e parte al ritorno della rete, intanto
  //    il download del file qui sotto avviene comunque subito.
  set(ref(db, `${BACKUP_PATH}/${state.currentFamilyId}/${Date.now()}`), backup)
    .then(eliminaVecchiBackup)
    .catch(e => console.warn('[Backup] Copia nell\'app non salvata:', e.message));

  // 2) File scaricato sul dispositivo (sicurezza extra, funziona offline).
  //    CORREZIONE LUGLIO 2026: estensione .spesa, tipo "octet-stream" e
  //    contenuto OFFUSCATO (vedi codificaBackup qui sopra). Nessun sito può
  //    impedire al telefono/PC di aprire un file quando viene toccato: ma
  //    se succede, ora si vede solo una sequenza di lettere senza senso,
  //    NON la lista in chiaro. Il file si usa dall'app, con "Ripristina da
  //    un file scaricato", che lo riconosce e lo decodifica da sola.
  try {
    const blob = new Blob([codificaBackup(JSON.stringify(backup))], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `backup_spesa_${state.currentFamilyId}_${new Date().toISOString().slice(0, 10)}.spesa`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`✅ Backup salvato nell'app e scaricato! (${totale} ${totale === 1 ? 'articolo' : 'articoli'})`, 3500);
  } catch (e) {
    console.error('Backup error:', e);
    showToast('❌ Errore durante il backup');
  }
};

// ── RIPRISTINA: schermata con l'elenco dei backup nell'app ──

function buildBackupRow(chiave, b) {
  const row  = document.createElement('div'); row.className = 'backup-item';
  const info = document.createElement('div'); info.className = 'backup-item-info';
  const [g, h] = dataLeggibile(b.creato);
  const data = document.createElement('div'); data.className = 'backup-item-data';
  data.textContent = `📦 ${g}${h ? ' — ' + h : ''}`;
  const sub  = document.createElement('div'); sub.className = 'backup-item-sub';
  const n    = b.articoli || (Array.isArray(b.lista) ? b.lista.flat().length : 0);
  sub.textContent = `${n} ${n === 1 ? 'articolo' : 'articoli'}${b.creatoDa ? ' · di ' + b.creatoDa : ''}`;
  info.append(data, sub);
  const btn = document.createElement('button'); btn.className = 'btn-ripristina-item';
  btn.textContent = 'Ripristina';
  btn.onclick = () => confermaEApplica(b);
  // NUOVO: cestino 🗑️ per eliminare definitivamente QUESTO backup.
  const del = document.createElement('button'); del.className = 'btn-elimina-backup';
  del.textContent = '🗑️';
  del.title = 'Elimina definitivamente questo backup';
  del.onclick = () => eliminaBackup(chiave, b, row);
  row.append(info, btn, del);
  return row;
}

// ── ELIMINA UN BACKUP (nuovo): cestino 🗑️ accanto a ogni copia ────
// Toccando il cestino NON si cancella subito niente: prima compare il
// popup di conferma dell'app che avvisa che l'eliminazione è DEFINITIVA,
// con i due pulsanti "Annulla" ed "Elimina definitivamente". Viene
// cancellata SOLO quella copia di backup: la lista attuale non si tocca.
async function eliminaBackup(chiave, b, row) {
  if (state.isOffline) { showToast('❌ Non disponibile offline'); return; }
  const [g, h] = dataLeggibile(b.creato);
  const n = b.articoli || (Array.isArray(b.lista) ? b.lista.flat().length : 0);
  const ok = await customConfirm({
    icon: '🗑️',
    title: 'Eliminare questo backup?',
    message: `⚠️ Attenzione: il backup del ${g}${h ? ' alle ' + h : ''} (${n} ${n === 1 ? 'articolo' : 'articoli'}) verrà eliminato DEFINITIVAMENTE e non potrà più essere recuperato. La lista della spesa attuale NON viene toccata.`,
    okText: 'Elimina definitivamente',
    tema: 'rosso'
  });
  if (!ok) return;
  try {
    await remove(ref(db, `${BACKUP_PATH}/${state.currentFamilyId}/${chiave}`));
    row.remove();
    const body = document.getElementById('backupBody');
    if (!body.querySelector('.backup-item'))
      body.innerHTML = '<div class="backup-empty">Nessun backup nell\'app.<br>Tocca 💾 Fai Backup per crearne uno!</div>';
    showToast('🗑️ Backup eliminato definitivamente');
  } catch (e) {
    showToast('❌ Errore: backup non eliminato');
  }
}

window.ripristinaBackup = async () => {
  const body = document.getElementById('backupBody');
  document.getElementById('backupModal').classList.add('show');
  aggiornaBloccoScroll();
  body.innerHTML = '<div class="backup-empty">⏳ Caricamento backup...</div>';
  try {
    const snap = await get(ref(db, `${BACKUP_PATH}/${state.currentFamilyId}`));
    body.innerHTML = '';
    if (!snap.exists()) {
      body.innerHTML = '<div class="backup-empty">Nessun backup nell\'app.<br>Tocca 💾 Fai Backup per crearne uno!</div>';
      return;
    }
    const entries = Object.entries(snap.val())
      // CORREZIONE 17/07/2026: Firebase a volte restituisce "lista" come
      // oggetto invece che come array (succede quando le prime categorie
      // erano vuote): questi backup sono validi e ora vengono mostrati,
      // prima sparivano con "Nessun backup valido trovato".
      .filter(([, b]) => b && b.lista && typeof b.lista === 'object')
      .sort((a, b) => Number(b[0]) - Number(a[0]));   // dal più recente
    if (!entries.length) {
      body.innerHTML = '<div class="backup-empty">Nessun backup valido trovato.</div>';
      return;
    }
    entries.forEach(([chiave, b]) => body.appendChild(buildBackupRow(chiave, b)));
  } catch (e) {
    body.innerHTML = '<div class="backup-empty">📡 Elenco non disponibile (sei offline?).<br>Puoi comunque ripristinare da un file scaricato, qui sotto.</div>';
  }
};

window.closeBackupModal = (e) => {
  if (!e || e.target === document.getElementById('backupModal')) {
    document.getElementById('backupModal').classList.remove('show');
    aggiornaBloccoScroll();
  }
};

// ── ANTEPRIMA DEL FILE DI BACKUP DENTRO L'APP (nuovo luglio 2026) ──
// Quando si sceglie un file di backup scaricato, il contenuto viene
// mostrato QUI, in una schermata dell'app (nessun programma esterno):
// tutte le categorie, gli articoli, le foto (toccale per ingrandirle),
// le quantità, i prezzi, gli urgenti e cosa era già stato spuntato.
// In fondo c'è il pulsante per ripristinare davvero, se si vuole.

let backupInAnteprima = null;

function buildAnteprimaRiga(r) {
  const row   = document.createElement('div'); row.className = 'bkpv-item';
  const stato = document.createElement('span'); stato.className = 'bkpv-stato';
  stato.textContent = r.done ? '✅' : '⬜';
  row.appendChild(stato);
  if (r.photo) {
    const img = document.createElement('img');
    img.className = 'bkpv-foto'; img.src = r.photo; img.alt = '';
    img.onclick = () => { if (window.openZoom) window.openZoom(r.photo); };
    row.appendChild(img);
  }
  const txt = document.createElement('span');
  txt.className = 'bkpv-testo' + (r.done ? ' fatto' : '');
  txt.textContent = r.text.trim() || '(solo foto)';
  row.appendChild(txt);
  if ((r.qty || 1) > 1) {
    const q = document.createElement('span'); q.className = 'bkpv-qty';
    q.textContent = 'x' + r.qty;
    row.appendChild(q);
  }
  const p = parseFloat(r.price);
  if (p > 0) {
    const pr = document.createElement('span'); pr.className = 'bkpv-prezzo';
    pr.textContent = '€ ' + (p * (r.qty || 1)).toFixed(2).replace('.', ',');
    row.appendChild(pr);
  }
  if (r.urgent && !r.done) {
    const u = document.createElement('span'); u.className = 'bkpv-urgente';
    u.textContent = '🔴';
    row.appendChild(u);
  }
  return row;
}

function mostraAnteprimaBackup(backup) {
  backupInAnteprima = backup;
  const body  = document.getElementById('backupPreviewBody');
  body.innerHTML = '';
  const lista = normalizzaListaBackup(backup.lista);
  const nomi  = ['🏠 Casa', '👤 Persona', '🛒 Alimentari'];
  let totArticoli = 0, totale = 0;

  for (let c = 0; c < 3; c++) {
    const items = (lista[c] || []).filter(r => r.text.trim() || r.photo);
    if (!items.length) continue;
    totArticoli += items.length;
    const cat = document.createElement('div'); cat.className = 'bkpv-cat';
    const tit = document.createElement('div'); tit.className = 'bkpv-cat-title';
    tit.textContent = nomi[c];
    cat.appendChild(tit);
    items.forEach(r => {
      cat.appendChild(buildAnteprimaRiga(r));
      const p = parseFloat(r.price);
      if (p > 0) totale += p * (r.qty || 1);
    });
    body.appendChild(cat);
  }

  if (!totArticoli) {
    body.innerHTML = '<div class="backup-empty">Questo backup è vuoto.</div>';
  } else if (totale > 0) {
    const tot = document.createElement('div'); tot.className = 'bkpv-totale';
    tot.textContent = '💶 Totale stimato: ' + totale.toFixed(2).replace('.', ',') + ' €';
    body.appendChild(tot);
  }

  const [g, h] = dataLeggibile(backup.creato);
  const extra  = backup.famiglia && backup.famiglia !== state.currentFamilyId ? ' · ⚠️ altra lista' : '';
  document.getElementById('backupPreviewSub').textContent =
    `${g}${h ? ' — ' + h : ''} · ${totArticoli} ${totArticoli === 1 ? 'articolo' : 'articoli'}` +
    `${backup.creatoDa ? ' · di ' + backup.creatoDa : ''}${extra}`;

  document.getElementById('backupPreviewModal').classList.add('show');
  aggiornaBloccoScroll();
}

window.closeBackupPreview = (e) => {
  if (!e || e.target === document.getElementById('backupPreviewModal')) {
    document.getElementById('backupPreviewModal').classList.remove('show');
    aggiornaBloccoScroll();
  }
};

window.ripristinaDalPreview = async () => {
  if (!backupInAnteprima) return;
  const ok = await confermaEApplica(backupInAnteprima);
  if (ok) {
    backupInAnteprima = null;
    document.getElementById('backupPreviewModal').classList.remove('show');
    aggiornaBloccoScroll();
  }
};

// ── RIPRISTINA DA FILE SCARICATO (opzione di riserva) ──

function leggiFile(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload  = () => res(fr.result);
    fr.onerror = () => rej(new Error('Lettura file fallita'));
    fr.readAsText(file);
  });
}

window.ripristinaDaFile = () => {
  const fi = document.createElement('input');
  fi.type = 'file';
  // CORREZIONE LUGLIO 2026: niente filtro "accept". Su molti telefoni Android
  // un filtro per tipo di file nasconderebbe i backup .spesa (estensione
  // personalizzata) rendendoli non selezionabili. Si può quindi scegliere
  // qualsiasi file: è il controllo qui sotto a riconoscere AUTOMATICAMENTE
  // se è un backup valido di Spesa Famiglia (e ad avvisare se non lo è).
  // I vecchi backup .json già scaricati continuano a funzionare.
  fi.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    let backup = null;
    try {
      let testo = await leggiFile(file);
      // Formato nuovo (luglio 2026): prima riga "SPESABACKUP1" + dati
      // offuscati → qui vengono decodificati automaticamente. I file
      // vecchi (JSON in chiaro, sia .json che .spesa) non hanno quella
      // riga e proseguono dritti a JSON.parse come prima.
      if (testo.startsWith('SPESABACKUP1'))
        testo = decodificaBackup(testo.slice(testo.indexOf('\n') + 1));
      backup = JSON.parse(testo);
    } catch { /* gestito sotto */ }
    if (!backup || backup.app !== 'Spesa Famiglia' || !Array.isArray(backup.lista) || backup.lista.length !== 3) {
      showToast('❌ Questo non è un backup di Spesa Famiglia'); return;
    }
    // NUOVO: niente più richiesta di ripristino immediata. Il contenuto
    // del file viene mostrato DENTRO l'app; il ripristino si fa dal
    // pulsante in fondo all'anteprima, solo se lo si vuole davvero.
    mostraAnteprimaBackup(backup);
  };
  fi.click();
};