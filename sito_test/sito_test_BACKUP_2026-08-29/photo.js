// ════════════════════════════════════════════════════════════════
// photo.js — Upload, compressione, anteprima, zoom, eliminazione foto
// ════════════════════════════════════════════════════════════════
// Come sync.js, per evitare una dipendenza circolare con list.js
// (buildPhotoWrap viene usato da list.js, ma dopo un upload/eliminazione
// serve ri-renderizzare la riga, funzione che vive in list.js), questo
// modulo non importa list.js: usa una callback registrata da main.js
// tramite onPhotoChange().

import { firebaseApp, auth, STORAGE_PREFIX } from './config.js';
import { state } from './state.js';
import { showToast } from './utils.js';
import { saveToFirebase } from './sync.js';

let rerenderRow = () => {};
export function onPhotoChange(callback) { rerenderRow = callback; }

// ── MODULO STORAGE: importato una volta sola e riusato ────────────
// Prima veniva ri-importato ad ogni foto; ora il primo import parte
// subito in background (non bloccante) e viene riutilizzato sempre.
let _storageModPromise = null;
function caricaModuloStorage() {
  if (!_storageModPromise) {
    _storageModPromise = import('https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js');
  }
  return _storageModPromise;
}
caricaModuloStorage().catch(() => { _storageModPromise = null; }); // prefetch, ritenta se fallisce

function blobToDataURL(blob) {
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = ev => res(ev.target.result);
    fr.readAsDataURL(blob);
  });
}

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lettura file fallita'));
    reader.onload  = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Immagine non valida'));
      img.onload  = () => {
        const MAX = 800;
        let { width: w, height: h } = img;
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
        else        { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cv.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compressione fallita')), 'image/jpeg', 0.8);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handlePhoto(col, i, e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  if (state.isOffline) { showToast('❌ Foto non disponibile offline'); return; }

  try {
    // 1. Compressione locale (già presente) + anteprima IMMEDIATA:
    //    l'utente vede subito la foto, senza attendere l'upload.
    const blob      = await compressImage(file);
    const anteprima = await blobToDataURL(blob);
    const item      = state.data[col][i];
    item.photo = anteprima;
    rerenderRow(col, i);
    showToast('✅ Foto aggiunta!');

    // 2. Upload in background su Firebase Storage; se non disponibile,
    //    resta il base64 dell'anteprima (stesso fallback di prima).
    let urlFinale = null;
    try {
      const { getStorage, ref: sRef, uploadBytes, getDownloadURL } = await caricaModuloStorage();
      const st  = getStorage(firebaseApp);
      const uid = auth.currentUser.uid;
      const pr  = sRef(st, `${STORAGE_PREFIX}/${state.currentFamilyId}/foto/${uid}_${Date.now()}.jpg`);
      await uploadBytes(pr, blob);
      urlFinale = await getDownloadURL(pr);
    } catch {
      _storageModPromise = null; // se era fallito l'import, ritenta la prossima volta
    }

    // 3. Salvataggio: se nel frattempo la riga è stata eliminata o la foto
    //    cambiata, non tocchiamo niente. L'URL di Storage (leggero) sostituisce
    //    il base64 prima di sincronizzare con Firebase.
    const idx = state.data[col].indexOf(item);
    if (idx < 0 || (item.photo !== anteprima)) return;
    if (urlFinale) item.photo = urlFinale;
    saveToFirebase();
    rerenderRow(col, idx);
  } catch (err) {
    console.error('Photo error:', err);
    showToast('❌ Errore caricamento foto');
  }
}

function onDeletePhoto(col, i) {
  state.data[col][i].photo = null;
  saveToFirebase();
  rerenderRow(col, i);
}

export function buildPhotoWrap(col, i, item) {
  const wrap = document.createElement('div');
  wrap.style.flexShrink = '0';
  if (item.photo) {
    const box = document.createElement('div'); box.className = 'photo-box';
    const img = document.createElement('img'); img.src = item.photo;
    img.onclick = () => openZoom(item.photo);
    const db2 = document.createElement('button'); db2.className = 'photo-del'; db2.textContent = '✕';
    db2.onclick = (ev) => { ev.stopPropagation(); onDeletePhoto(col, i); };
    box.append(img, db2); wrap.appendChild(box);
  } else {
    const label = document.createElement('label');
    const ph = document.createElement('div'); ph.className = 'photo-placeholder';
    ph.innerHTML = '<span>📷</span><span>foto</span>';
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.style.display = 'none';
    fi.onchange = (ev) => handlePhoto(col, i, ev);
    label.append(ph, fi); wrap.appendChild(label);
  }
  return wrap;
}

window.openZoom  = (src) => { document.getElementById('zoomImg').src = src; document.getElementById('zoom').classList.add('show'); };
window.closeZoom = ()    => document.getElementById('zoom').classList.remove('show');
