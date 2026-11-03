/* Gabi – PDF der Behandlungsnotiz (jsPDF, im Browser – nichts verlässt dafür das Gerät).
   Kopf: PhysioWorks, Datum, Kürzel · Abschnitte · „Bitte prüfen“ · Fuß auf jeder Seite: „Testversion – Testdaten“.
   Läuft auch in Node (Tests: worker/test/oberflaeche.test.js). */
(function (wurzel, fabrik) {
  const modul = fabrik();
  if (typeof module === "object" && module.exports) module.exports = modul;
  else wurzel.GabiPdf = modul;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ABSCHNITTE = [["befund", "Befund"], ["massnahmen", "Maßnahmen"], ["verlauf", "Verlauf"], ["hausaufgaben", "Hausaufgaben"]];
  const FUSS = "Testversion – Testdaten";
  const SEITE = { b: 210, h: 297, rand: 20, oben: 18, unten: 297 - 24 };
  const FARBE = {
    tinte: [35, 44, 51], text2: [86, 99, 107], text3: [135, 147, 154], linie: [224, 230, 227], flaeche: [244, 246, 245],
    gruen: [16, 168, 75], gelb: [255, 231, 168], gelbText: [92, 59, 0], warn: [138, 83, 0], warnHell: [255, 245, 224],
  };
  const ZEILE = 5.1; // mm je Textzeile bei 10.5 pt

  // Standard-Schriften im PDF kennen nur Westeuropäisch (WinAnsi) – Zeichen außerhalb umschreiben
  const ERSATZ = { "→": "->", "←": "<-", "↑": "hoch", "↓": "runter", "≤": "<=", "≥": ">=", "≈": "~", "‑": "-", "−": "-", "✓": "ok", " ": " ", " ": " " };
  function text(t) {
    return String(t ?? "")
      .replace(/[→←↑↓≤≥≈‑−✓  ]/g, (c) => ERSATZ[c])
      .replace(/[^\x20-\x7e -ÿ–—‘’‚“”„•…€\n]/g, "");
  }

  const zwei = (n) => String(n).padStart(2, "0");
  const datum = (d) => `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}`;
  const uhrzeit = (d) => `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
  const tag = (d) => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;

  function dateiname(n) {
    const k = String(n.kuerzel || "Notiz").replace(/[^A-Za-z0-9-]/g, "");
    return `PhysioWorks_${k}_${tag(new Date(n.erstellt_am))}.pdf`;
  }

  /** Baut das PDF und gibt das jsPDF-Dokument zurück (speichern macht der Aufrufer). */
  function erstellen(n, { jsPDF }) {
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const { b: B, rand: R } = SEITE;
    const BREITE = B - 2 * R;
    const erstellt = new Date(n.erstellt_am);
    const s = n.strukturiert || {};
    let y = SEITE.oben;

    const farbe = (f) => doc.setTextColor(f[0], f[1], f[2]);
    const fuellung = (f) => doc.setFillColor(f[0], f[1], f[2]);
    const strich = (f, w) => { doc.setDrawColor(f[0], f[1], f[2]); doc.setLineWidth(w); };
    const schrift = (stil, groesse) => { doc.setFont("helvetica", stil); doc.setFontSize(groesse); };

    function seitenkopf() { // ab Seite 2: kurze Kopfzeile
      schrift("normal", 8.5);
      farbe(FARBE.text3);
      doc.text(text(`PhysioWorks · Behandlungsnotiz · ${n.kuerzel} · ${datum(erstellt)}`), R, 13);
      strich(FARBE.linie, 0.3);
      doc.line(R, 15.5, B - R, 15.5);
      y = 24;
    }
    function platz(bedarf) {
      if (y + bedarf <= SEITE.unten) return;
      const { fontStyle } = doc.getFont(); // Schrift merken: der Seitenkopf setzt eine kleinere
      const groesse = doc.getFontSize();
      doc.addPage();
      seitenkopf();
      schrift(fontStyle, groesse);
    }

    // ---------- Kopf ----------
    schrift("bold", 20);
    farbe(FARBE.tinte);
    doc.text("PhysioWorks", R, y + 6);
    schrift("normal", 11);
    farbe(FARBE.text2);
    doc.text("Behandlungsnotiz", R, y + 12.5);
    // Kennzeichnung oben rechts
    schrift("bold", 8);
    const marke = "TESTVERSION";
    const mb = doc.getTextWidth(marke) + 6;
    fuellung(FARBE.gelb);
    doc.roundedRect(B - R - mb, y + 1.5, mb, 6, 3, 3, "F");
    farbe(FARBE.gelbText);
    doc.text(marke, B - R - mb / 2, y + 5.6, { align: "center" });
    y += 17;
    strich(FARBE.gruen, 0.8);
    doc.line(R, y, B - R, y);
    y += 5;

    // ---------- Infobox: Kürzel, Beschreibung, Datum, Uhrzeit ----------
    const spalten = [
      ["Patient (Kürzel)", n.kuerzel || "–", 34],
      ["Beschreibung", n.pseudonym || "–", 70],
      ["Datum", datum(erstellt), 33],
      ["Uhrzeit", `${uhrzeit(erstellt)} Uhr`, 33],
    ];
    schrift("bold", 11);
    const werte = spalten.map(([, wert, breite]) => doc.splitTextToSize(text(wert), breite - 6));
    const boxH = 12 + Math.max(...werte.map((w) => w.length)) * 4.8;
    fuellung(FARBE.flaeche);
    doc.roundedRect(R, y, BREITE, boxH, 2.5, 2.5, "F");
    let x = R + 5;
    spalten.forEach(([titel, , breite], i) => {
      schrift("normal", 7.5);
      farbe(FARBE.text3);
      doc.text(titel.toUpperCase(), x, y + 6);
      schrift("bold", 11);
      farbe(FARBE.tinte);
      doc.text(werte[i], x, y + 11.5);
      x += breite;
    });
    y += boxH + 4;
    if (n.geaendert_am) {
      const g = new Date(n.geaendert_am);
      schrift("normal", 8.5);
      farbe(FARBE.text3);
      doc.text(`Zuletzt bearbeitet: ${datum(g)}, ${uhrzeit(g)} Uhr`, R, y + 1);
      y += 5;
    }
    y += 5;

    // ---------- eine Textzeile mit gelb markiertem „(unklar)“ ----------
    function zeileSchreiben(zeile, x0) {
      let ab = 0;
      let i;
      fuellung(FARBE.gelb);
      while ((i = zeile.indexOf("(unklar)", ab)) >= 0) {
        const vor = doc.getTextWidth(zeile.slice(0, i));
        const w = doc.getTextWidth("(unklar)");
        doc.roundedRect(x0 + vor - 0.3, y - 3.7, w + 0.9, 4.9, 1, 1, "F");
        ab = i + 8;
      }
      doc.text(zeile, x0, y);
    }

    function punkteSchreiben(punkte, { punktFarbe = FARBE.gruen, hintergrund = null } = {}) {
      schrift("normal", 10.5);
      for (const p of punkte) {
        const zeilen = doc.splitTextToSize(text(p), BREITE - 8);
        zeilen.forEach((zeile, j) => {
          platz(ZEILE);
          if (hintergrund) { fuellung(hintergrund); doc.rect(R, y - 4, BREITE, ZEILE + 0.3, "F"); }
          if (j === 0) {
            fuellung(punktFarbe);
            doc.circle(R + 2.2, y - 1.3, 0.75, "F");
          }
          farbe(FARBE.tinte);
          zeileSchreiben(zeile, R + 6);
          y += ZEILE;
        });
        y += 1.4;
      }
    }

    function ueberschrift(titel, f = FARBE.tinte, ersteZeilen = 1) {
      platz(11 + ersteZeilen * ZEILE); // Überschrift nie allein unten auf der Seite
      schrift("bold", 12);
      farbe(f);
      doc.text(text(titel), R, y);
      y += 2.2;
      strich(FARBE.linie, 0.3);
      doc.line(R, y, B - R, y);
      y += 5.6;
    }

    // ---------- Abschnitte ----------
    for (const [key, titel] of ABSCHNITTE) {
      const punkte = Array.isArray(s[key]) ? s[key] : [];
      ueberschrift(titel, FARBE.tinte, punkte.length ? Math.min(2, doc.splitTextToSize(text(punkte[0]), BREITE - 8).length) : 1);
      if (!punkte.length) {
        schrift("italic", 10);
        farbe(FARBE.text3);
        doc.text("– nichts notiert –", R + 6, y);
        y += ZEILE + 3;
        continue;
      }
      punkteSchreiben(punkte);
      y += 3;
    }

    const unklar = Array.isArray(s.unklar) ? s.unklar : [];
    if (unklar.length) {
      ueberschrift("Bitte prüfen (unklare Stellen)", FARBE.warn);
      punkteSchreiben(unklar, { punktFarbe: FARBE.warn, hintergrund: FARBE.warnHell });
    }

    // ---------- Fuß auf jeder Seite ----------
    const seiten = doc.getNumberOfPages();
    for (let i = 1; i <= seiten; i++) {
      doc.setPage(i);
      strich(FARBE.linie, 0.3);
      doc.line(R, SEITE.h - 17, B - R, SEITE.h - 17);
      schrift("bold", 8.5);
      farbe(FARBE.warn);
      doc.text(FUSS, R, SEITE.h - 11.5);
      const fw = doc.getTextWidth(FUSS);
      schrift("normal", 8.5);
      farbe(FARBE.text3);
      doc.text("·  KI-Entwurf, fachlich zu prüfen  ·  erstellt mit Gabi", R + fw + 1.5, SEITE.h - 11.5);
      doc.text(`Seite ${i} von ${seiten}`, B - R, SEITE.h - 11.5, { align: "right" });
    }
    doc.setProperties({
      title: text(`Behandlungsnotiz ${n.kuerzel} ${tag(erstellt)}`),
      subject: FUSS,
      creator: "Gabi (PhysioWorks)",
    });
    return doc;
  }

  return { erstellen, dateiname, text, FUSS };
});
