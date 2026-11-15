/* Gabi – Notiz-Logik (v2.5): reine Funktionen ohne Browser-Abhängigkeit, dieselbe Datei für Oberfläche, Demo und Worker.
   (A) „Bitte prüfen“ erledigbar: Status jedes Prüfpunkts (Häkchen von Hand, automatisch erledigt durch Korrektur im Text)
   (B) Notiz per Gespräch ändern: Änderungsvorschlag prüfen, anwenden, Vorher/Nachher für die Karte

   Gespeichert wird der Status in der Notiz selbst, im Feld strukturiert (JSONB) – keine Schemaänderung:
     strukturiert.pruefung = [{ punkt, erledigt, stelle? }]
       punkt    – der Text des Prüfpunkts, genau wie in strukturiert.unklar (Schlüssel; Reihenfolge egal)
       erledigt – Häkchen von Hand
       stelle   – { abschnitt, ausschnitt, woerter }: die „(unklar)“-Stelle im Text, auf die sich der Punkt bezieht.
                  ausschnitt = bis zu drei Wörter vor der Markierung + „(unklar)“, woerter = die gemeinsamen Wörter von
                  Punkt und Zeile. Festgehalten, solange die Markierung noch dasteht (beim Entwurf und vor jeder Änderung).
   Ein Punkt ist erledigt, wenn er abgehakt ist ODER seine Stelle im Text nicht mehr als unklar markiert ist (Markierung
   entfernt oder die Zeile umgeschrieben). Wird die Stelle wieder mit „(unklar)“ markiert, ist er wieder offen.
   Notizen ohne pruefung bleiben gültig: alle Punkte offen. */
(function (wurzel, fabrik) {
  const modul = fabrik();
  if (typeof module === "object" && module.exports) module.exports = modul;
  else wurzel.GabiNotizLogik = modul;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ABSCHNITTE = ["befund", "massnahmen", "verlauf", "hausaufgaben"];
  const MARKE = /\(unklar\)/i;
  const MAX_PUNKTE = 30;
  const MAX_ZEICHEN = 600;
  const MAX_AENDERUNGEN = 5;
  // häufige Wörter tragen keine Zuordnung
  const STOPP = new Set(["und", "oder", "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "mit", "bei", "beim", "von", "vom", "zum", "zur", "für", "auf", "aus", "als", "nach", "nicht", "noch", "unklar", "welcher", "welche", "welches", "wurde", "gelesen", "widerspruch", "bitte", "prüfen", "sekunden", "wiederholungen", "oder"]);

  const glatt = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const klein = (s) => glatt(s).toLowerCase();
  const istListe = (x) => Array.isArray(x);
  const zeilen = (s, abschnitt) => (s && istListe(s[abschnitt]) ? s[abschnitt].filter((z) => typeof z === "string") : []);
  const unklarListe = (s) => (s && istListe(s.unklar) ? s.unklar.filter((z) => typeof z === "string" && z.trim()) : []);

  function woerter(text) {
    const m = klein(text).match(/[\p{L}\p{N}]+/gu) || [];
    return [...new Set(m.filter((w) => (w.length >= 3 || /\d/.test(w)) && !STOPP.has(w)))];
  }
  /** Korrekturmeldungen („„Isg“ als „ISG“ gelesen“) haben keine markierte Stelle – nur von Hand erledigbar. */
  const istKorrekturMeldung = (punkt) => /\bals\s+[„"«‚'].+[“"»‘']\s+gelesen\b/i.test(punkt) || /\bals\s+\S+\s+gelesen\b/i.test(punkt);

  /** Alle „(unklar)“-Markierungen im Text: Abschnitt, Zeile, Ausschnitt (bis zu drei Wörter davor + Markierung). */
  function marken(s) {
    const liste = [];
    for (const abschnitt of ABSCHNITTE) {
      for (const zeile of zeilen(s, abschnitt)) {
        const re = /\(unklar\)/gi;
        let m;
        while ((m = re.exec(zeile))) {
          const davor = zeile.slice(0, m.index).trim().split(/\s+/).filter(Boolean).slice(-3).join(" ");
          liste.push({ abschnitt, zeile, ausschnitt: glatt(`${davor} (unklar)`) });
        }
      }
    }
    return liste;
  }

  /** Ordnet jedem Prüfpunkt (ohne Korrekturmeldungen) höchstens eine Markierung zu – die mit den meisten gemeinsamen Wörtern. */
  function stellenZuordnen(s) {
    const alle = marken(s);
    const kandidaten = [];
    for (const punkt of unklarListe(s)) {
      if (istKorrekturMeldung(punkt)) continue;
      const pw = woerter(punkt);
      alle.forEach((mk, i) => {
        const zw = new Set(woerter(mk.zeile));
        const gemeinsam = pw.filter((w) => zw.has(w));
        if (gemeinsam.length) kandidaten.push({ punkt, i, gemeinsam, punktzahl: gemeinsam.length });
      });
    }
    kandidaten.sort((a, b) => b.punktzahl - a.punktzahl || a.i - b.i);
    const vergeben = new Set();
    const ergebnis = new Map();
    for (const k of kandidaten) {
      if (ergebnis.has(k.punkt) || vergeben.has(k.i)) continue;
      vergeben.add(k.i);
      const mk = alle[k.i];
      ergebnis.set(k.punkt, { abschnitt: mk.abschnitt, ausschnitt: mk.ausschnitt, woerter: k.gemeinsam.slice(0, 8) });
    }
    return ergebnis;
  }

  /** Steht die Stelle noch als unklar im Text? (Zeile im Abschnitt mit „(unklar)“ und dem Ausschnitt oder allen Schlüsselwörtern) */
  function stelleOffen(s, stelle) {
    if (!stelle) return true;
    const ausschnitt = klein(stelle.ausschnitt);
    const schluessel = istListe(stelle.woerter) ? stelle.woerter : [];
    return zeilen(s, stelle.abschnitt).some((z) => {
      if (!MARKE.test(z)) return false;
      if (ausschnitt && klein(z).includes(ausschnitt)) return true;
      if (!schluessel.length) return false;
      const zw = new Set(woerter(z));
      return schluessel.every((w) => zw.has(w));
    });
  }

  function stelleNormal(st) {
    if (!st || typeof st !== "object" || !ABSCHNITTE.includes(st.abschnitt)) return null;
    const ausschnitt = glatt(st.ausschnitt).slice(0, 200);
    if (!MARKE.test(ausschnitt)) return null;
    const w = istListe(st.woerter) ? st.woerter.filter((x) => typeof x === "string" && x && x.length <= 60).map((x) => x.toLowerCase()).slice(0, 8) : [];
    return { abschnitt: st.abschnitt, ausschnitt, woerter: w };
  }

  /**
   * pruefung bereinigen: nur Einträge zu Punkten, die in unklar stehen (genauer Text), je Punkt einer, erledigt als
   * true/false, Stelle geprüft. Einträge ohne Information (offen und ohne Stelle) fallen weg.
   */
  function pruefungNormalisieren(pruefung, unklar) {
    const punkte = new Set(istListe(unklar) ? unklar : []);
    const gesehen = new Set();
    const ergebnis = [];
    for (const e of istListe(pruefung) ? pruefung : []) {
      if (!e || typeof e !== "object" || typeof e.punkt !== "string") continue;
      if (!punkte.has(e.punkt) || gesehen.has(e.punkt)) continue;
      gesehen.add(e.punkt);
      const eintrag = { punkt: e.punkt, erledigt: e.erledigt === true };
      const st = stelleNormal(e.stelle);
      if (st) eintrag.stelle = st;
      if (eintrag.erledigt || eintrag.stelle) ergebnis.push(eintrag);
      if (ergebnis.length >= MAX_PUNKTE) break;
    }
    return ergebnis;
  }

  const eintragVon = (s, punkt) => (istListe(s && s.pruefung) ? s.pruefung : []).find((e) => e && e.punkt === punkt) || null;

  /** Status aller Prüfpunkte: [{ punkt, erledigt, manuell, auto }] und Zähler. */
  function status(s) {
    const punkte = unklarListe(s).map((punkt) => {
      const e = eintragVon(s, punkt);
      const manuell = Boolean(e && e.erledigt === true);
      const stelle = e ? stelleNormal(e.stelle) : null;
      const auto = Boolean(stelle) && !stelleOffen(s, stelle);
      return { punkt, erledigt: manuell || auto, manuell, auto };
    });
    return { punkte, erledigt: punkte.filter((p) => p.erledigt).length, gesamt: punkte.length };
  }
  const offenePunkte = (s) => status(s).punkte.filter((p) => !p.erledigt).map((p) => p.punkt);
  const erledigtePunkte = (s) => status(s).punkte.filter((p) => p.erledigt).map((p) => p.punkt);

  /** Kopie von s, in der jeder Punkt ohne Stelle eine bekommt, sofern seine Markierung jetzt im Text steht. */
  function mitStellen(s) {
    const quelle = s && typeof s === "object" ? s : {};
    const zuordnung = stellenZuordnen(quelle);
    const unklar = unklarListe(quelle);
    const neu = unklar.map((punkt) => {
      const e = eintragVon(quelle, punkt);
      const st = (e && stelleNormal(e.stelle)) || zuordnung.get(punkt) || null;
      const eintrag = { punkt, erledigt: Boolean(e && e.erledigt === true) };
      if (st) eintrag.stelle = st;
      return eintrag;
    });
    return { ...quelle, pruefung: pruefungNormalisieren(neu, unklar) };
  }

  /** Häkchen von Hand setzen oder entfernen. */
  function setzen(s, punkt, erledigt) {
    const quelle = s && typeof s === "object" ? s : {};
    const unklar = unklarListe(quelle);
    if (!unklar.includes(punkt)) return { ...quelle };
    const liste = (istListe(quelle.pruefung) ? quelle.pruefung : []).filter((e) => e && e.punkt !== punkt);
    const alt = eintragVon(quelle, punkt);
    const eintrag = { punkt, erledigt: erledigt === true };
    if (alt && stelleNormal(alt.stelle)) eintrag.stelle = stelleNormal(alt.stelle);
    return { ...quelle, pruefung: pruefungNormalisieren([...liste, eintrag], unklar) };
  }

  /**
   * Zwei Tabs: Häkchen dreiseitig zusammenführen. basis = Stand beim Laden, lokal = was dieser Tab speichern will,
   * server = was jetzt gespeichert ist. Hat dieser Tab ein Häkchen geändert, gilt seins – sonst das gespeicherte
   * (ein anderer Tab hat es inzwischen gesetzt oder entfernt). Ergebnis für die Punkte in unklar von lokal.
   */
  function zusammenfuehren({ basis, lokal, server }) {
    const unklar = unklarListe(lokal);
    const flag = (s, p) => Boolean(eintragVon(s, p) && eintragVon(s, p).erledigt === true);
    const ergebnis = unklar.map((punkt) => {
      const l = flag(lokal, punkt);
      const b = flag(basis, punkt);
      const sv = flag(server, punkt);
      const st = [lokal, server, basis].map((x) => eintragVon(x, punkt)).map((e) => e && stelleNormal(e.stelle)).find(Boolean) || null;
      const e = { punkt, erledigt: l !== b ? l : sv };
      if (st) e.stelle = st;
      return e;
    });
    return pruefungNormalisieren(ergebnis, unklar);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // (B) Änderungsvorschlag: Liste von { abschnitt, vorher, nachher } – vorher leer = neue Zeile, nachher leer = Zeile weg
  // ---------------------------------------------------------------------------------------------------------------

  /** Vorschlag gegen die Notiz prüfen. Ergebnis { aenderungen } oder { fehler }. */
  function aenderungPruefen(s, roh) {
    if (!istListe(roh) || !roh.length) return { fehler: "Keine Änderung angegeben." };
    if (roh.length > MAX_AENDERUNGEN) return { fehler: `Höchstens ${MAX_AENDERUNGEN} Änderungen auf einmal.` };
    const aenderungen = [];
    const benutzt = new Set();
    for (const a of roh) {
      if (!a || typeof a !== "object") return { fehler: "Ungültige Änderung." };
      if (!ABSCHNITTE.includes(a.abschnitt)) return { fehler: "Ändern lassen sich nur Befund, Maßnahmen, Verlauf und Hausaufgaben – nicht „Bitte prüfen“ und nicht das Original-Diktat." };
      if ((a.vorher != null && typeof a.vorher !== "string") || (a.nachher != null && typeof a.nachher !== "string")) return { fehler: "Ungültige Änderung." };
      const vorher = glatt(a.vorher);
      const nachher = glatt(a.nachher);
      if (/[\r\n]/.test(String(a.nachher || ""))) return { fehler: "Eine Änderung ist genau eine Zeile." };
      if (!vorher && !nachher) return { fehler: "Leere Änderung." };
      if (vorher === nachher) return { fehler: "Vorher und nachher sind gleich." };
      if (vorher.length > MAX_ZEICHEN || nachher.length > MAX_ZEICHEN) return { fehler: "Zeile zu lang." };
      if (vorher) {
        const da = zeilen(s, a.abschnitt).find((z) => glatt(z) === vorher);
        if (da === undefined) return { fehler: `„${vorher.slice(0, 80)}“ steht so nicht im Abschnitt ${a.abschnitt} – bitte die Notiz zuerst lesen und die Zeile wörtlich angeben.` };
        const schluessel = `${a.abschnitt}\n${vorher}`;
        if (benutzt.has(schluessel)) return { fehler: "Dieselbe Zeile zweimal geändert." };
        benutzt.add(schluessel);
        aenderungen.push({ abschnitt: a.abschnitt, vorher: da, nachher });
      } else {
        if (zeilen(s, a.abschnitt).some((z) => glatt(z) === nachher)) return { fehler: "Diese Zeile steht schon in der Notiz." };
        aenderungen.push({ abschnitt: a.abschnitt, vorher: "", nachher });
      }
    }
    return { aenderungen };
  }

  /**
   * Vorschlag anwenden (beim „Übernehmen“ auf den frisch geladenen Stand). Steht eine Vorher-Zeile nicht mehr da, wurde
   * die Notiz inzwischen geändert: { konflikt: zeile }. Sonst { strukturiert } – alle anderen Felder bleiben, wie sie sind.
   */
  function aenderungAnwenden(s, aenderungen) {
    const quelle = s && typeof s === "object" ? s : {};
    const neu = { ...quelle };
    for (const ab of ABSCHNITTE) neu[ab] = zeilen(quelle, ab).slice();
    for (const a of aenderungen || []) {
      const liste = neu[a.abschnitt];
      if (!liste) return { konflikt: a.vorher || a.nachher };
      if (a.vorher) {
        const i = liste.findIndex((z) => glatt(z) === glatt(a.vorher));
        if (i < 0) return { konflikt: a.vorher };
        if (a.nachher) liste[i] = a.nachher; else liste.splice(i, 1);
      } else {
        if (liste.some((z) => glatt(z) === glatt(a.nachher))) continue; // schon da (z. B. zweimal übernommen)
        liste.push(a.nachher);
      }
    }
    return { strukturiert: neu };
  }

  /** Für die Karte: die betroffenen Abschnitte mit allen Zeilen, geänderte markiert. */
  function vorherNachher(abschnitte, aenderungen) {
    const ergebnis = [];
    for (const ab of ABSCHNITTE) {
      const meine = (aenderungen || []).filter((a) => a.abschnitt === ab);
      if (!meine.length) continue;
      const liste = istListe(abschnitte && abschnitte[ab]) ? abschnitte[ab] : [];
      const zeilenNeu = [];
      for (const z of liste) {
        const a = meine.find((x) => x.vorher && glatt(x.vorher) === glatt(z));
        if (!a) zeilenNeu.push({ art: "gleich", text: z });
        else if (a.nachher) zeilenNeu.push({ art: "geaendert", vorher: z, nachher: a.nachher, diff: wortDiff(z, a.nachher) });
        else zeilenNeu.push({ art: "weg", text: z });
      }
      for (const a of meine) if (!a.vorher) zeilenNeu.push({ art: "neu", text: a.nachher });
      ergebnis.push({ abschnitt: ab, zeilen: zeilenNeu });
    }
    return ergebnis;
  }

  /** Gleicher Anfang und gleiches Ende (wortweise) – damit nur der geänderte Teil hervorgehoben wird. */
  function wortDiff(a, b) {
    const x = String(a).split(/(\s+)/);
    const y = String(b).split(/(\s+)/);
    let v = 0;
    while (v < x.length && v < y.length && x[v] === y[v]) v++;
    let h = 0;
    while (h < x.length - v && h < y.length - v && x[x.length - 1 - h] === y[y.length - 1 - h]) h++;
    return { vorn: x.slice(0, v).join(""), alt: x.slice(v, x.length - h).join(""), neu: y.slice(v, y.length - h).join(""), hinten: x.slice(x.length - h).join("") };
  }

  return {
    ABSCHNITTE, MAX_AENDERUNGEN, woerter, marken, stellenZuordnen, stelleOffen, pruefungNormalisieren, status, offenePunkte,
    erledigtePunkte, mitStellen, setzen, zusammenfuehren, istKorrekturMeldung, aenderungPruefen, aenderungAnwenden,
    vorherNachher, wortDiff,
  };
});
