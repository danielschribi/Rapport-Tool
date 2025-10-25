const $ = s => document.querySelector(s);
const api = (u, opt={}) => fetch(u, { credentials:"include", ...opt }).then(r=>r.json());

const state = {
  me:null, sys:null, list:[],
  filter:{ anlage:"", bereich:"", status:"", melder:"" }
};

function tick(){
  const d = new Date(), p=n=>String(n).padStart(2,"0");
  $("#clock").textContent = `${p(d.getHours())}:${p(d.getMinutes())}`;
  $("#date").textContent  = `${p(d.getDate())}.${p(d.getMonth()+1)}.${String(d.getFullYear()).slice(-2)}`;
}
setInterval(tick, 1000); tick();

function setButtonsEnabled(on){
  ["#btn-new","#btn-users","#btn-system"].forEach(id=>{
    $(id).disabled = !on;
  });
}

function setAvatar(){
  const av = $("#avatar");
  if(!state.me){
    av.className = "avatar idle";
    av.textContent = "?";
    av.title = "Anmelden";
    setButtonsEnabled(false);
  }else{
    av.className = "avatar ok";
    const ini = (state.me.vorname?.[0]||"") + (state.me.nachname?.[0]||"");
    av.textContent = ini.toUpperCase();
    av.title = `${state.me.vorname} ${state.me.nachname} (${state.me.rolle}) – Abmelden?`;
    setButtonsEnabled(true);
  }
}

async function loadSystem(){
  const r = await api("/api/system");
  if(r.ok){
    state.sys = r;
    for(const [id,arr] of Object.entries({ "#f-anlage":r.anlage, "#f-bereich":r.bereich, "#f-status":r.status })){
      const sel = $(id); sel.innerHTML = `<option value="">alle</option>` + arr.map(x=>`<option>${x}</option>`).join("");
    }
  }
}

function applyFilter(list){
  const f = state.filter;
  return list.filter(r =>
    (!f.anlage || r.anlage===f.anlage) &&
    (!f.bereich|| r.bereich===f.bereich) &&
    (!f.status || r.status===f.status) &&
    (!f.melder || r.melder.toLowerCase().includes(f.melder.toLowerCase()))
  );
}

function renderTable(){
  const tbody = $("#table tbody");
  const rows = applyFilter(state.list);
  tbody.innerHTML = rows.map(r=>`
    <tr data-id="${r.idmeldung}">
      <td>${r.idmeldung}</td>
      <td>${r.titel||""}</td>
      <td>${r.anlage}</td>
      <td>${r.bereich}</td>
      <td>${r.status}</td>
      <td>${r.melder}</td>
      <td>${r.datum} ${r.zeit}</td>
    </tr>
  `).join("");
}

async function loadStart(){
  const r = await api("/api/meldungen");
  if(r.ok){ state.list = r.list; renderTable(); }
}

async function checkMe(){
  const r = await api("/auth/me");
  state.me = r.me || null;
  setAvatar();
  if(state.me) { await loadSystem(); await loadStart(); }
}

// Events
$("#avatar").onclick = async ()=>{
  if(!state.me){
    const user = prompt("Benutzername / Vorname Nachname:");
    const pass = prompt("Passwort:");
    if(!user || !pass) return;
    const r = await api("/auth/login", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ user, pass }) });
    if(r.ok){ state.me=r.me; setAvatar(); await loadSystem(); await loadStart(); }
    else alert("Login fehlgeschlagen");
  }else{
    if(confirm("Abmelden?")){ await api("/auth/logout", { method:"POST" }); state.me=null; setAvatar(); }
  }
};

$("#btn-home").onclick = ()=>{ location.href="/"; };

$("#btn-new").onclick = async ()=>{
  if(!state.me) return;
  const anlage = prompt("Anlage:");
  const bereich = prompt("Bereich:");
  const titel = prompt("Titel (eine Zeile):");
  const meldung = prompt("Detail (mehrzeilig erlaubt, Enter für neue Zeile):");
  if(!anlage || !bereich || !titel || !meldung) return alert("Bitte alle Felder ausfüllen");
  const r = await api("/api/meldungen", { method:"POST", headers:{ "Content-Type":"application/json"}, body:JSON.stringify({ anlage, bereich, titel, meldung }) });
  if(r.ok){
    alert("Gespeichert. Optional Foto hinzufügen…");
    // einfache Upload-Abfrage
    const f = await pickFile();
    if(f){
      const fd = new FormData(); fd.append("file", f);
      await api(`/api/meldungen/${r.idmeldung}/upload`, { method:"POST", body:fd });
    }
    await loadStart();
  }else alert("Fehler beim Speichern");
};

$("#btn-users").onclick = async ()=>{
  if(!state.me) return;
  const r = await api("/api/users");
  if(!r.ok) return alert("Keine Berechtigung");
  const txt = r.list.map(u=>`${u.iduser}\t${u.vorname} ${u.nachname}\t${u.rolle}`).join("\n");
  alert("Userliste:\n\n"+txt);
};
$("#btn-system").onclick = async ()=>{
  if(!state.sys) return;
  alert("Stammdaten bearbeiten – (Demoanzeige)\n\nAnlage:\n"+state.sys.anlage.join(", ")+"\n\nBereich:\n"+state.sys.bereich.join(", ")+"\n\nStatus:\n"+state.sys.status.join(", "));
};

["#f-anlage","#f-bereich","#f-status","#f-melder"].forEach(sel=>{
  const el = $(sel);
  el?.addEventListener("input", ()=>{
    state.filter.anlage = $("#f-anlage").value;
    state.filter.bereich= $("#f-bereich").value;
    state.filter.status = $("#f-status").value;
    state.filter.melder = $("#f-melder").value;
    renderTable();
  });
});
$("#f-reset").onclick = ()=>{
  state.filter = { anlage:"",bereich:"",status:"",melder:"" };
  ["#f-anlage","#f-bereich","#f-status","#f-melder"].forEach(s=>$(s).value="");
  renderTable();
};

async function pickFile(){
  return new Promise(resolve=>{
    const inp = Object.assign(document.createElement("input"), { type:"file", accept:"image/*" });
    inp.onchange = ()=> resolve(inp.files[0]||null);
    inp.click();
  });
}

checkMe();

