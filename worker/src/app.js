// Gabi-API: Zugangsschutz, CORS, Routen. Abhängigkeiten werden hereingereicht (testbar, lokal ohne Konten).
import { MAX_ROHTEXT, istLeer, kuerzelPruefen, normalisieren, pseudonymPruefen, suchtext, suchwoerter } from "./notiz.js";
import { SpeicherFehler, istUuid } from "./speicher.js";
import { StrukturFehler } from "./strukturierung.js";

export const VERSION = "1.0.0";
const MAX_AUDIO_BASE64 = 14_000_000; // ≈ 10 MB WAV ≈ 5 Minuten bei 16 kHz mono
const MAX_JSON = 300_000;

class HttpFehler extends Error {
  constructor(status, meldung) {
    super(meldung);
    this.status = status;
  }
}

function erlaubteOrigins(env) {
  return String(env.ERLAUBTE_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const h = { Vary: "Origin" };
  if (origin && erlaubteOrigins(env).includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type, X-Gabi-Zugang";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

function json(daten, status = 200, extra = {}) {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** Vergleich in konstanter Zeit (über die Hashes, damit die Länge nichts verrät). */
async function zugangPruefen(request, env) {
  const soll = env.GABI_ZUGANGSCODE || "";
  if (!soll) throw new HttpFehler(503, "Zugangscode ist auf dem Server nicht eingerichtet.");
  const ist = request.headers.get("X-Gabi-Zugang") || "";
  const [a, b] = await Promise.all([sha256(ist), sha256(soll)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) {
    await new Promise((r) => setTimeout(r, 400)); // Raten bremsen
    throw new HttpFehler(401, "Zugangscode falsch.");
  }
}

async function jsonLesen(request) {
  const text = await request.text();
  if (text.length > MAX_JSON) throw new HttpFehler(413, "Anfrage zu groß.");
  try {
    const daten = JSON.parse(text || "{}");
    if (!daten || typeof daten !== "object" || Array.isArray(daten)) throw new Error();
    return daten;
  } catch {
    throw new HttpFehler(400, "Ungültige Anfrage.");
  }
}

function rohtextPruefen(roh) {
  const t = String(roh ?? "").replace(/\r\n?/g, "\n").trim();
  if (t.length > MAX_ROHTEXT) throw new HttpFehler(413, "Transkript zu lang.");
  return t;
}

export function erstelleApp({ speicher, transkribieren, strukturieren }) {
  async function route(request, env) {
    const url = new URL(request.url);
    const pfad = url.pathname.replace(/\/+$/, "") || "/";
    const m = request.method;

    if (pfad === "/api/status" && m === "GET") {
      const datenbank = typeof speicher.bereit === "function" ? speicher.bereit() : true;
      return json({
        ok: true,
        version: VERSION,
        // bereit = Zugangscode und Datenbank eingerichtet; sonst startet die Oberfläche im Demo-Modus
        bereit: Boolean(env.GABI_ZUGANGSCODE) && datenbank,
        eingerichtet: {
          zugang: Boolean(env.GABI_ZUGANGSCODE),
          anthropic: Boolean(env.ANTHROPIC_API_KEY),
          supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY),
          spracherkennung: Boolean(env.AI),
        },
      });
    }
    if (!pfad.startsWith("/api/")) throw new HttpFehler(404, "Nicht gefunden.");

    await zugangPruefen(request, env);

    if (pfad === "/api/pruefen" && m === "GET") return json({ ok: true });

    if (pfad === "/api/transkribieren" && m === "POST") {
      const b64 = (await request.text()).trim();
      if (b64.length > MAX_AUDIO_BASE64) throw new HttpFehler(413, "Aufnahme zu lang (höchstens 5 Minuten am Stück).");
      if (b64.length < 200 || !/^[A-Za-z0-9+/]/.test(b64) || !/[A-Za-z0-9+/=]$/.test(b64)) throw new HttpFehler(400, "Keine gültige Aufnahme.");
      const text = await transkribieren(b64);
      return json({ text });
    }

    if (pfad === "/api/strukturieren" && m === "POST") {
      const { rohtext } = await jsonLesen(request);
      const t = rohtextPruefen(rohtext);
      if (!t) throw new HttpFehler(400, "Kein Text zum Strukturieren.");
      return json({ strukturiert: await strukturieren(t) });
    }

    if (pfad === "/api/patienten" && m === "GET") return json({ patienten: await speicher.patienten() });

    if (pfad === "/api/patienten" && m === "POST") {
      const daten = await jsonLesen(request);
      const k = kuerzelPruefen(daten.kuerzel);
      if (k.fehler) throw new HttpFehler(400, k.fehler);
      const p = pseudonymPruefen(daten.pseudonym);
      if (p.fehler) throw new HttpFehler(400, p.fehler);
      try {
        return json({ patient: await speicher.neuerPatient({ kuerzel: k.kuerzel, pseudonym: p.pseudonym }) }, 201);
      } catch (e) {
        if (e instanceof SpeicherFehler && e.status === 409) throw new HttpFehler(409, `Kürzel ${k.kuerzel} gibt es schon.`);
        throw e;
      }
    }

    if (pfad === "/api/notizen" && m === "GET") {
      const patientId = url.searchParams.get("patient_id") || "";
      if (patientId && !istUuid(patientId)) throw new HttpFehler(400, "Ungültiger Patient.");
      const woerter = suchwoerter(url.searchParams.get("q"));
      return json({ notizen: await speicher.notizen({ patientId: patientId || null, woerter }) });
    }

    if (pfad === "/api/notizen" && m === "POST") {
      const daten = await jsonLesen(request);
      if (!istUuid(daten.patient_id)) throw new HttpFehler(400, "Bitte einen Test-Patienten wählen.");
      const patient = await speicher.patient(daten.patient_id);
      if (!patient) throw new HttpFehler(404, "Test-Patient nicht gefunden.");
      const rohtext = rohtextPruefen(daten.rohtext);
      const strukturiert = normalisieren(daten.strukturiert);
      if (istLeer(strukturiert) && !rohtext) throw new HttpFehler(400, "Die Notiz ist leer.");
      const notiz = await speicher.neueNotiz({
        patient_id: patient.id,
        rohtext,
        strukturiert,
        suchtext: suchtext(patient.kuerzel, patient.pseudonym, rohtext, strukturiert),
      });
      return json({ notiz }, 201);
    }

    const treffer = pfad.match(/^\/api\/notizen\/([^/]+)$/);
    if (treffer) {
      const id = treffer[1];
      if (!istUuid(id)) throw new HttpFehler(400, "Ungültige Notiz.");
      if (m === "GET") {
        const notiz = await speicher.notiz(id);
        if (!notiz) throw new HttpFehler(404, "Notiz nicht gefunden.");
        return json({ notiz });
      }
      if (m === "PATCH") {
        const daten = await jsonLesen(request);
        const alt = await speicher.notiz(id);
        if (!alt) throw new HttpFehler(404, "Notiz nicht gefunden.");
        const rohtext = "rohtext" in daten ? rohtextPruefen(daten.rohtext) : alt.rohtext;
        const strukturiert = "strukturiert" in daten ? normalisieren(daten.strukturiert) : normalisieren(alt.strukturiert);
        if (istLeer(strukturiert) && !rohtext) throw new HttpFehler(400, "Die Notiz ist leer.");
        const notiz = await speicher.notizAendern(id, {
          rohtext,
          strukturiert,
          suchtext: suchtext(alt.kuerzel, alt.pseudonym, rohtext, strukturiert),
          geaendert_am: new Date().toISOString(),
        });
        return json({ notiz });
      }
      if (m === "DELETE") {
        if (!(await speicher.notizLoeschen(id))) throw new HttpFehler(404, "Notiz nicht gefunden.");
        return new Response(null, { status: 204 });
      }
    }

    throw new HttpFehler(404, "Nicht gefunden.");
  }

  return async function handle(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    let antwort;
    try {
      antwort = await route(request, env);
    } catch (e) {
      if (e instanceof HttpFehler || e instanceof SpeicherFehler) {
        antwort = json({ fehler: e.message }, e.status);
      } else if (e instanceof StrukturFehler) {
        antwort = json({ fehler: e.message }, 502);
      } else {
        console.log(`Fehler: ${e?.name || "Error"}`); // keine Inhalte, keine Schlüssel loggen
        antwort = json({ fehler: "Interner Fehler. Bitte noch einmal versuchen." }, 500);
      }
    }
    for (const [k, v] of Object.entries(cors)) antwort.headers.set(k, v);
    return antwort;
  };
}

