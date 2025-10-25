import "dotenv/config";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import multer from "multer";
import sharp from "sharp";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "node:url";
import { v4 as uuid } from "uuid";
import { createStorage } from "./storage.js";
import { hash, initials } from "./auth.js";
import { ANLAGE, STATUS, BEREICH } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const limiter = rateLimit({ windowMs: 15*60*1000, limit: 400 });
app.use(limiter);
app.use(helmet());
app.use(express.json({ limit:"5mb" }));
app.use(express.urlencoded({ extended:true }));
app.use(cookieParser(process.env.SESSION_SECRET||"dev"));

const store = await createStorage();
await store.init();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10*1024*1024 } });

function requireAuth(req,res,next){
  const u = req.signedCookies?.user || null;
  if(!u) return res.status(401).json({ ok:false, error:"auth" });
  req.user = u; next();
}

app.get("/api/ping", (req,res)=>res.json({ok:true, backend:(process.env.STORAGE_BACKEND||"local"), meta:store.meta()}));

// --- Auth (simplifiziert, wie beschrieben)
app.post("/auth/login", async (req,res)=>{
  const { user, pass } = req.body||{};
  const users = await store.listUsers();
  const row = users.find(u => [u.benutzer, u.vorname, `${u.vorname} ${u.nachname}`].some(x => String(x).toLowerCase() === String(user||"").toLowerCase()));
  if(!row || row.passhash !== hash(pass)) return res.status(403).json({ ok:false });
  res.cookie("user", { iduser:row.iduser, vorname:row.vorname, nachname:row.nachname, rolle:row.rolle }, { signed:true, httpOnly:true, sameSite:"lax" });
  res.json({ ok:true, me:{...row, passhash:undefined} });
});
app.post("/auth/logout", (req,res)=>{ res.clearCookie("user"); res.json({ok:true}); });
app.get("/auth/me", (req,res)=>{
  const me = req.signedCookies?.user || null;
  res.json({ ok:true, me });
});

// --- Stammdaten/System
app.get("/api/system", requireAuth, async (req,res)=> {
  res.json({ ok:true, anlage:ANLAGE, status:STATUS, bereich:BEREICH });
});

// --- Userverwaltung (Liste)
app.get("/api/users", requireAuth, async (req,res)=>{
  const me = req.signedCookies?.user;
  if(!["Administrator","Superuser","Chef"].includes(me.rolle)) return res.status(403).json({ok:false});
  const list = await store.listUsers();
  res.json({ ok:true, list:list.map(u=>({ ...u, passhash:undefined })) });
});

// --- Meldungen: Listen + Anlegen
function nextMeldungsId(existing){
  // jjmmdd + -xxx
  const d = new Date();
  const pad2 = n=>String(n).padStart(2,"0");
  const head = `${String(d.getFullYear()).slice(-2)}${pad2(d.getMonth()+1)}${pad2(d.getDate())}`;
  const todays = existing.filter(m => m.idmeldung?.startsWith(head));
  const idx = todays.length ? Math.max(...todays.map(m=>Number(m.idmeldung.slice(7))||0))+1 : 0;
  return `${head}-${String(idx).padStart(3,"0")}`;
}

app.get("/api/meldungen", requireAuth, async (req,res)=>{
  const list = await store.listMeldungen();
  list.sort((a,b)=>String(a.idmeldung).localeCompare(String(b.idmeldung)));
  res.json({ ok:true, list });
});

app.post("/api/meldungen", requireAuth, async (req,res)=>{
  const { anlage, bereich, titel, meldung } = req.body||{};
  if(!anlage || !bereich || !titel || !meldung) return res.status(400).json({ok:false});
  const all = await store.listMeldungen();
  const idmeldung = nextMeldungsId(all);
  const d = new Date(); const pad=n=>String(n).padStart(2,"0");
  const datum = `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${String(d.getFullYear()).slice(-2)}`;
  const zeit  = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const me = req.signedCookies.user;

  const row = {
    idmeldung,
    iduser: me.iduser,
    datum, zeit,
    melder: `${me.vorname} ${me.nachname}`,
    email: "-", handy: "-",
    photo1:"", photo2:"", photo3:"",
    anlage, status:"Meldung", bereich, titel, meldung
  };
  all.push(row);
  await store.saveMeldungen(all);

  // „rapporte.json“ flache Übersicht
  const rap = await store.listRapporte();
  rap.push({ idmeldung, anlage, bereich, status:"Meldung", titel, melder: row.melder, datum, zeit });
  await store.saveRapporte(rap);

  res.json({ ok:true, idmeldung, row });
});

// Upload (resize max 600x800)
app.post("/api/meldungen/:id/upload", requireAuth, upload.single("file"), async (req,res)=>{
  const { id } = req.params;
  if(!req.file) return res.status(400).json({ ok:false });

  const filename = `${id}-${uuid().slice(0,8)}.jpg`;
  const out = store.fotoPath(filename);

  // Sharp resize (max 600×800, Seitenverhältnis beibehalten)
  const img = sharp(req.file.buffer).rotate();
  const meta = await img.metadata();
  const target = { width:600, height:800, fit:"inside", withoutEnlargement:true };
  await img.resize(target).jpeg({ quality: 82 }).toFile(out);

  // setze photo1/2/3 Link
  const all = await store.listMeldungen();
  const row = all.find(m=>m.idmeldung===id);
  if(!row) return res.status(404).json({ ok:false });

  const slot = ["photo1","photo2","photo3"].find(k => !row[k]);
  if(!slot) return res.status(400).json({ ok:false, error:"all photo slots taken" });
  row[slot] = `/fotos/${filename}`;
  await store.saveMeldungen(all);

  res.json({ ok:true, file: row[slot] });
});

// Massnahmen
app.get("/api/massnahmen/:id", requireAuth, async (req,res)=>{
  const list = await store.listMassnahmen();
  const mine = list.filter(m=>m.idmeldung===req.params.id);
  mine.sort((a,b)=> String(a.iso).localeCompare(String(b.iso)));
  res.json({ ok:true, list:mine });
});
app.post("/api/massnahmen/:id", requireAuth, upload.single("file"), async (req,res)=>{
  const { id } = req.params;
  const { text } = req.body||{};
  if(!text) return res.status(400).json({ ok:false });

  let link = "";
  if(req.file){
    const filename = `${id}-m-${uuid().slice(0,8)}.jpg`;
    const out = store.fotoPath(filename);
    const img = sharp(req.file.buffer).rotate();
    await img.resize({ width:600, height:800, fit:"inside", withoutEnlargement:true }).jpeg({ quality:82 }).toFile(out);
    link = `/fotos/${filename}`;
  }
  const d = new Date(); const pad=n=>String(n).padStart(2,"0");
  const mdatum = `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${String(d.getFullYear()).slice(-2)}`;
  const mzeit  = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const me = req.signedCookies.user;
  const all = await store.listMassnahmen();
  const row = {
    idmassnahme: uuid(),
    idmeldung: id,
    iduser: me.iduser,
    mdatum, mzeit,
    mbearbeiter: `${me.vorname} ${me.nachname}`,
    email: "-", handy: "-",
    mphoto: link,
    massnahme: text,
    iso: d.toISOString()
  };
  all.push(row); await store.saveMassnahmen(all);
  res.json({ ok:true, row });
});

// Statische Dateien
app.use("/fotos", express.static(path.resolve(__dirname,"..","data","fotos")));
app.use("/", express.static(path.resolve(__dirname,"..","public")));

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=> {
  console.log(`Rapport-Tool listening on ${PORT}`);
});
