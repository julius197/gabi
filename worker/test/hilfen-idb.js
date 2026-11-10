// Test-Hilfen für den Brain-Speicher: nachgebaute IndexedDB (nur was brain-speicher.js braucht), nachgebauter
// localStorage/sessionStorage und ein nachgebauter BroadcastChannel. Alles im Arbeitsspeicher, ohne Zusatzpakete.
//
// Die IndexedDB verhält sich in den Punkten wie das Original, auf die sich der Speicher verlässt:
// - Ergebnisse kommen nie sofort, sondern in späteren Runden (onsuccess/onerror/oncomplete)
// - eine Transaktion endet von selbst, sobald keine Anfrage mehr offen ist; danach nimmt sie nichts mehr an
// - Transaktionen derselben Datenbank laufen NACHEINANDER – auch über mehrere Verbindungen („Tabs“) hinweg; wer liest,
//   wartet auf eine vorher begonnene schreibende Transaktion und sieht nie einen halben Stand
// - scheitert eine Anfrage oder ruft jemand abort(), bleibt von der Transaktion nichts stehen
// - open() mit Abbruch in onupgradeneeded legt keine Datenbank an (Fehler „AbortError“)
// - deleteDatabase() ruft onversionchange der offenen Verbindungen
//
// Schalter für die Tests:
//   idb.oeffnenHaengt = true       open() meldet sich nie (hängende IndexedDB)
//   idb.oeffnenScheitert = true    open() meldet einen Fehler
//   idb.schreibenScheitert = true  jede schreibende Anfrage scheitert (privates Fenster, das nicht schreiben lässt)
//   idb.fehlerBeimSchreiben = n    in der nächsten schreibenden Transaktion scheitert die n-te Schreibanfrage (einmalig)
//   idb.wurfBeimSchreiben = n      in der nächsten schreibenden Transaktion WIRFT der n-te put() sofort (einmalig) –
//                                  wie ein Wert, der sich nicht kopieren lässt; die Transaktion läuft dann weiter,
//                                  wenn sie niemand abbricht
// Einblick: idb.namen(), idb.inhalt(name, store), idb.verbindungen(name), idb.zaehler

const spaeter = (fn) => setImmediate(fn);
const fehler = (name, text) => Object.assign(new Error(text || name), { name });
const klon = (x) => (x === undefined ? undefined : structuredClone(x));

export function falscheIndexedDB() {
  const dbs = new Map(); // name → { name, version, stores: Map(store → { keyPath, daten: Map }), verbindungen: Set, schlange: [], laeuft: null }

  const idb = {
    oeffnenHaengt: false,
    oeffnenScheitert: false,
    schreibenScheitert: false,
    fehlerBeimSchreiben: 0,
    wurfBeimSchreiben: 0,
    zaehler: { geoeffnet: 0, transaktionen: 0, schreibend: 0 },
    open,
    deleteDatabase,
    namen: () => [...dbs.keys()].sort(),
    inhalt: (name, store) => {
      const s = dbs.get(name) && dbs.get(name).stores.get(store);
      return s ? [...s.daten.keys()].sort().map((k) => klon(s.daten.get(k))) : null;
    },
    verbindungen: (name) => (dbs.get(name) ? dbs.get(name).verbindungen.size : 0),
  };

  // ---------- Transaktionen ----------
  /**
   * Nächste Transaktion der Datenbank starten – immer nur eine zur Zeit, in der Reihenfolge ihres Entstehens. Das ist
   * strenger als das Original (dort dürfen nur lesende nebeneinander laufen), trifft aber, worauf es ankommt: Eine
   * lesende Transaktion sieht nie einen halben Stand und wartet, bis eine vorher begonnene schreibende fertig ist.
   */
  function antreiben(db) {
    if (db.laeuft || !db.schlange.length) return;
    const tx = db.schlange.shift();
    db.laeuft = tx;
    spaeter(() => {
      // schreibend: Arbeitskopie der Stores – erst beim Abschluss übernommen, bei Abbruch verworfen
      if (tx._schreibend) tx._arbeit = new Map(tx._namen.map((n) => [n, { keyPath: db.stores.get(n).keyPath, daten: new Map(db.stores.get(n).daten) }]));
      laufen(db, tx);
    });
  }

  function laufen(db, tx) {
    const ende = (gut) => {
      tx._fertig = true;
      if (gut && tx._arbeit) for (const [n, s] of tx._arbeit) db.stores.get(n).daten = s.daten;
      if (db.laeuft === tx) db.laeuft = null;
      if (gut) { if (tx.oncomplete) tx.oncomplete({ target: tx }); }
      else {
        if (tx._anfrageFehler && tx.onerror) tx.onerror({ target: tx });
        if (tx.onabort) tx.onabort({ target: tx });
      }
      antreiben(db);
    };
    const weiter = () => {
      if (tx._fertig) return;
      if (tx._abbruch) { ende(false); return; }
      const a = tx._anfragen.shift();
      if (!a) { ende(true); return; }
      let gut = true;
      if (a.schreibt) {
        tx._geschrieben += 1;
        if (idb.schreibenScheitert) { gut = false; a.r.error = fehler("QuotaExceededError"); }
        else if (tx._scheitertBei && tx._geschrieben === tx._scheitertBei) { gut = false; a.r.error = fehler("UnknownError"); }
      }
      if (gut) {
        try { a.r.result = a.tun(); } catch (e) { gut = false; a.r.error = e; }
      }
      if (gut) {
        try { if (a.r.onsuccess) a.r.onsuccess({ target: a.r }); } catch { tx._abbruch = true; } // Fehler im Rückruf bricht ab, wie im Original
      } else {
        tx.error = a.r.error;
        tx._anfrageFehler = true;
        tx._abbruch = true;
        try { if (a.r.onerror) a.r.onerror({ target: a.r }); } catch { /* egal */ }
      }
      spaeter(weiter);
    };
    weiter();
  }

  function transaktion(db, namen, modus) {
    const schreibend = modus === "readwrite";
    idb.zaehler.transaktionen += 1;
    if (schreibend) idb.zaehler.schreibend += 1;
    const tx = { error: null, oncomplete: null, onerror: null, onabort: null, _namen: namen, _schreibend: schreibend, _anfragen: [], _fertig: false, _abbruch: false, _arbeit: null, _geschrieben: 0, _scheitertBei: 0, _anfrageFehler: false, _puts: 0, _wirftBei: 0 };
    if (schreibend && idb.fehlerBeimSchreiben > 0) { tx._scheitertBei = idb.fehlerBeimSchreiben; idb.fehlerBeimSchreiben = 0; }
    if (schreibend && idb.wurfBeimSchreiben > 0) { tx._wirftBei = idb.wurfBeimSchreiben; idb.wurfBeimSchreiben = 0; }
    // gilt erst, wenn die Transaktion läuft: schreibend auf der Arbeitskopie, lesend auf dem festen Stand
    const speicher = (n) => (schreibend ? tx._arbeit.get(n) : db.stores.get(n));
    const anfrage = (tun, schreibt) => {
      if (tx._fertig) throw fehler("TransactionInactiveError");
      const r = { result: undefined, error: null, onsuccess: null, onerror: null };
      tx._anfragen.push({ r, tun, schreibt });
      return r;
    };
    const nurSchreibend = () => { if (!schreibend) throw fehler("ReadOnlyError"); };
    tx.objectStore = (n) => {
      if (!namen.includes(n)) throw fehler("NotFoundError");
      const keyPath = db.stores.get(n).keyPath;
      return {
        get: (k) => anfrage(() => klon(speicher(n).daten.get(k)), false),
        getAll: () => anfrage(() => [...speicher(n).daten.keys()].sort().map((k) => klon(speicher(n).daten.get(k))), false),
        put: (wert) => {
          nurSchreibend();
          tx._puts += 1;
          if (tx._wirftBei && tx._puts === tx._wirftBei) throw fehler("DataCloneError");
          if (!wert || typeof wert !== "object" || wert[keyPath] === undefined || wert[keyPath] === null) throw fehler("DataError");
          const kopie = structuredClone(wert); // wirft wie das Original, wenn sich etwas nicht kopieren lässt
          return anfrage(() => { speicher(n).daten.set(kopie[keyPath], kopie); return kopie[keyPath]; }, true);
        },
        delete: (k) => { nurSchreibend(); return anfrage(() => { speicher(n).daten.delete(k); }, true); },
        clear: () => { nurSchreibend(); return anfrage(() => { speicher(n).daten.clear(); }, true); },
      };
    };
    tx.abort = () => {
      if (tx._fertig) throw fehler("InvalidStateError");
      tx._abbruch = true;
    };
    db.schlange.push(tx);
    antreiben(db);
    return tx;
  }

  // ---------- Verbindungen ----------
  function verbindung(db) {
    const conn = {
      name: db.name,
      version: db.version,
      onversionchange: null,
      _zu: false,
      _upgrade: false,
      objectStoreNames: { contains: (n) => db.stores.has(n) },
      createObjectStore(n, { keyPath } = {}) {
        if (!conn._upgrade) throw fehler("InvalidStateError");
        if (db.stores.has(n)) throw fehler("ConstraintError");
        db.stores.set(n, { keyPath, daten: new Map() });
        return {};
      },
      transaction(namen, modus = "readonly") {
        if (conn._zu) throw fehler("InvalidStateError", "Verbindung geschlossen");
        const liste = Array.isArray(namen) ? namen : [namen];
        for (const n of liste) if (!db.stores.has(n)) throw fehler("NotFoundError");
        return transaktion(db, liste, modus);
      },
      close() { conn._zu = true; db.verbindungen.delete(conn); },
    };
    db.verbindungen.add(conn);
    return conn;
  }

  function open(name, version) {
    idb.zaehler.geoeffnet += 1;
    const r = { result: undefined, error: null, transaction: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
    if (idb.oeffnenHaengt) return r;
    const scheitern = (name2) => { r.error = fehler(name2); if (r.onerror) r.onerror({ target: r, preventDefault() {} }); };
    spaeter(() => {
      if (idb.oeffnenScheitert) { scheitern("UnknownError"); return; }
      let db = dbs.get(name);
      const alt = db ? db.version : 0;
      const ziel = version === undefined ? (alt || 1) : version;
      if (ziel < alt) { scheitern("VersionError"); return; }
      const neuAngelegt = !db;
      if (!db) {
        db = { name, version: 0, stores: new Map(), verbindungen: new Set(), schlange: [], laeuft: null };
        dbs.set(name, db);
      }
      if (ziel > alt) {
        for (const v of [...db.verbindungen]) if (v.onversionchange) v.onversionchange({});
        const sicherung = new Map([...db.stores].map(([n, s]) => [n, { keyPath: s.keyPath, daten: new Map(s.daten) }]));
        const conn = verbindung(db);
        let abgebrochen = false;
        conn._upgrade = true;
        db.version = ziel;
        conn.version = ziel;
        r.result = conn;
        r.transaction = { abort() { abgebrochen = true; } };
        try { if (r.onupgradeneeded) r.onupgradeneeded({ target: r, oldVersion: alt, newVersion: ziel }); } catch { abgebrochen = true; }
        conn._upgrade = false;
        r.transaction = null;
        if (abgebrochen) {
          conn.close();
          if (neuAngelegt) dbs.delete(name);
          else { db.version = alt; db.stores = sicherung; }
          r.result = undefined;
          spaeter(() => scheitern("AbortError"));
          return;
        }
        spaeter(() => { if (r.onsuccess) r.onsuccess({ target: r }); });
        return;
      }
      r.result = verbindung(db);
      spaeter(() => { if (r.onsuccess) r.onsuccess({ target: r }); });
    });
    return r;
  }

  function deleteDatabase(name) {
    const r = { result: undefined, error: null, onsuccess: null, onerror: null, onblocked: null };
    spaeter(() => {
      const db = dbs.get(name);
      if (db) {
        for (const v of [...db.verbindungen]) if (v.onversionchange) v.onversionchange({});
        if (db.verbindungen.size) { if (r.onblocked) r.onblocked({}); return; }
        dbs.delete(name);
      }
      if (r.onsuccess) r.onsuccess({ target: r });
    });
    return r;
  }

  return idb;
}

/**
 * Nachgebauter localStorage/sessionStorage.
 * gesperrt = true: jeder Zugriff wirft (privates Fenster, gesperrte Website-Daten).
 * grenze: höchstens so viele Zeichen insgesamt (Schlüssel + Werte) – darüber wirft setItem „QuotaExceededError“.
 */
export function falscherSpeicher({ grenze = Infinity } = {}) {
  const m = new Map();
  const s = {
    gesperrt: false,
    grenze,
    get length() { pruefen(); return m.size; },
    key(i) { pruefen(); return [...m.keys()][i] ?? null; },
    getItem(k) { pruefen(); return m.has(String(k)) ? m.get(String(k)) : null; },
    setItem(k, v) {
      pruefen();
      const schluessel = String(k);
      const wert = String(v);
      let summe = schluessel.length + wert.length;
      for (const [k2, v2] of m) if (k2 !== schluessel) summe += k2.length + v2.length;
      if (summe > s.grenze) throw fehler("QuotaExceededError", "Speicher voll");
      m.set(schluessel, wert);
    },
    removeItem(k) { pruefen(); m.delete(String(k)); },
    clear() { m.clear(); },
    schluessel: () => [...m.keys()].sort(),
  };
  function pruefen() { if (s.gesperrt) throw fehler("SecurityError", "Speicher gesperrt"); }
  return s;
}

/** Nachgebauter BroadcastChannel: eine Klasse je Aufruf (eigene „Browser“), Nachrichten gehen an die anderen Kanäle gleichen Namens. */
export function falscherKanal() {
  const offen = new Set();
  return class Kanal {
    constructor(name) { this.name = name; this.onmessage = null; offen.add(this); }
    postMessage(daten) {
      if (!offen.has(this)) throw fehler("InvalidStateError");
      const kopie = structuredClone(daten);
      for (const k of offen) if (k !== this && k.name === this.name && k.onmessage) k.onmessage({ data: kopie });
    }
    close() { offen.delete(this); }
    static anzahl() { return offen.size; }
  };
}
