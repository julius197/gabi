// ENTWURF hinter zwei Schaltern (beide Standard AUS): das Brain in Supabase statt nur auf dem Gerät.
//   BRAIN_SPEICHER = "supabase" → Routen /api/brain… (sonst 404 wie bisher); die Oberfläche nutzt dann apiAblage()
//   BRAIN_QUELLE   = "supabase" → Gabi holt den Kontext selbst aus brain_nodes (statt brainKontext aus der Oberfläche)
// Tabellen: supabase/migrations/brain.sql – NICHT ausführen ohne Freigabe von Julius. Zugriff nur hier im Worker
// (geheimer Schlüssel, RLS an). Logs: nie Inhalte.
// Vor dem echten Einsatz nötig: Benutzerkonten und Rollen (Admin = Praxisinhaber). Mit einem gemeinsamen Zugangscode
// könnte jede Person mit dem Code das gemeinsame Brain ändern – deshalb bleibt beides aus.
// Grenze des Entwurfs: PostgREST kennt keine Transaktion über mehrere Tabellen. Die rev-Prüfung eines Knotens ist
// atomar (ein UPDATE mit Bedingung), Verlauf und Stapel laufen in Einzelschritten – für den echten Betrieb gehört der
// Stapel in eine Postgres-Funktion.
import { BRAIN_GRENZEN, BRAIN_STATUS, BrainFehler, brainKontextPruefen } from "./brain.js";

export const GESPEICHERTE_ARTEN = ["praxiswissen", "regel", "persona", "frage", "vorlage"];
export const KANTEN_ARTEN = ["verweis", "gehoert_zu", "notiz_von", "bericht_zu"];
export const LUECKEN_STATUS = ["offen", "eingetragen", "verworfen"];
export const SPEICHER_GRENZEN = {
  titelMin: 2, titelMax: 120, inhaltMax: 20_000, tagsMax: 12, tagMax: 30, quelleMax: 80, versionen: 20,
  frageMax: 300, grundMax: 40, stapelKnoten: 600, stapelKanten: 3000, ids: 500, metaZeichen: 60_000,
};
export const MAX_JSON_STAPEL = 2_000_000; // Seed/Import in einem Rutsch (alle anderen Brain-Anfragen: 300 KB wie sonst)

/** Brain-Routen (nur aktiv mit BRAIN_SPEICHER = "supabase") – Muster und erlaubte Methoden wie ROUTEN in app.js. */
export const BRAIN_ROUTEN = [
  [/^\/api\/brain$/, "GET"],
  [/^\/api\/brain\/knoten\/[^/]+$/, "PUT, DELETE"],
  [/^\/api\/brain\/knoten\/[^/]+\/verlauf$/, "GET"],
  [/^\/api\/brain\/stapel$/, "POST"],
  [/^\/api\/brain\/kanten$/, "PUT, DELETE"],
  [/^\/api\/brain\/luecken$/, "PUT, DELETE"],
  [/^\/api\/brain\/nutzung$/, "POST"],
  [/^\/api\/brain\/meta\/[^/]+$/, "PUT"],
];
export const istBrainPfad = (pfad) => pfad === "/api/brain" || pfad.startsWith("/api/brain/");

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const KNOTEN_ID = /^[A-Za-z0-9_-]{4,40}$/;
const META = /^[A-Za-z0-9_.-]{1,60}$/;
const TAG = /^[a-z0-9äöüß-]{1,30}$/;
const SEED = /^[A-Za-z0-9_-]{1,80}$/;
const HTML = /<\/?[a-z][^>]*>|<!--|javascript:/i;
const STEUER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const TITEL_INDEX = "brain_nodes_titel_eindeutig";

const istObjekt = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const liste = (x) => (Array.isArray(x) ? x : []);
const ms = (iso) => (iso ? new Date(iso).getTime() || 0 : 0);
const iso = (zahl, ersatz = null) => (Number.isFinite(zahl) && zahl > 0 ? new Date(zahl).toISOString() : ersatz);
const ungueltig = (was) => new BrainFehler(400, `Ungültiger Brain-Eintrag (${was}).`);

function text(wert, was, max, { min = 0, zeile = false } = {}) {
  if (typeof wert !== "string") throw ungueltig(was);
  const t = (zeile ? wert.replace(/\s+/g, " ") : wert.replace(/\r\n?/g, "\n")).trim();
  if (STEUER.test(t) || (zeile && /\n/.test(t))) throw ungueltig(was);
  if (t.length > max) throw new BrainFehler(413, `Brain-Eintrag zu lang (${was}: höchstens ${max} Zeichen).`);
  if (t.length < min) throw ungueltig(was);
  return t;
}
function kennung(wert, muster = ID, was = "Kennung") {
  if (typeof wert !== "string" || !muster.test(wert)) throw ungueltig(was);
  return wert;
}
function zeit(wert, was) {
  if (wert === undefined || wert === null) return 0;
  if (!Number.isFinite(wert) || wert < 0) throw ungueltig(was);
  return Math.floor(wert);
}

/** Knoten aus der Oberfläche prüfen (Formen: BRAIN-BAUPLAN.md §2.1). Abgeleitete Knoten werden nie gespeichert. */
export function knotenPruefen(k) {
  if (!istObjekt(k)) throw ungueltig("Form");
  if (k.abgeleitet) throw new BrainFehler(400, "Test-Patienten, Notizen und Berichte werden nicht im Brain gespeichert.");
  const titel = text(k.titel, "Titel", SPEICHER_GRENZEN.titelMax, { min: SPEICHER_GRENZEN.titelMin, zeile: true });
  if (/[[\]|]/.test(titel)) throw new BrainFehler(400, "Im Titel sind [ ] und | nicht erlaubt.");
  const inhalt = k.inhalt === undefined || k.inhalt === null ? "" : text(k.inhalt, "Inhalt", SPEICHER_GRENZEN.inhaltMax);
  if (HTML.test(inhalt) || HTML.test(titel)) throw new BrainFehler(400, "HTML ist im Brain nicht erlaubt.");
  const tags = k.tags === undefined || k.tags === null ? [] : k.tags;
  if (!Array.isArray(tags) || tags.length > SPEICHER_GRENZEN.tagsMax || tags.some((t) => typeof t !== "string" || !TAG.test(t))) throw ungueltig("Tags");
  if (!GESPEICHERTE_ARTEN.includes(k.art)) throw ungueltig("Art");
  if (!BRAIN_STATUS.includes(k.status)) throw ungueltig("Status");
  const sauber = {
    id: kennung(k.id, KNOTEN_ID),
    art: k.art,
    titel,
    inhalt,
    tags: [...new Set(tags)],
    status: k.status,
    quelle: k.quelle === undefined || k.quelle === null ? "" : text(k.quelle, "Quelle", SPEICHER_GRENZEN.quelleMax, { zeile: true }),
    erstellt: zeit(k.erstellt, "erstellt"),
    geaendert: zeit(k.geaendert, "geaendert"),
    geschuetzt: k.geschuetzt === true,
    geloescht: zeit(k.geloescht, "geloescht"),
    rev: Number.isInteger(k.rev) && k.rev > 0 ? k.rev : 0,
  };
  if (k.seed !== undefined && k.seed !== null && k.seed !== "") sauber.seed = kennung(k.seed, SEED, "Seed");
  return sauber;
}

/** Stand für den Verlauf prüfen (der Stand VOR einer Änderung); die Nummer vergibt der Speicher. */
export function versionPruefen(v) {
  if (!istObjekt(v)) throw ungueltig("Verlauf");
  if (v.art !== undefined && !GESPEICHERTE_ARTEN.includes(v.art)) throw ungueltig("Verlauf");
  if (v.status !== undefined && !BRAIN_STATUS.includes(v.status)) throw ungueltig("Verlauf");
  const tags = v.tags === undefined || v.tags === null ? [] : v.tags;
  if (!Array.isArray(tags) || tags.length > SPEICHER_GRENZEN.tagsMax || tags.some((t) => typeof t !== "string" || t.length > SPEICHER_GRENZEN.tagMax)) throw ungueltig("Verlauf");
  return {
    zeit: zeit(v.zeit, "Verlauf") || Date.now(),
    grund: v.grund === undefined || v.grund === null ? "" : text(v.grund, "Verlauf", SPEICHER_GRENZEN.grundMax, { zeile: true }),
    art: v.art || "praxiswissen",
    titel: text(v.titel === undefined || v.titel === null ? "" : v.titel, "Verlauf", SPEICHER_GRENZEN.titelMax, { zeile: true }),
    inhalt: text(v.inhalt === undefined || v.inhalt === null ? "" : v.inhalt, "Verlauf", SPEICHER_GRENZEN.inhaltMax),
    tags,
    status: v.status || "entwurf",
    quelle: v.quelle === undefined || v.quelle === null ? "" : text(v.quelle, "Verlauf", SPEICHER_GRENZEN.quelleMax, { zeile: true }),
  };
}

export function kantePruefen(k) {
  if (!istObjekt(k)) throw ungueltig("Verbindung");
  if (!KANTEN_ARTEN.includes(k.art)) throw ungueltig("Verbindung");
  return { id: kennung(k.id, ID, "Verbindung"), von: kennung(k.von, ID, "Verbindung"), nach: kennung(k.nach, ID, "Verbindung"), art: k.art };
}

export function lueckePruefen(l) {
  if (!istObjekt(l)) throw ungueltig("Wissenslücke");
  if (l.status !== undefined && !LUECKEN_STATUS.includes(l.status)) throw ungueltig("Wissenslücke");
  if (l.anzahl !== undefined && (!Number.isInteger(l.anzahl) || l.anzahl < 1 || l.anzahl > BRAIN_GRENZEN.zahl)) throw ungueltig("Wissenslücke");
  return {
    id: kennung(l.id, ID, "Wissenslücke"),
    frage: text(l.frage, "Wissenslücke", SPEICHER_GRENZEN.frageMax, { min: 1, zeile: true }),
    schluessel: text(l.schluessel === undefined || l.schluessel === null ? "" : l.schluessel, "Wissenslücke", SPEICHER_GRENZEN.frageMax, { zeile: true }),
    erstmals: zeit(l.erstmals, "Wissenslücke") || Date.now(),
    zuletzt: zeit(l.zuletzt, "Wissenslücke") || Date.now(),
    anzahl: l.anzahl || 1,
    status: l.status || "offen",
    knoten: l.knoten ? kennung(l.knoten, ID, "Wissenslücke") : "",
  };
}

function idsPruefen(ids) {
  if (!Array.isArray(ids) || ids.length > SPEICHER_GRENZEN.ids) throw ungueltig("Kennungen");
  return [...new Set(ids.map((id) => kennung(id)))];
}
function metaSchluessel(s) {
  if (typeof s !== "string" || !META.test(s) || s === "__proto__") throw new BrainFehler(400, "Ungültiger Schlüssel für die Brain-Einstellungen.");
  return s;
}
function metaWert(wert) {
  if (wert !== undefined && JSON.stringify(wert).length > SPEICHER_GRENZEN.metaZeichen) throw new BrainFehler(413, "Brain-Einstellung zu groß.");
  return wert;
}

// ---------- Zeilen der Datenbank ↔ Formen der Oberfläche ----------
function knotenZuZeile(k, rev) {
  return {
    id: k.id, art: k.art, titel: k.titel, inhalt: k.inhalt, tags: k.tags, status: k.status, quelle: k.quelle,
    erstellt_am: iso(k.erstellt, new Date().toISOString()), geaendert_am: iso(k.geaendert, new Date().toISOString()),
    geschuetzt: k.geschuetzt, geloescht_am: iso(k.geloescht), seed: k.seed || null, rev,
  };
}
function knotenAusZeile(z) {
  const k = {
    id: z.id, art: z.art, titel: z.titel, inhalt: z.inhalt || "", tags: liste(z.tags), status: z.status, quelle: z.quelle || "",
    erstellt: ms(z.erstellt_am), geaendert: ms(z.geaendert_am), geschuetzt: z.geschuetzt === true, rev: Number(z.rev) || 0, geloescht: ms(z.geloescht_am),
  };
  if (z.seed) k.seed = z.seed;
  return k;
}
const nutzungAusZeile = (z) => ({ id: z.id, anzahl: Number(z.nutzung_anzahl) || 0, zuletzt: ms(z.nutzung_zuletzt) });
const versionZuZeile = (id, nr, v) => ({ knoten_id: id, nr, zeit: iso(v.zeit, new Date().toISOString()), grund: v.grund, art: v.art, titel: v.titel, inhalt: v.inhalt, tags: v.tags, status: v.status, quelle: v.quelle });
const versionAusZeile = (z) => ({ nr: Number(z.nr) || 0, zeit: ms(z.zeit), grund: z.grund || "", art: z.art, titel: z.titel || "", inhalt: z.inhalt || "", tags: liste(z.tags), status: z.status, quelle: z.quelle || "" });
const lueckeZuZeile = (l) => ({ id: l.id, frage: l.frage, schluessel: l.schluessel, erstmals: iso(l.erstmals), zuletzt: iso(l.zuletzt), anzahl: l.anzahl, status: l.status, knoten: l.knoten || null });
const lueckeAusZeile = (z) => ({ id: z.id, frage: z.frage, schluessel: z.schluessel || "", erstmals: ms(z.erstmals), zuletzt: ms(z.zuletzt), anzahl: Number(z.anzahl) || 1, status: z.status || "offen", knoten: z.knoten || "" });
const kanteAusZeile = (z) => ({ id: z.id, von: z.von, nach: z.nach, art: z.art, auto: false });

/**
 * Brain-Ablage in Supabase (PostgREST) – dieselben Regeln wie die Ablage im Browser (brain-speicher.js):
 * rev prüfen und hochzählen, Verlauf anhängen (höchstens 20), Nutzung zählen.
 */
export function supabaseBrain(env) {
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const schluessel = env.SUPABASE_SECRET_KEY || "";
  const basis = `${url}/rest/v1`;

  async function anfrage(pfad, { methode = "GET", body, prefer } = {}) {
    if (!url || !schluessel) throw new BrainFehler(503, "Die Datenbank für das Brain ist nicht eingerichtet.");
    const headers = { apikey: schluessel, Accept: "application/json" };
    if (schluessel.startsWith("eyJ")) headers.Authorization = `Bearer ${schluessel}`; // alter service_role-Schlüssel (JWT)
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;
    let antwort;
    try {
      antwort = await fetch(`${basis}/${pfad}`, { method: methode, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new BrainFehler(502, "Die Datenbank für das Brain ist nicht erreichbar.");
    }
    if (antwort.status === 409) {
      // doppelter Titel (eindeutiger Index) oder Kennung schon vergeben – unterscheiden, ohne Inhalte zu loggen
      const d = await antwort.json().catch(() => null);
      const titel = d && `${d.message || ""} ${d.details || ""}`.includes(TITEL_INDEX);
      throw Object.assign(new BrainFehler(titel ? 422 : 409, titel ? "Diesen Titel gibt es im Brain schon." : "Eintrag existiert schon."), { doppelt: !titel });
    }
    if (!antwort.ok) {
      console.log(`supabase brain ${methode} ${pfad.split("?")[0]} -> ${antwort.status}`); // keine Inhalte loggen
      throw new BrainFehler(502, `Datenbank-Fehler im Brain (${antwort.status}).`);
    }
    if (antwort.status === 204) return null;
    const roh = await antwort.text();
    return roh ? JSON.parse(roh) : null;
  }

  const holen = async (id) => {
    const zeilen = await anfrage(`brain_nodes?select=*&id=eq.${id}`);
    return zeilen && zeilen[0] ? zeilen[0] : null;
  };

  /** Stände an den Verlauf hängen: Nummer fortlaufend, die ältesten über 20 fallen weg. */
  async function verlaufAnhaengen(id, versionen) {
    if (!versionen.length) return;
    for (let versuch = 0; versuch < 2; versuch++) {
      const letzte = await anfrage(`brain_versions?select=nr&knoten_id=eq.${id}&order=nr.desc&limit=1`);
      let nr = letzte && letzte[0] ? Number(letzte[0].nr) || 0 : 0;
      try {
        await anfrage("brain_versions", { methode: "POST", body: versionen.map((v) => versionZuZeile(id, ++nr, v)), prefer: "return=minimal" });
      } catch (e) {
        if (e instanceof BrainFehler && e.doppelt && versuch === 0) continue; // ein anderes Gerät war schneller: Nummer neu holen
        throw e;
      }
      if (nr > SPEICHER_GRENZEN.versionen) await anfrage(`brain_versions?knoten_id=eq.${id}&nr=lte.${nr - SPEICHER_GRENZEN.versionen}`, { methode: "DELETE", prefer: "return=minimal" });
      return;
    }
  }

  const hochladen = (tabelle, zeilen, konflikt = "id") =>
    (zeilen.length ? anfrage(`${tabelle}?on_conflict=${konflikt}`, { methode: "POST", body: zeilen, prefer: "resolution=merge-duplicates,return=minimal" }) : null);
  const entfernen = (tabelle, ids) => (ids.length ? anfrage(`${tabelle}?id=in.(${ids.join(",")})`, { methode: "DELETE", prefer: "return=minimal" }) : null);

  return {
    bereit: () => Boolean(url && schluessel),

    /** Alles außer dem Verlauf; knoten enthält auch den Papierkorb. */
    async laden() {
      const [knoten, kanten, luecken, meta] = await Promise.all([
        anfrage("brain_nodes?select=*&order=id.asc&limit=5000"),
        anfrage("brain_edges?select=id,von,nach,art&order=id.asc&limit=20000"),
        anfrage("brain_gaps?select=*&order=zuletzt.desc&limit=2000"),
        anfrage("brain_meta?select=schluessel,wert"),
      ]);
      return {
        knoten: liste(knoten).map(knotenAusZeile),
        kanten: liste(kanten).map(kanteAusZeile),
        luecken: liste(luecken).map(lueckeAusZeile),
        nutzung: liste(knoten).filter((z) => Number(z.nutzung_anzahl) > 0).map(nutzungAusZeile),
        meta: Object.fromEntries(liste(meta).map((m) => [m.schluessel, m.wert])),
      };
    },

    /**
     * Knoten schreiben, gegen den gespeicherten Stand geprüft (wie im Browser):
     * neu → darf nicht existieren · erwartet → gespeicherte rev muss passen · sonst rev + 1. Konflikt:
     * { konflikt: true, aktuell }. version = Stand vor der Änderung, kommt an den Verlauf.
     */
    async knotenSchreiben(knoten, { erwartet, version = null, neu = false } = {}) {
      const k = knotenPruefen(knoten);
      const v = version ? versionPruefen(version) : null;
      const pruefen = erwartet !== undefined && erwartet !== null;
      let zeile = null;
      for (let versuch = 0; versuch < 3 && !zeile; versuch++) {
        const alt = neu && versuch === 0 ? null : await holen(k.id);
        if (neu && alt) return { konflikt: true, aktuell: knotenAusZeile(alt) };
        if (pruefen) {
          if (!alt) return { konflikt: true, aktuell: null }; // anderswo endgültig entfernt: nicht wieder anlegen
          if ((Number(alt.rev) || 0) !== Number(erwartet)) return { konflikt: true, aktuell: knotenAusZeile(alt) };
        }
        if (!alt) {
          try {
            const neuZeilen = await anfrage("brain_nodes", { methode: "POST", body: knotenZuZeile(k, 1), prefer: "return=representation" });
            zeile = neuZeilen && neuZeilen[0];
          } catch (e) {
            if (!(e instanceof BrainFehler) || !e.doppelt) throw e;
            if (neu) return { konflikt: true, aktuell: knotenAusZeile((await holen(k.id)) || knotenZuZeile(k, 0)) };
            // sonst: ein anderes Gerät hat ihn gerade angelegt → noch einmal mit dessen Stand
          }
        } else {
          const rev = Number(alt.rev) || 0;
          const geaendert = await anfrage(`brain_nodes?id=eq.${k.id}&rev=eq.${rev}`, { methode: "PATCH", body: knotenZuZeile(k, rev + 1), prefer: "return=representation" });
          if (geaendert && geaendert[0]) zeile = geaendert[0];
          else if (pruefen) { const jetzt = await holen(k.id); return { konflikt: true, aktuell: jetzt ? knotenAusZeile(jetzt) : null }; }
          // ohne Prüfung: inzwischen woanders geändert → mit dem neuen Stand noch einmal
        }
      }
      if (!zeile) throw new BrainFehler(503, "Das Brain ist gerade beschäftigt. Bitte noch einmal versuchen.");
      if (v) await verlaufAnhaengen(k.id, [v]);
      return { ok: true, knoten: knotenAusZeile(zeile) };
    },

    /** Endgültig entfernen (Verlauf hängt per Fremdschlüssel daran). Ergebnis: gab es ihn? */
    async knotenEntfernen(id) {
      const weg = await anfrage(`brain_nodes?id=eq.${kennung(id, KNOTEN_ID)}`, { methode: "DELETE", prefer: "return=representation" });
      return Array.isArray(weg) && weg.length > 0;
    },

    async verlauf(id) {
      const zeilen = await anfrage(`brain_versions?select=*&knoten_id=eq.${kennung(id, KNOTEN_ID)}&order=nr.asc&limit=${SPEICHER_GRENZEN.versionen}`);
      return liste(zeilen).map(versionAusZeile);
    },

    async kantenSchreiben(kanten) { await hochladen("brain_edges", liste(kanten).map(kantePruefen)); },
    async kantenEntfernen(ids) { await entfernen("brain_edges", idsPruefen(ids)); },
    async lueckenSchreiben(luecken) { await hochladen("brain_gaps", liste(luecken).map(lueckePruefen).map(lueckeZuZeile)); },
    async lueckenEntfernen(ids) { await entfernen("brain_gaps", idsPruefen(ids)); },

    /** „Von Gabi verwendet“: anzahl + 1 in der Datenbank (ein UPDATE – zwei Geräte gleichzeitig zählen beide). */
    async nutzungZaehlen(ids, wann) {
      const eindeutig = idsPruefen(liste(ids));
      if (!eindeutig.length) return [];
      const zeilen = await anfrage("rpc/brain_nutzung_zaehlen", { methode: "POST", body: { p_ids: eindeutig, p_zeit: iso(wann, new Date().toISOString()) } });
      return liste(zeilen).map(nutzungAusZeile);
    },

    /** Einstellung schreiben (wert undefined = entfernen). */
    async metaSchreiben(s, wert) {
      const name = metaSchluessel(s);
      if (metaWert(wert) === undefined) await anfrage(`brain_meta?schluessel=eq.${name}`, { methode: "DELETE", prefer: "return=minimal" });
      else await hochladen("brain_meta", [{ schluessel: name, wert }], "schluessel");
    },

    /**
     * Seed und Import: erst alles prüfen, dann schreiben. nurWennMeta { schluessel, wert }: nur ausführen, wenn die
     * Einstellung gerade diesen Wert hat (wert weglassen = „noch nicht gesetzt“) – sonst { uebersprungen: true }.
     * Ergebnis: { knoten: [mit endgültiger rev] }.
     */
    async stapel({ knoten = [], kanten = [], versionen = {}, luecken = [], nutzung = [], meta = null, nurWennMeta = null } = {}) {
      if (!Array.isArray(knoten) || knoten.length > SPEICHER_GRENZEN.stapelKnoten) throw new BrainFehler(413, `Zu viele Brain-Einträge auf einmal (höchstens ${SPEICHER_GRENZEN.stapelKnoten}).`);
      if (!Array.isArray(kanten) || kanten.length > SPEICHER_GRENZEN.stapelKanten) throw new BrainFehler(413, "Zu viele Verbindungen auf einmal.");
      const ks = knoten.map(knotenPruefen);
      const kas = kanten.map(kantePruefen);
      const ls = liste(luecken).map(lueckePruefen);
      const vs = Object.entries(istObjekt(versionen) ? versionen : {}).map(([id, stand]) => [kennung(id, KNOTEN_ID), liste(stand).map(versionPruefen)]);
      const ns = liste(nutzung).map((n) => {
        if (!istObjekt(n) || !Number.isInteger(n.anzahl) || n.anzahl < 0 || n.anzahl > BRAIN_GRENZEN.zahl) throw ungueltig("Nutzung");
        return { id: kennung(n.id, KNOTEN_ID), anzahl: n.anzahl, zuletzt: zeit(n.zuletzt, "Nutzung") };
      });
      const metas = Object.entries(istObjekt(meta) ? meta : {}).map(([s, w]) => [metaSchluessel(s), metaWert(w)]).filter(([, w]) => w !== undefined);
      if (nurWennMeta !== null && nurWennMeta !== undefined) {
        if (!istObjekt(nurWennMeta)) throw ungueltig("Bedingung");
        const name = metaSchluessel(nurWennMeta.schluessel);
        const soll = nurWennMeta.wert;
        const eigener = metas.find(([s]) => s === name);
        if (soll === undefined && eigener) {
          // „noch nicht gesetzt“ und der Stapel setzt die Einstellung selbst: zuerst anlegen – wer das schafft, darf (kein doppelter Seed)
          try {
            await anfrage("brain_meta", { methode: "POST", body: { schluessel: name, wert: eigener[1] }, prefer: "return=minimal" });
          } catch (e) {
            if (e instanceof BrainFehler && e.doppelt) return { uebersprungen: true };
            throw e;
          }
        } else {
          const ist = await anfrage(`brain_meta?select=wert&schluessel=eq.${name}`);
          const wert = ist && ist[0] ? ist[0].wert : undefined;
          if (JSON.stringify(wert) !== JSON.stringify(soll)) return { uebersprungen: true };
        }
      }
      // rev wie geliefert (mindestens 1), aber immer höher als die gespeicherte – ein veraltetes Gerät merkt es
      const ids = [...new Set(ks.map((k) => k.id))];
      const stand = new Map();
      for (let i = 0; i < ids.length; i += 100) {
        const teil = await anfrage(`brain_nodes?select=id,rev&id=in.(${ids.slice(i, i + 100).join(",")})`);
        for (const z of liste(teil)) stand.set(z.id, Number(z.rev) || 0);
      }
      const zeilen = new Map();
      for (const k of ks) {
        const rev = Math.max(k.rev || 1, (stand.get(k.id) || 0) + 1);
        stand.set(k.id, rev);
        zeilen.set(k.id, knotenZuZeile(k, rev));
      }
      await hochladen("brain_nodes", [...zeilen.values()]);
      await hochladen("brain_edges", kas);
      await hochladen("brain_gaps", ls.map(lueckeZuZeile));
      for (const [id, stand2] of vs) await verlaufAnhaengen(id, stand2);
      for (const n of ns) await anfrage(`brain_nodes?id=eq.${n.id}`, { methode: "PATCH", body: { nutzung_anzahl: n.anzahl, nutzung_zuletzt: iso(n.zuletzt) }, prefer: "return=minimal" });
      await hochladen("brain_meta", metas.map(([s, w]) => ({ schluessel: s, wert: w })), "schluessel");
      return { knoten: [...zeilen.values()].map(knotenAusZeile) };
    },
  };
}

/**
 * Brain-Routen ausführen (app.js hat Zugang, Rate-Limit, Methode und JSON schon geprüft).
 * Ergebnis: { status, daten } – Fehler als BrainFehler.
 */
export async function brainRoute(brainSpeicher, { pfad, methode, daten = {} }) {
  if (!brainSpeicher) throw new BrainFehler(503, "Die Datenbank für das Brain ist nicht eingerichtet.");
  const teile = pfad.split("/").slice(3).map((t) => { try { return decodeURIComponent(t); } catch { return ""; } }); // nach /api/brain
  if (!teile.length) return { status: 200, daten: await brainSpeicher.laden() };

  if (teile[0] === "knoten" && teile.length === 2) {
    const id = kennung(teile[1], KNOTEN_ID);
    if (methode === "DELETE") {
      if (!(await brainSpeicher.knotenEntfernen(id))) throw new BrainFehler(404, "Diesen Brain-Eintrag gibt es nicht (mehr).");
      return { status: 204, daten: null };
    }
    if (!istObjekt(daten.knoten) || daten.knoten.id !== id) throw ungueltig("Kennung");
    if (daten.erwartet !== undefined && daten.erwartet !== null && (!Number.isInteger(daten.erwartet) || daten.erwartet < 0)) throw ungueltig("Stand");
    const r = await brainSpeicher.knotenSchreiben(daten.knoten, { erwartet: daten.erwartet, version: daten.version || null, neu: daten.neu === true });
    if (r.konflikt) return { status: 409, daten: { konflikt: true, aktuell: r.aktuell, fehler: "Dieser Eintrag wurde inzwischen woanders geändert." } };
    return { status: 200, daten: { knoten: r.knoten } };
  }
  if (teile[0] === "knoten" && teile.length === 3 && teile[2] === "verlauf") return { status: 200, daten: { versionen: await brainSpeicher.verlauf(kennung(teile[1], KNOTEN_ID)) } };
  if (teile[0] === "stapel") {
    const r = await brainSpeicher.stapel({ knoten: liste(daten.knoten), kanten: liste(daten.kanten), versionen: daten.versionen, luecken: daten.luecken, nutzung: daten.nutzung, meta: daten.meta, nurWennMeta: daten.nurWennMeta });
    return { status: 200, daten: r };
  }
  if (teile[0] === "kanten" || teile[0] === "luecken") {
    const schreiben = teile[0] === "kanten" ? "kantenSchreiben" : "lueckenSchreiben";
    const weg = teile[0] === "kanten" ? "kantenEntfernen" : "lueckenEntfernen";
    if (methode === "DELETE") await brainSpeicher[weg](daten.ids);
    else {
      if (!Array.isArray(daten[teile[0]]) || daten[teile[0]].length > SPEICHER_GRENZEN.stapelKanten) throw ungueltig("Liste");
      await brainSpeicher[schreiben](daten[teile[0]]);
    }
    return { status: 204, daten: null };
  }
  if (teile[0] === "nutzung") {
    if (daten.zeit !== undefined && daten.zeit !== null && (!Number.isFinite(daten.zeit) || daten.zeit < 0)) throw ungueltig("Zeit");
    return { status: 200, daten: { nutzung: await brainSpeicher.nutzungZaehlen(daten.ids, daten.zeit) } };
  }
  if (teile[0] === "meta" && teile.length === 2) {
    await brainSpeicher.metaSchreiben(teile[1], daten.wert);
    return { status: 204, daten: null };
  }
  throw new BrainFehler(404, "Nicht gefunden.");
}

/**
 * Serverseitiger Abruf (BRAIN_QUELLE = "supabase"): Knoten aus der Datenbank laden, die besten zur Frage wählen
 * (kontextWaehlen aus brain-suche.js – dieselbe Suche wie im Browser) und als geprüften brainKontext zurückgeben.
 * Persona und Brain-Regeln kommen aus bestätigten Knoten; alles wird auf die Grenzen des Kontexts gekürzt.
 */
export async function brainKontextAusSpeicher({ brainSpeicher, kontextWaehlen, frage, jetzt = Date.now() }) {
  if (!brainSpeicher || typeof kontextWaehlen !== "function") throw new BrainFehler(503, "Der Abruf aus dem Brain ist auf dem Server nicht eingerichtet.");
  const { knoten, kanten, luecken, nutzung } = await brainSpeicher.laden();
  const aktive = knoten.filter((k) => !k.geloescht);
  const genutzt = new Set(liste(nutzung).filter((n) => n.anzahl > 0).map((n) => n.id));
  const auswahl = liste(kontextWaehlen({ frage, knoten: aktive, kanten, maxKnoten: BRAIN_GRENZEN.knoten, maxZeichen: 6000 })).slice(0, BRAIN_GRENZEN.knoten);
  const bestaetigt = aktive.filter((k) => k.status === "bestaetigt");
  const persona = bestaetigt.find((k) => k.art === "persona");
  const veraltetSeit = jetzt - 90 * 24 * 3600 * 1000;
  return brainKontextPruefen({
    v: 1,
    knoten: auswahl.map((k) => ({ id: k.id, art: k.art, status: k.status, titel: String(k.titel || "").slice(0, BRAIN_GRENZEN.titel), inhalt: String(k.inhalt || "").slice(0, BRAIN_GRENZEN.inhalt), tags: liste(k.tags).slice(0, BRAIN_GRENZEN.tags) })),
    persona: persona ? String(persona.inhalt || "").slice(0, BRAIN_GRENZEN.persona) : "",
    regeln: bestaetigt.filter((k) => k.art === "regel").slice(0, BRAIN_GRENZEN.regeln).map((k) => String(k.inhalt || "").slice(0, BRAIN_GRENZEN.regel)),
    stand: {
      knoten: aktive.length,
      bestaetigt: bestaetigt.length,
      entwurf: aktive.filter((k) => k.status === "entwurf").length,
      zuKlaeren: aktive.filter((k) => k.status === "zu_klaeren").length,
      veraltet: bestaetigt.filter((k) => k.geaendert && k.geaendert < veraltetSeit).length,
      nieVerwendet: bestaetigt.filter((k) => k.art === "praxiswissen" && !genutzt.has(k.id)).length,
      luecken: liste(luecken).filter((l) => l.status === "offen").length,
    },
  });
}
