// Entwurf „Brain in Supabase“ (Schalter BRAIN_SPEICHER / BRAIN_QUELLE, beide Standard AUS): Ablage über den Worker
// (rev-Prüfung, Verlauf, Nutzung, Stapel), Routen /api/brain…, Zusammenspiel mit apiAblage() der Oberfläche und der
// serverseitige Abruf mit derselben Suche wie im Browser. PostgREST ist hier nachgebaut – es geht keine Anfrage hinaus.
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CODE, ENV, neueApp } from "./hilfen.js";
import { BrainFehler } from "../src/brain.js";
import { BRAIN_ROUTEN, SPEICHER_GRENZEN, brainKontextAusSpeicher, brainRoute, istBrainPfad, kantePruefen, knotenPruefen, lueckePruefen, supabaseBrain, versionPruefen } from "../src/brain_abruf.js";

const require = createRequire(import.meta.url);
const laden = (datei) => { try { return require(`../../${datei}`); } catch { return null; } };
const SUCHE = laden("brain-suche.js"); //       Hauptsitzung
const SPEICHER = laden("brain-speicher.js"); // Fork C: apiAblage()

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const DB_ENV = { SUPABASE_URL: "https://db.test", SUPABASE_SECRET_KEY: "sb_secret_test" };
const ENV_AN = { ...ENV, ...DB_ENV, BRAIN_SPEICHER: "supabase" };
const T0 = Date.UTC(2026, 10, 8, 10, 0, 0);

const knoten = (id, extra = {}) => ({
  id, art: "praxiswissen", titel: `Eintrag ${id}`, inhalt: "Inhalt", tags: ["praxis"], status: "bestaetigt", quelle: "physio-works.de",
  erstellt: T0, geaendert: T0, geschuetzt: false, rev: 1, geloescht: 0, ...extra,
});
const version = (extra = {}) => ({ zeit: T0, grund: "bearbeitet", art: "praxiswissen", titel: "Alt", inhalt: "Alter Inhalt", tags: [], status: "entwurf", quelle: "Philipp", ...extra });

/** PostgREST nachgebaut: Tabellen im Arbeitsspeicher, Filter eq/in/lte, Upsert, eindeutiger Titel, Zähl-Funktion. */
function falschesPostgrest() {
  const tabellen = { brain_nodes: [], brain_edges: [], brain_versions: [], brain_gaps: [], brain_meta: [] };
  const SCHLUESSEL = { brain_nodes: ["id"], brain_edges: ["id"], brain_versions: ["knoten_id", "nr"], brain_gaps: ["id"], brain_meta: ["schluessel"] };
  const VORGABE = { brain_nodes: { nutzung_anzahl: 0, nutzung_zuletzt: null, geloescht_am: null, seed: null } };
  const anfragen = [];
  const antwort = (daten, status = 200) => new Response(daten === null ? null : JSON.stringify(daten), { status, headers: { "content-type": "application/json" } });
  const doppelt = (index) => antwort({ code: "23505", message: `duplicate key value violates unique constraint "${index}"`, details: "Key already exists." }, 409);
  const gleicherSchluessel = (t, a, b) => SCHLUESSEL[t].every((s) => String(a[s]) === String(b[s]));
  const titelDoppelt = () => {
    const aktive = tabellen.brain_nodes.filter((z) => !z.geloescht_am).map((z) => z.titel.toLowerCase());
    return new Set(aktive).size !== aktive.length;
  };
  function passend(tabelle, params) {
    let zeilen = [...tabellen[tabelle]];
    for (const [feld, bedingung] of params) {
      if (["select", "order", "limit", "on_conflict"].includes(feld)) continue;
      const [op, ...rest] = bedingung.split(".");
      const wert = rest.join(".");
      if (op === "eq") zeilen = zeilen.filter((z) => String(z[feld]) === wert);
      else if (op === "in") { const menge = wert.slice(1, -1).split(","); zeilen = zeilen.filter((z) => menge.includes(String(z[feld]))); }
      else if (op === "lte") zeilen = zeilen.filter((z) => Number(z[feld]) <= Number(wert));
      else throw new Error(`Filter ${op} ist im Nachbau nicht vorgesehen`);
    }
    const order = params.get("order");
    if (order) {
      const [feld, richtung] = order.split(".");
      zeilen.sort((a, b) => (a[feld] < b[feld] ? -1 : a[feld] > b[feld] ? 1 : 0) * (richtung === "desc" ? -1 : 1));
    }
    const limit = Number(params.get("limit") || 0);
    return limit ? zeilen.slice(0, limit) : zeilen;
  }
  const fetchMock = vi.fn(async (adresse, init = {}) => {
    const url = new URL(adresse);
    const methode = init.method || "GET";
    const kopf = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : undefined;
    const pfad = url.pathname.replace("/rest/v1/", "");
    anfragen.push({ methode, pfad, suche: url.search, body, prefer: kopf.get("Prefer") || "", apikey: kopf.get("apikey") });
    if (kopf.get("apikey") !== DB_ENV.SUPABASE_SECRET_KEY) return antwort({ message: "kein Schlüssel" }, 401);
    const zurueck = (zeilen, status = 200) => ((kopf.get("Prefer") || "").includes("return=representation") ? antwort(zeilen, status) : new Response(null, { status: status === 200 ? 204 : status }));
    if (pfad === "rpc/brain_nutzung_zaehlen") {
      const treffer = tabellen.brain_nodes.filter((z) => body.p_ids.includes(z.id) && !z.geloescht_am);
      for (const z of treffer) { z.nutzung_anzahl += 1; z.nutzung_zuletzt = !z.nutzung_zuletzt || z.nutzung_zuletzt < body.p_zeit ? body.p_zeit : z.nutzung_zuletzt; }
      return antwort(treffer.map((z) => ({ id: z.id, nutzung_anzahl: z.nutzung_anzahl, nutzung_zuletzt: z.nutzung_zuletzt })));
    }
    if (!tabellen[pfad]) return antwort({ message: "unbekannte Tabelle" }, 404);
    if (methode === "GET") return antwort(passend(pfad, url.searchParams));
    if (methode === "POST") {
      const zeilen = (Array.isArray(body) ? body : [body]).map((z) => ({ ...(VORGABE[pfad] || {}), ...z }));
      const mischen = (kopf.get("Prefer") || "").includes("resolution=merge-duplicates");
      const vorher = JSON.stringify(tabellen[pfad]);
      for (const z of zeilen) {
        const alt = tabellen[pfad].find((x) => gleicherSchluessel(pfad, x, z));
        if (alt && !mischen) { tabellen[pfad] = JSON.parse(vorher); return doppelt(`${pfad}_pkey`); }
        if (alt) Object.assign(alt, Object.fromEntries(Object.entries(z).filter(([k]) => !(pfad === "brain_nodes" && k.startsWith("nutzung_") && !(k in (Array.isArray(body) ? body[0] : body))))));
        else tabellen[pfad].push(z);
      }
      if (pfad === "brain_nodes" && titelDoppelt()) { tabellen[pfad] = JSON.parse(vorher); return doppelt("brain_nodes_titel_eindeutig"); }
      return zurueck(zeilen, 201);
    }
    if (methode === "PATCH") {
      const vorher = JSON.stringify(tabellen[pfad]);
      const treffer = passend(pfad, url.searchParams);
      for (const z of treffer) Object.assign(tabellen[pfad].find((x) => gleicherSchluessel(pfad, x, z)), body);
      if (pfad === "brain_nodes" && titelDoppelt()) { tabellen[pfad] = JSON.parse(vorher); return doppelt("brain_nodes_titel_eindeutig"); }
      return zurueck(passend(pfad, new URLSearchParams([...url.searchParams].filter(([k]) => k !== "rev"))).filter((z) => treffer.some((t) => gleicherSchluessel(pfad, t, z))));
    }
    if (methode === "DELETE") {
      const treffer = passend(pfad, url.searchParams);
      tabellen[pfad] = tabellen[pfad].filter((z) => !treffer.some((t) => gleicherSchluessel(pfad, t, z)));
      if (pfad === "brain_nodes") tabellen.brain_versions = tabellen.brain_versions.filter((v) => !treffer.some((t) => t.id === v.knoten_id)); // Fremdschlüssel: on delete cascade
      return zurueck(treffer);
    }
    return antwort({ message: "Methode" }, 405);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { tabellen, anfragen, fetchMock };
}

/** App mit eingeschaltetem Brain-Speicher (wie index.js mit BRAIN_SPEICHER = "supabase"). */
function brainApp(extra = {}) {
  const db = falschesPostgrest();
  const { rufe, ...rest } = neueApp({ brainSpeicher: supabaseBrain(ENV_AN), ...extra });
  const ruf = (pfad, o = {}) => rufe(pfad, { env: ENV_AN, ...o });
  return { ...rest, ...db, ruf };
}
const json = async (r) => (r.status === 204 ? null : r.json());

// ---------- Schalter ----------
describe("Schalter BRAIN_SPEICHER: ohne ihn gibt es die Routen nicht", () => {
  it("AUS (Standard): 404 wie jeder unbekannte Pfad, auch wenn die Ablage verdrahtet ist – nichts geht an die Datenbank", async () => {
    const db = falschesPostgrest();
    const { rufe } = neueApp({ brainSpeicher: supabaseBrain({ ...ENV, ...DB_ENV }) });
    for (const pfad of ["/api/brain", "/api/brain/stapel", "/api/brain/knoten/s-kontakt"]) {
      expect((await rufe(pfad)).status, pfad).toBe(404);
      expect((await rufe(pfad, { code: null })).status, pfad).toBe(404);
    }
    expect((await rufe("/api/brain", { env: { ...ENV, ...DB_ENV, BRAIN_SPEICHER: "an" } })).status).toBe(404); // nur genau „supabase“
    expect(db.fetchMock).not.toHaveBeenCalled();
    expect(BRAIN_ROUTEN.map(([, methoden]) => methoden)).toEqual(["GET", "PUT, DELETE", "GET", "POST", "PUT, DELETE", "PUT, DELETE", "POST", "PUT"]);
    expect(istBrainPfad("/api/brain")).toBe(true);
    expect(istBrainPfad("/api/brain/knoten/x")).toBe(true);
    expect(istBrainPfad("/api/brainstorm")).toBe(false);
  });

  it("AN: Zugangscode, Methode und CORS wie bei allen Routen; PUT ist dann erlaubt", async () => {
    const { ruf, fetchMock } = brainApp();
    expect((await ruf("/api/brain", { code: null })).status).toBe(401);
    expect((await ruf("/api/brain", { code: "falsch" })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    const falsch = await ruf("/api/brain", { methode: "POST", body: {} });
    expect(falsch.status).toBe(405);
    expect(falsch.headers.get("Allow")).toBe("GET");
    expect((await ruf("/api/brain/unbekannt")).status).toBe(404);
    expect((await ruf("/api/brain/kanten", { methode: "PUT", roh: "{}", typ: "text/plain" })).status).toBe(415);
    const vorab = await ruf("/api/brain/knoten/s-kontakt", { methode: "OPTIONS", origin: "https://gabi.automatilabs.de", code: null });
    expect(vorab.status).toBe(204);
    expect(vorab.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, PATCH, DELETE, OPTIONS");
    const status = await (await ruf("/api/status", { code: null })).json();
    expect(status.brain).toEqual({ speicher: "supabase", abruf: "oberflaeche" });
    // ohne Datenbank-Zugang: verständlicher Fehler, kein Absturz
    const ohne = neueApp({ brainSpeicher: supabaseBrain(ENV) });
    const r = await ohne.rufe("/api/brain", { env: { ...ENV, BRAIN_SPEICHER: "supabase" } });
    expect(r.status).toBe(503);
    expect((await r.json()).fehler).toBe("Die Datenbank für das Brain ist nicht eingerichtet.");
  });
});

// ---------- Knoten ----------
describe("Knoten schreiben: gegen den gespeicherten Stand geprüft (wie im Browser)", () => {
  it("neu → rev 1; noch einmal „neu“ → Konflikt mit dem aktuellen Stand; laden liefert die Formen der Oberfläche", async () => {
    const { ruf, tabellen } = brainApp();
    const k = knoten("s-kontakt", { titel: "Kontakt", inhalt: "Telefon: +49 911 23 99 823", seed: "kontakt", rev: 9 });
    const r = await ruf("/api/brain/knoten/s-kontakt", { methode: "PUT", body: { knoten: k, neu: true } });
    expect(r.status).toBe(200);
    expect((await r.json()).knoten).toEqual({ ...k, rev: 1 });
    expect(tabellen.brain_nodes[0]).toMatchObject({ id: "s-kontakt", rev: 1, erstellt_am: new Date(T0).toISOString(), geloescht_am: null, seed: "kontakt", nutzung_anzahl: 0 });
    const nochmal = await ruf("/api/brain/knoten/s-kontakt", { methode: "PUT", body: { knoten: { ...k, inhalt: "anders" }, neu: true } });
    expect(nochmal.status).toBe(409);
    expect(await nochmal.json()).toEqual({ konflikt: true, aktuell: { ...k, rev: 1 }, fehler: "Dieser Eintrag wurde inzwischen woanders geändert." });
    const alles = await json(await ruf("/api/brain"));
    expect(alles).toEqual({ knoten: [{ ...k, rev: 1 }], kanten: [], luecken: [], nutzung: [], meta: {} });
  });

  it("erwartet: passt die gespeicherte rev, zählt sie hoch und der alte Stand kommt in den Verlauf – sonst Konflikt, nichts geschrieben", async () => {
    const { ruf, tabellen } = brainApp();
    const k = knoten("s-kontakt", { titel: "Kontakt" });
    await ruf("/api/brain/knoten/s-kontakt", { methode: "PUT", body: { knoten: k, neu: true } });
    const gut = await json(await ruf("/api/brain/knoten/s-kontakt", { methode: "PUT", body: { knoten: { ...k, inhalt: "Neu", geaendert: T0 + 1000 }, erwartet: 1, version: version() } }));
    expect(gut.knoten).toMatchObject({ rev: 2, inhalt: "Neu", geaendert: T0 + 1000 });
    expect(tabellen.brain_versions).toEqual([expect.objectContaining({ knoten_id: "s-kontakt", nr: 1, grund: "bearbeitet", titel: "Alt", inhalt: "Alter Inhalt" })]);
    // veraltetes Gerät (kennt noch rev 1): Konflikt, der gespeicherte Stand bleibt
    const alt = await ruf("/api/brain/knoten/s-kontakt", { methode: "PUT", body: { knoten: { ...k, inhalt: "Überschreiben" }, erwartet: 1, version: version() } });
    expect(alt.status).toBe(409);
    expect((await alt.json()).aktuell).toMatchObject({ rev: 2, inhalt: "Neu" });
    expect(tabellen.brain_nodes[0]).toMatchObject({ rev: 2, inhalt: "Neu" });
    expect(tabellen.brain_versions).toHaveLength(1); // kein Verlaufseintrag für die abgelehnte Änderung
    // anderswo endgültig entfernt: nicht wieder anlegen
    const weg = await ruf("/api/brain/knoten/s-anders", { methode: "PUT", body: { knoten: knoten("s-anders"), erwartet: 3 } });
    expect(await weg.json()).toMatchObject({ konflikt: true, aktuell: null });
    expect(tabellen.brain_nodes).toHaveLength(1);
    // ohne „erwartet“: einfach der nächste Stand (rev + 1) bzw. neu anlegen
    expect((await json(await ruf("/api/brain/knoten/s-kontakt", { methode: "PUT", body: { knoten: { ...k, inhalt: "Ohne Prüfung" } } }))).knoten.rev).toBe(3);
    expect((await json(await ruf("/api/brain/knoten/s-neu1", { methode: "PUT", body: { knoten: knoten("s-neu1") } }))).knoten.rev).toBe(1);
  });

  it("zwei Geräte gleichzeitig: nur eines gewinnt – das zweite UPDATE trifft die alte rev nicht mehr", async () => {
    const { tabellen } = brainApp();
    const ablage = supabaseBrain(ENV_AN);
    await ablage.knotenSchreiben(knoten("s-kontakt", { titel: "Kontakt" }), { neu: true });
    const [a, b] = await Promise.all([
      ablage.knotenSchreiben(knoten("s-kontakt", { titel: "Kontakt", inhalt: "Gerät A" }), { erwartet: 1 }),
      ablage.knotenSchreiben(knoten("s-kontakt", { titel: "Kontakt", inhalt: "Gerät B" }), { erwartet: 1 }),
    ]);
    expect([a, b].filter((r) => r.ok)).toHaveLength(1);
    const verlierer = [a, b].find((r) => r.konflikt);
    expect(verlierer.aktuell).toMatchObject({ rev: 2 });
    expect(tabellen.brain_nodes[0].rev).toBe(2);
    expect(["Gerät A", "Gerät B"]).toContain(tabellen.brain_nodes[0].inhalt);
  });

  it("Verlauf: Nummern laufen weiter, behalten werden die letzten 20; Nutzung bleibt beim Schreiben erhalten", async () => {
    const { ruf, tabellen } = brainApp();
    const ablage = supabaseBrain(ENV_AN);
    await ablage.knotenSchreiben(knoten("s-kontakt", { titel: "Kontakt" }), { neu: true });
    await ablage.nutzungZaehlen(["s-kontakt"], T0 + 5);
    for (let i = 1; i <= 23; i++) await ablage.knotenSchreiben(knoten("s-kontakt", { titel: "Kontakt", inhalt: `Stand ${i}` }), { erwartet: i, version: version({ inhalt: `vor ${i}`, zeit: T0 + i }) });
    expect(tabellen.brain_nodes[0]).toMatchObject({ rev: 24, nutzung_anzahl: 1 }); // der Zähler wurde nie überschrieben
    const verlauf = (await json(await ruf("/api/brain/knoten/s-kontakt/verlauf"))).versionen;
    expect(verlauf).toHaveLength(20);
    expect(verlauf.map((v) => v.nr)).toEqual(Array.from({ length: 20 }, (_, i) => i + 4)); // 4 … 23, älteste zuerst
    expect(verlauf[0]).toEqual({ nr: 4, zeit: T0 + 4, grund: "bearbeitet", art: "praxiswissen", titel: "Alt", inhalt: "vor 4", tags: [], status: "entwurf", quelle: "Philipp" });
    expect(SPEICHER_GRENZEN.versionen).toBe(20);
  });

  it("endgültig entfernen: 204, danach 404; der Verlauf geht mit", async () => {
    const { ruf, tabellen } = brainApp();
    const ablage = supabaseBrain(ENV_AN);
    await ablage.knotenSchreiben(knoten("s-kontakt"), { neu: true });
    await ablage.knotenSchreiben(knoten("s-kontakt", { inhalt: "neu" }), { erwartet: 1, version: version() });
    expect((await ruf("/api/brain/knoten/s-kontakt", { methode: "DELETE" })).status).toBe(204);
    expect(tabellen.brain_nodes).toEqual([]);
    expect(tabellen.brain_versions).toEqual([]);
    const nochmal = await ruf("/api/brain/knoten/s-kontakt", { methode: "DELETE" });
    expect(nochmal.status).toBe(404);
    expect((await nochmal.json()).fehler).toBe("Diesen Brain-Eintrag gibt es nicht (mehr).");
  });

  it("doppelter Titel: eigener Satz (422) statt „Konflikt“ – Papierkorb zählt nicht mit", async () => {
    const { ruf } = brainApp();
    await ruf("/api/brain/knoten/s-kontakt", { methode: "PUT", body: { knoten: knoten("s-kontakt", { titel: "Kontakt" }), neu: true } });
    const doppelt = await ruf("/api/brain/knoten/s-zweiter", { methode: "PUT", body: { knoten: knoten("s-zweiter", { titel: "KONTAKT" }), neu: true } });
    expect(doppelt.status).toBe(422);
    expect((await doppelt.json()).fehler).toBe("Diesen Titel gibt es im Brain schon.");
    const umbenannt = await ruf("/api/brain/knoten/s-dritter", { methode: "PUT", body: { knoten: knoten("s-dritter", { titel: "Kontakt", geloescht: T0 }), neu: true } });
    expect(umbenannt.status).toBe(200); // liegt im Papierkorb
  });
});

// ---------- Prüfung der Eingaben ----------
describe("Der Worker prüft, was ins gemeinsame Brain soll", () => {
  it("Knoten: nur gespeicherte Arten, keine abgeleiteten Knoten, kein HTML, Titel ohne [ ] |, Grenzen wie im Bauplan", () => {
    const status = (k) => { try { knotenPruefen(k); return 200; } catch (e) { expect(e).toBeInstanceOf(BrainFehler); return e.status; } };
    expect(knotenPruefen(knoten("s-kontakt", { fremd: 1, nutzung: { anzahl: 9 }, tags: ["a", "a", "ö-1"] }))).toEqual({ ...knoten("s-kontakt"), tags: ["a", "ö-1"] }); // unbekannte Felder weg, Tags eindeutig
    expect(knotenPruefen({ id: "s-kurz", art: "frage", titel: "Offen?", status: "zu_klaeren" })).toMatchObject({ inhalt: "", tags: [], quelle: "", erstellt: 0, geloescht: 0, geschuetzt: false, rev: 0 });
    for (const art of ["praxiswissen", "regel", "persona", "frage", "vorlage"]) expect(status(knoten("s-kontakt", { art })), art).toBe(200);
    const falsch = [
      null, "text", [], knoten("abc"), knoten("x".repeat(41)), knoten("s kontakt"), knoten("s-kontakt", { art: "patient" }), knoten("s-kontakt", { art: "notiz" }), knoten("s-kontakt", { art: "bericht" }),
      knoten("p-12345678", { abgeleitet: true }), knoten("s-kontakt", { status: "geloescht" }), knoten("s-kontakt", { titel: "A" }), knoten("s-kontakt", { titel: 5 }), knoten("s-kontakt", { titel: "Praxis [Kiesling]" }),
      knoten("s-kontakt", { titel: "a|b" }), knoten("s-kontakt", { inhalt: "<script>alert(1)</script>" }), knoten("s-kontakt", { inhalt: 'Text <img src=x onerror="x">' }), knoten("s-kontakt", { inhalt: "[klick](javascript:alert(1))" }),
      knoten("s-kontakt", { titel: "<b>Fett</b>" }), knoten("s-kontakt", { tags: ["Groß"] }), knoten("s-kontakt", { tags: ["mit leer"] }), knoten("s-kontakt", { tags: "praxis" }), knoten("s-kontakt", { tags: Array.from({ length: 13 }, (_, i) => `t${i}`) }),
      knoten("s-kontakt", { erstellt: -1 }), knoten("s-kontakt", { geaendert: "gestern" }), knoten("s-kontakt", { seed: "mit leer" }), knoten("s-kontakt", { inhalt: `a${String.fromCharCode(0)}b` }),
    ];
    for (const [i, k] of falsch.entries()) expect(status(k), `Fall ${i}`).toBe(400);
    expect(status(knoten("s-kontakt", { inhalt: "Schmerz < 3 und > 1" }))).toBe(200); // spitze Klammern ohne Tag sind erlaubt
    expect(status(knoten("s-kontakt", { titel: "t".repeat(121) }))).toBe(413);
    expect(status(knoten("s-kontakt", { inhalt: "i".repeat(20_001) }))).toBe(413);
    expect(status(knoten("s-kontakt", { inhalt: "i".repeat(20_000), titel: "t".repeat(120), quelle: "q".repeat(80) }))).toBe(200);
    expect(status(knoten("s-kontakt", { quelle: "q".repeat(81) }))).toBe(413);
  });

  it("Verlauf, Kanten und Lücken: Typen und Grenzen", () => {
    expect(versionPruefen(version({ nr: 99, fremd: 1 }))).toEqual(version());
    expect(() => versionPruefen({ ...version(), art: "patient" })).toThrow(BrainFehler);
    expect(() => versionPruefen("alt")).toThrow(BrainFehler);
    expect(kantePruefen({ id: "sk-1", von: "s-a", nach: "p-12345678-1234-1234-1234-123456789012", art: "gehoert_zu", auto: false, fremd: 1 })).toEqual({ id: "sk-1", von: "s-a", nach: "p-12345678-1234-1234-1234-123456789012", art: "gehoert_zu" });
    for (const k of [{ id: "sk-1", von: "s-a", nach: "s-b", art: "frei" }, { id: "sk 1", von: "s-a", nach: "s-b", art: "verweis" }, { id: "sk-1", von: "", nach: "s-b", art: "verweis" }, null]) expect(() => kantePruefen(k)).toThrow(BrainFehler);
    expect(lueckePruefen({ id: "l-1", frage: "  Gibt es\nParkplätze? " })).toMatchObject({ id: "l-1", frage: "Gibt es Parkplätze?", anzahl: 1, status: "offen", knoten: "" });
    for (const l of [{ id: "l-1", frage: "" }, { id: "l-1", frage: "x", status: "erledigt" }, { id: "l-1", frage: "x", anzahl: 0 }, { id: "l-1", frage: "f".repeat(301) }, { id: "l-1", frage: 5 }]) expect(() => lueckePruefen(l)).toThrow(BrainFehler);
  });

  it("Routen lehnen Unpassendes ab, bevor etwas geschrieben wird", async () => {
    const { ruf, tabellen } = brainApp();
    const put = (pfad, body) => ruf(pfad, { methode: "PUT", body });
    expect((await put("/api/brain/knoten/s-kontakt", { knoten: knoten("s-anders") })).status).toBe(400); // Kennung in Adresse und Körper verschieden
    expect((await put("/api/brain/knoten/s-kontakt", {})).status).toBe(400);
    expect((await put("/api/brain/knoten/s-kontakt", { knoten: knoten("s-kontakt"), erwartet: "1" })).status).toBe(400);
    expect((await put("/api/brain/knoten/s-kontakt", { knoten: knoten("s-kontakt", { art: "patient" }) })).status).toBe(400);
    expect((await put("/api/brain/knoten/x%20y", { knoten: knoten("s-kontakt") })).status).toBe(400);
    expect((await put("/api/brain/kanten", { kanten: "alle" })).status).toBe(400);
    expect((await put("/api/brain/kanten", { kanten: [{ id: "sk-1", von: "s-a", nach: "s-b", art: "frei" }] })).status).toBe(400);
    expect((await put("/api/brain/luecken", { luecken: [{ id: "l-1" }] })).status).toBe(400);
    expect((await put("/api/brain/meta/__proto__", { wert: 1 })).status).toBe(400);
    expect((await put("/api/brain/meta/seed", { wert: "x".repeat(60_001) })).status).toBe(413);
    expect((await ruf("/api/brain/nutzung", { methode: "POST", body: { ids: ["x y"] } })).status).toBe(400);
    expect((await ruf("/api/brain/nutzung", { methode: "POST", body: { ids: ["s-kontakt"], zeit: "jetzt" } })).status).toBe(400);
    expect((await ruf("/api/brain/kanten", { methode: "DELETE", body: { ids: "alle" } })).status).toBe(400);
    expect((await ruf("/api/brain/stapel", { methode: "POST", body: { knoten: [knoten("s-kontakt"), knoten("s-zwei", { inhalt: "<iframe src=x></iframe>" })] } })).status).toBe(400);
    expect(Object.values(tabellen).flat()).toEqual([]); // nichts ist angekommen – auch nicht der gültige erste Knoten des Stapels
  });
});

// ---------- Kanten, Lücken, Nutzung, Einstellungen, Stapel ----------
describe("Kanten, Lücken, Nutzung, Einstellungen, Stapel", () => {
  it("Kanten und Lücken: anlegen, ersetzen, entfernen", async () => {
    const { ruf, tabellen } = brainApp();
    const put = (pfad, body) => ruf(pfad, { methode: "PUT", body });
    expect((await put("/api/brain/kanten", { kanten: [{ id: "sk-1", von: "s-a", nach: "s-b", art: "gehoert_zu", auto: false }, { id: "sk-2", von: "s-b", nach: "s-c", art: "verweis" }] })).status).toBe(204);
    await put("/api/brain/kanten", { kanten: [{ id: "sk-1", von: "s-a", nach: "s-c", art: "gehoert_zu" }] });
    expect(tabellen.brain_edges.map((k) => [k.id, k.nach])).toEqual([["sk-1", "s-c"], ["sk-2", "s-c"]]);
    expect((await ruf("/api/brain/kanten", { methode: "DELETE", body: { ids: ["sk-2", "sk-gibt-es-nicht"] } })).status).toBe(204);
    await put("/api/brain/luecken", { luecken: [{ id: "l-1", frage: "Gibt es Parkplätze?", schluessel: "gibt es parkplaetze", erstmals: T0, zuletzt: T0 + 9, anzahl: 2, status: "offen", knoten: "" }] });
    const alles = await json(await ruf("/api/brain"));
    expect(alles.kanten).toEqual([{ id: "sk-1", von: "s-a", nach: "s-c", art: "gehoert_zu", auto: false }]);
    expect(alles.luecken).toEqual([{ id: "l-1", frage: "Gibt es Parkplätze?", schluessel: "gibt es parkplaetze", erstmals: T0, zuletzt: T0 + 9, anzahl: 2, status: "offen", knoten: "" }]);
    await ruf("/api/brain/luecken", { methode: "DELETE", body: { ids: ["l-1"] } });
    expect(tabellen.brain_gaps).toEqual([]);
  });

  it("Nutzung: in der Datenbank gezählt (zwei Geräte gleichzeitig zählen beide), nur vorhandene Knoten; Einstellungen schreiben und entfernen", async () => {
    const { ruf, tabellen, anfragen } = brainApp();
    const ablage = supabaseBrain(ENV_AN);
    await ablage.knotenSchreiben(knoten("s-kontakt"), { neu: true });
    await ablage.knotenSchreiben(knoten("s-zweiter", { titel: "Zweiter" }), { neu: true });
    const [a, b] = await Promise.all([
      ruf("/api/brain/nutzung", { methode: "POST", body: { ids: ["s-kontakt", "s-kontakt", "s-fehlt-ganz"], zeit: T0 + 100 } }),
      ruf("/api/brain/nutzung", { methode: "POST", body: { ids: ["s-kontakt", "s-zweiter"], zeit: T0 + 50 } }),
    ]);
    expect((await a.json()).nutzung.map((n) => n.id)).toEqual(["s-kontakt"]);
    expect((await b.json()).nutzung).toHaveLength(2);
    expect(tabellen.brain_nodes.map((z) => [z.id, z.nutzung_anzahl])).toEqual([["s-kontakt", 2], ["s-zweiter", 1]]);
    expect((await json(await ruf("/api/brain"))).nutzung).toEqual([{ id: "s-kontakt", anzahl: 2, zuletzt: T0 + 100 }, { id: "s-zweiter", anzahl: 1, zuletzt: T0 + 50 }]);
    expect(anfragen.filter((x) => x.pfad === "rpc/brain_nutzung_zaehlen")[0].body).toEqual({ p_ids: ["s-kontakt", "s-fehlt-ganz"], p_zeit: new Date(T0 + 100).toISOString() });
    expect(tabellen.brain_nodes[0].geaendert_am).toBe(new Date(T0).toISOString()); // Nutzung ändert „geändert“ nicht
    expect((await ruf("/api/brain/meta/seed.version", { methode: "PUT", body: { wert: { v: "abc", knoten: 41 } } })).status).toBe(204);
    expect((await json(await ruf("/api/brain"))).meta).toEqual({ "seed.version": { v: "abc", knoten: 41 } });
    await ruf("/api/brain/meta/seed.version", { methode: "PUT", body: {} }); // wert fehlt = entfernen
    expect(tabellen.brain_meta).toEqual([]);
  });

  it("Stapel (Seed/Import): rev immer höher als gespeichert, Verlauf angehängt, Nutzung gesetzt – und „nur wenn noch nicht gesetzt“ spielt den Seed nie doppelt ein", async () => {
    const { ruf, tabellen } = brainApp();
    const ablage = supabaseBrain(ENV_AN);
    await ablage.knotenSchreiben(knoten("s-kontakt", { titel: "Kontakt" }), { neu: true });
    await ablage.knotenSchreiben(knoten("s-kontakt", { titel: "Kontakt", inhalt: "geändert" }), { erwartet: 1 });
    const seed = {
      knoten: [knoten("s-kontakt", { titel: "Kontakt", inhalt: "aus dem Seed", rev: 1 }), knoten("s-praxis", { titel: "Praxis", rev: 5 })],
      kanten: [{ id: "sk-kontakt", von: "s-kontakt", nach: "s-praxis", art: "gehoert_zu" }],
      versionen: { "s-kontakt": [version({ grund: "seed" })] },
      luecken: [{ id: "l-1", frage: "Parken?" }],
      nutzung: [{ id: "s-praxis", anzahl: 4, zuletzt: T0 + 7 }],
      meta: { seed: "v1", "ansicht.x": [1, 2] },
      nurWennMeta: { schluessel: "seed" },
    };
    const erster = await json(await ruf("/api/brain/stapel", { methode: "POST", body: seed }));
    expect(erster.knoten.map((k) => [k.id, k.rev])).toEqual([["s-kontakt", 3], ["s-praxis", 5]]);
    expect(tabellen.brain_nodes.find((z) => z.id === "s-praxis")).toMatchObject({ nutzung_anzahl: 4, nutzung_zuletzt: new Date(T0 + 7).toISOString() });
    expect(tabellen.brain_versions.map((v) => [v.knoten_id, v.nr, v.grund])).toEqual([["s-kontakt", 1, "seed"]]);
    expect(tabellen.brain_edges).toHaveLength(1);
    expect(tabellen.brain_gaps).toHaveLength(1);
    expect(Object.fromEntries(tabellen.brain_meta.map((m) => [m.schluessel, m.wert]))).toEqual({ seed: "v1", "ansicht.x": [1, 2] });
    // zweites Gerät mit demselben Seed: übersprungen, nichts doppelt
    const zweiter = await json(await ruf("/api/brain/stapel", { methode: "POST", body: seed }));
    expect(zweiter).toEqual({ uebersprungen: true });
    expect(tabellen.brain_nodes.find((z) => z.id === "s-kontakt").rev).toBe(3);
    expect(tabellen.brain_versions).toHaveLength(1);
    // Bedingung mit Wert: nur wenn die Einstellung gerade so steht
    expect(await json(await ruf("/api/brain/stapel", { methode: "POST", body: { knoten: [], nurWennMeta: { schluessel: "seed", wert: "v0" } } }))).toEqual({ uebersprungen: true });
    expect(await json(await ruf("/api/brain/stapel", { methode: "POST", body: { knoten: [], meta: { seed: "v2" }, nurWennMeta: { schluessel: "seed", wert: "v1" } } }))).toEqual({ knoten: [] });
    expect(tabellen.brain_meta.find((m) => m.schluessel === "seed").wert).toBe("v2");
    // Obergrenzen
    const viele = Array.from({ length: SPEICHER_GRENZEN.stapelKnoten + 1 }, (_, i) => knoten(`k-${String(i).padStart(4, "0")}`, { titel: `Titel ${i}` }));
    expect((await ruf("/api/brain/stapel", { methode: "POST", body: { knoten: viele } })).status).toBe(413);
  });

  it("Datenbank nicht erreichbar oder Fehler: deutscher Satz, im Log nur Methode, Tabelle und Status", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Netz weg mit Inhalt Kontakt"); }));
    const { rufe } = neueApp({ brainSpeicher: supabaseBrain(ENV_AN) });
    const weg = await rufe("/api/brain", { env: ENV_AN });
    expect(weg.status).toBe(502);
    expect((await weg.json()).fehler).toBe("Die Datenbank für das Brain ist nicht erreichbar.");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "relation brain_nodes does not exist – Kontakt geheim" }), { status: 404 })));
    const fehlt = await rufe("/api/brain/knoten/s-kontakt", { methode: "PUT", body: { knoten: knoten("s-kontakt", { inhalt: "Kontakt geheim" }), neu: true }, env: ENV_AN });
    expect(fehlt.status).toBe(502);
    expect((await fehlt.json()).fehler).toBe("Datenbank-Fehler im Brain (404).");
    expect(log.mock.calls.flat().join(" ")).toBe("supabase brain POST brain_nodes -> 404");
    await expect(brainRoute(null, { pfad: "/api/brain", methode: "GET" })).rejects.toThrow(/nicht eingerichtet/);
  });
});

// ---------- Zusammenspiel mit der Oberfläche ----------
describe.skipIf(!SPEICHER || typeof SPEICHER.apiAblage !== "function")("Zusammenspiel: apiAblage() der Oberfläche (brain-speicher.js) gegen diese Routen", () => {
  /** api() wie in der Oberfläche: JSON zurück, Fehler mit .status (und – je nach Fassung – mit .daten). */
  const apiFuer = (ruf, { mitDaten }) => async (pfad, { methode = "GET", body } = {}) => {
    const r = await ruf(pfad, { methode, body });
    const daten = r.status === 204 ? null : await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error((daten && daten.fehler) || `Fehler ${r.status}.`), { status: r.status }, mitDaten ? { daten } : {});
    return daten;
  };

  for (const mitDaten of [false, true]) {
    it(`gleiche Schnittstelle wie die Ablage im Browser – Fehler ${mitDaten ? "mit" : "ohne"} Antwortdaten`, async () => {
      const { ruf, tabellen } = brainApp();
      const ablage = SPEICHER.apiAblage(apiFuer(ruf, { mitDaten }));
      expect(ablage.art).toBe("api");
      expect(await ablage.laden()).toEqual({ knoten: [], kanten: [], luecken: [], nutzung: [], meta: {} });
      // Seed in einem Stapel – ein zweiter Versuch wird übersprungen
      const seed = { knoten: [knoten("s-kontakt", { titel: "Kontakt" }), knoten("s-praxis", { titel: "Praxis" })], kanten: [{ id: "sk-1", von: "s-kontakt", nach: "s-praxis", art: "gehoert_zu", auto: false }], meta: { seed: "v1" }, nurWennMeta: { schluessel: "seed" } };
      expect(await ablage.stapel(seed)).toMatchObject({ ok: true });
      expect(await ablage.stapel(seed)).toEqual({ ok: false, uebersprungen: true });
      // schreiben mit Prüfung, Konflikt, Verlauf
      const gut = await ablage.knotenSchreiben(knoten("s-kontakt", { titel: "Kontakt", inhalt: "Telefon neu" }), { erwartet: 1, version: version() });
      expect(gut).toMatchObject({ ok: true, knoten: { id: "s-kontakt", rev: 2, inhalt: "Telefon neu" } });
      const konflikt = await ablage.knotenSchreiben(knoten("s-kontakt", { titel: "Kontakt", inhalt: "veraltet" }), { erwartet: 1 });
      expect(konflikt).toMatchObject({ konflikt: true, aktuell: { id: "s-kontakt", rev: 2, inhalt: "Telefon neu" } });
      expect(await ablage.knotenSchreiben(knoten("s-kontakt", { titel: "Kontakt" }), { neu: true })).toMatchObject({ konflikt: true, aktuell: { rev: 2 } });
      expect((await ablage.verlauf("s-kontakt")).map((v) => [v.nr, v.grund, v.inhalt])).toEqual([[1, "bearbeitet", "Alter Inhalt"]]);
      // Kanten, Lücken, Nutzung, Einstellungen
      await ablage.kantenSchreiben([{ id: "sk-2", von: "s-praxis", nach: "s-kontakt", art: "verweis", auto: false }]);
      await ablage.kantenEntfernen(["sk-1"]);
      await ablage.lueckenSchreiben([{ id: "l-1", frage: "Gibt es Parkplätze?", schluessel: "parkplaetze", erstmals: T0, zuletzt: T0, anzahl: 1, status: "offen", knoten: "" }]);
      expect(await ablage.nutzungZaehlen(["s-kontakt", "s-kontakt"], T0 + 3)).toEqual([{ id: "s-kontakt", anzahl: 1, zuletzt: T0 + 3 }]);
      await ablage.metaSchreiben("ansicht", { modus: "liste" });
      const stand = await ablage.laden();
      expect(stand.knoten.map((k) => [k.id, k.rev])).toEqual([["s-kontakt", 2], ["s-praxis", 1]]);
      expect(stand.kanten).toEqual([{ id: "sk-2", von: "s-praxis", nach: "s-kontakt", art: "verweis", auto: false }]);
      expect(stand.luecken.map((l) => l.frage)).toEqual(["Gibt es Parkplätze?"]);
      expect(stand.nutzung).toEqual([{ id: "s-kontakt", anzahl: 1, zuletzt: T0 + 3 }]);
      expect(stand.meta).toEqual({ seed: "v1", ansicht: { modus: "liste" } });
      // endgültig entfernen (schon weg ist kein Fehler), Lücke entfernen
      await ablage.knotenEntfernen(["s-praxis", "s-praxis", "s-gab-es-nie"]);
      await ablage.lueckenEntfernen(["l-1"]);
      expect(tabellen.brain_nodes.map((z) => z.id)).toEqual(["s-kontakt"]);
      expect(tabellen.brain_gaps).toEqual([]);
    });
  }
});

// ---------- Serverseitiger Abruf ----------
describe.skipIf(!SUCHE || typeof SUCHE.kontextWaehlen !== "function")("Schalter BRAIN_QUELLE: Gabi holt den Kontext selbst aus der Datenbank (dieselbe Suche wie im Browser)", () => {
  async function gefuellt() {
    const db = falschesPostgrest();
    const ablage = supabaseBrain(ENV_AN);
    await ablage.stapel({
      knoten: [
        knoten("s-standort-kieslingstrasse", { titel: "Praxis Kieslingstraße", inhalt: "Kieslingstraße 82, 90491 Nürnberg. Mehr als neun Behandlungsräume.", tags: ["standort"] }),
        knoten("s-kontakt", { titel: "Kontakt", inhalt: "Telefon: +49 911 23 99 823 · E-Mail: info@physio-works.de", tags: ["kontakt", "telefon"], status: "entwurf" }),
        knoten("s-frage-parken", { art: "frage", titel: "Gibt es Parkplätze an den Praxen?", inhalt: "Auf der Website steht dazu nichts.", status: "zu_klaeren", tags: ["parken"] }),
        knoten("s-alt-weg", { titel: "Alte Adresse Kieslingstraße", inhalt: "Kieslingstraße 1 – gilt nicht mehr.", geloescht: T0 }),
        knoten("s-persona", { art: "persona", titel: "Wer ist Gabi", inhalt: "Gabi ist kurz und herzlich." }),
        knoten("s-regel-1", { art: "regel", titel: "Preise", inhalt: "Preise nur mit Quelle nennen." }),
        knoten("s-regel-2", { art: "regel", titel: "Entwurf einer Regel", inhalt: "Immer reimen.", status: "entwurf" }),
      ],
      luecken: [{ id: "l-1", frage: "Hausbesuche?" }, { id: "l-2", frage: "Kartenzahlung?", status: "eingetragen" }],
    });
    await ablage.nutzungZaehlen(["s-standort-kieslingstrasse"], T0);
    return { ...db, ablage };
  }

  it("wählt die passenden Einträge, nie den Papierkorb; Persona und Regeln nur bestätigt; Zahlen zum Stand", async () => {
    const { ablage } = await gefuellt();
    const brain = await brainKontextAusSpeicher({ brainSpeicher: ablage, kontextWaehlen: SUCHE.kontextWaehlen, frage: "Wo ist die Praxis Kieslingstraße?", jetzt: T0 + 1000 });
    expect(brain.knoten[0]).toMatchObject({ nr: "K1", id: "s-standort-kieslingstrasse", art: "praxiswissen", status: "bestaetigt", titel: "Praxis Kieslingstraße" });
    expect(brain.knoten.map((k) => k.id)).not.toContain("s-alt-weg");
    expect(brain.knoten.every((k) => ["praxiswissen", "frage", "vorlage"].includes(k.art))).toBe(true);
    expect(brain.persona).toBe("Gabi ist kurz und herzlich.");
    expect(brain.regeln).toEqual(["Preise nur mit Quelle nennen."]);
    expect(brain.stand).toEqual({ knoten: 6, bestaetigt: 3, entwurf: 2, zuKlaeren: 1, veraltet: 0, nieVerwendet: 0, luecken: 1 });
    const nichts = await brainKontextAusSpeicher({ brainSpeicher: ablage, kontextWaehlen: SUCHE.kontextWaehlen, frage: "Bietet ihr Tauchkurse an?", jetzt: T0 });
    expect(nichts.knoten).toEqual([]); // Brain aktiv, nichts gefunden → Gabi sagt „Dazu steht noch nichts im Brain.“
    const alt = await brainKontextAusSpeicher({ brainSpeicher: ablage, kontextWaehlen: SUCHE.kontextWaehlen, frage: "Kontakt?", jetzt: T0 + 91 * 24 * 3600 * 1000 });
    expect(alt.stand.veraltet).toBe(3); // alle bestätigten sind dann älter als 90 Tage
    await expect(brainKontextAusSpeicher({ brainSpeicher: null, kontextWaehlen: SUCHE.kontextWaehlen, frage: "x" })).rejects.toThrow(BrainFehler);
    await expect(brainKontextAusSpeicher({ brainSpeicher: ablage, kontextWaehlen: null, frage: "x" })).rejects.toThrow(/nicht eingerichtet/);
  });

  it("zu lange Einträge aus der Datenbank werden auf die Grenzen des Kontexts gekürzt (statt die Frage scheitern zu lassen)", async () => {
    const { ablage } = await gefuellt();
    await ablage.knotenSchreiben(knoten("s-persona", { art: "persona", titel: "Wer ist Gabi", inhalt: "p".repeat(5000) }), { erwartet: 1 });
    await ablage.knotenSchreiben(knoten("s-lang", { titel: "Kieslingstraße ausführlich", inhalt: `Kieslingstraße ${"sehr lang ".repeat(1500)}` }), { neu: true });
    const brain = await brainKontextAusSpeicher({ brainSpeicher: ablage, kontextWaehlen: () => [{ id: "s-lang", art: "praxiswissen", status: "bestaetigt", titel: "t".repeat(300), inhalt: "i".repeat(9000), tags: Array.from({ length: 20 }, (_, i) => `tag${i}`) }], frage: "x" });
    expect(brain.persona).toHaveLength(800);
    expect(brain.knoten[0].titel).toHaveLength(120);
    expect(brain.knoten[0].inhalt).toHaveLength(2000);
    expect(brain.knoten[0].tags).toHaveLength(8);
  });

  it("Route /api/chat: der Server-Kontext ersetzt den der Oberfläche; Status meldet es; Datenbank-Fehler kommen als Satz an", async () => {
    const { ablage } = await gefuellt();
    const chatten = vi.fn(async ({ brain, senden }) => { senden({ t: "text", d: `${brain.knoten.length}` }); });
    const brainAbruf = vi.fn((frage) => brainKontextAusSpeicher({ brainSpeicher: ablage, kontextWaehlen: SUCHE.kontextWaehlen, frage, jetzt: T0 }));
    const { rufe } = neueApp({ chatten, brainAbruf });
    const vomClient = { v: 1, knoten: [{ id: "k-vom-client", art: "praxiswissen", status: "bestaetigt", titel: "Vom Gerät", inhalt: "soll nicht zählen" }] };
    const r = await rufe("/api/chat", { methode: "POST", body: { nachrichten: [{ rolle: "nutzer", text: "Wo ist die Praxis Kieslingstraße?" }], brainKontext: vomClient } });
    expect(r.status).toBe(200);
    expect(brainAbruf).toHaveBeenCalledWith("Wo ist die Praxis Kieslingstraße?");
    const brain = chatten.mock.calls[0][0].brain;
    expect(brain.knoten.map((k) => k.id)).toContain("s-standort-kieslingstrasse");
    expect(brain.knoten.map((k) => k.id)).not.toContain("k-vom-client");
    expect((await (await rufe("/api/status", { code: null })).json()).brain).toEqual({ speicher: "geraet", abruf: "server" });
    // auch ohne Kontext von der Oberfläche ist der Brain-Modus an
    await rufe("/api/chat", { methode: "POST", body: { nachrichten: [{ rolle: "nutzer", text: "Telefon?" }] } });
    expect(chatten.mock.calls[1][0].brain).not.toBeNull();
    // Datenbank weg: Fehler als JSON mit deutschem Satz (kein Strom, keine KI-Anfrage)
    const kaputt = neueApp({ chatten, brainAbruf: async () => { throw new BrainFehler(502, "Die Datenbank für das Brain ist nicht erreichbar."); } });
    const f = await kaputt.rufe("/api/chat", { methode: "POST", body: { nachrichten: [{ rolle: "nutzer", text: "Telefon?" }] } });
    expect(f.status).toBe(502);
    expect((await f.json()).fehler).toBe("Die Datenbank für das Brain ist nicht erreichbar.");
    expect(chatten).toHaveBeenCalledTimes(2);
  });
});

describe("Hinweis für die Hauptsitzung, falls Bausteine fehlen", () => {
  it("brain-suche.js und brain-speicher.js sind da (sonst laufen die Blöcke oben nicht mit)", () => {
    expect(SUCHE && typeof SUCHE.kontextWaehlen, "brain-suche.js: kontextWaehlen").toBe("function");
    expect(SPEICHER && typeof SPEICHER.apiAblage, "brain-speicher.js: apiAblage").toBe("function");
    expect(CODE).toBeTruthy();
  });
});
