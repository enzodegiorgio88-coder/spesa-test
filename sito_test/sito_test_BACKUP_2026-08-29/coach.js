// ════════════════════════════════════════════════════════════════
// coach.js — La manina che indica il menu, una volta sola
// ════════════════════════════════════════════════════════════════
// NUOVO SETTEMBRE 2026: il pulsante ☰ compare dal nulla la mattina del
// 1° settembre, in un angolo dove prima non c'era niente. Senza un dito
// puntato lì sopra, il rischio è che le Statistiche restino chiuse in un
// cassetto che nessuno apre. Così, subito dopo il popup delle Novità,
// lo schermo si scurisce TRANNE le tre linee e una freccetta spiega
// dove toccare. Si vede UNA VOLTA SOLA per dispositivo.
//
// COME SI SCURISCE TUTTO TRANNE UN PEZZO: non si ritaglia niente. È il
// box-shadow gigante di #coachBuco a fare il lavoro (la spiegazione per
// esteso sta in style.css, alla voce "LA MANINA CHE INDICA IL MENU").
// Qui dentro c'è solo la matematica: dove sta il pulsante, dove va il
// buco, dove va il fumetto.
//
// SI PUÒ TOCCARE SOLO IL PULSANTE. Il velo #coachBlocco si prende tutti
// i tocchi fuori dal buco e non li fa arrivare alla lista; il fumetto
// scuote la testa per dire "no, di qua". L'unica strada è il ☰.
//
// ARCHITETTURA: modulo foglia. Importa solo config.js, e le funzioni
// che servono agli onclick dell'HTML le espone su window, come menu.js.

import { statisticheAttive } from './config.js';

// "Già vista": una volta chiusa non si rivede più, su questo telefono.
const COACH_KEY = 'coach_menu_statistiche_visto';

// Quanto il buco luminoso deve essere più largo del pulsante, per lato.
// Senza questo margine il bordo bianco starebbe appiccicato alle linee.
const MARGINE = 6;

// Le misure vanno rifatte se lo schermo cambia (telefono girato,
// finestra ridimensionata). Teniamo da parte la funzione per poterla
// staccare quando la manina sparisce: un ascoltatore lasciato acceso è
// il modo più semplice di far rallentare un'app per sempre.
let riposiziona = null;

function bottone() {
  return document.getElementById('btnMenu');
}

// Mette il buco sopra il pulsante e il fumetto appena sotto.
// Tutto in coordinate dello SCHERMO (getBoundingClientRect + position:
// fixed): non c'entra quanto è stata scrollata la pagina, e infatti
// mentre la manina è accesa la pagina non si scrolla affatto.
function piazza() {
  const btn = bottone();
  const buco = document.getElementById('coachBuco');
  const fumetto = document.getElementById('coachFumetto');
  if (!btn || !buco || !fumetto) return false;

  const r = btn.getBoundingClientRect();
  // Pulsante non ancora disegnato (larghezza zero): non piazziamo niente.
  // Meglio nessuna manina che una manina che indica l'angolo in alto.
  if (r.width === 0 || r.height === 0) return false;

  buco.style.left   = (r.left   - MARGINE) + 'px';
  buco.style.top    = (r.top    - MARGINE) + 'px';
  buco.style.width  = (r.width  + MARGINE * 2) + 'px';
  buco.style.height = (r.height + MARGINE * 2) + 'px';

  // Il fumetto scende da sotto il pulsante, allineato a sinistra con
  // lui. Se il testo dovesse uscire dallo schermo a destra lo tiriamo
  // indietro: su un telefono stretto succede, e una didascalia tagliata
  // a metà è peggio che non averla.
  const larghezza = fumetto.offsetWidth || 290;
  const sinistra  = Math.min(Math.max(8, r.left - MARGINE), window.innerWidth - larghezza - 8);
  fumetto.style.left = sinistra + 'px';
  fumetto.style.top  = (r.bottom + 10) + 'px';
  return true;
}

// ── ACCENSIONE ─────────────────────────────────────
// Chiamata da novita.js appena si chiude il popup, e da main.js per chi
// il popup l'ha già visto (per esempio dal telefono di ieri). Le due
// chiamate non si pestano i piedi: la seconda trova la chiave già
// scritta, o un popup ancora aperto, e se ne va senza fare niente.
export function mostraCoach() {
  if (!statisticheAttive()) return;                    // prima del 1° settembre non esiste
  if (localStorage.getItem(COACH_KEY)) return;         // già vista su questo dispositivo
  if (document.body.classList.contains('coach-on')) return;  // già accesa adesso

  // Se in questo momento c'è un popup aperto (Novità o Vacanza) aspettiamo:
  // ci ripenserà chiudiNovita() a richiamarci. Due veli sovrapposti sono
  // solo un pasticcio.
  const aperto = id => {
    const el = document.getElementById(id);
    return el && el.classList.contains('show');
  };
  if (aperto('novitaScreen') || aperto('vacanzaScreen') || aperto('menuScreen')) return;

  // Il pulsante sta nell'intestazione, che scorre via con la pagina:
  // torniamo in cima, altrimenti indicheremmo un punto vuoto.
  window.scrollTo({ top: 0, behavior: 'auto' });

  if (!piazza()) return;   // pulsante non visibile: meglio non mostrare niente
  document.body.classList.add('coach-on');

  riposiziona = () => piazza();
  window.addEventListener('resize', riposiziona);
  window.addEventListener('orientationchange', riposiziona);
}

// ── SPEGNIMENTO ────────────────────────────────────
// Da qui non si torna indietro: la chiave viene scritta e la manina non
// si rivede più. È voluto — è un cartello di benvenuto, non un menu.
function spegni() {
  document.body.classList.remove('coach-on');
  try { localStorage.setItem(COACH_KEY, '1'); } catch (e) {}
  if (riposiziona) {
    window.removeEventListener('resize', riposiziona);
    window.removeEventListener('orientationchange', riposiziona);
    riposiziona = null;
  }
}

// Tocco DENTRO al buco: è il "sì". Spegniamo e apriamo il menu noi,
// senza far finta di premere il pulsante vero: meno cose che possono
// andare storte, e funziona identico.
window.coachVaiAlMenu = () => {
  spegni();
  if (typeof window.apriMenu === 'function') window.apriMenu();
};

// Tocco FUORI dal buco: non succede niente, ma va detto. Il fumetto fa
// "no" con la testa e resta lì. La classe si toglie a animazione finita,
// altrimenti la seconda scrollata non ripartirebbe.
window.coachNulla = () => {
  const fumetto = document.getElementById('coachFumetto');
  if (!fumetto) return;
  fumetto.classList.remove('scuoti');
  void fumetto.offsetWidth;            // forza il browser a ricominciare l'animazione
  fumetto.classList.add('scuoti');
  setTimeout(() => fumetto.classList.remove('scuoti'), 500);
};

// Via d'uscita per chi ha una tastiera: sui telefoni non si vede
// nemmeno, ma da computer restare bloccati senza poter premere ESC
// sarebbe una brutta sorpresa.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('coach-on')) spegni();
});

// ── SOLO PER LE PROVE ──────────────────────────────
// Scrivendo coachRiprova() nella console la manina ricompare. Serve a
// riprovarla quante volte si vuole senza andare a cancellare a mano la
// memoria del browser. In mano agli utenti non fa danni: al massimo
// rivedono la didascalia.
window.coachRiprova = () => {
  try { localStorage.removeItem(COACH_KEY); } catch (e) {}
  document.body.classList.remove('coach-on');
  mostraCoach();
};
