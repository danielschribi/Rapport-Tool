function fmt(n){return n<10?'0'+n:''+n;}
function tick(){const d=new Date();document.getElementById('clock').textContent=fmt(d.getHours())+':'+fmt(d.getMinutes());document.getElementById('date').textContent=fmt(d.getDate())+'.'+fmt(d.getMonth()+1)+'.'+d.getFullYear();}
setInterval(tick,1000);tick();

const avatarBtn=document.getElementById('avatarBtn'); let authedUser=null;
async function refreshAuthUI(){
  const el=avatarBtn, initials=el.querySelector('.avatar-initials');
  try{const r=await fetch('/api/auth/status',{credentials:'include'}); if(r.ok){const d=await r.json(); authedUser=d.user||null;}}catch(e){}
  if(authedUser){el.classList.add('authed'); el.classList.remove('unknown'); initials.textContent=(authedUser.initials||'OK').toUpperCase();
    document.querySelectorAll('.pill,.home').forEach(b=>b.disabled=false);
  }else{el.classList.add('unknown'); el.classList.remove('authed'); initials.textContent='?';
    document.querySelectorAll('.pill,.home').forEach(b=>b.disabled=true);}
}
refreshAuthUI();

avatarBtn.addEventListener('click',async()=>{
  if(authedUser){try{await fetch('/api/auth/logout',{method:'POST',credentials:'include'});}catch(e){} authedUser=null;}
  else{const u=prompt('Benutzername (z.B. admin):'); const p=u?prompt('Passwort:'):null;
    if(u&&p){try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({username:u,password:p})});
      if(r.ok){authedUser=await r.json();} else alert('Login fehlgeschlagen');}catch(e){alert('Login nicht erreichbar');}}}
  refreshAuthUI();
});

document.getElementById('homeBtn').addEventListener('click',()=>{ location.href='/'; });

const tbody=document.getElementById('tbody');
function addRow(o){const tr=document.createElement('tr'); tr.innerHTML=`<td>${o.id}</td><td>${o.titel}</td><td>${o.anlage}</td><td>${o.bereich}</td><td>${o.status}</td><td>${o.melder}</td><td>${o.datum}</td>`; tbody.appendChild(tr);}
[{id:101,titel:"Prüfung Fangbremse",anlage:"Lift A",bereich:"Antrieb",status:"offen",melder:"M.Meier",datum:"21.10.2025"},
 {id:102,titel:"Ölverlust",anlage:"Lift B",bereich:"Hydraulik",status:"in Arbeit",melder:"P.Müller",datum:"22.10.2025"}].forEach(addRow);
