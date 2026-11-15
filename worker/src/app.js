// Gabi-API: Zugangsschutz, CORS, Rate-Limit, Eingabeprüfung, Routen.
// Abhängigkeiten werden hereingereicht (testbar, lokal ohne Konten).
// Logs: nie Inhalte, Schlüssel, Codes oder IP-Adressen – höchstens die Art eines Fehlers.
import { GRENZEN, erstelleBegrenzer } from "./begrenzer.js";
import { MAX_ROHTEXT, NL, istLeer, kuerzelPruefen, normalisieren, pseudonymPruefen, suchtext, suchwoerter } from "./notiz.js";
import { SpeicherFehler, istUuid } from "./speicher.js";
import { StrukturFehler } from "./strukturierung.js";
import { ChatFehler, MAX_NACHRICHTEN, MAX_ZEICHEN_NACHRICHT, MAX_ZEICHEN_VERLAUF, erstelleWerkzeuge, kiFehler } from "./chat.js";
import { BrainFehler, brainAktionPruefen, brainKontextPruefen, brainPatientenBezug, brainPatientenHinweis, brainVorschlagInhalt } from "./brain.js";
import { BRAIN_ROUTEN, MAX_JSON_STAPEL, brainRoute, istBrainPfad } from "./brain_abruf.js";

export const VERSION = "2.1.0-brain";
export const MAX_AUDIO_BASE64 = 14_000_000; // ≈ 10 MB WAV ≈ 5 Minuten bei 16 kHz mono
const MIN_AUDIO_BASE64 = 200;
const MAX_JSON = 300_000;
const MAX_SUCHE = 200;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const ROUTEN = [
  [/^\/api\/status$/, "GET"],
  [/^\/api\/pruefen$/, "GET"],
  [/^\/api\/transkribieren$/, "POST"],
  [/^\/api\/strukturieren$/, "POST"],
  [/^\/api\/chat$/, "POST"],
  [/^\/api\/patienten$/, "GET, POST"],
  [/^\/api\/notizen$/, "GET, POST"],
  [/^\/api\/notizen\/[^/]+$/, "GET, PATCH, DELETE"],
];
const SICHERHEIT = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

class HttpFehler extends Error {
  constructor(status, meldung, headers = {}) {
    super(meldung);
    this.status = status;
    this.headers = headers;
  }
}

function erlaubteOrigins(env) {
  return String(env.ERLAUBTE_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(origin, env) {
  const h = { Vary: "Origin" };
  if (origin && erlaubteOrigins(env).includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    // PUT brauchen nur die Brain-Routen (Entwurf, Schalter BRAIN_SPEICHER) – ohne Schalter bleibt die Kopfzeile wie bisher
    h["Access-Control-Allow-Methods"] = env.BRAIN_SPEICHER === "supabase" ? "GET, POST, PUT, PATCH, DELETE, OPTIONS" : "GET, POST, PATCH, DELETE, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type, X-Gabi-Zugang";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

function json(daten, status = 200, extra = {}) {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** Vergleich in konstanter Zeit (über die Hashes, damit die Länge nichts verrät). */
async function codeStimmt(ist, soll) {
  const [a, b] = await Promise.all([sha256(ist), sha256(soll)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const zuViele = (warteS, text = "Zu viele Anfragen.") =>
  new HttpFehler(429, `${text} Bitte in ${warteS >= 90 ? `${Math.ceil(warteS / 60)} Minuten` : warteS === 1 ? "1 Sekunde" : `${warteS} Sekunden`} noch einmal versuchen.`, { "Retry-After": String(warteS) });

function laengePruefen(request, max, meldung) {
  const laenge = Number(request.headers.get("Content-Length") || 0);
  if (laenge > max) throw new HttpFehler(413, meldung);
}

function typPruefen(request, erwartet, meldung) {
  const typ = (request.headers.get("Content-Type") || "").toLowerCase();
  if (!typ.startsWith(erwartet)) throw new HttpFehler(415, meldung);
}

async function jsonLesen(request, max = MAX_JSON) {
  typPruefen(request, "application/json", "Bitte als JSON senden.");
  laengePruefen(request, max, "Anfrage zu groß.");
  const text = await request.text();
  if (text.length > max) throw new HttpFehler(413, "Anfrage zu groß.");
  try {
    const daten = JSON.parse(text || "{}");
    if (!daten || typeof daten !== "object" || Array.isArray(daten)) throw new Error();
    return daten;
  } catch {
    throw new HttpFehler(400, "Ungültige Anfrage.");
  }
}

function textFeld(wert, name) {
  if (wert === undefined || wert === null) return "";
  if (typeof wert !== "string") throw new HttpFehler(400, `Ungültige Angabe: ${name}.`);
  return wert;
}

function objektFeld(wert, name) {
  if (wert === undefined || wert === null) return {};
  if (typeof wert !== "object" || Array.isArray(wert)) throw new HttpFehler(400, `Ungültige Angabe: ${name}.`);
  return wert;
}

function rohtextPruefen(roh) {
  const t = textFeld(roh, "rohtext").replace(/\r\n?/g, "\n").trim();
  if (t.length > MAX_ROHTEXT) throw new HttpFehler(413, "Transkript zu lang.");
  return t;
}

/** Prüfung aus brain.js ausführen – ihre Fehler werden zu HTTP-Fehlern (400/413 mit deutschem Satz). */
function brainGeprueft(pruefung) {
  try {
    return pruefung();
  } catch (e) {
    if (e instanceof BrainFehler) throw new HttpFehler(e.status, e.message);
    throw e;
  }
}

/**
 * Gesprächsanfrage prüfen: { nachrichten: [{ rolle: "nutzer" | "gabi", text }], aktion?: { typ, patient_id, art },
 * brainKontext?: { … } }.
 * Ergebnis: Verlauf im Format der Anthropic-API (abwechselnd, beginnt und endet mit der Nutzerin); brain = geprüfter
 * Brain-Kontext (nur bei freien Fragen, sonst null); Aktion „brain_antwort“ (Brain-Interview) kommt ohne Test-Patient.
 */
export function chatAnfrage(daten) {
  const liste = daten.nachrichten;
  if (!Array.isArray(liste) || !liste.length) throw new HttpFehler(400, "Keine Nachricht.");
  if (liste.length > MAX_NACHRICHTEN) throw new HttpFehler(413, "Das Gespräch ist zu lang. Bitte ein neues Gespräch beginnen.");
  const verlauf = [];
  let gesamt = 0;
  let letzteNachricht = ""; // die letzte einzelne Nachricht der Nutzerin (nicht zusammengefasst)
  for (const n of liste) {
    if (!n || typeof n !== "object" || Array.isArray(n) || !["nutzer", "gabi"].includes(n.rolle)) throw new HttpFehler(400, "Ungültige Nachricht.");
    const text = textFeld(n.text, "text").replace(/\r\n?/g, "\n").trim();
    if (text.length > MAX_ZEICHEN_NACHRICHT) throw new HttpFehler(413, "Nachricht zu lang.");
    gesamt += text.length;
    if (!text) continue;
    const role = n.rolle === "nutzer" ? "user" : "assistant";
    if (role === "user") letzteNachricht = text;
    if (!verlauf.length && role === "assistant") continue; // Begrüßung o. Ä. vor der ersten Frage
    const letzte = verlauf[verlauf.length - 1];
    if (letzte && letzte.role === role) letzte.content += `\n\n${text}`;
    else verlauf.push({ role, content: text });
  }
  if (gesamt > MAX_ZEICHEN_VERLAUF) throw new HttpFehler(413, "Das Gespräch ist zu lang. Bitte ein neues Gespräch beginnen.");
  if (!verlauf.length || verlauf[verlauf.length - 1].role !== "user") throw new HttpFehler(400, "Die letzte Nachricht fehlt.");
  let aktion = null;
  const brainAntwort = Boolean(daten.aktion) && typeof daten.aktion === "object" && !Array.isArray(daten.aktion) && daten.aktion.typ === "brain_antwort";
  if (brainAntwort) {
    aktion = brainGeprueft(() => brainAktionPruefen(daten.aktion));
  } else if (daten.aktion !== undefined && daten.aktion !== null) {
    const a = daten.aktion;
    if (typeof a !== "object" || Array.isArray(a) || !["diktat", "bericht"].includes(a.typ)) throw new HttpFehler(400, "Ungültige Aktion.");
    if (!istUuid(a.patient_id)) throw new HttpFehler(400, "Bitte einen Test-Patienten wählen.");
    if (a.typ === "bericht" && !["verlauf", "zusammenfassung"].includes(a.art)) throw new HttpFehler(400, "Ungültige Berichtsart.");
    // Diktat ausdrücklich mitgeschickt: nur dieser Text wird zur Notiz (nie der zusammengefasste Verlauf)
    const text = a.typ === "diktat" ? textFeld(a.text, "text").replace(/\r\n?/g, "\n").trim() : "";
    if (text.length > MAX_ROHTEXT) throw new HttpFehler(413, "Diktat zu lang.");
    aktion = { typ: a.typ, patient_id: a.patient_id, art: a.art, text };
  }
  // Brain-Kontext nur bei freien Fragen – feste Abläufe (Diktat, Bericht, Interview) brauchen ihn nicht
  const brain = !aktion && daten.brainKontext !== undefined && daten.brainKontext !== null ? brainGeprueft(() => brainKontextPruefen(daten.brainKontext)) : null;
  return { verlauf, letzte: letzteNachricht || verlauf[verlauf.length - 1].content, aktion, brain };
}

/** Antwort als NDJSON-Strom: jede Zeile ein Ereignis ({ t: "text" | "status" | … }). Endet mit „fertig“ oder „fehler“. */
function ndjsonAntwort(arbeit) {
  const { readable, writable } = new TransformStream();
  const schreiber = writable.getWriter();
  const kodierer = new TextEncoder();
  const abbruch = new AbortController();
  let offen = true;
  let puls = null;
  const senden = (ereignis) => {
    if (!offen) return;
    schreiber.write(kodierer.encode(`${JSON.stringify(ereignis)}\n`)).catch(() => {
      offen = false;
      abbruch.abort(); // Gegenseite ist weg – KI-Anfrage nicht weiterlaufen lassen
    });
  };
  (async () => {
    // Lebenszeichen alle 15 s, damit lange Werkzeuge (z. B. Bericht) die Verbindung nicht einschlafen lassen
    puls = setInterval(() => senden({ t: "puls" }), 15_000);
    try {
      await arbeit(senden, abbruch.signal);
      senden({ t: "fertig" });
    } catch (e) {
      const f = kiFehler(e);
      if (f instanceof ChatFehler || f instanceof StrukturFehler || f instanceof HttpFehler) senden({ t: "fehler", text: f.message });
      else {
        console.log(`Chat: ${e?.name || "Error"}`); // keine Inhalte loggen
        senden({ t: "fehler", text: "Da ist etwas schiefgegangen. Bitte noch einmal versuchen." });
      }
    } finally {
      clearInterval(puls);
      offen = false;
      schreiber.close().catch(() => {});
    }
  })();
  return new Response(readable, { status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}

/** Aufnahme prüfen: Base64 einer WAV-Datei (das schickt die Oberfläche immer). */
function audioPruefen(b64) {
  if (b64.length > MAX_AUDIO_BASE64) throw new HttpFehler(413, "Aufnahme zu lang (höchstens 5 Minuten am Stück).");
  // Sparsam prüfen (CPU-Zeit im Worker): Länge, Anfang und Ende – Whisper lehnt Unsinn in der Mitte ohnehin ab
  const stichprobe = b64.length > 8192 ? b64.slice(0, 4096) + b64.slice(-4096) : b64;
  if (b64.length < MIN_AUDIO_BASE64 || b64.length % 4 !== 0 || !BASE64.test(stichprobe)) throw new HttpFehler(400, "Keine gültige Aufnahme.");
  let kopf = "";
  try { kopf = atob(b64.slice(0, 16)); } catch { kopf = ""; }
  if (kopf.slice(0, 4) !== "RIFF" || kopf.slice(8, 12) !== "WAVE") throw new HttpFehler(400, "Keine gültige Aufnahme (WAV erwartet).");
}

// Brain (alles optional): brainVorschlagen = Vorschlag aus einer Interview-Antwort ({ knoten, antwort }) → { inhalt };
// brainAbruf = serverseitiger Abruf (frage) → geprüfter Kontext (Schalter BRAIN_QUELLE); brainSpeicher = Ablage in
// Supabase für die Routen /api/brain… (Schalter BRAIN_SPEICHER). Ohne sie verhält sich die API wie bisher.
export function erstelleApp({ speicher, transkribieren, strukturieren, chatten = null, berichten = null, brainVorschlagen = null, brainAbruf = null, brainSpeicher = null, jetzt = () => new Date(), begrenzer = erstelleBegrenzer(), grenzen = GRENZEN }) {
  function begrenzen(schluessel, grenze) {
    const r = begrenzer.treffer(schluessel, grenze);
    if (!r.erlaubt) throw zuViele(r.warteS);
  }

  async function zugangPruefen(request, env, ip) {
    const soll = env.GABI_ZUGANGSCODE || "";
    if (!soll) throw new HttpFehler(503, "Zugangscode ist auf dem Server nicht eingerichtet.");
    const gesperrt = begrenzer.gesperrt(`fehl:${ip}`, grenzen.fehlversuch);
    if (gesperrt) throw zuViele(gesperrt, "Zu viele falsche Zugangscodes.");
    const ist = request.headers.get("X-Gabi-Zugang") || "";
    if (ist.length > 500 || !(await codeStimmt(ist, soll))) {
      begrenzer.treffer(`fehl:${ip}`, grenzen.fehlversuch);
      await new Promise((r) => setTimeout(r, 400)); // Raten bremsen
      throw new HttpFehler(401, "Zugangscode falsch.");
    }
  }

  async function route(request, env, ip) {
    const url = new URL(request.url);
    const pfad = url.pathname.replace(/\/+$/, "") || "/";
    const m = request.method;

    if (pfad === "/api/status" && m === "GET") {
      begrenzen(`status:${ip}`, grenzen.status);
      const datenbank = typeof speicher.bereit === "function" ? speicher.bereit() : true;
      return json({
        ok: true,
        version: VERSION,
        // bereit = Zugangscode und Datenbank eingerichtet; sonst lokal Demo-Modus, auf der echten Adresse eine Hinweisseite
        bereit: Boolean(env.GABI_ZUGANGSCODE) && datenbank,
        // „brain“: dieser Server versteht brainKontext in /api/chat (Quellen, Lücken, Vorschläge)
        funktionen: ["notizen", "chat", "bericht", "brain"],
        brain: { speicher: env.BRAIN_SPEICHER === "supabase" ? "supabase" : "geraet", abruf: brainAbruf ? "server" : "oberflaeche" },
        eingerichtet: {
          zugang: Boolean(env.GABI_ZUGANGSCODE),
          anthropic: Boolean(env.ANTHROPIC_API_KEY),
          supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY),
          spracherkennung: Boolean(env.AI),
        },
      });
    }
    if (!pfad.startsWith("/api/")) throw new HttpFehler(404, "Nicht gefunden.");
    // Brain in Supabase (Entwurf): Routen nur mit Schalter – sonst 404 wie jeder unbekannte Pfad (vor der Zugangsprüfung)
    const brainAn = env.BRAIN_SPEICHER === "supabase" && Boolean(brainSpeicher);
    const bekannt = ROUTEN.find(([muster]) => muster.test(pfad)) || (brainAn ? BRAIN_ROUTEN.find(([muster]) => muster.test(pfad)) : null);
    if (!bekannt) throw new HttpFehler(404, "Nicht gefunden.");
    if (!bekannt[1].split(", ").includes(m)) throw new HttpFehler(405, "Methode nicht erlaubt.", { Allow: bekannt[1] });

    await zugangPruefen(request, env, ip);
    begrenzen(`api:${ip}`, grenzen.api);

    if (pfad === "/api/pruefen") return json({ ok: true });

    if (istBrainPfad(pfad)) {
      const stapel = pfad === "/api/brain/stapel";
      const daten = m === "GET" || (m === "DELETE" && pfad.startsWith("/api/brain/knoten/")) ? {} : await jsonLesen(request, stapel ? MAX_JSON_STAPEL : MAX_JSON);
      const r = await brainRoute(brainSpeicher, { pfad, methode: m, daten });
      return r.status === 204 ? new Response(null, { status: 204 }) : json(r.daten, r.status);
    }

    if (pfad === "/api/transkribieren") {
      typPruefen(request, "text/plain", "Aufnahme bitte als Text (Base64) senden.");
      laengePruefen(request, MAX_AUDIO_BASE64 + 1024, "Aufnahme zu lang (höchstens 5 Minuten am Stück).");
      begrenzen(`transkribieren:${ip}`, grenzen.transkribieren);
      const b64 = (await request.text()).trim();
      audioPruefen(b64);
      let text;
      try {
        text = await transkribieren(b64);
      } catch (e) {
        console.log(`Spracherkennung: ${e?.name || "Error"}`);
        throw new HttpFehler(502, "Spracherkennung gerade nicht erreichbar. Bitte nochmal versuchen.");
      }
      return json({ text: String(text || "") });
    }

    if (pfad === "/api/strukturieren") {
      const { rohtext } = await jsonLesen(request);
      const t = rohtextPruefen(rohtext);
      if (!t) throw new HttpFehler(400, "Kein Text zum Strukturieren.");
      begrenzen(`strukturieren:${ip}`, grenzen.strukturieren);
      return json({ strukturiert: await strukturieren(t) });
    }

    if (pfad === "/api/chat") {
      const anfrage = chatAnfrage(await jsonLesen(request));
      begrenzen(`chat:${ip}`, grenzen.chat);
      // Teure KI-Werkzeuge (Entwurf, Bericht) zählen im selben Limit wie /api/strukturieren
      const teuerErlaubt = () => begrenzer.treffer(`strukturieren:${ip}`, grenzen.strukturieren).erlaubt;
      if (anfrage.aktion && anfrage.aktion.typ === "brain_antwort") {
        // Brain-Interview: aus der Antwort einen Vorschlag für den Eintrag formulieren – als Karte, gespeichert wird nur
        // in der Oberfläche nach „Übernehmen“. Zählt wie ein Entwurf im KI-Limit.
        if (!brainVorschlagen) throw new HttpFehler(503, "Vorschläge fürs Brain sind auf dem Server noch nicht eingerichtet (KI-Schlüssel fehlt).");
        const { knoten, antwort } = anfrage.aktion;
        return ndjsonAntwort(async (senden) => {
          // Nichts über einzelne Test-Patienten ins Brain: Nennt die Antwort (oder der Vorschlag daraus) ein Kürzel aus der
          // Patientenliste, entsteht keine Karte – und die Antwort geht gar nicht erst an die Vorschlags-KI.
          const kuerzel = (await speicher.patienten()).map((p) => p.kuerzel);
          const patient = brainPatientenBezug(antwort, kuerzel);
          if (patient) { senden({ t: "text", d: brainPatientenHinweis(patient) }); return; }
          if (!teuerErlaubt()) throw new StrukturFehler("Gerade zu viele KI-Anfragen. Bitte kurz warten und noch einmal versuchen.");
          senden({ t: "status", text: "Formuliere den Eintrag …" });
          const inhalt = brainVorschlagInhalt(await brainVorschlagen({ knoten, antwort }));
          if (!inhalt) {
            senden({ t: "text", d: "Daraus kann ich noch keinen Eintrag machen. Sag es mir bitte etwas genauer – oder tipp auf „Überspringen“." });
            return;
          }
          const imVorschlag = brainPatientenBezug(inhalt, kuerzel);
          if (imVorschlag) { senden({ t: "text", d: brainPatientenHinweis(imVorschlag) }); return; }
          senden({ t: "brain_vorschlag", vorschlag: { typ: "aendern", id: knoten.id, titel: knoten.titel, inhalt, grund: "interview" } });
          senden({ t: "text", d: "So würde ich es ins Brain schreiben. Passt das? Dann tipp auf „Übernehmen“." });
        });
      }
      // Brain: Kontext aus der Oberfläche – oder (Schalter BRAIN_QUELLE) vom Server selbst aus der Datenbank geholt
      // (Fehler dabei – Datenbank nicht erreichbar o. Ä. – gehen als BrainFehler mit deutschem Satz an die Oberfläche)
      const brain = !anfrage.aktion && brainAbruf ? await brainAbruf(anfrage.letzte) : anfrage.brain;
      const werkzeuge = erstelleWerkzeuge({ speicher, strukturieren, berichten, jetzt, teuerErlaubt, brain });
      const kontext = { letzte: anfrage.letzte };
      if (anfrage.aktion) {
        // Feste Abläufe aus den Schnellaktionen: ohne Umweg über das Gespräch, schnell und vorhersehbar
        const patient = await speicher.patient(anfrage.aktion.patient_id);
        if (!patient) throw new HttpFehler(404, "Test-Patient nicht gefunden.");
        return ndjsonAntwort(async (senden) => {
          if (anfrage.aktion.typ === "diktat") {
            const r = await werkzeuge.ausfuehren("notiz_entwurf_erstellen", { kuerzel: patient.kuerzel }, { letzte: anfrage.aktion.text || anfrage.letzte, senden });
            if (r.fehler && r.technisch) throw new ChatFehler(r.meldung);
            if (r.fehler) { senden({ t: "text", d: r.meldung }); return; } // fachlicher Hinweis: normale Antwort
            const n = r.ergebnis.unklar.length;
            senden({ t: "text", d: `Hier ist dein Entwurf für **${patient.kuerzel}**. Prüf ihn kurz – gespeichert wird erst, wenn du auf „Speichern“ tippst.${n ? ` ${n === 1 ? "Schau dir bitte den Punkt unter „Bitte prüfen“ an." : `Schau dir bitte die ${n} Punkte unter „Bitte prüfen“ an.`}` : ""}` });
            return;
          }
          const r = await werkzeuge.ausfuehren("bericht_erstellen", { kuerzel: patient.kuerzel, art: anfrage.aktion.art }, { ...kontext, senden });
          if (r.fehler && r.technisch) throw new ChatFehler(r.meldung);
          if (r.fehler) { senden({ t: "text", d: r.meldung }); return; }
          const b = r.ergebnis;
          senden({ t: "text", d: `${b.art === "verlauf" ? "Hier ist der Verlaufsbericht" : "Hier ist die Zusammenfassung"} für **${patient.kuerzel}** aus ${b.notizen === 1 ? "einer Notiz" : `${b.notizen} Notizen`}. Du kannst ${b.art === "verlauf" ? "ihn" : "sie"} als PDF speichern.` });
        });
      }
      if (!chatten) throw new HttpFehler(503, "Gabi ist auf dem Server noch nicht eingerichtet (KI-Schlüssel fehlt).");
      return ndjsonAntwort((senden, signal) => chatten({ verlauf: anfrage.verlauf, werkzeuge, kontext, senden, signal, jetzt: jetzt(), brain }));
    }

    if (pfad === "/api/patienten" && m === "GET") return json({ patienten: await speicher.patienten() });

    if (pfad === "/api/patienten" && m === "POST") {
      const daten = await jsonLesen(request);
      const k = kuerzelPruefen(textFeld(daten.kuerzel, "kuerzel"));
      if (k.fehler) throw new HttpFehler(400, k.fehler);
      const p = pseudonymPruefen(textFeld(daten.pseudonym, "pseudonym"));
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
      const q = url.searchParams.get("q") || "";
      if (q.length > MAX_SUCHE) throw new HttpFehler(400, "Suchbegriff zu lang.");
      return json({ notizen: await speicher.notizen({ patientId: patientId || null, woerter: suchwoerter(q) }) });
    }

    if (pfad === "/api/notizen" && m === "POST") {
      const daten = await jsonLesen(request);
      if (!istUuid(daten.patient_id)) throw new HttpFehler(400, "Bitte einen Test-Patienten wählen.");
      const patient = await speicher.patient(daten.patient_id);
      if (!patient) throw new HttpFehler(404, "Test-Patient nicht gefunden.");
      const rohtext = rohtextPruefen(daten.rohtext);
      // v2.5: jede noch markierte „(unklar)“-Stelle gleich ihrem Prüfpunkt zuordnen (sonst wäre „im Text korrigiert“
      // später nicht erkennbar) – die Oberfläche schickt die Zuordnung aus dem Entwurf meist schon mit
      const strukturiert = normalisieren(NL.mitStellen(normalisieren(objektFeld(daten.strukturiert, "strukturiert"))));
      if (istLeer(strukturiert) && !rohtext) throw new HttpFehler(400, "Die Notiz ist leer.");
      const notiz = await speicher.neueNotiz({
        patient_id: patient.id,
        rohtext,
        strukturiert,
        suchtext: suchtext(patient.kuerzel, patient.pseudonym, rohtext, strukturiert),
      });
      return json({ notiz }, 201);
    }

    const id = pfad.split("/").pop();
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
      // v2.5 „Bitte prüfen“: nur ein Häkchen setzen oder entfernen – auf dem gespeicherten Stand, damit zwei Tabs sich
      // nicht gegenseitig Häkchen überschreiben. Der Inhalt bleibt, „bearbeitet“ ändert sich nicht.
      if ("pruefpunkt" in daten) {
        const pp = objektFeld(daten.pruefpunkt, "pruefpunkt");
        if (typeof pp.punkt !== "string" || !pp.punkt || pp.punkt.length > 600 || typeof pp.erledigt !== "boolean") throw new HttpFehler(400, "Ungültige Angabe: pruefpunkt.");
        const jetzt = NL.mitStellen(normalisieren(alt.strukturiert));
        if (!jetzt.unklar.includes(pp.punkt)) throw new HttpFehler(409, "Diesen Prüfpunkt gibt es in der Notiz nicht mehr – bitte neu laden.");
        const notiz = await speicher.notizAendern(id, { strukturiert: normalisieren(NL.setzen(jetzt, pp.punkt, pp.erledigt)) });
        if (!notiz) throw new HttpFehler(404, "Notiz nicht gefunden.");
        return json({ notiz });
      }
      const rohtext = "rohtext" in daten ? rohtextPruefen(daten.rohtext) : alt.rohtext;
      let strukturiert = "strukturiert" in daten ? normalisieren(objektFeld(daten.strukturiert, "strukturiert")) : normalisieren(alt.strukturiert);
      if ("strukturiert" in daten) {
        // Häkchen dreiseitig zusammenführen (zwei Tabs): was dieser Tab geändert hat (gegenüber pruefung_basis), gilt –
        // sonst das Gespeicherte. Ohne pruefung_basis (ältere Oberfläche) bleiben die gespeicherten Häkchen. Die Stellen
        // im Text kommen aus dem alten Stand: so erkennt die Prüfliste, was mit dieser Änderung korrigiert wurde.
        const server = NL.mitStellen(normalisieren(alt.strukturiert));
        const roh = objektFeld(daten.strukturiert, "strukturiert");
        const basis = Array.isArray(daten.pruefung_basis) ? { pruefung: daten.pruefung_basis } : "pruefung" in roh ? { pruefung: [] } : server;
        const lokal = "pruefung" in roh || Array.isArray(daten.pruefung_basis) ? strukturiert : { ...strukturiert, pruefung: server.pruefung };
        const pruefung = NL.zusammenfuehren({ basis, lokal, server });
        strukturiert = normalisieren({ ...strukturiert, pruefung });
      }
      if (istLeer(strukturiert) && !rohtext) throw new HttpFehler(400, "Die Notiz ist leer.");
      const notiz = await speicher.notizAendern(id, {
        rohtext,
        strukturiert,
        suchtext: suchtext(alt.kuerzel, alt.pseudonym, rohtext, strukturiert),
        geaendert_am: new Date().toISOString(),
      });
      return json({ notiz });
    }
    // DELETE
    if (!(await speicher.notizLoeschen(id))) throw new HttpFehler(404, "Notiz nicht gefunden.");
    return new Response(null, { status: 204 });
  }

  return async function handle(request, env) {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);
    const ip = request.headers.get("CF-Connecting-IP") || "unbekannt";
    let antwort;
    if (origin && !cors["Access-Control-Allow-Origin"]) {
      antwort = json({ fehler: "Herkunft nicht erlaubt." }, 403); // nur gabi.automatilabs.de (und localhost zum Testen)
    } else if (request.method === "OPTIONS") {
      antwort = new Response(null, { status: 204 });
    } else {
      try {
        antwort = await route(request, env, ip);
      } catch (e) {
        if (e instanceof HttpFehler) {
          antwort = json({ fehler: e.message }, e.status, e.headers);
        } else if (e instanceof SpeicherFehler || e instanceof BrainFehler) {
          antwort = json({ fehler: e.message }, e.status);
        } else if (e instanceof StrukturFehler || e instanceof ChatFehler) {
          antwort = json({ fehler: e.message }, 502);
        } else {
          console.log(`Fehler: ${e?.name || "Error"}`); // keine Inhalte, keine Schlüssel loggen
          antwort = json({ fehler: "Interner Fehler. Bitte noch einmal versuchen." }, 500);
        }
      }
    }
    for (const [k, v] of Object.entries({ ...SICHERHEIT, ...cors })) antwort.headers.set(k, v);
    return antwort;
  };
}
