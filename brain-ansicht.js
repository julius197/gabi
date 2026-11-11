/* Gabi Brain – Ansicht: der Bereich „Brain“ (#/brain). Graph und gleichwertige Liste, Detail mit Editor, Suche und
   Filter, Gesundheit, Wissenslücken, Fähigkeiten, Import/Export, Papierkorb, Befehlspalette. Wird nur geladen, wenn der
   Brain-Schalter an ist. Kein Inline-Stil (CSP), jeder Text geht durch esc(). Modell: brain.js · Graph: brain-graph.js ·
   Brücke zum Gespräch: brain-gespraech.js. Formen: BRAIN-BAUPLAN.md. */
(function (wurzel, fabrik) {
  wurzel.GabiBrainAnsicht = fabrik(wurzel);
})(typeof self !== "undefined" ? self : this, function (W) {
  "use strict";

  // zusätzliche Symbole (gleicher Strich wie die übrigen: 24er-Raster, 1,8 px, runde Enden)
  const SYMBOLE = `
    <symbol id="i-liste" viewBox="0 0 24 24"><path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"/></symbol>
    <symbol id="i-filter" viewBox="0 0 24 24"><path d="M4 6h16l-6 7.5V19l-4 1.5v-7z"/></symbol>
    <symbol id="i-mehr" viewBox="0 0 24 24"><circle cx="6" cy="12" r="0.7"/><circle cx="12" cy="12" r="0.7"/><circle cx="18" cy="12" r="0.7"/></symbol>
    <symbol id="i-fokus" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></symbol>
    <symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol>
    <symbol id="i-rahmen" viewBox="0 0 24 24"><path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3"/></symbol>
    <symbol id="i-pin" viewBox="0 0 24 24"><path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/></symbol>
    <symbol id="i-anordnen" viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.2-4.4L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.2 4.4L20 15.5M20 20v-4.5h-4.5"/></symbol>
    <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></symbol>
    <symbol id="i-hoch" viewBox="0 0 24 24"><path d="M12 15V4M7 9l5-5 5 5M5 20h14"/></symbol>
    <symbol id="i-frage" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17v.2"/></symbol>
    <symbol id="i-wiederholen" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7L20 8.5"/><path d="M20 4v4.5h-4.5"/></symbol>
    <symbol id="i-graph" viewBox="0 0 24 24"><circle cx="6" cy="7" r="2.5"/><circle cx="18" cy="9" r="2.5"/><circle cx="10" cy="18" r="2.5"/><path d="M8.4 7.6l7.2 1M7 9.3l2.2 6.4M16.2 10.8l-4.6 5.6"/></symbol>`;

  const REITER = [["graph", "Graph", "graph"], ["liste", "Liste", "liste"], ["luecken", "Lücken", "frage"], ["faehigkeiten", "Fähigkeiten", "funke"]];
  const SONDER = [["zuKlaeren", "Zu klären"], ["veraltet", "Veraltet (über 90 Tage)"], ["nieVerwendet", "Nie verwendet"], ["verwendet", "Von Gabi verwendet"]];
  const SORTIERUNG = [["titel", "Titel A–Z"], ["geaendert", "Zuletzt geändert"], ["grad", "Meiste Verbindungen"], ["nutzung", "Von Gabi verwendet"]];
  const GRUPPIERUNG = [["art", "Nach Art"], ["status", "Nach Status"], ["keine", "Ohne Gruppen"]];
  const GRUND = { bearbeitet: "Bearbeitet", status: "Status geändert", wiederhergestellt: "Wiederhergestellt", import: "Import", interview: "Brain-Interview", vorschlag: "Vorschlag von Gabi", seed: "Aus der Wissensdatei", umbenannt: "Verweis umbenannt", rueckgaengig: "Rückgängig gemacht", wiederholt: "Wiederholt", luecke: "Aus einer Lücke", neu: "Angelegt" };
  const STUFEN = {
    lesen: ["Lesen", "Gabi liest nur – sie ändert nichts."],
    vorschlagen: ["Vorschlagen", "Gabi schlägt etwas vor – du entscheidest per Knopf."],
    mit_bestaetigung_ausfuehren: ["Ausführen nach Bestätigung", "Gabi führt etwas aus – aber erst, nachdem du es bestätigt hast."],
  };
  const KANTE_NAME = { verweis: "Verweis", gehoert_zu: "Gehört zu", notiz_von: "Notiz von", bericht_zu: "Bericht zu" };

  function erstelle(app) {
    const B = W.GabiBrain;
    const S = W.GabiBrainSuche;
    const SP = W.GabiBrainSpeicher;
    const G = W.GabiBrainGraph;
    const SEED = W.GabiBrainSeed || null;
    const { K, esc, symbol, toast, frage, ersetzen } = app;
    const wurzel = app.el.ansicht;
    const artName = (id) => (B.ARTEN.find((a) => a.id === id) || { name: id }).name;
    const artMehrzahl = (id) => (B.ARTEN.find((a) => a.id === id) || { mehrzahl: id }).mehrzahl;
    const statusName = (id) => (B.STATUS.find((s) => s.id === id) || { name: id }).name;
    const vorsatz = () => (z.demo ? "gabi.demo." : "gabi.");
    const schmal = window.matchMedia("(max-width: 479.98px)");
    const grob = window.matchMedia("(pointer: coarse)"); // Touch-Gerät: Fokus nie von selbst in ein Textfeld (klappte die Tastatur auf); Knoten im Graphen greift man mit dem Finger durch kurzes Halten
    const PROBE_KNOTEN = Math.min(5000, Math.max(0, Math.floor(Number(new URLSearchParams(location.search).get("brainknoten")) || 0)));
    const lokal = {
      lesen(k) { try { return JSON.parse(localStorage.getItem(vorsatz() + k) || "null"); } catch { return null; } },
      schreiben(k, v) { try { localStorage.setItem(vorsatz() + k, JSON.stringify(v)); } catch { /* voll oder gesperrt – nur eine Vorliebe */ } },
      loeschen(k) { try { localStorage.removeItem(vorsatz() + k); } catch { /* egal */ } },
    };

    const z = {
      brain: null, ablage: null, kanal: null, notfall: null, demo: null, laedt: null, fehler: "", fehlerText: "", fehlerKnopf: "",
      reiter: "graph", letzteHaupt: "graph", auswahl: "", bearbeitung: null, vorschau: false,
      suche: "", treffer: null,
      filter: { arten: [], status: [], tag: "", zuKlaeren: false, veraltet: false, nieVerwendet: false, verwendet: false },
      filterOffen: false, sortierung: "titel", gruppierung: "art",
      fokus: null, graph: null, graphSignatur: "", leuchten: [], fokusAufDetail: false,
      notizInhalt: new Map(), verlauf: null, verlaufVon: "", versionOffen: 0,
      blattGross: false, abgeleitetAm: 0, gebaut: false, bildAngefragt: false, wiederherstellbar: null,
    };

    // Symbole einmal bereitstellen
    if (!document.getElementById("i-liste")) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.setAttribute("class", "unsichtbar"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
      svg.innerHTML = SYMBOLE;
      document.body.prepend(svg);
    }

    // ==========================================================
    // 1 Ablage öffnen, schließen, andere Tabs
    // ==========================================================
    function schliessen() {
      if (z.kanal) z.kanal.schliessen();
      if (z.ablage && z.ablage.schliessen) { try { z.ablage.schliessen(); } catch { /* schon zu */ } }
      if (z.graph) { z.graph.zerstoeren(); z.graph = null; }
      Object.assign(z, { brain: null, ablage: null, kanal: null, notfall: null, laedt: null, fehler: "", fehlerText: "", fehlerKnopf: "", auswahl: "", bearbeitung: null, treffer: null, suche: "", fokus: null, graphSignatur: "", verlauf: null, verlaufVon: "", abgeleitetAm: 0, wiederherstellbar: null });
      z.notizInhalt.clear();
    }

    const imPapierkorb = (id) => Boolean(z.brain && id) && z.brain.papierkorb().some((p) => p.knoten.id === id);
    let externUhr = null;
    function vonAnderemTab(d) {
      if (d && d.art === "geleert") { geleertAnderswo(); return; }
      clearTimeout(externUhr);
      externUhr = setTimeout(async () => {
        if (!z.brain) return;
        try { await z.brain.neuLaden(); } catch { /* beim nächsten Öffnen */ }
        const b = z.bearbeitung;
        if (b && b.id && z.brain) {
          const k = z.brain.eigene().find((x) => x.id === b.id);
          // anderswo in den Papierkorb gelegt: eigener Hinweis mit Ausweg (wiederherstellen und speichern) – nicht „… geändert“
          const imKorb = !k && imPapierkorb(b.id);
          if (imKorb !== Boolean(b.imKorb) || !k || k.rev !== b.rev) { b.imKorb = imKorb ? "fenster" : false; b.extern = true; formHinweise(); }
        }
      }, 80);
    }

    /**
     * In einem anderen Fenster wurde beim Abmelden das Brain-Wissen dieses Geräts gelöscht. Dieses Fenster arbeitete sonst
     * ohne Erklärung auf der geleerten Datenbank weiter („0 Einträge“), und ein hier angelegter Eintrag stünde danach allein
     * da. Deshalb: Bearbeitung beenden (samt Notfall-Kopie), offene Brain-Dialoge und Rückfragen schließen, das Brain
     * schließen (mit ihm die Rückgängig-Liste) und sagen, was passiert ist. Geladen wird erst wieder auf Tipp – dann beginnt
     * das Brain mit dem Ausgangsstand; bis dahin antwortet Gabi ohne Brain.
     */
    function geleertAnderswo() {
      clearTimeout(externUhr);
      if (!z.brain && !z.laedt) return; // hier ist kein Brain offen
      const verworfen = ungespeichert();
      bearbeitungEnde();
      SP.notfall({ demo: Boolean(z.demo) }).loeschen(); // auch wenn das Brain hier noch lädt
      for (const d of Object.values(dialoge)) if (d.open) d.close();
      const rueckfrage = wurzel.hidden ? null : document.querySelector("#dialog-frage[open]");
      if (rueckfrage) rueckfrage.close(); // eine offene Rückfrage aus dem Brain gilt als „Abbrechen“
      schliessen();
      z.gebaut = false;
      wurzel.innerHTML = ""; // Reiter, Menü und Liste des gelöschten Brains nicht stehen lassen
      const zu = Promise.reject(new Error("Brain anderswo gelöscht"));
      zu.catch(() => {}); // bereit() liefert dieses „nicht geladen“, bis jemand auf „Neu laden“ tippt
      Object.assign(z, {
        laedt: zu, fehler: "Das Brain wurde in einem anderen Fenster gelöscht.",
        fehlerText: "Beim Abmelden dort wurde das Brain-Wissen von diesem Gerät entfernt. Lädst du es neu, beginnt es wieder beim Ausgangsstand – ohne deine eigenen Einträge.",
        fehlerKnopf: "Neu laden",
      });
      if (!wurzel.hidden) app.adresseSetzen(reiterHash(), { ersetzen: true });
      toast(`Das Brain wurde in einem anderen Fenster gelöscht.${verworfen ? " Deine ungespeicherte Änderung ist damit verworfen." : ""}`, { art: "warn", dauer: 7000 });
      zeichnen();
    }

    /** Brain für den laufenden Betrieb (Demo oder echt) bereitstellen – einmal je Betriebsart. */
    function bereit() {
      const demo = Boolean(app.demo());
      if (z.laedt && z.demo === demo) return z.laedt;
      schliessen();
      z.demo = demo;
      const v = lokal.lesen("brain.ansicht") || {};
      if (v.reiter === "liste" || v.reiter === "graph") { z.reiter = v.reiter; z.letzteHaupt = v.reiter; }
      if (SORTIERUNG.some(([s]) => s === v.sortierung)) z.sortierung = v.sortierung;
      if (GRUPPIERUNG.some(([s]) => s === v.gruppierung)) z.gruppierung = v.gruppierung;
      const lauf = (async () => {
        const ablage = await SP.oeffnen({ demo });
        const kanal = SP.kanal(demo, vonAnderemTab);
        const brain = B.erstelle({ ablage, seed: SEED, demo, kanal });
        await brain.laden();
        if (z.laedt !== lauf) { kanal.schliessen(); return brain; } // inzwischen abgemeldet oder gewechselt
        Object.assign(z, { ablage, kanal, brain, notfall: SP.notfall({ demo }) });
        brain.beiAenderung(() => zeichnenBald());
        const n = z.notfall.lesen();
        const d = n && (n.daten || n);
        if (d && d.felder && typeof d.felder === "object") z.wiederherstellbar = d;
        zeichnenBald();
        return brain;
      })();
      z.laedt = lauf;
      lauf.catch((e) => {
        if (z.laedt !== lauf) return;
        // Kennt die Ablage den Grund (Stand von einer neueren Gabi, Verbindung zu …), steht ihr Satz da – sonst der allgemeine
        const vonAblage = Boolean(e && e.brain && typeof e.message === "string" && e.message);
        z.fehler = vonAblage ? e.message : "Das Brain ließ sich nicht laden.";
        // gestoert: Das Brain liegt in IndexedDB, sie antwortet gerade nicht – bewusst kein Ersatz-Brain (siehe brain-speicher.js)
        z.fehlerText = e && e.gestoert ? "Dein Wissen liegt weiter auf diesem Gerät, es ist nichts verloren. Bis das Brain wieder geladen ist, antwortet Gabi aus dem eingebauten Wissen."
          : vonAblage ? "Deine Notizen und Gespräche sind davon nicht betroffen." : "";
        // wer gerade nicht im Brain ist, sähe sonst nichts davon – Gabi antwortet ohne Brain aus dem eingebauten Wissen
        if (wurzel.hidden) toast("Das Brain ließ sich nicht laden – Gabi antwortet solange aus dem eingebauten Wissen.", { art: "warn", dauer: 7000 });
        zeichnenBald();
      });
      return lauf;
    }

    /** Test-Patienten, Notizen und Berichte als geschützte Knoten einblenden (nur Kürzel und Datum). */
    async function abgeleitetAuffrischen(erzwingen = false) {
      if (!z.brain || (!erzwingen && Date.now() - z.abgeleitetAm < 20000)) return;
      z.abgeleitetAm = Date.now();
      const brain = z.brain;
      try {
        const [patienten, notizen, berichte] = await Promise.all([app.patienten(), app.notizen(), app.berichte()]);
        if (z.brain === brain) brain.abgeleitetSetzen({ patienten, notizen, berichte });
      } catch { /* ohne Notizordner bleibt das Brain trotzdem benutzbar */ }
    }

    // ==========================================================
    // 2 Zeichnen
    // ==========================================================
    function zeichnenBald() {
      if (z.bildAngefragt) return;
      z.bildAngefragt = true;
      requestAnimationFrame(() => { z.bildAngefragt = false; zeichnen(); });
    }

    const $ = (sel) => wurzel.querySelector(sel);
    /** Zeichnen und den Fokus auf demselben Bedienelement lassen (Neuaufbau nähme ihn sonst weg). */
    function mitFokus(knoten, html) {
      const a = document.activeElement;
      const drin = a && knoten.contains(a) && a.dataset && a.dataset.brain ? { brain: a.dataset.brain, wert: a.dataset.wert || "", id: a.dataset.id || "" } : null;
      if (!ersetzen(knoten, html)) return false;
      if (drin) {
        const neu = [...knoten.querySelectorAll(`[data-brain="${drin.brain}"]`)].find((x) => (x.dataset.wert || "") === drin.wert && (x.dataset.id || "") === drin.id);
        if (neu) neu.focus({ preventScroll: true });
      }
      return true;
    }

    // ---------- Fokus führen und ansagen ----------
    // Wo eine Aktion das bediente Element entfernt (Zeile gelöscht, Detail neu gebaut, Menü zu), fiele der Fokus sonst auf
    // body: Tastatur und Screenreader stünden wieder am Seitenanfang. Gesetzt wird er über app.fokusSetzen (nach Tippen
    // ohne Ring, per Tastatur mit).
    /** Für Screenreader ansagen – über eine Live-Region, die schon dasteht (ein frisch eingesetztes role=status wird nicht
        zuverlässig vorgelesen): im Graphen die des Graphen, sonst die eigene am Ende der Ansicht. Kein Toast, kein Bild. */
    function melden(text) {
      const ziel = $(z.reiter === "graph" ? "#brain-ansage" : "#brain-meldung");
      if (ziel) ziel.textContent = text;
    }
    const listenZeilen = () => [...wurzel.querySelectorAll("#brain-liste a.brain-zeile")];
    /** An welcher Stelle der Liste ein Eintrag steht (−1 = nicht in der Liste) – gemerkt, bevor er verschwindet. */
    const zeilenPlatz = (id) => listenZeilen().findIndex((a) => a.getAttribute("href") === `#/brain/${id}`);
    /** Das Detail ist zu oder sein Eintrag ist weg: in der Liste auf seine Zeile (sie wird beim Zeichnen neu gebaut, also
        erst jetzt suchen) – gibt es sie nicht mehr, auf die Zeile an ihrer Stelle; im Graphen in die Zeichenfläche. */
    function fokusNachDetail(id, platz = -1) {
      let ziel = null;
      if (z.reiter === "liste") {
        const zeilen = listenZeilen();
        ziel = zeilen.find((a) => a.getAttribute("href") === `#/brain/${id}`) || (platz >= 0 ? zeilen[Math.min(platz, zeilen.length - 1)] : null);
      } else if (z.reiter === "graph") ziel = wurzel.querySelector(".brain-graph-flaeche");
      app.fokusSetzen(ziel || wurzel.querySelector('.brain-reiter-knopf[aria-selected="true"]'));
    }
    /** Einmaliger Wunsch einer Aktion: (detail) → Element, das nach dem nächsten Zeichnen des Details den Fokus bekommt. */
    let detailFokus = null;
    function zeichnenMitFokus(wunsch) {
      detailFokus = wunsch;
      zeichnen();
      detailFokus = null;
    }

    function geruest() {
      if (z.gebaut) return;
      z.gebaut = true;
      wurzel.innerHTML = `
        <div class="brain-rahmen">
          <header class="brain-kopf">
            <div class="brain-titel">
              <div class="brain-titel-zeile"><h1>Brain<span class="marke-punkt">.</span></h1><span class="badge" title="Nur erfundene Testdaten">Testdaten</span></div>
              <p>Das Gedächtnis deiner Praxis – daraus antwortet Gabi.</p>
            </div>
            <div class="brain-gesundheit" id="brain-gesundheit" role="group" aria-label="Brain-Gesundheit"></div>
          </header>
          <div class="brain-hinweis" id="brain-hinweis" hidden></div>
          <div class="brain-leiste">
            <div class="brain-reiter" id="brain-reiter" role="tablist" aria-label="Ansicht"></div>
            <div class="suche brain-suche">
              ${symbol("suche")}
              <input type="search" id="brain-suche" placeholder="Im Brain suchen …" aria-label="Im Brain suchen" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" maxlength="120">
              <button class="rund-knopf" type="button" data-brain="suche-leer" id="brain-suche-leer" aria-label="Suche leeren" hidden>${symbol("x", "klein")}</button>
            </div>
            <div class="brain-werkzeuge">
              <button class="knopf sekundaer klein" type="button" data-brain="filter-auf" id="brain-filter-knopf" aria-expanded="false" aria-controls="brain-filter-mehr">${symbol("filter")}<span>Filter</span></button>
              <button class="knopf primaer klein" type="button" data-brain="neu">${symbol("plus")}<span>Neu</span></button>
              <div class="brain-mehr">
                <button class="rund-knopf flaeche" type="button" data-brain="mehr" id="brain-mehr" aria-haspopup="menu" aria-expanded="false" aria-controls="brain-menue" aria-label="Mehr">${symbol("mehr")}</button>
                <div class="brain-menue" id="brain-menue" role="menu" aria-label="Mehr" hidden></div>
              </div>
            </div>
          </div>
          <div class="brain-filter" id="brain-filter"></div>
          <div class="brain-buehne" id="brain-buehne">
            <div class="brain-graph" id="brain-graph" hidden>
              <div class="brain-graph-flaeche-rahmen" id="brain-graph-rahmen"></div>
              <div class="brain-graph-knoepfe" role="group" aria-label="Ansicht des Graphen">
                <button class="rund-knopf" type="button" data-brain="zoom" data-wert="rein" aria-label="Vergrößern" title="Vergrößern (+)">${symbol("plus")}</button>
                <button class="rund-knopf" type="button" data-brain="zoom" data-wert="raus" aria-label="Verkleinern" title="Verkleinern (−)">${symbol("minus")}</button>
                <button class="rund-knopf" type="button" data-brain="einpassen" aria-label="Alles zeigen" title="Alles zeigen (0)">${symbol("rahmen")}</button>
                <button class="rund-knopf" type="button" data-brain="anordnen" aria-label="Neu anordnen – löst auch festgesetzte Knoten" title="Neu anordnen (löst auch festgesetzte Knoten)">${symbol("anordnen")}</button>
              </div>
              <div class="brain-fokus" id="brain-fokus" hidden></div>
              <details class="brain-legende" id="brain-legende"><summary>Legende</summary>
                <ul>
                  <li><span class="brain-zeichen punkt"></span>Farbe = Art, Größe = Verbindungen</li>
                  <li><span class="brain-zeichen klaeren">?</span>Zu klären</li>
                  <li><span class="brain-zeichen entwurf"></span>Entwurf (gestrichelt)</li>
                  <li><span class="brain-zeichen schloss">${symbol("schloss", "klein")}</span>Geschützt (nur lesen)</li>
                  <li><span class="brain-zeichen fest"></span>${grob.matches ? "Von dir festgesetzt (kurz halten, dann ziehen)" : "Von dir festgesetzt (gezogen)"}</li>
                </ul>
              </details>
              <p class="unsichtbar" id="brain-ansage" aria-live="polite"></p>
            </div>
            <div class="brain-liste" id="brain-liste" hidden></div>
            <div class="brain-luecken" id="brain-luecken" hidden></div>
            <div class="brain-faehigkeiten" id="brain-faehigkeiten" hidden></div>
            <div class="brain-zustand" id="brain-zustand" hidden></div>
            <aside class="brain-detail" id="brain-detail" hidden aria-labelledby="brain-detail-titel"></aside>
          </div>
        </div>
        <input type="file" id="brain-datei" class="unsichtbar" tabindex="-1" aria-hidden="true" multiple accept=".md,.markdown,.txt,.zip,text/markdown,text/plain,application/zip">
        <p class="unsichtbar" id="brain-meldung" role="status"></p>
        <datalist id="brain-quellen"><option value="Philipp"></option><option value="Julius"></option><option value="physio-works.de"></option></datalist>
        <datalist id="brain-titel-liste"></datalist>`;
      const suche = $("#brain-suche");
      let uhr = null;
      suche.addEventListener("input", () => {
        clearTimeout(uhr);
        uhr = setTimeout(() => { z.suche = suche.value; suchen(); zeichnen(); }, 120);
      });
      suche.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && suche.value) { e.preventDefault(); e.stopPropagation(); suche.value = ""; z.suche = ""; suchen(); zeichnen(); }
        if (e.key === "Enter" && z.treffer && z.treffer.length) { e.preventDefault(); oeffnen(z.treffer[0]); }
      });
      $("#brain-datei").addEventListener("change", (e) => { const dateien = [...e.target.files]; e.target.value = ""; if (dateien.length) importStarten(dateien); });
    }

    function suchen() {
      z.treffer = z.brain && z.suche.trim() ? z.brain.suchen(z.suche, { limit: 80 }).map((t) => t.id) : null;
    }
    const filterAktiv = () => Boolean(z.filter.arten.length || z.filter.status.length || z.filter.tag || SONDER.some(([k]) => z.filter[k]));
    function gefiltert() {
      const alle = z.brain.knoten();
      return filterAktiv() ? S.filtern(alle, z.filter, { nutzung: z.brain.nutzungAlle(), jetzt: Date.now() }) : alle;
    }

    function zeichnen() {
      if (wurzel.hidden) return;
      geruest();
      const zustand = $("#brain-zustand");
      wurzel.classList.toggle("fehler", !z.brain && Boolean(z.fehler));
      if (!z.brain) {
        // Laden oder Fehler: alles steht schon an seinem Platz und in seiner Höhe – die Reiter echt, Kopf, Arten-Zeile und
        // Bühne als Platzhalter mit demselben Aufbau. Nichts springt, wenn der Inhalt kommt. Der Fehler wird angesagt.
        for (const id of ["brain-graph", "brain-liste", "brain-luecken", "brain-faehigkeiten", "brain-detail"]) $(`#${id}`).hidden = true;
        zustand.hidden = false;
        ersetzen(zustand, z.fehler
          ? `<div class="leer" role="alert"><div class="kachel warn">${symbol("warn")}</div><h2>${esc(z.fehler)}</h2><p>${esc(z.fehlerText || "Bitte versuch es noch einmal. Deine Notizen und Gespräche sind davon nicht betroffen.")}</p><button class="knopf primaer" type="button" data-brain="neu-laden">${symbol("zuruecksetzen")}${esc(z.fehlerKnopf || "Nochmal versuchen")}</button></div>`
          : '<div class="skelett brain-skelett" aria-label="Das Brain lädt"></div>');
        kopfZeichnen();
        leisteGrund();
        filterPlatzhalter();
        return;
      }
      zustand.hidden = true;
      if (z.suche.trim()) suchen();
      kopfZeichnen();
      leisteZeichnen();
      filterZeichnen();
      standZeichnen(); // Trefferzahl und leerer Zustand im Graphen (Einblendung in der Fläche), Ansage für Screenreader
      for (const [id] of REITER) $(`#brain-${id}`).hidden = z.reiter !== id;
      detailZeichnen(); // vor dem Graphen: Er rechnet mit dem Bereich, den Panel oder Blatt frei lassen
      if (z.reiter === "graph") graphZeichnen();
      else if (z.graph) z.graph.aktiv(false);
      if (z.reiter === "liste") listeZeichnen();
      if (z.reiter === "luecken") lueckenZeichnen();
      if (z.reiter === "faehigkeiten") faehigkeitenZeichnen();
      if (z.wiederherstellbar) notfallAnbieten();
    }

    // ---------- Kopf: Gesundheit ----------
    /** Platzhalter für den Kopf: derselbe Aufbau wie die echte Gesundheit (Ring, fünf Kennzahlen, „Brain füllen“) – also
        dieselbe Höhe und derselbe Umbruch bei jeder Breite. Die Texte sind unsichtbar und halten nur den Platz. */
    const KOPF_PLATZHALTER = `
        <div class="brain-ring-block" aria-hidden="true"><span class="skelett brain-skelett-ring"></span><div class="brain-ring-text skelett"><strong class="zahl">00 %</strong><span>bestätigt</span></div></div>
        <div class="brain-kennzahlen" aria-hidden="true">${["Einträge", "zu klären", "veraltet", "nie verwendet", "Lücken"].map((t) => `<span class="brain-kennzahl skelett"><strong class="zahl">00</strong><span>${t}</span></span>`).join("")}</div>
        <span class="knopf klein brain-fuellen skelett" aria-hidden="true">${symbol("funke")}Brain füllen</span>`;
    function kopfZeichnen() {
      const ziel = $("#brain-gesundheit");
      if (!z.brain) { ersetzen(ziel, KOPF_PLATZHALTER); $("#brain-hinweis").hidden = true; return; }
      const g = z.brain.gesundheit();
      const umfang = 2 * Math.PI * 18;
      const voll = (umfang * g.prozent) / 100;
      const zahl = (wert, n, eins, viele, extra = "") => `<button class="brain-kennzahl${n ? "" : " leer"}${extra}" type="button" data-brain="kennzahl" data-wert="${wert}"${n ? "" : " disabled"}><strong class="zahl">${n}</strong><span>${n === 1 ? eins : viele}</span></button>`;
      mitFokus(ziel, `
        <div class="brain-ring-block">
          <svg class="brain-ring" viewBox="0 0 44 44" role="img" aria-label="${g.prozent} Prozent bestätigt">
            <circle class="brain-ring-spur" cx="22" cy="22" r="18"/>
            <circle class="brain-ring-wert" cx="22" cy="22" r="18" stroke-dasharray="${voll.toFixed(1)} ${(umfang - voll + 0.1).toFixed(1)}" transform="rotate(-90 22 22)"/>
          </svg>
          <div class="brain-ring-text"><strong class="zahl">${g.prozent} %</strong><span>bestätigt</span></div>
        </div>
        <div class="brain-kennzahlen">
          ${zahl("alle", g.knoten, "Eintrag", "Einträge")}
          ${zahl("zuKlaeren", g.zuKlaeren, "zu klären", "zu klären", g.zuKlaeren ? " warn" : "")}
          ${zahl("veraltet", g.veraltet, "veraltet", "veraltet")}
          ${zahl("nieVerwendet", g.nieVerwendet, "nie verwendet", "nie verwendet")}
          ${zahl("luecken", g.luecken, "Lücke", "Lücken", g.luecken ? " warn" : "")}
        </div>
        ${g.zuKlaeren ? `<button class="knopf sekundaer klein brain-fuellen" type="button" data-brain="interview">${symbol("funke")}Brain füllen</button>` : ""}`);
      // Hinweis, wenn die Ablage gerade nicht (dauerhaft) speichert – die Kennzeichen setzt brain-speicher.js
      const hinweis = $("#brain-hinweis");
      const a = z.ablage || {};
      const text = a.schemaFremd ? "Dieses Brain wurde mit einer neueren Gabi angelegt – hier lässt es sich nur ansehen. Bitte lade die Seite neu."
        : a.nurLesen ? "Das Brain lässt sich gerade nur ansehen – dieser Browser speichert nichts mehr (Speicher voll?). Exportier dein Brain und schaff Platz auf dem Gerät."
          : a.art === "speicher" ? "Dieser Browser speichert das Brain gerade nicht dauerhaft (privates Fenster?). Exportiere wichtige Änderungen, bevor du das Fenster schließt." : "";
      hinweis.hidden = !text;
      if (text) ersetzen(hinweis, `<div class="hinweis-box warn"><div class="hinweis-box-kopf">${symbol("warn")}<span>${esc(text)}</span></div></div>`);
    }

    // ---------- Leiste: Reiter, Suche, Menü ----------
    /** Der Teil der Leiste, der ohne Brain auskommt – er steht schon beim Laden da (der Lücken-Zähler kommt mit den Daten).
        Solange das Brain lädt, sieht alles aus wie immer und bleibt bedienbar: ein Tipp wirkt, sobald es da ist (siehe
        klick). Sichtbar gesperrt wird erst im Fehlerzustand – beim Laden gäbe das nur ein kurzes Aufblitzen. */
    function leisteGrund() {
      const offen = z.brain ? z.brain.luecken().length : 0;
      const zu = !z.brain && Boolean(z.fehler);
      mitFokus($("#brain-reiter"), REITER.map(([id, name, sym]) => `<button class="brain-reiter-knopf" type="button" role="tab" data-brain="reiter" data-wert="${id}" aria-label="${name}${id === "luecken" && offen ? ` (${offen})` : ""}" aria-selected="${z.reiter === id}" aria-controls="brain-${id}"${z.reiter === id ? "" : ' tabindex="-1"'}${zu ? " disabled" : ""}>${symbol(sym)}<span>${name}</span>${id === "luecken" && offen ? `<span class="badge warn zahl">${offen}</span>` : ""}</button>`).join(""));
      $("#brain-suche-leer").hidden = !z.suche;
      $("#brain-suche").placeholder = schmal.matches ? "Suchen …" : "Im Brain suchen …";
      const tief = z.reiter === "luecken" || z.reiter === "faehigkeiten"; // dort gibt es nichts zu suchen oder zu filtern
      wurzel.querySelector(".brain-suche").classList.toggle("aus", tief || zu);
      $("#brain-filter-knopf").disabled = tief || zu;
      $("#brain-suche").disabled = tief || zu;
      for (const k of wurzel.querySelectorAll('.brain-werkzeuge [data-brain="neu"], #brain-mehr')) k.disabled = zu;
    }
    function leisteZeichnen() {
      leisteGrund();
      const papierkorb = z.brain.papierkorb().length;
      ersetzen($("#brain-menue"), [
        ["interview", "funke", "Brain füllen (Interview)", !z.brain.gesundheit().zuKlaeren],
        ["rueckgaengig", "zuruecksetzen", "Rückgängig", !z.brain.kannRueckgaengig],
        ["wiederholen", "wiederholen", "Wiederholen", !z.brain.kannWiederholen],
        ["import", "hoch", "Importieren …", false],
        ["export-zip", "pdf", "Exportieren (ZIP, eine Datei je Eintrag)", !z.brain.eigene().length],
        ["export-datei", "dokument", "Exportieren (eine Markdown-Datei)", !z.brain.eigene().length],
        ["papierkorb", "muell", `Papierkorb${papierkorb ? ` (${papierkorb})` : ""}`, false],
        ["physik", "graph", lokal.lesen("brain.physik") === false ? "Physik beim Ziehen: aus" : "Physik beim Ziehen: an", false],
        ["tasten", "info", "Tastenkürzel", false],
      ].map(([a, sym, name, aus]) => `<button class="brain-menue-punkt" type="button" role="menuitem" data-brain="${a}"${aus ? " disabled" : ""}>${symbol(sym)}<span>${esc(name)}</span></button>`).join(""));
    }

    // ---------- Filterzeile: Arten (= Legende) und weitere Filter ----------
    /** Platzhalter für die Arten-Zeile, solange das Brain lädt: Chips mit den echten Namen (unsichtbar) – gleiche Höhe und
        gleicher Umbruch wie danach. Berichte fehlen: die Art gibt es erst, wenn ein Gespräch einen Bericht hat. */
    function filterPlatzhalter() {
      const ziel = $("#brain-filter");
      const aus = z.reiter === "luecken" || z.reiter === "faehigkeiten";
      ziel.hidden = aus;
      if (!aus) ersetzen(ziel, `<div class="brain-filter-arten" aria-hidden="true">${B.ARTEN.filter((a) => a.id !== "bericht").map((a) => `<span class="chip brain-art-chip skelett"><span class="brain-punkt"></span>${esc(a.mehrzahl)}<span class="stumm zahl">00</span></span>`).join("")}</div>`);
    }
    function filterZeichnen() {
      const ziel = $("#brain-filter");
      const aus = z.reiter === "luecken" || z.reiter === "faehigkeiten";
      ziel.hidden = aus;
      if (aus) return;
      const alle = z.brain.knoten();
      const jeArt = new Map();
      for (const k of alle) jeArt.set(k.art, (jeArt.get(k.art) || 0) + 1);
      const arten = B.ARTEN.filter((a) => jeArt.get(a.id)).map((a) => `<button class="chip brain-art-chip" type="button" data-brain="filter-art" data-wert="${a.id}" aria-pressed="${z.filter.arten.includes(a.id)}"><span class="brain-punkt" data-art="${a.id}"></span>${esc(a.mehrzahl)}<span class="stumm zahl">${jeArt.get(a.id)}</span></button>`).join("");
      const tags = z.brain.alleTags();
      const mehr = z.filterOffen ? `
        <div class="brain-filter-mehr" id="brain-filter-mehr">
          <div class="chip-gruppe" role="group" aria-label="Status">${B.STATUS.map((s) => `<button class="chip" type="button" data-brain="filter-status" data-wert="${s.id}" aria-pressed="${z.filter.status.includes(s.id)}">${esc(s.name)}</button>`).join("")}</div>
          <div class="chip-gruppe" role="group" aria-label="Besondere Filter">${SONDER.map(([k, name]) => `<button class="chip" type="button" data-brain="filter-sonder" data-wert="${k}" aria-pressed="${Boolean(z.filter[k])}">${esc(name)}</button>`).join("")}</div>
          ${tags.length ? `<label class="brain-auswahl"><span class="unsichtbar">Tag</span><select id="brain-filter-tag" data-brain-wahl="tag"><option value="">Alle Tags</option>${tags.map((t) => `<option value="${esc(t)}"${z.filter.tag === t ? " selected" : ""}>#${esc(t)}</option>`).join("")}</select>${symbol("runter")}</label>` : ""}
        </div>` : "";
      const aktiv = filterAktiv();
      mitFokus(ziel, `<div class="brain-filter-arten" role="group" aria-label="Arten (Legende und Filter)">${arten}${aktiv ? `<button class="knopf geist klein" type="button" data-brain="filter-weg">${symbol("x", "klein")}Filter zurücksetzen</button>` : ""}</div>${mehr}`);
      const knopf = $("#brain-filter-knopf");
      knopf.setAttribute("aria-expanded", String(z.filterOffen));
      knopf.classList.toggle("aktiv", aktiv);
    }

    // ---------- Stand von Suche und Filter: Trefferzahl und leerer Zustand – in der Liste und im Graphen dieselben Texte ----------
    /** „5 Treffer für …“ bzw. „12 Einträge (gefiltert)“. */
    const zaehlText = (n) => (z.treffer ? `${n === 1 ? "1 Treffer" : `${n} Treffer`} für „${z.suche.trim()}“` : `${n === 1 ? "1 Eintrag" : `${n} Einträge`}${filterAktiv() ? " (gefiltert)" : ""}`);
    const leerSatz = () => (z.treffer ? "Dazu steht nichts im Brain." : "Kein Eintrag passt zu diesen Filtern.");
    /** Leerer Zustand als Block; "" = es gibt etwas zu zeigen. */
    function leerHtml(anzahl) {
      if (!z.brain.knoten().length) return `<div class="leer"><div class="kachel">${symbol("graph")}</div><h2>Dein Brain ist noch leer</h2><p>Leg den ersten Eintrag an oder importiere Markdown-Dateien.</p><div class="knopf-reihe"><button class="knopf primaer" type="button" data-brain="neu">${symbol("plus")}Ersten Eintrag anlegen</button><button class="knopf sekundaer" type="button" data-brain="import">${symbol("hoch")}Importieren</button></div></div>`;
      if (anzahl) return "";
      return `<div class="leer"><div class="kachel">${symbol("suche")}</div><h2>Nichts gefunden</h2><p>${leerSatz()}</p>${filterAktiv() ? `<button class="knopf sekundaer" type="button" data-brain="filter-weg">Filter zurücksetzen</button>` : ""}</div>`;
    }
    /** Wie viele Einträge Suche und Filter übrig lassen – die Liste zeigt genau diese, der Graph hebt sie hervor. */
    function passendeAnzahl() {
      const liste = gefiltert();
      if (!z.treffer) return liste.length;
      const drin = new Set(z.treffer);
      return liste.filter((k) => drin.has(k.id)).length;
    }
    let anfrageAlt = null; // Suchbegriff und Filter beim letzten Zeichnen (null: Graph und Liste waren nicht zu sehen)
    /** Im Graphen stehen Trefferzahl und leerer Zustand als Einblendung IN der Fläche (wie die Fokus-Leiste): die
        Zeichenfläche behält ihre Größe, nichts ruckt beim Suchen. Angesagt wird nur, wenn sich Suche oder Filter ändern. */
    function standZeichnen() {
      const imGraph = z.reiter === "graph" && !PROBE_KNOTEN;
      if (!imGraph && z.reiter !== "liste") { anfrageAlt = null; return; }
      const n = passendeAnzahl();
      const leer = leerHtml(n);
      if (imGraph) {
        let ziel = $("#brain-graph-stand");
        if (!ziel) { ziel = document.createElement("div"); ziel.id = "brain-graph-stand"; $("#brain-graph").append(ziel); }
        const zeigen = Boolean(leer || z.treffer || filterAktiv());
        ziel.className = `brain-graph-stand${leer ? " nichts" : ""}`;
        ziel.hidden = !zeigen;
        if (zeigen) mitFokus(ziel, leer || `<span>${esc(zaehlText(n))}</span>`);
        $("#brain-graph").classList.toggle("ohne-treffer", Boolean(leer)); // Legende und Minimap treten hinter die Karte zurück
      }
      const anfrage = `${z.suche.trim()}\u0001${JSON.stringify(z.filter)}`;
      if (anfrageAlt !== null && anfrage !== anfrageAlt) melden(n ? zaehlText(n) : `Nichts gefunden. ${leerSatz()}`);
      anfrageAlt = anfrage;
    }

    // ==========================================================
    // 3 Graph
    // ==========================================================
    function farben() {
      const stil = getComputedStyle(wurzel);
      const f = (name) => stil.getPropertyValue(name).trim();
      const arten = {};
      for (const a of B.ARTEN) arten[a.id] = f(`--brain-${a.id}`);
      return { hintergrund: f("--brain-g-hintergrund"), platte: f("--brain-g-platte"), text: f("--brain-g-text"), textLeise: f("--brain-g-text-leise"), kante: f("--brain-g-kante"), kanteStark: f("--brain-g-kante-stark"), akzent: f("--brain-g-akzent"), warn: f("--brain-g-warn"), arten };
    }
    const ansage = (text) => { const a = $("#brain-ansage"); if (a) a.textContent = text; };
    const ABSTAND_KOPF = 8;  // so weit unter dem Kopf steht der Graph, wenn am Handy das Blatt aufgeht
    const FREI_MIN = 120;    // weniger Graph über dem Blatt lohnt das Rücken nicht (brain-graph.js rechnet dann ohne die Ränder)
    let blatt = null;        // Handy: { vorher, ziel } – Rollstand der Seite vor und nach dem Rücken für das Blatt
    let rollZiel = null;     // dorthin ist die Seite gerade unterwegs
    let rollLauf = 0;
    /**
     * Lage des Details im Fenster in Ruhe – ohne die Einblend-Bewegung, die es beim Aufgehen kurz versetzt. Deshalb aus
     * dem Layout gelesen (offsetLeft/offsetTop kennen keine Verschiebung), nicht aus dem gemalten Rechteck.
     */
    function detailLage(d) {
      const p = d.offsetParent; // Laptop: die Bühne · Handy: keiner (das Blatt hängt fest am Fensterrand)
      const r = p ? p.getBoundingClientRect() : { left: 0, top: 0 };
      return { links: r.left + (p ? p.clientLeft : 0) + d.offsetLeft, oben: r.top + (p ? p.clientTop : 0) + d.offsetTop };
    }
    const kopfUnten = () => { const k = document.getElementById("kopf"); return k && !k.hidden ? Math.max(0, k.getBoundingClientRect().bottom) : 0; };
    /**
     * Was das Detail vom Graphen verdeckt: am Laptop das Panel rechts, am Handy das Blatt unten (und der Kopf oben, wenn
     * die Seite gerollt ist). Gerechnet wird mit dem Stand, an dem die Seite ankommt – nicht mit dem Bild mitten im Rollen.
     */
    function verdeckt() {
      const d = $("#brain-detail");
      if (!d || d.hidden) return {};
      const g = $("#brain-graph").getBoundingClientRect();
      const lage = detailLage(d);
      if (app.laptop.matches) return { offen: true, rechts: Math.max(0, g.right - lage.links) };
      const rollt = rollZiel === null ? 0 : rollZiel - window.scrollY;
      // einpassen: false – das Blatt liegt nur über der Fläche: „Alles zeigen“ nimmt sie ganz, der gewählte Knoten steht im freien Streifen
      return { offen: true, oben: Math.max(0, kopfUnten() - (g.top - rollt)), unten: Math.max(0, g.bottom - rollt - lage.oben), einpassen: false };
    }
    /** Was über der Graphfläche schwebt (Minimap, Knöpfe, Legende, Fokus-Leiste) – „Alles zeigen“ legt keinen Knoten darunter. */
    function hindernisse() {
      const f = $("#brain-graph-rahmen").getBoundingClientRect();
      return [...wurzel.querySelectorAll(".brain-graph-karte, .brain-graph-knoepfe, .brain-legende, .brain-fokus")].filter((e) => !e.hidden)
        .map((e) => { const r = e.getBoundingClientRect(); return { x: r.left - f.left, y: r.top - f.top, breite: r.width, hoehe: r.height }; });
    }
    /** Seite rollen: weich und im Takt mit Kamera und Blatt (260 ms) – sofort bei „Bewegung reduzieren“ oder wenn die Ansicht eben erst erscheint. */
    function rollen(ziel, sofort) {
      const lauf = ++rollLauf;
      rollZiel = ziel;
      // im nächsten Bild: app.js rollt beim Wechsel in den Bereich erst noch an den Anfang
      requestAnimationFrame((t0) => {
        if (lauf !== rollLauf) return;
        const von = window.scrollY;
        if (sofort || Math.abs(ziel - von) < 1) { window.scrollTo(0, ziel); rollZiel = null; return; }
        const schritt = (t) => {
          if (lauf !== rollLauf) return;
          const p = Math.min(1, (t - t0) / 260);
          window.scrollTo(0, von + (ziel - von) * (1 - Math.pow(1 - p, 4)));
          if (p < 1) requestAnimationFrame(schritt); else rollZiel = null;
        };
        requestAnimationFrame(schritt);
      });
    }
    /**
     * Handy: Geht das Blatt über dem Graphen auf, läge er ganz darunter. Die Seite rückt ihn deshalb einmal direkt unter
     * den Kopf (danach bestimmt wieder die Hand); geht das Blatt zu, steht sie wieder, wo sie war. warDa: Der Graph stand
     * eben schon im Bild (sonst erscheint er gleich an der richtigen Stelle – nichts rollt sichtbar).
     */
    function blattPlatz(warDa) {
      const d = $("#brain-detail");
      if (!warDa) blatt = null; // inzwischen woanders gewesen: Der gemerkte Stand gilt nicht mehr
      if (d.hidden || app.laptop.matches) {
        if (!blatt) return;
        const b = blatt;
        blatt = null;
        rollLauf++;
        rollZiel = null;
        if (b.ziel !== b.vorher) window.scrollTo(0, b.vorher);
        return;
      }
      if (blatt) return;
      const g = $("#brain-graph").getBoundingClientRect();
      const kopf = kopfUnten();
      const start = warDa ? window.scrollY : 0;
      const hoechstens = Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight);
      let ziel = Math.round(Math.min(hoechstens, g.top + window.scrollY - kopf - ABSTAND_KOPF));
      if (ziel <= start + 1 || detailLage(d).oben - kopf - ABSTAND_KOPF < FREI_MIN) ziel = start; // steht schon hoch genug – oder es bliebe kaum etwas zu sehen
      blatt = { vorher: start, ziel };
      if (ziel !== start || !warDa) rollen(ziel, !warDa || app.wenigBewegung.matches);
    }
    /**
     * Knoten per Tipp oder Klick geöffnet: Für die Spanne eines Doppeltipps nimmt alles, was über dem Graphen liegt, keine
     * Zeiger an (brain.css) – der zweite Tipp zentriert den Knoten, statt im aufgehenden Detail etwas auszulösen.
     */
    let sperrUhr = null;
    function tippSperre() {
      wurzel.classList.add("tipp-sperre");
      clearTimeout(sperrUhr);
      sperrUhr = setTimeout(() => wurzel.classList.remove("tipp-sperre"), 350);
    }

    /** Das ganze Bild frisch anordnen – löst auch alle von Hand festgesetzten Knoten. */
    function neuAnordnen() {
      if (!z.graph || z.reiter !== "graph") return;
      z.graph.neuAnordnen({ auchFeste: true });
      ansage("Graph neu angeordnet. Festgesetzte Knoten sind wieder frei.");
      if (z.auswahl && !z.bearbeitung && !$("#brain-detail").hidden) detailZeichnen();
    }

    function graphZeichnen() {
      const rahmen = $("#brain-graph-rahmen");
      const warDa = Boolean(z.graph) && z.graph.istAktiv(); // stand der Graph eben schon im Bild?
      const neu = !z.graph;
      if (!z.graph) {
        if (!rahmen.clientWidth || !rahmen.clientHeight) { requestAnimationFrame(() => { if (!wurzel.hidden && z.reiter === "graph") zeichnen(); }); return; }
        // Legende: offen nur, wo sie dem Graphen genug Platz lässt (auf kleiner Fläche deckte sie ein Viertel davon zu)
        $("#brain-legende").open = app.laptop.matches && rahmen.clientWidth >= 1000 && rahmen.clientHeight >= 560;
        z.graph = G.erstelle(rahmen, {
          farben,
          wenigBewegung: () => app.wenigBewegung.matches,
          ziehen: () => (lokal.lesen("brain.physik") === false ? "ruhig" : "lebendig"), // Menü „Physik beim Ziehen“
          workerUrl: `brain-graph.js?v=${encodeURIComponent(app.version)}`,
          positionen: { lesen: () => lokal.lesen("brain.positionen") || {}, schreiben: (p) => lokal.schreiben("brain.positionen", p) },
          beiAuswahl: (id, info) => {
            if (info && info.quelle === "tastatur" && id && !$("#brain-detail").hidden && !ungespeichert()) app.adresseSetzen(`#/brain/${id}`, { ersetzen: true });
          },
          beiOeffnen: (id, info) => {
            if (!id) return;
            if (info && info.quelle === "zeiger") tippSperre(); // nur per Tipp oder Klick – nicht bei Eingabetaste oder aus der Liste
            oeffnen(id, { fokus: true });
          },
          beiHover: () => {},
          // gezogen = festgesetzt: das offene Detail bekommt den Knopf „Lösen“ (nur wenn gerade nicht bearbeitet wird)
          beiFixiert: (id) => { if (id === z.auswahl && !z.bearbeitung && !$("#brain-detail").hidden) detailZeichnen(); },
          hindernisse,
          ansage,
        });
        z.graphSignatur = "";
      }
      z.graph.aktiv(true);
      blattPlatz(warDa);
      z.graph.verdeckt(verdeckt()); // vor allem, was die Kamera bewegt: Sie rechnet mit dem freien Bereich
      if (PROBE_KNOTEN) {
        // Leistungsmessung: erfundener Graph (nur die Zeichnung – das Brain selbst bleibt unberührt)
        if (!z.graphSignatur) { z.graphSignatur = "probe"; z.graph.setzen(G.testDaten(PROBE_KNOTEN, 7)); z.graph.einpassen({}); }
        return;
      }
      const knoten = z.brain.knoten();
      const kanten = z.brain.kanten();
      const signatur = `${knoten.map((k) => `${k.id}\u0001${k.titel}\u0001${k.status}\u0001${k.art}`).join("\u0002")}\u0003${kanten.map((k) => `${k.von}>${k.nach}>${k.art}`).join("\u0002")}`;
      const erstes = !z.graphSignatur;
      if (signatur !== z.graphSignatur) {
        z.graphSignatur = signatur;
        z.graph.setzen({
          knoten: knoten.map((k) => ({ id: k.id, art: k.art, titel: k.titel, status: k.status, geschuetzt: Boolean(k.geschuetzt), grad: z.brain.grad(k.id) })),
          kanten: kanten.map((k) => ({ von: k.von, nach: k.nach, art: k.art })),
        });
      }
      z.graph.sichtbarkeit(filterAktiv() ? new Set(gefiltert().map((k) => k.id)) : null);
      z.graph.treffer(z.treffer);
      const fokusOk = z.fokus && z.brain.hol(z.fokus.id);
      if (z.fokus && !fokusOk) z.fokus = null;
      fokusLeiste(); // vor dem Einpassen: Die Leiste liegt über der Fläche, darunter soll kein Knoten stehen
      z.graph.fokus(z.fokus ? z.fokus.id : null, z.fokus ? z.fokus.tiefe : 1);
      // Die Auswahl wird jedes Mal gesetzt, in den Blick geholt wird der Knoten nur, wenn sie wechselt (brain-graph.js) –
      // beim Sprung aus dem Gespräch (Quellen-Chip) fliegt die Kamera ausdrücklich hin. Sonst bleibt der Ausschnitt, wie er ist.
      z.graph.auswaehlen(z.auswahl && z.brain.hol(z.auswahl) ? z.auswahl : null, { zentrieren: Boolean(z.leuchten.length && z.auswahl) });
      if (erstes) z.graph.einpassen({ verdeckt: verdeckt(), sofort: true });
      if (z.leuchten.length) {
        const ids = z.leuchten.filter((id) => z.brain.hol(id));
        z.leuchten = [];
        if (ids.length) setTimeout(() => { if (z.graph) z.graph.hervorheben(ids, { dauer: 1800 }); }, 260);
      }
      // eben erst angelegt: Jetzt weiß der Graph, welche Knoten festgesetzt sind – das offene Detail bekommt seinen Knopf „Lösen“
      if (neu && !$("#brain-detail").hidden && !z.bearbeitung) detailZeichnen();
    }

    function fokusLeiste() {
      const ziel = $("#brain-fokus");
      const k = z.fokus ? z.brain.hol(z.fokus.id) : null;
      ziel.hidden = !k;
      if (!k) return;
      mitFokus(ziel, `
        <span class="brain-fokus-text">${symbol("fokus", "klein")}Fokus: <strong>${esc(k.titel)}</strong></span>
        <span class="brain-fokus-tiefe" role="group" aria-label="Tiefe der Nachbarschaft">${[1, 2, 3].map((t) => `<button class="chip" type="button" data-brain="fokus-tiefe" data-wert="${t}" aria-pressed="${z.fokus.tiefe === t}" aria-label="Tiefe ${t}">${t}</button>`).join("")}</span>
        <button class="rund-knopf klein" type="button" data-brain="fokus-aus" aria-label="Fokus beenden" title="Fokus beenden (Esc)">${symbol("x", "klein")}</button>`);
    }

    // ==========================================================
    // 4 Liste (gleichwertig zum Graphen)
    // ==========================================================
    const tagWann = (zeit) => (zeit ? K.wann(zeit) : "");
    function sortiert(liste) {
      const n = z.brain.nutzungAlle();
      const anzahl = (id) => ((n.get(id) || {}).anzahl || 0);
      const nachTitel = (a, b) => String(a.titel).localeCompare(String(b.titel), "de");
      const f = {
        titel: nachTitel,
        geaendert: (a, b) => (b.geaendert || 0) - (a.geaendert || 0) || nachTitel(a, b),
        grad: (a, b) => z.brain.grad(b.id) - z.brain.grad(a.id) || nachTitel(a, b),
        nutzung: (a, b) => anzahl(b.id) - anzahl(a.id) || nachTitel(a, b),
      }[z.sortierung] || nachTitel;
      return [...liste].sort(f);
    }
    function zeileHtml(k) {
      const n = z.brain.nutzung(k.id);
      const grad = z.brain.grad(k.id);
      const teile = [];
      if (k.geaendert) teile.push(tagWann(k.geaendert));
      teile.push(grad === 1 ? "1 Verbindung" : `${grad} Verbindungen`);
      if (n.anzahl) teile.push(`${n.anzahl}× von Gabi verwendet`);
      return `<li><a class="brain-zeile${k.id === z.auswahl ? " aktiv" : ""}" href="#/brain/${esc(k.id)}"${k.id === z.auswahl ? ' aria-current="true"' : ""}>
        <span class="brain-punkt" data-art="${esc(k.art)}" data-status="${esc(k.status)}"></span>
        <span class="brain-zeile-text"><strong>${esc(k.titel)}</strong><span class="stumm">${esc(teile.join(" · "))}${(k.tags || []).slice(0, 3).map((t) => ` <span class="brain-tag">#${esc(t)}</span>`).join("")}</span></span>
        ${k.geschuetzt ? `<span class="brain-schloss" title="Geschützt">${symbol("schloss", "klein")}<span class="unsichtbar">Geschützt</span></span>` : ""}
        ${k.status !== "bestaetigt" ? `<span class="badge ${k.status === "zu_klaeren" ? "warn" : ""}">${esc(statusName(k.status))}</span>` : ""}
      </a></li>`;
    }
    function listeZeichnen() {
      const ziel = $("#brain-liste");
      let liste = gefiltert();
      if (z.treffer) { const rang = new Map(z.treffer.map((id, i) => [id, i])); liste = liste.filter((k) => rang.has(k.id)).sort((a, b) => rang.get(a.id) - rang.get(b.id)); } else liste = sortiert(liste);
      const kopf = `
        <div class="brain-liste-kopf">
          <p class="suche-hinweis">${esc(zaehlText(liste.length))}</p>
          <div class="brain-liste-wahl">
            <label class="brain-auswahl"><span class="unsichtbar">Gruppieren</span><select data-brain-wahl="gruppierung"${z.treffer ? " disabled" : ""}>${GRUPPIERUNG.map(([w, n]) => `<option value="${w}"${z.gruppierung === w ? " selected" : ""}>${n}</option>`).join("")}</select>${symbol("runter")}</label>
            <label class="brain-auswahl"><span class="unsichtbar">Sortieren</span><select data-brain-wahl="sortierung"${z.treffer ? " disabled" : ""}>${SORTIERUNG.map(([w, n]) => `<option value="${w}"${z.sortierung === w ? " selected" : ""}>${n}</option>`).join("")}</select>${symbol("runter")}</label>
          </div>
        </div>`;
      let rumpf = leerHtml(liste.length); // leerer Zustand: derselbe Block wie im Graphen
      if (!rumpf && (z.treffer || z.gruppierung === "keine")) {
        rumpf = `<ul class="brain-zeilen">${liste.map(zeileHtml).join("")}</ul>`;
      } else if (!rumpf) {
        const gruppen = z.gruppierung === "status" ? B.STATUS.map((s) => [s.id, s.name, (k) => k.status === s.id]) : B.ARTEN.map((a) => [a.id, a.mehrzahl, (k) => k.art === a.id]);
        rumpf = gruppen.map(([id, name, passt]) => {
          const teil = liste.filter(passt);
          return teil.length ? `<section class="brain-gruppe" aria-labelledby="brain-gruppe-${id}"><h2 class="augenbraue" id="brain-gruppe-${id}">${esc(name)} <span class="zahl">${teil.length}</span></h2><ul class="brain-zeilen">${teil.map(zeileHtml).join("")}</ul></section>` : "";
        }).join("");
      }
      mitFokusListe(ziel, kopf + rumpf);
    }
    /** Liste neu zeichnen und den Fokus auf derselben Zeile bzw. Auswahl lassen. */
    function mitFokusListe(ziel, html) {
      const a = document.activeElement;
      const merke = a && ziel.contains(a) ? { href: a.getAttribute("href"), wahl: a.dataset ? a.dataset.brainWahl : "" } : null;
      if (!mitFokus(ziel, html) || !merke) return;
      const neu = merke.href ? ziel.querySelector(`a[href="${CSS.escape(merke.href)}"]`) : merke.wahl ? ziel.querySelector(`[data-brain-wahl="${merke.wahl}"]`) : null;
      if (neu) neu.focus({ preventScroll: true });
    }

    // ==========================================================
    // 5 Wissenslücken
    // ==========================================================
    function lueckenZeichnen() {
      const liste = z.brain.luecken();
      mitFokus($("#brain-luecken"), liste.length ? `
        <div class="brain-abschnitt-kopf"><h2>Wissenslücken</h2><p>Fragen, die Gabi nicht aus dem Brain beantworten konnte. Sie liegen nur auf diesem Gerät.</p></div>
        <ul class="brain-karten">${liste.map((l) => `
          <li class="karte brain-luecke" tabindex="-1">
            <div class="brain-luecke-text"><strong>${esc(l.frage)}</strong><span class="stumm">${l.anzahl === 1 ? "1× gefragt" : `${l.anzahl}× gefragt`} · zuletzt ${esc(tagWann(l.zuletzt))}</span></div>
            <div class="knopf-reihe links">
              <button class="knopf primaer klein" type="button" data-brain="luecke-eintragen" data-id="${esc(l.id)}">${symbol("plus")}Ins Brain eintragen</button>
              <button class="knopf leise klein" type="button" data-brain="luecke-verwerfen" data-id="${esc(l.id)}">Verwerfen</button>
            </div>
          </li>`).join("")}</ul>` : `
        <div class="leer"><div class="kachel">${symbol("haken")}</div><h2>Keine offenen Lücken</h2><p>Kann Gabi eine Praxisfrage nicht aus dem Brain beantworten, landet die Frage hier – mit einem Tipp trägst du sie ein.</p></div>`);
    }

    // ==========================================================
    // 6 Fähigkeiten und Audit-Spur
    // ==========================================================
    function faehigkeitenZeichnen() {
      const alle = (SEED && Array.isArray(SEED.faehigkeiten) ? SEED.faehigkeiten : []);
      const phasen = new Map(((SEED && SEED.phasen) || []).map((p) => [Number(p.nr), p.titel]));
      const nachName = new Map(alle.map((f) => [f.id, f.name]));
      const karte = (f) => {
        const [stufe, erklaerung] = STUFEN[f.stufe] || [f.stufe, ""];
        const liste = (titel, werte) => (Array.isArray(werte) && werte.length ? `<div class="brain-faehigkeit-zeile"><span class="augenbraue">${titel}</span><span>${werte.map(esc).join(" · ")}</span></div>` : "");
        return `<li class="karte brain-faehigkeit" data-status="${esc(f.status)}">
          <div class="brain-faehigkeit-kopf"><h3>${esc(f.name)}</h3><span class="badge ${f.status === "aktiv" ? "akzent" : f.status === "entwurf" ? "warn" : ""}">${f.status === "aktiv" ? "Aktiv" : f.status === "entwurf" ? "Entwurf" : "Geplant"}</span></div>
          <p>${esc(f.beschreibung || "")}</p>
          <div class="brain-faehigkeit-zeile"><span class="augenbraue">Was darf Gabi damit?</span><span>${esc(f.darf || erklaerung)}</span></div>
          <div class="brain-faehigkeit-zeile"><span class="augenbraue">Stufe</span><span><strong>${esc(stufe)}</strong> – ${esc(erklaerung)}${f.bestaetigung ? ` (${esc(f.bestaetigung)})` : ""}</span></div>
          ${liste("Daten", f.daten)}${liste("Voraussetzungen", f.voraussetzungen)}
          ${f.phase ? `<div class="brain-faehigkeit-zeile"><span class="augenbraue">Roadmap</span><span>Phase ${esc(f.phase)}${phasen.get(Number(f.phase)) ? ` – ${esc(phasen.get(Number(f.phase)))}` : ""}</span></div>` : ""}
        </li>`;
      };
      const gruppe = (status, titel, text) => {
        const teil = alle.filter((f) => f.status === status);
        return teil.length ? `<section class="brain-gruppe"><div class="brain-abschnitt-kopf"><h2>${titel} <span class="zahl stumm">${teil.length}</span></h2><p>${text}</p></div><ul class="brain-karten zwei">${teil.map(karte).join("")}</ul></section>` : "";
      };
      const spur = z.brain.audit().slice(0, 30);
      mitFokus($("#brain-faehigkeiten"), `
        <div class="brain-abschnitt-kopf"><h2>Was Gabi kann – und was sie darf</h2><p>Drei Stufen: <strong>Lesen</strong>, <strong>Vorschlagen</strong>, <strong>Ausführen nach Bestätigung</strong>. Gabi speichert, ändert und löscht nie von selbst.</p></div>
        ${alle.length ? gruppe("aktiv", "Aktiv", "Das kann Gabi heute.") + gruppe("entwurf", "Entwurf", "Gebaut, aber noch nicht freigegeben.") + gruppe("geplant", "Geplant", "Vorbereitet für später – noch nicht gebaut.") : `<div class="leer"><p>Das Fähigkeiten-Register ließ sich nicht laden.</p></div>`}
        <section class="brain-gruppe">
          <div class="brain-abschnitt-kopf mit-knopf"><div><h2>Zuletzt genutzt</h2><p>Nur was und wann – nie Inhalte. Liegt nur auf diesem Gerät.</p></div>${spur.length ? `<button class="knopf leise klein" type="button" data-brain="audit-leeren">${symbol("muell")}Verlauf löschen</button>` : ""}</div>
          ${spur.length ? `<ul class="brain-spur">${spur.map((e) => `<li><span>${esc(nachName.get(e.faehigkeit) || e.faehigkeit)}</span><span class="stumm">${esc(tagWann(e.zeit))}</span></li>`).join("")}</ul>` : '<p class="stumm">Noch nichts genutzt.</p>'}
        </section>`);
    }

    // ==========================================================
    // 7 Detail: ansehen, bearbeiten, Verlauf
    // ==========================================================
    const ungespeichert = () => Boolean(z.bearbeitung && z.bearbeitung.geaendert);
    async function verlassenOk() {
      if (!ungespeichert()) { if (z.bearbeitung) bearbeitungEnde(); return true; }
      if (!(await frage("Änderungen verwerfen?", "Du hast den Eintrag bearbeitet, aber noch nicht gespeichert.", { ja: "Verwerfen", nein: "Weiter bearbeiten", gefahr: true }))) return false;
      bearbeitungEnde();
      return true;
    }
    function bearbeitungEnde() {
      z.bearbeitung = null;
      z.vorschau = false;
      if (z.notfall) z.notfall.loeschen();
    }

    function detailZeichnen() {
      const d = $("#brain-detail");
      const b = z.bearbeitung;
      const k = !b && z.auswahl ? z.brain.hol(z.auswahl) : null;
      const zeigen = Boolean(b || k) && (z.reiter === "graph" || z.reiter === "liste");
      const warZu = d.hidden;
      const fokusDrin = !warZu && d.contains(document.activeElement); // merken, bevor das Detail versteckt oder neu gebaut wird
      d.hidden = !zeigen;
      d.classList.toggle("gross", z.blattGross);
      wurzel.classList.toggle("mit-detail", zeigen);
      if (!zeigen) {
        d.classList.remove("oeffnet");
        // Das Detail ging zu, während der Fokus darin stand (Rückgängig nahm den Eintrag weg, Zurück-Taste …): nicht auf body
        // fallen lassen. Erst nach der laufenden Aktion – setzt sie den Fokus selbst (Schließen, Löschen), bleibt es dabei.
        if (fokusDrin) queueMicrotask(() => { const a = document.activeElement; if (!a || a === document.body) fokusNachDetail(d.dataset.knoten || ""); });
        return;
      }
      // nur beim Aufgehen gleitet das Blatt einmal herein – nie bei einem Neuzeichnen
      if (warZu && !app.wenigBewegung.matches) {
        d.classList.add("oeffnet");
        d.addEventListener("animationend", () => d.classList.remove("oeffnet"), { once: true });
      }
      if (b) { formZeichnen(d); return; }
      const n = z.brain.nutzung(k.id);
      const aus = z.brain.verweise(k.id);
      const ein = z.brain.rueckverweise(k.id);
      const hand = z.brain.verbindungen(k.id);
      const chip = (x) => `<a class="quelle" href="#/brain/${esc(x.id)}"><span class="brain-punkt" data-art="${esc(x.art)}"></span>${esc(x.titel)}</a>`;
      const kopf = `
        <div class="brain-detail-kopf">
          <button class="brain-griff" type="button" data-brain="blatt" aria-label="${z.blattGross ? "Verkleinern" : "Vergrößern"}"><span></span></button>
          <span class="brain-art"><span class="brain-punkt" data-art="${esc(k.art)}"></span>${esc(artName(k.art))}</span>
          ${k.geschuetzt ? `<span class="badge">${symbol("schloss", "klein")}Nur lesen</span>` : ""}
          <span class="brain-platz"></span>
          <button class="rund-knopf" type="button" data-brain="detail-zu" aria-label="Details schließen" title="Schließen (Esc)">${symbol("x")}</button>
        </div>
        <h2 id="brain-detail-titel" tabindex="-1">${esc(k.titel)}</h2>`;
      let rumpf;
      if (k.abgeleitet && k.art !== "regel") rumpf = abgeleitetHtml(k);
      else {
        const status = k.geschuetzt ? "" : `<div class="brain-status" role="radiogroup" aria-label="Status">${B.STATUS.map((s) => `<button type="button" role="radio" aria-checked="${k.status === s.id}" data-brain="status" data-wert="${s.id}"${k.status === s.id ? "" : ' tabindex="-1"'}>${esc(s.name)}</button>`).join("")}</div>`;
        const aktionen = `<div class="brain-detail-aktionen">
            ${k.geschuetzt ? "" : `<button class="knopf sekundaer klein" type="button" data-brain="bearbeiten">${symbol("stift")}Bearbeiten</button>`}
            <button class="knopf sekundaer klein" type="button" data-brain="fokus-an">${symbol("fokus")}Fokus</button>
            ${z.reiter === "liste" ? `<button class="knopf sekundaer klein" type="button" data-brain="im-graph">${symbol("graph")}Im Graph zeigen</button>` : ""}
            ${z.reiter === "graph" && z.graph && z.graph.istFest(k.id) ? `<button class="knopf sekundaer klein" type="button" data-brain="loesen" title="Im Graph festgesetzt – wieder frei anordnen lassen">${symbol("pin")}Lösen</button>` : ""}
            ${k.geschuetzt ? "" : `<button class="knopf leise klein brain-loeschen" type="button" data-brain="loeschen">${symbol("muell")}Löschen</button>`}
          </div>`;
        const inhalt = String(k.inhalt || "").trim()
          ? `<div class="brain-md nachricht-text">${B.markdownHtml(k.inhalt, { aufloesen: z.brain.aufloesen })}</div>`
          : `<p class="brain-leer-text">${k.status === "zu_klaeren" ? "Noch keine Antwort. Trag sie über „Bearbeiten“ ein – oder lass dich von Gabi fragen („Brain füllen“)." : "Noch kein Inhalt."}</p>`;
        const meta = `<dl class="brain-meta">
            ${(k.tags || []).length ? `<div><dt>Tags</dt><dd>${k.tags.map((t) => `<button class="brain-tag" type="button" data-brain="tag" data-wert="${esc(t)}">#${esc(t)}</button>`).join(" ")}</dd></div>` : ""}
            ${k.quelle ? `<div><dt>Quelle</dt><dd>${esc(k.quelle)}</dd></div>` : ""}
            ${k.geaendert ? `<div><dt>Zuletzt geändert</dt><dd>${esc(K.datumLang(k.geaendert))}${S.istVeraltet(k) ? ' <span class="badge warn">über 90 Tage</span>' : ""}</dd></div>` : ""}
            ${S.KONTEXT_ARTEN.includes(k.art) ? `<div><dt>Gabi</dt><dd>${n.anzahl ? `${n.anzahl}× für Antworten verwendet, zuletzt ${esc(tagWann(n.zuletzt))}` : "noch nie für eine Antwort verwendet"}</dd></div>` : ""}
          </dl>`;
        const fehlt = aus.filter((v) => v.fehlt);
        const verweise = aus.length ? `<section class="brain-teil"><h3 class="augenbraue">Verweist auf</h3><div class="quellen">${aus.filter((v) => !v.fehlt).map((v) => chip(z.brain.hol(v.id))).join("")}${fehlt.map((v) => `<button class="quelle fehlt" type="button" data-brain="fehlend" data-wert="${esc(v.titel)}" title="Diesen Eintrag gibt es noch nicht – anlegen">${symbol("plus", "klein")}${esc(v.titel)}</button>`).join("")}</div>${fehlt.length ? '<p class="brain-klein stumm">Gestrichelt: fehlender Eintrag – antippen zum Anlegen.</p>' : ""}</section>` : "";
        const rueck = ein.length ? `<section class="brain-teil"><h3 class="augenbraue">Wird erwähnt von</h3><div class="quellen">${ein.map((x) => chip(x.knoten)).join("")}</div></section>` : "";
        const verbindungen = k.geschuetzt ? "" : `<section class="brain-teil"><h3 class="augenbraue">Verbindungen von Hand</h3>
            ${hand.length ? `<ul class="brain-verbindungen">${hand.map((v) => `<li><span class="stumm">${esc(KANTE_NAME[v.kante.art] || v.kante.art)}${v.kante.von === k.id ? " →" : " ←"}</span> <a href="#/brain/${esc(v.knoten.id)}">${esc(v.knoten.titel)}</a><button class="rund-knopf klein" type="button" data-brain="kante-weg" data-id="${esc(v.kante.id)}" aria-label="Verbindung zu ${esc(v.knoten.titel)} entfernen">${symbol("x", "klein")}</button></li>`).join("")}</ul>` : ""}
            <form class="brain-kante-form" data-brain-form="kante" novalidate>
              <label class="unsichtbar" for="brain-kante-ziel">Mit welchem Eintrag verbinden?</label>
              <input class="eingabefeld" id="brain-kante-ziel" name="ziel" list="brain-titel-liste" placeholder="Eintrag suchen …" autocomplete="off">
              <label class="brain-auswahl"><span class="unsichtbar">Art der Verbindung</span><select name="art"><option value="verweis">Verweis</option><option value="gehoert_zu">Gehört zu</option></select>${symbol("runter")}</label>
              <button class="knopf sekundaer klein" type="submit">${symbol("link")}Verbinden</button>
            </form></section>`;
        const verlauf = k.geschuetzt ? "" : `<details class="brain-verlauf" id="brain-verlauf"${z.verlaufVon === k.id ? " open" : ""}><summary>${symbol("uhr", "klein")}Versionsverlauf</summary><div id="brain-verlauf-inhalt">${z.verlaufVon === k.id ? verlaufHtml(k) : ""}</div></details>`;
        rumpf = status + aktionen + inhalt + meta + verweise + rueck + verbindungen + verlauf;
      }
      // Wird derselbe Eintrag nur neu gezeichnet (Status, Verbindung, Fassung …), bleibt die Leseposition – sonst spränge
      // das Detail an den Anfang. Ein anderer Eintrag (und die Ansicht nach dem Bearbeiten) beginnt oben.
      const rumpfAlt = warZu ? null : d.querySelector(".brain-detail-rumpf:not(.brain-form)");
      const lage = rumpfAlt && d.dataset.knoten === k.id ? rumpfAlt.scrollTop : 0;
      const neu = mitFokus(d, `${kopf}<div class="brain-detail-rumpf">${rumpf}</div>`);
      d.dataset.knoten = k.id;
      if (neu) {
        const liste = wurzel.querySelector("#brain-titel-liste");
        if (liste) ersetzen(liste, z.brain.knoten().filter((x) => x.id !== k.id).slice(0, 600).map((x) => `<option value="${esc(x.titel)}"></option>`).join(""));
        const v = d.querySelector("#brain-verlauf");
        if (v) v.addEventListener("toggle", () => { if (v.open) verlaufLaden(k.id); else { z.verlaufVon = ""; z.verlauf = null; } });
        if (lage) d.querySelector(".brain-detail-rumpf").scrollTop = lage;
      }
      if (warZu || z.fokusAufDetail) {
        const titel = d.querySelector("#brain-detail-titel");
        if (z.fokusAufDetail && titel) app.fokusSetzen(titel);
        z.fokusAufDetail = false;
        d.scrollTop = 0;
      } else {
        // Fokus nach dem Neuaufbau: wohin die Aktion ihn wünscht (neue Verbindung, nächste Zeile …) – sonst, stand er im
        // Detail und ist jetzt weg (das bediente Element gibt es nicht mehr), auf den Titel
        const wunsch = detailFokus ? detailFokus(d) : null;
        if (wunsch) app.fokusSetzen(wunsch);
        else if (neu && fokusDrin && !d.contains(document.activeElement)) app.fokusSetzen(d.querySelector("#brain-detail-titel"));
      }
    }

    function abgeleitetHtml(k) {
      const ref = k.ref || {};
      if (ref.typ === "patient") {
        return `<p class="brain-leer-text">Test-Patient – im Brain steht nur das Kürzel. ${ref.anzahl === 1 ? "1 Notiz" : `${ref.anzahl} Notizen`} im Notizordner.</p>
          <div class="brain-detail-aktionen"><a class="knopf sekundaer klein" href="#/notizen/p/${esc(ref.id)}">${symbol("notizen")}Im Notizordner öffnen</a><button class="knopf sekundaer klein" type="button" data-brain="fokus-an">${symbol("fokus")}Fokus</button></div>`;
      }
      if (ref.typ === "notiz") {
        const geladen = z.notizInhalt.get(ref.id);
        const inhalt = geladen === undefined
          ? `<button class="knopf sekundaer klein" type="button" data-brain="notiz-laden">${symbol("auge")}Inhalt anzeigen</button>`
          : geladen === null ? `<div class="skelett brain-skelett-notiz"></div>`
            : geladen.fehler ? `<p class="meldung">${symbol("warn")}<span>${esc(geladen.fehler)}</span></p>`
              : `<div class="brain-md nachricht-text">${K.ABSCHNITTE.concat([[K.UNKLAR, "Bitte prüfen"]]).map(([key, titel]) => { const p = K.stichpunkte((geladen.strukturiert || {})[key]); return p.length ? `<h4>${esc(titel)}</h4><ul>${p.map((x) => `<li>${K.mitUnklar(x)}</li>`).join("")}</ul>` : ""; }).join("") || "<p>Diese Notiz ist leer.</p>"}</div>`;
        return `<p class="brain-leer-text">Behandlungsnotiz (Testdaten). Im Graph stehen nur Datum und Kürzel – der Inhalt wird erst hier geladen. Ändern geht nur im Notizordner.</p>
          ${inhalt}
          <div class="brain-detail-aktionen"><a class="knopf sekundaer klein" href="#/notizen/n/${esc(ref.id)}">${symbol("dokument")}Im Notizordner öffnen</a></div>`;
      }
      return `<p class="brain-leer-text">Bericht aus einem Gespräch auf diesem Gerät. Im Brain stehen nur Art, Kürzel und Datum.</p>
        ${ref.gespraech ? `<div class="brain-detail-aktionen"><a class="knopf sekundaer klein" href="#/gespraech/${esc(ref.gespraech)}">${symbol("chat")}Gespräch öffnen</a></div>` : ""}`;
    }

    // ---------- Versionsverlauf ----------
    async function verlaufLaden(id) {
      // Wird der offene Verlauf nur aufgefrischt (nach „Wiederherstellen“), bleibt die Liste stehen, bis die neue da ist:
      // kein Platzhalter-Blinken, und der Fokus bleibt auf dem Knopf, statt mit ihm zu verschwinden
      const frisch = z.verlaufVon !== id || !z.verlauf;
      z.verlaufVon = id;
      const ziel = () => wurzel.querySelector("#brain-verlauf-inhalt");
      if (frisch) {
        z.verlauf = null;
        if (ziel()) ersetzen(ziel(), '<div class="skelett brain-skelett-zeile"></div>');
      }
      const liste = await z.brain.verlauf(id);
      if (z.verlaufVon !== id) return;
      z.verlauf = liste;
      const k = z.brain.hol(id);
      if (!ziel() || !k) return;
      const fokusDrin = ziel().contains(document.activeElement);
      mitFokus(ziel(), verlaufHtml(k));
      if (fokusDrin && !ziel().contains(document.activeElement)) app.fokusSetzen(wurzel.querySelector("#brain-verlauf summary")); // die Fassung gibt es nicht mehr (nur die letzten 20)
    }
    function verlaufHtml(k) {
      if (!z.verlauf) return '<div class="skelett brain-skelett-zeile"></div>';
      if (!z.verlauf.length) return '<p class="stumm brain-klein">Noch keine früheren Fassungen. Bei jeder Änderung wird die vorige aufgehoben (die letzten 20).</p>';
      return `<ul class="brain-versionen">${z.verlauf.map((v) => {
        const offen = z.versionOffen === v.nr;
        const felder = ["titel", "status", "art", "quelle", "tags", "inhalt"].filter((f) => (f === "tags" ? (v.tags || []).join(",") !== (k.tags || []).join(",") : String(v[f] || "") !== String(k[f] || "")));
        return `<li>
          <div class="brain-version-kopf"><span><strong>${esc(tagWann(v.zeit))}</strong> <span class="stumm">· ${esc(GRUND[v.grund] || "Geändert")}</span></span>
            <span class="brain-version-knoepfe"><button class="knopf geist klein" type="button" data-brain="version-zeigen" data-wert="${v.nr}" aria-expanded="${offen}">${offen ? "Zuklappen" : "Ansehen"}</button><button class="knopf sekundaer klein" type="button" data-brain="version-holen" data-wert="${v.nr}">Wiederherstellen</button></span></div>
          ${offen ? `<div class="brain-version-inhalt"><p class="stumm brain-klein">${felder.length ? `Anders als heute: ${felder.map((f) => ({ titel: "Titel", status: "Status", art: "Art", quelle: "Quelle", tags: "Tags", inhalt: "Inhalt" })[f]).join(", ")}` : "Gleich wie die heutige Fassung."}</p><p><strong>${esc(v.titel)}</strong> <span class="badge">${esc(statusName(v.status))}</span></p><div class="brain-md nachricht-text">${B.markdownHtml(v.inhalt, { aufloesen: z.brain.aufloesen }) || "<p>(ohne Inhalt)</p>"}</div></div>` : ""}
        </li>`;
      }).join("")}</ul>`;
    }

    // ---------- Bearbeiten ----------
    function bearbeitenStarten(k, vorgabe = null) {
      z.bearbeitung = {
        id: k ? k.id : "", rev: k ? k.rev : 0, geaendert: Boolean(vorgabe && vorgabe.geaendert), fehler: {}, konflikt: false, extern: false, imKorb: false, schluessel: `${k ? k.id : "neu"}-${Date.now()}`,
        felder: { art: "praxiswissen", titel: "", inhalt: "", tags: [], status: "entwurf", quelle: "", ...(k ? { art: k.art, titel: k.titel, inhalt: k.inhalt, tags: [...(k.tags || [])], status: k.status, quelle: k.quelle } : {}), ...((vorgabe && vorgabe.felder) || {}) },
      };
      z.vorschau = false;
      if (z.reiter !== "graph" && z.reiter !== "liste") z.reiter = z.letzteHaupt;
      zeichnen();
      const feld = wurzel.querySelector('.brain-form [name="titel"]');
      if (feld) { app.fokusSetzen(feld); if (!k) feld.select(); }
    }

    function formZeichnen(d) {
      const b = z.bearbeitung;
      if (d.dataset.form === b.schluessel) { formHinweise(); return; } // schon aufgebaut: Getipptes nie überschreiben
      d.dataset.form = b.schluessel;
      const f = b.felder;
      const html = `
        <div class="brain-detail-kopf">
          <button class="brain-griff" type="button" data-brain="blatt" aria-label="Vergrößern"><span></span></button>
          <span class="brain-art">${symbol("stift", "klein")}${b.id ? "Eintrag bearbeiten" : "Neuer Eintrag"}</span>
          <span class="brain-platz"></span>
          <button class="rund-knopf" type="button" data-brain="bearbeiten-abbrechen" aria-label="Bearbeiten beenden">${symbol("x")}</button>
        </div>
        <h2 id="brain-detail-titel" class="unsichtbar" tabindex="-1">${b.id ? "Eintrag bearbeiten" : "Neuer Eintrag"}</h2>
        <form class="brain-form brain-detail-rumpf" data-brain-form="knoten" novalidate>
          <div class="brain-form-hinweis" id="brain-form-hinweis" hidden></div>
          <label class="feld"><span>Titel</span><input class="eingabefeld" name="titel" maxlength="120" autocomplete="off" required aria-describedby="brain-fehler-titel" value="${esc(f.titel)}"></label>
          <p class="meldung" id="brain-fehler-titel" data-fehler="titel" role="alert" hidden></p>
          <div class="brain-form-zeile">
            <label class="feld"><span>Art</span><span class="brain-auswahl voll"><select name="art">${B.ARTEN.filter((a) => a.eigen).map((a) => `<option value="${a.id}"${f.art === a.id ? " selected" : ""}>${esc(a.name)}</option>`).join("")}</select>${symbol("runter")}</span></label>
            <label class="feld"><span>Status</span><span class="brain-auswahl voll"><select name="status" aria-describedby="brain-fehler-status">${B.STATUS.map((s) => `<option value="${s.id}"${f.status === s.id ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select>${symbol("runter")}</span></label>
          </div>
          <p class="meldung" id="brain-fehler-status" data-fehler="status" role="alert" hidden></p>
          <div class="feld">
            <div class="brain-inhalt-kopf"><label for="brain-inhalt"><span>Inhalt</span></label><button class="knopf geist klein" type="button" data-brain="vorschau" aria-pressed="false">${symbol("auge")}Vorschau</button></div>
            <textarea class="eingabefeld brain-inhalt" id="brain-inhalt" name="inhalt" rows="9" maxlength="20000" aria-describedby="brain-inhalt-hilfe brain-fehler-inhalt" aria-autocomplete="list" aria-controls="brain-vorschlaege">${esc(f.inhalt)}</textarea>
            <div class="brain-md nachricht-text brain-vorschau" id="brain-vorschau" hidden></div>
            <div class="brain-vorschlaege" id="brain-vorschlaege" role="listbox" aria-label="Einträge zum Verweisen" hidden></div>
            <small id="brain-inhalt-hilfe">Einfacher Text oder Markdown. Mit <code>[[</code> verweist du auf einen anderen Eintrag.</small>
          </div>
          <p class="meldung" id="brain-fehler-inhalt" data-fehler="inhalt" role="alert" hidden></p>
          <label class="feld"><span>Tags</span><input class="eingabefeld" name="tags" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="z. B. standort, preise" aria-describedby="brain-fehler-tags" value="${esc((f.tags || []).join(", "))}"><small>Mit Komma trennen.</small></label>
          <p class="meldung" id="brain-fehler-tags" data-fehler="tags" role="alert" hidden></p>
          <label class="feld"><span>Quelle</span><input class="eingabefeld" name="quelle" maxlength="80" list="brain-quellen" autocomplete="off" placeholder="Von wem stammt das?" aria-describedby="brain-fehler-quelle" value="${esc(f.quelle)}"></label>
          <p class="meldung" id="brain-fehler-quelle" data-fehler="quelle" role="alert" hidden></p>
          <p class="meldung" data-fehler="allgemein" role="alert" hidden></p>
          <div class="knopf-reihe links brain-form-knoepfe"><button class="knopf primaer" type="submit">${symbol("haken")}Speichern</button><button class="knopf leise" type="button" data-brain="bearbeiten-abbrechen">Abbrechen</button></div>
        </form>`;
      d.innerHTML = html;
      ersetzen(d, html); // Stand merken, damit die Ansicht danach sicher neu aufgebaut wird
      const form = d.querySelector("form");
      const inhalt = form.elements.inhalt;
      form.addEventListener("input", (e) => {
        const n = e.target.name;
        if (!n) return;
        b.felder[n] = n === "tags" ? e.target.value.split(",").map((t) => t.trim()).filter(Boolean) : e.target.value;
        b.geaendert = true;
        if (b.fehler[n]) { delete b.fehler[n]; formHinweise(); }
        notfallMerken();
        if (e.target === inhalt) vorschlaegeZeigen(inhalt);
      });
      inhalt.addEventListener("keydown", (e) => vorschlagTaste(e, inhalt));
      inhalt.addEventListener("blur", () => setTimeout(() => { const v = wurzel.querySelector("#brain-vorschlaege"); if (v && !v.contains(document.activeElement)) v.hidden = true; }, 150));
      formHinweise();
    }

    /** Fehlertexte und Hinweise im Formular setzen – ohne es neu aufzubauen. */
    function formHinweise() {
      const b = z.bearbeitung;
      const form = wurzel.querySelector(".brain-form");
      if (!b || !form) return;
      for (const p of form.querySelectorAll("[data-fehler]")) {
        const text = b.fehler[p.dataset.fehler] || "";
        p.hidden = !text;
        p.innerHTML = text ? `${symbol("warn")}<span>${esc(text)}</span>` : "";
        const feld = form.elements[p.dataset.fehler];
        if (feld && feld.setAttribute) feld.setAttribute("aria-invalid", String(Boolean(text)));
      }
      const h = form.querySelector("#brain-form-hinweis");
      h.hidden = !(b.imKorb || b.konflikt || b.extern);
      // Der Eintrag liegt inzwischen im Papierkorb: sagen, wo er ist, und den Ausweg anbieten – das Getippte bleibt stehen
      if (b.imKorb) h.innerHTML = `<div class="hinweis-box warn"><div class="hinweis-box-kopf">${symbol("warn")}<span id="brain-korb-text">Dieser Eintrag wurde ${b.imKorb === "fenster" ? "in einem anderen Fenster" : "inzwischen"} gelöscht – er liegt im Papierkorb.</span></div><div class="knopf-reihe links"><button class="knopf sekundaer klein" type="button" data-brain="korb-meine" aria-describedby="brain-korb-text">Wiederherstellen und speichern</button></div><p class="brain-klein">Der Eintrag kommt aus dem Papierkorb zurück – mit deiner Fassung.</p></div>`;
      else if (b.konflikt) h.innerHTML = `<div class="hinweis-box warn"><div class="hinweis-box-kopf">${symbol("warn")}<span>Dieser Eintrag wurde inzwischen in einem anderen Fenster geändert.</span></div><div class="knopf-reihe links"><button class="knopf sekundaer klein" type="button" data-brain="konflikt-meine">Meine Fassung speichern</button><button class="knopf leise klein" type="button" data-brain="konflikt-andere">Verwerfen und neu laden</button></div><p class="brain-klein">Die andere Fassung bleibt im Versionsverlauf erhalten.</p></div>`;
      else if (b.extern) h.innerHTML = `<div class="hinweis-box neutral"><div class="hinweis-box-kopf">${symbol("info")}<span>In einem anderen Fenster wurde dieser Eintrag gerade geändert. Beim Speichern fragt Gabi nach.</span></div></div>`;
    }

    let notfallUhr = null;
    function notfallMerken() {
      clearTimeout(notfallUhr);
      notfallUhr = setTimeout(notfallJetzt, 350);
    }
    function notfallJetzt() {
      clearTimeout(notfallUhr);
      const b = z.bearbeitung;
      if (b && b.geaendert && z.notfall) z.notfall.merken({ id: b.id, rev: b.rev, felder: b.felder, zeit: Date.now() });
    }
    window.addEventListener("pagehide", notfallJetzt); // IndexedDB bricht beim Verlassen ab – diese Kopie ist synchron
    document.addEventListener("visibilitychange", () => { if (document.hidden) notfallJetzt(); });

    function notfallAnbieten() {
      const d = z.wiederherstellbar;
      z.wiederherstellbar = null;
      if (z.bearbeitung) return;
      const k = d.id ? z.brain.eigene().find((x) => x.id === d.id) : null;
      // Liegt der Eintrag inzwischen im Papierkorb (in einem anderen Fenster gelöscht), geht die Kopie nicht verloren: Die
      // Bearbeitung kommt mit dem Hinweis zurück, dass er dort liegt. Nur endgültig Gelöschtes hat keinen Eintrag mehr.
      const imKorb = d.id && !k ? (z.brain.papierkorb().find((p) => p.knoten.id === d.id) || {}).knoten || null : null;
      if (d.id && !k && !imKorb) { z.notfall.loeschen(); return; }
      bearbeitenStarten(k || imKorb, { felder: d.felder, geaendert: true });
      if (imKorb) { z.bearbeitung.imKorb = true; formHinweise(); } else if (k && k.rev !== d.rev) { z.bearbeitung.extern = true; formHinweise(); }
      toast("Deine ungespeicherte Änderung ist wieder da.", { dauer: 5000 });
    }

    async function speichern({ erzwingen = false, ausKorb = false } = {}) {
      const b = z.bearbeitung;
      if (!b || b.speichert) return;
      // Der Eintrag liegt inzwischen im Papierkorb (anderes Fenster, Rückgängig): weder still zurückholen noch mit „gibt es
      // nicht mehr“ in der Sackgasse enden – nachfragen (Knopf im Hinweis). Das Getippte bleibt stehen.
      if (b.id && !ausKorb && imPapierkorb(b.id)) {
        b.imKorb = b.imKorb || true;
        b.konflikt = false;
        formHinweise();
        const ausweg = wurzel.querySelector('.brain-form [data-brain="korb-meine"]');
        if (ausweg) ausweg.focus();
        return;
      }
      if (!ausKorb) b.imKorb = false; // nicht (mehr) im Papierkorb, z. B. hier über „Wiederholen“ zurückgeholt: der Hinweis gilt nicht mehr
      b.speichert = true;
      const knopf = wurzel.querySelector('.brain-form button[type="submit"]');
      if (knopf) knopf.disabled = true;
      let r;
      let zurueckgeholt = false;
      try {
        if (b.id && ausKorb) {
          // „Wiederherstellen und speichern“: erst aus dem Papierkorb holen (ohne eigenen Rückgängig-Schritt – der Schritt ist
          // die Änderung danach), dann die eigene Fassung auf den wiederhergestellten Stand speichern
          const alt = (z.brain.papierkorb().find((p) => p.knoten.id === b.id) || {}).knoten || null;
          const w = await z.brain.wiederherstellen(b.id, { mitUndo: false });
          if (z.bearbeitung !== b || !z.brain) return; // inzwischen beendet (z. B. das Brain wurde anderswo gelöscht)
          if (w.ok) {
            zurueckgeholt = Boolean(alt);
            b.rev = w.knoten.rev;
            b.extern = false;
            b.konflikt = false;
            // Trägt inzwischen ein anderer Eintrag den Titel, kommt dieser mit Zusatz zurück („… (wiederhergestellt)“): Das
            // Formular übernimmt ihn, wenn der Titel hier nicht geändert wurde – sonst scheiterte das Speichern am Titel
            if (alt && w.knoten.titel !== alt.titel && B.schluessel(b.felder.titel) === B.schluessel(alt.titel)) {
              b.felder.titel = w.knoten.titel;
              const feld = wurzel.querySelector('.brain-form [name="titel"]');
              if (feld) feld.value = w.knoten.titel;
            }
          } else r = w;
          b.imKorb = imPapierkorb(b.id) ? b.imKorb || true : false;
        }
        if (!r) {
          if (b.id) {
            const aktuell = z.brain.eigene().find((x) => x.id === b.id);
            r = await z.brain.aendern(b.id, b.felder, { erwartet: erzwingen && aktuell ? aktuell.rev : b.rev });
          } else r = await z.brain.anlegen(b.felder);
        }
      } finally {
        b.speichert = false;
        if (knopf) knopf.disabled = false;
      }
      if (z.bearbeitung !== b) return;
      if (ausKorb) formHinweise(); // der Hinweis „liegt im Papierkorb“ passt jetzt nicht mehr (oder wieder)
      if (r.konflikt) {
        if (!r.aktuell) { bearbeitungEnde(); z.auswahl = ""; toast("Dieser Eintrag wurde in einem anderen Fenster gelöscht.", { art: "warn" }); app.adresseSetzen(reiterHash(), { ersetzen: true }); zeichnen(); return; }
        b.konflikt = true; formHinweise(); return;
      }
      if (r.fehler) {
        b.fehler = r.fehler;
        formHinweise();
        const erstes = ["titel", "status", "inhalt", "tags", "quelle"].find((f) => r.fehler[f]);
        const feld = erstes && wurzel.querySelector(`.brain-form [name="${erstes}"]`);
        if (feld) feld.focus();
        return;
      }
      const neu = !b.id;
      bearbeitungEnde();
      z.fokusAufDetail = true;
      if (z.auswahl !== r.knoten.id) { z.auswahl = r.knoten.id; app.adresseSetzen(`#/brain/${r.knoten.id}`, { ersetzen: !neu }); }
      zeichnen();
      if (neu && z.graph && z.reiter === "graph") z.graph.zentrieren(r.knoten.id);
      if (zurueckgeholt) toast(r.unveraendert ? `„${r.knoten.titel}“ ist wieder da.` : "Wiederhergestellt und gespeichert.", r.unveraendert ? { art: "erfolg" } : { art: "erfolg", aktion: { text: "Rückgängig", tun: rueckgaengig } });
      else toast(r.unveraendert ? "Nichts geändert." : `Gespeichert${r.umbenannt ? ` – ${r.umbenannt === 1 ? "1 Verweis" : `${r.umbenannt} Verweise`} angepasst` : ""}.`, r.unveraendert ? {} : { art: "erfolg", aktion: { text: "Rückgängig", tun: rueckgaengig } });
    }

    // ---------- [[Verweise]] beim Tippen vorschlagen ----------
    let vorschlagAktiv = 0;
    function offenerVerweis(feld) {
      const vor = feld.value.slice(0, feld.selectionStart);
      const m = /\[\[([^[\]|\n]{0,60})$/.exec(vor);
      return m ? { text: m[1], start: vor.length - m[1].length } : null;
    }
    function vorschlaegeZeigen(feld) {
      const ziel = wurzel.querySelector("#brain-vorschlaege");
      const o = offenerVerweis(feld);
      if (!o || !ziel) { if (ziel) ziel.hidden = true; return; }
      const eigen = z.bearbeitung && z.bearbeitung.id;
      const kandidaten = (o.text.trim() ? z.brain.suchen(o.text, { limit: 8 }).map((t) => z.brain.hol(t.id)) : [...z.brain.eigene()].sort((a, b) => (b.geaendert || 0) - (a.geaendert || 0)).slice(0, 8)).filter((k) => k && k.id !== eigen && k.art !== "notiz" && k.art !== "bericht").slice(0, 6);
      if (!kandidaten.length) { ziel.hidden = true; return; }
      vorschlagAktiv = Math.min(vorschlagAktiv, kandidaten.length - 1);
      ziel.hidden = false;
      ziel.innerHTML = kandidaten.map((k, i) => `<button class="brain-vorschlag" type="button" role="option" id="brain-vorschlag-${i}" aria-selected="${i === vorschlagAktiv}" data-brain="vorschlag" data-wert="${esc(k.titel)}"><span class="brain-punkt" data-art="${esc(k.art)}"></span>${esc(k.titel)}</button>`).join("");
      feld.setAttribute("aria-activedescendant", `brain-vorschlag-${vorschlagAktiv}`);
    }
    function vorschlagNehmen(feld, titel) {
      const o = offenerVerweis(feld);
      if (!o) return;
      const nach = feld.value.slice(feld.selectionStart).replace(/^\]\]/, "");
      feld.value = `${feld.value.slice(0, o.start)}${titel}]]${nach}`;
      const lage = o.start + titel.length + 2;
      feld.setSelectionRange(lage, lage);
      feld.dispatchEvent(new Event("input", { bubbles: true }));
      feld.focus();
      const ziel = wurzel.querySelector("#brain-vorschlaege");
      if (ziel) ziel.hidden = true;
      feld.removeAttribute("aria-activedescendant");
    }
    function vorschlagTaste(e, feld) {
      const ziel = wurzel.querySelector("#brain-vorschlaege");
      if (!ziel || ziel.hidden) return;
      const liste = [...ziel.querySelectorAll(".brain-vorschlag")];
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        vorschlagAktiv = (vorschlagAktiv + (e.key === "ArrowDown" ? 1 : liste.length - 1)) % liste.length;
        liste.forEach((k, i) => k.setAttribute("aria-selected", String(i === vorschlagAktiv)));
        feld.setAttribute("aria-activedescendant", `brain-vorschlag-${vorschlagAktiv}`);
      } else if ((e.key === "Enter" || e.key === "Tab") && liste[vorschlagAktiv]) {
        e.preventDefault();
        vorschlagNehmen(feld, liste[vorschlagAktiv].dataset.wert);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        ziel.hidden = true;
      }
    }

    // ==========================================================
    // 8 Aktionen
    // ==========================================================
    const reiterHash = () => `#/brain/${z.reiter}`;
    function oeffnen(id, { fokus = false } = {}) {
      z.fokusAufDetail = fokus;
      const ziel = `#/brain/${id}`;
      if (location.hash === ziel) { route(ziel); return; }
      location.hash = ziel;
    }
    async function detailZu() {
      if (!(await verlassenOk())) return;
      const id = z.auswahl;
      z.auswahl = "";
      z.blattGross = false;
      app.adresseSetzen(reiterHash(), { ersetzen: true });
      zeichnen();
      fokusNachDetail(id); // Liste: zurück auf die Zeile des Eintrags, Graph: in die Zeichenfläche
    }
    /** Bearbeiten beenden (Esc, „Abbrechen“, X) – bei ungespeicherten Änderungen erst nach der Rückfrage. Danach steht
        der Fokus auf dem Titel des Eintrags; war es ein neuer Eintrag ohne offenes Detail, wieder auf „Neu“. */
    async function bearbeitenBeenden() {
      if (!(await verlassenOk())) return;
      zeichnen();
      const titel = $("#brain-detail-titel");
      app.fokusSetzen(titel && !$("#brain-detail").hidden ? titel : $('.brain-werkzeuge [data-brain="neu"]'));
    }
    async function rueckgaengig() {
      const r = await z.brain.rueckgaengig();
      toast(r.ok ? `Rückgängig: ${r.name}.` : r.fehler.allgemein, r.ok ? {} : { art: "warn" });
    }
    async function wiederholen() {
      const r = await z.brain.wiederholen();
      toast(r.ok ? `Wiederholt: ${r.name}.` : r.fehler.allgemein, r.ok ? {} : { art: "warn" });
    }
    const fehlerText = (r) => (r && r.fehler ? Object.values(r.fehler)[0] : r && r.konflikt ? "Der Eintrag wurde inzwischen in einem anderen Fenster geändert." : "Das hat nicht geklappt.");

    function herunterladen(name, daten, typ) {
      const url = URL.createObjectURL(new Blob([daten], { type: typ }));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.className = "unsichtbar";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    function exportieren(art) {
      const datum = K.dateiDatum();
      if (art === "zip") herunterladen(`gabi-brain-${datum}.zip`, B.zipSchreiben(z.brain.exportDateien()), "application/zip");
      else herunterladen(`gabi-brain-${datum}.md`, z.brain.exportEineDatei(), "text/markdown;charset=utf-8");
      toast("Export ist heruntergeladen.", { art: "erfolg", dauer: 3000 });
    }

    function menueSchliessen(fokus = false) {
      const m = $("#brain-menue");
      if (!m || m.hidden) return;
      m.hidden = true;
      $("#brain-mehr").setAttribute("aria-expanded", "false");
      if (fokus) app.fokusSetzen($("#brain-mehr"));
    }

    /** „Nochmal versuchen“: neu laden. Der Knopf verschwindet dabei – der Fokus geht auf den gewählten Reiter (die Reiter
        stehen sofort da); scheitert es wieder, zurück auf den neuen Knopf. */
    function neuLaden() {
      z.laedt = null;
      z.fehler = "";
      z.fehlerText = "";
      z.fehlerKnopf = "";
      zeichnen();
      app.fokusSetzen(wurzel.querySelector('.brain-reiter-knopf[aria-selected="true"]'));
      bereit().then(() => abgeleitetAuffrischen(true)).catch(() => requestAnimationFrame(() => {
        const a = document.activeElement;
        if (!a || a === document.body || wurzel.contains(a)) app.fokusSetzen($('[data-brain="neu-laden"]'));
      }));
    }

    let wartenderTipp = null; // ein Tipp, während das Brain noch lädt (der letzte zählt)
    /** Lädt das Brain noch, geht ein Tipp auf Reiter, „Neu“, „Filter“ oder „Mehr“ nicht verloren: Er wirkt, sobald es da
        ist. Deshalb sehen die Knöpfe beim Laden aus wie immer (kein kurzes Ausgrauen). */
    function tippMerken(ziel) {
      const erster = !wartenderTipp;
      wartenderTipp = { brain: ziel.dataset.brain, wert: ziel.dataset.wert || "", id: ziel.dataset.id || "" };
      if (!erster) return;
      z.laedt.then(() => {
        const t = wartenderTipp;
        wartenderTipp = null;
        if (!t || !z.brain || wurzel.hidden) return;
        zeichnen(); // die Reiter können neu gebaut sein (Lücken-Zähler): das Element frisch suchen
        const knopf = [...wurzel.querySelectorAll(`[data-brain="${t.brain}"]`)].find((x) => (x.dataset.wert || "") === t.wert && (x.dataset.id || "") === t.id);
        if (knopf && !knopf.disabled) knopf.click();
      }, () => { wartenderTipp = null; });
    }
    async function klick(e) {
      const ziel = e.target.closest("[data-brain]");
      if (!ziel || !wurzel.contains(ziel) || !z.brain) {
        if (!ziel || !wurzel.contains(ziel)) return;
        if (ziel.dataset.brain === "neu-laden") neuLaden();
        else if (z.laedt && !z.fehler) tippMerken(ziel);
        return;
      }
      const aktion = ziel.dataset.brain;
      const wert = ziel.dataset.wert || "";
      // ein Menüpunkt: Menü zu und Fokus auf „Mehr“ – der Punkt selbst ist gleich versteckt; ein Dialog, der jetzt aufgeht
      // (Papierkorb, Tastenkürzel, Import), gibt den Fokus beim Schließen dorthin zurück
      if (aktion !== "mehr") menueSchliessen(Boolean(ziel.closest("#brain-menue")));
      const k = z.auswahl ? z.brain.hol(z.auswahl) : null;
      switch (aktion) {
        case "reiter": if (wert !== z.reiter && (await verlassenOk())) location.hash = `#/brain/${wert}`; break;
        case "suche-leer": $("#brain-suche").value = ""; z.suche = ""; suchen(); zeichnen(); $("#brain-suche").focus(); break;
        case "filter-auf": z.filterOffen = !z.filterOffen; zeichnen(); break;
        case "filter-art": case "filter-status": {
          const liste = aktion === "filter-art" ? z.filter.arten : z.filter.status;
          const i = liste.indexOf(wert);
          if (i >= 0) liste.splice(i, 1); else liste.push(wert);
          zeichnen();
          break;
        }
        case "filter-sonder": z.filter[wert] = !z.filter[wert]; zeichnen(); break;
        // der Knopf verschwindet mit den Filtern: Fokus auf „Filter“ (angesagt wird der neue Stand, siehe standZeichnen)
        case "filter-weg": z.filter = { arten: [], status: [], tag: "", zuKlaeren: false, veraltet: false, nieVerwendet: false, verwendet: false }; zeichnen(); app.fokusSetzen($("#brain-filter-knopf")); break;
        case "tag": z.filter.tag = wert; z.filterOffen = true; zeichnen(); break;
        case "kennzahl": {
          if (wert === "luecken") { location.hash = "#/brain/luecken"; break; }
          z.filter = { arten: [], status: [], tag: "", zuKlaeren: wert === "zuKlaeren", veraltet: wert === "veraltet", nieVerwendet: wert === "nieVerwendet", verwendet: false };
          z.filterOffen = wert !== "alle";
          if (z.reiter === "luecken" || z.reiter === "faehigkeiten") location.hash = `#/brain/${z.letzteHaupt}`;
          zeichnen();
          break;
        }
        case "zoom": if (z.graph) z.graph.zoomen(wert === "rein" ? 1.3 : 1 / 1.3); break;
        case "einpassen": if (z.graph) z.graph.einpassen({ verdeckt: verdeckt() }); break;
        case "anordnen": neuAnordnen(); break;
        case "loesen": if (z.graph && k) { z.graph.fixieren(k.id, false); ansage(`${k.titel} ist wieder frei.`); detailZeichnen(); const f = $("#brain-detail [data-brain='fokus-an']"); if (f) f.focus(); } break;
        case "fokus-an": if (k) { z.fokus = { id: k.id, tiefe: (z.fokus && z.fokus.id === k.id ? z.fokus.tiefe : 1) }; hauptSetzen("graph"); zeichnen(); } break;
        case "fokus-tiefe": if (z.fokus) { z.fokus.tiefe = Number(wert) || 1; zeichnen(); } break;
        case "fokus-aus": z.fokus = null; zeichnen(); if (z.graph) z.graph.einpassen({ verdeckt: verdeckt() }); break;
        case "im-graph": hauptSetzen("graph"); zeichnen(); if (z.graph && k) z.graph.zentrieren(k.id); break;
        case "detail-zu": detailZu(); break;
        case "blatt": z.blattGross = !z.blattGross; zeichnen(); break;
        case "neu": if (await verlassenOk()) bearbeitenStarten(null); break;
        case "bearbeiten": if (k && !k.geschuetzt) bearbeitenStarten(k); break;
        case "bearbeiten-abbrechen": bearbeitenBeenden(); break;
        case "vorschau": {
          const b = z.bearbeitung;
          if (!b) break;
          z.vorschau = !z.vorschau;
          const feld = wurzel.querySelector("#brain-inhalt");
          const v = wurzel.querySelector("#brain-vorschau");
          feld.hidden = z.vorschau;
          v.hidden = !z.vorschau;
          if (z.vorschau) v.innerHTML = B.markdownHtml(b.felder.inhalt, { aufloesen: z.brain.aufloesen }) || '<p class="stumm">Noch kein Inhalt.</p>';
          ziel.setAttribute("aria-pressed", String(z.vorschau));
          break;
        }
        case "vorschlag": { const feld = wurzel.querySelector("#brain-inhalt"); if (feld) vorschlagNehmen(feld, wert); break; }
        case "konflikt-meine": if (z.bearbeitung) { z.bearbeitung.konflikt = false; speichern({ erzwingen: true }); } break;
        case "korb-meine": if (z.bearbeitung) speichern({ ausKorb: true }); break;
        case "konflikt-andere": bearbeitungEnde(); zeichnen(); break;
        case "status": if (k && wert !== k.status) { const r = await z.brain.statusSetzen(k.id, wert); if (!r.ok) toast(fehlerText(r), { art: "warn", dauer: 6000 }); else toast(`Status: ${statusName(wert)}.`, { art: "erfolg", dauer: 3000, aktion: { text: "Rückgängig", tun: rueckgaengig } }); } break;
        case "loeschen": {
          if (!k || k.geschuetzt) break;
          if (!(await frage("Eintrag löschen?", `„${k.titel}“ kommt in den Papierkorb und lässt sich 30 Tage lang wiederherstellen.`, { ja: "Löschen", gefahr: true }))) break;
          const platz = zeilenPlatz(k.id);
          const r = await z.brain.loeschen(k.id);
          if (!r.ok) { toast(fehlerText(r), { art: "warn" }); break; }
          z.auswahl = "";
          app.adresseSetzen(reiterHash(), { ersetzen: true });
          zeichnen();
          fokusNachDetail("", platz); // Liste: die Zeile, die jetzt an seiner Stelle steht – Graph: die Zeichenfläche
          toast("In den Papierkorb gelegt.", { aktion: { text: "Rückgängig", tun: rueckgaengig } });
          break;
        }
        case "fehlend": if (await verlassenOk()) bearbeitenStarten(null, { felder: { titel: wert }, geaendert: true }); break;
        case "kante-weg": {
          const zeile = ziel.closest("li");
          const platz = zeile ? [...zeile.parentNode.children].indexOf(zeile) : 0;
          const name = zeile && zeile.querySelector("a") ? zeile.querySelector("a").textContent : "";
          const r = await z.brain.kanteLoeschen(ziel.dataset.id);
          if (!r.ok) { toast(fehlerText(r), { art: "warn" }); break; }
          // die Zeile ist weg: Fokus auf die Verbindung, die jetzt an ihrer Stelle steht (ihr Link, nicht ihr „Entfernen“ –
          // ein zweites Enter soll nicht noch eine löschen); gibt es keine mehr, ins Feld (Touch: auf den Titel)
          zeichnenMitFokus((d) => {
            const rest = [...d.querySelectorAll(".brain-verbindungen a")];
            return rest[Math.min(platz, rest.length - 1)] || d.querySelector(grob.matches ? "#brain-detail-titel" : "#brain-kante-ziel");
          });
          melden(`Verbindung zu „${name}“ entfernt.`);
          break;
        }
        case "notiz-laden": if (k && k.ref) notizLaden(k.ref.id); break;
        case "version-zeigen": z.versionOffen = z.versionOffen === Number(wert) ? 0 : Number(wert); { const v = wurzel.querySelector("#brain-verlauf-inhalt"); if (v && k) mitFokus(v, verlaufHtml(k)); } break;
        case "version-holen": {
          if (!k) break;
          if (!(await frage("Diese Fassung wiederherstellen?", "Die heutige Fassung bleibt im Versionsverlauf erhalten.", { ja: "Wiederherstellen" }))) break;
          const r = await z.brain.versionWiederherstellen(k.id, Number(wert));
          if (!r.ok) toast(fehlerText(r), { art: "warn" });
          else {
            toast("Fassung wiederhergestellt.", { art: "erfolg", aktion: { text: "Rückgängig", tun: rueckgaengig } });
            // das Detail wird neu gebaut: Fokus und Leseposition bleiben bei dieser Fassung
            zeichnenMitFokus((d) => d.querySelector(`[data-brain="version-holen"][data-wert="${Number(wert)}"]`));
            verlaufLaden(k.id);
          }
          break;
        }
        case "luecke-eintragen": { const r = await z.brain.lueckeEintragen(ziel.dataset.id); if (!r.ok) toast(fehlerText(r), { art: "warn" }); else { z.reiter = z.letzteHaupt; oeffnen(r.knoten.id, { fokus: true }); toast("Als „zu klären“ eingetragen.", { art: "erfolg" }); } break; }
        case "luecke-verwerfen": {
          const karte = ziel.closest("li");
          const platz = karte ? [...karte.parentNode.children].indexOf(karte) : 0;
          await z.brain.lueckeVerwerfen(ziel.dataset.id);
          zeichnen();
          const rest = [...wurzel.querySelectorAll("#brain-luecken .brain-luecke")];
          if (rest.some((x) => x.querySelector(`[data-id="${CSS.escape(ziel.dataset.id)}"]`))) break; // nicht verworfen (Speicher): alles bleibt, wo es ist
          // die Karte ist weg: Fokus auf die Karte, die jetzt an ihrer Stelle steht (nicht auf ihr „Verwerfen“ – ein zweites
          // Enter soll nicht noch eine verwerfen); war es die letzte, auf den Reiter
          app.fokusSetzen(rest[Math.min(platz, rest.length - 1)] || wurzel.querySelector('.brain-reiter-knopf[aria-selected="true"]'));
          melden(rest.length ? `Lücke verworfen. Noch ${rest.length} offen.` : "Lücke verworfen. Keine offenen Lücken mehr.");
          break;
        }
        case "audit-leeren": if (await frage("Verlauf löschen?", "Die Liste „Zuletzt genutzt“ wird auf diesem Gerät geleert.", { ja: "Löschen", gefahr: true })) await z.brain.auditLeeren(); break;
        case "mehr": { const m = $("#brain-menue"); m.hidden = !m.hidden; ziel.setAttribute("aria-expanded", String(!m.hidden)); if (!m.hidden) { const erster = m.querySelector("button:not(:disabled)"); if (erster) erster.focus(); } break; }
        case "interview": app.interviewStarten(); break;
        case "rueckgaengig": rueckgaengig(); break;
        case "wiederholen": wiederholen(); break;
        case "import": $("#brain-datei").click(); break;
        case "export-zip": exportieren("zip"); break;
        case "export-datei": exportieren("datei"); break;
        case "physik": {
          const an = lokal.lesen("brain.physik") === false;
          lokal.schreiben("brain.physik", an);
          toast(an ? "Physik an: Beim Ziehen federn die Nachbarn mit." : "Physik aus: Beim Ziehen bewegt sich nur der Knoten.");
          if (z.brain) leisteZeichnen(); // Menütext nachziehen
          break;
        }
        case "papierkorb": papierkorbZeigen(); break;
        case "tasten": tastenZeigen(); break;
        default: break;
      }
    }

    async function notizLaden(id) {
      if (z.notizInhalt.get(id)) return;
      z.notizInhalt.set(id, null);
      zeichnen();
      try {
        const d = await app.api(`/api/notizen/${id}`);
        z.notizInhalt.set(id, (d && d.notiz) || { fehler: "Notiz nicht gefunden." });
      } catch (f) {
        z.notizInhalt.set(id, { fehler: (f && f.message) || "Die Notiz ließ sich nicht laden." });
      }
      zeichnen();
    }

    // ==========================================================
    // 9 Dialoge: Befehlspalette, Import, Papierkorb, Tastenkürzel
    // ==========================================================
    const dialoge = {};
    function dialog(name, klasse, titelId) {
      if (dialoge[name]) return dialoge[name];
      const d = document.createElement("dialog");
      d.className = `dialog ${klasse}`;
      d.setAttribute("aria-labelledby", titelId);
      document.body.append(d);
      app.dialogAnmelden(d);
      d.addEventListener("click", (e) => { if (e.target === d) d.close(); }); // Tipp neben den Dialog schließt
      // Fokus nach dem Schließen zurück auf das gemerkte Element (siehe dialogAuf) – nur wenn er sonst verloren wäre und
      // kein anderer Dialog offen ist (der Papierkorb schließt kurz für seine Rückfrage)
      d.addEventListener("close", () => setTimeout(() => {
        const a = document.activeElement;
        const k = d.zurueck;
        if (k && k.isConnected && !k.closest("[hidden]") && !document.querySelector("dialog[open]") && (!a || a === document.body || a.closest("dialog:not([open])"))) app.fokusSetzen(k);
      }, 0));
      dialoge[name] = d;
      return d;
    }
    /** Dialog öffnen und merken, wohin der Fokus beim Schließen zurückgeht (aus dem Menü: auf „Mehr“). Das merkt sich
        nicht der Dialog selbst – Safari gäbe den Fokus nach Tippen oder Klicken mit Ring zurück –, gesetzt wird er oben
        über app.fokusSetzen (nach Tippen ohne Ring, per Tastatur mit). */
    function dialogAuf(d) {
      const a = document.activeElement;
      d.zurueck = a && a !== document.body && !a.closest("dialog") ? a : null;
      if (d.zurueck) d.zurueck.blur();
      d.showModal();
    }

    // ---------- Befehlspalette (Cmd/Strg+K) ----------
    let paletteAktiv = 0;
    let paletteListe = [];
    function befehle() {
      return [
        { name: "Neuer Eintrag", sym: "plus", tun: () => bearbeitenStarten(null) },
        { name: "Ansicht: Graph", sym: "graph", tun: () => { location.hash = "#/brain/graph"; } },
        { name: "Ansicht: Liste", sym: "liste", tun: () => { location.hash = "#/brain/liste"; } },
        { name: "Graph neu anordnen", sym: "anordnen", tun: () => { if (z.reiter !== "graph") location.hash = "#/brain/graph"; setTimeout(neuAnordnen, 0); } },
        { name: "Ansicht: Wissenslücken", sym: "frage", tun: () => { location.hash = "#/brain/luecken"; } },
        { name: "Ansicht: Fähigkeiten", sym: "funke", tun: () => { location.hash = "#/brain/faehigkeiten"; } },
        { name: "Zu klären anzeigen", sym: "warn", tun: () => { z.filter = { arten: [], status: [], tag: "", zuKlaeren: true, veraltet: false, nieVerwendet: false, verwendet: false }; z.filterOffen = true; if (location.hash === "#/brain/liste") { z.auswahl = ""; zeichnenBald(); } else location.hash = "#/brain/liste"; } },
        { name: "Brain füllen (Interview)", sym: "funke", tun: () => app.interviewStarten() },
        { name: "Exportieren (ZIP)", sym: "pdf", tun: () => exportieren("zip") },
        { name: "Importieren …", sym: "hoch", tun: () => $("#brain-datei").click() },
        { name: "Papierkorb", sym: "muell", tun: () => papierkorbZeigen() },
        { name: "Rückgängig", sym: "zuruecksetzen", tun: rueckgaengig },
        { name: "Wiederholen", sym: "wiederholen", tun: wiederholen },
      ];
    }
    function paletteZeigen() {
      if (!z.brain) return;
      const d = dialog("palette", "brain-palette", "brain-palette-titel");
      d.innerHTML = `
        <div class="brain-palette-innen">
          <h2 id="brain-palette-titel" class="unsichtbar">Befehle und Einträge</h2>
          <div class="suche">${symbol("suche")}<input type="search" id="brain-palette-feld" placeholder="Eintrag finden oder Befehl …" aria-label="Eintrag finden oder Befehl" role="combobox" aria-expanded="true" aria-controls="brain-palette-liste" aria-autocomplete="list" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="120"></div>
          <div class="brain-palette-liste" id="brain-palette-liste" role="listbox" aria-label="Ergebnisse"></div>
          <p class="brain-klein stumm brain-palette-fuss">↑ ↓ wählen · Enter öffnen · Esc schließen</p>
        </div>`;
      const feld = d.querySelector("#brain-palette-feld");
      const liste = d.querySelector("#brain-palette-liste");
      const fuellen = () => {
        const q = feld.value.trim();
        const qn = S.normal(q);
        const b = befehle().filter((x) => !qn || S.normal(x.name).includes(qn)).map((x) => ({ ...x, art: "befehl" }));
        const kn = (q ? z.brain.suchen(q, { limit: 8 }).map((t) => z.brain.hol(t.id)).filter(Boolean) : []).map((k) => ({ name: k.titel, knoten: k, art: "knoten", tun: () => oeffnen(k.id, { fokus: true }) }));
        // ein Befehl, dessen Name so beginnt wie getippt, steht vor den Einträgen („zu klären“ → „Zu klären anzeigen“)
        const vorn = qn ? b.filter((x) => S.normal(x.name).startsWith(qn)) : [];
        paletteListe = [...vorn, ...kn, ...b.filter((x) => !vorn.includes(x))].slice(0, 14);
        paletteAktiv = Math.min(paletteAktiv, Math.max(0, paletteListe.length - 1));
        liste.innerHTML = paletteListe.length ? paletteListe.map((x, i) => `<button class="brain-palette-punkt" type="button" role="option" id="brain-palette-${i}" data-palette="${i}" aria-selected="${i === paletteAktiv}">${x.art === "knoten" ? `<span class="brain-punkt" data-art="${esc(x.knoten.art)}"></span>` : symbol(x.sym)}<span>${esc(x.name)}</span><span class="stumm">${x.art === "knoten" ? esc(artName(x.knoten.art)) : "Befehl"}</span></button>`).join("") : '<p class="stumm brain-palette-leer">Nichts gefunden.</p>';
        feld.setAttribute("aria-activedescendant", paletteListe.length ? `brain-palette-${paletteAktiv}` : "");
      };
      const nehmen = async (i) => {
        const x = paletteListe[i];
        if (!x) return;
        d.close();
        if (await verlassenOk()) x.tun();
      };
      feld.addEventListener("input", () => { paletteAktiv = 0; fuellen(); });
      feld.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (!paletteListe.length) return;
          paletteAktiv = (paletteAktiv + (e.key === "ArrowDown" ? 1 : paletteListe.length - 1)) % paletteListe.length;
          fuellen();
          const a = liste.querySelector('[aria-selected="true"]');
          if (a) a.scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter") { e.preventDefault(); nehmen(paletteAktiv); }
      });
      liste.addEventListener("click", (e) => { const p = e.target.closest("[data-palette]"); if (p) nehmen(Number(p.dataset.palette)); });
      paletteAktiv = 0;
      fuellen();
      if (!d.open) d.showModal();
      feld.focus();
    }

    // ---------- Import mit Vorschau ----------
    async function importStarten(dateien) {
      let gelesen = [];
      const fehler = [];
      for (const datei of dateien.slice(0, 600)) {
        try {
          if (datei.size > 4000000) { fehler.push({ datei: datei.name, text: "Die Datei ist zu groß (höchstens 4 MB)." }); continue; }
          if (/\.zip$/i.test(datei.name)) gelesen.push(...(await B.zipLesen(new Uint8Array(await datei.arrayBuffer()))));
          else gelesen.push({ name: datei.name, text: await datei.text() });
        } catch (f) {
          fehler.push({ datei: datei.name, text: (f && f.message) || "Die Datei ließ sich nicht lesen." });
        }
      }
      const r = B.importLesen(gelesen);
      gelesen = null;
      fehler.push(...r.fehler);
      const vergleich = B.importVergleichen([...z.brain.eigene(), ...z.brain.papierkorb().map((p) => p.knoten)], r.knoten, { kanten: z.brain.kanten() });
      importZeigen(vergleich, fehler);
    }
    function importZeigen(vergleich, fehler) {
      const d = dialog("import", "brain-import", "brain-import-titel");
      const zahl = (art) => vergleich.filter((v) => v.art === art).length;
      const FELD = { titel: "Titel", art: "Art", status: "Status", tags: "Tags", quelle: "Quelle", inhalt: "Inhalt" };
      const zeile = (v, i) => {
        const wahl = v.art === "neu" || v.art === "geaendert";
        const marke = { neu: ["Neu", "akzent"], geaendert: ["Geändert", "warn"], gleich: ["Unverändert", ""], ungueltig: ["Nicht möglich", ""] }[v.art];
        // Verbindungen von Hand aus der Datei, die es hier noch nicht gibt – sie entstehen mit dem Übernehmen
        const kanten = v.verbindungen || [];
        const verbunden = kanten.length ? `<div class="brain-diff-feld"><span class="augenbraue">${kanten.length === 1 ? "Neue Verbindung" : "Neue Verbindungen"}</span><div class="brain-diff-neu">${esc(kanten.map((x) => `${KANTE_NAME[x.art] || x.art} → ${x.titel}`).join("\n"))}</div></div>` : "";
        const diff = v.art === "geaendert" ? `<details class="brain-diff"><summary>Was sich ändert (${[...v.felder.map((f) => FELD[f]), ...(kanten.length ? ["Verbindungen"] : [])].join(", ") || "aus dem Papierkorb zurück"})</summary>${v.felder.map((f) => `<div class="brain-diff-feld"><span class="augenbraue">${FELD[f]}</span><div class="brain-diff-paar"><div class="brain-diff-alt"><span class="unsichtbar">Vorher: </span>${esc(f === "tags" ? (v.alt.tags || []).join(", ") : f === "status" ? statusName(v.alt.status) : f === "art" ? artName(v.alt.art) : String(v.alt[f] || "")) || "–"}</div><div class="brain-diff-neu"><span class="unsichtbar">Nachher: </span>${esc(f === "tags" ? (v.knoten.tags || []).join(", ") : f === "status" ? statusName(v.knoten.status) : f === "art" ? artName(v.knoten.art) : String(v.knoten[f] || "")) || "–"}</div></div></div>`).join("")}${verbunden}</details>`
          : v.art === "neu" ? `<details class="brain-diff"><summary>${kanten.length ? `Inhalt und ${kanten.length === 1 ? "1 Verbindung" : `${kanten.length} Verbindungen`} ansehen` : "Inhalt ansehen"}</summary><div class="brain-diff-neu einzeln">${esc(v.knoten.inhalt) || "–"}</div>${verbunden}</details>` : "";
        return `<li class="brain-import-zeile">
          <label class="brain-import-kopf"><input type="checkbox" data-import="${i}"${wahl ? " checked" : " disabled"}><span class="brain-import-titel"><strong>${esc(v.knoten.titel || "(ohne Titel)")}</strong><span class="stumm">${esc(artName(v.knoten.art))} · ${esc(statusName(v.knoten.status))}${v.fehler ? ` · ${esc(v.fehler)}` : ""}</span></span><span class="badge ${marke[1]}">${marke[0]}</span></label>
          ${diff}
        </li>`;
      };
      const mitNr = vergleich.map((v, i) => [v, i]);
      const rang = { neu: 0, geaendert: 1, ungueltig: 2 };
      const wichtig = mitNr.filter(([v]) => v.art !== "gleich").sort((a, b) => rang[a[0].art] - rang[b[0].art]);
      const gleich = mitNr.filter(([v]) => v.art === "gleich");
      d.innerHTML = `
        <form class="dialog-form" method="dialog">
          <h2 id="brain-import-titel">Import prüfen</h2>
          <p>${vergleich.length ? `${zahl("neu")} neu · ${zahl("geaendert")} geändert · ${zahl("gleich")} unverändert${zahl("ungueltig") ? ` · ${zahl("ungueltig")} nicht möglich` : ""}. Übernommen wird erst nach deinem Tipp. Regeln und Persona kommen immer als Entwurf an.` : "In den Dateien steht nichts, was sich übernehmen lässt."}</p>
          ${fehler.length ? `<div class="hinweis-box warn"><div class="hinweis-box-kopf">${symbol("warn")}<span>${fehler.length === 1 ? "Ein Hinweis" : `${fehler.length} Hinweise`}</span></div><ul class="brain-import-fehler">${fehler.slice(0, 8).map((f) => `<li>${f.datei ? `<strong>${esc(f.datei)}:</strong> ` : ""}${esc(f.text)}</li>`).join("")}</ul></div>` : ""}
          ${wichtig.length ? `<ul class="brain-import-liste">${wichtig.map(([v, i]) => zeile(v, i)).join("")}</ul>` : ""}
          ${gleich.length ? `<details class="brain-diff brain-import-gleich"><summary>${gleich.length === 1 ? "1 unveränderter Eintrag" : `${gleich.length} unveränderte Einträge`}</summary><ul class="brain-import-liste">${gleich.map(([v, i]) => zeile(v, i)).join("")}</ul></details>` : ""}
          <div class="dialog-knoepfe"><button class="knopf leise" value="nein">Abbrechen</button><button class="knopf primaer" value="ja" id="brain-import-ja"${vergleich.some((v) => v.art === "neu" || v.art === "geaendert") ? "" : " disabled"}>Übernehmen</button></div>
        </form>`;
      const ja = d.querySelector("#brain-import-ja");
      const gewaehlt = () => [...d.querySelectorAll("[data-import]:checked")].map((c) => vergleich[Number(c.dataset.import)]);
      const zaehlen = () => { const n = gewaehlt().length; ja.disabled = !n; ja.textContent = n ? `Übernehmen (${n})` : "Übernehmen"; };
      d.addEventListener("change", zaehlen);
      zaehlen();
      d.returnValue = "";
      d.addEventListener("close", async () => {
        if (d.returnValue !== "ja") return;
        const auswahl = gewaehlt();
        if (!auswahl.length) return;
        const r = await z.brain.importieren(auswahl);
        const n = r.neu + r.geaendert;
        const kanten = r.verbindungen || 0;
        toast(`${n === 1 ? "1 Eintrag" : `${n} Einträge`}${kanten ? ` und ${kanten === 1 ? "1 Verbindung" : `${kanten} Verbindungen`}` : ""} übernommen${r.fehler.length ? ` · ${r.fehler.length} nicht` : ""}.`, { art: r.fehler.length ? "warn" : "erfolg", dauer: 6000, ...(n ? { aktion: { text: "Rückgängig", tun: rueckgaengig } } : {}) });
      }, { once: true });
      dialogAuf(d);
    }

    // ---------- Papierkorb ----------
    function papierkorbZeigen() {
      const d = dialog("papierkorb", "brain-papierkorb", "brain-papierkorb-titel");
      const fuellen = () => {
        const liste = z.brain.papierkorb();
        d.innerHTML = `
          <div class="dialog-form">
            <h2 id="brain-papierkorb-titel">Papierkorb</h2>
            <p>${liste.length ? "Gelöschte Einträge bleiben 30 Tage hier, dann sind sie endgültig weg." : "Der Papierkorb ist leer."}</p>
            ${liste.length ? `<ul class="brain-papierkorb-liste">${liste.map((p) => `<li><span class="brain-import-titel"><strong>${esc(p.knoten.titel)}</strong><span class="stumm">${esc(artName(p.knoten.art))} · noch ${p.tageRest === 1 ? "1 Tag" : `${p.tageRest} Tage`}</span></span><span class="brain-version-knoepfe"><button class="knopf sekundaer klein" type="button" data-korb="holen" data-id="${esc(p.knoten.id)}">Wiederherstellen</button><button class="rund-knopf klein" type="button" data-korb="weg" data-id="${esc(p.knoten.id)}" aria-label="„${esc(p.knoten.titel)}“ endgültig löschen">${symbol("muell", "klein")}</button></span></li>`).join("")}</ul>` : ""}
            <div class="dialog-knoepfe">${liste.length ? '<button class="knopf gefahr" type="button" data-korb="leeren">Papierkorb leeren</button>' : ""}<button class="knopf primaer" type="button" data-korb="zu">Fertig</button></div>
          </div>`;
      };
      if (!d.dataset.bereit) {
        d.dataset.bereit = "1";
        d.addEventListener("click", async (e) => {
          const k = e.target.closest("[data-korb]");
          if (!k) return;
          const id = k.dataset.id;
          if (k.dataset.korb === "zu") { d.close(); return; }
          if (k.dataset.korb === "holen") { const r = await z.brain.wiederherstellen(id); toast(r.ok ? `„${r.knoten.titel}“ ist wieder da.` : fehlerText(r), { art: r.ok ? "erfolg" : "warn" }); }
          if (k.dataset.korb === "weg" || k.dataset.korb === "leeren") {
            // die Rückfrage ist ein eigener Dialog: erst diesen schließen, danach wieder zeigen
            d.close();
            const alle = k.dataset.korb === "leeren";
            const ok = await frage(alle ? "Papierkorb leeren?" : "Endgültig löschen?", alle ? "Alle Einträge im Papierkorb werden endgültig gelöscht. Das lässt sich nicht rückgängig machen." : "Dieser Eintrag wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.", { ja: "Endgültig löschen", gefahr: true });
            if (!z.brain) return; // während der Rückfrage in einem anderen Fenster gelöscht: nichts mehr zu zeigen
            if (ok) { const r = alle ? await z.brain.papierkorbLeeren() : await z.brain.endgueltigLoeschen(id); if (!r.ok) toast(fehlerText(r), { art: "warn" }); }
            fuellen();
            d.showModal();
            return;
          }
          fuellen();
        });
      }
      fuellen();
      dialogAuf(d);
    }

    function tastenZeigen() {
      const d = dialog("tasten", "brain-tasten", "brain-tasten-titel");
      const mac = /Mac|iPhone|iPad/.test(navigator.platform || "");
      const k = (t) => `<kbd>${t}</kbd>`;
      d.innerHTML = `
        <form class="dialog-form" method="dialog">
          <h2 id="brain-tasten-titel">Tastenkürzel im Brain</h2>
          <dl class="brain-tasten-liste">
            <div><dt>${k("/")}</dt><dd>Suche</dd></div>
            <div><dt>${k(mac ? "⌘" : "Strg")} ${k("K")}</dt><dd>Befehle und Einträge finden</dd></div>
            <div><dt>${k("←")} ${k("↑")} ${k("→")} ${k("↓")}</dt><dd>Im Graph zum Nachbarn springen</dd></div>
            <div><dt>${k("Enter")}</dt><dd>Details öffnen</dd></div>
            <div><dt>${k("+")} ${k("−")} ${k("0")}</dt><dd>Zoomen, alles zeigen</dd></div>
            <div><dt>${k("⇧")} + Pfeile</dt><dd>Graph verschieben</dd></div>
            <div><dt>${k(mac ? "⌘" : "Strg")} ${k("Z")}</dt><dd>Rückgängig (mit ${k("⇧")}: Wiederholen)</dd></div>
            <div><dt>${k("Esc")}</dt><dd>Schließen, Fokus beenden</dd></div>
          </dl>
          <div class="dialog-knoepfe"><button class="knopf primaer" value="ok">Verstanden</button></div>
        </form>`;
      dialogAuf(d);
    }

    // ==========================================================
    // 10 Ereignisse
    // ==========================================================
    wurzel.addEventListener("click", klick);
    wurzel.addEventListener("change", (e) => {
      const wahl = e.target.dataset && e.target.dataset.brainWahl;
      if (!wahl) return;
      if (wahl === "tag") z.filter.tag = e.target.value;
      else { z[wahl] = e.target.value; lokal.schreiben("brain.ansicht", { reiter: z.letzteHaupt, sortierung: z.sortierung, gruppierung: z.gruppierung }); }
      zeichnen();
    });
    wurzel.addEventListener("submit", async (e) => {
      const art = e.target.dataset && e.target.dataset.brainForm;
      if (!art) return;
      e.preventDefault();
      if (art === "knoten") { speichern(); return; }
      if (art === "kante" && z.auswahl) {
        const titel = e.target.elements.ziel.value.trim();
        const ziel = titel ? z.brain.findeTitel(titel) : null;
        if (!ziel) { toast(titel ? `„${titel}“ gibt es im Brain nicht.` : "Bitte einen Eintrag wählen.", { art: "warn" }); e.target.elements.ziel.focus(); return; }
        const r = await z.brain.kanteAnlegen(z.auswahl, ziel.id, e.target.elements.art.value);
        if (!r.ok) { toast(fehlerText(r), { art: "warn" }); return; }
        // das Formular wird neu gebaut: Fokus zurück ins (jetzt leere) Feld für die nächste Verbindung – am Touch-Gerät
        // auf die neue Zeile (das Feld klappte die Tastatur auf). Die Leseposition bleibt, angesagt wird ohne Toast.
        zeichnenMitFokus((d) => d.querySelector(grob.matches ? `.brain-verbindungen a[href="#/brain/${CSS.escape(ziel.id)}"]` : "#brain-kante-ziel") || d.querySelector("#brain-detail-titel"));
        melden(`Mit „${ziel.titel}“ verbunden.`);
      }
    });
    // Liste: eine Zeile aktivieren (Klick, Enter, Screenreader – alle lösen click aus) nimmt den Fokus mit ins Detail,
    // auf den Titel – wie Enter im Graphen. Sonst läge das Detail hinter der ganzen Liste (53 Tab-Schritte).
    wurzel.addEventListener("click", (e) => {
      const zeile = e.target instanceof Element ? e.target.closest("#brain-liste a.brain-zeile") : null;
      if (!zeile || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // neuer Tab oder neues Fenster: hier ändert sich nichts
      if (zeile.getAttribute("href") !== location.hash) { z.fokusAufDetail = true; return; }
      // dieser Eintrag ist schon offen: die Adresse ändert sich nicht, es wird nicht neu gezeichnet – gleich hin
      const titel = $("#brain-detail-titel");
      if (titel && !$("#brain-detail").hidden && !z.bearbeitung) app.fokusSetzen(titel);
    }, true);
    // Quellen-Chips im Gespräch: die genutzten Knoten leuchten gleich im Graph auf
    document.addEventListener("click", (e) => {
      const chip = e.target.closest && e.target.closest("[data-brain-quellen]");
      if (chip) { z.leuchten = String(chip.dataset.brainQuellen || "").split(",").filter(Boolean); hauptSetzen("graph"); z.fokusAufDetail = true; }
      const m = $("#brain-menue");
      if (m && !m.hidden && !e.target.closest(".brain-mehr")) menueSchliessen();
    }, true);
    document.addEventListener("keydown", (e) => {
      if (wurzel.hidden || !z.brain) return;
      const offenerDialog = document.querySelector("dialog[open]");
      const tippt = e.target instanceof Element && e.target.matches("input, textarea, select, [contenteditable]");
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        if (offenerDialog && offenerDialog !== dialoge.palette) return;
        e.preventDefault();
        if (dialoge.palette && dialoge.palette.open) dialoge.palette.close(); else paletteZeigen();
        return;
      }
      if (offenerDialog) return;
      const m = $("#brain-menue");
      if (m && !m.hidden) {
        const punkte = [...m.querySelectorAll("button:not(:disabled)")];
        const i = punkte.indexOf(document.activeElement);
        if (e.key === "Escape") { e.preventDefault(); menueSchliessen(true); return; }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = punkte[(i + (e.key === "ArrowDown" ? 1 : punkte.length - 1)) % punkte.length]; if (n) n.focus(); return; }
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "z" && !tippt) { e.preventDefault(); if (e.shiftKey) wiederholen(); else rueckgaengig(); return; }
      if (e.key === "/" && !tippt && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const feld = $("#brain-suche");
        if (feld && !feld.disabled) { e.preventDefault(); feld.focus(); feld.select(); }
        return;
      }
      if (e.key === "Escape" && !e.defaultPrevented) {
        // preventDefault: Derselbe Tastendruck schlösse die Rückfrage „Änderungen verwerfen?“ sonst gleich wieder (Esc gilt
        // dem Browser als „Dialog abbrechen“) – nur hier, wo wirklich bearbeitet wird
        if (z.bearbeitung) { e.preventDefault(); bearbeitenBeenden(); return; }
        if (z.fokus) { z.fokus = null; zeichnen(); if (z.graph) z.graph.einpassen({ verdeckt: verdeckt() }); return; }
        if (!$("#brain-detail").hidden) { detailZu(); return; }
      }
      // Reiter mit den Pfeiltasten (Tablist)
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && e.target instanceof Element && e.target.matches(".brain-reiter-knopf")) {
        const liste = [...wurzel.querySelectorAll(".brain-reiter-knopf")];
        const n = liste[(liste.indexOf(e.target) + (e.key === "ArrowRight" ? 1 : liste.length - 1)) % liste.length];
        if (n) { e.preventDefault(); n.focus(); n.click(); }
      }
      // Status als Radiogruppe
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "ArrowUp") && e.target instanceof Element && e.target.matches(".brain-status button")) {
        const liste = [...wurzel.querySelectorAll(".brain-status button")];
        const vor = e.key === "ArrowRight" || e.key === "ArrowDown";
        const n = liste[(liste.indexOf(e.target) + (vor ? 1 : liste.length - 1)) % liste.length];
        if (n) { e.preventDefault(); n.focus(); n.click(); }
      }
    });
    if (schmal.addEventListener) schmal.addEventListener("change", () => zeichnenBald());
    const dunkel = window.matchMedia("(prefers-color-scheme: dark)");
    const farbwechsel = () => { if (z.graph) z.graph.farbenNeu(); };
    if (dunkel.addEventListener) dunkel.addEventListener("change", farbwechsel);

    // ==========================================================
    // 11 Für app.js: Adresse, Zeigen, Abmelden
    // ==========================================================
    /** Graph oder Liste als Hauptansicht wählen und merken (#/brain öffnet die zuletzt genutzte). */
    function hauptSetzen(reiter) {
      z.reiter = reiter;
      if (z.letzteHaupt === reiter) return;
      z.letzteHaupt = reiter;
      lokal.schreiben("brain.ansicht", { reiter, sortierung: z.sortierung, gruppierung: z.gruppierung });
    }
    /** #/brain (zuletzt genutzte Hauptansicht) · #/brain/graph · /liste · /luecken · /faehigkeiten · #/brain/<id> */
    function route(hash) {
      let teil = "";
      try { teil = decodeURIComponent(String(hash || "").split("/")[2] || "").trim(); } catch { teil = ""; }
      if (REITER.some(([r]) => r === teil)) { z.auswahl = ""; if (teil === "graph" || teil === "liste") hauptSetzen(teil); else z.reiter = teil; } else if (teil && B.ID_MUSTER.test(teil)) {
        z.auswahl = teil;
        if (z.reiter !== "graph" && z.reiter !== "liste") z.reiter = z.letzteHaupt;
      } else { z.auswahl = ""; z.reiter = z.letzteHaupt; }
      z.verlaufVon = ""; z.verlauf = null; z.versionOffen = 0;
      if (z.brain && z.auswahl && !z.brain.hol(z.auswahl)) {
        // Abgeleitete Knoten (Notizen, Patienten) kommen erst nach dem Auffrischen – einmal nachsehen, bevor es „gibt es nicht“ heißt
        const id = z.auswahl;
        abgeleitetAuffrischen(true).then(() => {
          if (z.auswahl !== id || !z.brain || z.brain.hol(id)) { zeichnenBald(); return; }
          z.auswahl = "";
          toast("Diesen Eintrag gibt es im Brain nicht (mehr).", { art: "warn" });
          app.adresseSetzen(reiterHash(), { ersetzen: true });
          zeichnenBald();
        });
      }
      if (!wurzel.hidden) zeichnen();
    }
    /** Die Ansicht wird sichtbar. */
    function zeigen() {
      bereit().then(() => abgeleitetAuffrischen()).catch(() => {});
      zeichnen();
    }
    function verstecken() {
      if (z.graph) z.graph.aktiv(false);
      menueSchliessen();
    }
    /** Abmelden: Ablage schließen; mit loeschen alles Brain-Wissen dieses Geräts entfernen (echt und Demo). */
    async function abmelden({ loeschen = false } = {}) {
      schliessen();
      z.demo = null;
      z.gebaut = false;
      wurzel.innerHTML = "";
      if (!loeschen) return true;
      const ergebnisse = await Promise.all([SP.resteLoeschen({ demo: false }), SP.resteLoeschen({ demo: true })].map((p) => p.catch(() => false)));
      // offene Fenster beider Betriebsarten: gelöscht ist das echte Brain UND das Demo-Brain (siehe geleertAnderswo)
      for (const demo of [false, true]) {
        const kanal = SP.kanal(demo, () => {});
        kanal.senden({ art: "geleert" });
        setTimeout(() => kanal.schliessen(), 500);
      }
      return ergebnisse.every(Boolean);
    }
    /** Demo: „Beispieldaten zurücksetzen“. */
    async function zuruecksetzen() {
      if (!z.brain) return;
      lokal.loeschen("brain.positionen");
      if (z.graph) { z.graph.zerstoeren(); z.graph = null; }
      await z.brain.zuruecksetzen();
      z.abgeleitetAm = 0;
      abgeleitetAuffrischen(true);
    }

    const ansicht = {
      bereit, route, zeigen, verstecken, abmelden, zuruecksetzen, ungespeichert, verlassenOk, oeffnen, paletteZeigen,
      /** Messwerte des Graphen (für die Leistungsmessung in den Tests). */
      messen: () => (z.graph ? z.graph.messen() : null),
      /** Wo ein Knoten gerade im Fenster liegt (Mitte, Radius) – für Tests. */
      ort(id) {
        const l = z.graph ? z.graph.lageImBild(id) : null;
        if (!l) return null;
        const r = $("#brain-graph-rahmen").getBoundingClientRect();
        return { x: r.left + l.x, y: r.top + l.y, r: l.r, sichtbar: l.sichtbar };
      },
      get brain() { return z.brain; },
      /** Gabi hat diese Knoten verwendet: beim nächsten Blick in den Graphen leuchten sie auf. */
      aufleuchten(ids) { z.leuchten = [...new Set([...(z.leuchten || []), ...(Array.isArray(ids) ? ids : [])])].slice(-12); },
      neuerEintrag(felder) { bearbeitenStarten(null, { felder, geaendert: true }); },
      abgeleitetAuffrischen,
    };
    modul.aktuell = ansicht; // für Tests und die Fehlersuche: die laufende Ansicht
    return ansicht;
  }

  const modul = { erstelle, aktuell: null };
  return modul;
});
