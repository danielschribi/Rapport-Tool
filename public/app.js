// Uhr
function tickClock(){
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  const dd = String(now.getDate()).padStart(2,'0');
  const mo = String(now.getMonth()+1).padStart(2,'0');
  const yyyy = now.getFullYear();
  document.getElementById('clockTime').textContent = `${hh}:${mm}`;
  document.getElementById('clockDate').textContent = `${dd}.${mo}.${yyyy}`;
}
setInterval(tickClock, 1000); tickClock();

// Auth
async function refreshAuth(){
  const r = await fetch('/api/auth/status'); 
  const j = await r.json();
  const avatar = document.getElementById('avatarBtn');
  const btns = document.querySelectorAll('.pill-btn, .home-btn');

  if(!j.loggedIn){
    avatar.classList.add('blink');
    avatar.querySelector('.avatar-badge').textContent = '?';
    btns.forEach(b=>b.disabled = true);
  }else{
    avatar.classList.remove('blink');
    const ini = (j.user?.name || '').split(' ').map(s=>s[0]?.toUpperCase()).join('').slice(0,2) || 'U';
    avatar.querySelector('.avatar-badge').textContent = ini;
    btns.forEach(b=>b.disabled = false);
  }
}
refreshAuth();

// Avatar = Login
document.getElementById('avatarBtn').addEventListener('click', async ()=>{
  const username = prompt('Benutzername ODER "Vorname Nachname":');
  if(!username) return;
  const password = prompt('Passwort:');
  if(password == null) return;
  const r = await fetch('/api/auth/login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ username, password })
  });
  if(!r.ok){ alert('Login fehlgeschlagen'); return; }
  refreshAuth();
});

// Home
document.getElementById('btnHome').addEventListener('click', ()=> location.href = '/');

// Platzhalter-Handler – hier kannst du deine Dialoge öffnen
document.getElementById('btnNew').addEventListener('click', ()=> alert('Dialog „Neue Meldung“ öffnen'));
document.getElementById('btnUsers').addEventListener('click', ()=> alert('Userverwaltung öffnen'));
document.getElementById('btnSystem').addEventListener('click', ()=> alert('Systemliste öffnen'));
document.getElementById('btnReset').addEventListener('click', ()=>{
  document.getElementById('fAnlage').value='';
  document.getElementById('fBereich').value='';
  document.getElementById('fStatus').value='';
  document.getElementById('fMelder').value='';
});
