// Einfaches Rate-Limit je IP und Bereich (feste Zeitfenster, im Speicher der Worker-Instanz).
// Bremst Ausprobieren von Zugangscodes und übermäßige KI-/Spracherkennungs-Kosten. Es speichert keine Inhalte.

export const GRENZEN = {
  status: [60, 60_000], //              /api/status: 60 pro Minute
  api: [120, 60_000], //                alle anderen Anfragen: 120 pro Minute
  transkribieren: [40, 10 * 60_000], // Spracherkennung: 40 je 10 Minuten
  strukturieren: [40, 10 * 60_000], //  KI-Notiz: 40 je 10 Minuten
  fehlversuch: [10, 15 * 60_000], //    falscher Zugangscode: 10 je 15 Minuten, danach gesperrt
};

export function erstelleBegrenzer({ jetzt = () => Date.now(), maxEintraege = 10_000 } = {}) {
  const fenster = new Map(); // Schlüssel → { anzahl, bis }

  function aufraeumen(t) {
    if (fenster.size < maxEintraege) return;
    for (const [k, v] of fenster) if (v.bis <= t) fenster.delete(k);
    if (fenster.size >= maxEintraege) fenster.clear();
  }
  const warte = (e, t) => Math.max(1, Math.ceil((e.bis - t) / 1000));

  return {
    /** Zählt einen Treffer. Ergebnis: { erlaubt, warteS } */
    treffer(schluessel, [limit, dauerMs]) {
      const t = jetzt();
      let e = fenster.get(schluessel);
      if (!e || e.bis <= t) {
        aufraeumen(t);
        e = { anzahl: 0, bis: t + dauerMs };
        fenster.set(schluessel, e);
      }
      e.anzahl++;
      return { erlaubt: e.anzahl <= limit, warteS: warte(e, t) };
    },
    /** Nur prüfen, ohne zu zählen: Sekunden bis zur Freigabe oder 0. */
    gesperrt(schluessel, [limit]) {
      const t = jetzt();
      const e = fenster.get(schluessel);
      return e && e.bis > t && e.anzahl >= limit ? warte(e, t) : 0;
    },
  };
}
