// ════════════════════════════════════════════════════════════════
// novita.js — Popup novità, gestione versione/aggiornamenti
// ════════════════════════════════════════════════════════════════

import { NOVITA_RELEASE, NOVITA_KEY } from './config.js';
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
};
