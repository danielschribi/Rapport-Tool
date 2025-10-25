import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ANLAGE, STATUS, BEREICH } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const DB_DIR   = path.join(DATA_DIR, "DB");
const FOTOS_DIR= path.join(DATA_DIR, "fotos");

async function ensureLocal() {
  await fs.mkdir(DB_DIR, { recursive: true });
  await fs.mkdir(FOTOS_DIR, { recursive: true });
  const files = ["users.json","rapporte.json","massnahmen.json","meldungen.json"];
  for (const f of files) {
    const p = path.join(DB_DIR, f);
    try { await fs.access(p); } catch { await fs.writeFile(p, f==="users.json"?"[]":"[]"); }
  }
  const readme = path.join(DATA_DIR,"README.txt");
  try { await fs.access(readme); } catch {
    await fs.writeFile(readme, "E-Rapport-Daten – lokale Ablage (Dev/Render Free)\n");
  }
}
function now() {
  const d = new Date();
  const pad = n => String(n).padStart(2,"0");
  return {
    date: `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${String(d.getFullYear()).slice(-2)}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    iso: d.toISOString(),
  };
}

// --- Local JSON backend (default, writable) -------------------------
export class LocalStorage {
  async init() { await ensureLocal(); }

  // DB helpers
  async read(name){ return JSON.parse(await fs.readFile(path.join(DB_DIR, name),"utf8")||"[]"); }
  async write(name, arr){ await fs.writeFile(path.join(DB_DIR,name), JSON.stringify(arr,null,2)); }

  // Users
  async listUsers(){ return this.read("users.json"); }
  async saveUsers(list){ return this.write("users.json", list); }

  // Stammdaten
  async getStammdaten(){ return { anlage: ANLAGE, status: STATUS, bereich: BEREICH }; }

  // Rapport-DB (flache Übersicht)
  async listRapporte(){ return this.read("rapporte.json"); }
  async saveRapporte(list){ return this.write("rapporte.json", list); }

  // Meldungen-DB (Details, 1 Datei für alle – Excel-kompatibel)
  async listMeldungen(){ return this.read("meldungen.json"); }
  async saveMeldungen(list){ return this.write("meldungen.json", list); }

  // Massnahmen-DB
  async listMassnahmen(){ return this.read("massnahmen.json"); }
  async saveMassnahmen(list){ return this.write("massnahmen.json", list); }

  fotoPath(filename){ return path.join(FOTOS_DIR, filename); }

  meta(){ return { backend: "local", root: DATA_DIR, now: now().iso }; }
}

// --- Drive backends (optional, wenn du später umstellst) ------------
import { DriveWritable, DriveReadOnly } from "./drive.js";

export async function createStorage() {
  const mode = (process.env.STORAGE_BACKEND||"local").toLowerCase();
  if (mode === "drive")  return new DriveWritable();
  if (mode === "driveread") return new DriveReadOnly();
  return new LocalStorage();
}
