// Gemeinsame Test-Hilfen: App mit Arbeitsspeicher, Aufruf-Helfer, gültige WAV-Aufnahme.
import { vi } from "vitest";
import { erstelleApp } from "../src/app.js";
import { arbeitsspeicher } from "../src/speicher.js";
import { normalisieren } from "../src/notiz.js";

export const CODE = "test-zugang-123";
export const ENV = { GABI_ZUGANGSCODE: CODE, ERLAUBTE_ORIGINS: "https://gabi.automatilabs.de", AI: {} };
/** Kleine gültige WAV-Datei (Stille) als Base64 – so, wie die Oberfläche sie schickt. */
export function wavBase64(bytes = 600) {
  const b = Buffer.alloc(44 + bytes);
  b.write("RIFF", 0); b.writeUInt32LE(36 + bytes, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(bytes, 40);
  return b.toString("base64");
}
export const AUDIO = wavBase64();

export function neueApp(extra = {}) {
  const speicher = arbeitsspeicher();
  const transkribieren = vi.fn(async () => "Knie rechts Flexion bis 90 Grad");
  const strukturieren = vi.fn(async () => normalisieren({ befund: ["Flexion Knie rechts bis 90°"], massnahmen: ["MT 20 min"] }));
  const app = erstelleApp({ speicher, transkribieren, strukturieren, ...extra });
  const rufe = (pfad, { methode = "GET", body, code = CODE, origin, env = ENV, roh, typ, ip } = {}) => {
    const headers = {};
    if (code !== null) headers["X-Gabi-Zugang"] = code;
    if (origin) headers.Origin = origin;
    if (ip) headers["CF-Connecting-IP"] = ip;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (roh !== undefined) headers["Content-Type"] = typ || "text/plain";
    return app(new Request(`https://api.test${pfad}`, { method: methode, headers, body: roh ?? (body === undefined ? undefined : JSON.stringify(body)) }), env);
  };
  return { app, rufe, speicher, transkribieren, strukturieren };
}
