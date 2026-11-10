/* Gabi Brain – Brücke zum Gespräch: Gabi bekommt für jede freie Frage den passenden Kontext aus dem Brain, zeigt die
   Quellen als Chips, sammelt Lücken und stellt im Interview die offenen Fragen. Gabi schreibt NIE selbst ins Brain:
   Vorschläge sind Karten, gespeichert wird erst nach Tipp auf „Übernehmen“. Wird nur mit aktivem Brain-Schalter geladen.
   Reine Hilfen (Befehle erkennen, Vorschläge ohne KI): brain-interview.js. */
(function (wurzel, fabrik) {
  wurzel.GabiBrainGespraech = fabrik(wurzel);
})(typeof self !== "undefined" ? self : this, function (W) {
  "use strict";

  const HAKEN = '<span class="haken"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';

  function erstelle(app, ansicht) {
    const IV = W.GabiBrainInterview;
    const { esc, symbol, toast, chat } = app;
    const brain = () => ansicht.brain;
    const artName = (id) => (W.GabiBrain.ARTEN.find((a) => a.id === id) || { name: id }).name;
    const audit = (faehigkeit) => { const b = brain(); if (b) b.auditSchreiben(faehigkeit); };
    let alterServerGesagt = false;
    // Was der Server von einem Eintrag zu sehen bekam (Kontext der letzten Frage oder die laufende Interview-Frage). Ein
    // Änderungsvorschlag ersetzt den GANZEN Inhalt: Hat der Server nur den gekürzten Anfang gesehen (der Kontext kürzt lange
    // Einträge), ginge mit „Übernehmen“ der Rest verloren. Solche Vorschläge werden deshalb nicht angeboten.
    const gesehen = new Map();
    const ganzGesehen = (k) => gesehen.has(k.id) && gesehen.get(k.id) === String(k.inhalt || "").trim();
    const zuLangText = (k) => `**${k.titel}** ist zu lang, um den Eintrag im Gespräch zu ändern – ich sehe hier nur den Anfang und würde den Rest abschneiden. Öffne ihn im Brain und ändere ihn dort.`;
    const INTERVIEW_MAX = 2000; // so viel vom Inhalt einer offenen Frage geht ans Interview mit

    // ==========================================================
    // 1 Kontext für eine Frage
    // ==========================================================
    /**
     * Kontext für eine Nachricht. Bei „Ändere X: Y“ steht der Eintrag, der zu X passt, vorn – und ist sicher dabei, auch
     * wenn der neue Inhalt Y nach etwas anderem klingt („… samstags geschlossen“ ↔ Öffnungszeiten).
     */
    function kontextMitZiel(b, text) {
      const k = b.kontextFuer(text);
      const befehl = IV.befehlErkennen(text);
      if (!befehl || befehl.art !== "aendern") return k;
      const ziel = b.kontextFuer(IV.aendernZiel(befehl.text)).knoten[0];
      if (!ziel) return k;
      const knoten = [ziel, ...k.knoten.filter((n) => n.id !== ziel.id)].slice(0, 8);
      let zeichen = knoten.reduce((n, x) => n + x.titel.length + x.inhalt.length, 0);
      while (knoten.length > 1 && zeichen > 6000) { const weg = knoten.pop(); zeichen -= weg.titel.length + weg.inhalt.length; }
      return { ...k, knoten };
    }

    /** Was Gabi für diese Frage aus dem Brain mitbekommt – oder null (Brain nicht bereit, Server kennt es nicht). */
    async function kontext(text) {
      if (!app.serverKannBrain()) {
        if (!alterServerGesagt) { alterServerGesagt = true; toast("Dieser Server kennt das Brain noch nicht – Gabi antwortet aus dem eingebauten Wissen.", { art: "warn", dauer: 7000 }); }
        return null;
      }
      try { await ansicht.bereit(); } catch { return null; }
      const b = brain();
      const k = b ? kontextMitZiel(b, text) : null;
      gesehen.clear();
      for (const n of (k && k.knoten) || []) gesehen.set(n.id, String(n.inhalt || "").trim());
      return k;
    }

    // ==========================================================
    // 2 Ereignisse aus dem Antwort-Strom
    // ==========================================================
    /** quellen (mit Knoten), luecke, brain_vorschlag. true = verarbeitet (die Nachricht wird neu gezeichnet). */
    function ereignis(gabi, e, g) {
      const b = brain();
      if (e.t === "quellen" && Array.isArray(e.knoten)) {
        if (!b) return true;
        const da = new Set((gabi.brainQuellen || []).map((q) => q.id));
        const neu = [];
        for (const id of e.knoten.slice(0, 12)) {
          const k = typeof id === "string" ? b.hol(id) : null;
          if (!k || da.has(k.id)) continue;
          da.add(k.id);
          neu.push({ id: k.id, titel: k.titel, art: k.art });
        }
        if (neu.length) {
          gabi.brainQuellen = [...(gabi.brainQuellen || []), ...neu];
          b.nutzungZaehlen(neu.map((q) => q.id));
          ansicht.aufleuchten(neu.map((q) => q.id));
          audit("praxisfragen");
        }
        return true;
      }
      if (e.t === "luecke") {
        const frage = String(e.frage || "").replace(/\s+/g, " ").trim().slice(0, 200);
        if (!b || !frage || gabi.luecke) return true;
        gabi.luecke = { frage };
        b.lueckeMelden(frage).then((l) => {
          // Fragen zu Patienten gehören nicht ins Brain – dann auch kein Hinweis
          if (!l) delete gabi.luecke; else gabi.luecke.id = l.id;
          app.nachrichtNeuZeichnen(gabi);
          app.gespraechMerken(g);
        });
        audit("praxisfragen");
        return true;
      }
      if (e.t === "brain_vorschlag" && e.vorschlag && typeof e.vorschlag === "object") {
        const v = e.vorschlag;
        const typ = v.typ === "aendern" ? "aendern" : "neu";
        const alt = typ === "aendern" && b ? b.hol(String(v.id || "")) : null;
        if (typ === "aendern" && (!alt || alt.geschuetzt)) return true; // Ziel gibt es nicht (mehr) oder ist geschützt: kein Vorschlag
        if (typ === "aendern" && !ganzGesehen(alt)) { gabi.brainZuLang = { id: alt.id, titel: alt.titel }; return true; } // sonst schnitte „Übernehmen“ den Rest ab
        const m = g === chat.gespraech && chat.modus && chat.modus.typ === "interview" ? chat.modus : null;
        gabi.karten.push({
          typ: "brain-vorschlag", id: app.neueId(), art: typ, knoten: alt ? alt.id : "",
          titel: String(v.titel || (alt ? alt.titel : "")).slice(0, 120), inhalt: String(v.inhalt || "").slice(0, 20000),
          vorher: alt ? { titel: alt.titel, inhalt: alt.inhalt, status: alt.status } : null,
          rev: alt ? alt.rev : undefined, // der Stand, auf dem der Vorschlag aufbaut
          grund: String(v.grund || "vorschlag").slice(0, 30), ohneKi: Boolean(v.ohneKi),
          interview: Boolean(m && alt && m.reihe[m.index] === alt.id),
        });
        gabi.wartet = true;
        return true;
      }
      return false;
    }

    // ==========================================================
    // 3 Darstellung im Gespräch
    // ==========================================================
    /** Unter Gabis Antwort: Quellen aus dem Brain und ein Hinweis auf die Lücke. */
    function nachrichtZusatz(n) {
      const teile = [];
      const q = n.brainQuellen || [];
      if (q.length) {
        const alle = q.map((x) => x.id).join(",");
        teile.push(`<div class="quellen brain-quellen"><span class="augenbraue">Aus dem Brain</span>${q.slice(0, 8).map((x) => `<a class="quelle brain-quelle" href="#/brain/${esc(x.id)}" data-brain-quellen="${esc(alle)}"><span class="brain-punkt" data-art="${esc(x.art)}"></span>${esc(x.titel)}</a>`).join("")}</div>`);
      }
      if (n.brainZuLang && !n.laeuft) {
        teile.push(`<div class="brain-luecke-hinweis">${symbol("info")}<span>Kein Vorschlag: „${esc(n.brainZuLang.titel)}“ ist länger als das, was Gabi im Gespräch sieht – beim Übernehmen ginge der Rest verloren.</span><a class="knopf sekundaer klein" href="#/brain/${esc(n.brainZuLang.id)}">${symbol("graph")}Im Brain ändern</a></div>`);
      }
      if (n.luecke && !n.laeuft) {
        teile.push(n.luecke.eingetragen
          ? `<div class="karte-zustand ok">${HAKEN}<span>Als „zu klären“ ins Brain eingetragen.</span> <a class="knopf geist klein" href="#/brain/${esc(n.luecke.eingetragen)}">Ansehen</a></div>`
          : `<div class="brain-luecke-hinweis">${symbol("frage")}<span>Das steht noch nicht im Brain. Gabi hat sich die Frage als Lücke gemerkt.</span><button class="knopf sekundaer klein" type="button" data-aktion="brain-luecke-eintragen">${symbol("plus")}Ins Brain eintragen</button></div>`);
      }
      return teile.join("");
    }

    const interviewLaeuftMit = (id) => Boolean(chat.modus && chat.modus.typ === "interview" && chat.modus.reihe[chat.modus.index] === id);

    function karteHtml(n, k) {
      const b = brain();
      if (k.typ === "brain-interview") {
        const an = !k.erledigt && interviewLaeuftMit(k.knoten);
        if (k.erledigt) return "";
        return `<div class="chip-gruppe" data-karte="${esc(k.id)}">
          <button class="chip" type="button" data-aktion="brain-ueberspringen"${an ? "" : " disabled"}>Überspringen</button>
          <button class="chip" type="button" data-aktion="brain-spaeter"${an ? "" : " disabled"}>Später</button></div>`;
      }
      if (k.typ === "brain-gesundheit") {
        const g = k.stand || {};
        const umfang = 2 * Math.PI * 18;
        const p = g.knoten ? Math.round(((g.bestaetigt || 0) / g.knoten) * 100) : 0;
        const voll = (umfang * p) / 100;
        const zahl = (n2, text) => `<span class="brain-kennzahl"><strong class="zahl">${Number(n2) || 0}</strong><span>${text}</span></span>`;
        return `<article class="karte gespraechs-karte brain-karte mit-streifen" data-karte="${esc(k.id)}">
          <div class="brain-gesundheit">
            <div class="brain-ring-block"><svg class="brain-ring" viewBox="0 0 44 44" role="img" aria-label="${p} Prozent bestätigt"><circle class="brain-ring-spur" cx="22" cy="22" r="18"/><circle class="brain-ring-wert" cx="22" cy="22" r="18" stroke-dasharray="${voll.toFixed(1)} ${(umfang - voll + 0.1).toFixed(1)}" transform="rotate(-90 22 22)"/></svg>
              <div class="brain-ring-text"><strong class="zahl">${p} %</strong><span>bestätigt</span></div></div>
            <div class="brain-kennzahlen">${zahl(g.knoten, "Einträge")}${zahl(g.zuKlaeren, "zu klären")}${zahl(g.veraltet, "veraltet")}${zahl(g.nieVerwendet, "nie verwendet")}${zahl(g.luecken, "Lücken")}</div>
          </div>
          <div class="knopf-reihe links">${g.zuKlaeren ? `<button class="knopf primaer klein" type="button" data-aktion="brain-interview-start">${symbol("funke")}Brain füllen</button>` : ""}<a class="knopf sekundaer klein" href="#/brain">${symbol("graph")}Zum Brain</a></div>
        </article>`;
      }
      if (k.typ === "brain-treffer") {
        const liste = (k.treffer || []).map((t) => (b && b.hol(t.id)) || null).filter(Boolean);
        if (!liste.length) return "";
        const alle = liste.map((x) => x.id).join(",");
        return `<article class="karte gespraechs-karte brain-karte" data-karte="${esc(k.id)}"><ul class="brain-zeilen">${liste.map((x) => `<li><a class="brain-zeile" href="#/brain/${esc(x.id)}" data-brain-quellen="${esc(alle)}"><span class="brain-punkt" data-art="${esc(x.art)}" data-status="${esc(x.status)}"></span><span class="brain-zeile-text"><strong>${esc(x.titel)}</strong><span class="stumm">${esc(artName(x.art))}${x.status === "zu_klaeren" ? " · zu klären" : x.status === "entwurf" ? " · Entwurf" : ""}</span></span>${symbol("rechts", "klein")}</a></li>`).join("")}</ul></article>`;
      }
      if (k.typ !== "brain-vorschlag") return "";
      const neu = k.art === "neu";
      const titel = k.bearbeitung && typeof k.bearbeitung.titel === "string" ? k.bearbeitung.titel : k.titel;
      const inhalt = k.bearbeitung && typeof k.bearbeitung.inhalt === "string" ? k.bearbeitung.inhalt : k.inhalt;
      const kopf = `<header class="karte-kopf"><span class="karte-kachel">${symbol("graph")}</span>
        <div class="karte-kopf-text"><span class="karte-titel">${neu ? "Neuer Eintrag fürs Brain" : "Änderung im Brain"}</span><span class="karte-meta">${esc(k.titel)} · ${k.uebernommen ? "übernommen" : k.verworfen ? "verworfen" : "noch nicht gespeichert"}</span></div></header>`;
      if (k.uebernommen) {
        return `<article class="karte gespraechs-karte brain-karte erledigt mit-streifen" data-karte="${esc(k.id)}">${kopf}
          <div class="karte-zustand ok">${HAKEN}<span>Im Brain gespeichert.</span></div>
          <div class="knopf-reihe links"><a class="knopf sekundaer klein" href="#/brain/${esc(k.uebernommen)}" data-brain-quellen="${esc(k.uebernommen)}">${symbol("graph")}Im Brain ansehen</a></div></article>`;
      }
      if (k.verworfen) return `<article class="karte gespraechs-karte brain-karte erledigt verworfen" data-karte="${esc(k.id)}">${kopf}<div class="karte-zustand">Nicht übernommen.</div></article>`;
      const gesperrt = n.laeuft || k.speichert ? " disabled" : "";
      const rumpf = k.bearbeiten
        ? `${neu ? `<label class="feld"><span>Titel</span><input class="eingabefeld" data-brain-feld="titel" maxlength="120" autocomplete="off" value="${esc(titel)}"></label>` : ""}
           <label class="feld"><span>${neu ? "Inhalt" : "Neuer Inhalt"}</span><textarea class="eingabefeld" data-brain-feld="inhalt" rows="5" maxlength="20000">${esc(inhalt)}</textarea></label>`
        : `<div class="brain-vorher-nachher${neu ? " einzeln" : ""}">
            ${neu ? "" : `<div><span class="augenbraue">Vorher</span><div class="brain-diff-alt">${esc((k.vorher && k.vorher.inhalt) || "") || "(noch kein Inhalt)"}</div></div>`}
            <div><span class="augenbraue">${neu ? "Inhalt" : "Nachher"}</span><div class="brain-diff-neu">${esc(inhalt) || "(leer)"}</div></div>
          </div>`;
      const hinweis = `${k.standNeu ? '<p class="karte-meta brain-stand-neu" role="status">Der Eintrag wurde inzwischen geändert – „Vorher“ zeigt den aktuellen Stand. Bitte prüfe den Vorschlag, bevor du ihn übernimmst.</p>' : ""}${k.ohneKi ? '<p class="karte-meta">Ohne KI formuliert – bitte vor dem Übernehmen anpassen.</p>' : k.interview ? '<p class="karte-meta">Mit „Übernehmen“ gilt der Punkt als geklärt.</p>' : ""}`;
      const knoepfe = k.bearbeiten
        ? `<button class="knopf primaer klein" type="button" data-aktion="brain-uebernehmen"${gesperrt}>${symbol("haken")}Übernehmen</button><button class="knopf leise klein" type="button" data-aktion="brain-abbrechen"${gesperrt}>Abbrechen</button>`
        : `<button class="knopf primaer klein" type="button" data-aktion="brain-uebernehmen"${gesperrt}>${k.speichert ? '<span class="drehen"></span>Speichere …' : `${symbol("haken")}Übernehmen`}</button>
           <button class="knopf sekundaer klein" type="button" data-aktion="brain-bearbeiten"${gesperrt}>${symbol("stift")}Bearbeiten</button>
           <button class="knopf leise klein" type="button" data-aktion="brain-verwerfen"${gesperrt}>${k.interview ? "Überspringen" : "Verwerfen"}</button>
           ${k.interview ? `<button class="knopf leise klein" type="button" data-aktion="brain-spaeter"${gesperrt}>Später</button>` : ""}`;
      return `<article class="karte gespraechs-karte brain-karte mit-streifen" data-karte="${esc(k.id)}">${kopf}${rumpf}${hinweis}<div class="knopf-reihe links">${knoepfe}</div></article>`;
    }

    // Getipptes in einer Vorschlagskarte gleich merken (ein Neuzeichnen der Nachricht nähme es sonst weg)
    let tippUhr = null;
    app.el.nachrichten.addEventListener("input", (e) => {
      const feld = e.target instanceof Element ? e.target.closest("[data-brain-feld]") : null;
      if (!feld) return;
      const knoten = feld.closest(".nachricht");
      const kk = feld.closest("[data-karte]");
      const n = knoten && chat.nachrichten.find((x) => x.id === knoten.dataset.id);
      const k = n && kk ? (n.karten || []).find((x) => x.id === kk.dataset.karte) : null;
      if (!k) return;
      k.bearbeitung = { ...(k.bearbeitung || {}), [feld.dataset.brainFeld]: feld.value };
      const g = chat.gespraech;
      clearTimeout(tippUhr);
      tippUhr = setTimeout(() => app.gespraechMerken(g), 300);
    });

    // ==========================================================
    // 4 Klicks auf Karten und Hinweise
    // ==========================================================
    async function uebernehmen(n, k, g) {
      const b = brain();
      if (!b || k.speichert || k.uebernommen || k.verworfen) return;
      const titel = String((k.bearbeitung && k.bearbeitung.titel) || k.titel).trim();
      const inhalt = String(k.bearbeitung && typeof k.bearbeitung.inhalt === "string" ? k.bearbeitung.inhalt : k.inhalt).trim();
      k.speichert = true;
      app.nachrichtNeuZeichnen(n);
      let r;
      try {
        if (k.art === "neu") r = await b.anlegen({ art: "praxiswissen", titel, inhalt, tags: [], status: "bestaetigt", quelle: "Gespräch" }, { grund: "vorschlag" });
        else {
          const alt = b.hol(k.knoten);
          // Interview: der Punkt ist damit geklärt – aus der Frage wird bestätigtes Praxiswissen
          const felder = k.interview ? { inhalt, status: "bestaetigt", art: alt && alt.art === "frage" ? "praxiswissen" : alt ? alt.art : "praxiswissen", quelle: "Interview" } : { inhalt };
          // nur auf dem Stand, den der Vorschlag kannte: wurde der Eintrag inzwischen geändert (im Brain, in einem anderen
          // Fenster), überschreibt ein alter Vorschlag das nicht stillschweigend
          r = await b.aendern(k.knoten, felder, { grund: k.interview ? "interview" : "vorschlag", ...(Number.isInteger(k.rev) ? { erwartet: k.rev } : {}) });
        }
      } finally {
        k.speichert = false;
      }
      if (!r.ok) {
        const text = r.konflikt ? "Der Eintrag wurde inzwischen geändert – bitte den Vorschlag noch einmal prüfen." : Object.values(r.fehler || { x: "Das hat nicht geklappt." })[0];
        if (r.fehler && (r.fehler.titel || r.fehler.inhalt)) k.bearbeiten = true; // gleich zum Anpassen öffnen
        if (r.konflikt) {
          // „Vorher“ zeigt ab jetzt den neuen Stand; erst ein zweites, bewusstes „Übernehmen“ gilt dann für diesen Stand
          const jetzt = b.hol(k.knoten);
          if (jetzt) { k.vorher = { titel: jetzt.titel, inhalt: jetzt.inhalt, status: jetzt.status }; k.rev = jetzt.rev; k.standNeu = true; delete k.bearbeiten; }
        }
        app.nachrichtNeuZeichnen(n);
        toast(text, { art: "warn", dauer: 6000 });
        return;
      }
      k.uebernommen = r.knoten.id;
      k.titel = r.knoten.titel;
      delete k.bearbeiten;
      delete k.bearbeitung;
      app.nachrichtNeuZeichnen(n);
      app.hakenZeichnen(n, k);
      app.gespraechMerken(g);
      audit(k.interview ? "brain-interview" : k.art === "neu" ? "brain-merken" : "brain-aendern");
      ansicht.aufleuchten([r.knoten.id]);
      if (k.interview) weiter(g, k.knoten);
      else toast("Im Brain gespeichert.", { art: "erfolg", aktion: { text: "Ansehen", tun: () => { location.hash = `#/brain/${r.knoten.id}`; } } });
    }

    async function klick(aktion, n, k, knopf, g) {
      const b = brain();
      if (aktion === "brain-luecke-eintragen") {
        if (!b || !n.luecke || n.luecke.eingetragen) return;
        knopf.disabled = true;
        let l = n.luecke.id ? b.luecken({ alle: true }).find((x) => x.id === n.luecke.id) : null;
        if (!l) l = await b.lueckeMelden(n.luecke.frage);
        const r = l ? await b.lueckeEintragen(l.id) : { fehler: { allgemein: "Diese Frage lässt sich nicht eintragen." } };
        if (!r.ok) { knopf.disabled = false; toast(Object.values(r.fehler || { x: "Das hat nicht geklappt." })[0], { art: "warn" }); return; }
        n.luecke.eingetragen = r.knoten.id;
        app.nachrichtNeuZeichnen(n);
        app.gespraechMerken(g);
        return;
      }
      if (aktion === "brain-interview-start") { interviewStarten(); return; }
      if (!k) return;
      if (aktion === "brain-uebernehmen") { uebernehmen(n, k, g); return; }
      if (aktion === "brain-bearbeiten") { k.bearbeiten = true; app.nachrichtNeuZeichnen(n); app.gespraechMerken(g); const f = app.el.nachrichten.querySelector(`[data-karte="${CSS.escape(k.id)}"] [data-brain-feld="inhalt"]`); if (f) f.focus(); return; }
      if (aktion === "brain-abbrechen") { delete k.bearbeiten; delete k.bearbeitung; app.nachrichtNeuZeichnen(n); app.gespraechMerken(g); return; }
      if (aktion === "brain-verwerfen") {
        k.verworfen = true;
        delete k.bearbeiten;
        app.nachrichtNeuZeichnen(n);
        app.gespraechMerken(g);
        if (k.interview) weiter(g, k.knoten);
        return;
      }
      if (aktion === "brain-ueberspringen") {
        k.erledigt = true;
        app.nachrichtNeuZeichnen(n);
        app.gespraechMerken(g);
        weiter(g, k.knoten);
        return;
      }
      if (aktion === "brain-spaeter") {
        if (k.typ === "brain-interview") k.erledigt = true;
        else { k.verworfen = true; delete k.bearbeiten; }
        app.nachrichtNeuZeichnen(n);
        interviewEnde(g, "Alles klar – wir machen später weiter. Die offenen Fragen findest du im Brain unter „Zu klären“.");
      }
    }

    // ==========================================================
    // 5 Brain-Interview: eine offene Frage pro Nachricht
    // ==========================================================
    async function interviewStarten() {
      if (chat.laeuft) { toast("Einen Moment – Gabi ist noch beschäftigt."); return; }
      app.zumGespraech();
      try { await ansicht.bereit(); } catch { toast("Das Brain ließ sich nicht laden.", { art: "warn" }); return; }
      const b = brain();
      const reihe = IV.reihenfolge(b.eigene());
      if (!reihe.length) { app.modusSetzen(null); app.lokaleAntwort("Im Brain ist gerade nichts offen – alle Punkte sind geklärt."); return; }
      app.modusSetzen({ typ: "interview", reihe, index: 0, gesamt: reihe.length });
      audit("brain-interview");
      frageStellen(chat.gespraech);
      app.eingabeFokus();
    }

    function frageStellen(g) {
      const b = brain();
      const m = g === chat.gespraech && chat.modus && chat.modus.typ === "interview" ? chat.modus : null;
      if (!m || !b) return;
      // schon Geklärtes (z. B. im Brain selbst beantwortet) überspringen
      while (m.index < m.reihe.length) {
        const k = b.hol(m.reihe[m.index]);
        if (k && k.status === "zu_klaeren" && !k.geschuetzt) break;
        m.index += 1;
      }
      if (m.index >= m.reihe.length) {
        const s = b.gesundheit();
        interviewEnde(g, `Das waren alle offenen Fragen – danke! Dein Brain ist jetzt zu **${s.prozent} %** bestätigt.`);
        return;
      }
      const k = b.hol(m.reihe[m.index]);
      app.modusSetzen({ ...m }); // Pille zeigt die neue Fragennummer
      app.lokaleAntwort(IV.frageText(k, m.index + 1, m.reihe.length), [{ typ: "brain-interview", id: app.neueId(), knoten: k.id }], g);
    }

    function weiter(g, knotenId) {
      const m = g === chat.gespraech && chat.modus && chat.modus.typ === "interview" ? chat.modus : null;
      if (!m) return;
      if (m.reihe[m.index] === knotenId) m.index += 1;
      frageStellen(g);
    }

    function interviewEnde(g, text) {
      if (g === chat.gespraech && chat.modus && chat.modus.typ === "interview") app.modusSetzen(null);
      if (text) app.lokaleAntwort(text, [], g);
    }

    /** Die Antwort auf die laufende Interview-Frage (getippt oder gesprochen). */
    function interviewAntwort(text, art, m) {
      const b = brain();
      const k = b ? b.hol(m.reihe[m.index]) : null;
      if (!k || k.status !== "zu_klaeren") { frageStellen(chat.gespraech); return; }
      // die Knöpfe der Frage sind damit erledigt
      for (const n of chat.nachrichten) for (const karte of n.karten || []) if (karte.typ === "brain-interview" && karte.knoten === k.id && !karte.erledigt) { karte.erledigt = true; app.nachrichtNeuZeichnen(n); }
      if (String(k.inhalt || "").length > INTERVIEW_MAX) {
        // der Vorschlag ersetzte den ganzen Eintrag – mit nur einem Teil davon ginge der Rest verloren
        const g = chat.gespraech;
        app.nutzerNachricht(text, art);
        app.lokaleAntwort(`${zuLangText(k)} Ich mache mit der nächsten Frage weiter.`, [{ typ: "brain-treffer", id: app.neueId(), treffer: [{ id: k.id }] }], g, { brain: true });
        weiter(g, k.id);
        return;
      }
      gesehen.clear();
      gesehen.set(k.id, String(k.inhalt || "").trim());
      if (!app.serverKannBrain()) {
        // Server ohne Brain (z. B. ältere Live-Version): der Vorschlag entsteht hier, ohne KI
        const g = chat.gespraech;
        app.nutzerNachricht(text, art);
        const v = IV.vorschlagOhneKi({ knoten: { id: k.id, titel: k.titel, inhalt: k.inhalt }, antwort: text });
        const gabi = app.lokaleAntwort("Passt das so? Gespeichert wird erst, wenn du auf „Übernehmen“ tippst.", [], g);
        ereignis(gabi, { t: "brain_vorschlag", vorschlag: { ...v, ohneKi: true } }, g);
        gabi.wartet = false;
        app.nachrichtNeuZeichnen(gabi);
        app.gespraechMerken(g);
        return;
      }
      app.senden({ text, senden: `Antwort auf die offene Frage „${k.titel}“: ${text}`, aktion: { typ: "brain_antwort", knoten: { id: k.id, titel: k.titel, inhalt: String(k.inhalt || "") }, antwort: text.slice(0, 4000) }, art });
    }

    // ==========================================================
    // 6 Befehle, die ohne Server beantwortet werden
    // ==========================================================
    /** true = hier erledigt (Interview-Antwort, „Brain füllen“, Gesundheit, „Was weißt du über …?“). */
    function textAbfangen(text, art, m) {
      if (m && m.typ === "interview") { interviewAntwort(text, art, m); return true; }
      const b = brain();
      const befehl = IV.befehlErkennen(text);
      if (!befehl || !b) return false;
      if (befehl.art === "interview") { app.nutzerNachricht(text, art); interviewStarten(); return true; }
      if (befehl.art === "gesundheit") {
        const s = b.gesundheit();
        app.nutzerNachricht(text, art);
        app.lokaleAntwort(IV.gesundheitText(s), [{ typ: "brain-gesundheit", id: app.neueId(), stand: s }], chat.gespraech, { brain: true });
        audit("brain-gesundheit");
        return true;
      }
      if (befehl.art === "wissen") {
        const treffer = b.suchen(befehl.text, { limit: 6, praefix: false }).filter((t) => { const k = b.hol(t.id); return k && !["patient", "notiz", "bericht"].includes(k.art); });
        app.nutzerNachricht(text, art);
        if (!treffer.length) {
          const gabi = app.lokaleAntwort("Dazu steht noch nichts im Brain.", [], chat.gespraech, { brain: true });
          ereignis(gabi, { t: "luecke", frage: text }, chat.gespraech);
        } else {
          app.lokaleAntwort(`Dazu ${treffer.length === 1 ? "steht ein Eintrag" : `stehen ${treffer.length} Einträge`} im Brain:`, [{ typ: "brain-treffer", id: app.neueId(), treffer: treffer.map((t) => ({ id: t.id })) }], chat.gespraech, { brain: true });
          ansicht.aufleuchten(treffer.map((t) => t.id));
        }
        audit("brain-suche");
        return true;
      }
      if (befehl.art === "aendern" && app.serverKannBrain()) {
        // Ziel ist der beste Treffer zur Bitte. Sieht Gabi davon nur den gekürzten Anfang, gibt es keinen Vorschlag.
        const erster = kontextMitZiel(b, text).knoten[0];
        const ziel = erster ? b.hol(erster.id) : null;
        if (ziel && String(ziel.inhalt || "").trim() !== erster.inhalt) {
          app.nutzerNachricht(text, art);
          app.lokaleAntwort(zuLangText(ziel), [{ typ: "brain-treffer", id: app.neueId(), treffer: [{ id: ziel.id }] }], chat.gespraech, { brain: true });
          audit("brain-aendern");
          return true;
        }
      }
      return false; // „Merke dir“ und „Ändere“ gehen an Gabi – sie antwortet mit einer Vorschlagskarte
    }

    // ==========================================================
    // 7 Start: Chip „Brain füllen“ und der Hinweis fürs erste Mal
    // ==========================================================
    const MERKER = () => (app.demo() ? "gabi.demo.brain.hinweis" : "gabi.brain.hinweis");
    const hinweisWeg = () => { try { return localStorage.getItem(MERKER()) === "1"; } catch { return false; } };
    function startZeichnen() {
      // Chip in der Leiste über dem Eingabefeld (einmal anlegen)
      if (!app.el.chipsLeiste.querySelector("[data-brain-start]")) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.dataset.brainStart = "interview";
        chip.innerHTML = `${symbol("funke")}Brain füllen`;
        app.el.chipsLeiste.append(chip);
        app.el.chipsLeiste.classList.add("mit-brain"); // fünf Chips: etwas enger, damit am Laptop keiner angeschnitten ist
      }
      let ort = app.el.willkommen.querySelector("#brain-start");
      if (!ort) {
        ort = document.createElement("div");
        ort.id = "brain-start";
        app.el.willkommen.append(ort);
      }
      const b = brain();
      const offen = b ? b.gesundheit().zuKlaeren : 0;
      app.ersetzen(ort, offen && !hinweisWeg() ? `
        <div class="brain-start-hinweis" role="note">
          <span class="kachel">${symbol("graph")}</span>
          <div class="brain-start-hinweis-text"><strong>So lernt Gabi deine Praxis kennen</strong><span>${offen === 1 ? "Eine Frage ist" : `${offen} Fragen sind`} im Brain noch offen – beantworte sie per Sprache oder Text.</span></div>
          <button class="knopf sekundaer klein" type="button" data-brain-start="interview">${symbol("funke")}Brain füllen</button>
          <button class="rund-knopf klein" type="button" data-brain-start="zu" aria-label="Hinweis ausblenden">${symbol("x", "klein")}</button>
        </div>` : "");
    }
    document.addEventListener("click", (e) => {
      const k = e.target instanceof Element ? e.target.closest("[data-brain-start]") : null;
      if (!k || k.disabled) return;
      if (k.dataset.brainStart === "zu") { try { localStorage.setItem(MERKER(), "1"); } catch { /* egal */ } startZeichnen(); app.eingabeFokus(); return; }
      interviewStarten();
    });

    /** Was die Modus-Pille im Interview zeigt. */
    const modusText = (m) => `Brain füllen · Frage ${Math.min(m.index + 1, m.reihe.length)} von ${m.reihe.length}`;

    return { kontext, ereignis, nachrichtZusatz, karteHtml, klick, textAbfangen, interviewStarten, startZeichnen, modusText };
  }

  return { erstelle };
});
