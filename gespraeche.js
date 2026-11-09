/* Gabi – Gesprächsverlauf (v2.1): mehrere Gespräche, NUR im Browser dieses Geräts (IndexedDB, sonst localStorage).
   Nie auf dem Server, nie in der Adresse (dort nur die ID), nie im Seitentitel. Demo und echter Betrieb haben
   getrennte Ablagen. Reine Hilfen (Titel, Gruppen, Limit, Aufbereiten) sind ohne Browser testbar. */
(function (wurzel, fabrik) {
  if (typeof module === "object" && module.exports) module.exports = fabrik();
  else wurzel.GabiGespraeche = fabrik();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MAX = 50;
  const TITEL_MAX = 40;
  const TITEL_EIGEN_MAX = 80;

  const istNutzerText = (n) => Boolean(n && n.rolle === "nutzer" && String(n.text || "").trim());
  const kartenVon = (nachrichten) => (Array.isArray(nachrichten) ? nachrichten : []).flatMap((n) => (n && Array.isArray(n.karten) ? n.karten : []));

  /** Entwürfe, die noch nicht gespeichert (und nicht verworfen) sind. */
  const offeneEntwuerfe = (nachrichten) => kartenVon(nachrichten).filter((k) => k && k.typ === "entwurf" && !k.gespeichert && !k.verworfen).length;

  /**
   * Leer = nichts, was sich zu behalten lohnt: keine Nutzernachricht, kein Entwurf, keine zurückgestellte Aufnahme,
   * nichts ausdrücklich Bewahrtes (Vorversion). Einmal nicht leer bleibt nicht leer (Nachrichten werden nie entfernt).
   */
  function istLeer(nachrichten) {
    const liste = Array.isArray(nachrichten) ? nachrichten : [];
    return !liste.some((n) => istNutzerText(n) || (n && n.bewahren)) && !kartenVon(liste).some((k) => k && (k.typ === "entwurf" || k.typ === "aufnahme"));
  }

  /** Auf höchstens max Zeichen kürzen – möglichst an einer Wortgrenze, mit „…“. */
  function kuerzen(text, max = TITEL_MAX) {
    const t = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    const schnitt = t.slice(0, max - 1);
    const anWort = /\s/.test(t.charAt(max - 1)) ? schnitt : schnitt.replace(/\s+\S*$/, ""); // ganzes Wort bleibt
    return `${(anWort.length >= Math.floor(max * 0.6) ? anWort : schnitt).replace(/[\s,.;:–-]+$/u, "")}…`;
  }

  /** Titel aus der ersten Nutzernachricht (gekürzt) – lokal, ohne zusätzlichen KI-Aufruf. */
  function titelAus(nachrichten) {
    const liste = Array.isArray(nachrichten) ? nachrichten : [];
    const erste = liste.find(istNutzerText);
    if (erste) {
      const text = String(erste.text).replace(/\s+/g, " ").trim();
      if (erste.art === "diktat") return kuerzen(`${`Diktat ${erste.kuerzel || ""}`.trim()}: ${text}`);
      if (erste.art === "suche") return kuerzen(`Suche: ${text}`);
      return kuerzen(text);
    }
    const e = kartenVon(liste).find((k) => k && k.typ === "entwurf");
    if (e) return kuerzen(`Entwurf ${e.kuerzel || ""}`.trim());
    if (kartenVon(liste).some((k) => k && k.typ === "aufnahme")) return "Aufnahme – noch nicht gesendet";
    if (liste.some((n) => n && n.bewahren)) return "Diktat aus der Vorversion";
    return "Neues Gespräch";
  }

  /** Selbst vergebener Titel: eine Zeile, höchstens 80 Zeichen. Leer = wieder automatisch. */
  const titelSaeubern = (text) => String(text == null ? "" : text).replace(/\s+/g, " ").trim().slice(0, TITEL_EIGEN_MAX);

  /** Gruppen für die Liste nach letzter Aktivität, neueste zuerst: Heute, Gestern, Letzte 7 Tage, Älter. */
  function gruppieren(liste, jetzt = Date.now()) {
    const d = new Date(jetzt);
    d.setHours(0, 0, 0, 0);
    const heute = d.getTime();
    d.setDate(d.getDate() - 1);
    const gestern = d.getTime();
    d.setDate(d.getDate() - 6);
    const woche = d.getTime(); // Mitternacht vor 7 Tagen (Kalendertage, auch über die Zeitumstellung)
    const gruppen = [["heute", "Heute"], ["gestern", "Gestern"], ["woche", "Letzte 7 Tage"], ["aelter", "Älter"]]
      .map(([schluessel, titel]) => ({ schluessel, titel, eintraege: [] }));
    const sortiert = [...(Array.isArray(liste) ? liste : [])].sort((a, b) => (Number(b.geaendert) || 0) - (Number(a.geaendert) || 0));
    for (const g of sortiert) {
      const t = Number(g.geaendert) || 0;
      gruppen[t >= heute ? 0 : t >= gestern ? 1 : t >= woche ? 2 : 3].eintraege.push(g);
    }
    return gruppen.filter((g) => g.eintraege.length);
  }

  /** Über dem Limit: welche IDs fliegen raus? Die am längsten unbenutzten – nie das offene, mit offenem Entwurf zuletzt. */
  function ueberzaehlige(liste, { aktiv = null, max = MAX } = {}) {
    const alle = Array.isArray(liste) ? liste : [];
    const zuViel = alle.length - max;
    if (zuViel <= 0) return [];
    return alle
      .filter((g) => g.id !== aktiv)
      .sort((a, b) => (Number(a.entwuerfe > 0) - Number(b.entwuerfe > 0)) || ((Number(a.geaendert) || 0) - (Number(b.geaendert) || 0)))
      .slice(0, zuViel)
      .map((g) => g.id);
  }

  /** Was gespeichert wird: ohne flüchtige Zustände (läuft, wartet, Status, Speichern/Senden in Arbeit). */
  function bereinigen(nachrichten) {
    return (Array.isArray(nachrichten) ? nachrichten : []).map(({ laeuft: _l, wartet: _w, status: _s, ...n }) => ({
      ...n,
      karten: (Array.isArray(n.karten) ? n.karten : []).map(({ speichert: _sp, sendet: _se, ...k }) => k),
    }));
  }

  /**
   * Gespeichertes Gespräch für die Anzeige vorbereiten: mitten in der Antwort neu geladen → ehrlich als unterbrochen
   * zeigen (mit „Nochmal versuchen“); Bearbeitung in einer Karte geht weiter; Beispiel-Chip gehört zum Diktat-Modus,
   * der nicht übernommen wird.
   */
  function vorbereiten(nachrichten, { fremd = false } = {}) {
    const liste = (Array.isArray(nachrichten) ? nachrichten : [])
      .filter((n) => n && typeof n === "object" && n.id && (n.rolle === "nutzer" || n.rolle === "gabi"));
    if (fremd) { for (const n of liste) if (!Array.isArray(n.karten)) n.karten = []; return liste; } // Stand eines anderen Tabs
    for (const n of liste) {
      if (!Array.isArray(n.karten)) n.karten = [];
      if (n.rolle !== "gabi" || n.lokal) continue;
      if (n.unterwegs) {
        delete n.unterwegs;
        Object.assign(n, { fehler: true, fehlerText: "Die Antwort wurde unterbrochen, weil die Seite neu geladen wurde.", wiederholbar: Boolean(n.body) });
      } else if (!n.text && !n.karten.length && !n.fehler) {
        n.abgebrochen = true;
        n.text = "Abgebrochen.";
      }
    }
    for (const k of kartenVon(liste)) {
      if (!k || typeof k !== "object") continue;
      if (k.typ === "entwurf" && k.bearbeitung) k.bearbeiten = true;
      if (k.typ === "beispiel") k.benutzt = true;
    }
    return liste;
  }

  /**
   * v2.0 hatte ein einziges Gespräch pro Tab (sessionStorage „gabi.gespraech.v2“) – daraus wird der erste Eintrag.
   * Ein dort aus v1 übernommenes, nie gespeichertes Diktat („Aus der Vorversion …“) ist die einzige Kopie: bewahren.
   */
  function ausVersion20(json) {
    let d = null;
    try { d = JSON.parse(json || "null"); } catch { return null; }
    const nachrichten = d && Array.isArray(d.nachrichten) ? d.nachrichten : null;
    if (!nachrichten) return null;
    for (const n of nachrichten) if (n && n.rolle === "gabi" && /^Aus der Vorversion\b/.test(String(n.text || ""))) n.bewahren = true;
    return !istLeer(nachrichten) ? nachrichten : null;
  }

  /**
   * Endzustände von Karten sind einbahnig: Entwurf gespeichert (Notiz-ID) oder verworfen, Aufnahme nachgeschickt oder
   * verworfen, Auswahl getroffen. Kein älterer Stand nimmt sie zurück – weder beim Zusammenführen zweier Tabs noch beim
   * Schreiben in die Ablage. Überträgt sie aus quelle nach ziel (gleiche Karten-ID, ziel wird geändert) und beendet dort
   * das Bearbeiten. Gespeichert schlägt verworfen (die Notiz gibt es dann). Ergebnis: die geänderten Nachrichten aus ziel.
   */
  const ENDE = { entwurf: ["gespeichert", "verworfen"], aufnahme: ["erledigt", "verworfen"], auswahl: ["gewaehlt"] };
  function endzustaendeUebernehmen(ziel, quelle) {
    const fertig = new Map();
    for (const k of kartenVon(quelle)) if (k && k.id && ENDE[k.typ] && ENDE[k.typ].some((f) => k[f])) fertig.set(k.id, k);
    const geaendert = [];
    if (!fertig.size) return geaendert;
    for (const n of Array.isArray(ziel) ? ziel : []) {
      let anders = false;
      for (const k of n && Array.isArray(n.karten) ? n.karten : []) {
        const q = k && fertig.get(k.id);
        if (!q || q.typ !== k.typ) continue;
        if (k.typ === "entwurf") {
          if (q.gespeichert && !k.gespeichert) {
            k.gespeichert = q.gespeichert;
            if (q.strukturiert) k.strukturiert = q.strukturiert; // gespeichert wurde dieser Inhalt
            delete k.verworfen;
          } else if (q.verworfen && !k.verworfen && !k.gespeichert) k.verworfen = true;
          else continue;
          delete k.bearbeiten; // abgeschlossen: hier nicht weiter bearbeiten
          delete k.bearbeitung;
        } else {
          const neu = ENDE[k.typ].filter((f) => q[f] && !k[f]);
          if (!neu.length) continue;
          for (const f of neu) k[f] = q[f];
        }
        anders = true;
      }
      if (anders) geaendert.push(n);
    }
    return geaendert;
  }

  /**
   * Stand eines anderen Tabs übernehmen, ohne Eigenes zu verlieren (dasselbe Gespräch in zwei Tabs):
   * - eigene Nachrichten bleiben dieselben Objekte (laufende Antworten schreiben weiter hinein);
   * - was der andere Tab an einer Nachricht geändert hat (z. B. Entwurf gespeichert), wird übernommen – bei Nachrichten,
   *   die hier gerade in Arbeit sind (inArbeit), nur die Endzustände der Karten (endzustaendeUebernehmen);
   * - eigene Endzustände nimmt ein älterer Stand des anderen Tabs nie zurück;
   * - neue Nachrichten des anderen Tabs kommen an ihrer Stelle dazu; antwortet der andere noch (unterwegs), später –
   *   außer einem dort vorläufigen Netzfehler (unterwegs + fehler): der gleich, sonst schriebe dieser Tab ihn beim nächsten
   *   Speichern aus der Ablage (nach einem Neuladen dort wäre die Antwort weg); eine eigene Fassung überschreibt ein
   *   „unterwegs“ des anderen Tabs nie (z. B. hier schon „unterbrochen“ nach dem Neuladen).
   * Ergebnis: { nachrichten, neu, geaendert, veraltet } – neu/geaendert zum gezielten Nachzeichnen; veraltet: dem fremden
   * (= gespeicherten) Stand fehlen eigene Endzustände – dann den eigenen Stand zurückschreiben.
   */
  // Bearbeiten-Zustand einer Karte (offenes Bearbeiten, Getipptes) gehört nur dem Tab, in dem bearbeitet wird
  const OHNE_BEARBEITUNG = (n) => ({ ...n, karten: (Array.isArray(n.karten) ? n.karten : []).map(({ bearbeiten: _b, bearbeitung: _t, benutzt: _u, ...k }) => k) });
  const vergleichbar = (n) => JSON.stringify(bereinigen([OHNE_BEARBEITUNG(n)])[0]);
  function zusammenfuehren(eigene, fremde, { inArbeit = () => false } = {}) {
    const ergebnis = Array.isArray(eigene) ? [...eigene] : [];
    const neu = [];
    const geaendert = [];
    let nach = -1;
    let veraltet = false;
    for (const roh of Array.isArray(fremde) ? fremde : []) {
      if (!roh || !roh.id) continue;
      if (roh.unterwegs) {
        const j = ergebnis.findIndex((x) => x.id === roh.id);
        if (j >= 0) {
          // nur ihre Stelle merken – dort Gespeichertes/Verworfenes aber gleich übernehmen (sonst böte dieser Tab
          // „Speichern“ weiter an, bis er selbst schreibt)
          nach = j;
          if (endzustaendeUebernehmen([ergebnis[j]], [roh]).length) geaendert.push(ergebnis[j]);
          continue;
        }
        if (!roh.fehler) continue; // antwortet dort noch → später
      }
      const f = OHNE_BEARBEITUNG(roh);
      const i = ergebnis.findIndex((x) => x.id === f.id);
      if (i >= 0) {
        nach = i;
        const e = ergebnis[i];
        if (inArbeit(e)) {
          // hier in Arbeit (z. B. Entwurf offen zum Bearbeiten): nur dort Gespeichertes/Verworfenes übernehmen – sonst
          // schriebe dieser Tab den alten Kartenstand zurück, der Entwurf wäre wieder offen (doppelte Notiz)
          if (endzustaendeUebernehmen([e], [f]).length) geaendert.push(e);
          if (endzustaendeUebernehmen([f], [e]).length) veraltet = true; // dem fremden Stand fehlen eigene Endzustände
          continue;
        }
        if (vergleichbar(e) === vergleichbar(f)) continue;
        // eigenen Bearbeiten-Zustand der Karten behalten
        const eigen = new Map((Array.isArray(e.karten) ? e.karten : []).map((k) => [k.id, k]));
        for (const k of Object.keys(e)) if (!(k in f)) delete e[k];
        Object.assign(e, f);
        e.karten = f.karten.map((k) => {
          const alt = eigen.get(k.id);
          if (!alt) return k;
          const lokal = {};
          for (const feld of ["bearbeiten", "bearbeitung", "benutzt"]) if (alt[feld] !== undefined) lokal[feld] = alt[feld];
          return { ...k, ...lokal };
        });
        // eigene Endzustände bleiben (älterer fremder Stand, z. B. ein Tab mit der Vorversion)
        if (endzustaendeUebernehmen([e], [{ karten: [...eigen.values()] }]).length) veraltet = true;
        geaendert.push(e);
      } else {
        ergebnis.splice(nach + 1, 0, f);
        nach += 1;
        neu.push(f);
      }
    }
    return { nachrichten: ergebnis, neu, geaendert, veraltet };
  }

  /** Listeneintrag (ohne Inhalt): Titel, Zeiten, offene Entwürfe. */
  function meta(g) {
    return {
      id: g.id,
      titel: String(g.titel || titelAus(g.nachrichten)),
      titelEigen: Boolean(g.titelEigen),
      erstellt: Number(g.erstellt) || Date.now(),
      geaendert: Number(g.geaendert) || Date.now(),
      entwuerfe: offeneEntwuerfe(g.nachrichten),
    };
  }

  // ------------------------------------------------------------------
  // Ablage: IndexedDB → localStorage → nur dieser Tab (Arbeitsspeicher)
  // Gleiche Schnittstelle: bereit, liste, laden, speichern(meta, nachrichten?, { nurVorhanden }) → nachgezogener Stand | null |
  // { fehlt: true }, loeschen(ids), leeren. nurVorhanden: ein Gespräch, das schon abgelegt war und jetzt fehlt, hat ein anderer
  // Tab gelöscht – nicht wieder anlegen (im selben Vorgang geprüft), sondern { fehlt: true } melden
  // ------------------------------------------------------------------
  const PROBE = "__probe";

  function idbAblage(name, idb) {
    let db = null;
    const oeffnen = () => new Promise((ok, nein) => {
      let r;
      try { r = idb.open(name, 1); } catch (e) { nein(e); return; }
      const uhr = setTimeout(() => nein(new Error("IndexedDB antwortet nicht")), 3000);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "id" });
        if (!d.objectStoreNames.contains("inhalt")) d.createObjectStore("inhalt", { keyPath: "id" });
      };
      r.onsuccess = () => { clearTimeout(uhr); const d = r.result; d.onversionchange = () => d.close(); ok(d); };
      r.onerror = () => { clearTimeout(uhr); nein(r.error || new Error("IndexedDB")); };
      r.onblocked = () => { clearTimeout(uhr); nein(new Error("IndexedDB blockiert")); };
    });
    // Ergebnis erst bei „complete“ melden – erst dann ist geschrieben
    const tx = (stores, art, arbeit) => new Promise((ok, nein) => {
      let t;
      try { t = db.transaction(stores, art); } catch (e) { nein(e); return; }
      const ergebnis = { wert: undefined };
      t.oncomplete = () => ok(ergebnis.wert);
      t.onerror = () => nein(t.error || new Error("IndexedDB"));
      t.onabort = () => nein(t.error || new Error("IndexedDB abgebrochen"));
      try { arbeit(t, ergebnis); } catch (e) { try { t.abort(); } catch { /* schon zu */ } nein(e); }
    });
    return {
      art: "indexeddb",
      async bereit() {
        db = await oeffnen();
        // Schreibprobe: manche privaten Fenster öffnen die Datenbank, lassen aber nicht schreiben
        await tx(["meta"], "readwrite", (t) => { const s = t.objectStore("meta"); s.put({ id: PROBE }); s.delete(PROBE); });
      },
      liste: () => tx(["meta"], "readonly", (t, e) => {
        const r = t.objectStore("meta").getAll();
        r.onsuccess = () => { e.wert = (r.result || []).filter((m) => m && m.id !== PROBE); };
      }),
      laden: (id) => tx(["inhalt"], "readonly", (t, e) => {
        const r = t.objectStore("inhalt").get(id);
        r.onsuccess = () => { e.wert = r.result ? r.result.nachrichten : null; };
      }),
      // Endzustände nie mit einem älteren Stand überschreiben (ein anderer Tab hat inzwischen gespeichert/verworfen):
      // im selben Schreibvorgang lesen und zusammenführen. readwrite-Vorgänge auf denselben Stores laufen auch über Tabs
      // hinweg nacheinander – dazwischen schreibt niemand. Ergebnis: der nachgezogene Stand (Tab muss nachziehen) oder null.
      speichern: (m, nachrichten, { nurVorhanden = false } = {}) => tx(["meta", "inhalt"], "readwrite", (t, e) => {
        if (!nachrichten) {
          if (!nurVorhanden) { t.objectStore("meta").put(m); return; }
          const r = t.objectStore("meta").get(m.id);
          r.onsuccess = () => { if (r.result) t.objectStore("meta").put(m); else e.wert = { fehlt: true }; };
          return;
        }
        const inhalt = t.objectStore("inhalt");
        const r = inhalt.get(m.id);
        r.onsuccess = () => {
          if (nurVorhanden && !r.result) { e.wert = { fehlt: true }; return; }
          const nachgezogen = endzustaendeUebernehmen(nachrichten, r.result && r.result.nachrichten).length > 0;
          t.objectStore("meta").put(nachgezogen ? { ...m, entwuerfe: offeneEntwuerfe(nachrichten) } : m);
          inhalt.put({ id: m.id, nachrichten });
          e.wert = nachgezogen ? nachrichten : null;
        };
      }),
      loeschen: (ids) => tx(["meta", "inhalt"], "readwrite", (t) => {
        for (const id of ids) { t.objectStore("meta").delete(id); t.objectStore("inhalt").delete(id); }
      }),
      leeren: () => tx(["meta", "inhalt"], "readwrite", (t) => { t.objectStore("meta").clear(); t.objectStore("inhalt").clear(); }),
    };
  }

  function lsAblage(vorsatz, ls) {
    const LISTE = `${vorsatz}gespraeche.v1`;
    const INHALT = (id) => `${vorsatz}gespraech.v1.${id}`;
    const liste = () => {
      try { const l = JSON.parse(ls.getItem(LISTE) || "[]"); return Array.isArray(l) ? l : []; } catch { return []; }
    };
    return {
      art: "localstorage",
      async bereit() { const k = `${vorsatz}probe`; ls.setItem(k, "1"); ls.removeItem(k); },
      async liste() { return liste(); },
      async laden(id) { try { return JSON.parse(ls.getItem(INHALT(id)) || "null"); } catch { return null; } },
      async speichern(m, nachrichten, { nurVorhanden = false } = {}) { // Endzustände wie bei IndexedDB: lesen, zusammenführen, schreiben
        if (nurVorhanden && (nachrichten ? ls.getItem(INHALT(m.id)) === null : !liste().some((x) => x.id === m.id))) return { fehlt: true };
        let nachgezogen = false;
        if (nachrichten) {
          let alt = null;
          try { alt = JSON.parse(ls.getItem(INHALT(m.id)) || "null"); } catch { alt = null; }
          nachgezogen = endzustaendeUebernehmen(nachrichten, alt).length > 0;
          ls.setItem(INHALT(m.id), JSON.stringify(nachrichten));
        }
        ls.setItem(LISTE, JSON.stringify([...liste().filter((x) => x.id !== m.id), nachgezogen ? { ...m, entwuerfe: offeneEntwuerfe(nachrichten) } : m]));
        return nachgezogen ? nachrichten : null;
      },
      async loeschen(ids) {
        const weg = new Set(ids);
        for (const id of ids) ls.removeItem(INHALT(id));
        ls.setItem(LISTE, JSON.stringify(liste().filter((x) => !weg.has(x.id))));
      },
      async leeren() {
        for (const m of liste()) ls.removeItem(INHALT(m.id));
        ls.removeItem(LISTE);
      },
    };
  }

  function speicherAblage() {
    const meta = new Map();
    const inhalt = new Map();
    const kopie = (x) => JSON.parse(JSON.stringify(x));
    return {
      art: "speicher",
      async bereit() {},
      async liste() { return [...meta.values()].map(kopie); },
      async laden(id) { return inhalt.has(id) ? kopie(inhalt.get(id)) : null; },
      async speichern(m, nachrichten, { nurVorhanden = false } = {}) {
        if (nurVorhanden && !(nachrichten ? inhalt.has(m.id) : meta.has(m.id))) return { fehlt: true };
        let nachgezogen = false;
        if (nachrichten) {
          const neu = kopie(nachrichten);
          nachgezogen = endzustaendeUebernehmen(neu, inhalt.get(m.id) || null).length > 0;
          inhalt.set(m.id, neu);
        }
        meta.set(m.id, kopie(nachgezogen ? { ...m, entwuerfe: offeneEntwuerfe(inhalt.get(m.id)) } : m));
        return nachgezogen ? kopie(inhalt.get(m.id)) : null;
      },
      async loeschen(ids) { for (const id of ids) { meta.delete(id); inhalt.delete(id); } },
      async leeren() { meta.clear(); inhalt.clear(); },
    };
  }

  /** Beste verfügbare Ablage. Demo: eigene Datenbank „gabi-demo“ bzw. Schlüssel „gabi.demo.…“ – nie gemischt. */
  async function ablageOeffnen({ demo = false, umgebung = typeof self !== "undefined" ? self : globalThis } = {}) {
    const versuche = [];
    try { if (umgebung.indexedDB) versuche.push(() => idbAblage(demo ? "gabi-demo" : "gabi", umgebung.indexedDB)); } catch { /* gesperrt */ }
    try { if (umgebung.localStorage) versuche.push(() => lsAblage(demo ? "gabi.demo." : "gabi.", umgebung.localStorage)); } catch { /* gesperrt */ }
    for (const neu of versuche) {
      try {
        const a = neu();
        await a.bereit();
        // offenes Löschen von einem früheren Abmelden (IndexedDB hing damals): jetzt zuerst nachholen
        if (a.art === "indexeddb") {
          const marke = `${demo ? "gabi.demo." : "gabi."}gespraeche.leeren-offen`;
          let offen = false;
          try { offen = umgebung.localStorage.getItem(marke) === "1"; } catch { offen = false; }
          if (offen) { await a.leeren(); try { umgebung.localStorage.removeItem(marke); } catch { /* egal */ } a.nachgeholt = true; }
        }
        return a;
      } catch { /* nächste Möglichkeit */ }
    }
    return speicherAblage();
  }

  /**
   * Reste in den jeweils anderen Ablagen löschen (z. B. localStorage aus einem früheren Start ohne IndexedDB) –
   * damit „Alle löschen“ und „Abmelden + Häkchen“ wirklich alles von diesem Gerät nehmen. Die gerade genutzte Ablage
   * leert ihr eigenes leeren(); hier nur die übrigen. Legt keine Datenbank neu an.
   */
  async function resteLoeschen({ demo = false, art = "", umgebung = typeof self !== "undefined" ? self : globalThis } = {}) {
    const vorsatz = demo ? "gabi.demo." : "gabi.";
    const marke = `${vorsatz}gespraeche.leeren-offen`;
    let idbGeleert = true;
    if (art !== "localstorage") {
      try {
        const ls = umgebung.localStorage;
        const weg = [];
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k && (k === `${vorsatz}gespraeche.v1` || k.startsWith(`${vorsatz}gespraech.v1.`))) weg.push(k);
        }
        for (const k of weg) ls.removeItem(k);
      } catch { /* gesperrt – dann liegt dort auch nichts */ }
    }
    if (art !== "indexeddb") {
      idbGeleert = await new Promise((ok) => {
        let r;
        try { r = umgebung.indexedDB && umgebung.indexedDB.open(demo ? "gabi-demo" : "gabi", 1); } catch { r = null; }
        if (!r) { ok(!umgebung.indexedDB); return; } // ohne IndexedDB liegt dort auch nichts
        const uhr = setTimeout(() => ok(false), 3000); // hängt: nicht sicher geleert
        r.onupgradeneeded = () => { try { r.transaction.abort(); } catch { /* egal */ } }; // gab es nicht: nicht anlegen
        r.onerror = () => { clearTimeout(uhr); ok(Boolean(r.error && r.error.name === "AbortError")); }; // Abbruch = gab es nicht
        r.onblocked = () => { clearTimeout(uhr); ok(false); };
        r.onsuccess = () => {
          const d = r.result;
          try {
            const t = d.transaction(["meta", "inhalt"], "readwrite");
            t.objectStore("meta").clear();
            t.objectStore("inhalt").clear();
            t.oncomplete = () => { clearTimeout(uhr); d.close(); ok(true); };
            t.onerror = t.onabort = () => { clearTimeout(uhr); d.close(); ok(false); };
          } catch { clearTimeout(uhr); d.close(); ok(false); }
        };
      });
    }
    // Ließ sich IndexedDB gerade nicht leeren: Marke setzen – der nächste Start mit IndexedDB leert zuerst (ablageOeffnen)
    try { if (idbGeleert) umgebung.localStorage.removeItem(marke); else umgebung.localStorage.setItem(marke, "1"); } catch { /* gesperrt */ }
    return idbGeleert;
  }

  /** Löschen nachholen lassen: der nächste Start mit IndexedDB leert zuerst (siehe ablageOeffnen). */
  function leerenNachholen({ demo = false, umgebung = typeof self !== "undefined" ? self : globalThis } = {}) {
    try { umgebung.localStorage.setItem(`${demo ? "gabi.demo." : "gabi."}gespraeche.leeren-offen`, "1"); return true; } catch { return false; }
  }

  /** Andere Tabs desselben Browsers benachrichtigen (Liste aktuell halten, Gelöschtes nicht wieder anlegen). */
  function kanal(name, beiNachricht) {
    try {
      const k = new BroadcastChannel(name);
      k.onmessage = (e) => { try { beiNachricht((e && e.data) || {}); } catch { /* egal */ } };
      return { senden(d) { try { k.postMessage(d); } catch { /* egal */ } }, schliessen() { try { k.close(); } catch { /* egal */ } } };
    } catch {
      return { senden() {}, schliessen() {} };
    }
  }

  return {
    MAX, TITEL_MAX, TITEL_EIGEN_MAX,
    istLeer, kuerzen, titelAus, titelSaeubern, gruppieren, ueberzaehlige, bereinigen, vorbereiten, ausVersion20, meta, offeneEntwuerfe, kartenVon, zusammenfuehren, endzustaendeUebernehmen,
    ablageOeffnen, idbAblage, lsAblage, speicherAblage, kanal, resteLoeschen, leerenNachholen,
  };
});
