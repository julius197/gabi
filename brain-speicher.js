/* Gabi – Brain-Speicher: wo das Brain liegt (Praxiswissen, Regeln, Persona, offene Fragen, Lücken, Nutzung).
   LOKAL/DEMO: nur im Browser dieses Geräts – IndexedDB „gabi-brain“ (Demo: „gabi-brain-demo“), sonst localStorage, sonst
   nur dieser Tab. Getrennt von den Gesprächen („gabi“/„gabi-demo“) und getrennt nach Demo und echtem Betrieb.
   SUPABASE (Entwurf, Schalter im Worker, Standard AUS): apiAblage() – dieselbe Schnittstelle über die Routen /api/brain…
   Die Regeln stehen EINMAL (ablageAus: rev prüfen und hochzählen, Verlauf anhängen und kürzen, Nutzung zählen, Stapel)
   und laufen je Ablage über einen atomaren Vorgang „lesen → rechnen → schreiben“ – so überschreibt ein veralteter Tab
   nichts unbemerkt. Abgeleitete Knoten (Patienten, Notizen, Berichte) werden hier nie gespeichert.
   Nie Inhalte in Logs oder Adressen. Formen und Schnittstelle: BRAIN-BAUPLAN.md §2. */
(function (wurzel, fabrik) {
  if (typeof module === "object" && module.exports) module.exports = fabrik();
  else wurzel.GabiBrainSpeicher = fabrik();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SCHEMA = 1;
  const VERLAUF_MAX = 20;
  const VERLAUF_MAX_LS = 5; // localStorage ist klein (rund 5 MB für alles): dort nur die letzten 5 Stände je Knoten
  const NOTFALL_MAX = 200000; // Zeichen – mehr passt nicht verlässlich in sessionStorage
  const ZEITLIMIT = 3000;
  const STORES = ["knoten", "versionen", "kanten", "luecken", "nutzung", "meta"];
  const SCHLUESSEL = { knoten: "id", versionen: "id", kanten: "id", luecken: "id", nutzung: "id", meta: "schluessel" };
  const PROBE = "__probe";
  const ID = /^[A-Za-z0-9_-]{1,80}$/;
  const META = /^[A-Za-z0-9_.-]{1,60}$/;
  const WELT = typeof self !== "undefined" ? self : globalThis;

  const TEXT = {
    speichern: "Das Brain konnte nicht gespeichert werden. Bitte versuch es noch einmal.",
    lesen: "Das Brain konnte nicht gelesen werden. Bitte lade die Seite neu.",
    voll: "Der Speicher dieses Browsers ist voll – die Änderung ist nicht gespeichert. Exportier dein Brain und lösch Altes aus dem Papierkorb.",
    zu: "Das Brain ist in diesem Fenster nicht mehr geöffnet. Bitte lade die Seite neu.",
    kennung: "Dieser Eintrag hat keine gültige Kennung.",
    abgeleitet: "Test-Patienten, Notizen und Berichte werden nicht im Brain gespeichert.",
    version: "Ungültiger Stand für den Verlauf.",
    kante: "Diese Verbindung hat keine gültige Kennung.",
    luecke: "Diese Wissenslücke hat keine gültige Kennung.",
    meta: "Ungültiger Schlüssel für die Brain-Einstellungen.",
    schema: "Die Schema-Nummer verwaltet der Speicher selbst.",
    leerenApi: "Das gemeinsame Brain lässt sich von diesem Gerät aus nicht leeren.",
    fremd: "Dieses Brain wurde mit einer neueren Gabi angelegt. Bitte lade die Seite neu.",
    gestoert: "Das Brain ließ sich gerade nicht öffnen.",
  };

  // ------------------------------------------------------------------
  // Hilfen
  // ------------------------------------------------------------------
  const kopie = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const istObjekt = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);
  const liste = (x) => (Array.isArray(x) ? x : []);
  const istId = (id) => typeof id === "string" && ID.test(id) && id !== "__proto__";
  const eins = (store, schluessel) => ({ store, schluessel });
  const alle = (store) => ({ store, alle: true });
  const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  /** Gespeicherte rev als ganze Zahl ≥ 0 (fehlt der Knoten oder die Angabe: 0). */
  const revVon = (k) => (k ? Math.max(0, Math.floor(Number(k.rev)) || 0) : 0);

  /** Fehler mit deutschem Satz für die Oberfläche (ohne Inhalte). */
  function fehler(text, extra) {
    return Object.assign(new Error(text), { brain: true }, extra || {});
  }

  /** Fehler des Browsers in einen verständlichen Satz übersetzen – eigene Fehler bleiben, wie sie sind. */
  function uebersetzen(e, schreibend) {
    if (e && e.brain) return e;
    const name = (e && e.name) || "Error";
    if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || (e && (e.code === 22 || e.code === 1014))) return fehler(TEXT.voll, { voll: true });
    if (name === "InvalidStateError") return fehler(TEXT.zu, { geschlossen: true });
    return fehler(schreibend ? TEXT.speichern : TEXT.lesen, { ursache: name });
  }

  function idPruefen(id, text = TEXT.kennung) {
    if (!istId(id)) throw fehler(text);
    return id;
  }

  /** Eintrag mit gültiger Kennung (Kante, Lücke, Nutzung) – als eigene Kopie. */
  function mitId(x, text) {
    if (!istObjekt(x)) throw fehler(text);
    idPruefen(x.id, text);
    return kopie(x);
  }

  /** Knoten vor dem Schreiben: gültige Kennung, nie ein abgeleiteter (Patient, Notiz, Bericht, Kernregeln) – als eigene Kopie. */
  function knotenPruefen(knoten) {
    if (!istObjekt(knoten)) throw fehler(TEXT.kennung);
    idPruefen(knoten.id);
    if (knoten.abgeleitet) throw fehler(TEXT.abgeleitet);
    return kopie(knoten);
  }

  function metaSchluessel(s) {
    if (typeof s !== "string" || !META.test(s) || s === "__proto__" || s === PROBE) throw fehler(TEXT.meta);
    if (s === "schema") throw fehler(TEXT.schema);
    return s;
  }

  /** Meta-Einträge [{ schluessel, wert }] → { schluessel: wert } (ohne die Schreibprobe). */
  function metaObjekt(eintraege) {
    const o = {};
    for (const m of liste(eintraege)) {
      if (!m || typeof m.schluessel !== "string" || m.schluessel === PROBE || m.schluessel === "__proto__") continue;
      o[m.schluessel] = m.wert;
    }
    return o;
  }

  /**
   * Stände an den Verlauf hängen: die Nummer vergibt der Speicher (fortlaufend, auch wenn alte Stände herausfallen),
   * behalten werden die letzten max. Ergebnis: älteste zuerst.
   */
  function verlaufAnhaengen(bisher, neue, max) {
    const alt = liste(bisher).filter(istObjekt);
    let nr = alt.reduce((m, v) => Math.max(m, Math.floor(Number(v.nr)) || 0), 0);
    const dazu = liste(neue).filter(istObjekt).map((v) => ({ ...kopie(v), nr: ++nr }));
    return [...alt, ...dazu].slice(-max);
  }

  /** Speicherorte je Betrieb: Demo und echt haben eigene Datenbanken und Schlüssel – nichts vermischt sich. */
  function namen(demo) {
    const vorsatz = demo ? "gabi.demo.brain." : "gabi.brain.";
    return { db: demo ? "gabi-brain-demo" : "gabi-brain", vorsatz, kanal: demo ? "gabi-brain-demo" : "gabi-brain", marke: `${vorsatz}leeren-offen`, notfall: `${vorsatz}notfall` };
  }

  // ------------------------------------------------------------------
  // Migration: ältere Stände auf SCHEMA heben (rein, ohne Browser testbar)
  // daten: { knoten, versionen: { id: Version[] }, kanten, luecken, nutzung, meta }
  // ------------------------------------------------------------------
  const MIGRATIONEN = [
    {
      // Schema 0 (Vorabstand): Status hieß „offen“, rev und geloescht gab es noch nicht
      von: 0,
      nach: 1,
      lauf(d) {
        const status = (s) => (s === "offen" ? "zu_klaeren" : s);
        for (const k of d.knoten) {
          k.status = status(k.status);
          if (!Number.isInteger(k.rev) || k.rev < 1) k.rev = 1;
          if (!Number.isFinite(k.geloescht) || k.geloescht < 0) k.geloescht = 0;
          if (!Array.isArray(k.tags)) k.tags = [];
          k.geschuetzt = Boolean(k.geschuetzt);
        }
        for (const stand of Object.values(d.versionen)) for (const v of stand) v.status = status(v.status);
      },
    },
  ];

  function migrieren(daten, von = 0) {
    const q = istObjekt(daten) ? daten : {};
    const mitKennung = (l) => liste(l).filter((x) => istObjekt(x) && istId(x.id)).map(kopie); // ohne Kennung nicht speicherbar
    const d = {
      knoten: mitKennung(q.knoten),
      versionen: Object.fromEntries(Object.entries(istObjekt(q.versionen) ? q.versionen : {}).filter(([id]) => istId(id)).map(([id, l]) => [id, liste(l).filter(istObjekt).map(kopie)])),
      kanten: mitKennung(q.kanten),
      luecken: mitKennung(q.luecken),
      nutzung: mitKennung(q.nutzung),
      meta: istObjekt(q.meta) ? kopie(q.meta) : {},
    };
    let schema = Number.isInteger(von) && von >= 0 ? von : 0;
    for (const m of MIGRATIONEN) {
      if (m.von !== schema) continue;
      m.lauf(d);
      schema = m.nach;
    }
    d.meta.schema = Math.max(schema, SCHEMA);
    return d;
  }

  /**
   * Beim Öffnen, in EINEM schreibenden Vorgang (zwei Tabs heben nie gleichzeitig): Schema-Nummer lesen, leere Ablage
   * stempeln, ältere Stände heben. Ein neuerer Stand (Seite älter als die Daten) wird nicht angefasst.
   */
  function schemaSichern(kv) {
    return kv.vorgang({
      schreibend: true,
      lesen: STORES.map(alle),
      rechne: ([knoten, versionen, kanten, luecken, nutzung, meta]) => {
        const m = metaObjekt(meta);
        const schema = m.schema;
        if (schema === SCHEMA) return { ergebnis: { schema: SCHEMA } };
        const stempel = { store: "meta", wert: { schluessel: "schema", wert: SCHEMA } };
        const leer = !knoten.length && !versionen.length && !kanten.length && !luecken.length && !nutzung.length;
        if (schema === undefined && leer) return { schreiben: [stempel], ergebnis: { schema: SCHEMA } };
        if (Number.isInteger(schema) && schema > SCHEMA) return { ergebnis: { schema, schemaFremd: true } };
        const von = Number.isInteger(schema) && schema >= 0 ? schema : 0;
        const neu = migrieren({ knoten, versionen: Object.fromEntries(versionen.filter((v) => v && istId(v.id)).map((v) => [v.id, v.liste])), kanten, luecken, nutzung, meta: m }, von);
        const schreiben = STORES.map((s) => ({ store: s, leeren: true }));
        for (const k of neu.knoten) schreiben.push({ store: "knoten", wert: k });
        for (const [id, stand] of Object.entries(neu.versionen)) schreiben.push({ store: "versionen", wert: { id, liste: stand } });
        for (const k of neu.kanten) schreiben.push({ store: "kanten", wert: k });
        for (const l of neu.luecken) schreiben.push({ store: "luecken", wert: l });
        for (const n of neu.nutzung) schreiben.push({ store: "nutzung", wert: n });
        for (const [s, w] of Object.entries(neu.meta)) if (META.test(s) && s !== "schema") schreiben.push({ store: "meta", wert: { schluessel: s, wert: w } });
        schreiben.push(stempel);
        return { schreiben, ergebnis: { schema: SCHEMA, migriert: { von, nach: SCHEMA } } };
      },
    });
  }

  // ------------------------------------------------------------------
  // Die Regeln – einmal, für jede Ablage mit atomarem Vorgang:
  //   kv.vorgang({ lesen: [{ store, schluessel } | { store, alle }], rechne(werte) → { schreiben, ergebnis }, schreibend })
  //   schreiben: [{ store, wert } | { store, schluessel, loeschen: true } | { store, leeren: true }] – in dieser Reihenfolge
  // ------------------------------------------------------------------
  function ablageAus(kv, { art, verlaufMax = VERLAUF_MAX }) {
    const lies = (lesen, rechne) => kv.vorgang({ lesen, rechne, schreibend: false });
    // Stand von einer neueren Gabi (schemaFremd): lesen ja, schreiben nein – alter Code soll neuere Daten nicht verbiegen
    const schreib = (lesen, rechne) => {
      if (ablage.schemaFremd) return Promise.reject(fehler(TEXT.fremd, { schemaFremd: true }));
      if (!ablage.nurLesen) return kv.vorgang({ lesen, rechne, schreibend: true });
      // „nur lesen“ (beim Öffnen ließ der Speicher nicht schreiben): Sobald wirklich wieder etwas geschrieben ist, gilt das
      // nicht mehr – der Hinweis der Oberfläche verschwindet ohne Neuladen. Ein Vorgang ohne Schreiben beweist nichts.
      let geschrieben = false;
      const merke = (werte) => { const r = rechne(werte) || {}; geschrieben = liste(r.schreiben).length > 0; return r; };
      return kv.vorgang({ lesen, rechne: merke, schreibend: true }).then((ergebnis) => { if (geschrieben) ablage.nurLesen = false; return ergebnis; });
    };
    /** Einträge mit Kennung schreiben bzw. per Kennung entfernen (Kanten, Lücken). */
    const ablegen = async (store, eintraege, text) => {
      const sauber = liste(eintraege).map((x) => mitId(x, text));
      if (sauber.length) await schreib([], () => ({ schreiben: sauber.map((wert) => ({ store, wert })) }));
    };
    const entfernen = async (store, ids) => {
      const weg = [...new Set(liste(ids).filter(istId))];
      if (weg.length) await schreib([], () => ({ schreiben: weg.map((schluessel) => ({ store, schluessel, loeschen: true })) }));
    };

    const ablage = {
      art,
      schema: SCHEMA,
      verlaufMax,

      /**
       * Öffnen mit Schreibprobe, dann Schema prüfen. Setzt ablage.schema, ggf. ablage.migriert, ablage.schemaFremd
       * (Stand von einer neueren Gabi – nicht angefasst, Schreiben wird abgelehnt) bzw. ablage.nurLesen (IndexedDB mit
       * Brain, die gerade nicht schreiben lässt).
       */
      async bereit() {
        const info = await kv.bereit();
        try {
          Object.assign(ablage, info || {}, await schemaSichern(kv));
        } catch (e) {
          if (kv.schliessen) kv.schliessen();
          throw e;
        }
      },

      /** Alles außer dem Verlauf. knoten enthält auch den Papierkorb (geloescht > 0). */
      async laden() {
        const [knoten, kanten, luecken, nutzung, meta] = await lies(["knoten", "kanten", "luecken", "nutzung", "meta"].map(alle), (w) => ({ ergebnis: w }));
        return { knoten, kanten, luecken, nutzung, meta: metaObjekt(meta) };
      },

      /**
       * Knoten schreiben – atomar gegen den gespeicherten Stand geprüft:
       * - neu: darf noch nicht existieren → sonst { konflikt: true, aktuell }
       * - erwartet (zuletzt gesehene rev): weicht die gespeicherte ab → { konflikt: true, aktuell }; gibt es den Knoten
       *   nicht mehr (anderswo endgültig entfernt) → { konflikt: true, aktuell: null } – er wird nicht wieder angelegt
       * - sonst: rev = gespeicherte rev + 1; version (Stand VOR der Änderung) kommt an den Verlauf → { ok: true, knoten }
       */
      async knotenSchreiben(knoten, { erwartet, version = null, neu = false } = {}) {
        const k = knotenPruefen(knoten);
        if (version !== null && version !== undefined && !istObjekt(version)) throw fehler(TEXT.version);
        return schreib([eins("knoten", k.id), eins("versionen", k.id)], ([alt, verlauf]) => {
          if (neu) {
            if (alt) return { ergebnis: { konflikt: true, aktuell: alt } };
          } else if (erwartet !== undefined && erwartet !== null) {
            if (!alt) return { ergebnis: { konflikt: true, aktuell: null } };
            if (revVon(alt) !== Number(erwartet)) return { ergebnis: { konflikt: true, aktuell: alt } };
          }
          k.rev = revVon(alt) + 1;
          const schreiben = [{ store: "knoten", wert: k }];
          if (version) schreiben.push({ store: "versionen", wert: { id: k.id, liste: verlaufAnhaengen(verlauf && verlauf.liste, [version], verlaufMax) } });
          return { schreiben, ergebnis: { ok: true, knoten: kopie(k) } };
        });
      },

      /** Endgültig: Knoten, Verlauf und Nutzung. Kanten räumt das Modell (kantenEntfernen). */
      async knotenEntfernen(ids) {
        const weg = [...new Set(liste(ids).filter(istId))];
        if (!weg.length) return;
        await schreib([], () => ({ schreiben: weg.flatMap((schluessel) => ["knoten", "versionen", "nutzung"].map((store) => ({ store, schluessel, loeschen: true }))) }));
      },

      /** Verlauf eines Knotens, älteste zuerst (höchstens verlaufMax). */
      async verlauf(id) {
        if (!istId(id)) return [];
        return lies([eins("versionen", id)], ([v]) => ({ ergebnis: liste(v && v.liste) }));
      },

      kantenSchreiben: (kanten) => ablegen("kanten", kanten, TEXT.kante),
      kantenEntfernen: (ids) => entfernen("kanten", ids),
      lueckenSchreiben: (luecken) => ablegen("luecken", luecken, TEXT.luecke),
      lueckenEntfernen: (ids) => entfernen("luecken", ids),

      /**
       * „Von Gabi verwendet“: je Knoten anzahl + 1 und zuletzt = zeit – atomar (zwei Tabs gleichzeitig: beide gezählt).
       * Jede Kennung zählt je Aufruf einmal; Knoten, die es nicht (mehr) gibt, werden nicht gezählt.
       * Ergebnis: die neuen Zählerstände [{ id, anzahl, zuletzt }].
       */
      async nutzungZaehlen(ids, zeit) {
        const eindeutig = [...new Set(liste(ids).filter(istId))];
        if (!eindeutig.length) return [];
        const wann = Number.isFinite(zeit) ? zeit : Date.now();
        return schreib(eindeutig.flatMap((id) => [eins("knoten", id), eins("nutzung", id)]), (w) => {
          const schreiben = [];
          const ergebnis = [];
          eindeutig.forEach((id, i) => {
            if (!w[2 * i]) return;
            const alt = w[2 * i + 1];
            const n = { id, anzahl: (alt && Number.isFinite(alt.anzahl) ? alt.anzahl : 0) + 1, zuletzt: Math.max(alt && Number.isFinite(alt.zuletzt) ? alt.zuletzt : 0, wann) };
            schreiben.push({ store: "nutzung", wert: n });
            ergebnis.push({ ...n });
          });
          return { schreiben, ergebnis };
        });
      },

      /** Einstellung schreiben (wert undefined = entfernen). „schema“ verwaltet der Speicher selbst. */
      async metaSchreiben(schluessel, wert) {
        const s = metaSchluessel(schluessel);
        const w = kopie(wert);
        await schreib([], () => ({ schreiben: [w === undefined ? { store: "meta", schluessel: s, loeschen: true } : { store: "meta", wert: { schluessel: s, wert: w } }] }));
      },

      /**
       * Seed und Import in EINEM Vorgang – ganz oder gar nicht:
       * - knoten: rev wie geliefert (mindestens 1), aber immer höher als die gespeicherte (ein veralteter Tab merkt es)
       * - versionen: { id: Version[] } wird an den jeweiligen Verlauf gehängt
       * - zusätzlich möglich: luecken, nutzung ([{ id, anzahl, zuletzt }], Zählerstand gesetzt), meta ({ schluessel: wert })
       * - nurWennMeta: { schluessel, wert } – nur ausführen, wenn die Einstellung gerade diesen Wert hat (wert weglassen =
       *   „noch nicht gesetzt“); sonst { ok: false, uebersprungen: true }. So spielen zwei Tabs den Seed nicht doppelt ein.
       * Ergebnis: { ok: true, knoten: [mit endgültiger rev] }
       */
      async stapel({ knoten = [], kanten = [], versionen = {}, luecken = [], nutzung = [], meta = null, nurWennMeta = null } = {}) {
        // erst alles prüfen: ein ungültiger Eintrag, und nichts wird geschrieben
        const ks = liste(knoten).map(knotenPruefen);
        const kas = liste(kanten).map((x) => mitId(x, TEXT.kante));
        const ls = liste(luecken).map((x) => mitId(x, TEXT.luecke));
        const ns = liste(nutzung).map((x) => mitId(x, TEXT.kennung));
        const vs = Object.entries(istObjekt(versionen) ? versionen : {}).map(([id, stand]) => [idPruefen(id), liste(stand)]);
        const ms = Object.entries(istObjekt(meta) ? meta : {}).map(([s, w]) => [metaSchluessel(s), kopie(w)]);
        const bedingung = istObjekt(nurWennMeta) ? { schluessel: metaSchluessel(nurWennMeta.schluessel), wert: kopie(nurWennMeta.wert) } : null;
        const ids = [...new Set(ks.map((k) => k.id))];
        const lesen = [...ids.map((id) => eins("knoten", id)), ...vs.map(([id]) => eins("versionen", id)), ...(bedingung ? [eins("meta", bedingung.schluessel)] : [])];
        return schreib(lesen, (w) => {
          if (bedingung) {
            const ist = w[w.length - 1];
            if (!gleich(ist ? ist.wert : undefined, bedingung.wert)) return { ergebnis: { ok: false, uebersprungen: true } };
          }
          const stand = new Map(ids.map((id, i) => [id, w[i]]));
          const schreiben = [];
          for (const k of ks) {
            k.rev = Math.max(revVon(k) || 1, revVon(stand.get(k.id)) + 1);
            stand.set(k.id, k);
            schreiben.push({ store: "knoten", wert: k });
          }
          vs.forEach(([id, dazu], i) => {
            const alt = w[ids.length + i];
            schreiben.push({ store: "versionen", wert: { id, liste: verlaufAnhaengen(alt && alt.liste, dazu, verlaufMax) } });
          });
          for (const wert of kas) schreiben.push({ store: "kanten", wert });
          for (const wert of ls) schreiben.push({ store: "luecken", wert });
          for (const n of ns) schreiben.push({ store: "nutzung", wert: { id: n.id, anzahl: Math.max(0, Math.floor(Number(n.anzahl)) || 0), zuletzt: Math.max(0, Number(n.zuletzt) || 0) } });
          for (const [s, wert] of ms) schreiben.push(wert === undefined ? { store: "meta", schluessel: s, loeschen: true } : { store: "meta", wert: { schluessel: s, wert } });
          return { schreiben, ergebnis: { ok: true, knoten: ks.map(kopie) } };
        });
      },

      /** Alles weg (Knoten, Verlauf, Kanten, Lücken, Nutzung, Einstellungen) – die Schema-Nummer bleibt. */
      async leeren() {
        await schreib([], () => ({ schreiben: [...STORES.map((s) => ({ store: s, leeren: true })), { store: "meta", wert: { schluessel: "schema", wert: SCHEMA } }] }));
      },

      /** Verbindung schließen (nur IndexedDB hält eine) – danach lehnt die Ablage jeden Zugriff verständlich ab. */
      schliessen() {
        if (kv.schliessen) kv.schliessen();
      },
    };
    return ablage;
  }

  // ------------------------------------------------------------------
  // Ablage 1: IndexedDB – ein Vorgang = eine Transaktion über alle Stores; gemeldet wird erst bei „complete“.
  // readwrite-Transaktionen laufen auch über Tabs hinweg nacheinander: Lesen, Prüfen und Schreiben sind atomar.
  // ------------------------------------------------------------------
  function idbKv(name, idb, { zeitlimit = ZEITLIMIT } = {}) {
    let db = null;

    const oeffnen = () => new Promise((ok, nein) => {
      let r;
      try { r = idb.open(name, 1); } catch (e) { nein(e); return; }
      let abgelaufen = false;
      const uhr = setTimeout(() => { abgelaufen = true; nein(new Error("IndexedDB antwortet nicht")); }, zeitlimit);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: SCHLUESSEL[s] });
      };
      r.onsuccess = () => {
        clearTimeout(uhr);
        const d = r.result;
        if (abgelaufen) { try { d.close(); } catch { /* egal */ } return; } // zu spät: nicht offen liegen lassen
        // ein anderer Tab räumt die Datenbank ab oder hebt sie auf eine neue Version: Platz machen
        d.onversionchange = () => { try { d.close(); } catch { /* egal */ } if (db === d) db = null; };
        ok(d);
      };
      r.onerror = () => { clearTimeout(uhr); nein(r.error || new Error("IndexedDB")); };
      r.onblocked = () => { clearTimeout(uhr); nein(new Error("IndexedDB blockiert")); };
    });

    const vorgang = ({ lesen = [], rechne, schreibend = false }) => new Promise((ok, nein) => {
      if (!db) { nein(fehler(TEXT.zu, { geschlossen: true })); return; }
      let t;
      try { t = db.transaction(STORES, schreibend ? "readwrite" : "readonly"); } catch (e) { nein(uebersetzen(e, schreibend)); return; }
      let ergebnis;
      let grund = null; // eigener Abbruch (Fehler beim Rechnen oder Schreiben) – sonst steht der Grund in t.error
      const scheitern = () => nein(uebersetzen(grund || t.error, schreibend));
      t.oncomplete = () => ok(ergebnis);
      t.onerror = scheitern;
      t.onabort = scheitern;
      const abbrechen = (e) => { grund = e; try { t.abort(); } catch { scheitern(); } };
      const werte = new Array(lesen.length);
      let offen = lesen.length;
      const weiter = () => {
        try {
          const r = rechne(werte) || {};
          ergebnis = r.ergebnis;
          for (const op of r.schreiben || []) {
            const s = t.objectStore(op.store);
            if (op.leeren) s.clear();
            else if (op.loeschen) s.delete(op.schluessel);
            else s.put(op.wert);
          }
        } catch (e) {
          abbrechen(e); // nichts von diesem Vorgang bleibt stehen
        }
      };
      if (!offen) { weiter(); return; }
      try {
        lesen.forEach((l, i) => {
          const s = t.objectStore(l.store);
          const r = l.alle ? s.getAll() : s.get(l.schluessel);
          r.onsuccess = () => { werte[i] = r.result; offen -= 1; if (offen === 0) weiter(); };
        });
      } catch (e) {
        abbrechen(e);
      }
    });

    const schliessen = () => { try { if (db) db.close(); } catch { /* egal */ } db = null; };

    return {
      async bereit() {
        if (!db) db = await oeffnen(); // zweimal gerufen: keine zweite Verbindung
        try {
          // Schreibprobe: manche privaten Fenster öffnen die Datenbank, lassen aber nicht schreiben
          await vorgang({ schreibend: true, rechne: () => ({ schreiben: [{ store: "meta", wert: { schluessel: PROBE, wert: 1 } }, { store: "meta", schluessel: PROBE, loeschen: true }] }) });
          return {};
        } catch (e) {
          // Schreiben geht nicht (z. B. Gerät voll). Liegt hier schon ein Brain, bleibt es sichtbar – nur lesen, jedes
          // Speichern meldet den Grund. In einer Ersatz-Ablage stünde sonst plötzlich ein leeres Brain da.
          let vorhanden = false;
          try { vorhanden = await vorgang({ lesen: [alle("knoten")], rechne: ([k]) => ({ ergebnis: k.length > 0 }) }); } catch { vorhanden = false; }
          if (vorhanden) return { nurLesen: true };
          schliessen();
          throw e;
        }
      },
      vorgang,
      schliessen,
    };
  }

  // ------------------------------------------------------------------
  // Ablage 2: localStorage – ein Dokument „<vorsatz>v1“. Lesen, Rechnen und Schreiben laufen in einem Zug (synchron).
  // Voller Speicher: setItem wirft, der alte Stand bleibt stehen, die Oberfläche bekommt einen verständlichen Fehler.
  // ------------------------------------------------------------------
  const sortiert = (o) => Object.keys(o).sort().map((k) => o[k]);

  function lsKv(vorsatz, ls) {
    const DOK = `${vorsatz}v1`;
    const leer = () => Object.fromEntries(STORES.map((s) => [s, {}]));
    function dokument() {
      const roh = ls.getItem(DOK);
      if (roh === null || roh === "") return leer();
      try {
        const d = JSON.parse(roh);
        if (!istObjekt(d)) throw new Error("kein Dokument");
        for (const s of STORES) if (!istObjekt(d[s])) d[s] = {};
        return d;
      } catch {
        // unlesbar: nicht still wegwerfen – beiseitelegen (resteLoeschen nimmt es mit), dann leer beginnen
        try { ls.setItem(`${DOK}.defekt`, roh); } catch { /* voll oder gesperrt */ }
        return leer();
      }
    }
    return {
      async bereit() { const k = `${vorsatz}probe`; ls.setItem(k, "1"); ls.removeItem(k); },
      vorgang: ({ lesen = [], rechne, schreibend = false }) => new Promise((ok, nein) => {
        try {
          const dok = dokument();
          const hat = (store, k) => Object.prototype.hasOwnProperty.call(dok[store], k);
          const r = rechne(lesen.map((l) => (l.alle ? sortiert(dok[l.store]) : hat(l.store, l.schluessel) ? dok[l.store][l.schluessel] : undefined))) || {};
          const schreiben = r.schreiben || [];
          if (schreiben.length) {
            for (const op of schreiben) {
              if (op.leeren) dok[op.store] = {};
              else if (op.loeschen) delete dok[op.store][op.schluessel];
              else dok[op.store][op.wert[SCHLUESSEL[op.store]]] = op.wert;
            }
            ls.setItem(DOK, JSON.stringify(dok));
          }
          ok(r.ergebnis);
        } catch (e) {
          nein(uebersetzen(e, schreibend));
        }
      }),
    };
  }

  // ------------------------------------------------------------------
  // Ablage 3: nur dieser Tab (Arbeitsspeicher) – letzter Ersatz, und für Tests. Zwei Ablagen auf demselben Dokument
  // verhalten sich wie zwei Tabs.
  // ------------------------------------------------------------------
  const neuesDokument = () => Object.fromEntries(STORES.map((s) => [s, new Map()]));

  function speicherKv(dok = neuesDokument()) {
    return {
      async bereit() {},
      vorgang: ({ lesen = [], rechne, schreibend = false }) => new Promise((ok, nein) => {
        try {
          const r = rechne(lesen.map((l) => (l.alle ? [...dok[l.store].keys()].sort().map((k) => kopie(dok[l.store].get(k))) : kopie(dok[l.store].get(l.schluessel))))) || {};
          // erst alle Kopien anfertigen, dann anwenden – scheitert eine, ändert sich nichts
          const fertig = (r.schreiben || []).map((op) => (op.leeren || op.loeschen ? op : { store: op.store, wert: kopie(op.wert) }));
          for (const op of fertig) {
            if (op.leeren) dok[op.store].clear();
            else if (op.loeschen) dok[op.store].delete(op.schluessel);
            else dok[op.store].set(op.wert[SCHLUESSEL[op.store]], op.wert);
          }
          ok(r.ergebnis);
        } catch (e) {
          nein(uebersetzen(e, schreibend));
        }
      }),
    };
  }

  const idbAblage = (name, idb, optionen) => ablageAus(idbKv(name, idb, optionen), { art: "indexeddb" });
  const lsAblage = (vorsatz, ls) => ablageAus(lsKv(vorsatz, ls), { art: "localstorage", verlaufMax: VERLAUF_MAX_LS });
  const speicherAblage = (dokument) => ablageAus(speicherKv(dokument), { art: "speicher" });

  // ------------------------------------------------------------------
  // Ablage 4 (Entwurf): Supabase über den Worker – gleiche Schnittstelle, die Regeln prüft dort der Server.
  // api = (pfad, { methode, body }) → Promise<daten>; wirft Fehler mit .status. Kein eigenes fetch in dieser Datei:
  // jede Anfrage läuft über api() der App (Zugangscode, Zeitlimit, Fehlertexte).
  // ------------------------------------------------------------------
  function apiAblage(api) {
    const ruf = (pfad, methode, body) => api(pfad, body === undefined ? { methode } : { methode, body });
    const stelle = (id) => encodeURIComponent(idPruefen(id));
    const ablage = {
      art: "api",
      schema: SCHEMA,
      verlaufMax: VERLAUF_MAX,
      async bereit() {},

      async laden() {
        const d = (await ruf("/api/brain", "GET")) || {};
        return { knoten: liste(d.knoten), kanten: liste(d.kanten), luecken: liste(d.luecken), nutzung: liste(d.nutzung), meta: istObjekt(d.meta) ? d.meta : {} };
      },

      async knotenSchreiben(knoten, { erwartet, version = null, neu = false } = {}) {
        const k = knotenPruefen(knoten);
        if (version !== null && version !== undefined && !istObjekt(version)) throw fehler(TEXT.version);
        try {
          const d = await ruf(`/api/brain/knoten/${stelle(k.id)}`, "PUT", { knoten: k, erwartet: erwartet === null ? undefined : erwartet, version: version || null, neu: Boolean(neu) });
          return { ok: true, knoten: (d && d.knoten) || k };
        } catch (f) {
          if (!f || f.status !== 409) throw f;
          // 409 = Konflikt, kein Fehler. Reicht api() den Antworttext nicht durch, den aktuellen Stand selbst holen.
          if (istObjekt(f.daten) && "aktuell" in f.daten) return { konflikt: true, aktuell: f.daten.aktuell || null };
          const stand = await ablage.laden();
          return { konflikt: true, aktuell: stand.knoten.find((x) => x && x.id === k.id) || null };
        }
      },

      async knotenEntfernen(ids) {
        for (const id of [...new Set(liste(ids).filter(istId))]) {
          try { await ruf(`/api/brain/knoten/${stelle(id)}`, "DELETE"); } catch (f) { if (!f || f.status !== 404) throw f; } // schon weg: gut
        }
      },

      async verlauf(id) {
        if (!istId(id)) return [];
        const d = await ruf(`/api/brain/knoten/${stelle(id)}/verlauf`, "GET");
        return liste(d && d.versionen);
      },

      async kantenSchreiben(kanten) {
        const sauber = liste(kanten).map((x) => mitId(x, TEXT.kante));
        if (sauber.length) await ruf("/api/brain/kanten", "PUT", { kanten: sauber });
      },
      async kantenEntfernen(ids) {
        const weg = [...new Set(liste(ids).filter(istId))];
        if (weg.length) await ruf("/api/brain/kanten", "DELETE", { ids: weg });
      },
      async lueckenSchreiben(luecken) {
        const sauber = liste(luecken).map((x) => mitId(x, TEXT.luecke));
        if (sauber.length) await ruf("/api/brain/luecken", "PUT", { luecken: sauber });
      },
      async lueckenEntfernen(ids) {
        const weg = [...new Set(liste(ids).filter(istId))];
        if (weg.length) await ruf("/api/brain/luecken", "DELETE", { ids: weg });
      },

      async nutzungZaehlen(ids, zeit) {
        const eindeutig = [...new Set(liste(ids).filter(istId))];
        if (!eindeutig.length) return [];
        const d = await ruf("/api/brain/nutzung", "POST", { ids: eindeutig, zeit: Number.isFinite(zeit) ? zeit : Date.now() });
        return liste(d && d.nutzung);
      },

      async metaSchreiben(schluessel, wert) {
        await ruf(`/api/brain/meta/${encodeURIComponent(metaSchluessel(schluessel))}`, "PUT", { wert: kopie(wert) });
      },

      async stapel({ knoten = [], kanten = [], versionen = {}, luecken, nutzung, meta, nurWennMeta } = {}) {
        const ks = liste(knoten).map(knotenPruefen);
        const body = { knoten: ks, kanten: liste(kanten).map((x) => mitId(x, TEXT.kante)), versionen: istObjekt(versionen) ? kopie(versionen) : {} };
        // Erweiterungen nur mitschicken, wenn sie gebraucht werden (der Grundvertrag bleibt knoten/kanten/versionen)
        if (liste(luecken).length) body.luecken = liste(luecken).map((x) => mitId(x, TEXT.luecke));
        if (liste(nutzung).length) body.nutzung = liste(nutzung).map((x) => mitId(x, TEXT.kennung));
        if (istObjekt(meta)) body.meta = Object.fromEntries(Object.entries(meta).map(([s, w]) => [metaSchluessel(s), kopie(w)]));
        if (istObjekt(nurWennMeta)) body.nurWennMeta = { schluessel: metaSchluessel(nurWennMeta.schluessel), wert: kopie(nurWennMeta.wert) };
        const d = (await ruf("/api/brain/stapel", "POST", body)) || {};
        if (d.uebersprungen) return { ok: false, uebersprungen: true };
        return { ok: true, knoten: Array.isArray(d.knoten) ? d.knoten : ks };
      },

      /** Bewusst gesperrt: Das gemeinsame Brain gehört der Praxis, nicht diesem Gerät. */
      async leeren() {
        throw fehler(TEXT.leerenApi, { nichtErlaubt: true });
      },

      schliessen() {},
    };
    return ablage;
  }

  // ------------------------------------------------------------------
  // Öffnen: beste verfügbare Ablage – IndexedDB → localStorage → nur dieser Tab
  // Liegt das Brain einmal in IndexedDB, merkt sich das eine kleine Marke in localStorage („<vorsatz>ablage“; resteLoeschen
  // nimmt sie mit). Antwortet IndexedDB dann bei einem Start nicht (Hänger, Fehler beim Öffnen), wird NICHT in eine leere
  // Ersatz-Ablage ausgewichen: Dort spielte der Seed ein zweites Brain ein – ohne die eigenen Einträge, ohne jeden Hinweis,
  // und was man darin anlegte, wäre beim nächsten normalen Start unsichtbar. Stattdessen: Fehler mit Satz (gestoert) – die
  // Oberfläche zeigt ihn mit „Nochmal versuchen“, das Brain in IndexedDB bleibt unberührt.
  // ------------------------------------------------------------------
  async function oeffnen({ demo = false, umgebung = WELT, zeitlimit = ZEITLIMIT } = {}) {
    const n = namen(demo);
    const ORT = `${n.vorsatz}ablage`;
    let idb = null;
    let ls = null;
    try { idb = umgebung.indexedDB || null; } catch { idb = null; }
    try { ls = umgebung.localStorage || null; } catch { ls = null; }
    const lies = (schluessel) => { try { return ls ? ls.getItem(schluessel) : null; } catch { return null; } };
    const liegtInIdb = lies(ORT) === "indexeddb";
    // offenes Löschen von einem früheren Abmelden (IndexedDB hing damals): Das alte Brain soll weg – dann darf ausgewichen werden
    const loeschenOffen = lies(n.marke) === "1";
    if (!idb && liegtInIdb && !loeschenOffen) throw fehler(TEXT.gestoert, { gestoert: true });
    const versuche = [];
    if (idb) versuche.push(() => idbAblage(n.db, idb, { zeitlimit }));
    if (ls) versuche.push(() => lsAblage(n.vorsatz, ls));
    for (const neu of versuche) {
      const a = neu();
      try {
        await a.bereit();
        if (a.art === "indexeddb" && ls) {
          if (loeschenOffen) {
            await a.leeren(); // jetzt zuerst nachholen – scheitert es wieder: Marke bleibt, weiter mit der nächsten Ablage
            try { ls.removeItem(n.marke); } catch { /* egal */ }
            a.nachgeholt = true;
          }
          if (!liegtInIdb) { try { ls.setItem(ORT, "indexeddb"); } catch { /* voll oder gesperrt: dann ohne Marke */ } }
        }
        return a;
      } catch (e) {
        a.schliessen(); // keine halb geöffnete Verbindung liegen lassen
        // Die Datenbank stammt von einer neueren Gabi: nicht in eine leere Ersatz-Ablage ausweichen (dort würde der Seed
        // ein zweites Brain anlegen) – nur dieser Tab, mit Kennzeichen; nach dem Neuladen passt es wieder.
        if (e && e.name === "VersionError") {
          const ersatz = speicherAblage();
          await ersatz.bereit();
          ersatz.schemaFremd = true;
          return ersatz;
        }
        // Hier liegt schon ein Brain, und IndexedDB antwortet gerade nicht: kein zweites Brain im Ersatz (siehe oben)
        if (a.art === "indexeddb" && liegtInIdb && !loeschenOffen) throw fehler(TEXT.gestoert, { gestoert: true });
        /* sonst: nächste Möglichkeit */
      }
    }
    const a = speicherAblage();
    await a.bereit();
    return a;
  }

  /**
   * Alles vom Gerät nehmen (Abmelden mit Häkchen, Demo zurücksetzen): Datenbank leeren – ohne sie neu anzulegen –,
   * alle Schlüssel „gabi.brain.…“ bzw. „gabi.demo.brain.…“ in localStorage (Dokument, Positionen, Ansicht, Hinweise)
   * und die Notfall-Kopie. Ließ sich IndexedDB gerade nicht leeren: Marke setzen (der nächste Start mit IndexedDB leert
   * zuerst, siehe oeffnen) und false melden. Offene Tabs arbeiten auf der geleerten Datenbank weiter; ein dort noch
   * bearbeiteter Knoten wird beim Speichern nicht wieder angelegt (knotenSchreiben mit erwartet → Konflikt).
   */
  async function resteLoeschen({ demo = false, umgebung = WELT, zeitlimit = ZEITLIMIT } = {}) {
    const n = namen(demo);
    try {
      const ls = umgebung.localStorage;
      const weg = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(n.vorsatz) && k !== n.marke) weg.push(k);
      }
      for (const k of weg) ls.removeItem(k);
    } catch { /* gesperrt – dann liegt dort auch nichts */ }
    try { umgebung.sessionStorage.removeItem(n.notfall); } catch { /* gesperrt */ }

    let idb = null;
    let idbDa = true;
    try { idb = umgebung.indexedDB || null; idbDa = Boolean(idb); } catch { idb = null; idbDa = true; } // gesperrt: unklar, ob dort etwas liegt
    const idbGeleert = await new Promise((ok) => {
      let r = null;
      try { r = idb ? idb.open(n.db, 1) : null; } catch { r = null; }
      if (!r) { ok(!idbDa); return; } // ohne IndexedDB liegt dort auch nichts
      const uhr = setTimeout(() => ok(false), zeitlimit); // hängt: nicht sicher geleert
      r.onupgradeneeded = () => { try { r.transaction.abort(); } catch { /* egal */ } }; // gab es nicht: nicht anlegen
      r.onerror = (ereignis) => {
        clearTimeout(uhr);
        try { if (ereignis && ereignis.preventDefault) ereignis.preventDefault(); } catch { /* egal */ }
        ok(Boolean(r.error && r.error.name === "AbortError")); // Abbruch = gab es nicht
      };
      r.onblocked = () => { clearTimeout(uhr); ok(false); };
      r.onsuccess = () => {
        const d = r.result;
        const zu = (gut) => { clearTimeout(uhr); try { d.close(); } catch { /* egal */ } ok(gut); };
        try {
          const vorhanden = STORES.filter((s) => d.objectStoreNames.contains(s));
          if (!vorhanden.length) { zu(true); return; }
          const t = d.transaction(vorhanden, "readwrite");
          for (const s of vorhanden) t.objectStore(s).clear();
          t.oncomplete = () => zu(true);
          t.onerror = () => zu(false);
          t.onabort = () => zu(false);
        } catch { zu(false); }
      };
    });
    try {
      if (idbGeleert) umgebung.localStorage.removeItem(n.marke);
      else umgebung.localStorage.setItem(n.marke, "1");
    } catch { /* gesperrt */ }
    return idbGeleert;
  }

  // ------------------------------------------------------------------
  // Notfall-Kopie: eine ungespeicherte Bearbeitung synchron sichern (IndexedDB bricht Schreiben beim Schließen ab).
  // Liegt nur in sessionStorage dieses Tabs; nie werfen.
  // ------------------------------------------------------------------
  function notfall({ demo = false, umgebung = WELT, jetzt = () => Date.now() } = {}) {
    const schluessel = namen(demo).notfall;
    const kurz = (t) => (typeof t === "string" ? t.slice(0, 200) : "");
    return {
      /** daten sichern (z. B. { id, titel, inhalt, rev }). Zu groß: nur der Hinweis, welcher Eintrag betroffen war. true = liegt da. */
      merken(daten) {
        try {
          let json = JSON.stringify({ zeit: jetzt(), daten });
          if (typeof json !== "string") return false;
          if (json.length > NOTFALL_MAX) json = JSON.stringify({ zeit: jetzt(), zuGross: true, id: kurz(daten && daten.id), titel: kurz(daten && daten.titel) });
          umgebung.sessionStorage.setItem(schluessel, json);
          return true;
        } catch {
          return false;
        }
      },
      /** → { zeit, daten } | { zeit, zuGross: true, id, titel } | null */
      lesen() {
        try {
          const d = JSON.parse(umgebung.sessionStorage.getItem(schluessel) || "null");
          return istObjekt(d) && Number.isFinite(d.zeit) ? d : null;
        } catch {
          return null;
        }
      },
      loeschen() {
        try { umgebung.sessionStorage.removeItem(schluessel); } catch { /* egal */ }
      },
    };
  }

  /**
   * Andere Tabs desselben Browsers benachrichtigen (Brain aktuell halten, Gelöschtes nicht wieder anlegen).
   * Demo und echt haben getrennte Kanäle. Ohne BroadcastChannel ein stiller Ersatz.
   */
  function kanal(demo, beiNachricht, { Kanal } = {}) {
    try {
      const K = Kanal || (typeof BroadcastChannel !== "undefined" ? BroadcastChannel : null);
      if (!K) throw new Error("kein BroadcastChannel");
      const k = new K(namen(demo).kanal);
      k.onmessage = (e) => { try { beiNachricht((e && e.data) || {}); } catch { /* egal */ } };
      return { senden(d) { try { k.postMessage(d); } catch { /* egal */ } }, schliessen() { try { k.close(); } catch { /* egal */ } } };
    } catch {
      return { senden() {}, schliessen() {} };
    }
  }

  return {
    SCHEMA, VERLAUF_MAX, VERLAUF_MAX_LS, NOTFALL_MAX, STORES,
    oeffnen, resteLoeschen, notfall, kanal, migrieren, namen,
    idbAblage, lsAblage, speicherAblage, apiAblage, neuesDokument,
  };
});
