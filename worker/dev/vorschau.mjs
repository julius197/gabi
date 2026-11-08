// Vorschau der Oberfläche gegen den ECHTEN Gabi-Worker (wie auf gabi.automatilabs.de, aber vom eigenen Rechner):
//   npm run vorschau                  → http://localhost:8788  (Zugangscode wie live)
// Liefert nur die Dateien aus (mit der echten config.js) – die API ist der Live-Worker, der localhost:8788 erlaubt.
// Gut zum Testen eines Branches, bevor er auf main (GitHub Pages) geht. Nur Testdaten verwenden.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PORT = Number(process.env.PORT || 8788);
const TYPEN = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    const pfad = normalize(join(WURZEL, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
    if (!pfad.startsWith(WURZEL) || /[\\/](worker|supabase|tests|screenshots|\.git)([\\/]|$)/.test(pfad.slice(WURZEL.length))) throw Object.assign(new Error(), { code: "ENOENT" });
    const inhalt = await readFile(pfad);
    res.writeHead(200, { "Content-Type": TYPEN[extname(pfad)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(inhalt);
  } catch (e) {
    res.writeHead(e.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(e.code === "ENOENT" ? "Nicht gefunden" : "Fehler");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Gabi-Vorschau: http://localhost:${PORT}  →  echter Worker aus config.js (Zugangscode wie live)`);
  console.log(`Demo ohne Server: http://localhost:${PORT}/?demo=1`);
});
