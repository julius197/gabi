// Vorschau der Oberfläche gegen den ECHTEN Gabi-Worker (wie auf gabi.automatilabs.de, aber vom eigenen Rechner):
//   npm run vorschau                  → http://localhost:8788  (Zugangscode wie live)
// Liefert nur die Dateien aus (mit der echten config.js) – die API ist der Live-Worker, der localhost:8788 erlaubt.
// Gut zum Testen eines Branches, bevor er auf main (GitHub Pages) geht. Nur Testdaten verwenden.
//
// Brain-Prototyp gegen den STAGING-Worker (nur nach Freigabe von Julius deployt, siehe README „Echten Claude-Weg testen“):
//   GABI_API=https://gabi-api-brain.<konto>.workers.dev npm run brain:staging   → http://localhost:8790, Brain AN
//   GABI_API=<adresse>   überschreibt die API-Adresse in /config.js und erlaubt genau diese Herkunft in der
//                        ausgelieferten index.html (connect-src) – die Dateien im Repo bleiben unverändert
//   GABI_BRAIN=1         meldet brain: true (braucht GABI_API – das Brain wird nie gegen den Live-Worker gestartet)
// Ohne diese Variablen verhält sich die Vorschau genau wie bisher.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = Number(process.env.PORT || 8788);
const BRAIN = process.env.GABI_BRAIN === "1";
const TYPEN = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};

/** Die API-Adresse, die im Repo eingetragen ist (der Live-Worker). */
async function liveApi() {
  const m = /apiUrl:\s*"([^"]*)"/.exec(await readFile(join(WURZEL, "config.js"), "utf8"));
  return m ? m[1].replace(/\/+$/, "") : "";
}

/** GABI_API prüfen: https (oder localhost), nur die Herkunft – und im Brain-Modus nie der Live-Worker. */
async function apiAdresse() {
  const roh = String(process.env.GABI_API || "").trim();
  const live = await liveApi();
  if (!roh) {
    if (BRAIN) throw new Error("GABI_API fehlt. Der Brain-Prototyp startet nie gegen den Live-Worker – bitte die Adresse des Staging-Workers angeben:\n  GABI_API=https://gabi-api-brain.<konto>.workers.dev npm run brain:staging\nOhne Staging-Worker: npm run brain (lokal, ohne Konten).");
    return "";
  }
  let url;
  try { url = new URL(roh); } catch { throw new Error("GABI_API ist keine gültige Adresse (erwartet: https://…workers.dev)."); }
  const lokal = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(lokal && url.protocol === "http:")) throw new Error("GABI_API muss mit https:// beginnen.");
  if (BRAIN && live && url.origin === new URL(live).origin) throw new Error("GABI_API zeigt auf den Live-Worker. Für den Brain-Test bitte den Staging-Worker (gabi-api-brain) angeben.");
  return url.origin;
}

let API = "";
try {
  API = await apiAdresse();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/config.js" && (API || BRAIN)) {
      res.writeHead(200, { "Content-Type": TYPEN[".js"], "Cache-Control": "no-store" });
      res.end(`window.GABI_CONFIG = { apiUrl: ${JSON.stringify(API)}${BRAIN ? ", brain: true" : ""} }; // Vorschau gegen ${API}\n`);
      return;
    }
    const pfad = normalize(join(WURZEL, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
    if (!pfad.startsWith(WURZEL) || /[\\/](worker|supabase|tests|screenshots|\.git)([\\/]|$)/.test(pfad.slice(WURZEL.length))) throw Object.assign(new Error(), { code: "ENOENT" });
    let inhalt = await readFile(pfad);
    // Staging: genau diese eine Herkunft zusätzlich erlauben (nur in der ausgelieferten Seite, nicht in der Datei)
    if (API && extname(pfad) === ".html") inhalt = Buffer.from(inhalt.toString("utf8").replace(/(connect-src[^;"]*)/, `$1 ${API}`));
    res.writeHead(200, { "Content-Type": TYPEN[extname(pfad)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(inhalt);
  } catch (e) {
    res.writeHead(e.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(e.code === "ENOENT" ? "Nicht gefunden" : "Fehler");
  }
}).listen(PORT, "127.0.0.1", () => {
  if (API) {
    console.log(`Gabi-Vorschau: http://localhost:${PORT}  →  Worker ${API}${BRAIN ? " · Brain AN" : ""} (Zugangscode dieses Workers)`);
  } else {
    console.log(`Gabi-Vorschau: http://localhost:${PORT}  →  echter Worker aus config.js (Zugangscode wie live)`);
  }
  console.log(`Demo ohne Server: http://localhost:${PORT}/?demo=1`);
});
