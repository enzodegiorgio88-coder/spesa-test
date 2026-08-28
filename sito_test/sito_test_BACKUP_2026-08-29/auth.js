// ════════════════════════════════════════════════════════════════
// auth.js — Login Google/Email, logout, redirect, config utente
// ════════════════════════════════════════════════════════════════

import {
  signInWithPopup, signInWithRedirect, getRedirectResult, signOut,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { ref, get, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { auth, db, provider } from './config.js';
import { state } from './state.js';
import { showToast } from './utils.js';
import { customConfirm } from './modals.js';

// ── CONFIG DA FIREBASE ─────────────────────────────

// Le chiavi Firebase non possono contenere '.' né alcuni altri caratteri.
// Codifica reversibile e leggibile: '.' -> ',' e '@' -> '_at_'.
function emailToKey(email) {
  return email.toLowerCase().replace(/\./g, ',').replace(/@/g, '_at_');
}

// ── MAPPA EMAIL → NOME (fallback locale, usata solo se Firebase non ha
//    ancora un record per questa email in config/utenti_per_email) ────
const NAME_MAP = {
  'vdegiorgio695@gmail.com':    'VINCENZO',
  'degiorfrancesca@gmail.com':  'FRANCESCA',
  'lufrancy100@gmail.com':      'LUCIA',
  'giuliadegiorgio31@gmail.com':'GIULIA',
  'martinadesimone19@gmail.com':'MARTINA',
  'roby.hermy98@gmail.com':     'ROBERTA',
  'caterina.fal28@gmail.com':   'CATERINA',
  'giuliacarr@virgilio.it':     'GIULIA',
  'claudipag@yahoo.it':         'CLAUDIO',
  'giovannalafratta@libero.it': 'GIOVANNA'
};
// ── MAPPA EMAIL → FAMIGLIA PREDEFINITA (stesso scopo: fallback) ────
const FAMILY_MAP = {
  'vdegiorgio695@gmail.com':    'famiglia_degiorgio',
  'degiorfrancesca@gmail.com':  'famiglia_degiorgio',
  'lufrancy100@gmail.com':      'famiglia_degiorgio',
  'giuliadegiorgio31@gmail.com':'famiglia_degiorgio',
  'martinadesimone19@gmail.com':'famiglia_martina',
  'roby.hermy98@gmail.com':     'famiglia_desimone',
  'caterina.fal28@gmail.com':   'famiglia_desimone',
  'giuliacarr@virgilio.it':     'famiglia_desimone',
  'claudipag@yahoo.it':         'famiglia_lafratta',
  'giovannalafratta@libero.it': 'famiglia_lafratta'
};
// ── UTENTI CON PIÙ FAMIGLIE (fallback) ──────────────
const USER_FAMILIES_FALLBACK = {
  'martinadesimone19@gmail.com': [
    { id: 'famiglia_martina',  label: '👤 Solo mia' },
    { id: 'famiglia_desimone', label: '👥 Gruppo ' }
  ]
};

export async function loadUserConfig(user) {
  const email = (user.email || '').toLowerCase();
  try {
    if (email) {
      const snapEmail = await get(ref(db, `config/utenti_per_email/${emailToKey(email)}`));
      if (snapEmail.exists()) return snapEmail.val();
    }
    // Compatibilità: se esiste ancora una vecchia config per uid, usala come fallback.
    const snapUid = await get(ref(db, `config/utenti/${user.uid}`));
    if (snapUid.exists()) return snapUid.val();
  } catch (e) {
    console.warn('Config Firebase non disponibile, uso fallback:', e.message);
  }
  // Nessun record su Firebase: prova la mappa locale prima del fallback generico.
  if (email && FAMILY_MAP[email]) {
    return {
      nome: NAME_MAP[email] || email.split('@')[0].toUpperCase(),
      famiglia: FAMILY_MAP[email],
      famiglie: USER_FAMILIES_FALLBACK[email] || []
    };
  }
  return {
    nome: user.displayName?.split(' ')[0]?.toUpperCase()
       || email.split('@')[0]?.toUpperCase()
       || 'UTENTE',
    famiglia: `famiglia_${user.uid.substring(0, 8)}`,
    famiglie: []
  };
}

export async function saveUserEmailConfig(user, famiglia) {
  const email = (user.email || '').toLowerCase();
  if (!email) return;
  try {
    await set(ref(db, `config/utenti_per_email/${emailToKey(email)}`), {
      nome: state.currentUserName,
      famiglia: famiglia,
      famiglie: state.userFamilies
    });
  } catch { /* non bloccante */ }
}

// ── AUTH ───────────────────────────────────────────

window.loginGoogle = async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const retriable = ['auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request'];
    if (retriable.includes(e.code)) {
      try { localStorage.setItem('pendingLogin', '1'); await signInWithRedirect(auth, provider); }
      catch { showToast('❌ Errore accesso Google'); }
    } else if (e.code !== 'auth/popup-closed-by-user') {
      showToast('❌ ' + e.message);
    }
  }
};

window.showEmailForm = (tipo) => {
  const hints = { virgilio: 'tuaemail@virgilio.it', libero: 'tuaemail@libero.it', yahoo: 'tuaemail@yahoo.it' };
  document.getElementById('loginButtons').style.display = 'none';
  document.getElementById('emailForm').classList.add('show');
  document.getElementById('emailFormTitle').textContent = `Accedi con ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`;
  document.getElementById('email').placeholder = hints[tipo] || 'tuaemail@esempio.it';
  document.getElementById('email').value = '';
  document.getElementById('password').value = '';
  document.getElementById('formError').classList.remove('show');
};

window.hideEmailForm = () => {
  document.getElementById('loginButtons').style.display = 'block';
  document.getElementById('emailForm').classList.remove('show');
  document.getElementById('formError').classList.remove('show');
};

function parseAuthError(e) {
  const map = {
    'auth/email-already-in-use': '❌ Email già registrata',
    'auth/weak-password':        '❌ Password troppo debole (min 6 caratteri)',
    'auth/invalid-email':        '❌ Email non valida',
    'auth/too-many-requests':    '⏱️ Troppi tentativi. Riprova fra poco',
    'auth/wrong-password':       '❌ Password errata',
    'auth/invalid-credential':   '❌ Credenziali non valide',
  };
  return map[e.code] || ('❌ Errore: ' + e.message);
}

function showFormError(msg) {
  const el = document.getElementById('formError');
  el.textContent = msg;
  el.classList.add('show');
}

window.loginEmail = async () => {
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  document.getElementById('formError').classList.remove('show');

  if (!email || !password) { showFormError('⚠️ Inserisci email e password'); return; }
  if (!email.includes('@'))  { showFormError('❌ Email non valida'); return; }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (loginErr) {
    if (['auth/user-not-found', 'auth/invalid-credential'].includes(loginErr.code)) {
      try {
        const res = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(res.user, { displayName: email.split('@')[0].toUpperCase() });
      } catch (createErr) {
        showFormError(parseAuthError(createErr));
      }
    } else {
      showFormError(parseAuthError(loginErr));
    }
  }
};

window.logout = async () => {
  const ok = await customConfirm({
    icon: '👋',
    title: 'Vuoi uscire?',
    message: 'Dovrai accedere di nuovo per rivedere la lista della spesa.',
    okText: 'Esci',
    tema: 'neutro'
  });
  if (!ok) return;
  if (state.dbUnsubscribe) { state.dbUnsubscribe(); state.dbUnsubscribe = null; }
  try {
    await signOut(auth);
  } catch (e) {
    showToast('❌ Errore durante il logout');
  }
};

// ── REDIRECT (fallback di loginGoogle quando il popup non è disponibile) ──

export async function handleRedirect() {
  try { await getRedirectResult(auth); }
  catch (e) {
    localStorage.removeItem('pendingLogin');
    if (e.code && e.code !== 'auth/no-current-user') showToast('❌ Errore accesso: ' + e.message);
  }
}
