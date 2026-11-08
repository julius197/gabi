/* Gabi – PDFs (jsPDF, im Browser – nichts verlässt dafür das Gerät): Behandlungsnotiz und Bericht.
   Kopf: PhysioWorks, Art, Testversion · Infobox (Kürzel, Datum …) · Abschnitte · „Bitte prüfen“ ·
   Fuß auf jeder Seite: „Testversion – Testdaten“, Seitenzahl. Läuft auch in Node (worker/test/oberflaeche.test.js). */
(function (wurzel, fabrik) {
  const modul = fabrik();
  if (typeof module === "object" && module.exports) module.exports = modul;
  else wurzel.GabiPdf = modul;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ABSCHNITTE = [["befund", "Befund"], ["massnahmen", "Maßnahmen"], ["verlauf", "Verlauf"], ["hausaufgaben", "Hausaufgaben"]];
  const FUSS = "Testversion – Testdaten";
  const SEITE = { b: 210, h: 297, rand: 20, oben: 20, unten: 297 - 26 };
  const FARBE = {
    tinte: [31, 42, 44], text2: [75, 88, 91], text3: [98, 110, 113], linie: [230, 235, 235], flaeche: [243, 243, 240],
    akzent: [40, 119, 61], ton: [54, 149, 77], hell: [76, 175, 80], blass: [108, 196, 113], akzentHell: [233, 248, 234], akzentTief: [30, 94, 49],
    warn: [138, 74, 0], warnHell: [255, 243, 224], markierung: [255, 226, 179],
  };
  const ZEILE = 5.2; // mm je Textzeile bei 10.5 pt

  // Standard-Schriften im PDF kennen nur Westeuropäisch (WinAnsi) – Zeichen außerhalb umschreiben
  const ERSATZ = { "→": "->", "←": "<-", "↑": "hoch", "↓": "runter", "≤": "<=", "≥": ">=", "≈": "~", "‑": "-", "−": "-", "✓": "ok", " ": " ", " ": " " };
  function text(t) {
    return String(t ?? "")
      .replace(/[→←↑↓≤≥≈‑−✓  ]/g, (c) => ERSATZ[c])
      .replace(/[^\x20-\x7e -ÿ–—‘’‚“”„•…€\n]/g, "");
  }

  const zwei = (n) => String(n).padStart(2, "0");
  const datum = (d) => `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}`;
  const uhrzeit = (d) => `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
  const tag = (d) => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
  const kurzKuerzel = (k) => String(k || "Notiz").replace(/[^A-Za-z0-9-]/g, "");

  function dateiname(n) {
    return `PhysioWorks_${kurzKuerzel(n.kuerzel)}_${tag(new Date(n.erstellt_am))}.pdf`;
  }
  function berichtDateiname(b) {
    return `PhysioWorks_${b.art === "zusammenfassung" ? "Zusammenfassung" : "Bericht"}_${kurzKuerzel(b.kuerzel)}_${tag(new Date(b.erstellt_am))}.pdf`;
  }

  /** Gemeinsames Gerüst: Kopf, Infobox, Überschriften, Stichpunkte, Fuß. */
  function dokument({ jsPDF, art, laufkopf }) {
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const { b: B, rand: R } = SEITE;
    const BREITE = B - 2 * R;
    const z = { y: SEITE.oben };

    const farbe = (f) => doc.setTextColor(f[0], f[1], f[2]);
    const fuellung = (f) => doc.setFillColor(f[0], f[1], f[2]);
    const strich = (f, w) => { doc.setDrawColor(f[0], f[1], f[2]); doc.setLineWidth(w); };
    const schrift = (stil, groesse) => { doc.setFont("helvetica", stil); doc.setFontSize(groesse); };

    function streifen() { // feiner Farbverlauf oben (wie in der App)
      const teile = [FARBE.blass, FARBE.hell, FARBE.ton, FARBE.akzent];
      const w = B / teile.length;
      teile.forEach((f, i) => { fuellung(f); doc.rect(i * w, 0, w + 0.2, 2.2, "F"); });
    }
    function seitenkopf() { // ab Seite 2: kurze Kopfzeile
      streifen();
      schrift("normal", 8.5);
      farbe(FARBE.text3);
      doc.text(text(laufkopf), R, 13);
      strich(FARBE.linie, 0.3);
      doc.line(R, 15.5, B - R, 15.5);
      z.y = 25;
    }
    function platz(bedarf) {
      if (z.y + bedarf <= SEITE.unten) return;
      const { fontStyle } = doc.getFont(); // Schrift merken: der Seitenkopf setzt eine kleinere
      const groesse = doc.getFontSize();
      doc.addPage();
      seitenkopf();
      schrift(fontStyle, groesse);
    }

    function kopf() {
      streifen();
      let y = z.y;
      schrift("bold", 21);
      farbe(FARBE.tinte);
      doc.text("PhysioWorks", R, y + 6);
      schrift("normal", 11);
      farbe(FARBE.text2);
      doc.text(text(art), R, y + 12.5);
      schrift("bold", 7.5);
      const marke = "TESTVERSION";
      const mb = doc.getTextWidth(marke) + 7;
      fuellung(FARBE.akzentHell);
      doc.roundedRect(B - R - mb, y + 1.2, mb, 6.4, 3.2, 3.2, "F");
      farbe(FARBE.akzentTief);
      doc.text(marke, B - R - mb / 2, y + 5.5, { align: "center" });
      z.y = y + 20;
    }

    /** Infobox mit Spalten [titel, wert, breite]. */
    function infobox(spalten) {
      schrift("bold", 11);
      const werte = spalten.map(([, wert, breite]) => doc.splitTextToSize(text(wert), breite - 7));
      const boxH = 13 + Math.max(...werte.map((w) => w.length)) * 4.8;
      fuellung(FARBE.flaeche);
      doc.roundedRect(R, z.y, BREITE, boxH, 3.5, 3.5, "F");
      let x = R + 6;
      spalten.forEach(([titel, , breite], i) => {
        schrift("bold", 7);
        farbe(FARBE.text3);
        doc.text(text(titel.toUpperCase()), x, z.y + 6.5);
        schrift("bold", 11);
        farbe(FARBE.tinte);
        doc.text(werte[i], x, z.y + 12);
        x += breite;
      });
      z.y += boxH + 4;
    }

    function hinweis(zeile) {
      schrift("normal", 8.5);
      farbe(FARBE.text3);
      doc.text(text(zeile), R, z.y + 1);
      z.y += 5;
    }

    // eine Textzeile mit markiertem „(unklar)“
    function zeileSchreiben(zeile, x0) {
      let ab = 0;
      let i;
      fuellung(FARBE.markierung);
      while ((i = zeile.indexOf("(unklar)", ab)) >= 0) {
        const vor = doc.getTextWidth(zeile.slice(0, i));
        const w = doc.getTextWidth("(unklar)");
        doc.roundedRect(x0 + vor - 0.4, z.y - 3.8, w + 1, 5, 1.2, 1.2, "F");
        ab = i + 8;
      }
      doc.text(zeile, x0, z.y);
    }

    function punkte(liste, { punktFarbe = FARBE.ton, hintergrund = null, einzug = 0 } = {}) {
      schrift("normal", 10.5);
      const x0 = R + einzug;
      for (const p of liste) {
        const zeilen = doc.splitTextToSize(text(p), BREITE - 8 - einzug);
        zeilen.forEach((zeile, j) => {
          platz(ZEILE);
          if (hintergrund) { fuellung(hintergrund); doc.rect(R, z.y - 4.1, BREITE, ZEILE + 0.3, "F"); }
          if (j === 0) {
            fuellung(punktFarbe);
            doc.circle(x0 + 2.3, z.y - 1.3, 0.8, "F");
          }
          farbe(FARBE.tinte);
          zeileSchreiben(zeile, x0 + 6);
          z.y += ZEILE;
        });
        z.y += 1.5;
      }
    }

    function ueberschrift(titel, { f = FARBE.tinte, ersteZeilen = 1 } = {}) {
      platz(12 + ersteZeilen * ZEILE); // Überschrift nie allein unten auf der Seite
      schrift("bold", 12);
      farbe(f);
      doc.text(text(titel), R, z.y);
      z.y += 2.4;
      strich(FARBE.linie, 0.3);
      doc.line(R, z.y, B - R, z.y);
      z.y += 5.8;
    }

    function leer(textLeer = "– nichts notiert –") {
      schrift("italic", 10);
      farbe(FARBE.text3);
      doc.text(textLeer, R + 6, z.y);
      z.y += ZEILE + 3;
    }

    function erstePunktZeilen(liste) {
      schrift("normal", 10.5);
      return liste.length ? Math.min(2, doc.splitTextToSize(text(liste[0]), BREITE - 8).length) : 1;
    }

    function fuss(titel) {
      const seiten = doc.getNumberOfPages();
      for (let i = 1; i <= seiten; i++) {
        doc.setPage(i);
        strich(FARBE.linie, 0.3);
        doc.line(R, SEITE.h - 18, B - R, SEITE.h - 18);
        schrift("bold", 8.5);
        farbe(FARBE.warn);
        doc.text(FUSS, R, SEITE.h - 12);
        const fw = doc.getTextWidth(FUSS);
        schrift("normal", 8.5);
        farbe(FARBE.text3);
        doc.text("·  KI-Entwurf, fachlich zu prüfen  ·  erstellt mit Gabi", R + fw + 1.5, SEITE.h - 12);
        doc.text(`Seite ${i} von ${seiten}`, B - R, SEITE.h - 12, { align: "right" });
      }
      doc.setProperties({ title: text(titel), subject: FUSS, creator: "Gabi (PhysioWorks)" });
    }

    return { doc, z, kopf, infobox, hinweis, punkte, ueberschrift, leer, erstePunktZeilen, fuss, platz, schrift, farbe, BREITE, R };
  }

  /** Behandlungsnotiz als PDF – gibt das jsPDF-Dokument zurück (speichern macht der Aufrufer). */
  function erstellen(n, { jsPDF }) {
    const erstellt = new Date(n.erstellt_am);
    const s = n.strukturiert || {};
    const d = dokument({ jsPDF, art: "Behandlungsnotiz", laufkopf: `PhysioWorks · Behandlungsnotiz · ${n.kuerzel} · ${datum(erstellt)}` });
    d.kopf();
    d.infobox([
      ["Patient (Kürzel)", n.kuerzel || "–", 34],
      ["Beschreibung", n.pseudonym || "–", 70],
      ["Datum", datum(erstellt), 33],
      ["Uhrzeit", `${uhrzeit(erstellt)} Uhr`, 33],
    ]);
    if (n.geaendert_am) {
      const g = new Date(n.geaendert_am);
      d.hinweis(`Zuletzt bearbeitet: ${datum(g)}, ${uhrzeit(g)} Uhr`);
    }
    d.z.y += 5;
    for (const [key, titel] of ABSCHNITTE) {
      const liste = Array.isArray(s[key]) ? s[key] : [];
      d.ueberschrift(titel, { ersteZeilen: d.erstePunktZeilen(liste) });
      if (!liste.length) { d.leer(); continue; }
      d.punkte(liste);
      d.z.y += 3;
    }
    const unklar = Array.isArray(s.unklar) ? s.unklar : [];
    if (unklar.length) {
      d.ueberschrift("Bitte prüfen (unklare Stellen)", { f: FARBE.warn });
      d.punkte(unklar, { punktFarbe: FARBE.warn, hintergrund: FARBE.warnHell });
    }
    d.fuss(`Behandlungsnotiz ${n.kuerzel} ${tag(erstellt)}`);
    return d.doc;
  }

  /** Bericht (Verlauf oder Zusammenfassung) aus den Notizen eines Test-Patienten. */
  function berichtErstellen(b, { jsPDF }) {
    const titel = b.art === "zusammenfassung" ? "Zusammenfassung" : "Verlaufsbericht";
    const erstellt = new Date(b.erstellt_am);
    const von = new Date(b.von);
    const bis = new Date(b.bis);
    const d = dokument({ jsPDF, art: titel, laufkopf: `PhysioWorks · ${titel} · ${b.kuerzel} · ${datum(erstellt)}` });
    d.kopf();
    d.infobox([
      ["Patient (Kürzel)", b.kuerzel || "–", 32],
      ["Beschreibung", b.pseudonym || "–", 54],
      ["Zeitraum", datum(von) === datum(bis) ? datum(von) : `${datum(von)} – ${datum(bis)}`, 60],
      ["Notizen", String(b.anzahl || 0), 24],
    ]);
    d.hinweis(`Erstellt am ${datum(erstellt)}, ${uhrzeit(erstellt)} Uhr – aus den gespeicherten Notizen, ohne Diagnosen oder Empfehlungen.`);
    d.z.y += 5;

    const zusammenfassung = Array.isArray(b.zusammenfassung) ? b.zusammenfassung : [];
    d.ueberschrift("Zusammenfassung", { ersteZeilen: d.erstePunktZeilen(zusammenfassung) });
    if (zusammenfassung.length) { d.punkte(zusammenfassung); d.z.y += 3; } else d.leer();

    const verlauf = Array.isArray(b.verlauf) ? b.verlauf : [];
    if (b.art !== "zusammenfassung") {
      d.ueberschrift("Verlauf", { ersteZeilen: 2 });
      if (!verlauf.length) d.leer();
      for (const v of verlauf) {
        d.platz(ZEILE * 2 + 4);
        d.schrift("bold", 10);
        d.farbe(FARBE.akzentTief);
        const dt = new Date(v.datum);
        d.doc.text(`${datum(dt)} · ${uhrzeit(dt)} Uhr`, d.R, d.z.y);
        d.z.y += ZEILE;
        d.punkte(v.punkte || [], { einzug: 2 });
        d.z.y += 2;
      }
      d.z.y += 2;
    }

    const aufgaben = Array.isArray(b.hausaufgaben) ? b.hausaufgaben : [];
    d.ueberschrift("Aktuelle Hausaufgaben", { ersteZeilen: d.erstePunktZeilen(aufgaben) });
    if (aufgaben.length) { d.punkte(aufgaben); d.z.y += 3; } else d.leer();

    const offen = Array.isArray(b.offen) ? b.offen : [];
    if (offen.length) {
      d.ueberschrift("Bitte prüfen (offene Punkte)", { f: FARBE.warn });
      d.punkte(offen, { punktFarbe: FARBE.warn, hintergrund: FARBE.warnHell });
    }
    d.fuss(`${titel} ${b.kuerzel} ${tag(erstellt)}`);
    return d.doc;
  }

  return { erstellen, berichtErstellen, dateiname, berichtDateiname, text, FUSS };
});
