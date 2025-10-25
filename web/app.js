// --- State ---
const state = {
  me: null,
  authed: false
};

// --- Elements ---
const avatarBtn = document.getElementById('avatarBtn');
const homeBtn   = document.getElementById('homeBtn');
const newBtn    = document.getElementById('newBtn');
const usersBtn  = document.getElementById('usersBtn');
const sysBtn    = document.getElementById('sysBtn');
const loginDlg  = document.getElementById('loginDlg');

const startView = document.getElementById('startView');
const meldView  = document.getElementById('meldView');
const usersView = document.getElementById('usersView');
const sysView   = document.getElementById('sysView');

const clockTime = document.getElementById('clockTime');
const clockDate = document.getElementById('clockDate');

const tbody     = document.getElementById('meldungenBody');

// --- Clock ---
function updateClock(){
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  const dd = String(now.getDate()).padStart(2,'0');
  const mo = String(now.getMonth()+1).padStart(2,'0');
  const yy = String(now.getFullYear());
  clockTime.textContent = `${hh}:${mm}`;
  clockDate.textContent = `${dd}.${mo}.${yy}`;
}
updateClock();
setInterval(updateClock, 1000);

// --- Helpers ---
function setAuthUI(){
  const disabled = !state.authed;
  [homeBtn, newBtn, usersBtn, sysBtn].forEach(b => b.disabled = disabled);

  if (state.authed){
    const initials = (state.me?.name || state.me?.email || '?')
      .split(/\s+/).map(s=>s[0]?.toUpperCase()).slice(0,2).join('');
    avatarBtn.classList.remove('avatar--loggedout');
    avatarBtn.classList.add('avatar--ok');
    avatarBtn.innerHTML = `<span class="avatar__mark" style="color:#fff">${initials || 'OK'}</span>`;
    avatarBtn.title = `${state.me?.name || state.me?.email} – abmelden`;
  }else{
    avatarBtn.classList.remove('avatar--ok');
    avatarBtn.classList.add('avatar--loggedout');
    avatarBtn.innerHTML = `<span class="avatar__mark">?</span>`;
    avatarBtn.title = 'Anmelden';
  }
}

function showOnly(view){
  [startView, meldView, usersView, sysView].forEach(v => v.classList.add('hide'));
  view.classList.remove('hide');
}

async function fetchJSON(url, opts){
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// --- Load current user ---
async function loadMe(){
  try{
    const data = await fetchJSON('/api/me');
    state.authed = !!data?.authenticated;
    state.me = data?.user || null;
  }catch{
    state.authed = false; state.me = null;
  }
  setAuthUI();
}

// --- Meldungsliste laden (Startscreen) ---
async function loadMeldungen(){
  tbody.innerHTML = `<tr><td colspan="6" class="muted">Lade Daten…</td></tr>`;
  try{
    const list = await fetchJSON('/api/meldungen');
    // aufsteigend nach idmeldung sortieren
    list.sort((a,b)=>{
      const A = (a.idmeldung ?? '').toString();
      const B = (b.idmeldung ?? '').toString();
      return A.localeCompare(B,'de',{numeric:true});
    });
    if (!list.length){
      tbody.innerHTML = `<tr><td colspan="6" class="muted">Keine Meldungen vorhanden.</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(m=>{
      const dt = m.datum || m.createdAt || '';
      return `<tr>
        <td>${m.idmeldung ?? '-'}</td>
        <td>${escapeHTML(m.titel ?? '')}</td>
        <td>${escapeHTML(dt)}</td>
        <td>${escapeHTML(m.status ?? '')}</td>
        <td>${escapeHTML(m.anlage ?? '')}</td>
        <td>${escapeHTML(m.bereich ?? '')}</td>
      </tr>`;
    }).join('');
  }catch(err){
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Fehler beim Laden: ${escapeHTML(err.message)}</td></tr>`;
  }
}
const escapeHTML = s => (s??'').toString()
  .replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// --- Button actions ---
avatarBtn.addEventListener('click', ()=>{
  if (state.authed){
    // logout? => einfache Abmeldung
    fetch('/api/logout',{method:'POST'}).finally(()=>{
      state.authed=false; state.me=null; setAuthUI(); showOnly(startView); loadMeldungen();
    });
  }else{
    loginDlg.showModal();
  }
});

homeBtn.addEventListener('click', ()=>{
  // „Home/Abbrechen“: offene Views schließen, keine Speicherung
  showOnly(startView);
  loadMeldungen();
});

newBtn.addEventListener('click', ()=>{
  showOnly(meldView);
});

usersBtn.addEventListener('click', ()=>{
  showOnly(usersView);
  // hier könntest du /api/users laden und rendern
});

sysBtn.addEventListener('click', ()=>{
  showOnly(sysView);
  // hier könntest du /api/lookups laden und rendern
});

// --- Init ---
(async function init(){
  await loadMe();
  showOnly(startView);
  loadMeldungen();
})();
