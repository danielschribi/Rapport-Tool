import { google } from 'googleapis';
import { stringify } from 'csv-stringify/sync';
import sharp from 'sharp';

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  GOOGLE_DRIVE_FOLDER_ID,
  GOOGLE_DRIVE_DB_SUBFOLDER = 'DB',
  GOOGLE_DRIVE_MELDUNGEN_SUBFOLDER = 'meldungen',
  GOOGLE_DRIVE_FOTOS_SUBFOLDER = 'fotos',
} = process.env;

function driveClient() {
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

async function ensureSubfolder(drive, parentId, name) {
  const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
  const r = await drive.files.list({ q, fields: 'files(id,name)' });
  if (r.data.files?.length) return r.data.files[0].id;
  const c = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id,name'
  });
  return c.data.id;
}

async function findFileByName(drive, parentId, name) {
  const q = `'${parentId}' in parents and name='${name}' and trashed=false`;
  const r = await drive.files.list({ q, fields: 'files(id,name)' });
  return r.data.files?.[0] || null;
}

async function upsertFile(drive, parentId, name, bodyBuf, mimeType) {
  const existing = await findFileByName(drive, parentId, name);
  if (existing) {
    await drive.files.update({ fileId: existing.id, media: { mimeType, body: bodyBuf } });
  } else {
    await drive.files.create({
      requestBody: { name, parents: [parentId] },
      media: { mimeType, body: bodyBuf }
    });
  }
}

async function readJson(dbName) {
  const drive = driveClient();
  const dbFolder = await ensureSubfolder(drive, GOOGLE_DRIVE_FOLDER_ID, GOOGLE_DRIVE_DB_SUBFOLDER);
  const f = await findFileByName(drive, dbFolder, `${dbName}.json`);
  if (!f) return [];
  const r = await drive.files.get({ fileId: f.id, alt: 'media' }, { responseType: 'arraybuffer' });
  const str = Buffer.from(r.data).toString('utf8');
  return JSON.parse(str || '[]');
}

async function writeJsonAndCsv(dbName, rows) {
  const drive = driveClient();
  const dbFolder = await ensureSubfolder(drive, GOOGLE_DRIVE_FOLDER_ID, GOOGLE_DRIVE_DB_SUBFOLDER);

  const jsonBuf = Buffer.from(JSON.stringify(rows, null, 2));
  await upsertFile(drive, dbFolder, `${dbName}.json`, jsonBuf, 'application/json');

  const flat = Array.isArray(rows) ? rows : Object.values(rows || {});
  const csv = stringify(flat, { header: true });
  await upsertFile(drive, dbFolder, `${dbName}.csv`, Buffer.from(csv, 'utf8'), 'text/csv');
}

export const DriveDB = {
  async getUsers() { return readJson('users'); },
  async setUsers(rows) { await writeJsonAndCsv('users', rows); },

  async getRapporte() { return readJson('rapporte'); },
  async setRapporte(rows) { await writeJsonAndCsv('rapporte', rows); },

  async getMassnahmen() { return readJson('massnahmen'); },
  async setMassnahmen(rows) { await writeJsonAndCsv('massnahmen', rows); },

  async getMeldungen() { return readJson('meldungen'); },
  async setMeldungen(rows) { await writeJsonAndCsv('meldungen', rows); },

  // Einzel-Meldung (optional JSON pro Meldung)
  async saveMeldungJSON(dateiname, obj) {
    const drive = driveClient();
    const sub = await ensureSubfolder(drive, GOOGLE_DRIVE_FOLDER_ID, GOOGLE_DRIVE_MELDUNGEN_SUBFOLDER);
    await upsertFile(
      drive,
      sub,
      `${dateiname}.json`,
      Buffer.from(JSON.stringify(obj, null, 2)),
      'application/json'
    );
  },

  // Foto max 600x800
  async saveFoto(dateiname, buffer) {
    const drive = driveClient();
    const sub = await ensureSubfolder(drive, GOOGLE_DRIVE_FOLDER_ID, GOOGLE_DRIVE_FOTOS_SUBFOLDER);
    const resized = await sharp(buffer)
      .resize(600, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    const name = dateiname.toLowerCase().endsWith('.jpg') ? dateiname : `${dateiname}.jpg`;
    await upsertFile(drive, sub, name, resized, 'image/jpeg');
  }
};

