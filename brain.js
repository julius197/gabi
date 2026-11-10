/* Gabi Brain – Modell: das Gedächtnis der Praxis als Wissensgraph. Reine Logik ohne Browser (auch in Node testbar).
   Knoten (Praxiswissen, Regeln, Persona, Fragen, Vorlagen) mit [[Verweisen]], Versionen, Papierkorb, Rückgängig,
   Prüfung aller Eingaben, sicheres Markdown, Import/Export, Wissenslücken, Nutzung durch Gabi, Gesundheit.
   Test-Patienten, Notizen, Berichte und die Kernregeln erscheinen als abgeleitete, schreibgeschützte Knoten.
   Formen und Schnittstellen: BRAIN-BAUPLAN.md. Braucht brain-suche.js (Normalisierung, Kontext-Auswahl). */
(function (wurzel, fabrik) {
  if (typeof module === "object" && module.exports) module.exports = fabrik(require("./brain-suche.js"));
  else wurzel.GabiBrain = fabrik(wurzel.GabiBrainSuche);
})(typeof self !== "undefined" ? self : this, function (SUCHE) {
  "use strict";

  const TAG_MS = 86400000;
  const ARTEN = [
    { id: "praxiswissen", name: "Praxiswissen", mehrzahl: "Praxiswissen", eigen: true },
    { id: "frage", name: "Frage", mehrzahl: "Fragen", eigen: true },
    { id: "regel", name: "Regel", mehrzahl: "Regeln", eigen: true },
    { id: "persona", name: "Persona", mehrzahl: "Persona", eigen: true },
    { id: "vorlage", name: "Vorlage", mehrzahl: "Vorlagen", eigen: true },
    { id: "patient", name: "Test-Patient", mehrzahl: "Test-Patienten", eigen: false },
    { id: "notiz", name: "Notiz", mehrzahl: "Notizen", eigen: false },
    { id: "bericht", name: "Bericht", mehrzahl: "Berichte", eigen: false },
  ];
  const ARTEN_EIGEN = ARTEN.filter((a) => a.eigen).map((a) => a.id);
  const STATUS = [
    { id: "bestaetigt", name: "Bestätigt" },
    { id: "entwurf", name: "Entwurf" },
    { id: "zu_klaeren", name: "Zu klären" },
  ];
  const STATUS_IDS = STATUS.map((s) => s.id);
  const KANTEN_ARTEN = ["verweis", "gehoert_zu", "notiz_von", "bericht_zu"];
  const KANTEN_EIGEN = ["verweis", "gehoert_zu"];
  const GRENZEN = {
    titelMin: 2, titelMax: 120, inhaltMax: 20000, tagsMax: 12, tagMax: 30, quelleMax: 80,
    versionen: 20, papierkorbTage: 30, veraltetTage: SUCHE.VERALTET_TAGE, undo: 50, luecken: 200, audit: 200,
    importDatei: 200000, importGesamt: 2000000, importKnoten: 500,
  };
  const ID_MUSTER = /^[A-Za-z0-9_-]{4,40}$/;
  const KERNREGELN_ID = "kernregeln";
  const KERNREGELN_TITEL = "Kernregeln (im Code)";
  const TRENNER = "%%% gabi-brain %%%"; // zwischen den Einträgen einer zusammengeführten Export-Datei

  const esc = (text) => String(text == null ? "" : text).replace(/[&<>"']/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[z]);

  // ---------- IDs, Titel, Verweise ----------
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  /** Neue Kennung im Stil von nanoid: 21 Zeichen, beginnt mit „k“ (nie wie Seed- oder abgeleitete Knoten). */
  function neueId() {
    const bytes = new Uint8Array(20);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    let id = "k";
    for (const b of bytes) id += ALPHABET[b & 63];
    return id;
  }

  /** Vergleichsform eines Titels – für Eindeutigkeit und das Auflösen von [[Verweisen]]. */
  const schluessel = (titel) => SUCHE.normal(titel);

  const VERWEIS = /\[\[([^[\]|\n]{1,120})(?:\|([^[\]\n]{1,120}))?\]\]/g;
  /** Alle [[Verweise]] eines Inhalts: [{ ziel, anzeige, roh, von, bis }]. */
  function verweiseAus(inhalt) {
    const liste = [];
    for (const m of String(inhalt == null ? "" : inhalt).matchAll(VERWEIS)) {
      const ziel = m[1].trim();
      if (ziel) liste.push({ ziel, anzeige: (m[2] || m[1]).trim(), roh: m[0], von: m.index, bis: m.index + m[0].length });
    }
    return liste;
  }

  // ---------- Bereinigen und Prüfen ----------
  const HTML = /<\/?[a-zA-Z][^>\n]*>|<!--|<\?|\bjavascript\s*:|\bvbscript\s*:|\bdata\s*:\s*text\/html/i;
  /** Enthält der Text HTML, Skripte oder gefährliche Adressen? */
  const hatHtml = (text) => HTML.test(String(text == null ? "" : text));

  /**
   * Text säubern (für Importe und alles, was von außen kommt): Steuerzeichen, Skript- und Stil-Blöcke samt Inhalt,
   * HTML-Tags, Kommentare und gefährliche Adress-Anfänge raus. Der lesbare Text bleibt.
   */
  function bereinigen(text) {
    let t = String(text == null ? "" : text).replace(/\r\n?/g, "\n").replace(/\t/g, " ");
    // eslint-disable-next-line no-control-regex
    t = t.replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g, "");
    let vorher;
    do {
      vorher = t;
      t = t
        .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
        .replace(/<\?[\s\S]*?(?:\?>|$)/g, "")
        .replace(/<\/?[a-zA-Z][^<>\n]*>/g, "")
        .replace(/\b(?:javascript|vbscript)\s*:/gi, "")
        .replace(/\bdata\s*:\s*text\/html[^\s)]*/gi, "");
    } while (t !== vorher);
    // was jetzt noch wie ein Tag-Anfang aussieht (ohne Ende), wird entschärft statt gelöscht – der Text dahinter bleibt
    t = t.replace(/<(?=[a-zA-Z/!?])/g, "‹");
    return t.split("\n").map((z) => z.replace(/\s+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  const einzeilig = (text) => bereinigen(text).replace(/\s+/g, " ").trim();

  /** Tag in Normalform: klein, ohne „#“, Leerraum als Bindestrich. */
  const tagNormal = (tag) => String(tag == null ? "" : tag).trim().replace(/^#+/, "").toLowerCase().replace(/[\s_]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  const TAG_MUSTER = /^[a-z0-9äöüß-]{1,30}$/;

  /**
   * Eingabe prüfen (Anlegen und Ändern). alle = die übrigen gespeicherten Knoten (für die Eindeutigkeit des Titels),
   * eigeneId = der Knoten, der gerade bearbeitet wird. Ergebnis: { ok, fehler: { feld: Satz }, knoten: bereinigte Felder }.
   */
  function pruefen(entwurf, { alle = [], eigeneId = "" } = {}) {
    const e = entwurf && typeof entwurf === "object" ? entwurf : {};
    const fehler = {};
    const art = String(e.art || "praxiswissen");
    if (!ARTEN_EIGEN.includes(art)) fehler.art = "Diese Art lässt sich im Brain nicht anlegen.";
    const status = String(e.status || "entwurf");
    if (!STATUS_IDS.includes(status)) fehler.status = "Unbekannter Status.";

    const titelRoh = String(e.titel == null ? "" : e.titel);
    const titel = titelRoh.replace(/\s+/g, " ").trim();
    if (hatHtml(titelRoh) || /[\u0000-\u001F\u007F]/.test(titelRoh.replace(/[\n\t]/g, ""))) fehler.titel = "Im Titel ist nur Text erlaubt.";
    else if (titel.length < GRENZEN.titelMin) fehler.titel = "Bitte gib einen Titel ein (mindestens 2 Zeichen).";
    else if (titel.length > GRENZEN.titelMax) fehler.titel = `Der Titel ist zu lang (höchstens ${GRENZEN.titelMax} Zeichen).`;
    else if (/[[\]|]/.test(titel)) fehler.titel = "Im Titel sind [ ] und | nicht erlaubt.";
    else {
      const s = schluessel(titel);
      if (!s) fehler.titel = "Der Titel braucht Buchstaben oder Ziffern.";
      else if (s === schluessel(KERNREGELN_TITEL) || (Array.isArray(alle) ? alle : []).some((k) => k && k.id !== eigeneId && !k.geloescht && schluessel(k.titel) === s)) fehler.titel = "Diesen Titel gibt es schon – bitte einen anderen wählen.";
    }

    const inhaltRoh = String(e.inhalt == null ? "" : e.inhalt).replace(/\r\n?/g, "\n");
    const inhalt = inhaltRoh.split("\n").map((z) => z.replace(/\s+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    // eslint-disable-next-line no-control-regex
    if (hatHtml(inhaltRoh) || /[\u0000-\u0008\u000B-\u001F\u007F]/.test(inhaltRoh)) fehler.inhalt = "HTML und Skripte sind im Brain nicht erlaubt – bitte nur Text.";
    else if (inhalt.length > GRENZEN.inhaltMax) fehler.inhalt = `Der Inhalt ist zu lang (höchstens ${GRENZEN.inhaltMax.toLocaleString("de-DE")} Zeichen).`;
    else if (!inhalt && status === "bestaetigt") fehler.inhalt = "Ein bestätigter Eintrag braucht einen Inhalt.";

    const tagsRoh = Array.isArray(e.tags) ? e.tags : typeof e.tags === "string" ? e.tags.split(/[,\n]/) : [];
    const tags = [...new Set(tagsRoh.map(tagNormal).filter(Boolean))];
    if (tags.length > GRENZEN.tagsMax) fehler.tags = `Höchstens ${GRENZEN.tagsMax} Tags.`;
    else if (tags.some((t) => !TAG_MUSTER.test(t))) fehler.tags = "Tags: nur Buchstaben, Ziffern und Bindestrich, höchstens 30 Zeichen.";

    const quelleRoh = String(e.quelle == null ? "" : e.quelle);
    const quelle = quelleRoh.replace(/\s+/g, " ").trim();
    if (hatHtml(quelleRoh)) fehler.quelle = "In der Quelle ist nur Text erlaubt.";
    else if (quelle.length > GRENZEN.quelleMax) fehler.quelle = `Die Quelle ist zu lang (höchstens ${GRENZEN.quelleMax} Zeichen).`;

    return { ok: !Object.keys(fehler).length, fehler, knoten: { art, titel, inhalt, tags, status, quelle } };
  }

  // ---------- Markdown (sicher: erst alles maskieren, dann wenige feste Muster) ----------
  function inlineHtml(roh, opt) {
    const teile = [];
    const platz = (html) => { teile.push(html); return `\u0001${teile.length - 1}\u0001`; };
    // eslint-disable-next-line no-control-regex
    let t = String(roh).replace(/[\u0000\u0001]/g, "");
    t = t.replace(/`([^`\n]+)`/g, (_, c) => platz(`<code>${esc(c)}</code>`));
    t = t.replace(VERWEIS, (roh, ziel, anzeige) => {
      if (roh.includes("\u0001")) return roh; // `Code` im Verweis: bleibt Text – Platzhalter werden nie verschachtelt
      const z = ziel.trim();
      const a = (anzeige || ziel).trim();
      const r = opt.aufloesen ? opt.aufloesen(z) : null;
      return platz(r && r.id
        ? `<a class="brain-verweis" href="#/brain/${esc(r.id)}">${esc(a)}</a>`
        : `<span class="brain-verweis fehlt" data-fehlt="${esc(z)}" title="Diesen Eintrag gibt es noch nicht">${esc(a)}</span>`);
    });
    t = t.replace(/\[([^\]\n\u0001]{1,200})\]\(((?:https?:\/\/|mailto:|tel:)[^\s)<>"'\u0001]{1,500})\)/g, (_, text, url) => platz(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`));
    t = esc(t)
      .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>")
      .replace(/(^|[\s(])_([^_\s][^_\n]*?)_(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>")
      .replace(/\(unklar\)/gi, '<mark class="unklar">(unklar)</mark>');
    // eslint-disable-next-line no-control-regex
    return t.replace(/\u0001(\d+)\u0001/g, (_, i) => teile[Number(i)]);
  }

  /**
   * Markdown → sicheres HTML für die Vorschau: Absätze, Listen, Überschriften, Zitate, Code, **fett**, *kursiv*,
   * Links (nur http, https, mailto, tel) und [[Verweise]]. aufloesen(titel) → { id } oder null (fehlender Knoten).
   */
  function markdownHtml(text, opt = {}) {
    const inline = (t) => inlineHtml(t, opt);
    const zeilen = String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
    const aus = [];
    let absatz = [];
    let liste = null;
    let zitat = [];
    let code = null;
    const absatzEnde = () => { if (absatz.length) aus.push(`<p>${absatz.map(inline).join("<br>")}</p>`); absatz = []; };
    const listeEnde = () => { if (liste) aus.push(`<${liste.typ}>${liste.punkte.map((p) => `<li>${inline(p)}</li>`).join("")}</${liste.typ}>`); liste = null; };
    const zitatEnde = () => { if (zitat.length) aus.push(`<blockquote>${zitat.map(inline).join("<br>")}</blockquote>`); zitat = []; };
    const alleEnde = () => { absatzEnde(); listeEnde(); zitatEnde(); };
    for (const roh of zeilen) {
      if (code) {
        if (/^\s*```/.test(roh)) { aus.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); code = null; } else code.push(roh);
        continue;
      }
      if (/^\s*```/.test(roh)) { alleEnde(); code = []; continue; }
      const z = roh.trim();
      if (!z) { alleEnde(); continue; }
      const kopf = /^(#{1,3})\s+(.*)$/.exec(z);
      if (kopf) { alleEnde(); const stufe = kopf[1].length + 2; aus.push(`<h${stufe}>${inline(kopf[2])}</h${stufe}>`); continue; }
      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(z)) { alleEnde(); aus.push("<hr>"); continue; }
      const punkt = /^[-•*–]\s+(.*)$/.exec(z);
      const nummer = /^\d{1,2}[.)]\s+(.*)$/.exec(z);
      if (punkt || nummer) {
        absatzEnde(); zitatEnde();
        const typ = punkt ? "ul" : "ol";
        if (liste && liste.typ !== typ) listeEnde();
        if (!liste) liste = { typ, punkte: [] };
        liste.punkte.push((punkt || nummer)[1]);
        continue;
      }
      const z2 = /^>\s?(.*)$/.exec(z);
      if (z2) { absatzEnde(); listeEnde(); zitat.push(z2[1]); continue; }
      listeEnde(); zitatEnde();
      absatz.push(z);
    }
    if (code) aus.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
    alleEnde();
    return aus.join("");
  }

  // ---------- Gesundheit ----------
  /** Kennzahlen über die eigenen (gespeicherten, nicht gelöschten) Knoten. */
  function gesundheit({ knoten = [], luecken = [], nutzung = null, jetzt = Date.now() } = {}) {
    const eigene = knoten.filter((k) => k && !k.abgeleitet && !k.geloescht);
    const zahl = (f) => eigene.filter(f).length;
    const g = {
      knoten: eigene.length,
      bestaetigt: zahl((k) => k.status === "bestaetigt"),
      entwurf: zahl((k) => k.status === "entwurf"),
      zuKlaeren: zahl((k) => k.status === "zu_klaeren"),
      veraltet: zahl((k) => SUCHE.istVeraltet(k, jetzt)),
      nieVerwendet: zahl((k) => SUCHE.istNieVerwendet(k, nutzung)),
      luecken: (Array.isArray(luecken) ? luecken : []).filter((l) => l && l.status === "offen").length,
    };
    g.prozent = g.knoten ? Math.round((g.bestaetigt / g.knoten) * 100) : 0;
    return g;
  }

  // ---------- Export ----------
  const iso = (ms) => { const d = new Date(Number(ms) || 0); return Number.isNaN(d.getTime()) ? "" : d.toISOString(); };
  const dateiName = (titel) => (SUCHE.normal(titel).replace(/ /g, "-").slice(0, 60).replace(/-+$/, "") || "eintrag");

  function alsMarkdown(k) {
    const kopf = [
      "---",
      `id: ${k.id}`,
      `titel: ${JSON.stringify(String(k.titel || ""))}`,
      `art: ${k.art}`,
      `status: ${k.status}`,
      `tags: [${(k.tags || []).join(", ")}]`,
      `quelle: ${JSON.stringify(String(k.quelle || ""))}`,
      `erstellt: ${iso(k.erstellt)}`,
      `geaendert: ${iso(k.geaendert)}`,
      "---",
    ];
    return `${kopf.join("\n")}\n\n${String(k.inhalt || "").trim()}\n`;
  }
  const exportierbar = (knoten) => (Array.isArray(knoten) ? knoten : []).filter((k) => k && !k.abgeleitet && !k.geloescht && ARTEN_EIGEN.includes(k.art));

  /** Je Knoten eine Markdown-Datei mit Frontmatter und [[Verweisen]]: [{ name, text }]. */
  function exportDateien(knoten) {
    const namen = new Map();
    return exportierbar(knoten).sort((a, b) => String(a.titel).localeCompare(String(b.titel), "de")).map((k) => {
      const basis = dateiName(k.titel);
      const n = (namen.get(basis) || 0) + 1;
      namen.set(basis, n);
      return { name: `${n > 1 ? `${basis}-${n}` : basis}.md`, text: alsMarkdown(k) };
    });
  }
  /** Alle Knoten in einer Datei (zum schnellen Ansehen oder wenn kein ZIP gewünscht ist). */
  const exportEineDatei = (knoten) => exportDateien(knoten).map((d) => d.text.trim()).join(`\n\n${TRENNER}\n\n`).concat("\n");

  // ---------- Import ----------
  const zeitAus = (wert, jetzt) => { const ms = Date.parse(String(wert || "")); return Number.isFinite(ms) && ms > 0 ? Math.min(ms, jetzt) : 0; };
  function skalar(v) {
    const t = String(v).trim();
    if (/^".*"$/.test(t)) { try { return String(JSON.parse(t)); } catch { return t.slice(1, -1); } }
    if (/^'.*'$/.test(t)) return t.slice(1, -1);
    return t;
  }
  /** Kleiner Frontmatter-Leser (Schlüssel: Wert, Listen in [a, b] oder als Zeilen mit „- “). Unbekanntes wird ignoriert. */
  function frontmatterLesen(text) {
    const m = /^\uFEFF?---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
    const kopf = Object.create(null); // keine Prototyp-Tricks über Schlüssel wie __proto__
    if (!m) return { kopf, rest: text };
    let liste = "";
    for (const zeile of m[1].split("\n")) {
      const punkt = /^\s*-\s+(.*)$/.exec(zeile);
      if (punkt && liste) { kopf[liste].push(skalar(punkt[1])); continue; }
      const kv = /^([A-Za-z_][A-Za-z0-9_]{0,30})\s*:\s*(.*)$/.exec(zeile);
      if (!kv) continue;
      const k = kv[1].toLowerCase();
      const v = kv[2].trim();
      if (!v) { kopf[k] = []; liste = k; continue; }
      liste = "";
      kopf[k] = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(",").map(skalar).filter(Boolean) : skalar(v);
    }
    return { kopf, rest: text.slice(m[0].length) };
  }
  const feld = (kopf, ...namen) => { for (const n of namen) if (kopf[n] !== undefined && !Array.isArray(kopf[n])) return String(kopf[n]); return ""; };

  /**
   * Import-Dateien lesen: [{ name, text }] → { knoten, fehler }. Alles wird bereinigt (kein HTML/Skript), begrenzt
   * (Größe je Datei und gesamt, Anzahl) und auf erlaubte Arten geprüft. Regeln und Persona kommen immer als Entwurf an
   * (sie wirken erst, wenn ein Mensch sie bestätigt). Patienten, Notizen, Berichte lassen sich nicht importieren.
   */
  function importLesen(dateien, { jetzt = Date.now() } = {}) {
    const knoten = [];
    const fehler = [];
    let gesamt = 0;
    for (const d of Array.isArray(dateien) ? dateien : []) {
      const name = einzeilig(d && d.name).slice(0, 120) || "Datei";
      const text = String((d && d.text) == null ? "" : d.text);
      if (!/\.(md|markdown|txt)$/i.test(name)) { fehler.push({ datei: name, text: "Nur Markdown-Dateien (.md) lassen sich importieren." }); continue; }
      if (text.length > GRENZEN.importDatei * (text.includes(TRENNER) ? 10 : 1)) { fehler.push({ datei: name, text: "Die Datei ist zu groß." }); continue; }
      gesamt += text.length;
      if (gesamt > GRENZEN.importGesamt) { fehler.push({ datei: name, text: "Zu viel auf einmal – höchstens 2 MB je Import." }); break; }
      for (const stueck of text.replace(/\r\n?/g, "\n").split(`\n${TRENNER}\n`)) {
        if (!stueck.trim()) continue;
        if (knoten.length >= GRENZEN.importKnoten) { fehler.push({ datei: name, text: `Höchstens ${GRENZEN.importKnoten} Einträge je Import – der Rest wurde ausgelassen.` }); break; }
        const { kopf, rest } = frontmatterLesen(stueck.replace(/^\n+/, ""));
        let inhalt = bereinigen(rest);
        let titel = einzeilig(feld(kopf, "titel", "title"));
        if (!titel) {
          const h = /^#\s+(.+)$/m.exec(inhalt);
          if (h) { titel = einzeilig(h[1]); inhalt = inhalt.replace(h[0], "").trim(); } else titel = name.replace(/\.(md|markdown|txt)$/i, "").replace(/[-_]+/g, " ").trim();
        }
        titel = titel.replace(/[[\]|]/g, " ").replace(/\s+/g, " ").trim().slice(0, GRENZEN.titelMax);
        const art = einzeilig(feld(kopf, "art", "type")).toLowerCase() || "praxiswissen";
        if (!ARTEN_EIGEN.includes(art)) { fehler.push({ datei: name, text: `„${titel || name}“: Die Art „${art.slice(0, 30)}“ lässt sich nicht importieren.` }); continue; }
        let status = einzeilig(feld(kopf, "status")).toLowerCase() || "entwurf";
        if (!STATUS_IDS.includes(status)) status = "entwurf";
        // Regeln und Persona wirken erst nach Bestätigung durch einen Menschen: „bestätigt“ aus einer Datei wird Entwurf
        const herabgestuft = (art === "regel" || art === "persona") && status === "bestaetigt";
        if (herabgestuft) status = "entwurf";
        const tagsRoh = Array.isArray(kopf.tags) ? kopf.tags : feld(kopf, "tags").split(",");
        const tags = [...new Set(tagsRoh.map((t) => tagNormal(einzeilig(t))).filter((t) => TAG_MUSTER.test(t)))].slice(0, GRENZEN.tagsMax);
        const id = feld(kopf, "id").trim();
        const erstellt = zeitAus(feld(kopf, "erstellt", "created"), jetzt);
        knoten.push({
          id: ID_MUSTER.test(id) && id !== KERNREGELN_ID && !/^[pnb]-/.test(id) ? id : "",
          art, titel, inhalt: inhalt.slice(0, GRENZEN.inhaltMax), tags, status,
          // ohne Angabe im Kopf: „Import“ – eine bewusst leere Quelle (eigener Export) bleibt leer
          quelle: kopf.quelle === undefined && kopf.source === undefined ? "Import" : einzeilig(feld(kopf, "quelle", "source")).slice(0, GRENZEN.quelleMax),
          erstellt, geaendert: zeitAus(feld(kopf, "geaendert", "updated"), jetzt) || erstellt,
          datei: name, ...(herabgestuft ? { herabgestuft: true } : {}),
        });
      }
    }
    if (!knoten.length && !fehler.length) fehler.push({ datei: "", text: "In den Dateien steht nichts, was sich importieren lässt." });
    return { knoten, fehler };
  }

  const FELDER = ["titel", "art", "status", "tags", "quelle", "inhalt"];
  const gleichesFeld = (a, b, f) => (f === "tags" ? JSON.stringify([...(a.tags || [])].sort()) === JSON.stringify([...(b.tags || [])].sort()) : String(a[f] || "") === String(b[f] || ""));

  /**
   * Import mit dem Bestand vergleichen (Vorschau vor dem Übernehmen): je Eintrag neu / geaendert / gleich / ungueltig,
   * mit dem alten Stand und den geänderten Feldern. Zuordnung über die id, sonst über den Titel.
   */
  function importVergleichen(aktuell, importiert) {
    const bestand = (Array.isArray(aktuell) ? aktuell : []).filter((k) => k && !k.abgeleitet);
    const nachId = new Map(bestand.map((k) => [k.id, k]));
    const nachTitel = new Map(bestand.filter((k) => !k.geloescht).map((k) => [schluessel(k.titel), k]));
    const ergebnis = [];
    const neueTitel = new Set();
    for (const k of Array.isArray(importiert) ? importiert : []) {
      const alt = (k.id && nachId.get(k.id)) || nachTitel.get(schluessel(k.titel)) || null;
      if (alt && alt.geschuetzt) { ergebnis.push({ art: "ungueltig", knoten: k, alt, felder: [], fehler: "Geschützte Einträge lassen sich nicht überschreiben." }); continue; }
      const p = pruefen(k, { alle: bestand, eigeneId: alt ? alt.id : "" });
      const s = schluessel(k.titel);
      if (p.ok && !alt && neueTitel.has(s)) { p.ok = false; p.fehler.titel = "Dieser Titel kommt im Import doppelt vor."; }
      if (!p.ok) { ergebnis.push({ art: "ungueltig", knoten: k, alt, felder: [], fehler: Object.values(p.fehler)[0] }); continue; }
      const sauber = { ...k, ...p.knoten };
      if (!alt) { neueTitel.add(s); ergebnis.push({ art: "neu", knoten: sauber, alt: null, felder: FELDER.slice(), fehler: "" }); continue; }
      let felder = FELDER.filter((f) => !gleichesFeld(alt, sauber, f));
      // Eigener Export wieder eingelesen: Die Regel/Persona ist hier schon bestätigt und sonst unverändert – dann ändert der
      // vorsorglich herabgestufte Status nichts. Weicht mehr ab, kommt sie als Entwurf an (wirkt erst nach neuer Bestätigung).
      const nurHerabgestuft = Boolean(k.herabgestuft) && alt.status === "bestaetigt" && felder.length === 1 && felder[0] === "status";
      if (nurHerabgestuft) felder = [];
      ergebnis.push({ art: alt.geloescht || felder.length ? "geaendert" : "gleich", knoten: { ...sauber, id: alt.id, ...(nurHerabgestuft ? { status: alt.status } : {}) }, alt, felder, fehler: "" });
    }
    return ergebnis;
  }

  // ---------- ZIP ohne Bibliothek (gespeichert, ohne Kompression) ----------
  let crcTabelle = null;
  function crc32(bytes) {
    if (!crcTabelle) {
      crcTabelle = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTabelle[n] = c >>> 0; }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = crcTabelle[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  /** [{ name, text }] → ZIP als Uint8Array (UTF-8-Namen, Methode „gespeichert“). */
  function zipSchreiben(dateien, { jetzt = new Date() } = {}) {
    const enc = new TextEncoder();
    const zeit = (jetzt.getHours() << 11) | (jetzt.getMinutes() << 5) | Math.floor(jetzt.getSeconds() / 2);
    const datum = (Math.max(0, jetzt.getFullYear() - 1980) << 9) | ((jetzt.getMonth() + 1) << 5) | jetzt.getDate();
    const lokal = [];
    const zentral = [];
    let lage = 0;
    for (const d of Array.isArray(dateien) ? dateien : []) {
      const name = enc.encode(String(d.name));
      const daten = enc.encode(String(d.text));
      const crc = crc32(daten);
      const kopf = new Uint8Array(30 + name.length);
      const v = new DataView(kopf.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true);
      v.setUint16(10, zeit, true); v.setUint16(12, datum, true); v.setUint32(14, crc, true);
      v.setUint32(18, daten.length, true); v.setUint32(22, daten.length, true); v.setUint16(26, name.length, true); v.setUint16(28, 0, true);
      kopf.set(name, 30);
      const z = new Uint8Array(46 + name.length);
      const w = new DataView(z.buffer);
      w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x0800, true); w.setUint16(10, 0, true);
      w.setUint16(12, zeit, true); w.setUint16(14, datum, true); w.setUint32(16, crc, true);
      w.setUint32(20, daten.length, true); w.setUint32(24, daten.length, true); w.setUint16(28, name.length, true);
      w.setUint32(42, lage, true);
      z.set(name, 46);
      lokal.push(kopf, daten);
      zentral.push(z);
      lage += kopf.length + daten.length;
    }
    const zentralLaenge = zentral.reduce((s, z) => s + z.length, 0);
    const ende = new Uint8Array(22);
    const e = new DataView(ende.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, zentral.length, true); e.setUint16(10, zentral.length, true);
    e.setUint32(12, zentralLaenge, true); e.setUint32(16, lage, true);
    const aus = new Uint8Array(lage + zentralLaenge + 22);
    let p = 0;
    for (const t of [...lokal, ...zentral, ende]) { aus.set(t, p); p += t.length; }
    return aus;
  }

  /**
   * ZIP lesen → Promise<[{ name, text }]> (nur .md/.txt, ohne Ordner). Gespeicherte Einträge direkt, komprimierte über
   * DecompressionStream (wo der Browser es kann). Grenzen gegen ZIP-Bomben: Anzahl, Größe je Datei und gesamt.
   */
  async function zipLesen(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let ende = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { ende = i; break; }
    if (ende < 0) throw new Error("Das ist keine gültige ZIP-Datei.");
    const anzahl = v.getUint16(ende + 10, true);
    let p = v.getUint32(ende + 16, true);
    if (anzahl > 600) throw new Error("Die ZIP-Datei enthält zu viele Dateien.");
    const dec = new TextDecoder("utf-8");
    const dateien = [];
    let gesamt = 0;
    for (let i = 0; i < anzahl; i++) {
      if (p + 46 > b.length || v.getUint32(p, true) !== 0x02014b50) throw new Error("Die ZIP-Datei ist beschädigt.");
      const methode = v.getUint16(p + 10, true);
      const gepackt = v.getUint32(p + 20, true);
      const gross = v.getUint32(p + 24, true);
      const nameLaenge = v.getUint16(p + 28, true);
      const extra = v.getUint16(p + 30, true);
      const kommentar = v.getUint16(p + 32, true);
      const lage = v.getUint32(p + 42, true);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nameLaenge));
      p += 46 + nameLaenge + extra + kommentar;
      const kurz = name.split("/").pop();
      if (!kurz || name.endsWith("/") || /(?:^|\/)(?:\.|__MACOSX)/.test(name) || !/\.(md|markdown|txt)$/i.test(kurz)) continue;
      if (gross > GRENZEN.importDatei || gepackt > GRENZEN.importDatei) throw new Error(`„${kurz.slice(0, 60)}“ ist zu groß.`);
      gesamt += gross;
      if (gesamt > GRENZEN.importGesamt) throw new Error("Zu viel auf einmal – höchstens 2 MB je Import.");
      if (lage + 30 > b.length || v.getUint32(lage, true) !== 0x04034b50) throw new Error("Die ZIP-Datei ist beschädigt.");
      const start = lage + 30 + v.getUint16(lage + 26, true) + v.getUint16(lage + 28, true);
      const roh = b.subarray(start, start + gepackt);
      let daten;
      if (methode === 0) daten = roh;
      else if (methode === 8 && typeof DecompressionStream === "function") {
        const strom = new Blob([roh]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        const leser = strom.getReader();
        const stuecke = [];
        let laenge = 0;
        for (;;) {
          let teil;
          try { teil = await leser.read(); } catch { throw new Error("Die ZIP-Datei ist beschädigt."); }
          const { done, value } = teil;
          if (done) break;
          laenge += value.length;
          if (laenge > GRENZEN.importDatei) { leser.cancel().catch(() => {}); throw new Error(`„${kurz.slice(0, 60)}“ ist zu groß.`); }
          stuecke.push(value);
        }
        daten = new Uint8Array(laenge);
        let q = 0;
        for (const s of stuecke) { daten.set(s, q); q += s.length; }
      } else throw new Error("Diese ZIP-Datei ist komprimiert – bitte entpacken und die .md-Dateien auswählen.");
      dateien.push({ name: kurz, text: dec.decode(daten) });
    }
    return dateien;
  }

  // ==========================================================
  // Das Brain: Zustand im Speicher, Schreiben über die Ablage, Rückgängig, Abgeleitetes
  // ==========================================================
  const F_TAG = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" });
  const tagKurz = (zeit) => { const d = new Date(zeit); return Number.isNaN(d.getTime()) ? "" : F_TAG.format(d).replace(/\.?$/, "."); };
  const INHALT_FELDER = ["art", "titel", "inhalt", "tags", "status", "quelle"];
  const stand = (k) => ({ art: k.art, titel: k.titel, inhalt: k.inhalt, tags: [...(k.tags || [])], status: k.status, quelle: k.quelle });
  const SPEICHER_FEHLER = "Speichern hat nicht geklappt. Bitte noch einmal versuchen.";
  /**
   * Schreiben ist gescheitert: Kennt die Ablage den Grund (Speicher voll, nur lesen, Stand von einer neueren Gabi, Verbindung
   * geschlossen – Fehler mit Kennzeichen „brain“ aus brain-speicher.js), kommt IHR Satz an die Oberfläche. „Noch einmal
   * versuchen“ hülfe dort nie. Alles andere bleibt beim allgemeinen Satz.
   */
  const speicherFehler = (e) => ({ fehler: { allgemein: e && e.brain && typeof e.message === "string" && e.message ? e.message : SPEICHER_FEHLER } });

  /**
   * Erzeugt ein Brain über einer Ablage (siehe brain-speicher.js).
   *   ablage  – Ablage mit laden/knotenSchreiben/… · seed – GabiBrainSeed (oder null) · demo – Demo-Zusätze einspielen
   *   jetzt   – () → ms · kanal – { senden(d) } für andere Tabs
   * Alle Aktionen sind asynchron und liefern { ok: true, … } oder { fehler: { feld | allgemein: Satz } } bzw. { konflikt }.
   * Die zurückgegebenen Knoten-Objekte gehören dem Brain – nicht verändern.
   */
  function erstelle({ ablage, seed = null, demo = false, jetzt = () => Date.now(), kanal = null } = {}) {
    const z = { knoten: new Map(), kanten: new Map(), luecken: new Map(), nutzung: new Map(), meta: {}, geladen: false };
    let abgeleitet = { knoten: [], kanten: [] };
    let quellen = { patienten: [], notizen: [], berichte: [] };
    let nummer = 0; // zählt bei jeder Änderung – Zwischenspeicher hängen daran
    let cache = { nummer: -1 };
    const hoerer = new Set();
    const undo = [];
    const redo = [];

    function melden(art, ids = []) {
      nummer += 1;
      for (const h of [...hoerer]) { try { h({ art, ids }); } catch { /* ein Hörer darf die anderen nicht stören */ } }
    }
    const anAndere = (art) => { try { if (kanal) kanal.senden({ art }); } catch { /* egal */ } };

    // ---- Abgeleitetes (je Änderung einmal gerechnet) ----
    function rechnen() {
      if (cache.nummer === nummer) return cache;
      const eigene = [...z.knoten.values()].filter((k) => !k.geloescht);
      const alle = [...eigene, ...abgeleitet.knoten];
      const nachId = new Map(alle.map((k) => [k.id, k]));
      const nachTitel = new Map();
      for (const k of abgeleitet.knoten) nachTitel.set(schluessel(k.titel), k.id);
      for (const k of eigene) nachTitel.set(schluessel(k.titel), k.id); // eigene Titel gewinnen
      const kanten = [];
      const gesehen = new Set();
      const dazu = (k) => {
        if (!nachId.has(k.von) || !nachId.has(k.nach) || k.von === k.nach) return;
        const s = `${k.von}>${k.nach}>${k.art}`;
        if (gesehen.has(s)) return;
        gesehen.add(s);
        kanten.push(k);
      };
      for (const k of z.kanten.values()) dazu(k);
      const fehlend = new Map(); // Titel-Schlüssel → { ziel, von: [ids] }
      const ausgehend = new Map();
      for (const k of eigene) {
        const liste = [];
        for (const v of verweiseAus(k.inhalt)) {
          const ziel = nachTitel.get(schluessel(v.ziel)) || null;
          if (liste.some((x) => (ziel ? x.id === ziel : !x.id && schluessel(x.titel) === schluessel(v.ziel)))) continue;
          liste.push({ titel: ziel ? nachId.get(ziel).titel : v.ziel, id: ziel, fehlt: !ziel });
          if (ziel) dazu({ id: `a-${k.id}-${ziel}`, von: k.id, nach: ziel, art: "verweis", auto: true });
          else {
            const s = schluessel(v.ziel);
            if (!fehlend.has(s)) fehlend.set(s, { ziel: v.ziel, von: [] });
            fehlend.get(s).von.push(k.id);
          }
        }
        ausgehend.set(k.id, liste);
      }
      for (const k of abgeleitet.kanten) dazu(k);
      const nachbarn = new Map(alle.map((k) => [k.id, new Set()]));
      const eingehend = new Map(alle.map((k) => [k.id, []]));
      for (const k of kanten) {
        nachbarn.get(k.von).add(k.nach);
        nachbarn.get(k.nach).add(k.von);
        eingehend.get(k.nach).push(k);
      }
      cache = { nummer, eigene, alle, nachId, nachTitel, kanten, fehlend, ausgehend, nachbarn, eingehend, index: null, kontextIndex: null };
      return cache;
    }

    function abgeleitetBauen() {
      const knoten = [];
      const kanten = [];
      const regeln = seed && Array.isArray(seed.kernregeln) ? seed.kernregeln : [];
      if (regeln.length) {
        knoten.push({
          id: KERNREGELN_ID, art: "regel", titel: KERNREGELN_TITEL, status: "bestaetigt", quelle: "Code", tags: ["kernregeln"],
          inhalt: `Diese Regeln stehen fest im Code. Über das Brain lassen sie sich nicht ändern – Regeln im Brain können Gabi nur zusätzlich einschränken oder ihren Ton ergänzen.\n\n${regeln.map((r) => `- **${r.titel}:** ${r.text}`).join("\n")}`,
          erstellt: 0, geaendert: 0, geschuetzt: true, abgeleitet: true, rev: 0, geloescht: 0,
        });
        // eigene Regeln und die Persona hängen sichtbar an den Kernregeln
        for (const k of z.knoten.values()) if (!k.geloescht && (k.art === "regel" || k.art === "persona")) kanten.push({ id: `a-${k.id}-${KERNREGELN_ID}`, von: k.id, nach: KERNREGELN_ID, art: "gehoert_zu", auto: true });
      }
      const patientNachId = new Map();
      const patientNachKuerzel = new Map();
      for (const p of quellen.patienten || []) {
        if (!p || !p.id || !p.kuerzel) continue;
        const id = `p-${p.id}`;
        patientNachId.set(p.id, id);
        patientNachKuerzel.set(String(p.kuerzel), id);
        knoten.push({
          id, art: "patient", titel: String(p.kuerzel), inhalt: "", tags: [], status: "bestaetigt", quelle: "Notizordner",
          erstellt: Date.parse(p.erstellt_am) || 0, geaendert: Date.parse(p.erstellt_am) || 0, geschuetzt: true, abgeleitet: true, rev: 0, geloescht: 0,
          ref: { typ: "patient", id: p.id, anzahl: Number(p.anzahl) || 0 },
        });
      }
      for (const n of quellen.notizen || []) {
        if (!n || !n.id) continue;
        const id = `n-${n.id}`;
        const zeit = Date.parse(n.erstellt_am) || 0;
        knoten.push({
          id, art: "notiz", titel: `${tagKurz(n.erstellt_am)} · ${String(n.kuerzel || "")}`.trim(), inhalt: "", tags: [], status: "bestaetigt", quelle: "Notizordner",
          erstellt: zeit, geaendert: Date.parse(n.geaendert_am) || zeit, geschuetzt: true, abgeleitet: true, rev: 0, geloescht: 0,
          ref: { typ: "notiz", id: n.id, patient: n.patient_id || "", kuerzel: String(n.kuerzel || "") },
        });
        const p = patientNachId.get(n.patient_id) || patientNachKuerzel.get(String(n.kuerzel || ""));
        if (p) kanten.push({ id: `a-${id}-${p}`, von: id, nach: p, art: "notiz_von", auto: true });
      }
      for (const b of quellen.berichte || []) {
        if (!b || !b.id) continue;
        const id = `b-${b.id}`;
        const zeit = Date.parse(b.erstellt_am) || 0;
        knoten.push({
          id, art: "bericht", titel: `${String(b.titel || "Bericht")} · ${String(b.kuerzel || "")} · ${tagKurz(b.erstellt_am)}`, inhalt: "", tags: [], status: "bestaetigt", quelle: "Gespräch",
          erstellt: zeit, geaendert: zeit, geschuetzt: true, abgeleitet: true, rev: 0, geloescht: 0,
          ref: { typ: "bericht", gespraech: b.gespraech || "", kuerzel: String(b.kuerzel || "") },
        });
        const p = patientNachKuerzel.get(String(b.kuerzel || ""));
        if (p) kanten.push({ id: `a-${id}-${p}`, von: id, nach: p, art: "bericht_zu", auto: true });
      }
      // gleiche Titel bei abgeleiteten Knoten (zwei Notizen am selben Tag) unterscheidbar machen
      const zahl = new Map();
      for (const k of knoten) {
        const s = schluessel(k.titel);
        const n = (zahl.get(s) || 0) + 1;
        zahl.set(s, n);
        if (n > 1) k.titel = `${k.titel} (${n})`;
      }
      abgeleitet = { knoten, kanten };
    }

    // ---- Laden, Seed ----
    function uebernehmen(daten) {
      z.knoten = new Map((daten.knoten || []).filter((k) => k && k.id).map((k) => [k.id, k]));
      z.kanten = new Map((daten.kanten || []).filter((k) => k && k.id).map((k) => [k.id, k]));
      z.luecken = new Map((daten.luecken || []).filter((l) => l && l.id).map((l) => [l.id, l]));
      z.nutzung = new Map((daten.nutzung || []).filter((n) => n && n.id).map((n) => [n.id, n]));
      z.meta = daten.meta && typeof daten.meta === "object" ? { ...daten.meta } : {};
    }

    function seedKnoten(t) {
      const veraltet = (demo && seed.demo && seed.demo.veraltet) || {};
      const liste = [...(seed.knoten || []), ...((demo && seed.demo && seed.demo.knoten) || [])];
      return liste.filter((k) => k && ID_MUSTER.test(String(k.id || ""))).map((k) => {
        const zurueck = Number(veraltet[k.id]) > 0 ? Number(veraltet[k.id]) * TAG_MS : 0;
        return {
          id: k.id, art: k.art, titel: k.titel, inhalt: k.inhalt || "", tags: Array.isArray(k.tags) ? k.tags : [], status: k.status || "entwurf", quelle: k.quelle || "",
          erstellt: t - zurueck, geaendert: t - zurueck, geschuetzt: false, rev: 1, geloescht: 0, ...(k.seed ? { seed: k.seed } : {}),
        };
      });
    }

    /** Erster Start: Seed in EINEM Vorgang einspielen – nur wenn noch keiner da ist (zwei Tabs spielen ihn nicht doppelt ein). */
    async function seedEinspielen() {
      const t = jetzt();
      const kanten = (seed.kanten || []).filter((k) => k && k.id && KANTEN_EIGEN.includes(k.art)).map((k) => ({ id: k.id, von: k.von, nach: k.nach, art: k.art, auto: false }));
      const d = (demo && seed.demo) || null;
      const luecken = (d && Array.isArray(d.luecken) ? d.luecken : []).map((l, i) => {
        const zuletzt = t - (Number(l.tageZurueck) || 0) * TAG_MS;
        const erstmals = t - Math.max(Number(l.erstmalsTageZurueck) || 0, Number(l.tageZurueck) || 0) * TAG_MS;
        return { id: `sl-${i + 1}`, frage: String(l.frage || ""), schluessel: schluessel(l.frage), erstmals, zuletzt, anzahl: Math.max(1, Number(l.anzahl) || 1), status: "offen", knoten: "" };
      }).filter((l) => l.frage);
      const nutzung = Object.entries((d && d.nutzung) || {}).map(([id, n]) => ({ id, anzahl: Math.max(1, Number(n && n.anzahl) || 1), zuletzt: t - (Number(n && n.tageZurueck) || 0) * TAG_MS }));
      await ablage.stapel({ knoten: seedKnoten(t), kanten, versionen: {}, luecken, nutzung, meta: { seed: String(seed.version || "1") }, nurWennMeta: { schluessel: "seed" } });
    }

    /** Neue Fassung des Seeds (Wissensdatei geändert): Neues ergänzen, Unberührtes (rev 1) aktualisieren – Bearbeitetes bleibt. */
    async function seedNachziehen() {
      const t = jetzt();
      const weg = new Set(Array.isArray(z.meta.seedWeg) ? z.meta.seedWeg : []);
      const neu = [];
      // trägt schon ein anderer Eintrag diesen Titel (selbst angelegt), legt der Seed keinen zweiten daneben – sonst ließe sich keiner von beiden mehr ändern
      const belegt = (k) => [...z.knoten.values()].some((x) => x.id !== k.id && !x.geloescht && schluessel(x.titel) === schluessel(k.titel));
      for (const k of seedKnoten(t)) {
        if (k.quelle === "Demo" && z.knoten.size) continue;
        const alt = z.knoten.get(k.id);
        if (!alt) { if (!weg.has(k.id) && !belegt(k)) neu.push(k); continue; }
        if (alt.geloescht || belegt(k) || !INHALT_FELDER.some((f) => !gleichesFeld(alt, k, f))) continue;
        // unberührt = nie von Hand geändert: Jede frühere Fassung stammt selbst aus dem Seed – und der Verlauf ist lückenlos
        // (so viele Fassungen wie Änderungen). Im Zweifel bleibt der Eintrag, wie er ist. „rev === 1“ allein hätte nur die
        // erste neue Fassung durchgelassen – danach wäre der Eintrag für immer stehen geblieben.
        let unberuehrt = alt.rev === 1;
        if (!unberuehrt) {
          try {
            const fassungen = await ablage.verlauf(alt.id);
            unberuehrt = fassungen.length === Math.min(alt.rev - 1, Number(ablage.verlaufMax) || GRENZEN.versionen) && fassungen.every((v) => v && v.grund === "seed");
          } catch { unberuehrt = false; }
        }
        if (unberuehrt) {
          await ablage.knotenSchreiben({ ...alt, ...stand(k), geaendert: t }, { erwartet: alt.rev, version: { nr: alt.rev, zeit: t, grund: "seed", ...stand(alt) } });
        }
      }
      const kanten = (seed.kanten || []).filter((k) => k && k.id && !z.kanten.has(k.id) && KANTEN_EIGEN.includes(k.art)).map((k) => ({ id: k.id, von: k.von, nach: k.nach, art: k.art, auto: false }));
      if (neu.length || kanten.length) await ablage.stapel({ knoten: neu, kanten, versionen: {} });
      await ablage.metaSchreiben("seed", String(seed.version || "1"));
    }

    /**
     * Aufräumen und Nachziehen beim Start schreiben. Lässt die Ablage gerade nicht schreiben (Speicher voll, nur lesen, Stand
     * von einer neueren Gabi), bleibt das Brain trotzdem lesbar und exportierbar – der nächste Start holt es nach. Nur Fehler
     * der Ablage werden hier geschluckt (Kennzeichen „brain“), alles andere ist ein echter Fehler.
     */
    async function beimStart(tun) {
      try { await tun(); return true; } catch (e) { if (!(e && e.brain)) throw e; return false; }
    }

    async function laden() {
      uebernehmen(await ablage.laden());
      let frisch = false;
      if (seed && Array.isArray(seed.knoten)) {
        if (!z.knoten.size && z.meta.seed === undefined) { await seedEinspielen(); frisch = true; uebernehmen(await ablage.laden()); }
        else if (z.meta.seed !== undefined && z.meta.seed !== String(seed.version || "1")) { await beimStart(seedNachziehen); uebernehmen(await ablage.laden()); }
      }
      // Papierkorb: nach 30 Tagen endgültig weg
      const grenze = jetzt() - GRENZEN.papierkorbTage * TAG_MS;
      const alt = [...z.knoten.values()].filter((k) => k.geloescht && k.geloescht < grenze);
      // (mittendrin gescheitert: Stand neu holen – sonst zeigte der Papierkorb, was im Speicher schon weg ist)
      if (alt.length && !(await beimStart(() => endgueltigWeg(alt)))) uebernehmen(await ablage.laden());
      z.geladen = true;
      abgeleitetBauen();
      melden("geladen");
      return { art: ablage.art, frisch };
    }
    /** Ein anderer Tab hat etwas geändert: Stand neu holen (ohne Seed-Logik). */
    async function neuLaden() {
      uebernehmen(await ablage.laden());
      abgeleitetBauen();
      melden("extern");
    }

    // ---- Schreiben ----
    const eigeneListe = () => [...z.knoten.values()];
    async function schreiben(knoten, opt) {
      let r;
      try { r = await ablage.knotenSchreiben(knoten, opt); } catch (e) { return speicherFehler(e); }
      if (r && r.konflikt) {
        if (r.aktuell) z.knoten.set(r.aktuell.id, r.aktuell); else z.knoten.delete(knoten.id);
        abgeleitetBauen();
        melden("konflikt", [knoten.id]);
        return { konflikt: true, aktuell: r.aktuell || null };
      }
      z.knoten.set(r.knoten.id, r.knoten);
      abgeleitetBauen();
      nummer += 1; // Zwischenspeicher sofort ungültig (das Melden folgt beim Aufrufer)
      return { ok: true, knoten: r.knoten };
    }
    function merkeUndo(eintrag) {
      undo.push(eintrag);
      if (undo.length > GRENZEN.undo) undo.shift();
      redo.length = 0;
    }

    async function anlegen(daten, { grund = "neu", id = "", mitUndo = true } = {}) {
      const p = pruefen(daten, { alle: eigeneListe() });
      if (!p.ok) return { fehler: p.fehler };
      const t = jetzt();
      const neu = { id: id && ID_MUSTER.test(id) && !z.knoten.has(id) ? id : neueId(), ...p.knoten, erstellt: Number(daten.erstellt) > 0 ? Number(daten.erstellt) : t, geaendert: t, geschuetzt: false, rev: 0, geloescht: 0 };
      const r = await schreiben(neu, { neu: true });
      if (!r.ok) return r.konflikt ? { fehler: { allgemein: "Diesen Eintrag gibt es schon." } } : r;
      if (mitUndo) merkeUndo({ name: `„${r.knoten.titel}“ angelegt`, zurueck: () => loeschen(r.knoten.id, { mitUndo: false }), tun: () => wiederherstellen(r.knoten.id, { mitUndo: false }) });
      melden("knoten", [r.knoten.id]);
      anAndere(grund);
      return r;
    }

    /** Verweise in anderen Knoten folgen einer Umbenennung (wie in Obsidian). */
    async function verweiseUmbenennen(altTitel, neuTitel, ausser) {
      const alt = schluessel(altTitel);
      const betroffen = [];
      for (const k of eigeneListe()) {
        if (k.id === ausser || k.geloescht || !verweiseAus(k.inhalt).some((v) => schluessel(v.ziel) === alt)) continue;
        const inhalt = k.inhalt.replace(VERWEIS, (roh, ziel, anzeige) => (schluessel(ziel) === alt ? `[[${neuTitel}${anzeige ? `|${anzeige}` : ""}]]` : roh));
        const r = await schreiben({ ...k, inhalt, geaendert: jetzt() }, { erwartet: k.rev, version: { nr: k.rev, zeit: jetzt(), grund: "umbenannt", ...stand(k) } });
        if (r.ok) betroffen.push({ id: k.id, vorher: k.inhalt, nachher: inhalt });
      }
      return betroffen;
    }

    async function aendern(id, felder, { grund = "bearbeitet", erwartet, mitUndo = true } = {}) {
      const alt = z.knoten.get(id);
      if (!alt || alt.geloescht) return { fehler: { allgemein: rechnen().nachId.has(id) ? "Geschützte Einträge lassen sich hier nicht ändern." : "Diesen Eintrag gibt es nicht mehr." } };
      if (alt.geschuetzt) return { fehler: { allgemein: "Geschützte Einträge lassen sich hier nicht ändern." } };
      const wunsch = { ...stand(alt) };
      for (const f of INHALT_FELDER) if (felder && felder[f] !== undefined) wunsch[f] = felder[f];
      const p = pruefen(wunsch, { alle: eigeneListe(), eigeneId: id });
      if (!p.ok) return { fehler: p.fehler };
      if (INHALT_FELDER.every((f) => gleichesFeld(alt, p.knoten, f))) return { ok: true, knoten: alt, unveraendert: true };
      const t = jetzt();
      const r = await schreiben({ ...alt, ...p.knoten, geaendert: t }, { erwartet: erwartet === undefined ? alt.rev : erwartet, version: { nr: alt.rev, zeit: t, grund, ...stand(alt) } });
      if (!r.ok) return r;
      const umbenannt = schluessel(alt.titel) !== schluessel(p.knoten.titel) ? await verweiseUmbenennen(alt.titel, p.knoten.titel, id) : [];
      if (mitUndo) {
        const vorher = stand(alt);
        const nachher = stand(r.knoten);
        merkeUndo({
          name: `Änderung an „${r.knoten.titel}“`,
          zurueck: async () => {
            const x = await aendern(id, vorher, { grund: "rueckgaengig", mitUndo: false });
            for (const u of umbenannt) await aendern(u.id, { inhalt: u.vorher }, { grund: "rueckgaengig", mitUndo: false });
            return x;
          },
          tun: () => aendern(id, nachher, { grund: "wiederholt", mitUndo: false }),
        });
      }
      melden("knoten", [id, ...umbenannt.map((u) => u.id)]);
      anAndere(grund);
      return { ...r, umbenannt: umbenannt.length };
    }

    async function loeschen(id, { mitUndo = true } = {}) {
      const alt = z.knoten.get(id);
      if (!alt) return { fehler: { allgemein: rechnen().nachId.has(id) ? "Geschützte Einträge lassen sich nicht löschen." : "Diesen Eintrag gibt es nicht mehr." } };
      if (alt.geschuetzt) return { fehler: { allgemein: "Geschützte Einträge lassen sich nicht löschen." } };
      if (alt.geloescht) return { ok: true, knoten: alt };
      const r = await schreiben({ ...alt, geloescht: jetzt() }, { erwartet: alt.rev });
      if (!r.ok) return r;
      if (mitUndo) merkeUndo({ name: `„${alt.titel}“ gelöscht`, zurueck: () => wiederherstellen(id, { mitUndo: false }), tun: () => loeschen(id, { mitUndo: false }) });
      melden("knoten", [id]);
      anAndere("geloescht");
      return r;
    }

    async function wiederherstellen(id, { mitUndo = true } = {}) {
      const alt = z.knoten.get(id);
      if (!alt) return { fehler: { allgemein: "Dieser Eintrag ist endgültig gelöscht." } };
      if (!alt.geloescht) return { ok: true, knoten: alt };
      // inzwischen hat ein anderer Eintrag diesen Titel: wiederhergestellt kommt er mit Zusatz zurück
      let titel = alt.titel;
      const belegt = (t) => schluessel(t) === schluessel(KERNREGELN_TITEL) || eigeneListe().some((k) => k.id !== id && !k.geloescht && schluessel(k.titel) === schluessel(t));
      for (let n = 2; belegt(titel) && n < 50; n++) titel = `${alt.titel.slice(0, GRENZEN.titelMax - 22)} (wiederhergestellt${n > 2 ? ` ${n - 1}` : ""})`;
      const r = await schreiben({ ...alt, titel, geloescht: 0 }, { erwartet: alt.rev });
      if (!r.ok) return r;
      if (mitUndo) merkeUndo({ name: `„${titel}“ wiederhergestellt`, zurueck: () => loeschen(id, { mitUndo: false }), tun: () => wiederherstellen(id, { mitUndo: false }) });
      melden("knoten", [id]);
      anAndere("wiederhergestellt");
      return r;
    }

    async function endgueltigWeg(knoten) {
      const ids = knoten.map((k) => k.id);
      await ablage.knotenEntfernen(ids);
      const kanten = [...z.kanten.values()].filter((k) => ids.includes(k.von) || ids.includes(k.nach)).map((k) => k.id);
      if (kanten.length) await ablage.kantenEntfernen(kanten);
      const seedIds = knoten.filter((k) => k.seed).map((k) => k.id);
      if (seedIds.length) {
        z.meta.seedWeg = [...new Set([...(Array.isArray(z.meta.seedWeg) ? z.meta.seedWeg : []), ...seedIds])];
        await ablage.metaSchreiben("seedWeg", z.meta.seedWeg);
      }
      for (const id of ids) { z.knoten.delete(id); z.nutzung.delete(id); }
      for (const id of kanten) z.kanten.delete(id);
    }
    /** Endgültig löschen (nur aus dem Papierkorb, nicht rückgängig zu machen). */
    async function endgueltigLoeschen(id) {
      const alt = z.knoten.get(id);
      if (!alt) return { ok: true };
      if (!alt.geloescht) return { fehler: { allgemein: "Erst in den Papierkorb legen, dann endgültig löschen." } };
      try { await endgueltigWeg([alt]); } catch (e) { return speicherFehler(e); }
      abgeleitetBauen();
      melden("knoten", [id]);
      anAndere("endgueltig");
      return { ok: true };
    }
    async function papierkorbLeeren() {
      const alle = [...z.knoten.values()].filter((k) => k.geloescht);
      if (!alle.length) return { ok: true, anzahl: 0 };
      try { await endgueltigWeg(alle); } catch (e) { return speicherFehler(e); }
      abgeleitetBauen();
      melden("knoten", alle.map((k) => k.id));
      anAndere("endgueltig");
      return { ok: true, anzahl: alle.length };
    }
    const papierkorb = () => [...z.knoten.values()].filter((k) => k.geloescht).sort((a, b) => b.geloescht - a.geloescht)
      .map((k) => ({ knoten: k, tageRest: Math.max(0, GRENZEN.papierkorbTage - Math.floor((jetzt() - k.geloescht) / TAG_MS)) }));

    // ---- Versionen ----
    async function verlauf(id) {
      if (!z.knoten.has(id)) return [];
      try { return [...(await ablage.verlauf(id))].sort((a, b) => (b.zeit - a.zeit) || (b.nr - a.nr)); } catch { return []; }
    }
    async function versionWiederherstellen(id, nr) {
      const liste = await verlauf(id);
      const v = liste.find((x) => x.nr === nr);
      if (!v) return { fehler: { allgemein: "Diese Version gibt es nicht mehr." } };
      return aendern(id, stand(v), { grund: "wiederhergestellt" });
    }

    // ---- Kanten ----
    async function kanteAnlegen(von, nach, art = "verweis", { mitUndo = true } = {}) {
      const c = rechnen();
      if (!KANTEN_EIGEN.includes(art)) return { fehler: { allgemein: "Diese Verbindung lässt sich nicht anlegen." } };
      if (von === nach || !c.nachId.has(von) || !c.nachId.has(nach)) return { fehler: { allgemein: "Beide Einträge müssen vorhanden und verschieden sein." } };
      if (!z.knoten.has(von) || z.knoten.get(von).geloescht) return { fehler: { allgemein: "Verbindungen gehen nur von eigenen Einträgen aus." } };
      if (c.kanten.some((k) => k.art === art && ((k.von === von && k.nach === nach) || (k.von === nach && k.nach === von)))) return { fehler: { allgemein: "Diese Verbindung gibt es schon." } };
      const kante = { id: `e${neueId().slice(1)}`, von, nach, art, auto: false };
      try { await ablage.kantenSchreiben([kante]); } catch (e) { return speicherFehler(e); }
      z.kanten.set(kante.id, kante);
      if (mitUndo) merkeUndo({ name: "Verbindung angelegt", zurueck: () => kanteLoeschen(kante.id, { mitUndo: false }), tun: async () => { await ablage.kantenSchreiben([kante]); z.kanten.set(kante.id, kante); melden("kanten"); return { ok: true }; } });
      melden("kanten", [von, nach]);
      anAndere("kante");
      return { ok: true, kante };
    }
    async function kanteLoeschen(id, { mitUndo = true } = {}) {
      const kante = z.kanten.get(id);
      if (!kante) return { fehler: { allgemein: "Diese Verbindung steht im Text des Eintrags – dort den [[Verweis]] entfernen." } };
      try { await ablage.kantenEntfernen([id]); } catch (e) { return speicherFehler(e); }
      z.kanten.delete(id);
      if (mitUndo) merkeUndo({ name: "Verbindung gelöscht", zurueck: async () => { await ablage.kantenSchreiben([kante]); z.kanten.set(kante.id, kante); melden("kanten"); return { ok: true }; }, tun: () => kanteLoeschen(id, { mitUndo: false }) });
      melden("kanten", [kante.von, kante.nach]);
      anAndere("kante");
      return { ok: true };
    }

    // ---- Rückgängig / Wiederholen (nur diese Sitzung) ----
    async function rueckgaengig() {
      const e = undo.pop();
      if (!e) return { fehler: { allgemein: "Nichts zum Rückgängigmachen." } };
      const r = await e.zurueck();
      if (r && (r.fehler || r.konflikt)) return { fehler: { allgemein: "Das ließ sich nicht rückgängig machen – der Eintrag wurde inzwischen geändert." } };
      redo.push(e);
      return { ok: true, name: e.name };
    }
    async function wiederholen() {
      const e = redo.pop();
      if (!e) return { fehler: { allgemein: "Nichts zum Wiederholen." } };
      const r = await e.tun();
      if (r && (r.fehler || r.konflikt)) return { fehler: { allgemein: "Das ließ sich nicht wiederholen – der Eintrag wurde inzwischen geändert." } };
      undo.push(e);
      return { ok: true, name: e.name };
    }

    // ---- Wissenslücken ----
    const KUERZEL = /\b[A-Za-zÄÖÜäöü]{1,4}-\d{1,4}\b|\b[A-ZÄÖÜ]{2,4}\d{1,4}\b/;
    /** Frage, die Gabi nicht aus dem Brain beantworten konnte. Fragen mit Patienten-Kürzel gehören nicht ins Brain. */
    /** Nennt der Text das Kürzel eines vorhandenen Test-Patienten – auch klein, ohne Bindestrich oder ohne führende Null („tp 1“, „kn7“)? */
    function nenntPatienten(text) {
      const form = (t) => schluessel(t).replace(/(^|\D)0+(?=\d)/g, "$1");
      const kuerzel = new Set((quellen.patienten || []).map((p) => form(p && p.kuerzel).replace(/ /g, "")).filter(Boolean));
      if (!kuerzel.size) return false;
      const w = form(text).split(" ");
      return w.some((_, i) => [1, 2, 3].some((n) => kuerzel.has(w.slice(i, i + n).join(""))));
    }
    /**
     * Eine eingetragene Lücke, deren Eintrag es nicht mehr gibt (gelöscht, rückgängig gemacht, Papierkorb geleert), ist
     * wieder offen – sonst tauchte die Frage nie wieder auf.
     */
    function lueckeStand(l) {
      if (!l || l.status !== "eingetragen") return l;
      const k = l.knoten ? z.knoten.get(l.knoten) : null;
      return k && !k.geloescht ? l : { ...l, status: "offen", knoten: "" };
    }
    async function lueckeMelden(frage) {
      const text = einzeilig(frage).slice(0, 200);
      const s = schluessel(text);
      if (s.length < 4 || KUERZEL.test(text) || nenntPatienten(text)) return null;
      const t = jetzt();
      let l = [...z.luecken.values()].find((x) => x.schluessel === s);
      if (l) l = { ...lueckeStand(l), anzahl: (Number(l.anzahl) || 1) + 1, zuletzt: t };
      else l = { id: `l${neueId().slice(1)}`, frage: text, schluessel: s, erstmals: t, zuletzt: t, anzahl: 1, status: "offen", knoten: "" };
      try {
        await ablage.lueckenSchreiben([l]);
        z.luecken.set(l.id, l);
        // Obergrenze: zuerst Erledigtes, dann das am längsten nicht mehr Gefragte
        if (z.luecken.size > GRENZEN.luecken) {
          const weg = [...z.luecken.values()].sort((a, b) => Number(a.status === "offen") - Number(b.status === "offen") || a.zuletzt - b.zuletzt).slice(0, z.luecken.size - GRENZEN.luecken).map((x) => x.id);
          await ablage.lueckenEntfernen(weg);
          for (const id of weg) z.luecken.delete(id);
        }
      } catch { return null; }
      melden("luecken");
      anAndere("luecke");
      return l;
    }
    /** „Ins Brain eintragen“: Entwurfsknoten (zu klären) mit der Frage als Titel. */
    async function lueckeEintragen(id) {
      const l = z.luecken.get(id);
      if (!l) return { fehler: { allgemein: "Diese Lücke gibt es nicht mehr." } };
      const vorhanden = eigeneListe().find((k) => !k.geloescht && schluessel(k.titel) === schluessel(l.frage));
      const r = vorhanden ? { ok: true, knoten: vorhanden } : await anlegen({ art: "frage", titel: l.frage.replace(/[[\]|]/g, " ").replace(/\s+/g, " ").trim().slice(0, GRENZEN.titelMax), inhalt: "", tags: ["luecke"], status: "zu_klaeren", quelle: "Gespräch" }, { grund: "luecke" });
      if (!r.ok) return r;
      const neu = { ...l, status: "eingetragen", knoten: r.knoten.id };
      try { await ablage.lueckenSchreiben([neu]); } catch (e) { return speicherFehler(e); }
      z.luecken.set(id, neu);
      melden("luecken");
      anAndere("luecke");
      return r;
    }
    async function lueckeVerwerfen(id) {
      const l = z.luecken.get(id);
      if (!l) return { ok: true };
      try { await ablage.lueckenEntfernen([id]); } catch (e) { return speicherFehler(e); }
      z.luecken.delete(id);
      melden("luecken");
      anAndere("luecke");
      return { ok: true };
    }
    const luecken = ({ alle = false } = {}) => [...z.luecken.values()].map(lueckeStand).filter((l) => alle || l.status === "offen").sort((a, b) => b.anzahl - a.anzahl || b.zuletzt - a.zuletzt);

    // ---- Nutzung, Audit ----
    /** Gabi hat diese Knoten für eine Antwort verwendet (kein Inhalt, nur Zähler und Zeit). */
    async function nutzungZaehlen(ids) {
      const gueltig = [...new Set(Array.isArray(ids) ? ids : [])].filter((id) => z.knoten.has(id) && !z.knoten.get(id).geloescht);
      if (!gueltig.length) return;
      const t = jetzt();
      try { await ablage.nutzungZaehlen(gueltig, t); } catch { return; }
      for (const id of gueltig) z.nutzung.set(id, { id, anzahl: ((z.nutzung.get(id) || {}).anzahl || 0) + 1, zuletzt: t });
      melden("nutzung", gueltig);
      anAndere("nutzung");
    }
    const nutzung = (id) => z.nutzung.get(id) || { id, anzahl: 0, zuletzt: 0 };
    const audit = () => (Array.isArray(z.meta.audit) ? z.meta.audit : []).slice().reverse();
    async function auditSchreiben(faehigkeit) {
      const f = String(faehigkeit || "").slice(0, 60);
      if (!/^[a-z0-9-]{2,60}$/.test(f)) return;
      z.meta.audit = [...(Array.isArray(z.meta.audit) ? z.meta.audit : []), { zeit: jetzt(), faehigkeit: f }].slice(-GRENZEN.audit);
      try { await ablage.metaSchreiben("audit", z.meta.audit); } catch { /* die Spur ist nicht wichtiger als die Arbeit */ }
      melden("audit");
    }
    async function auditLeeren() {
      z.meta.audit = [];
      try { await ablage.metaSchreiben("audit", []); } catch (e) { return speicherFehler(e); }
      melden("audit");
      return { ok: true };
    }

    // ---- Kontext für Gabi ----
    function personaText() {
      const p = rechnen().eigene.filter((k) => k.art === "persona" && k.status === "bestaetigt").sort((a, b) => a.erstellt - b.erstellt)[0];
      return p ? SUCHE.kuerzen(SUCHE.ohneVerweise(p.inhalt), 800) : "";
    }
    const regelTexte = () => rechnen().eigene.filter((k) => k.art === "regel" && k.status === "bestaetigt").sort((a, b) => String(a.titel).localeCompare(String(b.titel), "de")).slice(0, 6)
      .map((k) => SUCHE.kuerzen(`${k.titel}: ${SUCHE.ohneVerweise(k.inhalt).replace(/\s+/g, " ")}`, 400));
    const gesund = () => gesundheit({ knoten: rechnen().eigene, luecken: [...z.luecken.values()].map(lueckeStand), nutzung: z.nutzung, jetzt: jetzt() });
    /** Was Gabi für eine Frage mitbekommt (Form: Bauplan §5.1). Nie Patienten, Notizen, Berichte. */
    function kontextFuer(frage, { dazu = [] } = {}) {
      const c = rechnen();
      if (!c.kontextIndex) {
        c.kontextKandidaten = c.eigene.filter((k) => SUCHE.KONTEXT_ARTEN.includes(k.art));
        c.kontextIndex = SUCHE.erstelleIndex(c.kontextKandidaten);
      }
      const g = gesund();
      const kontext = {
        v: 1,
        knoten: SUCHE.kontextWaehlen({ frage, knoten: c.kontextKandidaten, kanten: c.kanten, index: c.kontextIndex, dazu }),
        stand: { knoten: g.knoten, bestaetigt: g.bestaetigt, entwurf: g.entwurf, zuKlaeren: g.zuKlaeren, veraltet: g.veraltet, nieVerwendet: g.nieVerwendet, luecken: g.luecken },
      };
      const persona = personaText();
      if (persona) kontext.persona = persona;
      const regeln = regelTexte();
      if (regeln.length) kontext.regeln = regeln;
      return kontext;
    }
    /** Suche über alles Sichtbare (auch abgeleitete Knoten – dort nur Titel). */
    function suchen(anfrage, opt) {
      const c = rechnen();
      if (!c.index) c.index = SUCHE.erstelleIndex(c.alle);
      return SUCHE.suchen(c.index, anfrage, opt);
    }

    // ---- Import, Zurücksetzen ----
    /** Ausgewählte Einträge aus importVergleichen übernehmen (neu und geaendert) – ein Schritt zum Rückgängigmachen. */
    async function importieren(eintraege) {
      const schritte = [];
      const fehler = [];
      let neu = 0;
      let geaendert = 0;
      for (const e of Array.isArray(eintraege) ? eintraege : []) {
        if (!e || !e.knoten || (e.art !== "neu" && e.art !== "geaendert")) continue;
        if (e.art === "neu") {
          const r = await anlegen(e.knoten, { grund: "import", id: e.knoten.id, mitUndo: false });
          if (r.ok) { neu += 1; schritte.push({ zurueck: () => loeschen(r.knoten.id, { mitUndo: false }), tun: () => wiederherstellen(r.knoten.id, { mitUndo: false }) }); } else fehler.push(`${e.knoten.titel}: ${Object.values(r.fehler || { x: "nicht übernommen" })[0]}`);
        } else {
          const alt = z.knoten.get(e.knoten.id);
          if (!alt) continue;
          const vorher = stand(alt);
          const warWeg = alt.geloescht;
          if (warWeg) await wiederherstellen(alt.id, { mitUndo: false });
          const r = await aendern(alt.id, stand(e.knoten), { grund: "import", mitUndo: false });
          if (r.ok) { geaendert += 1; schritte.push({ zurueck: async () => { await aendern(alt.id, vorher, { grund: "rueckgaengig", mitUndo: false }); if (warWeg) await loeschen(alt.id, { mitUndo: false }); }, tun: () => aendern(alt.id, stand(e.knoten), { grund: "import", mitUndo: false }) }); } else fehler.push(`${e.knoten.titel}: ${r.konflikt ? "inzwischen geändert" : Object.values(r.fehler || { x: "nicht übernommen" })[0]}`);
        }
      }
      if (schritte.length) {
        merkeUndo({
          name: `Import (${schritte.length === 1 ? "1 Eintrag" : `${schritte.length} Einträge`})`,
          zurueck: async () => { for (const s of [...schritte].reverse()) await s.zurueck(); return { ok: true }; },
          tun: async () => { for (const s of schritte) await s.tun(); return { ok: true }; },
        });
      }
      return { ok: true, neu, geaendert, fehler };
    }

    /** Alles löschen und den Seed neu einspielen (Demo: „Beispieldaten zurücksetzen“). */
    async function zuruecksetzen() {
      await ablage.leeren();
      undo.length = 0;
      redo.length = 0;
      const r = await laden();
      anAndere("zurueckgesetzt");
      return r;
    }

    return {
      laden, neuLaden, zuruecksetzen,
      get geladen() { return z.geladen; },
      get art() { return ablage.art; },
      /** Alle sichtbaren Knoten (eigene ohne Papierkorb + abgeleitete). */
      knoten: () => rechnen().alle,
      eigene: () => rechnen().eigene,
      hol: (id) => rechnen().nachId.get(id) || null,
      findeTitel: (titel) => { const c = rechnen(); const id = c.nachTitel.get(schluessel(titel)); return id ? c.nachId.get(id) : null; },
      kanten: () => rechnen().kanten,
      grad: (id) => { const n = rechnen().nachbarn.get(id); return n ? n.size : 0; },
      /** Ausgehende Verweise aus dem Text: [{ titel, id | null, fehlt }]. */
      verweise: (id) => rechnen().ausgehend.get(id) || [],
      /** Wer zeigt auf diesen Knoten? [{ knoten, art, kante }] */
      rueckverweise: (id) => { const c = rechnen(); return (c.eingehend.get(id) || []).map((k) => ({ knoten: c.nachId.get(k.von), art: k.art, kante: k })).filter((x) => x.knoten); },
      /** Manuelle Verbindungen, die von diesem Knoten ausgehen oder bei ihm enden. */
      verbindungen: (id) => { const c = rechnen(); return c.kanten.filter((k) => !k.auto && (k.von === id || k.nach === id)).map((k) => ({ kante: k, knoten: c.nachId.get(k.von === id ? k.nach : k.von) })); },
      fehlende: () => [...rechnen().fehlend.values()],
      /** Nachbarn bis zu einer Tiefe (Fokus-Modus): Menge der IDs inklusive Startknoten. */
      nachbarn(id, tiefe = 1) {
        const c = rechnen();
        const menge = new Set(c.nachId.has(id) ? [id] : []);
        let rand = [...menge];
        for (let t = 0; t < tiefe; t++) {
          const naechste = [];
          for (const x of rand) for (const n of c.nachbarn.get(x) || []) if (!menge.has(n)) { menge.add(n); naechste.push(n); }
          rand = naechste;
        }
        return menge;
      },
      aufloesen: (titel) => { const id = rechnen().nachTitel.get(schluessel(titel)); return id ? { id } : null; },
      alleTags: () => [...new Set(rechnen().eigene.flatMap((k) => k.tags || []))].sort((a, b) => a.localeCompare(b, "de")),
      anlegen, aendern, statusSetzen: (id, status) => aendern(id, { status }, { grund: "status" }),
      loeschen, wiederherstellen, endgueltigLoeschen, papierkorb, papierkorbLeeren,
      verlauf, versionWiederherstellen,
      kanteAnlegen, kanteLoeschen,
      rueckgaengig, wiederholen,
      get kannRueckgaengig() { return undo.length > 0; },
      get kannWiederholen() { return redo.length > 0; },
      luecken, lueckeMelden, lueckeEintragen, lueckeVerwerfen,
      nutzungZaehlen, nutzung, nutzungAlle: () => z.nutzung,
      audit, auditSchreiben, auditLeeren,
      gesundheit: gesund, kontextFuer, suchen, personaText, regelTexte,
      /** Test-Patienten, Notizen und Berichte als schreibgeschützte Knoten einblenden (nur Kürzel und Datum). */
      abgeleitetSetzen(neu) { quellen = { patienten: (neu && neu.patienten) || [], notizen: (neu && neu.notizen) || [], berichte: (neu && neu.berichte) || [] }; abgeleitetBauen(); melden("abgeleitet"); },
      importieren,
      exportDateien: () => exportDateien(rechnen().eigene),
      exportEineDatei: () => exportEineDatei(rechnen().eigene),
      beiAenderung(h) { hoerer.add(h); return () => hoerer.delete(h); },
      get nummer() { return nummer; },
    };
  }

  return {
    ARTEN, ARTEN_EIGEN, STATUS, KANTEN_ARTEN, KANTEN_EIGEN, GRENZEN, ID_MUSTER, KERNREGELN_ID, KERNREGELN_TITEL, TRENNER,
    neueId, schluessel, verweiseAus, hatHtml, bereinigen, tagNormal, pruefen, markdownHtml, gesundheit,
    exportDateien, exportEineDatei, importLesen, importVergleichen, frontmatterLesen, zipSchreiben, zipLesen, crc32, erstelle,
  };
});
