// ════════════════════════════════════════════════════════════════
// archivio.js — La spesa fatta non si butta, si mette da parte
// ════════════════════════════════════════════════════════════════
// NUOVO SETTEMBRE 2026: fino a ieri "Rimuovi spuntati" buttava via le
// righe e finiva lì. Da oggi, un attimo prima di buttarle, ne facciamo
// una copia qui: così a fine mese si può raccontare cosa ha comprato la
// famiglia, chi ha aggiunto di più e quanto si è speso.
//
// PERCHÉ QUI E NON DENTRO LA RIGA: mettere una data dentro ogni articolo
// avrebbe voluto dire toccare emptyRow(), parseSnapshotData(), doSave() e
// normalizzaListaBackup() — i quattro punti dove basta dimenticarsene uno
// per far sparire un campo in silenzio. E comunque allo svuotamento si
// sarebbe perso tutto lo stesso. Un ramo separato invece non tocca niente
// della lista: se questo file smette di funzionare, la spesa continua a
// funzionare come sempre.
//
// LA DATA STA SUL PACCHETTO, NON SULLA RIGA. Le righe non hanno mai
// avuto una data e continuano a non averla: quello che salviamo è
// "il 3 settembre Maria ha svuotato 14 articoli". Per le statistiche va
// meglio così — è il giorno in cui si è andati davvero al supermercato.
//
// ARCHITETTURA: modulo foglia. Importa solo config.js e state.js, non
// importa list.js. È list.js a chiamare noi, come fa già con prezzi.js.

import { ref, push, set, remove }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { db, ARCHIVIO_PATH, statisticheAttive } from './config.js';
import { state } from './state.js';

// Quanti mesi teniamo. Tredici e non dodici di proposito: così a
// settembre 2027 si può ancora confrontare con settembre 2026. I mesi
// più vecchi si cancellano da soli (vedi pulisciVecchi qui sotto).
const MESI_DA_TENERE = 13;

// Freno di sicurezza: se qualcuno spunta e svuota una lista enorme non
// scriviamo un pacchetto sterminato. Oltre questa soglia teniamo le
// prime N righe — le statistiche restano sensate e il database respira.
const MAX_RIGHE = 200;

// Da una data alla cartella del mese: "2026-09".
// Raggruppare per mese è la cosa che rende tutto leggero dopo: a fine
// mese si legge UNA cartella, non tutto l'archivio di sempre.
function chiaveMese(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Cancellazione dei mesi troppo vecchi, senza leggere niente.
// Invece di scaricare l'elenco delle cartelle per vedere quali sono
// scadute, calcoliamo direttamente il nome della cartella di 14 mesi fa
// e diciamo a Firebase di cancellarla. Se non esiste, remove() non fa
// nulla e non costa nulla: è il modo più economico di fare pulizia.
//
// setDate(1) PRIMA di setMonth() non è un vezzo: senza, il 31 marzo
// meno un mese diventerebbe "31 febbraio", cioè il 3 marzo, e un mese
// verrebbe saltato nel conteggio.
function pulisciVecchi() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - (MESI_DA_TENERE + 1));
  return remove(ref(db, `${ARCHIVIO_PATH}/${state.currentFamilyId}/${chiaveMese(d)}`));
}

// Prepara una riga per l'archivio, tenendo solo quello che serve.
//
// LA FOTO VIENE BUTTATA, ed è voluto: una foto in base64 pesa fino a
// 200 KB (lo dicono le regole del database). Archiviando le righe intere,
// una famiglia che fotografa gli scaffali riempirebbe l'archivio in
// poche settimane. Le statistiche non ne hanno bisogno.
function rigaPerArchivio(r, col) {
  const dato = {
    testo: String(r.text || '').trim().slice(0, 300),
    col:   col
  };
  // I campi facoltativi li mettiamo solo se ci sono davvero: un archivio
  // pieno di stringhe vuote è solo spazio sprecato.
  if (r.author) dato.autore = String(r.author).slice(0, 50);
  if (r.price)  dato.prezzo = String(r.price).slice(0, 20);
  if (r.qty && r.qty > 1) dato.qty = r.qty;
  return dato;
}

// ── L'UNICA FUNZIONE CHE SERVE A LIST.JS ───────────
// Riceve le righe spuntate nel momento esatto in cui stanno per essere
// tolte dalla lista, e le mette da parte.
//
// NON RESTITUISCE NIENTE E NON SI ASPETTA CHE NESSUNO LA ASPETTI.
// È scritta apposta perché sia impossibile che un problema qui dentro
// rallenti o rompa lo svuotamento della lista: tutto sta dentro un
// try/catch, gli errori finiscono in console e basta. Se un pacchetto
// si perde per colpa della rete, si perde una riga di statistica —
// non un articolo della spesa.
export function archiviaSpesa(righe) {
  try {
    // NUOVO SETTEMBRE 2026: prima dell'accensione non si archivia NIENTE.
    // È voluto, ed è la ragione per cui la prima volta che si aprono le
    // Statistiche i numeri sono tutti a zero: il conteggio parte dal 1°
    // settembre, non da quando il sito è stato messo online. Così nessuno
    // apre la schermata e ci trova dentro le prove fatte nei giorni prima.
    if (!statisticheAttive()) return;

    if (!state.currentFamilyId) return;
    if (!Array.isArray(righe) || !righe.length) return;

    const pronte = righe
      .filter(x => x && x.riga && String(x.riga.text || '').trim())
      .slice(0, MAX_RIGHE)
      .map(x => rigaPerArchivio(x.riga, x.col));

    // Se erano tutte righe vuote non archiviamo un pacchetto fantasma.
    if (!pronte.length) return;

    const adesso = new Date();
    const pacchetto = {
      quando: adesso.getTime(),
      chi:    String(state.currentUserName || '').slice(0, 50),
      righe:  pronte
    };

    const cartella = `${ARCHIVIO_PATH}/${state.currentFamilyId}/${chiaveMese(adesso)}`;
    // push() e non set(): ogni svuotamento è un pacchetto nuovo che si
    // affianca ai precedenti. Due telefoni che svuotano nello stesso
    // momento non si sovrascrivono a vicenda — cosa che invece succede
    // di continuo alla lista, riscritta per intero a ogni salvataggio.
    set(push(ref(db, cartella)), pacchetto)
      .then(() => pulisciVecchi())
      .catch(e => console.warn('[Archivio] pacchetto non salvato:', e.code || e.message));

  } catch (e) {
    // Qualunque cosa sia andata storta, la lista non se ne deve accorgere.
    console.warn('[Archivio] errore ignorato:', e && e.message);
  }
}
