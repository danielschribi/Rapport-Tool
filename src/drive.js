import { google } from "googleapis";
import fs from "fs/promises";
import path from "path";

const SCOPE = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive"
];

// Folder-ID aus Freigabelink ziehen
export function extractFolderId(dataBaseUrl) {
  // akzeptiert: https://drive.google.com/drive/folders/<ID>?...
  const m = String(dataBaseUrl||"").match(/\/folders\/([^/?#]+)/);
  return m?.[1] || null;
}

export function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  return client;
}

export function getAuthUrl() {
  const o = getOAuth2Client();
  return o.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPE
  });
}

export async function exchangeCodeForTokens(code) {
  const o = getOAuth2Client();
  const { tokens } = await o.getToken(code);
  o.setCredentials(tokens);
  return tokens;
}

export function driveClient(oauth2) {
  return google.drive({ version: "v3", auth: oauth2 });
}

// ---- Struktur sichern ----
export async function ensureStructure(drive, rootFolderId) {
  async function findOrCreateFolder(name, parentId) {
    const q = `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const r = await drive.files.list({ q, fields: "files(id,name)" });
    if (r.data.files?.length) return r.data.files[0].id;
    const c = await drive.files.create({
      requestBody: { name, parents: [parentId], mimeType: "application/vnd.google-apps.folder" },
      fields: "id"
    });
    return c.data.id;
  }

  const DB = await findOrCreateFolder("DB",        rootFolderId);
  const MELD = await findOrCreateFolder("meldungen", rootFolderId);
  const FOTOS = await findOrCreateFolder("fotos",  rootFolderId);

  // Dateien in DB sicherstellen
  const required = ["users.json","rapporte.json","massnahmen.json","meldungen.json"];
  for (const file of required) {
    const id = await findFileId(drive, file, DB);
    if (!id) {
      await uploadJSON(drive, DB, file, {});
    }
  }

  return { DB, MELD, FOTOS };
}

export async function findFileId(drive, name, parentId) {
  const q = `'${parentId}' in parents and name='${name}' and trashed=false`;
  const r = await drive.files.list({ q, fields: "files(id,name)" });
  return r.data.files?.[0]?.id || null;
}

export async function readJSON(drive, fileId) {
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
  const chunks = [];
  await new Promise((resolve, reject) => {
    res.data.on("data", (d) => chunks.push(d));
    res.data.on("end", resolve);
    res.data.on("error", reject);
  });
  const txt = Buffer.concat(chunks).toString("utf8");
  return txt ? JSON.parse(txt) : {};
}

export async function uploadJSON(drive, parentId, name, obj) {
  const media = {
    mimeType: "application/json",
    body: Buffer.from(JSON.stringify(obj, null, 2))
  };
  const r = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media,
    fields: "id,webViewLink,webContentLink,name"
  });
  return r.data;
}

export async function updateJSON(drive, fileId, obj) {
  const media = {
    mimeType: "application/json",
    body: Buffer.from(JSON.stringify(obj, null, 2))
  };
  const r = await drive.files.update({ fileId, media, fields: "id" });
  return r.data;
}

export async function uploadBinary(drive, parentId, name, buffer, mimeType) {
  const media = { mimeType, body: Buffer.from(buffer) };
  const r = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media,
    fields: "id,webViewLink,webContentLink,name"
  });
  return r.data;
}
