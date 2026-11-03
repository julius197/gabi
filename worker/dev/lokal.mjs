// Lokaler Modus ohne Konten: Oberfläche + dieselbe API-Logik wie im Worker, Daten nur im Arbeitsspeicher.
//   npm run lokal                     → http://localhost:8788 (Zugangscode: test)
// Optional:
//   ANTHROPIC_API_KEY=…               → echte Strukturierung mit Claude (sonst einfache Demo ohne KI)
//   GABI_WHISPER_CMD="python3 dev/whisper_lokal.py"  → echte Spracherkennung lokal (sonst Demo-Text)
//   GABI_AUDIO_ABLAGE=/pfad           → letzte Aufnahme dort als WAV ablegen (zum Prüfen)
import { createServer } from "node:http";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { erstelleApp } from "../src/app.js";
import { arbeitsspeicher } from "../src/speicher.js";
import { claudeStrukturierung } from "../src/strukturierung.js";
import { WHISPER_PROMPT, bereinigen } from "../src/transkription.js";
import { normalisieren } from "../src/notiz.js";

const WURZEL = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = Number(process.env.PORT || 8788);
const ENV = {
  GABI_ZUGANGSCODE: process.env.GABI_ZUGANGSCODE || "test",
  ERLAUBTE_ORIGINS: `http://localhost:${PORT},http://127.0.0.1:${PORT}`,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  ANTHROPIC_MODELL: process.env.ANTHROPIC_MODELL || "claude-opus-5-5",
  ANTHROPIC_EFFORT: process.env.ANTHROPIC_EFFORT || "low",
  AI: { lokal: true },
};

async function transkribieren(b64) {
  const wav = Buffer.from(b64, "base64");
  if (process.env.GABI_AUDIO_ABLAGE) await writeFile(join(process.env.GABI_AUDIO_ABLAGE, "letzte-aufnahme.wav"), wav);
  if (!process.env.GABI_WHISPER_CMD) {
    return `[Demo ohne Spracherkennung, ${(wav.length / 32000).toFixed(1)} s] Schulter rechts, Flexion bis 120 Grad. Schmerz am Anfang 6, am Ende 3. 20 Minuten manuelle Therapie. Zu Hause Pendelübungen dreimal täglich. Nächstes Mal Kraft testen.`;
  }
  const ordner = await mkdtemp(join(tmpdir(), "gabi-"));
  const datei = join(ordner, "aufnahme.wav");
  try {
    await writeFile(datei, wav);
    const [cmd, ...args] = process.env.GABI_WHISPER_CMD.split(" ");
    const ausgabe = await new Promise((ok, fehler) =>
      execFile(cmd, [...args, datei, WHISPER_PROMPT], { cwd: join(WURZEL, "worker"), maxBuffer: 4e6, env: { ...process.env, HF_HUB_OFFLINE: "1" } }, (e, out) => (e ? fehler(e) : ok(out))),
    );
    return bereinigen(JSON.parse(ausgabe.trim().split("\n").pop()));
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
}

// Einfache Demo-Zuordnung (nur lokal, ohne KI) – damit der Ablauf ohne Schlüssel testbar ist
async function demoStrukturieren(rohtext) {
  const n = { befund: [], massnahmen: [], verlauf: [], hausaufgaben: [], unklar: ["Demo-Modus: ohne KI zugeordnet"] };
  for (const satz of rohtext.replace(/\[[^\]]*\]/g, "").split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean)) {
    const k = satz.toLowerCase();
    if (/zu hause|hausaufgabe|übung.*(täglich|tag)/.test(k)) n.hausaufgaben.push(satz);
    else if (/therapie|minuten|behandelt|massage|lymph|mobilis|gemacht/.test(k)) n.massnahmen.push(satz);
    else if (/nächste|besser|schlechter|verlauf|termin|seit/.test(k)) n.verlauf.push(satz);
    else n.befund.push(satz);
  }
  return normalisieren(n);
}

const speicher = arbeitsspeicher();
await speicher.neuerPatient({ kuerzel: "TP-01", pseudonym: "Testfall Knie rechts (fiktiv)" });
const app = erstelleApp({
  speicher,
  transkribieren,
  strukturieren: ENV.ANTHROPIC_API_KEY ? claudeStrukturierung(ENV) : demoStrukturieren,
});

const TYPEN = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain; charset=utf-8" };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const teile = [];
      for await (const t of req) teile.push(t);
      const body = ["GET", "HEAD", "OPTIONS"].includes(req.method) ? undefined : Buffer.concat(teile);
      const anfrage = new Request(url, { method: req.method, headers: req.headers, body });
      const antwort = await app(anfrage, ENV);
      res.writeHead(antwort.status, Object.fromEntries(antwort.headers));
      res.end(Buffer.from(await antwort.arrayBuffer()));
      console.log(`${req.method} ${url.pathname} -> ${antwort.status}`);
      return;
    }
    if (url.pathname === "/config.js") {
      res.writeHead(200, { "Content-Type": TYPEN[".js"], "Cache-Control": "no-store" });
      res.end('window.GABI_CONFIG = { apiUrl: "" }; // lokaler Modus\n');
      return;
    }
    const pfad = normalize(join(WURZEL, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
    if (!pfad.startsWith(WURZEL) || /[\\/](worker|supabase|tests|\.git)([\\/]|$)/.test(pfad.slice(WURZEL.length))) throw Object.assign(new Error(), { code: "ENOENT" });
    const inhalt = await readFile(pfad);
    res.writeHead(200, { "Content-Type": TYPEN[extname(pfad)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(inhalt);
  } catch (e) {
    res.writeHead(e.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(e.code === "ENOENT" ? "Nicht gefunden" : "Fehler");
    if (e.code !== "ENOENT") console.log(`Fehler: ${e.name}`);
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Gabi lokal: http://localhost:${PORT}  (Zugangscode: ${ENV.GABI_ZUGANGSCODE === "test" ? "test" : "aus GABI_ZUGANGSCODE"})`);
  console.log(`Spracherkennung: ${process.env.GABI_WHISPER_CMD ? "lokal (Whisper)" : "Demo-Text"} · Strukturierung: ${ENV.ANTHROPIC_API_KEY ? `Claude (${ENV.ANTHROPIC_MODELL})` : "Demo ohne KI"}`);
});
