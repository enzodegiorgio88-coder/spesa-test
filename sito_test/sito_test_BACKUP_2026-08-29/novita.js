// ════════════════════════════════════════════════════════════════
// novita.js — Popup novità, gestione versione/aggiornamenti
// ════════════════════════════════════════════════════════════════

import { NOVITA_RELEASE, NOVITA_KEY, VACANZA_INIZIO, VACANZA_FINE, IS_TEST } from './config.js';
import { initNotifiche } from './notifications.js';

function creaConfetti() {
  const container = document.getElementById('confettiContainer');
  if (!container) return;
  const colors = ['#fff','#ffeaa7','#fd79a8','#74b9ff','#55efc4','#fdcb6e'];
  for (let i = 0; i < 28; i++) {
    const c = document.createElement('div'); c.className = 'confetto';
    c.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;background:${colors[Math.floor(Math.random()*colors.length)]};width:${6+Math.random()*6}px;height:${6+Math.random()*6}px;animation-duration:${1.5+Math.random()*2}s;animation-delay:${Math.random()*2}s;border-radius:${Math.random()>.5?'50%':'2px'};`;
    container.appendChild(c);
  }
}

export function controllaNovita() {
  if (new Date() < NOVITA_RELEASE) return;
  if (localStorage.getItem(NOVITA_KEY)) return;
  creaConfetti();
  document.getElementById('novitaScreen').classList.add('show');
}

window.chiudiNovita = () => {
  localStorage.setItem(NOVITA_KEY, '1');
  document.getElementById('novitaScreen').classList.remove('show');
  setTimeout(initNotifiche, 500);
  // NUOVO LUGLIO 2026: chiuse le Novità, controlliamo subito se va
  // mostrato il popup vacanza, così nessuno se lo perde.
  setTimeout(controllaVacanza, 600);
};

// ════════════════════════════════════════════════════════════════
// NUOVO LUGLIO 2026: popup "Sono in vacanza"
// Sul sito UFFICIALE compare da solo SOLO tra VACANZA_INIZIO e
// VACANZA_FINE (config.js). Sulla copia di TEST (IS_TEST = true)
// compare SUBITO, senza aspettare il periodo, così si può provare.
// In entrambi i casi si vede UNA VOLTA SOLA per dispositivo: una
// volta chiuso viene ricordato e non ricompare più. I giorni scritti
// nel messaggio si calcolano da soli dalle due date: per le prossime
// vacanze basta cambiare le date in config.js e si aggiorna tutto.
// ════════════════════════════════════════════════════════════════

// Chiave "già visto": cambia da sola a ogni nuova vacanza (deriva dalla data)
const CHIAVE_VACANZA = 'vacanza_visto_' + VACANZA_INIZIO.getTime();

function creaConfettiVacanza() {
  const container = document.getElementById('vacConfettiContainer');
  if (!container) return;
  // Coriandoli in colori estivi: bianco, giallo sole, arancio, azzurro mare, verde acqua
  const colors = ['#fff','#ffeaa7','#fdcb6e','#ff7043','#74b9ff','#00cec9','#55efc4'];
  for (let i = 0; i < 28; i++) {
    const c = document.createElement('div'); c.className = 'confetto';
    c.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;background:${colors[Math.floor(Math.random()*colors.length)]};width:${6+Math.random()*6}px;height:${6+Math.random()*6}px;animation-duration:${1.5+Math.random()*2}s;animation-delay:${Math.random()*2}s;border-radius:${Math.random()>.5?'50%':'2px'};`;
    container.appendChild(c);
  }
}

export function controllaVacanza() {
  // Nella copia di TEST il controllo delle date viene saltato: il popup
  // compare subito. Sul sito ufficiale compare solo nel periodo giusto.
  const ora = new Date();
  if (!IS_TEST && (ora < VACANZA_INIZIO || ora >= VACANZA_FINE)) return; // fuori periodo: mai visibile (solo sito ufficiale)
  if (localStorage.getItem(CHIAVE_VACANZA)) return;                      // già visto su questo dispositivo
  // Se in questo momento sono aperte le Novità, diamo la precedenza a
  // quelle: il popup vacanza comparirà appena vengono chiuse (vedi
  // chiudiNovita) oppure alla prossima apertura dell'app.
  if (document.getElementById('novitaScreen').classList.contains('show')) return;

  // Riempie i giorni nelle frasi a partire dalle date di config.js
  const ultimo = new Date(VACANZA_FINE);
  ultimo.setDate(ultimo.getDate() - 1);                    // ultimo giorno di vacanza
  const it = (d, opz) => d.toLocaleDateString('it-IT', opz);
  document.getElementById('vacDal').textContent     = it(VACANZA_INIZIO, { weekday:'long', day:'numeric' });
  document.getElementById('vacAl').textContent      = it(ultimo,         { weekday:'long', day:'numeric', month:'long' });
  document.getElementById('vacRitorno').textContent = it(VACANZA_FINE,   { weekday:'long', day:'numeric' });
  document.getElementById('vacSottotitolo').textContent =
    'Da ' + it(VACANZA_INIZIO, { weekday:'long', day:'numeric' }) +
    ' a ' + it(ultimo, { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  creaConfettiVacanza();
  document.getElementById('vacanzaScreen').classList.add('show');
}

window.chiudiVacanza = () => {
  localStorage.setItem(CHIAVE_VACANZA, '1'); // ricordato: non ricompare più
  document.getElementById('vacanzaScreen').classList.remove('show');
};