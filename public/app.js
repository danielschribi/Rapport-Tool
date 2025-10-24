const $ = (sel) => document.querySelector(sel);
const userInfo = $("#userInfo");
const btnLogout = $("#btnLogout");
const btnLogin  = $("#btnLogin");
const btnReload = $("#btnReload");
const btnLoadDb = $("#btnLoadDb");
const tblBody   = $("#tblMeldungen tbody");

async function json(url, opt){
  const r = await fetch(url, opt);
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

async function me(){
  try{
    const m = await json("/me");
    if(m?.user?.email){
      userInfo.innerHTML = `<b>${m.user.name || m.user.email}</b> &middot; ${m.user.email}`;
      btnLogout.hidden = false; btnLogin.hidden = true;
      loadMeldungen();
    }else{
      userInfo.textContent = "Nicht angemeldet.";
      btnLogout.hidden = true; btnLogin.hidden = false;
    }
  }catch(e){
    userInfo.textContent = "Nicht angemeldet.";
  }
}

async function loadMeldungen(){
  try{
    const arr = await json("/api/meldungen");
    tblBody.innerHTML = "";
    for(const it of arr){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${it.id||""}</td><td>${it.titel||""}</td><td>${it.erstelltAm||""}</td>`;
      tblBody.appendChild(tr);
    }
  }catch(e){
    console.error(e);
    alert("Konnte Meldungen nicht laden (angemeldet?)");
  }
}

$("#frmRapport").addEventListener("submit", async (ev)=>{
  ev.preventDefault();
  const id = $("#rId").value.trim();
  const titel = $("#rTitel").value.trim();
  const text = $("#rText").value.trim();
  const datum = $("#rDatum").value || new Date().toISOString().slice(0,10);
  if(!id || !titel){ alert("ID und Titel sind Pflicht."); return; }

  try{
    await json("/api/meldungen/save", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ id, titel, text, erstelltAm: datum })
    });
    $("#frmRapport").reset();
    await loadMeldungen();
    alert("Gespeichert.");
  }catch(e){ alert("Fehler: "+e.message); }
});

$("#frmUpload").addEventListener("submit", async (ev)=>{
  ev.preventDefault();
  const f = $("#fFile").files[0];
  if(!f){ alert("Datei wählen"); return; }
  const fd = new FormData();
  fd.set("file", f);
  const name = $("#fName").value.trim();
  if(name) fd.set("filename", name);

  try{
    const r = await fetch("/api/upload", { method:"POST", body: fd });
    const j = await r.json();
    if(!r.ok) throw new Error(j.error||"Upload fehlgeschlagen");
    $("#uploadResult").innerHTML = `✔️ <a target="_blank" href="${j.webViewLink||j.webContentLink}">${j.name}</a>`;
    $("#frmUpload").reset();
  }catch(e){ alert("Fehler: "+e.message); }
});

btnReload?.addEventListener("click", loadMeldungen);

btnLoadDb?.addEventListener("click", async ()=>{
  try{
    const db = await json("/api/db/all");
    const ul = $("#dbInfo");
    ul.innerHTML = "";
    for(const k of ["users","rapporte","massnahmen","meldungenDb"]){
      const li = document.createElement("li");
      li.textContent = `${k}: ${Array.isArray(db[k]?.items) ? db[k].items.length+" Einträge" : Object.keys(db[k]||{}).length+" Keys"}`;
      ul.appendChild(li);
    }
  }catch(e){ alert("DB konnte nicht geladen werden."); }
});

btnLogout?.addEventListener("click", async ()=>{
  await fetch("/logout", { method: "POST" });
  location.reload();
});

me();
