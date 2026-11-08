/* Gabi – Kern: reine Hilfsfunktionen ohne Browser-Abhängigkeit (auch in Node testbar).
   Sicher formatierter Text, NDJSON-Strom lesen, Gesprächsverlauf für den Server, Datumsangaben. */
(function (wurzel, fabrik) {
  if (typeof module === "object" && module.exports) module.exports = fabrik();
  else wurzel.GabiKern = fabrik();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ABSCHNITTE = [
    ["befund", "Befund"],
    ["massnahmen", "Maßnahmen"],
    ["verlauf", "Verlauf"],
    ["hausaufgaben", "Hausaufgaben"],
  ];
  const UNKLAR = "unklar";

  function esc(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[z]);
  }

  /** Text sicher ausgeben und „(unklar)“ hervorheben. */
  function mitUnklar(text) {
    return esc(text).replace(/\(unklar\)/gi, '<mark class="unklar">(unklar)</mark>');
  }

  /** Inline: **fett** und (unklar) – alles andere bleibt Text. */
  function inline(text) {
    return mitUnklar(text).replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  }

  /** Kleiner, sicherer Markdown-Ersatz für Gabis Antworten: Absätze, Listen, **fett**. */
  function formatierterText(text) {
    const zeilen = String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
    const bloecke = [];
    let absatz = [];
    let liste = null;
    const absatzEnde = () => {
      if (absatz.length) bloecke.push(`<p>${absatz.map(inline).join("<br>")}</p>`);
      absatz = [];
    };
    const listeEnde = () => {
      if (liste) bloecke.push(`<${liste.typ}>${liste.punkte.map((p) => `<li>${inline(p)}</li>`).join("")}</${liste.typ}>`);
      liste = null;
    };
    for (const roh of zeilen) {
      const zeile = roh.trim();
      const punkt = /^(?:[-•*–])\s+(.*)$/.exec(zeile);
      const nummer = /^\d{1,2}[.)]\s+(.*)$/.exec(zeile);
      if (!zeile) { absatzEnde(); listeEnde(); continue; }
      if (punkt || nummer) {
        absatzEnde();
        const typ = punkt ? "ul" : "ol";
        if (liste && liste.typ !== typ) listeEnde();
        if (!liste) liste = { typ, punkte: [] };
        liste.punkte.push((punkt || nummer)[1]);
        continue;
      }
      listeEnde();
      absatz.push(zeile.replace(/^#{1,6}\s+/, ""));
    }
    absatzEnde();
    listeEnde();
    return bloecke.join("");
  }

  /** Text ohne Formatierung (zum Vorlesen und Kopieren). */
  function ohneFormat(text) {
    return String(text == null ? "" : text)
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/^\s*[-•*–]\s+/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * NDJSON-Leser: Stücke des Antwortstroms hinein, fertige Ereignisse heraus.
   * Kaputte Zeilen werden übersprungen (der Strom bricht dadurch nicht ab).
   */
  function zeilenLeser() {
    let rest = "";
    const lesen = (zeilen) => {
      const ereignisse = [];
      for (const z of zeilen) {
        const t = z.trim();
        if (!t) continue;
        try {
          const e = JSON.parse(t);
          if (e && typeof e === "object" && typeof e.t === "string") ereignisse.push(e);
        } catch { /* unvollständig oder kaputt – überspringen */ }
      }
      return ereignisse;
    };
    return {
      schieben(stueck) {
        rest += stueck;
        const teile = rest.split("\n");
        rest = teile.pop();
        return lesen(teile);
      },
      ende() {
        const letzte = rest;
        rest = "";
        return lesen([letzte]);
      },
    };
  }

  function stichpunkte(liste) {
    return Array.isArray(liste) ? liste.filter((p) => typeof p === "string" && p.trim()) : [];
  }

  /** Karten (Entwurf, Bericht) kurz als Text – damit Gabi im weiteren Gespräch weiß, was angezeigt wurde. */
  function karteAlsText(karte) {
    if (!karte || typeof karte !== "object") return "";
    if (karte.typ === "entwurf") {
      const s = karte.strukturiert || {};
      const teile = ABSCHNITTE.filter(([k]) => stichpunkte(s[k]).length).map(([k, titel]) => `${titel}: ${stichpunkte(s[k]).join("; ")}`);
      const zustand = karte.gespeichert ? "gespeichert" : karte.verworfen ? "verworfen" : "noch nicht gespeichert";
      return `[Notiz-Entwurf für ${karte.kuerzel} (${zustand}) – ${teile.join(" · ") || "leer"}]`;
    }
    if (karte.typ === "bericht") {
      const b = karte.bericht || {};
      return `[${b.titel || "Bericht"} für ${b.kuerzel} angezeigt – ${stichpunkte(b.zusammenfassung).join("; ")}]`;
    }
    return "";
  }

  /**
   * Gesprächsverlauf für den Server: nur echte Nachrichten (keine lokalen Hinweise, keine Fehler),
   * Karten als kurzer Text, neueste zuerst gekürzt auf die Grenzen des Servers.
   */
  function verlaufFuerServer(nachrichten, { maxNachrichten = 24, maxZeichen = 90000, maxProNachricht = 19000 } = {}) {
    const liste = [];
    for (const n of nachrichten || []) {
      if (!n || n.lokal || n.fehler || n.abgebrochen) continue;
      if (n.rolle !== "nutzer" && n.rolle !== "gabi") continue;
      let text = String(n.senden != null ? n.senden : n.text || "");
      const karten = (n.karten || []).map(karteAlsText).filter(Boolean);
      if (karten.length) text = `${text}${text ? "\n\n" : ""}${karten.join("\n")}`;
      text = text.trim().slice(0, maxProNachricht);
      if (text) liste.push({ rolle: n.rolle, text });
    }
    let auswahl = liste.slice(-maxNachrichten);
    while (auswahl.length > 1 && auswahl.reduce((s, n) => s + n.text.length, 0) > maxZeichen) auswahl = auswahl.slice(1);
    while (auswahl.length && auswahl[0].rolle !== "nutzer") auswahl = auswahl.slice(1);
    return auswahl;
  }

  // ---------- Datum (deutsche Zeit) ----------
  const ZONE = "Europe/Berlin";
  const fmt = (o) => new Intl.DateTimeFormat("de-DE", { timeZone: ZONE, ...o });
  const F_TAG = fmt({ day: "2-digit", month: "2-digit" });
  const F_DATUM = fmt({ day: "2-digit", month: "2-digit", year: "numeric" });
  const F_UHR = fmt({ hour: "2-digit", minute: "2-digit" });
  const F_LANG = fmt({ weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const F_ISO = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

  function tag(zeit) {
    const t = Object.fromEntries(F_ISO.formatToParts(new Date(zeit)).map((p) => [p.type, p.value]));
    return `${t.year}-${t.month}-${t.day}`;
  }
  const gueltig = (zeit) => zeit && !Number.isNaN(new Date(zeit).getTime());
  const datumKurz = (zeit) => (gueltig(zeit) ? F_TAG.format(new Date(zeit)).replace(/\.?$/, ".") : "");
  const datum = (zeit) => (gueltig(zeit) ? F_DATUM.format(new Date(zeit)) : "");
  const uhrzeit = (zeit) => (gueltig(zeit) ? F_UHR.format(new Date(zeit)) : "");
  const datumLang = (zeit) => (gueltig(zeit) ? F_LANG.format(new Date(zeit)) : "");

  /** „Heute, 10:30“, „Gestern, 18:05“ oder „03.11.2026“. */
  function wann(zeit, jetzt = new Date()) {
    if (!gueltig(zeit)) return "";
    const t = tag(zeit);
    if (t === tag(jetzt)) return `Heute, ${uhrzeit(zeit)}`;
    if (t === tag(new Date(new Date(jetzt).getTime() - 864e5))) return `Gestern, ${uhrzeit(zeit)}`;
    return datum(zeit);
  }

  /** Dateiname-Datum „2026-11-08“ in deutscher Zeit. */
  const dateiDatum = (zeit) => tag(zeit || new Date());

  /** Erster aussagekräftiger Stichpunkt einer Notiz (für Vorschauen). */
  function vorschau(strukturiert) {
    const s = strukturiert || {};
    for (const [k] of ABSCHNITTE) {
      const p = stichpunkte(s[k]);
      if (p.length) return p[0];
    }
    return "";
  }

  const anzahlUnklar = (strukturiert) => stichpunkte((strukturiert || {})[UNKLAR]).length;

  return {
    ABSCHNITTE, UNKLAR, esc, mitUnklar, formatierterText, ohneFormat, zeilenLeser, karteAlsText, verlaufFuerServer,
    tag, datumKurz, datum, uhrzeit, datumLang, wann, dateiDatum, vorschau, anzahlUnklar, stichpunkte,
  };
});
