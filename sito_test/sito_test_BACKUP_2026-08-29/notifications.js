// ════════════════════════════════════════════════════════════════
// notifications.js — OneSignal, notifiche push
// ════════════════════════════════════════════════════════════════
// L'inizializzazione della coda OneSignalDeferred resta nello script
// inline in <head> di index.html (deve restare sincrona ed eseguire
// prima dello script esterno OneSignal, si veda config.js per i dettagli).
// Questo modulo gestisce invece il permesso di notifica, l'invio delle
// notifiche "urgente" e la registrazione del service worker.

import { ONESIGNAL_APP_ID } from './config.js';

export async function initNotifiche() {
  if (!window.OneSignal) return;
  try { await OneSignal.Notifications.requestPermission(); }
  catch { /* push notifications sono opzionali */ }
}

export async function inviaNotificaUrgente(nomeArticolo, nomeUtente) {
  try {
    await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        included_segments: ['Total Subscriptions'],
        headings: { it: '🛒 Spesa Famiglia' },
        contents: { it: `🔴 ${nomeUtente} ha segnato "${nomeArticolo}" come urgente!` },
        url: window.location.href
      })
    });
  } catch { /* notifiche best-effort */ }
}

export async function registraServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const swContent = `importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');`;
    const blob   = new Blob([swContent], { type: 'application/javascript' });
    const swUrl  = URL.createObjectURL(blob);
    await navigator.serviceWorker.register(swUrl, { scope: '/' });
  } catch { /* service worker opzionale */ }
}
