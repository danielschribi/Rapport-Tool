import express from "express";
import morgan from "morgan";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(morgan("dev"));
app.use(cors());
app.use(express.json());

// einfache Startseite
app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`
    <h1>Rapport-Tool</h1>
    <button onclick="fetch('/api/ping').then(r=>r.json()).then(j=>pre.innerText=JSON.stringify(j,null,2))">/api/ping</button>
    <pre id="pre">{ "ok": true }</pre>
  `);
});

// Health & Test
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Render gibt PORT vor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Rapport-Tool listening on port ${PORT}`));
