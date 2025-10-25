import 'dotenv/config';
import express from 'express';
import cookieSession from 'cookie-session';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { DriveDB } from './src/storage/drive.js';

const app = express();
const upload = multer();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 10000;

/* Sessions */
app.use(cookieSession({
  name: 'sess',
  secret: process.env.SESSION_SECRET || 'devsecret',
  httpOnly: true,
  sameSite: 'lax'
}));

/* Static */
app.use(express.static(path.join(__dirname, 'public')));

/* Helpers */
function requireLogin(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'not-authenticated' });
  next();
}

/* Seed – Admin(3333), User1(1111), User2(2222) */
async function ensureSeedUsers() {
  let users = await DriveDB.getUsers();
  if (!Array.isArray(users)) users = [];
  if (users.length === 0) {
    users = [
      {
        iduser: '1',
        vorname: 'Admin',
        nachname: 'Master',
        strasse: 'Zentrale 1',
        PLZ: '8000',
        ort: 'Zürich',
        email: 'admin@example.com',
        handy: '+41000000000',
        benutzer: 'admin',
        passwort: '3333',
        beruf: 'Leitung',
        arbeitsort: 'Hauptsitz',
        funktion: 'Administrator',
        rolle: 'Administrator'
      },
      {
        iduser: '2',
        vorname: 'User',
        nachname: 'Eins',
        strasse: 'Hauptstrasse 2',
        PLZ: '8001',
        ort: 'Zürich',
        email: 'user1@example.com',
        handy: '+41000000001',
        benutzer: 'user1',
        passwort: '1111',
        beruf: 'Mitarbeiter',
        arbeitsort: 'Betrieb',
        funktion: 'Technik',
        rolle: 'User'
      },
      {
        iduser: '3',
        vorname: 'User',
        nachname: 'Zwei',
        strasse: 'Nebenstrasse 3',
        PLZ: '8002',
        ort: 'Zürich',
        email: 'user2@example.com',
        handy: '+41000000002',
        benutzer: 'user2',
        passwort: '2222',
        beruf: 'Mitarbeiter',
        arbeitsort: 'Betrieb',
        funktion: 'Technik',
        rolle: 'User'
      }
    ];
    await DriveDB.setUsers(users);
    console.log('Seed-Users geschrieben (Drive DB).');
  }
}
ensureSeedUsers();

/* AUTH */
app.get('/api/auth/status', (req, res) => {
  res.json({ loggedIn: !!req.session.user, user: req.session.user || null });
});

app.post('/api/auth/login', express.json(), async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing-credentials' });
  const users = await DriveDB.getUsers();
  const u = users.find(x =>
    x.benutzer?.toLowerCase() === username.toLowerCase() ||
    `${x.vorname} ${x.nachname}`.toLowerCase() === username.toLowerCase()
  );
  if (!u || u.passwort !== password) return res.status(401).json({ error: 'invalid' });
  req.session.user = { id: u.iduser, name: `${u.vorname} ${u.nachname}`, rolle: u.rolle };
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

/* USERS */
app.get('/api/users', requireLogin, async (req, res) => {
  res.json(await DriveDB.getUsers());
});
app.post('/api/users', requireLogin, express.json(), async (req, res) => {
  await DriveDB.setUsers(req.body || []);
  res.json({ ok: true });
});

/* RAPPORT / MASSNAHMEN / MELDUNGEN */
app.get('/api/rapporte', requireLogin, async (req, res) => res.json(await DriveDB.getRapporte()));
app.post('/api/rapporte', requireLogin, express.json(), async (req, res) => { await DriveDB.setRapporte(req.body || []); res.json({ ok: true }); });

app.get('/api/massnahmen', requireLogin, async (req, res) => res.json(await DriveDB.getMassnahmen()));
app.post('/api/massnahmen', requireLogin, express.json(), async (req, res) => { await DriveDB.setMassnahmen(req.body || []); res.json({ ok: true }); });

app.get('/api/meldungen', requireLogin, async (req, res) => res.json(await DriveDB.getMeldungen()));
app.post('/api/meldungen', requireLogin, express.json(), async (req, res) => { await DriveDB.setMeldungen(req.body || []); res.json({ ok: true }); });

/* Einzel-Meldung JSON optional */
app.post('/api/meldung/save', requireLogin, express.json(), async (req, res) => {
  const { idmeldung, data } = req.body || {};
  if (!idmeldung) return res.status(400).json({ error: 'missing-id' });
  await DriveDB.saveMeldungJSON(String(idmeldung), data || {});
  res.json({ ok: true });
});

/* FOTO upload + resize */
app.post('/api/upload', requireLogin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no-file' });
  await DriveDB.saveFoto(req.file.originalname, req.file.buffer);
  res.json({ ok: true });
});

/* Fallback to SPA */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Rapport-Tool listening on ${PORT}`));

