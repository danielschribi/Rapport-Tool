import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import morgan from "morgan";
import cors from "cors";
import multer from "multer";
import sharp from "sharp";
import dotenv from "dotenv";
dotenv.config();

import {
  extractFolderId, getOAuth2Client, getAuthUrl, exchangeCodeForTokens, driveClient,
  ensureStructure, findFileId, readJSON, uploadJSON, updateJSON, uploadBinary
} from "./drive.js";

const app = express();
app.use(morgan("dev"));
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Sessions (für OAuth)
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { sameSite: "lax" }
}));
app.use(passport.initialize());
app.use(passport.session());

/** ---------- LOGIN (Google OAuth) ---------- **/
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

const oauthStrategy = new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    callbackURL: process.env.GOOGLE_REDIRECT_URI || ""
  },
  (accessToken, refreshToken, profile, done) => {
    // wir speichern nur das Nötigste in der Session
    const email = profile.emails?.[0]?.value;
    return done(null, { id: profile.id, email, name: profile.displayName });
  }
);
passport.use(oauthStrategy);

// Zugangsliste aus ENV (optional)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map(s=>s.trim()).filter(Boolean);
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "").split(",").map(s=>s.trim()).filter(Boolean);

// Middleware: nur eingeloggte, erlaubte Nutzer
function requireAuth(req, res, next) {
  if (!req.user?.email) return res.status(401).json({ error: "not authenticated" });
  const email = req.user.email.toLowerCase();
  const allowed = new Set([...ADMIN_EMAILS.map(s=>s.toLowerCase()), ...ALLOWED_EMAILS.map(s=>s.toLowerCase())]);
  if (allowed.size === 0 || allowed.has(email)) return next();
  return res.status(403).json({ error: "forbidden" });
}

/** ---------- Google Drive Boot ---------- **/
const ROOT_ID = extractFolderId(process.env.DATA_BASE_URL);
if (!ROOT_ID) console.warn("WARN: DATA_BASE_URL fehlt oder ungültig. Drive-Funktionen sind deaktiviert.");

let OAUTH2 = null;           // wird pro Request aus Session gesetzt
let DRIVE = null;
let FOLDERS = null;          // { DB, MELD, FOTOS }

async function withDrive(req, res, next) {
  if (!ROOT_ID) return res.status(500).json({ error: "DATA_BASE_URL not configured" });
  if (!req.user) return res.status(401).json({ error: "not authenticated" });

  // pro User-Session brauchen wir Tokens -> in der Session
  if (!req.session.tokens) return res.status(401).json({ error: "no oauth tokens" });

  OAUTH2 = getOAuth2Client();
  OAUTH2.setCredentials(req.session.tokens);
  DRIVE = driveClient(OAUTH2);

  if (!FOLDERS) {
    FOLDERS = await ensureStructure(DRIVE, ROOT_ID);
  }
  next();
}

/** ---------- Routes ---------- **/

// Startseite
app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`
    <h1>Rapport-Tool</h1>
    <p><a href="/auth/google">Login mit Google</a></p>
    <p><a href="/api/ping">/api/ping</a></p>
  `);
});

// ping
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// OAuth Start
app.get("/auth/google", (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

// OAuth Callback
app.get("/auth/google/callback", async (req, res, next) => {
  try {
    if (!req.query.code) return res.status(400).send("Missing code");
    const tokens = await exchangeCodeForTokens(req.query.code);
    req.session.tokens = tokens;
    // Profil holen über passport (nochmals authentifizieren)
    passport.authenticate("google", { failureRedirect: "/" })(req, res, () => {
      res.redirect("/me");
    });
  } catch (e) {
    next(e);
  }
});

// Session-Info
app.get("/me", (req, res) => {
  res.json({ user: req.user || null, tokens: !!req.session.tokens });
});

// Logout
app.post("/logout", (req, res) => {
  req.logout?.(()=>{});
  req.session.destroy(()=> res.json({ ok: true }));
});

/** ---------- DB Endpoints (lesen/schreiben) ---------- **/
app.get("/api/db/all", requireAuth, withDrive, async (_req, res) => {
  const ids = {
    users:       await findFileId(DRIVE, "users.json",       FOLDERS.DB),
    rapporte:    await findFileId(DRIVE, "rapporte.json",    FOLDERS.DB),
    massnahmen:  await findFileId(DRIVE, "massnahmen.json",  FOLDERS.DB),
    meldungenDb: await findFileId(DRIVE, "meldungen.json",   FOLDERS.DB)
  };

  const data = {};
  for (const [key, id] of Object.entries(ids)) {
    data[key] = id ? await readJSON(DRIVE, id) : {};
  }
  res.json(data);
});

// speichern einzelner DB-Dateien: body = { key: "users|rapporte|massnahmen|meldungenDb", data: {...} }
app.post("/api/db/save", requireAuth, withDrive, async (req, res) => {
  const { key, data } = req.body || {};
  const mapName = { users:"users.json", rapporte:"rapporte.json", massnahmen:"massnahmen.json", meldungenDb:"meldungen.json" };
  const name = mapName[key];
  if (!name) return res.status(400).json({ error: "invalid key" });

  const id = await findFileId(DRIVE, name, FOLDERS.DB);
  if (id) await updateJSON(DRIVE, id, data);
  else    await uploadJSON(DRIVE, FOLDERS.DB, name, data);

  res.json({ ok: true });
});

/** ---------- Meldungen (Einzel) ---------- **/
// lesen aller Einzelmeldungen
app.get("/api/meldungen", requireAuth, withDrive, async (_req, res) => {
  const list = await DRIVE.files.list({
    q: `'${FOLDERS.MELD}' in parents and trashed=false`,
    fields: "files(id,name)"
  });
  const out = [];
  for (const f of list.data.files || []) {
    out.push(await readJSON(DRIVE, f.id));
  }
  // sortieren nach id (falls vorhanden)
  out.sort((a,b)=> String(a?.id||"").localeCompare(String(b?.id||"")));
  res.json(out);
});

// speichern/ersetzen einer Einzelmeldung und Spiegel in DB/meldungen.json
app.post("/api/meldungen/save", requireAuth, withDrive, async (req, res) => {
  const obj = req.body || {};
  if (!obj.id) return res.status(400).json({ error: "missing id" });

  const fileName = `${obj.id}.json`;
  const fileId = await findFileId(DRIVE, fileName, FOLDERS.MELD);
  if (fileId) await updateJSON(DRIVE, fileId, obj);
  else        await uploadJSON(DRIVE, FOLDERS.MELD, fileName, obj);

  // Spiegel in DB/meldungen.json aktualisieren
  const meldungenDbId = await findFileId(DRIVE, "meldungen.json", FOLDERS.DB);
  let coll = meldungenDbId ? await readJSON(DRIVE, meldungenDbId) : {};
  if (!Array.isArray(coll?.items)) coll = { items: [] };

  const idx = coll.items.findIndex(x=>x.id === obj.id);
  if (idx >= 0) coll.items[idx] = obj; else coll.items.push(obj);
  coll.items.sort((a,b)=> String(a?.id||"").localeCompare(String(b?.id||"")));

  if (meldungenDbId) await updateJSON(DRIVE, meldungenDbId, coll);
  else               await uploadJSON(DRIVE, FOLDERS.DB, "meldungen.json", coll);

  res.json({ ok: true });
});

/** ---------- Upload Fotos (auto-Resize 600x800 max) ---------- **/
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10*1024*1024 } });

app.post("/api/upload", requireAuth, withDrive, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  const mime = req.file.mimetype || "application/octet-stream";
  let buffer = req.file.buffer;

  // Bilder verkleinern
  if (mime.startsWith("image/")) {
    const img = sharp(buffer).rotate(); // EXIF Drehen
    const meta = await img.metadata();
    const w = meta.width || 0, h = meta.height || 0;

    // max 600 x 800 (ohne hochzuskalieren)
    const MAX_W = 600, MAX_H = 800;
    if (w > MAX_W || h > MAX_H) {
      buffer = await img.resize({ width: MAX_W, height: MAX_H, fit: "inside", withoutEnlargement: true }).toBuffer();
    } else {
      buffer = await img.toBuffer(); // normalisieren
    }
  }

  const safeName = (req.body?.filename || req.file.originalname || "upload.bin").replace(/[^\w.\-]/g, "_");
  const up = await uploadBinary(DRIVE, FOLDERS.FOTOS, safeName, buffer, mime);

  res.json({ ok: true, id: up.id, name: up.name, webViewLink: up.webViewLink, webContentLink: up.webContentLink });
});

/** ---------- Start ---------- **/
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Rapport-Tool listening on", PORT));
