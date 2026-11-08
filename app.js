/* Gabi v2 – Oberfläche: Gespräch mit Gabi (Diktat + Assistent) und Notizordner.
   Kein Schlüssel im Browser: alles läuft über den Gabi-Worker (Zugangscode im Kopf X-Gabi-Zugang) oder im Demo-Modus
   komplett im Browser. Gliederung: 1 Grundlagen · 2 API · 3 Start/Zugang · 4 Navigation · 5 Gespräch · 6 Karten
   7 Eingabe und Aufnahme · 8 Notizen · 9 Kleinigkeiten (Vorlesen, Kopieren, Schutz vor Datenverlust) */
(() => {
  "use strict";

  // In einer fremden Seite eingebettet (GitHub Pages kann kein frame-ancestors setzen): nicht starten
  if (window.top !== window.self) {
    // in einer fremden Seite eingebettet: nicht starten, nur ein Link zum Öffnen im eigenen Tab
    const link = document.createElement("a");
    link.href = location.href;
    link.target = "_top";
    link.rel = "noopener";
    link.className = "knopf primaer";
    link.textContent = "Gabi in einem eigenen Tab öffnen";
    document.body.replaceChildren(link);
    return;
  }
  // Seite und Skript aus verschiedenen Versionen (Browser-Cache: alte index.html, neue Dateien – oder v1 → v2):
  // einmal je Version frisch laden; hilft das nicht, ein Hinweis mit Knopf statt einer leeren Seite.
  // VERSION muss zum ?v= in index.html passen (ein Test prüft das).
  const VERSION = "2.1.0";
  const MERKER = `gabi.frisch-geladen.${VERSION}`;
  let geladenAls = null;
  try { geladenAls = new URL(document.currentScript.src).searchParams.get("v"); } catch { geladenAls = null; }
  if (geladenAls !== VERSION || !document.getElementById("schublade") || !window.GabiKern || !window.GabiGespraeche) {
    let neuLaden = false;
    try { if (!sessionStorage.getItem(MERKER)) { sessionStorage.setItem(MERKER, "1"); neuLaden = true; } } catch { /* Speicher gesperrt */ }
    if (neuLaden) { location.reload(); return; }
    const box = document.createElement("div");
    box.className = "veraltet";
    const satz = document.createElement("p");
    satz.textContent = "Gabi wurde aktualisiert. Bitte lade die Seite einmal neu.";
    const knopf = document.createElement("button");
    knopf.type = "button";
    knopf.className = "knopf primaer";
    knopf.textContent = "Neu laden";
    knopf.addEventListener("click", () => location.reload());
    box.append(satz, knopf);
    document.body.replaceChildren(box);
    return;
  }
  try { sessionStorage.removeItem(MERKER); } catch { /* egal */ } // geklappt: beim nächsten Versionswechsel wieder erlaubt

  const K = window.GabiKern;
  const PDF = window.GabiPdf;
  const DEMO = window.GabiDemo;
  const AUFNAHME = window.GabiAufnahme;
  const VERLAUF = window.GabiGespraeche;

  // ==========================================================
  // 1 Grundlagen
  // ==========================================================
  const API = (window.GABI_CONFIG && window.GABI_CONFIG.apiUrl ? window.GABI_CONFIG.apiUrl : "").replace(/\/+$/, "");
  const DEMO_PARAM = new URLSearchParams(location.search).get("demo") === "1";
  const PRODUKTION = location.hostname === "gabi.automatilabs.de";
  const modus = { demo: false, grund: "" };
  let demoApi = null;

  const $ = (sel) => document.querySelector(sel);
  const el = {
    app: $("#app"), kopf: $("#kopf"), haupt: $("#haupt"), testBadge: $("#test-badge"), kopfWechsel: $("#kopf-wechsel"), kopfNeu: $("#kopf-neu"), seiteNeu: $("#seite-neu"), kopfMenue: $("#kopf-menue"),
    seitenPatienten: $("#seiten-patienten"), seitenFussText: $("#seiten-fuss-text"), seitenGespraeche: $("#seiten-gespraeche"),
    schublade: $("#schublade"), schubladeListe: $("#schublade-liste"), schubladeZu: $("#schublade-zu"),
    laden: $("#ansicht-laden"), zugang: $("#ansicht-zugang"), offline: $("#ansicht-offline"), chat: $("#ansicht-chat"), notizen: $("#ansicht-notizen"),
    zugangForm: $("#zugang-form"), zugangCode: $("#zugang-code"), zugangZeigen: $("#zugang-zeigen"), zugangFehler: $("#zugang-fehler"), zugangWeiter: $("#zugang-weiter"),
    offlineTitel: $("#offline-titel"), offlineText: $("#offline-text"), offlineErneut: $("#offline-erneut"),
    willkommen: $("#willkommen"), gruss: $("#gruss"), nachrichten: $("#nachrichten"),
    chipsLeiste: $("#chips-leiste"), modusPill: $("#modus-pill"), modusText: $("#modus-text"), modusSymbol: $("#modus-symbol"), modusWeg: $("#modus-weg"),
    eingabe: $("#eingabe"), text: $("#eingabe-text"), mikro: $("#mikro"), senden: $("#senden"), aufnahmeZeit: $("#aufnahme-zeit"), aufnahmeText: $("#aufnahme-text"), wellen: $("#wellen"),
    dialogFrage: $("#dialog-frage"), frageTitel: $("#frage-titel"), frageText: $("#frage-text"), frageJa: $("#frage-ja"), frageNein: $("#frage-nein"),
    frageHakenZeile: $("#frage-haken-zeile"), frageHaken: $("#frage-haken"), frageHakenText: $("#frage-haken-text"),
    dialogPatient: $("#dialog-patient"), patientForm: $("#patient-form"), patientKuerzel: $("#patient-kuerzel"), patientPseudonym: $("#patient-pseudonym"), patientFehler: $("#patient-fehler"), patientAbbrechen: $("#patient-abbrechen"), patientAnlegen: $("#patient-anlegen"),
    dialogInfo: $("#dialog-info"), infoTitel: $("#info-titel"), infoZuruecksetzen: $("#info-zuruecksetzen"), infoVerbinden: $("#info-verbinden"), infoAbmelden: $("#info-abmelden"),
    toasts: $("#toasts"),
  };

  const speicher = {
    lesen(ort, k) { try { return (ort === "lokal" ? localStorage : sessionStorage).getItem(k); } catch { return null; } },
    schreiben(ort, k, v) { try { (ort === "lokal" ? localStorage : sessionStorage).setItem(k, v); } catch { /* privat/voll – egal */ } },
    loeschen(ort, k) { try { (ort === "lokal" ? localStorage : sessionStorage).removeItem(k); } catch { /* egal */ } },
  };
  /** Demo und echter Betrieb nutzen getrennte Schlüssel – nichts vermischt sich. */
  const schluessel = (name) => (modus.demo ? `gabi.demo.${name}` : `gabi.${name}`);
  const esc = K.esc;
  const symbol = (name, klasse = "") => `<svg class="symbol ${klasse}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const neueId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Inhalt nur ersetzen, wenn er sich geändert hat: ein Render pro Datenstand – kein Neuaufbau, kein erneutes Einblenden. */
  const gerendert = new WeakMap();
  function ersetzen(knoten, html) {
    if (!knoten || gerendert.get(knoten) === html) return false;
    gerendert.set(knoten, html);
    knoten.innerHTML = html;
    return true;
  }
  const GROB = window.matchMedia("(pointer: coarse)").matches;
  const WENIG_BEWEGUNG = window.matchMedia("(prefers-reduced-motion: reduce)");
  const LAPTOP = window.matchMedia("(min-width: 1024px)");

  // ---------- Toasts ----------
  // Ist ein Dialog oder die Schublade offen, gehören Hinweise hinein: Alles außerhalb ist dann inert (Knöpfe wie „Ansehen“
  // gingen nicht, ein Tipp landete auf dem Element darunter). In der Schublade stehen sie unten (nicht über „Neues Gespräch“).
  const DIALOGE = [el.schublade, el.dialogFrage, el.dialogPatient, el.dialogInfo];
  function toastsNachVorn() {
    const offen = DIALOGE.filter((d) => d && d.open).pop() || null;
    const ziel = offen || document.body;
    if (el.toasts.parentNode !== ziel) ziel.append(el.toasts);
  }
  for (const d of DIALOGE) if (d) d.addEventListener("close", () => { if (el.toasts.parentNode === d) toastsNachVorn(); });
  function toast(text, { art = "", dauer = 4000, aktion } = {}) {
    const t = document.createElement("div");
    t.className = `toast ${art}`;
    t.setAttribute("role", art === "fehler" ? "alert" : "status");
    const ic = art === "erfolg" ? "haken" : art === "fehler" || art === "warn" ? "warn" : "info";
    t.innerHTML = `<span class="toast-symbol">${symbol(ic)}</span><span class="toast-text">${esc(text)}</span>`;
    let uhr = null;
    const weg = () => { clearTimeout(uhr); if (t.classList.contains("weg")) return; t.style.animation = ""; t.classList.add("weg"); setTimeout(() => t.remove(), 160); };
    // einmal eingeblendet = fertig (sonst blendete er beim Nach-vorn-Holen über einen Dialog noch einmal ein)
    t.addEventListener("animationend", () => { if (!t.classList.contains("weg")) t.style.animation = "none"; }, { once: true });
    if (aktion) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "knopf geist";
      b.textContent = aktion.text;
      let getan = false;
      b.addEventListener("click", () => { if (getan) return; getan = true; weg(); aktion.tun(); });
      t.append(b);
    }
    el.toasts.append(t);
    toastsNachVorn();
    while (el.toasts.children.length > 3) el.toasts.firstElementChild.remove();
    uhr = setTimeout(weg, aktion ? Math.max(dauer, 6500) : dauer);
    t.addEventListener("pointerenter", () => clearTimeout(uhr));
    t.addEventListener("pointerleave", () => { clearTimeout(uhr); uhr = setTimeout(weg, 2500); });
  }

  // ---------- Rückfrage (immer nur eine offen) ----------
  // haken: optionales Häkchen (Vorgabe: an) – nach der Antwort steht der Zustand in el.frageHaken.checked
  let frageOffen = false;
  function frage(titel, text, { ja = "OK", nein = "Abbrechen", gefahr = false, haken = "" } = {}) {
    if (frageOffen) return Promise.resolve(false);
    frageOffen = true;
    el.frageTitel.textContent = titel;
    el.frageText.textContent = text;
    el.frageJa.textContent = ja;
    el.frageNein.textContent = nein;
    el.frageJa.className = `knopf ${gefahr ? "gefahr" : "primaer"}`;
    el.frageHakenZeile.hidden = !haken;
    el.frageHakenText.textContent = haken;
    el.frageHaken.checked = true;
    el.dialogFrage.returnValue = "";
    return new Promise((ok) => {
      el.dialogFrage.addEventListener("close", () => { frageOffen = false; ok(el.dialogFrage.returnValue === "ja"); }, { once: true });
      el.dialogFrage.showModal();
    });
  }

  // ==========================================================
  // 2 API – Worker oder Demo
  // ==========================================================
  let zugang = speicher.lesen("lokal", "gabi.zugang") || "";
  class Abbruch extends Error {}
  const STATUS_TEXT = (s) =>
    s === 429 ? "Gerade zu viele Anfragen – bitte kurz warten und nochmal versuchen."
      : s === 413 ? "Das ist zu lang für einen Durchgang."
        : s === 404 ? "Nicht gefunden."
          : s >= 500 ? `Server-Fehler (${s}). Bitte nochmal versuchen.`
            : `Fehler ${s}.`;

  async function api(pfad, { methode = "GET", body, text, code = zugang, zeit = 20000 } = {}) {
    if (modus.demo) {
      try { return await demoApi.anfrage(pfad, { methode, body, text }); }
      catch (e) { const f = new Error((e && e.message) || "Fehler im Demo-Modus."); f.status = e && e.status; throw f; }
    }
    const headers = { "X-Gabi-Zugang": code };
    let inhalt;
    if (text !== undefined) { headers["Content-Type"] = "text/plain"; inhalt = text; }
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; inhalt = JSON.stringify(body); }
    const abbruch = new AbortController();
    const uhr = setTimeout(() => abbruch.abort(), zeit);
    let r;
    try {
      r = await fetch(`${API}${pfad}`, { method: methode, headers, body: inhalt, cache: "no-store", signal: abbruch.signal });
    } catch {
      if (abbruch.signal.aborted) throw new Error("Der Server antwortet nicht (Zeitüberschreitung). Bitte nochmal versuchen.");
      throw new Error(navigator.onLine === false ? "Kein Internet. Bitte Verbindung prüfen." : "Keine Verbindung zum Server. Bitte Internet prüfen.");
    } finally {
      clearTimeout(uhr);
    }
    if (r.status === 401 && code === zugang) {
      zugangVergessen();
      zugangZeigen("Der Zugangscode gilt nicht mehr. Bitte neu eingeben.");
      throw new Abbruch();
    }
    const daten = r.status === 204 ? null : await r.json().catch(() => null);
    if (!r.ok) {
      const f = new Error((daten && daten.fehler) || STATUS_TEXT(r.status));
      f.status = r.status;
      throw f;
    }
    return daten;
  }

  /** Gespräch: Antwort live als NDJSON-Strom lesen und jedes Ereignis weiterreichen. */
  async function chatStrom(body, beiEreignis, signal) {
    if (modus.demo) {
      try { await demoApi.chatten(body, beiEreignis, { signal }); }
      catch (e) { if (signal && signal.aborted) throw new Abbruch(); throw new Error((e && e.message) || "Fehler im Demo-Modus."); }
      if (signal && signal.aborted) throw new Abbruch();
      return;
    }
    const abbruch = new AbortController();
    const stopp = () => abbruch.abort();
    if (signal) signal.addEventListener("abort", stopp);
    let uhr = setTimeout(stopp, 90000); // ohne jedes Lebenszeichen nicht ewig warten
    let r;
    try {
      r = await fetch(`${API}/api/chat`, {
        method: "POST", headers: { "X-Gabi-Zugang": zugang, "Content-Type": "application/json" },
        body: JSON.stringify(body), cache: "no-store", signal: abbruch.signal,
      });
    } catch {
      clearTimeout(uhr);
      if (signal) signal.removeEventListener("abort", stopp);
      if (signal && signal.aborted) throw new Abbruch();
      if (abbruch.signal.aborted) throw new Error("Gabi antwortet gerade nicht (Zeitüberschreitung). Bitte nochmal versuchen.");
      throw new Error(navigator.onLine === false ? "Kein Internet. Bitte Verbindung prüfen." : "Keine Verbindung zum Server. Bitte nochmal versuchen.");
    }
    try {
      if (r.status === 401) {
        zugangVergessen();
        zugangZeigen("Der Zugangscode gilt nicht mehr. Bitte neu eingeben.");
        throw new Abbruch();
      }
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        const f = new Error((d && d.fehler) || STATUS_TEXT(r.status));
        f.status = r.status;
        throw f;
      }
      const leser = r.body.getReader();
      const dekodierer = new TextDecoder();
      const zeilen = K.zeilenLeser();
      let ende = false;
      const weiter = (liste) => { for (const e of liste) { if (e.t === "fertig" || e.t === "fehler") ende = true; beiEreignis(e); } };
      try {
        for (;;) {
          const { done, value } = await leser.read();
          clearTimeout(uhr);
          uhr = setTimeout(stopp, 120000);
          if (done) break;
          weiter(zeilen.schieben(dekodierer.decode(value, { stream: true })));
        }
        weiter(zeilen.ende());
      } catch {
        if (signal && signal.aborted) throw new Abbruch();
        throw new Error("Die Verbindung ist abgebrochen. Bitte nochmal versuchen.");
      }
      if (!ende) throw new Error("Die Antwort kam nicht vollständig an. Bitte nochmal versuchen.");
    } finally {
      clearTimeout(uhr);
      if (signal) signal.removeEventListener("abort", stopp);
    }
  }

  // ==========================================================
  // 3 Start, Zugang, Demo, Offline
  // ==========================================================
  // Einblenden nur beim ersten Erscheinen nach dem Ladekreis. Beim Wechsel Gespräch ↔ Notizen sprang die ganze Ansicht
  // jedes Mal von unsichtbar auf sichtbar (Animation startet bei jedem hidden → sichtbar neu) – das war das Blinken.
  let gezeigteAnsicht = "laden";
  /**
   * Was schon eingeblendet ist, soll beim Wiedererscheinen nicht noch einmal einblenden: CSS-Animationen starten bei jedem
   * hidden → sichtbar neu. Deshalb beim Verlassen einer Ansicht die Einblend-Klassen entfernen und Nachrichten,
   * Modus-Pill und Statuszeile auf „gezeigt“ setzen.
   */
  function beruhigen(wurzel) {
    for (const k of wurzel.querySelectorAll(".einblenden")) k.classList.remove("einblenden");
    for (const k of wurzel.querySelectorAll(".nachricht, .modus-pill, .status-zeile")) k.style.animation = "none";
  }
  function ansichtZeigen(name) {
    const vorher = gezeigteAnsicht;
    gezeigteAnsicht = name;
    const ansichten = { laden: el.laden, zugang: el.zugang, offline: el.offline, chat: el.chat, notizen: el.notizen };
    for (const [n, knoten] of Object.entries(ansichten)) {
      if (n !== name) {
        if (!knoten.hidden) beruhigen(knoten);
        knoten.classList.remove("einblenden");
      }
      knoten.hidden = n !== name;
    }
    const neu = ansichten[name];
    if (vorher === "laden" && name !== "laden" && neu) {
      neu.classList.add("einblenden");
      const fertig = (e) => { if (e.target !== neu) return; neu.classList.remove("einblenden"); neu.removeEventListener("animationend", fertig); };
      neu.addEventListener("animationend", fertig);
    }
    const mitKopf = name === "chat" || name === "notizen";
    el.kopf.hidden = !mitKopf;
    el.app.classList.toggle("ohne-seite", !mitKopf);
    if (!mitKopf) schubladeSchliessen(true);
  }

  function zugangVergessen() {
    zugang = "";
    speicher.loeschen("lokal", "gabi.zugang");
  }

  function zugangZeigen(meldung = "") {
    gestartet = false;
    ansichtZeigen("zugang");
    el.zugangFehler.hidden = !meldung;
    el.zugangFehler.innerHTML = meldung ? `${symbol("warn")}<span>${esc(meldung)}</span>` : "";
    el.zugangCode.setAttribute("aria-invalid", meldung ? "true" : "false");
    setTimeout(() => el.zugangCode.focus(), 50);
  }

  el.zugangZeigen.addEventListener("click", () => {
    const sichtbar = el.zugangCode.type === "text";
    el.zugangCode.type = sichtbar ? "password" : "text";
    el.zugangZeigen.setAttribute("aria-pressed", String(!sichtbar));
    el.zugangZeigen.setAttribute("aria-label", sichtbar ? "Code anzeigen" : "Code verbergen");
    el.zugangZeigen.innerHTML = symbol(sichtbar ? "auge" : "auge-zu");
  });

  el.zugangCode.addEventListener("input", () => {
    if (el.zugangCode.getAttribute("aria-invalid") === "true") { el.zugangCode.setAttribute("aria-invalid", "false"); el.zugangFehler.hidden = true; }
  });
  el.patientKuerzel.addEventListener("input", () => { el.patientKuerzel.removeAttribute("aria-invalid"); el.patientFehler.hidden = true; });

  el.zugangForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = el.zugangCode.value.trim();
    if (!code) { zugangZeigen("Bitte den Zugangscode eingeben."); return; }
    el.zugangWeiter.disabled = true;
    el.zugangWeiter.innerHTML = '<span class="drehen"></span>Prüfe …';
    try {
      await api("/api/pruefen", { code });
      zugang = code;
      speicher.schreiben("lokal", "gabi.zugang", code);
      el.zugangCode.value = "";
      starten();
    } catch (f) {
      zugangZeigen(f.status === 401 ? "Der Zugangscode stimmt nicht." : f.message);
    } finally {
      el.zugangWeiter.disabled = false;
      el.zugangWeiter.textContent = "Weiter";
    }
  });

  const DEMO_TEXTE = {
    param: "Demo mit Beispieldaten und vorbereiteten Antworten (ohne KI) – nichts geht an einen Server.",
    "nicht-erreichbar": "Server nicht erreichbar – Gabi läuft im Demo-Modus mit Beispieldaten und vorbereiteten Antworten.",
    "nicht-eingerichtet": "Server noch nicht eingerichtet – Gabi läuft im Demo-Modus mit Beispieldaten und vorbereiteten Antworten.",
  };

  async function statusHolen() {
    // leere apiUrl = dieselbe Adresse (lokaler Server); fehlt der Server, kommt ein Fehler → Demo-Modus
    const abbruch = new AbortController();
    const uhr = setTimeout(() => abbruch.abort(), 8000);
    try {
      const r = await fetch(`${API}/api/status`, { cache: "no-store", signal: abbruch.signal });
      if (!r.ok) return "nicht-erreichbar";
      const d = await r.json();
      const bereit = typeof d.bereit === "boolean" ? d.bereit : Boolean(d.eingerichtet && d.eingerichtet.zugang && d.eingerichtet.supabase);
      return bereit ? "" : "nicht-eingerichtet";
    } catch {
      return "nicht-erreichbar";
    } finally {
      clearTimeout(uhr);
    }
  }

  async function backendPruefen() {
    const grund = await statusHolen();
    if (grund !== "nicht-erreichbar") return grund;
    await warte(1500); // kurzer Aussetzer? einmal nachfragen
    return statusHolen();
  }

  function demoStarten(grund) {
    modus.demo = true;
    modus.grund = grund;
    demoApi = DEMO.erstelleApi();
    document.body.classList.add("demo");
    el.testBadge.innerHTML = '<span class="punkt"></span>Demo';
    el.testBadge.classList.add("akzent");
    el.seitenFussText.textContent = DEMO_TEXTE[grund] || DEMO_TEXTE.param;
    starten();
    if (grund !== "param") toast(DEMO_TEXTE[grund], { dauer: 6000 });
  }

  function offlineZeigen(grund = "nicht-erreichbar") {
    ansichtZeigen("offline");
    const offline = navigator.onLine === false;
    el.offlineTitel.textContent = offline ? "Kein Internet" : grund === "nicht-eingerichtet" ? "Gabi ist gerade nicht bereit" : "Server nicht erreichbar";
    el.offlineText.textContent = offline
      ? "Dein Gerät ist offline. Sobald das Internet wieder da ist, geht es hier weiter."
      : grund === "nicht-eingerichtet"
        ? "Auf dem Server fehlt gerade noch etwas. Versuch es bitte später noch einmal – gespeicherte Notizen bleiben erhalten."
        : "Gabi erreicht den Server gerade nicht. Versuch es gleich noch einmal – gespeicherte Notizen bleiben erhalten.";
  }
  // „Demo ansehen“ ohne Seitenwechsel – geht auch ohne Internet, alles ist schon geladen
  const offlineDemo = el.offline.querySelector('a[href*="demo=1"]');
  if (offlineDemo) {
    offlineDemo.addEventListener("click", (e) => {
      e.preventDefault();
      history.replaceState(null, "", `${location.pathname}?demo=1#/`);
      demoStarten("param");
    });
  }
  el.offlineErneut.addEventListener("click", () => start());
  window.addEventListener("online", () => { if (!el.offline.hidden) start(); });

  // Scrollposition steuert die App (nach dem Neuladen sonst „Nochmal versuchen“ unter der Eingabezeile)
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch { /* egal */ }

  let gestartet = false;
  let startLaeuft = null;
  /** App starten (nach Zugang oder im Demo-Modus): Gesprächsverlauf öffnen, Patienten laden, Adresse zeigen. */
  function starten() {
    if (startLaeuft) return startLaeuft;
    startLaeuft = (async () => {
      gestartet = false; // Navigation wartet, bis der Verlauf bereit ist
      ordnerZwischenspeicherLeeren();
      await verlaufStarten();
      gestartet = true;
      const patienten = patientenLaden().catch(() => {});
      gruessen();
      await route();
      patienten.then(v1EntwurfUebernehmen); // erst nach der Adresse: der alte Entwurf landet im gezeigten Gespräch
      AUFNAHME.rechtBeobachten((s) => { mikroGesperrt = s === "denied"; });
    })().finally(() => { startLaeuft = null; });
    return startLaeuft;
  }

  async function start() {
    ansichtZeigen("laden");
    if (DEMO_PARAM) return demoStarten("param");
    const grund = await backendPruefen();
    // Auf der echten Adresse nie still in die Demo (die Offline-Seite bietet „Demo ansehen“ an); lokal und in Tests schon
    if ((grund === "nicht-erreichbar" || grund === "nicht-eingerichtet") && (zugang || PRODUKTION)) return offlineZeigen(grund);
    if (grund) return demoStarten(grund);
    if (zugang) return starten();
    zugangZeigen();
  }

  // Info-Dialog (Badge „Testversion“ / „Demo“)
  el.testBadge.addEventListener("click", () => {
    const demoPunkt = document.getElementById("info-demo");
    if (demoPunkt) demoPunkt.hidden = !modus.demo;
    el.infoTitel.textContent = modus.demo ? "Demo-Modus" : "Testversion";
    el.infoZuruecksetzen.hidden = !modus.demo;
    el.infoVerbinden.hidden = !modus.demo;
    el.infoAbmelden.hidden = modus.demo || !zugang;
    el.dialogInfo.showModal();
  });
  el.infoZuruecksetzen.addEventListener("click", async () => {
    el.dialogInfo.close();
    if (!(await frage("Beispieldaten zurücksetzen?", "Alle Änderungen im Demo-Modus gehen verloren, auch die Demo-Gespräche.", { ja: "Zurücksetzen", gefahr: true }))) return;
    demoApi.zuruecksetzen();
    await gespraecheLeeren(); // Demo-Gespräche verweisen sonst auf Notizen, die es nicht mehr gibt
    ordnerZwischenspeicherLeeren();
    await patientenLaden().catch(() => {});
    if ((location.hash || "#/") !== "#/") location.hash = "#/";
    else route();
    toast("Beispieldaten sind zurückgesetzt.", { art: "erfolg" });
  });
  el.infoVerbinden.addEventListener("click", () => {
    history.replaceState(null, "", `${location.pathname}#/`); // ohne ?demo=1
    location.reload();
  });
  el.infoAbmelden.addEventListener("click", async () => {
    el.dialogInfo.close();
    const a = aufnahmen.size;
    const e = gesamtEntwuerfe();
    const text = [
      "Der Zugangscode wird auf diesem Gerät gelöscht.",
      a === 1 ? "Eine Aufnahme ist noch nicht gesendet und geht verloren." : a > 1 ? `${a} Aufnahmen sind noch nicht gesendet und gehen verloren.` : "",
      e === 1 ? "In den Gesprächen ist ein Entwurf noch nicht gespeichert." : e > 1 ? `In den Gesprächen sind ${e} Entwürfe noch nicht gespeichert.` : "",
    ].filter(Boolean).join(" ");
    if (!(await frage("Abmelden?", text, { ja: "Abmelden", gefahr: Boolean(a || e), haken: "Gespräche auf diesem Gerät auch löschen" }))) return;
    if (el.frageHaken.checked) {
      await gespraecheLeeren();
      // „auf diesem Gerät“ heißt alle: auch die getrennt gespeicherten Demo-Gespräche (die Demo-Beispieldaten bleiben)
      await VERLAUF.resteLoeschen({ demo: true });
      for (const k of ["gabi.demo.gespraech.v2", "gabi.demo.gespraeche.notfall", "gabi.entwurf.demo"]) speicher.loeschen("sitzung", k);
      speicher.schreiben("lokal", "gabi.demo.gespraeche.geleert-am", String(Date.now()));
      const demoKanal = VERLAUF.kanal("gabi-demo-gespraeche", () => {}); // offene Demo-Tabs: alles gelöscht
      demoKanal.senden({ art: "geleert" });
      setTimeout(() => demoKanal.schliessen(), 500);
    } else {
      neuesLeeresZeigen(); // laufende Antwort sauber beenden – die Gespräche bleiben auf diesem Gerät
      verlauf.sitzung += 1; // Sitzung endet: was jetzt noch zurückkommt (Aufnahme), wird nicht mehr geparkt
    }
    aufnahmen.clear();
    ordnerZwischenspeicherLeeren();
    zugangVergessen();
    zugangZeigen();
  });

  // ==========================================================
  // 4 Navigation: #/ = neues Gespräch · #/gespraech/<id> = gespeichertes Gespräch · #/notizen …
  //   In der Adresse steht nur die ID – nie ein Gesprächsinhalt.
  // ==========================================================
  let letzterHash = location.hash || "#/";
  let routeLaeuft = false;
  const jetzigerHash = () => location.hash || "#/";
  const GESPRAECH_ADRESSE = /^#\/gespraech\/([0-9A-Za-z-]{8,64})$/;

  /** Bereich umschalten (Gespräch ↔ Notizen) – erst, wenn der neue Inhalt bereitsteht: kein leerer Zwischenzustand. */
  function bereichZeigen(notizen) {
    ansichtZeigen(notizen ? "notizen" : "chat");
    for (const a of document.querySelectorAll(".navi a")) {
      if (a.dataset.navi === (notizen ? "notizen" : "chat")) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    el.kopfWechsel.setAttribute("href", notizen ? chatHash() : "#/notizen");
    el.kopfWechsel.setAttribute("aria-label", notizen ? "Gespräch" : "Notizen"); // unter 440 px nur das Symbol
    ersetzen(el.kopfWechsel, notizen ? `${symbol("chat")}<span class="beschriftung">Gespräch</span>` : `${symbol("notizen")}<span class="beschriftung">Notizen</span>`);
  }

  async function route() {
    if (!gestartet || routeLaeuft) return;
    // alte v1-Adressen (#/aufnahme, #/ordner/…) auf v2 umleiten
    const roh = jetzigerHash();
    let ziel = roh.replace(/^#\/ordner(?=\/|$)/, "#/notizen").replace(/^#\/aufnahme$/, "#/");
    if (ziel !== roh) history.replaceState(null, "", ziel);
    routeLaeuft = true;
    try {
      if (ziel !== letzterHash && ordner.geaendert && !(await frage("Änderungen verwerfen?", "Du hast die Notiz bearbeitet, aber noch nicht gespeichert.", { ja: "Verwerfen", nein: "Weiter bearbeiten", gefahr: true }))) {
        history.replaceState(null, "", letzterHash);
        return;
      }
      ordner.geaendert = false;
      const vorher = letzterHash;
      if (ziel !== vorher) ordner.bearbeiten = null; // Bearbeiten endet beim Verlassen (sonst bliebe die Notiz später hängen)
      if (ziel.startsWith("#/notizen")) {
        letzterHash = ziel;
        await notizenZeigen(ziel); // aus dem Zwischenspeicher sofort, sonst höchstens kurz warten (alter Inhalt bleibt so lange)
        if (jetzigerHash() !== ziel) return; // inzwischen woanders hin
        bereichZeigen(true);
        if (!ziel.includes("/n/") || vorher !== ziel) window.scrollTo(0, 0); // Notiz: oben mit Datum und Patient
        return;
      }
      // Gespräch
      const id = (GESPRAECH_ADRESSE.exec(ziel) || [])[1];
      if (id) {
        if (id !== chat.gespraech.id) {
          const g = await gespraechHolen(id);
          if (jetzigerHash() !== ziel) return;
          if (g) gespraechAktivieren(g);
          else {
            toast("Dieses Gespräch gibt es auf diesem Gerät nicht (mehr).", { art: "warn" });
            if (chat.gespraech.gespeichert) gespraechAktivieren(gespraechAnlegen());
            ziel = "#/";
            history.replaceState(null, "", ziel);
          }
        }
      } else {
        // #/ (oder unbekannt): das offene Gespräch zeigen. Ein neues legen nur die Knöpfe „Neues Gespräch“ an – sonst
        // würde z. B. die Zurück-Taste auf einen alten „#/“-Eintrag eine laufende Antwort abbrechen.
        if (ziel !== chatHash()) { ziel = chatHash(); history.replaceState(null, "", ziel); }
      }
      letzterHash = ziel;
      bereichZeigen(false);
      gespraechZeigen();
      window.scrollTo(0, chat.nachrichten.length ? document.documentElement.scrollHeight : 0);
    } finally {
      routeLaeuft = false;
      if (jetzigerHash() !== letzterHash) route();
    }
  }
  window.addEventListener("hashchange", route);
  window.addEventListener("scroll", () => el.kopf.classList.toggle("mit-linie", window.scrollY > 4), { passive: true });

  // ==========================================================
  // 5 Gespräch – mehrere Gespräche, NUR auf diesem Gerät (gespraeche.js: IndexedDB, sonst localStorage)
  // ==========================================================
  // eintraege = Liste (ohne Inhalt) · inhalte = in diesem Tab geöffnete Gespräche · geloescht = nie wieder anlegen ·
  // sitzung zählt bei Start, „Alle löschen“ und Abmelden hoch: Gespräche einer früheren Sitzung werden nie mehr geschrieben
  // (z. B. eine Spracherkennung, die erst nach „Abmelden + Gespräche löschen“ zurückkommt)
  const verlauf = { ablage: null, eintraege: [], inhalte: new Map(), geloescht: new Set(), kanal: null, umbenennen: null, fehlerGezeigt: false, sitzung: 0 };
  const gespraechAnlegen = () => {
    const jetzt = Date.now();
    return { id: neueId(), titel: "", titelEigen: false, erstellt: jetzt, geaendert: jetzt, gespeichert: false, nachrichten: [], sitzung: verlauf.sitzung };
  };
  // chat.gespraech = das offene Gespräch; chat.nachrichten zeigt immer auf dessen Nachrichten
  const chat = { gespraech: gespraechAnlegen(), laeuft: null, modus: null, patienten: null, get nachrichten() { return this.gespraech.nachrichten; } };
  /** Gehört nicht mehr dazu: gelöscht oder aus einer früheren Sitzung. */
  const verwaist = (g) => !g || g.sitzung !== verlauf.sitzung || verlauf.geloescht.has(g.id);
  /** Adresse des offenen Gesprächs: gespeichert → #/gespraech/<id>, sonst #/. */
  const chatHash = (g = chat.gespraech) => (g.gespeichert ? `#/gespraech/${g.id}` : "#/");

  function gruessen() {
    const h = new Date().getHours();
    const gruss = h < 5 ? "Hallo" : h < 11 ? "Guten Morgen" : h < 18 ? "Hallo" : "Guten Abend";
    el.gruss.innerHTML = `${gruss}, ich bin Gabi<span class="akzent">.</span>`;
  }

  /** Links „Gespräch“ (Navigation, Marke, Umschalter im Ordner) führen zum offenen Gespräch. */
  function chatLinksAktualisieren() {
    const h = chatHash();
    for (const a of document.querySelectorAll('.navi a[data-navi="chat"], a.marke')) a.setAttribute("href", h);
    if (jetzigerHash().startsWith("#/notizen")) el.kopfWechsel.setAttribute("href", h);
  }

  // ---------- Öffnen beim Start ----------
  async function verlaufStarten() {
    verlauf.sitzung += 1;
    if (verlauf.kanal) verlauf.kanal.schliessen();
    verlauf.ablage = await VERLAUF.ablageOeffnen({ demo: modus.demo });
    unbestaetigt.clear();
    await notfallNachtragen();
    try { verlauf.eintraege = (await verlauf.ablage.liste()) || []; } catch { verlauf.eintraege = []; }
    verlauf.inhalte.clear();
    verlauf.geloescht.clear();
    verlauf.kanal = VERLAUF.kanal(modus.demo ? "gabi-demo-gespraeche" : "gabi-gespraeche", fremdeAenderung);
    chat.gespraech = gespraechAnlegen();
    chat.modus = null;
    gezeigtesGespraech = null;
    await version20Uebernehmen();
    if (verlauf.ablage.art === "speicher") toast("Dieser Browser speichert hier nichts dauerhaft – Gespräche bleiben nur, bis der Tab geschlossen wird.", { art: "warn", dauer: 7000 });
    if (verlauf.ablage.nachgeholt) toast("Gespräche, die beim letzten Abmelden nicht gelöscht werden konnten, sind jetzt gelöscht.", { dauer: 6000 });
    gespraecheZeigen();
    chatLinksAktualisieren();
  }

  /** v2.0 hatte ein Gespräch pro Tab (sessionStorage) → wird erster Eintrag der Liste. Alte Kopie erst nach dem Sichern löschen. */
  async function version20Uebernehmen() {
    const schl = schluessel("gespraech.v2");
    const roh = speicher.lesen("sitzung", schl);
    if (roh === null) return;
    const alt = VERLAUF.ausVersion20(roh);
    if (!alt) { speicher.loeschen("sitzung", schl); return; }
    const g = gespraechAnlegen();
    g.nachrichten = VERLAUF.vorbereiten(alt);
    g.titel = VERLAUF.titelAus(g.nachrichten);
    g.gespeichert = true;
    const m = VERLAUF.meta(g);
    try { await verlauf.ablage.speichern(m, VERLAUF.bereinigen(g.nachrichten)); } catch {
      toast("Das bisherige Gespräch konnte noch nicht übernommen werden – es bleibt in diesem Tab, der nächste Start versucht es wieder.", { art: "warn", dauer: 7000 });
      return;
    }
    if (verlauf.ablage.art !== "speicher") speicher.loeschen("sitzung", schl);
    verlauf.inhalte.set(g.id, g);
    eintragSetzen(m);
    // war es gerade offen (v2.0-Adresse #/ bzw. v1 #/aufnahme): gleich wieder zeigen
    if (["#/", "#/aufnahme"].includes(jetzigerHash())) history.replaceState(null, "", `#/gespraech/${g.id}`);
  }

  /** Liste aus der Ablage lesen – Gespräche, die dieser Tab gerade schreibt, bleiben drin (ihr Schreiben kann noch laufen). */
  async function listeNeuLesen() {
    const liste = (await verlauf.ablage.liste()) || [];
    const da = new Set(liste.map((m) => m.id));
    for (const g of verlauf.inhalte.values()) if (g.gespeichert && !da.has(g.id) && !verlauf.geloescht.has(g.id)) liste.push(VERLAUF.meta(g));
    verlauf.eintraege = liste.filter((m) => !verlauf.geloescht.has(m.id));
  }

  /** Ein anderer Tab hat etwas geändert: Liste neu lesen; dort Gelöschtes hier nicht wieder anlegen. */
  async function fremdeAenderung(d) {
    if (!verlauf.ablage) return;
    // nur Gespeichertes sperren – ein hier gerade neu begonnenes Gespräch (noch ohne Eintrag) muss speichern dürfen
    const weg = d.art === "geleert" ? [...verlauf.eintraege.map((e) => e.id), ...verlauf.inhalte.keys()].filter((id) => id !== chat.gespraech.id || chat.gespraech.gespeichert)
      : d.art === "geloescht" ? (d.ids || []) : [];
    for (const id of weg) { verlauf.geloescht.add(id); if (id !== chat.gespraech.id) verlauf.inhalte.delete(id); }
    if (weg.length) sperreMerken(weg);
    try { await listeNeuLesen(); } catch { return; }
    if (chat.gespraech.gespeichert && verlauf.geloescht.has(chat.gespraech.id)) {
      const alt = chat.gespraech.id;
      neuesLeeresZeigen();
      verlauf.inhalte.delete(alt);
      toast("Dieses Gespräch wurde in einem anderen Fenster gelöscht.", { art: "warn" });
    } else if (d.art === "geaendert" && d.id) await fremdGeaendert(d.id);
    gespraecheZeigen();
  }

  /**
   * Ein anderer Tab hat ein Gespräch geändert, das hier geladen ist: Namen übernehmen; ist es hier offen und gerade nichts
   * in Arbeit, den neuen Stand zeigen – so überschreibt dieser Tab beim nächsten Speichern nichts aus dem anderen.
   */
  async function fremdGeaendert(id) {
    const g = verlauf.inhalte.get(id);
    const m = verlauf.eintraege.find((e) => e.id === id);
    if (!g || !m) return;
    if (!g.titelEigen || m.titelEigen) { g.titel = m.titel; g.titelEigen = Boolean(m.titelEigen); }
    if (g !== chat.gespraech) { verlauf.inhalte.delete(id); return; } // beim nächsten Öffnen frisch aus der Ablage
    let fremd = null;
    try { fremd = await verlauf.ablage.laden(id); } catch { return; }
    if (!Array.isArray(fremd) || g !== chat.gespraech) return;
    // zusammenführen: hier Laufendes und Bearbeitetes bleibt, Änderungen und neue Nachrichten des anderen Tabs kommen dazu
    // (antwortet der andere noch, folgt nach seinem Ende eine weitere Meldung)
    const laufend = chat.laeuft && chat.laeuft.gabi;
    const r = VERLAUF.zusammenfuehren(g.nachrichten, VERLAUF.vorbereiten(fremd.filter((n) => n && !n.unterwegs), { fremd: true }), {
      inArbeit: (n) => n === laufend || (n.karten || []).some((k) => k.bearbeiten || k.speichert || k.sendet || aufnahmen.has(k.id)),
    });
    if (!r.neu.length && !r.geaendert.length) return;
    const unten = nahUnten();
    g.nachrichten = r.nachrichten;
    g.geaendert = Math.max(Number(m.geaendert) || 0, g.geaendert);
    for (const n of r.geaendert) nachrichtNeuZeichnen(n);
    if (r.neu.length) nachrichtenAbgleichen();
    if (unten && !el.chat.hidden) nachUntenRollen();
  }

  // ---------- Speichern (nur dieses Gerät) ----------
  const zuSchreiben = new Set();
  let merkenUhr = null;
  /**
   * Gespräch merken – sofort (neue Nachricht, Antwort beginnt/endet, Karte geändert: IndexedDB schreibt in Millisekunden,
   * ein Neuladen direkt danach verliert nichts). Nur Tippen in einer Karte wird gebündelt (spaeter: true, 300 ms).
   */
  function gespraechMerken(g = chat.gespraech, { spaeter = false } = {}) {
    if (!g) return;
    if (!spaeter || !g.gespeichert) { zuSchreiben.delete(g); gespraechSchreiben(g); return; }
    zuSchreiben.add(g);
    clearTimeout(merkenUhr);
    merkenUhr = setTimeout(allesSchreiben, 300);
  }
  function allesSchreiben() {
    clearTimeout(merkenUhr);
    merkenUhr = null;
    const liste = [...zuSchreiben];
    zuSchreiben.clear();
    for (const g of liste) gespraechSchreiben(g);
  }
  // App geht in den Hintergrund oder die Seite wird verlassen (iOS verwirft solche Tabs gern): sofort sichern
  const sofortSichern = () => { if (merkenUhr || zuSchreiben.size) allesSchreiben(); };
  document.addEventListener("visibilitychange", () => { if (document.hidden) sofortSichern(); });

  // ---------- Notfall-Kopie ----------
  // IndexedDB bricht Schreibvorgänge ab, die beim Entladen der Seite noch laufen (Neuladen direkt nach einer Änderung).
  // Was noch nicht bestätigt ist, kommt beim Verlassen synchron in sessionStorage; der nächste Start trägt es nach.
  const unbestaetigt = new Map(); // id → { m, nachrichten } · { id, weg: true } · "*" → { alle: true }
  const NOTFALL = () => schluessel("gespraeche.notfall");
  function ablageSpeichern(m, nachrichten) {
    const vorher = unbestaetigt.get(m.id);
    const eintrag = { m, nachrichten: nachrichten || (vorher && vorher.nachrichten) || null };
    unbestaetigt.set(m.id, eintrag);
    return verlauf.ablage.speichern(m, nachrichten).then(() => { if (unbestaetigt.get(m.id) === eintrag) unbestaetigt.delete(m.id); });
  }
  function ablageLoeschen(ids) {
    const eintraege = ids.map((id) => { const e = { id, weg: true }; unbestaetigt.set(id, e); return e; });
    return verlauf.ablage.loeschen(ids).then(() => { for (const e of eintraege) if (unbestaetigt.get(e.id) === e) unbestaetigt.delete(e.id); });
  }
  async function ablageLeeren() {
    unbestaetigt.clear();
    const e = { alle: true };
    unbestaetigt.set("*", e);
    await verlauf.ablage.leeren();
    if (unbestaetigt.get("*") === e) unbestaetigt.delete("*");
  }
  window.addEventListener("pagehide", () => {
    sofortSichern(); // startet die letzten Schreibvorgänge …
    if (unbestaetigt.size) speicher.schreiben("sitzung", NOTFALL(), JSON.stringify([...unbestaetigt.values()])); // … und sichert sie synchron
  });
  window.addEventListener("pageshow", (e) => { if (e.persisted) speicher.loeschen("sitzung", NOTFALL()); }); // aus dem Zurück-Cache: läuft einfach weiter
  /** Beim Start: abgebrochene Schreibvorgänge der letzten Seite nachtragen (nie Neueres überschreiben). */
  // dauerhaft (localStorage): gelöschte IDs und Zeitpunkt von „Alle löschen“ – damit eine Notfall-Kopie nichts zurückbringt,
  // was inzwischen (auch in einem anderen Tab) gelöscht wurde
  const SPERRE = () => schluessel("gespraeche.geloescht");
  const GELEERT = () => schluessel("gespraeche.geleert-am");
  function sperreMerken(ids) {
    let alt = [];
    try { alt = JSON.parse(speicher.lesen("lokal", SPERRE()) || "[]"); } catch { alt = []; }
    speicher.schreiben("lokal", SPERRE(), JSON.stringify([...new Set([...(Array.isArray(alt) ? alt : []), ...ids])].slice(-300)));
  }
  async function notfallNachtragen() {
    const roh = speicher.lesen("sitzung", NOTFALL());
    if (!roh) return;
    let gesperrt = new Set();
    try { gesperrt = new Set(JSON.parse(speicher.lesen("lokal", SPERRE()) || "[]")); } catch { gesperrt = new Set(); }
    const geleertAm = Number(speicher.lesen("lokal", GELEERT())) || 0;
    const nachgetragen = [];
    let liste = [];
    try { liste = JSON.parse(roh); } catch { liste = []; }
    if (!Array.isArray(liste)) liste = [];
    try {
      if (liste.some((e) => e && e.alle)) await verlauf.ablage.leeren(); // „Alle löschen“/Abmelden war noch nicht fertig
      const vorhanden = new Map(((await verlauf.ablage.liste()) || []).map((m) => [m.id, m]));
      for (const e of liste) {
        if (!e || e.alle) continue;
        if (e.weg && e.id) { await verlauf.ablage.loeschen([e.id]); continue; }
        if (!e.m || !e.m.id || gesperrt.has(e.m.id) || (Number(e.m.erstellt) || 0) <= geleertAm) continue; // inzwischen gelöscht
        const da = vorhanden.get(e.m.id);
        if (da && Math.max(Number(da.gespeichertAm) || 0, Number(da.geaendert) || 0) > Math.max(Number(e.m.gespeichertAm) || 0, Number(e.m.geaendert) || 0)) continue; // inzwischen Neueres gespeichert
        if (!da && !Array.isArray(e.nachrichten)) continue; // ohne Inhalt nichts anlegen
        await verlauf.ablage.speichern(e.m, Array.isArray(e.nachrichten) ? e.nachrichten : null);
        nachgetragen.push(e.m.id);
      }
      speicher.loeschen("sitzung", NOTFALL());
      if (nachgetragen.length) setTimeout(() => { for (const id of nachgetragen) if (verlauf.kanal) verlauf.kanal.senden({ art: "geaendert", id }); }, 0);
    } catch { /* nächster Start versucht es wieder */ }
  }

  function speicherFehler() {
    if (verlauf.fehlerGezeigt) return;
    verlauf.fehlerGezeigt = true;
    toast("Gespräche können auf diesem Gerät gerade nicht gespeichert werden (Speicher voll oder gesperrt).", { art: "warn", dauer: 7000 });
  }

  function eintragSetzen(m) {
    const i = verlauf.eintraege.findIndex((e) => e.id === m.id);
    if (i >= 0) verlauf.eintraege[i] = m;
    else verlauf.eintraege.push(m);
  }

  function gespraechSchreiben(g) {
    if (!verlauf.ablage || verwaist(g) || VERLAUF.istLeer(g.nachrichten)) return; // gelöscht/alte Sitzung/leer: nicht speichern
    if (!g.titelEigen) g.titel = VERLAUF.titelAus(g.nachrichten);
    const erstes = !g.gespeichert;
    g.gespeichert = true;
    verlauf.inhalte.set(g.id, g);
    const m = { ...VERLAUF.meta(g), gespeichertAm: Date.now() };
    eintragSetzen(m);
    ablageSpeichern(m, VERLAUF.bereinigen(g.nachrichten))
      .then(() => verlauf.kanal && verlauf.kanal.senden({ art: "geaendert", id: g.id }))
      .catch(speicherFehler);
    if (erstes) {
      if (g === chat.gespraech && !jetzigerHash().startsWith("#/notizen")) {
        const h = chatHash(g);
        history.replaceState(null, "", h); // ab jetzt eigene Adresse: Neuladen und Zurück öffnen dieses Gespräch
        letzterHash = h;
      }
      chatLinksAktualisieren();
      limitPruefen();
    }
    gespraecheZeigen();
  }

  /** Mehr als 50 Gespräche: die am längsten unbenutzten fliegen raus – mit dezentem Hinweis. */
  function limitPruefen() {
    const weg = VERLAUF.ueberzaehlige(verlauf.eintraege, { aktiv: chat.gespraech.id });
    if (!weg.length) return;
    const erster = verlauf.eintraege.find((e) => e.id === weg[0]);
    entfernen(weg);
    toast(weg.length === 1
      ? `Gabi behält höchstens ${VERLAUF.MAX} Gespräche – das älteste („${erster ? erster.titel : "Gespräch"}“) wurde gelöscht.`
      : `Gabi behält höchstens ${VERLAUF.MAX} Gespräche – die ${weg.length} ältesten wurden gelöscht.`, { dauer: 6000 });
  }

  /** Gespräche löschen (Liste, Inhalt, nicht gesendete Aufnahmen darin) – gelöscht bleibt gelöscht. */
  function entfernen(ids) {
    sperreMerken(ids);
    for (const id of ids) {
      verlauf.geloescht.add(id);
      const g = verlauf.inhalte.get(id);
      if (g) {
        zuSchreiben.delete(g);
        for (const k of VERLAUF.kartenVon(g.nachrichten)) aufnahmen.delete(k.id);
      }
      verlauf.inhalte.delete(id);
    }
    verlauf.eintraege = verlauf.eintraege.filter((e) => !ids.includes(e.id));
    if (verlauf.ablage) {
      ablageLoeschen(ids)
        .then(() => verlauf.kanal && verlauf.kanal.senden({ art: "geloescht", ids }))
        .catch(speicherFehler);
    }
  }

  // ---------- Öffnen und Wechseln ----------
  async function gespraechHolen(id) {
    if (verlauf.inhalte.has(id)) return verlauf.inhalte.get(id);
    if (!verlauf.ablage || verlauf.geloescht.has(id)) return null;
    if (!verlauf.eintraege.some((e) => e.id === id)) { try { await listeNeuLesen(); } catch { /* bleibt */ } } // z. B. eben in einem anderen Tab angelegt
    const m = verlauf.eintraege.find((e) => e.id === id);
    if (!m) return null;
    let nachrichten = null;
    try { nachrichten = await verlauf.ablage.laden(id); } catch { nachrichten = null; }
    if (!Array.isArray(nachrichten)) return null;
    if (verlauf.inhalte.has(id)) return verlauf.inhalte.get(id); // inzwischen geladen
    const g = { id, titel: m.titel, titelEigen: Boolean(m.titelEigen), erstellt: m.erstellt, geaendert: m.geaendert, gespeichert: true, nachrichten: VERLAUF.vorbereiten(nachrichten), sitzung: verlauf.sitzung };
    verlauf.inhalte.set(id, g);
    return g;
  }

  /**
   * Anderes Gespräch zeigen. Eine laufende Antwort wird sauber abgebrochen und bleibt im alten Gespräch („Abgebrochen.“);
   * Diktat-/Such-Modus enden – so landet nichts im falschen Gespräch und kein Entwurf beim falschen Patienten.
   */
  function gespraechAktivieren(g) {
    if (!g || g === chat.gespraech) return;
    if (chat.laeuft) { chat.laeuft.abbruch.abort(); chat.laeuft = null; }
    sprechenStoppen();
    sofortSichern();
    chat.gespraech = g;
    chat.modus = null;
    allesZeigen();
    chatLinksAktualisieren();
    gespraecheZeigen();
    eingabeAktualisieren();
  }

  /** Neues leeres Gespräch als offenes – ohne neuen Eintrag im Browserverlauf. */
  function neuesLeeresZeigen() {
    gespraechAktivieren(gespraechAnlegen());
    if (!jetzigerHash().startsWith("#/notizen") && jetzigerHash() !== "#/") { history.replaceState(null, "", "#/"); letzterHash = "#/"; }
    chatLinksAktualisieren();
  }

  /** „Neues Gespräch“: das alte bleibt in der Liste (nichts geht verloren, auch keine Aufnahme oder kein Entwurf). */
  function neuesGespraech() {
    const ausSchublade = el.schublade.open;
    if (chat.nachrichten.length || chat.gespraech.gespeichert) gespraechAktivieren(gespraechAnlegen());
    if (jetzigerHash() !== "#/") location.hash = "#/";
    gruessen();
    // Touch: kein Fokus (sonst springt die Tastatur auf); sonst ins Eingabefeld – aus der Schublade erst, wenn sie zu ist
    const fokus = () => { if (!GROB) el.text.focus({ preventScroll: true }); };
    if (ausSchublade) schubladeSchliessen(false, fokus);
    else fokus();
  }
  el.kopfNeu.addEventListener("click", neuesGespraech);
  el.seiteNeu.addEventListener("click", neuesGespraech);

  /** Alle Gespräche dieses Modus löschen (Liste, Inhalte, nicht gesendete Aufnahmen) – danach ein leeres Gespräch. */
  async function gespraecheLeeren() {
    verlauf.sitzung += 1; // was jetzt noch zurückkommt (Antwort, Spracherkennung), gehört zu nichts mehr
    speicher.schreiben("lokal", GELEERT(), String(Date.now()));
    for (const e of verlauf.eintraege) verlauf.geloescht.add(e.id);
    for (const id of verlauf.inhalte.keys()) verlauf.geloescht.add(id);
    if (chat.gespraech.gespeichert) verlauf.geloescht.add(chat.gespraech.id);
    zuSchreiben.clear();
    clearTimeout(merkenUhr);
    merkenUhr = null;
    neuesLeeresZeigen();
    aufnahmen.clear();
    verlauf.inhalte.clear();
    verlauf.eintraege = [];
    let geleert = true;
    if (verlauf.ablage) {
      try { await ablageLeeren(); if (verlauf.kanal) verlauf.kanal.senden({ art: "geleert" }); }
      catch {
        geleert = false; // z. B. Verbindung zu IndexedDB gerade weg: beim nächsten Start zuerst löschen
        if (verlauf.ablage.art === "indexeddb") VERLAUF.leerenNachholen({ demo: modus.demo });
        toast("Die Gespräche ließen sich gerade nicht vollständig löschen – das passiert automatisch beim nächsten Start.", { art: "warn", dauer: 8000 });
      }
      await VERLAUF.resteLoeschen({ demo: modus.demo, art: verlauf.ablage.art }); // auch Reste in den anderen Ablagen
      if (!geleert && verlauf.ablage.art === "indexeddb") VERLAUF.leerenNachholen({ demo: modus.demo }); // resteLoeschen nimmt die Marke sonst weg
    }
    // und was sonst noch im Tab liegt: v2.0-Gespräch, Notfall-Kopie, offener v1-Entwurf
    speicher.loeschen("sitzung", schluessel("gespraech.v2"));
    speicher.loeschen("sitzung", NOTFALL());
    speicher.loeschen("sitzung", modus.demo ? "gabi.entwurf.demo" : "gabi.entwurf");
    gespraecheZeigen();
  }

  const offeneEntwuerfe = () => chat.nachrichten.flatMap((n) => n.karten || []).filter((k) => k.typ === "entwurf" && !k.gespeichert && !k.verworfen);
  /** Nicht gespeicherte Entwürfe in allen Gesprächen dieses Geräts. */
  function gesamtEntwuerfe() {
    const ids = new Set(verlauf.eintraege.map((e) => e.id));
    let summe = verlauf.eintraege.reduce((s, e) => {
      const g = verlauf.inhalte.get(e.id);
      return s + (g ? VERLAUF.offeneEntwuerfe(g.nachrichten) : Number(e.entwuerfe) || 0);
    }, 0);
    if (!ids.has(chat.gespraech.id)) summe += VERLAUF.offeneEntwuerfe(chat.nachrichten);
    return summe;
  }

  function gespraechZeigen() {
    if (gezeigtesGespraech !== chat.gespraech) allesZeigen(); // nur nach einem Wechsel neu aufbauen – nicht bei jedem Zurück
    else rahmenAktualisieren();
    eingabeAktualisieren();
  }

  // ---------- Liste der Gespräche (Seitenleiste am Laptop, Schublade am Handy) ----------
  function gespraecheHtml() {
    const gruppen = VERLAUF.gruppieren(verlauf.eintraege);
    if (!gruppen.length) {
      return `<div class="gespraeche-leer">${symbol("chat")}<p><strong>Noch keine Gespräche</strong><span>Sie erscheinen hier – nur auf diesem Gerät gespeichert.</span></p></div>`;
    }
    const aktiv = chat.gespraech.gespeichert ? chat.gespraech.id : "";
    const eintrag = (e) => {
      const an = e.id === aktiv;
      const titel = esc(e.titel || "Gespräch");
      return `<li class="gespraech-eintrag${an ? " aktiv" : ""}" data-gespraech="${esc(e.id)}">
        <a class="gespraech-link" href="#/gespraech/${esc(e.id)}"${an ? ' aria-current="true"' : ""} title="${titel}">${titel}</a>
        <span class="gespraech-aktionen">
          <button class="rund-knopf klein" type="button" data-gespraech-aktion="umbenennen" aria-label="Umbenennen: ${titel}" title="Umbenennen">${symbol("stift")}</button>
          <button class="rund-knopf klein" type="button" data-gespraech-aktion="loeschen" aria-label="Löschen: ${titel}" title="Löschen">${symbol("muell")}</button>
        </span></li>`;
    };
    return `${gruppen.map((g) => `<section class="gespraeche-gruppe"><h3 class="gespraeche-gruppe-titel">${g.titel}</h3><ul>${g.eintraege.map(eintrag).join("")}</ul></section>`).join("")}
      <div class="gespraeche-fuss"><p>Nur auf diesem Gerät · höchstens ${VERLAUF.MAX}</p>
        <button class="knopf leise klein" type="button" data-gespraeche="alle-loeschen">${symbol("muell")}Alle Gespräche löschen</button></div>`;
  }

  function gespraecheZeigen() {
    if (verlauf.umbenennen) { verlauf.verpasst = true; return; } // nicht unter den Fingern neu bauen – danach nachholen
    const html = gespraecheHtml();
    for (const liste of [el.seitenGespraeche, el.schubladeListe]) {
      // Tastatur-Fokus in der Liste merken und nach dem Neuaufbau wiederherstellen (gleicher Eintrag, sonst ein Nachbar)
      const f = document.activeElement && liste.contains(document.activeElement) ? document.activeElement : null;
      const eintrag = f && f.closest("[data-gespraech]");
      const merke = f && { id: eintrag && eintrag.dataset.gespraech, aktion: f.dataset.gespraechAktion || "", alle: f.matches('[data-gespraeche="alle-loeschen"]'),
        nachbarn: eintrag ? [...liste.querySelectorAll("[data-gespraech]")].map((x) => x.dataset.gespraech) : [] };
      if (!ersetzen(liste, html) || !merke) continue;
      const ziel = (merke.id && (liste.querySelector(`[data-gespraech="${CSS.escape(merke.id)}"] ${merke.aktion ? `[data-gespraech-aktion="${merke.aktion}"]` : ".gespraech-link"}`)))
        || (merke.alle && liste.querySelector('[data-gespraeche="alle-loeschen"]'))
        || merke.nachbarn.slice(merke.nachbarn.indexOf(merke.id) + 1).concat(merke.nachbarn.slice(0, merke.nachbarn.indexOf(merke.id)).reverse())
          .map((nid) => liste.querySelector(`[data-gespraech="${CSS.escape(nid)}"] .gespraech-link`)).find(Boolean)
        || (liste === el.schubladeListe ? el.schublade.querySelector("[data-gespraech-neu]") : el.seiteNeu);
      if (ziel) ziel.focus({ preventScroll: true });
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-gespraech-neu]")) { neuesGespraech(); return; }
    if (e.target.closest('[data-gespraeche="alle-loeschen"]')) { alleGespraecheLoeschenFragen(); return; }
    const knopf = e.target.closest("[data-gespraech-aktion]");
    if (knopf) {
      const eintrag = knopf.closest("[data-gespraech]");
      if (!eintrag) return;
      if (knopf.dataset.gespraechAktion === "umbenennen") umbenennenStarten(eintrag.dataset.gespraech, eintrag);
      else gespraechLoeschenFragen(eintrag.dataset.gespraech);
      return;
    }
    if (e.target.closest(".gespraech-link") && el.schublade.open) schubladeSchliessen(); // die Adresse wechselt über den Link
  });

  // ---------- Umbenennen (Stift) ----------
  function umbenennenStarten(id, knoten) {
    const e = verlauf.eintraege.find((x) => x.id === id);
    const link = knoten.querySelector(".gespraech-link");
    if (!e || !link || verlauf.umbenennen) return;
    verlauf.umbenennen = id;
    const feld = document.createElement("input");
    feld.type = "text";
    feld.className = "gespraech-feld";
    feld.value = e.titel || "";
    feld.maxLength = VERLAUF.TITEL_EIGEN_MAX;
    feld.autocomplete = "off";
    feld.spellcheck = false;
    feld.enterKeyHint = "done";
    feld.setAttribute("aria-label", "Neuer Name für das Gespräch");
    link.replaceWith(feld);
    knoten.classList.add("benennt");
    feld.focus();
    feld.select();
    let fertig = false;
    // Zurück zum Link an Ort und Stelle – kein Neuaufbau der Liste: Wer das Feld mit einem Klick auf einen anderen Eintrag
    // verlässt, dessen Klick soll ankommen (bei einem Neuaufbau verschwände das Ziel zwischen Drücken und Loslassen).
    const ende = (uebernehmen, perTastatur = false) => {
      if (fertig) return;
      fertig = true;
      verlauf.umbenennen = null;
      if (uebernehmen) umbenennen(id, feld.value);
      const titel = (verlauf.eintraege.find((x) => x.id === id) || {}).titel || link.textContent;
      for (const liste of [el.seitenGespraeche, el.schubladeListe]) {
        const k = liste.querySelector(`[data-gespraech="${CSS.escape(id)}"]`);
        if (!k) continue;
        if (k === knoten && feld.isConnected) feld.replaceWith(link);
        const a = k.querySelector(".gespraech-link");
        if (a) { a.textContent = titel; a.title = titel; }
        for (const b of k.querySelectorAll("[data-gespraech-aktion]")) b.setAttribute("aria-label", `${b.dataset.gespraechAktion === "umbenennen" ? "Umbenennen" : "Löschen"}: ${titel}`);
        k.classList.remove("benennt");
        gerendert.set(liste, gespraecheHtml()); // entspricht jetzt dem Stand
      }
      if (perTastatur) { const stift = knoten.querySelector('[data-gespraech-aktion="umbenennen"]'); if (stift) stift.focus({ preventScroll: true }); }
      if (verlauf.verpasst) {
        verlauf.verpasst = false;
        setTimeout(() => { gerendert.delete(el.seitenGespraeche); gerendert.delete(el.schubladeListe); gespraecheZeigen(); }, 350);
      }
    };
    feld.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); ende(true, true); }
      else if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        verlauf.escUmbenennen = true; // das gleich folgende „cancel“ der Schublade gehört zum Umbenennen
        setTimeout(() => { verlauf.escUmbenennen = false; }, 0);
        ende(false, true);
      }
    });
    feld.addEventListener("blur", () => ende(true)); // Fokus bleibt, wo die Nutzerin hingeklickt hat
  }

  /** Neuer Name (leer = alter Name bleibt). Die Reihenfolge ändert sich dadurch nicht. */
  function umbenennen(id, wert) {
    const titel = VERLAUF.titelSaeubern(wert);
    const e = verlauf.eintraege.find((x) => x.id === id);
    if (!e || !titel || titel === e.titel) return;
    e.titel = titel;
    e.titelEigen = true;
    const g = verlauf.inhalte.get(id);
    if (g) { g.titel = titel; g.titelEigen = true; }
    if (verlauf.ablage) {
      e.gespeichertAm = Date.now();
      ablageSpeichern({ ...e }, null)
        .then(() => verlauf.kanal && verlauf.kanal.senden({ art: "geaendert", id }))
        .catch(speicherFehler);
    }
  }

  // ---------- Löschen ----------
  const entwurfSatz = (n, wo = "") => (n === 1 ? ` Ein Entwurf${wo} ist noch nicht gespeichert und geht verloren.` : n > 1 ? ` ${n} Entwürfe${wo} sind noch nicht gespeichert und gehen verloren.` : "");

  async function gespraechLoeschenFragen(id) {
    const e = verlauf.eintraege.find((x) => x.id === id);
    if (!e) return;
    const g = verlauf.inhalte.get(id);
    const entwuerfe = g ? VERLAUF.offeneEntwuerfe(g.nachrichten) : Number(e.entwuerfe) || 0;
    if (!(await frage("Gespräch löschen?", `„${e.titel}“ wird von diesem Gerät gelöscht.${entwurfSatz(entwuerfe, " darin")} Gespeicherte Notizen bleiben erhalten.`, { ja: "Löschen", gefahr: true }))) return;
    if (chat.gespraech.id === id) neuesLeeresZeigen();
    entfernen([id]);
    gespraecheZeigen();
    toast("Gespräch gelöscht.", { art: "erfolg", dauer: 2500 });
  }

  async function alleGespraecheLoeschenFragen() {
    const anzahl = verlauf.eintraege.length;
    if (!anzahl) return;
    const wer = anzahl === 1 ? "Das Gespräch wird" : `Alle ${anzahl} Gespräche werden`;
    if (!(await frage("Alle Gespräche löschen?", `${wer} von diesem Gerät gelöscht.${entwurfSatz(gesamtEntwuerfe())} Gespeicherte Notizen bleiben erhalten.`, { ja: "Alle löschen", gefahr: true }))) return;
    await gespraecheLeeren();
    toast("Alle Gespräche sind gelöscht.", { art: "erfolg", dauer: 2500 });
  }

  // ---------- Schublade (Handy, Tablet) ----------
  function schubladeOeffnen() {
    if (LAPTOP.matches || el.schublade.open) return;
    gespraecheZeigen();
    el.schublade.classList.remove("schliesst");
    el.schublade.showModal();
    const aktiv = el.schubladeListe.querySelector('[aria-current="true"]');
    if (aktiv) aktiv.scrollIntoView({ block: "nearest" });
    (aktiv || el.schublade.querySelector("[data-gespraech-neu]")).focus({ preventScroll: true });
  }
  let nachSchliessen = null; // z. B. Fokus ins Eingabefeld, sobald die Schublade zu ist
  function schubladeSchliessen(sofort = false, danach = null) {
    const d = el.schublade;
    if (danach) nachSchliessen = danach;
    if (!d || !d.open) { if (nachSchliessen) { const f = nachSchliessen; nachSchliessen = null; f(); } return; }
    if (d.classList.contains("schliesst")) return;
    if (sofort || WENIG_BEWEGUNG.matches) { d.close(); return; }
    d.classList.add("schliesst");
    let erledigt = false;
    const zu = (e) => {
      if (erledigt || (e && e.target !== d)) return;
      erledigt = true;
      d.removeEventListener("animationend", zu);
      d.classList.remove("schliesst");
      if (d.open) d.close();
    };
    d.addEventListener("animationend", zu);
    setTimeout(zu, 400); // falls kein animationend kommt
  }
  el.kopfMenue.addEventListener("click", schubladeOeffnen);
  el.schubladeZu.addEventListener("click", () => schubladeSchliessen());
  el.schublade.addEventListener("click", (e) => { if (e.target === el.schublade) schubladeSchliessen(); }); // Tipp neben die Schublade
  el.schublade.addEventListener("cancel", (e) => { e.preventDefault(); if (!verlauf.umbenennen && !verlauf.escUmbenennen) schubladeSchliessen(); }); // Esc – mit Animation
  el.schublade.addEventListener("close", () => {
    el.schublade.classList.remove("schliesst");
    const danach = nachSchliessen;
    nachSchliessen = null;
    if (!el.kopf.hidden && el.schublade.contains(document.activeElement)) {
      // Handy: zurück auf den Menü-Knopf; am Laptop gibt es ihn nicht – dann in die Seitenleiste
      const ziel = LAPTOP.matches ? el.seitenGespraeche.querySelector('[aria-current="true"]') || el.seiteNeu : el.kopfMenue;
      ziel.focus({ preventScroll: true });
    }
    if (danach) danach();
  });
  LAPTOP.addEventListener("change", () => { if (LAPTOP.matches) schubladeSchliessen(true); });

  /** Noch nicht gespeicherter Entwurf aus v1 (sessionStorage „gabi.entwurf“, Demo „gabi.entwurf.demo“) → Karte im Gespräch. */
  function v1EntwurfUebernehmen() {
    const schl = modus.demo ? "gabi.entwurf.demo" : "gabi.entwurf";
    let alt = null;
    try { alt = JSON.parse(speicher.lesen("sitzung", schl) || "null"); } catch { alt = null; }
    if (!alt || typeof alt !== "object") return;
    speicher.loeschen("sitzung", schl);
    // in ein eigenes Gespräch – das gerade gezeigte nur, wenn es noch leer ist (sonst bekäme es dauerhaft den Titel)
    const g = !chat.gespraech.gespeichert && !chat.nachrichten.length ? chat.gespraech : gespraechAnlegen();
    const rohtext = typeof alt.rohtext === "string" ? alt.rohtext.slice(0, 20000) : "";
    const s = alt.strukturiert && typeof alt.strukturiert === "object" ? alt.strukturiert : null;
    const p = s && (chat.patienten || []).find((x) => x.id === alt.patientId);
    if (p) {
      const strukturiert = {};
      for (const [key] of K.ABSCHNITTE) strukturiert[key] = K.stichpunkte(s[key]);
      strukturiert.unklar = K.stichpunkte(s.unklar);
      lokaleAntwort(`Aus der Vorversion war noch ein Entwurf für **${p.kuerzel}** offen. Prüf ihn bitte – gespeichert wird erst, wenn du auf „Speichern“ tippst.`,
        [{ typ: "entwurf", id: neueId(), patient_id: p.id, kuerzel: p.kuerzel, pseudonym: p.pseudonym || "", rohtext, strukturiert }], g);
    } else if (rohtext.trim()) {
      // ohne Nutzernachricht wäre das Gespräch „leer“ und ginge beim Neuladen verloren – deshalb ausdrücklich bewahren
      lokaleAntwort(`Aus der Vorversion war noch ein Diktat offen, das nicht gespeichert wurde:\n\n${rohtext.trim()}\n\nDu kannst es kopieren und hier noch einmal schicken.`, [], g, { bewahren: true });
    } else return;
    if (g !== chat.gespraech) toast("Aus der Vorversion war noch etwas offen – es steht als eigenes Gespräch in der Liste.", { dauer: 7000 });
  }

  // ---------- Darstellung ----------
  const nachrichtKnoten = new Map();
  let gezeigtesGespraech = null;

  /** Das offene Gespräch in einem Rutsch aufbauen (neuer Inhalt fertig, dann tauschen – kein leerer Zwischenzustand). */
  function allesZeigen() {
    const neu = document.createDocumentFragment();
    nachrichtKnoten.clear();
    for (const n of chat.nachrichten) {
      const knoten = nachrichtBauen(n);
      knoten.style.animation = "none"; // beim Wiederherstellen nichts einfliegen lassen
      neu.append(knoten);
    }
    el.nachrichten.replaceChildren(neu);
    gezeigtesGespraech = chat.gespraech;
    rahmenAktualisieren();
  }

  /** Fehlende Nachrichten an ihrer Stelle einfügen – ohne vorhandene neu zu bauen (eine Bearbeitung dort bleibt). */
  function nachrichtenAbgleichen() {
    let vorher = null;
    for (const n of chat.nachrichten) {
      let k = nachrichtKnoten.get(n.id);
      if (!k || k.parentNode !== el.nachrichten) {
        k = nachrichtBauen(n);
        k.style.animation = "none";
        if (vorher) vorher.after(k); else el.nachrichten.prepend(k);
      }
      vorher = k;
    }
    rahmenAktualisieren();
  }

  function rahmenAktualisieren() {
    const leer = !chat.nachrichten.length;
    el.willkommen.hidden = !leer;
    el.chipsLeiste.hidden = leer;
    modusAnzeigen();
    seitenPatientenZeigen();
  }

  function nachrichtBauen(n) {
    const knoten = document.createElement("div");
    knoten.className = `nachricht von-${n.rolle}`;
    knoten.dataset.id = n.id;
    knoten.innerHTML = n.rolle === "nutzer" ? nutzerHtml(n) : gabiHtml(n);
    nachrichtKnoten.set(n.id, knoten);
    return knoten;
  }

  function nachrichtNeuZeichnen(n) {
    if (!chat.nachrichten.includes(n)) return; // gehört zu einem verworfenen Gespräch
    const alt = nachrichtKnoten.get(n.id);
    const neu = nachrichtBauen(n);
    if (alt && alt.isConnected) alt.replaceWith(neu);
    else el.nachrichten.append(neu);
    neu.style.animation = "none"; // nur neue Nachrichten tauchen auf, Aktualisierungen nicht
  }

  function nutzerHtml(n) {
    const kopf = n.art === "diktat"
      ? `<div class="blase-kopf">${symbol("mikro")}Diktat · ${esc(n.kuerzel || "")}${n.beispiel ? " · Beispiel" : ""}</div>`
      : n.art === "stimme" ? `<div class="blase-kopf">${symbol("mikro")}Gesprochen${n.beispiel ? " · Beispiel" : ""}</div>`
        : n.art === "suche" ? `<div class="blase-kopf">${symbol("suche")}Suche</div>` : "";
    return `<div class="blase">${kopf}${esc(n.text)}</div>`;
  }

  const statusGezeigt = new WeakMap(); // Nachricht → zuletzt gezeigter Status
  function gabiHtml(n) {
    const teile = [];
    if (n.text) teile.push(`<div class="nachricht-text${n.laeuft ? " laeuft" : ""}">${K.formatierterText(n.text)}</div>`);
    for (const k of n.karten || []) teile.push(karteHtml(n, k));
    if (n.quellen && n.quellen.length) {
      teile.push(`<div class="quellen"><span class="augenbraue">Gefundene Notizen</span>${n.quellen.slice(0, 6).map((q) => `<a class="quelle" href="#/notizen/n/${esc(q.id)}">${symbol("dokument")}${esc(q.kuerzel)} · ${esc(K.datumKurz(q.erstellt_am))}</a>`).join("")}</div>`);
    }
    if (n.fehler) {
      teile.push(`<div class="hinweis-box"><div class="hinweis-box-kopf">${symbol("warn")}<span>${esc(n.fehlerText || "Da ist etwas schiefgegangen.")}</span></div>${n.wiederholbar ? `<div><button class="knopf sekundaer klein" type="button" data-aktion="wiederholen">${symbol("zuruecksetzen")}Nochmal versuchen</button></div>` : ""}</div>`);
    }
    if (n.laeuft && n.wartet !== false) {
      const neuerStatus = statusGezeigt.get(n) !== n.status; // gleicher Status wie im letzten Bild: nicht neu einblenden
      statusGezeigt.set(n, n.status);
      teile.push(`<div class="tippen" aria-label="Gabi schreibt"><span class="punkte-tippen"><i></i><i></i><i></i></span>${n.status ? `<span class="status-zeile${neuerStatus ? "" : " ruhig"}">${esc(n.status)}</span>` : ""}</div>`);
    }
    if (!n.laeuft && n.text && !n.fehler && !n.lokal) {
      const liest = vorleseId === n.id;
      teile.push(`<div class="nachricht-aktionen">
        <button class="rund-knopf" type="button" data-aktion="kopieren" aria-label="Antwort kopieren" title="Kopieren">${symbol("kopieren")}</button>
        ${SPRACHE ? `<button class="rund-knopf" type="button" data-aktion="vorlesen" aria-pressed="${liest}" aria-label="${liest ? "Vorlesen stoppen" : "Antwort vorlesen"}" title="${liest ? "Stopp" : "Vorlesen"}">${symbol(liest ? "stopp" : "vorlesen")}</button>` : ""}
      </div>`);
    }
    return `<div class="avatar" aria-hidden="true">G</div><div class="nachricht-inhalt">${teile.join("")}</div>`;
  }

  // ---------- Live-Aktualisierung während des Stroms (höchstens einmal pro Bild) ----------
  const ausstehend = new Set();
  let bildAngefragt = false;
  function spaeterZeichnen(n) {
    ausstehend.add(n);
    if (bildAngefragt) return;
    bildAngefragt = true;
    requestAnimationFrame(() => {
      bildAngefragt = false;
      const sichtbar = [...ausstehend].filter((x) => chat.nachrichten.includes(x)); // Antworten eines anderen Gesprächs nicht hier zeigen
      ausstehend.clear();
      if (!sichtbar.length) return;
      const unten = nahUnten();
      const mitKarte = sichtbar.find((x) => (x.karten || []).some((k) => k.typ === "entwurf" || k.typ === "bericht"));
      for (const x of sichtbar) nachrichtNeuZeichnen(x);
      if (!unten || el.chat.hidden) return;
      if (mitKarte) nachrichtZeigen(mitKarte); else nachUntenRollen();
    });
  }
  /** Antwort mit Karte: passt sie nicht ganz in den sichtbaren Bereich, ihren Anfang zeigen (Text + Kartenkopf) – nicht das Ende. */
  function nachrichtZeigen(n) {
    const knoten = nachrichtKnoten.get(n.id);
    if (!knoten) return nachUntenRollen();
    const kopf = el.kopf && !LAPTOP.matches ? el.kopf.getBoundingClientRect().bottom : 0;
    const leiste = document.querySelector(".eingabe-bereich");
    const oben = kopf + 8;
    const unten = (leiste ? leiste.getBoundingClientRect().top : window.innerHeight) - 8;
    const r = knoten.getBoundingClientRect();
    if (r.height > unten - oben) window.scrollTo({ top: Math.max(0, window.scrollY + r.top - oben) });
    else nachUntenRollen();
  }
  const nahUnten = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
  function nachUntenRollen(sanft = false) {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: sanft && !WENIG_BEWEGUNG.matches ? "smooth" : "auto" });
  }

  /** Nachricht an ein Gespräch anhängen (Vorgabe: das offene). Nur das offene wird gezeichnet. */
  function nachrichtHinzufuegen(n, g = chat.gespraech) {
    g.nachrichten.push(n);
    g.geaendert = Date.now();
    if (g === chat.gespraech) {
      el.nachrichten.append(nachrichtBauen(n));
      rahmenAktualisieren();
      requestAnimationFrame(() => { if (!el.chat.hidden) nachUntenRollen(true); });
    }
    gespraechMerken(g);
    return n;
  }

  /** Antwort von Gabi ohne Server (Rückfragen bei den Schnellaktionen). */
  function lokaleAntwort(text, karten = [], g = chat.gespraech, extra = {}) {
    return nachrichtHinzufuegen({ id: neueId(), rolle: "gabi", text, karten, lokal: true, ...extra }, g);
  }

  // ---------- Senden ----------
  /**
   * Eine Nachricht an Gabi schicken.
   * text: was die Nutzerin sieht · senden: was Gabi bekommt (z. B. mit „Suche in meinen Notizen:“) ·
   * aktion: feste Abläufe (Diktat, Bericht) · art/kuerzel/beispiel: nur für die Anzeige
   */
  async function senden({ text, senden: anGabi, aktion = null, art = "", kuerzel = "", beispiel = false }) {
    if (chat.laeuft || !String(text || "").trim()) return;
    const g = chat.gespraech; // die Antwort gehört fest zu diesem Gespräch
    const nutzer = nachrichtHinzufuegen({ id: neueId(), rolle: "nutzer", text: text.trim(), ...(anGabi ? { senden: anGabi } : {}), art, kuerzel, beispiel }, g);
    const gabi = nachrichtHinzufuegen({ id: neueId(), rolle: "gabi", text: "", karten: [], quellen: [], laeuft: true, wartet: true, status: "" }, g);
    const fuerServer = K.verlaufFuerServer(g.nachrichten.filter((n) => n !== gabi));
    if (aktion && fuerServer.length) fuerServer[fuerServer.length - 1] = { rolle: "nutzer", text: nutzer.text }; // Diktat pur, ohne Vorsatz
    await antwortHolen(gabi, { nachrichten: fuerServer, ...(aktion ? { aktion } : {}) }, g);
  }

  async function antwortHolen(gabi, body, g = chat.gespraech) {
    const abbruch = new AbortController();
    chat.laeuft = { abbruch, gabi, gespraech: g };
    // falls die Seite mitten in der Antwort neu lädt: erkennbar unterbrochen, mit „Nochmal versuchen“
    gabi.unterwegs = true;
    gabi.body = body;
    gespraechMerken(g);
    eingabeAktualisieren();
    try {
      await chatStrom(body, (e) => ereignis(gabi, e, g), abbruch.signal);
    } catch (e) {
      if (e instanceof Abbruch) {
        gabi.abgebrochen = true;
        if (!gabi.text && !gabi.karten.length) gabi.text = "Abgebrochen.";
      } else {
        gabi.fehler = true;
        gabi.fehlerText = e.message;
        gabi.wiederholbar = true;
        gabi.body = body;
      }
    } finally {
      delete gabi.unterwegs;
      if (gabi.fehler) gabi.body = body; // damit „Nochmal versuchen“ auch bei Fehlern mitten im Strom geht
      else delete gabi.body;
      gabi.laeuft = false;
      gabi.status = "";
      if (chat.laeuft && chat.laeuft.abbruch === abbruch) chat.laeuft = null; // nie eine neuere Antwort freigeben
      g.geaendert = Date.now();
      nachrichtNeuZeichnen(gabi);
      eingabeAktualisieren();
      gespraechMerken(g);
      if (g === chat.gespraech && !el.chat.hidden && nahUnten()) nachUntenRollen();
    }
  }

  function ereignis(gabi, e, g = chat.gespraech) {
    switch (e.t) {
      case "text":
        gabi.text += String(e.d || "");
        gabi.wartet = false;
        break;
      case "status":
        gabi.status = String(e.text || "");
        gabi.wartet = true;
        break;
      case "quellen": {
        const da = new Set(gabi.quellen.map((q) => q.id));
        for (const q of e.notizen || []) if (q && q.id && !da.has(q.id)) { da.add(q.id); gabi.quellen.push({ id: q.id, kuerzel: q.kuerzel, erstellt_am: q.erstellt_am }); }
        break;
      }
      case "entwurf":
        if (e.entwurf) gabi.karten.push({ typ: "entwurf", id: neueId(), ...e.entwurf, strukturiert: e.entwurf.strukturiert || {} });
        gabi.wartet = true;
        if (g === chat.gespraech && chat.modus && chat.modus.typ === "diktat") modusSetzen(null); // ein Diktat = ein Entwurf; danach normale Fragen
        break;
      case "bericht":
        if (e.bericht) gabi.karten.push({ typ: "bericht", id: neueId(), bericht: e.bericht });
        gabi.wartet = true;
        break;
      case "abgelehnt":
        gabi.text = String(e.text || "");
        gabi.wartet = false;
        break;
      case "fehler":
        gabi.fehler = true;
        gabi.fehlerText = String(e.text || "Da ist etwas schiefgegangen.");
        gabi.wiederholbar = true;
        gabi.wartet = false;
        break;
      case "fertig":
        gabi.wartet = false;
        break;
      default:
        return;
    }
    if (e.t === "entwurf" || e.t === "bericht") patientenLaden().catch(() => {});
    spaeterZeichnen(gabi);
  }

  async function wiederholen(gabi) {
    if (chat.laeuft || !gabi.body) return;
    const body = gabi.body;
    Object.assign(gabi, { text: "", karten: [], quellen: [], fehler: false, fehlerText: "", wiederholbar: false, laeuft: true, wartet: true, status: "", body: undefined });
    nachrichtNeuZeichnen(gabi);
    await antwortHolen(gabi, body);
  }

  // ---------- Schnellaktionen ----------
  async function schnell(art) {
    if (chat.laeuft) return;
    if (jetzigerHash() !== chatHash()) location.hash = chatHash();
    if (art === "heute") { modusSetzen(null); senden({ text: "Was steht heute an?" }); return; }
    if (art === "suche") {
      modusSetzen({ typ: "suche" });
      lokaleAntwort("Wonach soll ich suchen? Zum Beispiel „Theraband“, „Knie“ oder „letzte Notiz von TP-02“.");
      el.text.focus();
      return;
    }
    if (art === "diktat") {
      modusSetzen(null);
      lokaleAntwort("Für welchen Test-Patienten möchtest du diktieren?", [{ typ: "auswahl", id: neueId(), wahl: "patient", zweck: "diktat" }]);
    }
    if (art === "bericht") {
      modusSetzen(null);
      lokaleAntwort("Für welchen Test-Patienten soll ich den Bericht schreiben?", [{ typ: "auswahl", id: neueId(), wahl: "patient", zweck: "bericht" }]);
    }
    if (!chat.patienten) await patientenLaden().catch(() => {});
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-schnell]");
    if (b) schnell(b.dataset.schnell);
  });

  function modusSetzen(m) {
    chat.modus = m;
    modusAnzeigen();
    gespraechMerken();
    eingabeAktualisieren();
  }

  function modusAnzeigen() {
    const m = chat.modus;
    if (m && el.modusPill.hidden) el.modusPill.style.animation = ""; // erscheint: einmal einblenden
    el.modusPill.hidden = !m;
    el.mikro.classList.toggle("lockt", Boolean(m && m.typ === "diktat"));
    if (!m) { el.text.placeholder = "Frag Gabi oder diktiere …"; return; }
    if (m.typ === "diktat") {
      el.modusSymbol.innerHTML = '<use href="#i-mikro"/>';
      el.modusText.textContent = `Diktat für ${m.kuerzel}${kurzName(m) ? ` · ${kurzName(m)}` : ""}`;
      el.text.placeholder = "Sprechen oder tippen …";
    } else {
      el.modusSymbol.innerHTML = '<use href="#i-suche"/>';
      el.modusText.textContent = "Suche in deinen Notizen";
      el.text.placeholder = "Wonach suchst du?";
    }
  }
  el.modusWeg.addEventListener("click", () => { modusSetzen(null); el.text.focus(); });

  function diktatStarten(patient) {
    modusSetzen({ typ: "diktat", patient_id: patient.id, kuerzel: patient.kuerzel, pseudonym: patient.pseudonym || "" });
    lokaleAntwort(
      `Alles klar, **${patient.kuerzel}**. Halte das Mikrofon gedrückt und erzähl, was ihr in der Behandlung gemacht habt – oder tipp es ein. Ich sortiere es dann in Befund, Maßnahmen, Verlauf und Hausaufgaben.`,
      modus.demo ? [{ typ: "beispiel", id: neueId() }] : [],
    );
    if (!GROB) el.text.focus();
  }

  // ==========================================================
  // 6 Karten im Gespräch: Auswahl, Entwurf, Bericht, Hilfe
  // ==========================================================
  const kurzName = (p) => String(p.pseudonym || "").replace(/^Testfall\s+/i, "").replace(/\s*\(fiktiv\)$/, "");

  function karteHtml(n, k) {
    if (k.typ === "auswahl") return auswahlHtml(k);
    if (k.typ === "entwurf") return entwurfHtml(k, n);
    if (k.typ === "bericht") return berichtHtml(k);
    if (k.typ === "hilfe") {
      return `<div class="hinweis-box warn" data-karte="${esc(k.id)}">
        <div class="hinweis-box-kopf">${symbol("mikro")}<span>${esc(k.titel)}</span></div>
        <p>${esc(k.text)}</p>
        ${k.schritte && k.schritte.length ? `<ol>${k.schritte.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
        <div><button class="knopf sekundaer klein" type="button" data-aktion="neu-laden">${symbol("zuruecksetzen")}Seite neu laden</button></div>
      </div>`;
    }
    if (k.typ === "beispiel") {
      return `<div class="chip-gruppe" data-karte="${esc(k.id)}"><button class="chip akzent" type="button" data-aktion="beispiel" ${k.benutzt ? "disabled" : ""}>${symbol("funke")}Beispieldiktat nehmen</button></div>`;
    }
    if (k.typ === "aufnahme") {
      if (k.erledigt) return `<div class="karte-zustand ok" data-karte="${esc(k.id)}"><span class="haken"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span>Nachgeschickt.</span></div>`;
      if (k.verworfen) return `<div class="karte-zustand" data-karte="${esc(k.id)}">Aufnahme verworfen.</div>`;
      const da = aufnahmen.has(k.id);
      const senden = da && k.erneut
        ? `<button class="knopf primaer klein" type="button" data-aktion="aufnahme-senden" ${k.sendet ? "disabled" : ""}>${k.sendet ? '<span class="drehen"></span>Sende …' : k.zurueck ? `${symbol("senden")}Jetzt senden` : `${symbol("zuruecksetzen")}Nochmal senden`}</button>`
        : "";
      return `<div class="hinweis-box warn" data-karte="${esc(k.id)}">
        <div class="hinweis-box-kopf">${symbol("mikro")}<span>${esc(k.fehlerText || "Die Aufnahme ist nicht angekommen.")}</span></div>
        ${k.leer || (da && !k.erneut) ? "<p>Bitte noch einmal aufnehmen.</p>" : da ? "<p>Die Aufnahme ist noch da – du musst nicht neu sprechen.</p>" : "<p>Nach dem Neuladen ist die Aufnahme nicht mehr da. Bitte noch einmal aufnehmen.</p>"}
        ${da ? `<div class="knopf-reihe links">${senden}<button class="knopf leise klein" type="button" data-aktion="aufnahme-verwerfen" ${k.sendet ? "disabled" : ""}>Verwerfen</button></div>` : ""}
      </div>`;
    }
    return "";
  }

  /** Nicht angekommene Aufnahmen (nur im Speicher dieses Tabs): Karten-ID → { holen, modusBeiAufnahme } */
  const aufnahmen = new Map();

  function auswahlHtml(k) {
    const fertig = Boolean(k.gewaehlt);
    if (k.wahl === "berichtart") {
      const art = (wert, titel, sym) => `<button class="chip${k.gewaehlt === wert ? " gewaehlt" : ""}" type="button" data-aktion="waehle" data-wert="${wert}" ${fertig ? "disabled" : ""}>${symbol(sym)}${titel}</button>`;
      return `<div class="auswahl-karte" data-karte="${esc(k.id)}"><div class="chip-gruppe">${art("verlauf", "Verlaufsbericht", "bericht")}${art("zusammenfassung", "Zusammenfassung", "dokument")}</div></div>`;
    }
    if (!chat.patienten && chat.patientenFehler) {
      return `<div class="hinweis-box" data-karte="${esc(k.id)}"><div class="hinweis-box-kopf">${symbol("warn")}<span>Die Test-Patienten konnten nicht geladen werden.</span></div>
        <p>${esc(chat.patientenFehler)}</p><div><button class="knopf sekundaer klein" type="button" data-aktion="patienten-neu-laden">${symbol("zuruecksetzen")}Nochmal versuchen</button></div></div>`;
    }
    if (!chat.patienten) {
      return `<div class="auswahl-karte" data-karte="${esc(k.id)}"><div class="chip-gruppe"><span class="skelett chip-skelett"></span><span class="skelett chip-skelett"></span><span class="skelett chip-skelett"></span></div></div>`;
    }
    const ohneNotiz = (p) => k.zweck === "bericht" && !(p.anzahl > 0); // Bericht braucht mindestens eine Notiz
    const chips = chat.patienten.map((p) => `<button class="chip${k.gewaehlt === p.id ? " gewaehlt" : ""}" type="button" data-aktion="waehle" data-wert="${esc(p.id)}" ${fertig || ohneNotiz(p) ? "disabled" : ""}${ohneNotiz(p) ? ' title="Noch keine Notiz – kein Bericht möglich"' : ""}><strong>${esc(p.kuerzel)}</strong>${ohneNotiz(p) ? '<span class="stumm">noch keine Notiz</span>' : kurzName(p) ? `<span class="stumm">${esc(kurzName(p))}</span>` : ""}</button>`).join("");
    return `<div class="auswahl-karte" data-karte="${esc(k.id)}"><div class="chip-gruppe">${chips}
      ${k.zweck === "bericht" ? "" : `<button class="chip akzent" type="button" data-aktion="neuer-patient" ${fertig ? "disabled" : ""}>${symbol("person-plus")}Neuer Test-Patient</button>`}</div></div>`;
  }

  /** Beim Bearbeiten: Prüfpunkte als Textfeld – geklärte Punkte einfach löschen, dann verschwindet auch „zu prüfen“. */
  function pruefenFeld(wert, zeilen) {
    return `<section class="abschnitt pruefen"><label class="feld"><span class="augenbraue">${symbol("warn", "klein")}Bitte prüfen – Geklärtes einfach löschen</span>
      <textarea class="eingabefeld" data-abschnitt="unklar" rows="${Math.max(2, zeilen)}" placeholder="Ein Punkt pro Zeile">${esc(wert)}</textarea></label></section>`;
  }

  function punkteHtml(liste) {
    return `<ul class="punkte">${liste.map((p) => `<li>${K.mitUnklar(p)}</li>`).join("")}</ul>`;
  }

  function entwurfHtml(k, n = {}) {
    const s = k.strukturiert || {};
    const gesperrt = n.laeuft ? ' disabled title="Gabi schreibt noch …"' : "";
    const meta = k.gespeichert ? "gespeichert" : k.verworfen ? "verworfen" : "noch nicht gespeichert";
    const offen = !k.gespeichert && !k.verworfen && !k.bearbeiten;
    const kopf = `<header class="karte-kopf"><span class="karte-kachel">${symbol("dokument")}</span>
      <div class="karte-kopf-text"><span class="karte-titel">Notiz-Entwurf · ${esc(k.kuerzel)}</span><span class="karte-meta">${esc(kurzName(k) || "Test-Patient")} · ${meta}</span></div>
      ${offen ? `<button class="rund-knopf" type="button" data-aktion="entwurf-verwerfen" aria-label="Entwurf verwerfen" title="Verwerfen">${symbol("muell")}</button>` : ""}</header>`;
    if (k.gespeichert) {
      return `<article class="karte gespraechs-karte karte-entwurf erledigt mit-streifen" data-karte="${esc(k.id)}">${kopf}
        <div class="karte-zustand ok"><span class="haken"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span>Gespeichert bei ${esc(k.kuerzel)}</span></div>
        <div class="knopf-reihe links"><a class="knopf sekundaer klein" href="#/notizen/n/${esc(k.gespeichert)}">${symbol("dokument")}Notiz ansehen</a><button class="knopf leise klein" type="button" data-aktion="entwurf-pdf">${symbol("pdf")}PDF</button></div>
      </article>`;
    }
    if (k.verworfen) {
      return `<article class="karte gespraechs-karte karte-entwurf erledigt verworfen" data-karte="${esc(k.id)}">${kopf}<div class="karte-zustand">Dieser Entwurf wurde verworfen.</div></article>`;
    }
    const abschnitte = K.ABSCHNITTE.map(([key, titel]) => {
      const liste = K.stichpunkte(s[key]);
      if (k.bearbeiten) {
        const wert = k.bearbeitung && typeof k.bearbeitung[key] === "string" ? k.bearbeitung[key] : liste.join("\n");
        return `<section class="abschnitt"><label class="feld"><span class="augenbraue">${titel}</span>
          <textarea class="eingabefeld" data-abschnitt="${key}" rows="${Math.max(2, liste.length)}" placeholder="Ein Stichpunkt pro Zeile">${esc(wert)}</textarea></label></section>`;
      }
      return `<section class="abschnitt"><h3 class="augenbraue">${titel}</h3>${liste.length ? punkteHtml(liste) : '<p class="abschnitt-leer">Nichts notiert</p>'}</section>`;
    }).join("");
    const unklar = K.stichpunkte(s.unklar);
    const pruefenWert = k.bearbeitung && typeof k.bearbeitung.unklar === "string" ? k.bearbeitung.unklar : unklar.join("\n");
    const pruefen = !unklar.length ? ""
      : k.bearbeiten ? pruefenFeld(pruefenWert, unklar.length)
        : `<section class="abschnitt pruefen"><h3 class="augenbraue">${symbol("warn", "klein")}Bitte prüfen</h3>${punkteHtml(unklar)}</section>`;
    const fuss = k.bearbeiten
      ? `<button class="knopf primaer klein" type="button" data-aktion="entwurf-uebernehmen">${symbol("haken")}Übernehmen</button>
         <button class="knopf leise klein" type="button" data-aktion="entwurf-abbrechen">Abbrechen</button>`
      : `<button class="knopf primaer klein" type="button" data-aktion="entwurf-speichern"${gesperrt}>${symbol("haken")}Speichern</button>
         <button class="knopf sekundaer klein" type="button" data-aktion="entwurf-bearbeiten"${gesperrt}>${symbol("stift")}Bearbeiten</button>`;
    const original = k.rohtext && !k.bearbeiten ? `<details class="original"><summary>${symbol("rechts")}Original-Diktat</summary><p>${esc(k.rohtext)}</p></details>` : "";
    return `<article class="karte gespraechs-karte karte-entwurf mit-streifen" data-karte="${esc(k.id)}">${kopf}<div class="abschnitte">${abschnitte}${pruefen}</div>${original}<footer class="karte-fuss">${fuss}</footer></article>`;
  }

  function zeitraum(b) {
    const von = K.datum(b.von);
    const bis = K.datum(b.bis);
    return von === bis ? von : `${K.datumKurz(b.von)}–${bis}`;
  }

  function berichtHtml(k) {
    const b = k.bericht || {};
    const abschnitt = (titel, liste, leerText) => `<section class="abschnitt"><h3 class="augenbraue">${titel}</h3>${liste && liste.length ? punkteHtml(liste) : `<p class="abschnitt-leer">${leerText}</p>`}</section>`;
    const verlauf = b.art === "verlauf"
      ? `<section class="abschnitt"><h3 class="augenbraue">Verlauf</h3>${(b.verlauf || []).length ? `<ol class="zeitleiste">${b.verlauf.map((v) => `<li class="zeitpunkt"><span class="zeitpunkt-datum">${esc(K.datum(v.datum))}</span>${punkteHtml(v.punkte || [])}</li>`).join("")}</ol>` : '<p class="abschnitt-leer">Nichts notiert</p>'}</section>`
      : "";
    const offen = (b.offen || []).length ? `<section class="abschnitt pruefen"><h3 class="augenbraue">${symbol("warn", "klein")}Offene Punkte</h3>${punkteHtml(b.offen)}</section>` : "";
    return `<article class="karte gespraechs-karte karte-bericht mit-streifen" data-karte="${esc(k.id)}">
      <header class="karte-kopf"><span class="karte-kachel">${symbol("bericht")}</span>
        <div class="karte-kopf-text"><span class="karte-titel">${esc(b.titel || "Bericht")} · ${esc(b.kuerzel || "")}</span>
        <span class="karte-meta">${b.anzahl === 1 ? "1 Notiz" : `${esc(b.anzahl || 0)} Notizen`} · ${esc(zeitraum(b))}</span></div></header>
      <div class="abschnitte">${abschnitt("Zusammenfassung", b.zusammenfassung, "Nichts notiert")}${verlauf}${abschnitt("Aktuelle Hausaufgaben", b.hausaufgaben, "Keine Hausaufgaben notiert")}${offen}</div>
      <footer class="karte-fuss"><button class="knopf primaer klein" type="button" data-aktion="bericht-pdf">${symbol("pdf")}Als PDF</button>
        <button class="knopf sekundaer klein" type="button" data-aktion="bericht-kopieren">${symbol("kopieren")}Text kopieren</button></footer>
    </article>`;
  }

  function entwurfAlsText(k) {
    const s = k.strukturiert || {};
    const zeilen = [`Notiz-Entwurf · ${k.kuerzel}${k.gespeichert ? " (gespeichert)" : ""}`];
    for (const [key, titel] of K.ABSCHNITTE) {
      const liste = K.stichpunkte(s[key]);
      if (liste.length) zeilen.push("", titel, ...liste.map((x) => `- ${x}`));
    }
    const unklar = K.stichpunkte(s.unklar);
    if (unklar.length) zeilen.push("", "Bitte prüfen", ...unklar.map((x) => `- ${x}`));
    return zeilen.join("\n");
  }
  /** Antwort als Text – mit Entwürfen und Berichten, die darunter als Karte stehen. */
  function nachrichtAlsText(n) {
    const karten = (n.karten || []).map((k) => (k.typ === "entwurf" && !k.verworfen ? entwurfAlsText(k) : k.typ === "bericht" ? berichtAlsText(k.bericht || {}) : "")).filter(Boolean);
    return [K.ohneFormat(n.text || ""), ...karten].filter((x) => x.trim()).join("\n\n");
  }

  function berichtAlsText(b) {
    const zeilen = [`${b.titel} · ${b.kuerzel}${b.pseudonym ? ` · ${b.pseudonym}` : ""}`, `${b.anzahl === 1 ? "1 Notiz" : `${b.anzahl} Notizen`} · ${zeitraum(b)}`, "", "Zusammenfassung", ...(b.zusammenfassung || []).map((p) => `- ${p}`)];
    if (b.art === "verlauf") {
      zeilen.push("", "Verlauf");
      for (const v of b.verlauf || []) zeilen.push(`${K.datum(v.datum)}`, ...(v.punkte || []).map((p) => `- ${p}`));
    }
    zeilen.push("", "Aktuelle Hausaufgaben", ...((b.hausaufgaben || []).length ? b.hausaufgaben.map((p) => `- ${p}`) : ["- keine notiert"]));
    if ((b.offen || []).length) zeilen.push("", "Offene Punkte", ...b.offen.map((p) => `- ${p}`));
    zeilen.push("", "Testversion – Testdaten · KI-Entwurf, fachlich zu prüfen");
    return zeilen.join("\n");
  }

  // ---------- Klicks in Nachrichten und Karten ----------
  // einmal eingeblendet = fertig: auch beim Wiedererscheinen (hidden → sichtbar) nicht noch einmal
  for (const art of ["animationend", "animationcancel"]) {
    el.nachrichten.addEventListener(art, (e) => { if (e.target.classList && e.target.classList.contains("nachricht")) e.target.style.animation = "none"; });
    el.notizen.addEventListener(art, (e) => { const c = e.target.parentElement; if (c && c.classList.contains("einblenden") && (c.classList.contains("raster") || c.classList.contains("notiz-liste"))) c.classList.remove("einblenden"); });
    el.modusPill.addEventListener(art, (e) => { if (e.target === el.modusPill) el.modusPill.style.animation = "none"; });
  }

  el.nachrichten.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-aktion]");
    if (!b || b.disabled) return;
    const knoten = b.closest(".nachricht");
    const n = knoten && chat.nachrichten.find((x) => x.id === knoten.dataset.id);
    if (!n) return;
    const kk = b.closest("[data-karte]");
    const k = kk ? (n.karten || []).find((x) => x.id === kk.dataset.karte) : null;
    const aktion = b.dataset.aktion;
    const g = chat.gespraech; // Änderungen gehören zu diesem Gespräch, auch wenn inzwischen gewechselt wurde

    if (aktion === "wiederholen") return wiederholen(n);
    if (aktion === "kopieren") return kopieren(nachrichtAlsText(n), "Antwort kopiert.");
    if (aktion === "vorlesen") return vorlesen(n);
    if (aktion === "neu-laden") return location.reload();
    if (!k) return;

    if (aktion === "patienten-neu-laden") {
      chat.patientenFehler = "";
      nachrichtNeuZeichnen(n);
      patientenLaden().catch(() => {});
      return;
    }
    if (aktion === "aufnahme-senden") {
      const eintrag = aufnahmen.get(k.id);
      if (!eintrag) return;
      if (chat.laeuft || erkennt) { toast("Einen Moment – Gabi ist noch beschäftigt."); return; }
      k.sendet = true;
      nachrichtNeuZeichnen(n);
      erkennen(eintrag.holen, eintrag.modusBeiAufnahme, { n, k });
      return;
    }
    if (aktion === "aufnahme-verwerfen") {
      if (!(await frage("Aufnahme verwerfen?", "Die Aufnahme wird gelöscht und lässt sich nicht wiederherstellen.", { ja: "Verwerfen", gefahr: true }))) return;
      aufnahmen.delete(k.id);
      k.verworfen = true;
      nachrichtNeuZeichnen(n);
      gespraechMerken(g);
      return;
    }
    if (aktion === "waehle") return waehlen(n, k, b.dataset.wert);
    if (aktion === "neuer-patient") {
      const p = await patientAnlegenDialog();
      if (p) waehlen(n, k, p.id);
      return;
    }
    if (aktion === "beispiel") {
      if (!chat.modus || chat.modus.typ !== "diktat" || chat.laeuft) { toast("Wähle zuerst einen Test-Patienten für das Diktat."); return; }
      k.benutzt = true;
      nachrichtNeuZeichnen(n);
      try {
        const d = await demoApi.beispielDiktat(chat.modus.kuerzel);
        diktatSenden(d.text, { beispiel: true });
      } catch (f) { toast(f.message, { art: "fehler" }); }
      return;
    }
    if (aktion === "entwurf-bearbeiten") { k.bearbeiten = true; nachrichtNeuZeichnen(n); autoHoeheAlle(nachrichtKnoten.get(n.id)); nachrichtKnoten.get(n.id).querySelector("textarea")?.focus(); gespraechMerken(g); return; }
    if (aktion === "entwurf-abbrechen") { k.bearbeiten = false; delete k.bearbeitung; nachrichtNeuZeichnen(n); gespraechMerken(g); return; }
    if (aktion === "entwurf-uebernehmen") {
      const s = { ...k.strukturiert };
      for (const t of kk.querySelectorAll("textarea[data-abschnitt]")) s[t.dataset.abschnitt] = t.value.split("\n").map((z) => z.trim()).filter(Boolean);
      k.strukturiert = s;
      k.bearbeiten = false;
      delete k.bearbeitung;
      nachrichtNeuZeichnen(n);
      gespraechMerken(g);
      return;
    }
    if (aktion === "entwurf-speichern") return entwurfSpeichern(n, k, b, g);
    if (aktion === "entwurf-verwerfen") {
      if (!(await frage("Entwurf verwerfen?", `Der Entwurf für ${k.kuerzel} wird nicht gespeichert.`, { ja: "Verwerfen", gefahr: true }))) return;
      k.verworfen = true;
      nachrichtNeuZeichnen(n);
      gespraechMerken(g);
      return;
    }
    if (aktion === "entwurf-pdf") {
      try { pdfSpeichern((await api(`/api/notizen/${k.gespeichert}`)).notiz); } catch (f) { if (!(f instanceof Abbruch)) toast(f.message, { art: "fehler" }); }
      return;
    }
    if (aktion === "bericht-pdf") return berichtPdfSpeichern(k.bericht);
    if (aktion === "bericht-kopieren") return kopieren(berichtAlsText(k.bericht), "Bericht kopiert.");
  });

  el.nachrichten.addEventListener("input", (e) => {
    if (!e.target.matches("textarea")) return;
    autoHoehe(e.target);
    // Getipptes in der Karte merken – überlebt Neuzeichnen und den Wechsel in den Notizordner
    const knoten = e.target.closest(".nachricht");
    const kk = e.target.closest("[data-karte]");
    const n = knoten && chat.nachrichten.find((x) => x.id === knoten.dataset.id);
    const k = n && kk && (n.karten || []).find((x) => x.id === kk.dataset.karte);
    if (k && e.target.dataset.abschnitt) {
      k.bearbeitung = { ...(k.bearbeitung || {}), [e.target.dataset.abschnitt]: e.target.value };
      gespraechMerken(chat.gespraech, { spaeter: true });
    }
  });

  async function waehlen(n, k, wert) {
    if (k.gewaehlt) return;
    if (chat.laeuft || erkennt) { toast("Einen Moment – Gabi ist noch beschäftigt."); return; }
    if (k.wahl === "berichtart") {
      k.gewaehlt = wert;
      nachrichtNeuZeichnen(n);
      gespraechMerken();
      const titel = wert === "verlauf" ? "Verlaufsbericht" : "Zusammenfassung";
      senden({ text: `${titel} für ${k.kuerzel}`, senden: `Erstelle ${wert === "verlauf" ? "einen Verlaufsbericht" : "eine Zusammenfassung"} für ${k.kuerzel}.`, aktion: { typ: "bericht", patient_id: k.patient_id, art: wert } });
      return;
    }
    const p = (chat.patienten || []).find((x) => x.id === wert);
    if (!p) return;
    k.gewaehlt = wert;
    nachrichtNeuZeichnen(n);
    gespraechMerken();
    if (k.zweck === "diktat") diktatStarten(p);
    else lokaleAntwort(`Welche Art von Bericht für **${p.kuerzel}**?`, [{ typ: "auswahl", id: neueId(), wahl: "berichtart", patient_id: p.id, kuerzel: p.kuerzel }]);
  }

  async function entwurfSpeichern(n, k, knopf, g = chat.gespraech) {
    if (k.speichert) return;
    k.speichert = true;
    knopf.disabled = true;
    knopf.innerHTML = '<span class="drehen"></span>Speichere …';
    try {
      // dasselbe Gespräch in einem anderen Tab: dort schon gespeichert? Dann nicht ein zweites Mal (doppelte Notiz)
      const schon = g.gespeichert && verlauf.ablage ? await entwurfSchonGespeichert(g.id, k.id) : null;
      if (schon) {
        k.gespeichert = schon;
        k.bearbeiten = false;
        delete k.bearbeitung;
        nachrichtNeuZeichnen(n);
        gespraechMerken(g);
        toast("Dieser Entwurf wurde schon in einem anderen Fenster gespeichert.", { art: "erfolg", aktion: { text: "Ansehen", tun: () => { location.hash = `#/notizen/n/${schon}`; } } });
        return;
      }
      const { notiz } = await api("/api/notizen", { methode: "POST", body: { patient_id: k.patient_id, rohtext: k.rohtext || "", strukturiert: k.strukturiert } });
      k.gespeichert = notiz.id;
      ordner.notizenVon.delete(notiz.patient_id); // Patientenseite beim nächsten Besuch frisch
      ordner.notizen.set(notiz.id, notiz); // „Ansehen“ öffnet sofort
      if (g === chat.gespraech && chat.modus && chat.modus.typ === "diktat" && chat.modus.patient_id === k.patient_id) modusSetzen(null);
      nachrichtNeuZeichnen(n);
      gespraechMerken(g);
      patientenLaden().catch(() => {});
      toast(`Gespeichert bei ${k.kuerzel}${modus.demo ? " (Demo)" : ""}.`, { art: "erfolg", aktion: { text: "Ansehen", tun: () => { location.hash = `#/notizen/n/${notiz.id}`; } } });
    } catch (f) {
      if (!(f instanceof Abbruch)) toast(`Nicht gespeichert: ${f.message}`, { art: "fehler", dauer: 6000 });
      knopf.disabled = false;
      knopf.innerHTML = `${symbol("haken")}Speichern`;
    } finally {
      k.speichert = false;
    }
  }

  /** Gespeicherte Fassung des Gesprächs (Ablage) – ist dieser Entwurf dort schon gespeichert? Gibt die Notiz-ID zurück. */
  async function entwurfSchonGespeichert(gespraechId, kartenId) {
    try {
      const nachrichten = await verlauf.ablage.laden(gespraechId);
      for (const m of Array.isArray(nachrichten) ? nachrichten : []) for (const k of m.karten || []) if (k.id === kartenId && k.gespeichert) return k.gespeichert;
    } catch { /* egal – dann normal speichern */ }
    return null;
  }

  function pdfSpeichern(notiz) {
    try {
      const doc = PDF.erstellen(notiz, { jsPDF: window.jspdf.jsPDF });
      doc.save(PDF.dateiname(notiz));
    } catch { toast("PDF konnte nicht erstellt werden.", { art: "fehler" }); }
  }
  function berichtPdfSpeichern(bericht) {
    try {
      const doc = PDF.berichtErstellen(bericht, { jsPDF: window.jspdf.jsPDF });
      doc.save(PDF.berichtDateiname(bericht));
    } catch { toast("PDF konnte nicht erstellt werden.", { art: "fehler" }); }
  }

  // ---------- Test-Patienten ----------
  async function patientenLaden() {
    let patienten;
    try {
      ({ patienten } = await api("/api/patienten"));
    } catch (f) {
      // offene Auswahl-Karten zeigen den Fehler mit „Nochmal versuchen“ statt ewig Platzhalter
      if (!(f instanceof Abbruch)) {
        chat.patientenFehler = f.message;
        for (const n of chat.nachrichten) if ((n.karten || []).some((k) => k.typ === "auswahl" && !k.gewaehlt)) nachrichtNeuZeichnen(n);
      }
      throw f;
    }
    chat.patienten = patienten;
    chat.patientenFehler = "";
    seitenPatientenZeigen();
    // Auswahl-Karten mit der Liste füllen – auch schon beantwortete (nach dem Neuladen standen dort sonst Platzhalter)
    for (const n of chat.nachrichten) if ((n.karten || []).some((k) => k.typ === "auswahl")) nachrichtNeuZeichnen(n);
    return patienten;
  }

  function seitenPatientenZeigen() {
    const liste = chat.patienten || [];
    ersetzen(el.seitenPatienten, liste.length
      ? `<h2 class="augenbraue">Test-Patienten</h2>${liste.map((p) => `<a href="#/notizen/p/${esc(p.id)}"><b>${esc(p.kuerzel)}</b><span>${esc(kurzName(p))}</span><span class="badge">${esc(p.anzahl ?? 0)}</span></a>`).join("")}`
      : "");
  }

  /** Dialog „Neuer Test-Patient“. Ergebnis: der angelegte Patient oder null. */
  function patientAnlegenDialog() {
    el.patientKuerzel.value = "";
    el.patientPseudonym.value = "";
    el.patientFehler.hidden = true;
    el.patientKuerzel.removeAttribute("aria-invalid");
    return new Promise((ok) => {
      let ergebnis = null;
      const absenden = async (e) => {
        e.preventDefault();
        el.patientAnlegen.disabled = true;
        try {
          const { patient } = await api("/api/patienten", { methode: "POST", body: { kuerzel: el.patientKuerzel.value, pseudonym: el.patientPseudonym.value } });
          ergebnis = patient;
          await patientenLaden().catch(() => {});
          el.dialogPatient.close();
          toast(`Test-Patient ${patient.kuerzel} angelegt.`, { art: "erfolg" });
        } catch (f) {
          if (f instanceof Abbruch) { el.dialogPatient.close(); return; }
          el.patientFehler.innerHTML = `${symbol("warn")}<span>${esc(f.message)}</span>`;
          el.patientFehler.hidden = false;
          el.patientKuerzel.setAttribute("aria-invalid", "true");
        } finally {
          el.patientAnlegen.disabled = false;
        }
      };
      const abbrechen = () => el.dialogPatient.close();
      el.patientForm.addEventListener("submit", absenden);
      el.patientAbbrechen.addEventListener("click", abbrechen);
      el.dialogPatient.addEventListener("close", () => {
        el.patientForm.removeEventListener("submit", absenden);
        el.patientAbbrechen.removeEventListener("click", abbrechen);
        ok(ergebnis);
      }, { once: true });
      el.dialogPatient.showModal();
      setTimeout(() => el.patientKuerzel.focus(), 50);
    });
  }

  // ==========================================================
  // 7 Eingabe und Aufnahme
  // ==========================================================
  function autoHoehe(t) {
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight + 2, t.classList.contains("eingabe-text") ? 168 : 600)}px`;
  }
  function autoHoeheAlle(wurzel) { if (wurzel) for (const t of wurzel.querySelectorAll("textarea")) autoHoehe(t); }

  let erkennt = false;
  let mikroGesperrt = false;

  let mikroPerTastatur = false; // Aufnahme per Leertaste/Enter gestartet → danach Fokus zurück aufs Mikrofon
  function eingabeAktualisieren() {
    const laeuft = Boolean(chat.laeuft);
    const hatText = Boolean(el.text.value.trim());
    el.senden.disabled = (!laeuft && !hatText) || (!laeuft && erkennt);
    el.senden.innerHTML = symbol(laeuft ? "stopp" : "senden");
    el.senden.setAttribute("aria-label", laeuft ? "Antwort stoppen" : "Senden");
    el.senden.classList.toggle("stoppt", laeuft);
    el.mikro.disabled = laeuft || erkennt;
    // per Tastatur aufgenommen: Fokus zurück aufs Mikrofon, sobald es wieder geht (ein gesperrter Knopf verliert ihn)
    if (!el.mikro.disabled && mikroPerTastatur && (document.activeElement === document.body || !document.activeElement)) {
      mikroPerTastatur = false;
      el.mikro.focus();
    }
    for (const c of document.querySelectorAll("[data-schnell]")) c.disabled = laeuft || erkennt;
  }

  el.text.enterKeyHint = GROB ? "enter" : "send";
  el.text.addEventListener("input", () => { autoHoehe(el.text); eingabeAktualisieren(); });
  el.text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !GROB) {
      e.preventDefault();
      if (!chat.laeuft) el.eingabe.requestSubmit(); // während einer Antwort: nichts tun (Doppel-Enter, Vorausschreiben)
    }
    if (e.key === "Escape" && chat.modus) modusSetzen(null);
  });
  // Stoppen nur über den Stopp-Knopf (derselbe Knopf wie Senden) – nie über Enter
  el.senden.addEventListener("click", (e) => {
    if (!chat.laeuft) return;
    e.preventDefault();
    chat.laeuft.abbruch.abort();
  });
  el.eingabe.addEventListener("submit", (e) => {
    e.preventDefault();
    if (chat.laeuft) return;
    const text = el.text.value.trim();
    if (!text || erkennt) return;
    el.text.value = "";
    autoHoehe(el.text);
    eingabeAktualisieren();
    if (GROB) el.text.blur(); // Antwort nicht hinter der Tastatur verstecken
    textSenden(text, "");
  });

  /** Getippter oder gesprochener Text → je nach Modus Diktat, Suche oder normale Frage. */
  function textSenden(text, art, modusBeiAufnahme, { beispiel = false } = {}) {
    const m = modusBeiAufnahme !== undefined ? modusBeiAufnahme : chat.modus;
    if (m && m.typ === "diktat") return diktatSenden(text, { modusBeiAufnahme: m, beispiel });
    if (m && m.typ === "suche") {
      modusSetzen(null);
      return senden({ text, senden: `Suche in meinen Notizen: ${text}`, art: "suche" });
    }
    return senden({ text, art, beispiel });
  }

  function diktatSenden(text, { beispiel = false, modusBeiAufnahme = null } = {}) {
    const m = modusBeiAufnahme || chat.modus;
    if (!m || m.typ !== "diktat") return;
    senden({ text, senden: `Diktat für ${m.kuerzel}: ${text}`, aktion: { typ: "diktat", patient_id: m.patient_id, text }, art: "diktat", kuerzel: m.kuerzel, beispiel });
  }

  // ---------- Wellen-Anzeige ----------
  const WELLEN = 32;
  el.wellen.innerHTML = "<i></i>".repeat(WELLEN);
  const balken = [...el.wellen.children];
  const pegelVerlauf = new Array(WELLEN).fill(0);
  let letzterBalken = 0;
  function pegelZeigen(p) {
    el.eingabe.style.setProperty("--pegel", p.toFixed(3));
    const jetzt = performance.now();
    if (jetzt - letzterBalken < 60) return;
    letzterBalken = jetzt;
    pegelVerlauf.shift();
    pegelVerlauf.push(Math.min(1, p * 1.6));
    balken.forEach((b, i) => b.style.setProperty("--h", pegelVerlauf[i].toFixed(3)));
  }

  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  /** Hinweis direkt unter der Eingabezeile (dort, wo Blick und Finger gerade sind), danach wieder der normale Satz. */
  const fussZeile = document.querySelector(".eingabe-fuss");
  const FUSS_TEXT = fussZeile ? fussZeile.textContent : "";
  let fussUhr = null;
  function fussHinweis(text, { art = "", dauer = 5000 } = {}) {
    if (!fussZeile) return toast(text, { art });
    clearTimeout(fussUhr);
    fussZeile.textContent = text;
    fussZeile.className = `eingabe-fuss hinweis${art ? ` ${art}` : ""}`;
    fussUhr = setTimeout(() => { fussZeile.textContent = FUSS_TEXT; fussZeile.className = "eingabe-fuss"; }, dauer);
  }

  const aufnahme = AUFNAHME.erstelle({
    beiZustand(phase) {
      el.eingabe.classList.toggle("nimmt-auf", phase === "aufnahme" || phase === "startet");
      el.eingabe.classList.toggle("erkennt", phase === "stoppt" || erkennt);
      if (phase === "aufnahme") el.aufnahmeText.textContent = "Loslassen zum Senden";
      if (phase === "startet") el.aufnahmeText.textContent = "Mikrofon startet …";
      if (phase === "bereit" && !erkennt) { pegelVerlauf.fill(0); balken.forEach((b) => b.style.setProperty("--h", "0")); }
      eingabeAktualisieren();
    },
    beiPegel: pegelZeigen,
    beiZeit(s) {
      el.aufnahmeZeit.textContent = mmss(s);
      el.aufnahmeZeit.classList.toggle("knapp", s >= AUFNAHME.WARNUNG_AB_S);
    },
    beiFertig({ holen }) { erkennen(holen, chat.modus ? { ...chat.modus } : null); }, // Modus beim Loslassen zählt
    beiFehler({ text, hilfe }) {
      if (hilfe) {
        if (jetzigerHash() !== chatHash()) location.hash = chatHash();
        lokaleAntwort(hilfe.schritte && hilfe.schritte.length ? "Ich komme gerade nicht ans Mikrofon." : text, [{ typ: "hilfe", id: neueId(), titel: hilfe.titel || AUFNAHME.BLOCKIERT.titel, text: hilfe.text || "", schritte: hilfe.schritte || [] }]);
      } else fussHinweis(text, { art: "fehler", dauer: 8000 });
    },
    beiHinweis(text) { fussHinweis(text); },
    beiVerworfen({ holen }) {
      const m = chat.modus ? { ...chat.modus } : null;
      const g = chat.gespraech; // die Aufnahme gehört zu diesem Gespräch
      toast("Aufnahme verworfen.", { dauer: 9000, aktion: { text: "Rückgängig", tun: () => {
        if (verwaist(g)) { aufnahmeVerwaist(null); return; }
        if (g === chat.gespraech && !erkennt && !chat.laeuft && aufnahme.phase === "bereit") return erkennen(holen, m);
        // Gabi ist beschäftigt oder ein anderes Gespräch ist offen: nicht parallel/woanders schicken, sondern als Karte parken
        const k = { typ: "aufnahme", id: neueId(), zurueck: true, erneut: true, fehlerText: "Zurückgeholte Aufnahme – noch nicht gesendet." };
        aufnahmen.set(k.id, { holen, modusBeiAufnahme: m });
        if (g === chat.gespraech) {
          if (jetzigerHash() !== chatHash()) location.hash = chatHash();
          lokaleAntwort("Deine Aufnahme ist zurück. Tipp auf „Jetzt senden“, sobald ich fertig bin.", [k]);
        } else {
          lokaleAntwort("Deine Aufnahme ist zurück. Tipp auf „Jetzt senden“, um sie zu schicken.", [k], g);
          toast("Die Aufnahme wartet im vorigen Gespräch.", { dauer: 5000 });
        }
      } } });
    },
  });

  /** Hochladen erst, wenn die App sichtbar ist (iOS bricht Hintergrund-Uploads gern ab). */
  function sichtbar() {
    if (!document.hidden) return Promise.resolve();
    return new Promise((ok) => {
      const pruefen = () => { if (!document.hidden) { document.removeEventListener("visibilitychange", pruefen); ok(); } };
      document.addEventListener("visibilitychange", pruefen);
    });
  }

  /** Das Gespräch der Aufnahme wurde inzwischen gelöscht (oder abgemeldet): nichts parken, nichts senden, nichts behalten. */
  function aufnahmeVerwaist(wiederholung) {
    if (wiederholung) aufnahmen.delete(wiederholung.k.id);
    toast("Die Aufnahme wurde verworfen – ihr Gespräch ist gelöscht oder du hast dich abgemeldet.", { dauer: 5000 });
  }

  async function erkennen(holen, modusBeiAufnahme, wiederholung = null, g = chat.gespraech) {
    erkennt = true;
    el.eingabe.classList.add("erkennt");
    el.eingabe.classList.remove("nimmt-auf");
    el.aufnahmeText.textContent = "Ich schreibe mit …";
    el.aufnahmeZeit.textContent = "";
    el.aufnahmeZeit.innerHTML = '<span class="drehen"></span>';
    eingabeAktualisieren();
    try {
      const b64 = await holen();
      await sichtbar();
      const zweck = modusBeiAufnahme && modusBeiAufnahme.typ === "diktat" ? "diktat" : "frage";
      const demoZusatz = modus.demo ? `?zweck=${zweck}${zweck === "diktat" ? `&patient=${encodeURIComponent(modusBeiAufnahme.kuerzel)}` : ""}` : "";
      const d = await api(`/api/transkribieren${demoZusatz}`, { methode: "POST", text: b64, zeit: 180000 });
      const text = String((d && d.text) || "").trim();
      if (verwaist(g)) { aufnahmeVerwaist(wiederholung); return; }
      if (!text) {
        if (wiederholung) {
          // dieselbe leere Aufnahme nicht nochmal schicken – nur „Verwerfen“ bleibt
          Object.assign(wiederholung.k, { sendet: false, erneut: false, leer: true, fehlerText: "In der Aufnahme habe ich nichts verstanden." });
          aufnahmen.delete(wiederholung.k.id);
          nachrichtNeuZeichnen(wiederholung.n);
          gespraechMerken(g);
        } else fussHinweis("Ich habe nichts verstanden. Bitte nochmal deutlich sprechen.", { art: "warn" });
        return;
      }
      erkennt = false;
      el.eingabe.classList.remove("erkennt");
      if (g !== chat.gespraech) {
        // inzwischen ein anderes Gespräch offen: dort nichts hineinschicken – im eigenen Gespräch als Karte parken
        const hinweis = "Du hast das Gespräch gewechselt, bevor die Aufnahme ankam – noch nicht gesendet.";
        if (wiederholung) Object.assign(wiederholung.k, { sendet: false, erneut: true, zurueck: true, fehlerText: hinweis });
        else {
          const k = { typ: "aufnahme", id: neueId(), zurueck: true, erneut: true, fehlerText: hinweis };
          aufnahmen.set(k.id, { holen, modusBeiAufnahme });
          lokaleAntwort("Deine Aufnahme ist noch nicht gesendet. Tipp auf „Jetzt senden“, um sie zu schicken.", [k], g);
        }
        gespraechMerken(g);
        toast("Die Aufnahme wartet im vorigen Gespräch.", { dauer: 5000 });
        return;
      }
      if (wiederholung) {
        Object.assign(wiederholung.k, { erledigt: true, sendet: false });
        aufnahmen.delete(wiederholung.k.id);
        nachrichtNeuZeichnen(wiederholung.n);
      }
      if (modus.demo) toast("Demo-Modus: Statt deiner Aufnahme steht hier ein Beispieltext.", { dauer: 5000 });
      if (chat.laeuft) {
        // sollte nicht passieren (Senden ist gesperrt) – dann nichts verlieren: Text ins Eingabefeld
        el.text.value = [el.text.value.trim(), text].filter(Boolean).join("\n");
        autoHoehe(el.text);
        toast("Gabi antwortet noch – dein Text steht im Eingabefeld.");
        return;
      }
      textSenden(text, "stimme", modusBeiAufnahme, { beispiel: modus.demo });
    } catch (f) {
      if (f instanceof Abbruch) return;
      if (verwaist(g)) { aufnahmeVerwaist(wiederholung); return; }
      // bleibende Karte statt Toast: die Aufnahme bleibt erhalten, bis sie nachgeschickt oder verworfen ist
      if (wiederholung) {
        Object.assign(wiederholung.k, { sendet: false, fehlerText: f.message, erneut: !f.keineWiederholung });
        nachrichtNeuZeichnen(wiederholung.n);
        gespraechMerken(g);
      } else {
        const k = { typ: "aufnahme", id: neueId(), fehlerText: f.message, erneut: !f.keineWiederholung };
        aufnahmen.set(k.id, { holen, modusBeiAufnahme });
        if (g === chat.gespraech && jetzigerHash() !== chatHash()) location.hash = chatHash();
        const fuer = modusBeiAufnahme && modusBeiAufnahme.typ === "diktat" ? ` für **${modusBeiAufnahme.kuerzel}**` : "";
        lokaleAntwort(`Dein ${fuer ? "Diktat" : "gesprochener Text"}${fuer} ist nicht angekommen.`, [k], g);
        if (g !== chat.gespraech) toast("Die Aufnahme ist nicht angekommen – sie wartet im vorigen Gespräch.", { art: "warn", dauer: 6000 });
      }
    } finally {
      erkennt = false;
      el.eingabe.classList.remove("erkennt");
      el.aufnahmeZeit.textContent = "0:00";
      eingabeAktualisieren();
      // Karte nie auf „Sende …“ stehen lassen (z. B. Abbruch, weil der Zugangscode neu eingegeben werden muss)
      if (wiederholung && wiederholung.k.sendet) { wiederholung.k.sendet = false; nachrichtNeuZeichnen(wiederholung.n); }
    }
  }

  // ---------- Push-to-Talk: gedrückt halten = aufnehmen, loslassen = senden, wegziehen = verwerfen ----------
  let zeiger = null;
  let startPunkt = null;
  let verwerfen = false;
  // clientX/Y zählen ab dem Layout-Viewport. Schließt sich auf dem iPhone die Tastatur (das Textfeld verschwindet während
  // der Aufnahme), verschiebt sich der sichtbare Ausschnitt (visualViewport.offsetTop) – der Finger aber nicht.
  const fingerPunkt = (e) => {
    const vv = window.visualViewport;
    return { x: e.clientX - ((vv && vv.offsetLeft) || 0), y: e.clientY - ((vv && vv.offsetTop) || 0) };
  };
  function aufnahmeBeginnen() {
    if (chat.laeuft || erkennt || aufnahme.phase !== "bereit") return false;
    if (mikroGesperrt) {
      lokaleAntwort("Ich komme gerade nicht ans Mikrofon.", [{ typ: "hilfe", id: neueId(), titel: AUFNAHME.BLOCKIERT.titel, text: AUFNAHME.BLOCKIERT.text, schritte: AUFNAHME.HILFE_SCHRITTE }]);
      return false;
    }
    sprechenStoppen();
    verwerfen = false;
    aufnahme.start();
    return true;
  }
  el.mikro.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || zeiger !== null) return;
    e.preventDefault();
    if (document.activeElement === el.text) el.text.blur(); // Tastatur zu, bevor die Eingabezeile zur Aufnahme wird
    if (!aufnahmeBeginnen()) return;
    zeiger = e.pointerId;
    startPunkt = fingerPunkt(e);
    try { el.mikro.setPointerCapture(e.pointerId); } catch { /* egal */ }
  });
  el.mikro.addEventListener("pointermove", (e) => {
    if (e.pointerId !== zeiger || !startPunkt) return;
    const p = fingerPunkt(e);
    const weit = Math.max(startPunkt.x - p.x, startPunkt.y - p.y) > 140; // deutlich nach links oder oben
    if (weit !== verwerfen) {
      verwerfen = weit;
      el.aufnahmeText.textContent = weit ? "Loslassen zum Verwerfen" : "Loslassen zum Senden";
      el.eingabe.classList.toggle("verwirft", weit);
    }
  });
  const loslassen = (e) => {
    if (e.pointerId !== zeiger) return;
    zeiger = null;
    startPunkt = null;
    el.eingabe.classList.remove("verwirft");
    if (verwerfen) aufnahme.abbrechen();
    else aufnahme.stopp();
  };
  el.mikro.addEventListener("pointerup", loslassen);
  el.mikro.addEventListener("pointercancel", loslassen);
  el.mikro.addEventListener("contextmenu", (e) => e.preventDefault());
  el.mikro.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); if (aufnahmeBeginnen()) mikroPerTastatur = true; }
    if (e.key === "Escape") aufnahme.abbrechen();
  });
  el.mikro.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); aufnahme.stopp(); } });
  // App im Hintergrund (Anruf, Sperrbildschirm): Aufnahme sauber beenden und schicken
  document.addEventListener("visibilitychange", () => { if (document.hidden && aufnahme.phase === "aufnahme") aufnahme.stopp(); });
  window.addEventListener("blur", () => { if (aufnahme.phase === "aufnahme" && zeiger === null) aufnahme.stopp(); });

  // ==========================================================
  // 8 Notizen
  // ==========================================================
  // Zwischenspeicher: einmal Geladenes erscheint beim nächsten Besuch sofort (ein Render) und wird im Hintergrund
  // aufgefrischt – neu gezeichnet wird nur, wenn sich wirklich etwas geändert hat (ersetzen()).
  const ordner = {
    geaendert: false, bearbeiten: null, suche: "", suchNummer: 0, beschaeftigt: false,
    gesehen: new Set(), // Ansichten, deren Karten schon einmal eingeblendet wurden
    notizenVon: new Map(), // Patienten-ID → Notizliste
    notizen: new Map(), // Notiz-ID → vollständige Notiz
  };
  function ordnerZwischenspeicherLeeren() { ordner.notizenVon.clear(); ordner.notizen.clear(); ordner.bearbeiten = null; ordner.geaendert = false; }
  const SORTIERUNG = "gabi.sortierung";
  const sortierung = () => (speicher.lesen("lokal", SORTIERUNG) === "alt" ? "alt" : "neu");
  const sortiert = (liste) => [...liste].sort((a, b) => (sortierung() === "alt" ? 1 : -1) * (a.erstellt_am < b.erstellt_am ? -1 : a.erstellt_am > b.erstellt_am ? 1 : 0));

  /** Karten nur beim ersten Betreten einer Ansicht einblenden – nie bei Aktualisierungen oder späteren Besuchen. */
  function erstesMal(schluessel, knoten) {
    if (!knoten || ordner.gesehen.has(schluessel)) return;
    ordner.gesehen.add(schluessel);
    knoten.classList.add("einblenden");
  }
  /** Höchstens kurz auf Daten warten – so lange bleibt der alte Inhalt stehen; dauert es länger, kommt der Platzhalter. */
  function mitFrist(versprechen, platzhalter, ms = 150) {
    let uhr = null;
    const frist = new Promise((ok) => { uhr = setTimeout(() => ok(false), ms); });
    return Promise.race([versprechen.then(() => true, () => true), frist]).then((rechtzeitig) => {
      clearTimeout(uhr);
      if (!rechtzeitig && platzhalter) platzhalter();
    });
  }

  /** Platzhalter in der Höhe der echten Karten (kein Springen, wenn die Daten kommen). */
  function skelettHtml(anzahl = 3, art = "karte") {
    return `<div class="${art === "notiz" ? "notiz-liste" : "raster"}">${Array.from({ length: anzahl }, () => `<div class="skelett" data-skelett-${art}></div>`).join("")}</div>`;
  }

  function leerHtml({ sym, titel, text, knopf }) {
    return `<div class="leer"><div class="kachel">${symbol(sym)}</div><h2>${esc(titel)}</h2>${text ? `<p>${esc(text)}</p>` : ""}${knopf || ""}</div>`;
  }

  function notizKarteHtml(n, mitKuerzel) {
    const unklar = K.anzahlUnklar(n.strukturiert);
    const vorschau = K.vorschau(n.strukturiert) || "Ohne Stichpunkte";
    return `<a class="notiz-karte" href="#/notizen/n/${esc(n.id)}">
      <div class="notiz-karte-kopf">${mitKuerzel ? `<span class="badge akzent">${esc(n.kuerzel)}</span>` : ""}<strong>${esc(K.wann(n.erstellt_am))}</strong>${n.geaendert_am ? '<span class="stumm">· bearbeitet</span>' : ""}
      ${unklar ? `<span class="badge warn">${unklar} zu prüfen</span>` : ""}</div>
      <p>${K.mitUnklar(vorschau)}</p></a>`;
  }

  function sortierungHtml() {
    return `<label class="sortierung"><span class="unsichtbar">Sortierung</span><select id="sortierung">
      <option value="neu"${sortierung() === "neu" ? " selected" : ""}>Neueste zuerst</option>
      <option value="alt"${sortierung() === "alt" ? " selected" : ""}>Älteste zuerst</option></select>${symbol("runter")}</label>`;
  }

  async function notizenZeigen(hash) {
    const teile = hash.replace(/^#\/notizen\/?/, "").split("/").filter(Boolean);
    if (teile[0] === "p" && teile[1]) return patientZeigen(teile[1]);
    if (teile[0] === "n" && teile[1]) return notizZeigen(teile[1]);
    return uebersichtZeigen();
  }

  const fehlerLadenHtml = (f) => leerHtml({ sym: "offline", titel: "Notizen konnten nicht geladen werden", text: f.message, knopf: `<button class="knopf sekundaer" type="button" data-ordner="neu-laden">${symbol("zuruecksetzen")}Nochmal versuchen</button>` });

  // ---------- Übersicht: Suche + Patienten-Karten ----------
  function geruestHtml() {
    return `<div class="notizen-kopf"><div class="titel-block"><span class="augenbraue">Notizordner</span><h1>Notizen</h1></div>
        <button class="knopf sekundaer klein" type="button" data-ordner="patient-neu">${symbol("person-plus")}Test-Patient</button></div>
      <div class="werkzeugleiste">
        <label class="suche">${symbol("suche")}<span class="unsichtbar">Notizen durchsuchen</span>
          <input id="suche" type="search" placeholder="Notizen durchsuchen …" autocomplete="off" enterkeyhint="search" value="${esc(ordner.suche)}">
          <button class="rund-knopf" type="button" data-ordner="suche-loeschen" aria-label="Suche löschen" ${ordner.suche ? "" : "hidden"}>${symbol("x", "klein")}</button></label>
      </div>
      <div id="ordner-inhalt"></div>`;
  }

  function uebersichtHtml(patienten) {
    if (!patienten.length) {
      return leerHtml({ sym: "person-plus", titel: "Noch keine Test-Patienten", text: "Leg einen Test-Patienten mit Kürzel an (z. B. TP-01) – bitte nur erfundene Testdaten.", knopf: `<button class="knopf primaer" type="button" data-ordner="patient-neu">${symbol("plus")}Test-Patient anlegen</button>` });
    }
    const gesamt = patienten.reduce((s, p) => s + (p.anzahl || 0), 0);
    return `<p class="suche-hinweis">${patienten.length === 1 ? "1 Test-Patient" : `${patienten.length} Test-Patienten`} · ${gesamt === 1 ? "1 Notiz" : `${gesamt} Notizen`}</p>
      <div class="raster">${patienten.map((p) => `<a class="patient-karte" href="#/notizen/p/${esc(p.id)}">
        <span class="patient-kachel">${esc(p.kuerzel.replace(/^[A-Z]+-?/, "") || p.kuerzel.slice(0, 2))}</span>
        <span class="patient-text"><strong>${esc(p.kuerzel)}</strong><span>${esc(kurzName(p) || "Test-Patient")}</span><small>${p.anzahl === 1 ? "1 Notiz" : `${esc(p.anzahl || 0)} Notizen`}</small></span>${symbol("rechts")}</a>`).join("")}
        <button class="patient-karte neu-karte" type="button" data-ordner="patient-neu">${symbol("plus")}Neuer Test-Patient</button></div>`;
  }

  async function uebersichtZeigen() {
    if (!el.notizen.querySelector("#suche")) ersetzen(el.notizen, geruestHtml());
    if (ordner.suche.trim()) return sucheAusfuehren();
    const inhalt = el.notizen.querySelector("#ordner-inhalt");
    const zeigen = (patienten) => { delete inhalt.dataset.suche; if (ersetzen(inhalt, uebersichtHtml(patienten))) erstesMal("uebersicht", inhalt.querySelector(".raster")); };
    if (chat.patienten) zeigen(chat.patienten); // sofort aus dem Zwischenspeicher
    const frisch = patientenLaden().then((patienten) => {
      if (ordner.suche.trim() || jetzigerHash() !== "#/notizen" || !inhalt.isConnected) return; // inzwischen wird gesucht oder woanders gelesen
      zeigen(patienten); // nur neu, wenn sich etwas geändert hat
    }).catch((f) => {
      if (f instanceof Abbruch || !inhalt.isConnected || inhalt.querySelector(".patient-karte, .leer")) return; // Gezeigtes bleibt stehen
      ersetzen(inhalt, fehlerLadenHtml(f));
    });
    // Platzhalter wie das Ergebnis aufgebaut (Zeile „N Test-Patienten · N Notizen“ + Karten) – nichts rutscht, wenn es kommt
    if (!inhalt.children.length) await mitFrist(frisch, () => { if (inhalt.isConnected && !inhalt.children.length) ersetzen(inhalt, `<div class="skelett skelett-zeile"></div>${skelettHtml(3)}`); });
  }

  let sucheUhr = null;
  async function sucheAusfuehren() {
    if (jetzigerHash() !== "#/notizen") return; // inzwischen woanders hin navigiert
    const inhalt = el.notizen.querySelector("#ordner-inhalt");
    if (!inhalt) return;
    const q = ordner.suche.trim();
    const loeschen = el.notizen.querySelector('label.suche [data-ordner="suche-loeschen"]');
    if (loeschen) loeschen.hidden = !ordner.suche;
    if (!q) { uebersichtZeigen(); return; }
    if (q.replace(/[^\p{L}\p{N}]/gu, "").length < 2) { delete inhalt.dataset.suche; ersetzen(inhalt, '<p class="suche-hinweis">Bitte mindestens 2 Buchstaben eingeben.</p>'); return; }
    const nummer = ++ordner.suchNummer;
    const fertig = api(`/api/notizen?q=${encodeURIComponent(q)}`).then(({ notizen }) => {
      if (nummer !== ordner.suchNummer || !inhalt.isConnected) return; // eine neuere Suche läuft schon
      inhalt.dataset.suche = q;
      ersetzen(inhalt, notizen.length
        ? `<div class="ergebnis-kopf"><p class="suche-hinweis">${notizen.length === 1 ? "1 Notiz" : `${notizen.length} Notizen`} zu „${esc(q)}“ gefunden</p>${notizen.length > 1 ? sortierungHtml() : ""}</div><div class="notiz-liste">${sortiert(notizen).map((n) => notizKarteHtml(n, true)).join("")}</div>`
        : leerHtml({ sym: "suche", titel: "Nichts gefunden", text: `Keine Notiz enthält „${q}“.`, knopf: `<button class="knopf sekundaer" type="button" data-ordner="suche-loeschen">Suche löschen</button>` }));
    }).catch((f) => {
      if (f instanceof Abbruch || nummer !== ordner.suchNummer || !inhalt.isConnected) return;
      inhalt.dataset.suche = q;
      ersetzen(inhalt, leerHtml({ sym: "warn", titel: "Suche fehlgeschlagen", text: f.message }));
    });
    // bisherige Treffer (auch „Nichts gefunden“ zur selben Suche) bleiben stehen, bis die neuen da sind – Platzhalter nur,
    // wenn es länger dauert und noch kein Ergebnis steht
    await mitFrist(fertig, () => {
      if (nummer !== ordner.suchNummer || !inhalt.isConnected || inhalt.querySelector(".notiz-liste") || inhalt.dataset.suche === q) return;
      ersetzen(inhalt, skelettHtml(2, "notiz"));
    });
  }

  el.notizen.addEventListener("input", (e) => {
    if (e.target.id === "suche") {
      ordner.suche = e.target.value;
      clearTimeout(sucheUhr);
      sucheUhr = setTimeout(sucheAusfuehren, 250);
    }
    if (e.target.matches("textarea")) { autoHoehe(e.target); ordner.geaendert = true; }
  });
  el.notizen.addEventListener("keydown", (e) => {
    if (e.target.id === "suche" && e.key === "Escape") { ordner.suche = ""; e.target.value = ""; sucheAusfuehren(); }
  });
  el.notizen.addEventListener("change", (e) => {
    if (e.target.id === "sortierung") {
      speicher.schreiben("lokal", SORTIERUNG, e.target.value);
      notizenZeigen(jetzigerHash());
    }
  });

  // ---------- Patient ----------
  const zurueckZurUebersicht = () => `<a class="zurueck" href="#/notizen">${symbol("links")}Alle Test-Patienten</a>`;

  function patientHtml(p, notizen) {
    const anzahl = notizen ? notizen.length : Number(p.anzahl) || 0;
    const liste = !notizen ? skelettHtml(Math.max(1, Math.min(anzahl, 6)), "notiz")
      : notizen.length ? `<div class="notiz-liste">${sortiert(notizen).map((n) => notizKarteHtml(n, false)).join("")}</div>`
        : leerHtml({ sym: "mikro", titel: `Noch keine Notizen für ${p.kuerzel}`, text: "Diktier die erste Behandlung – Gabi sortiert sie für dich.", knopf: `<button class="knopf primaer" type="button" data-ordner="diktieren" data-id="${esc(p.id)}">${symbol("mikro")}Jetzt diktieren</button>` });
    return `${zurueckZurUebersicht()}<div id="ordner-inhalt"><div class="leser-kopf">
        <div class="leser-titel"><span class="patient-kachel">${esc(p.kuerzel.replace(/^[A-Z]+-?/, "") || p.kuerzel.slice(0, 2))}</span>
          <div class="titel-block"><h1>${esc(p.kuerzel)}</h1><span class="stumm">${esc(p.pseudonym || "Test-Patient")} · ${anzahl === 1 ? "1 Notiz" : `${anzahl} Notizen`}</span></div></div>
        <div class="leser-aktionen">
          <button class="knopf primaer klein" type="button" data-ordner="diktieren" data-id="${esc(p.id)}">${symbol("mikro")}Behandlung diktieren</button>
          <button class="knopf sekundaer klein" type="button" data-ordner="bericht" data-id="${esc(p.id)}" ${anzahl ? "" : "disabled"}>${symbol("bericht")}Bericht</button>
          ${anzahl > 1 ? `<span class="rechts">${sortierungHtml()}</span>` : ""}
        </div></div>${liste}</div>`;
  }

  async function patientZeigen(id) {
    const ziel = `#/notizen/p/${id}`;
    const zeigen = () => {
      const p = (chat.patienten || []).find((x) => x.id === id);
      const notizen = ordner.notizenVon.get(id);
      if (!p || !notizen) return false;
      if (ersetzen(el.notizen, patientHtml(p, notizen))) erstesMal(`p:${id}`, el.notizen.querySelector(".notiz-liste"));
      return true;
    };
    const schonDa = zeigen(); // schon einmal geladen: sofort, im Hintergrund auffrischen
    const laden = (async () => {
      let patienten = chat.patienten || (await patientenLaden());
      if (!patienten.some((x) => x.id === id)) patienten = await patientenLaden();
      if (!patienten.some((x) => x.id === id)) {
        if (jetzigerHash() === ziel) ersetzen(el.notizen, `${zurueckZurUebersicht()}<div id="ordner-inhalt">${leerHtml({ sym: "warn", titel: "Test-Patient nicht gefunden", knopf: `<a class="knopf sekundaer" href="#/notizen">Zur Übersicht</a>` })}</div>`);
        return;
      }
      const { notizen } = await api(`/api/notizen?patient_id=${encodeURIComponent(id)}`);
      ordner.notizenVon.set(id, notizen);
      if (jetzigerHash() === ziel) zeigen();
    })().catch((f) => {
      if (f instanceof Abbruch || jetzigerHash() !== ziel || ordner.notizenVon.has(id)) return; // Gezeigtes bleibt stehen
      ersetzen(el.notizen, `${zurueckZurUebersicht()}<div id="ordner-inhalt">${fehlerLadenHtml(f)}</div>`);
    });
    if (!schonDa) {
      await mitFrist(laden, () => {
        if (jetzigerHash() !== ziel || ordner.notizenVon.has(id)) return;
        const p = (chat.patienten || []).find((x) => x.id === id);
        ersetzen(el.notizen, p ? patientHtml(p, null) : `${zurueckZurUebersicht()}<div id="ordner-inhalt">${skelettHtml(2, "notiz")}</div>`);
      });
    }
  }

  // ---------- Notiz lesen und bearbeiten ----------
  let offeneNotiz = null;
  function notizAusListen(id) {
    for (const liste of ordner.notizenVon.values()) { const n = liste.find((x) => x.id === id); if (n) return n; }
    return null;
  }
  async function notizZeigen(id) {
    const ziel = `#/notizen/n/${id}`;
    const vorhanden = ordner.notizen.get(id);
    if (vorhanden) { offeneNotiz = vorhanden; ordner.bearbeiten = null; leserZeichnen(); }
    const laden = api(`/api/notizen/${encodeURIComponent(id)}`).then(({ notiz }) => {
      ordner.notizen.set(id, notiz);
      if (jetzigerHash() !== ziel || ordner.bearbeiten === id) return; // nie unter einer laufenden Bearbeitung neu zeichnen
      offeneNotiz = notiz;
      ordner.bearbeiten = null;
      leserZeichnen(); // nur neu, wenn sich etwas geändert hat
    }).catch((f) => {
      if (f instanceof Abbruch || jetzigerHash() !== ziel) return;
      if (f.status === 404) { ordner.notizen.delete(id); offeneNotiz = null; } else if (vorhanden) return; // Gezeigtes bleibt stehen
      const n = notizAusListen(id);
      ersetzen(el.notizen, `<a class="zurueck" href="${n ? `#/notizen/p/${esc(n.patient_id)}` : "#/notizen"}">${symbol("links")}${n ? esc(n.kuerzel) : "Zurück"}</a><div id="ordner-inhalt">${leerHtml({ sym: "warn", titel: f.status === 404 ? "Notiz nicht gefunden" : "Notiz konnte nicht geladen werden", text: f.status === 404 ? "Vielleicht wurde sie gelöscht." : f.message, knopf: `<a class="knopf sekundaer" href="#/notizen">Zur Übersicht</a>` })}</div>`);
    });
    if (!vorhanden) {
      await mitFrist(laden, () => {
        if (jetzigerHash() !== ziel || ordner.notizen.has(id)) return;
        const n = notizAusListen(id);
        // wie die echte Notiz aufgebaut (Kopf mit Datum, dann die Karte) – die Karte beginnt dort, wo sie gleich steht
        ersetzen(el.notizen, `<a class="zurueck" href="${n ? `#/notizen/p/${esc(n.patient_id)}` : "#/notizen"}">${symbol("links")}${n ? esc(n.kuerzel) : "Zurück"}</a>
          <article class="leser"><div class="leser-kopf"><div class="titel-block"><div class="skelett skelett-augenbraue"></div><div class="skelett skelett-titel"></div><div class="skelett skelett-zeile"></div></div></div>
          <div class="skelett" data-skelett-leser></div></article>`);
      });
    }
  }

  function leserZeichnen() {
    const n = offeneNotiz;
    const s = n.strukturiert || {};
    const bearbeiten = ordner.bearbeiten === n.id;
    const abschnitte = K.ABSCHNITTE.map(([key, titel]) => {
      const liste = K.stichpunkte(s[key]);
      if (bearbeiten) return `<section class="abschnitt"><label class="feld"><span class="augenbraue">${titel}</span><textarea class="eingabefeld" data-abschnitt="${key}" rows="${Math.max(2, liste.length)}" placeholder="Ein Stichpunkt pro Zeile">${esc(liste.join("\n"))}</textarea></label></section>`;
      return `<section class="abschnitt"><h3 class="augenbraue">${titel}</h3>${liste.length ? punkteHtml(liste) : '<p class="abschnitt-leer">Nichts notiert</p>'}</section>`;
    }).join("");
    const unklar = K.stichpunkte(s.unklar);
    const pruefen = !unklar.length ? ""
      : bearbeiten ? pruefenFeld(unklar.join("\n"), unklar.length)
        : `<section class="abschnitt pruefen"><h3 class="augenbraue">${symbol("warn", "klein")}Bitte prüfen</h3>${punkteHtml(unklar)}</section>`;
    const aktionen = bearbeiten
      ? `<button class="knopf primaer klein" type="button" data-leser="sichern">${symbol("haken")}Speichern</button><button class="knopf leise klein" type="button" data-leser="abbrechen">Abbrechen</button>`
      : `<button class="knopf sekundaer klein" type="button" data-leser="bearbeiten">${symbol("stift")}Bearbeiten</button>
         <button class="knopf sekundaer klein" type="button" data-leser="pdf">${symbol("pdf")}PDF</button>
         <button class="knopf gefahr klein rechts" type="button" data-leser="loeschen">${symbol("muell")}Löschen</button>`;
    const neu = ersetzen(el.notizen, `<a class="zurueck" href="#/notizen/p/${esc(n.patient_id)}">${symbol("links")}${esc(n.kuerzel)}</a>
      <article class="leser">
        <div class="leser-kopf"><div class="titel-block"><span class="augenbraue">Behandlungsnotiz · ${esc(n.kuerzel)}</span><h1>${esc(K.datumLang(n.erstellt_am))}</h1>
          <span class="stumm leser-zeit">${esc(n.pseudonym || "Test-Patient")}${n.geaendert_am ? ` · bearbeitet ${esc(K.wann(n.geaendert_am).replace(/^(Heute|Gestern)\b/, (w) => w.toLowerCase()))}` : ""}</span></div></div>
        <div class="karte mit-streifen"><div class="abschnitte">${abschnitte}${pruefen}</div></div>
        ${n.rohtext ? `<details class="original"><summary>${symbol("rechts")}Original-Diktat</summary><p>${esc(n.rohtext)}</p></details>` : ""}
        <div class="leser-aktionen">${aktionen}</div>
      </article>`);
    if (neu && bearbeiten) autoHoeheAlle(el.notizen);
  }

  el.notizen.addEventListener("click", async (e) => {
    const o = e.target.closest("[data-ordner]");
    if (o && !o.disabled) {
      const was = o.dataset.ordner;
      if (was === "patient-neu") { const p = await patientAnlegenDialog(); if (p) location.hash = `#/notizen/p/${p.id}`; return; }
      if (was === "suche-loeschen") {
        ordner.suche = "";
        const feld = el.notizen.querySelector("#suche");
        if (feld) { feld.value = ""; feld.focus(); }
        const x = el.notizen.querySelector('label.suche [data-ordner="suche-loeschen"]');
        if (x) x.hidden = true;
        uebersichtZeigen();
        return;
      }
      if (was === "neu-laden") { notizenZeigen(location.hash); return; }
      const p = (chat.patienten || []).find((x) => x.id === o.dataset.id);
      if (!p) return;
      if (was === "diktieren") { if (jetzigerHash() !== chatHash()) location.hash = chatHash(); await route(); diktatStarten(p); return; }
      if (was === "bericht") {
        modusSetzen(null);
        if (jetzigerHash() !== chatHash()) location.hash = chatHash();
        await route();
        lokaleAntwort(`Welche Art von Bericht für **${p.kuerzel}**?`, [{ typ: "auswahl", id: neueId(), wahl: "berichtart", patient_id: p.id, kuerzel: p.kuerzel }]);
      }
      return;
    }
    const l = e.target.closest("[data-leser]");
    if (!l || l.disabled || !offeneNotiz || ordner.beschaeftigt) return;
    const n = offeneNotiz;
    const was = l.dataset.leser;
    if (was === "pdf") return pdfSpeichern(n);
    if (was === "bearbeiten") { ordner.bearbeiten = n.id; ordner.geaendert = false; leserZeichnen(); el.notizen.querySelector("textarea")?.focus(); return; }
    if (was === "abbrechen") {
      if (ordner.geaendert && !(await frage("Änderungen verwerfen?", "Deine Änderungen an dieser Notiz gehen verloren.", { ja: "Verwerfen", gefahr: true }))) return;
      ordner.bearbeiten = null; ordner.geaendert = false; leserZeichnen(); return;
    }
    if (was === "sichern") {
      const s = { ...n.strukturiert };
      for (const t of el.notizen.querySelectorAll("textarea[data-abschnitt]")) s[t.dataset.abschnitt] = t.value.split("\n").map((z) => z.trim()).filter(Boolean);
      ordner.beschaeftigt = true;
      l.disabled = true;
      try {
        const { notiz } = await api(`/api/notizen/${n.id}`, { methode: "PATCH", body: { strukturiert: s } });
        ordner.notizen.set(notiz.id, notiz);
        ordner.notizenVon.delete(notiz.patient_id);
        offeneNotiz = notiz;
        ordner.bearbeiten = null;
        ordner.geaendert = false;
        leserZeichnen();
        toast("Änderungen gespeichert.", { art: "erfolg" });
      } catch (f) {
        if (!(f instanceof Abbruch)) toast(`Nicht gespeichert: ${f.message}`, { art: "fehler", dauer: 6000 });
        l.disabled = false;
      } finally {
        ordner.beschaeftigt = false;
      }
      return;
    }
    if (was === "loeschen") {
      if (!(await frage("Notiz löschen?", `Die Notiz vom ${K.datum(n.erstellt_am)} (${n.kuerzel}) wird endgültig gelöscht.`, { ja: "Löschen", gefahr: true }))) return;
      ordner.beschaeftigt = true;
      try {
        await api(`/api/notizen/${n.id}`, { methode: "DELETE" });
        ordner.notizen.delete(n.id);
        ordner.notizenVon.delete(n.patient_id);
        offeneNotiz = null;
        patientenLaden().catch(() => {});
        toast("Notiz gelöscht.", { art: "erfolg" });
        location.hash = `#/notizen/p/${n.patient_id}`;
      } catch (f) {
        if (!(f instanceof Abbruch)) toast(`Nicht gelöscht: ${f.message}`, { art: "fehler" });
      } finally {
        ordner.beschaeftigt = false;
      }
    }
  });

  // ==========================================================
  // 9 Vorlesen, Kopieren, Schutz vor Datenverlust
  // ==========================================================
  const SPRACHE = "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function" ? window.speechSynthesis : null;
  let vorleseId = null;
  function sprechenStoppen() {
    if (!SPRACHE || !vorleseId) return;
    const n = chat.nachrichten.find((x) => x.id === vorleseId);
    vorleseId = null;
    SPRACHE.cancel();
    if (n) nachrichtNeuZeichnen(n);
  }
  /** Nur Stimmen, die auf dem Gerät sprechen (localService) – Online-Stimmen wie „Google Deutsch“ schicken den Text ins Netz. */
  const lokaleDeutscheStimme = () => SPRACHE.getVoices().find((v) => v.localService && /^de(-|_|$)/i.test(v.lang || "")) || null;
  // Stimmen schon beim Start laden: iOS spricht nur direkt im Tipp, nicht nach einer Wartezeit
  let stimmenDa = false;
  if (SPRACHE) {
    const laden = () => { try { stimmenDa = SPRACHE.getVoices().length > 0; } catch { stimmenDa = false; } };
    laden();
    try { SPRACHE.addEventListener("voiceschanged", laden); } catch { /* ältere Browser */ }
  }
  function vorlesen(n) {
    if (!SPRACHE) return;
    if (vorleseId === n.id) { sprechenStoppen(); return; }
    sprechenStoppen();
    const stimme = lokaleDeutscheStimme();
    if (!stimme) {
      toast(stimmenDa
        ? "Vorlesen geht hier nicht: Dieses Gerät hat keine deutsche Stimme, die ohne Internet arbeitet. Der Text bleibt auf dem Gerät."
        : "Die Stimme lädt noch – bitte gleich noch einmal tippen.", { art: "warn", dauer: 6000 });
      return;
    }
    const u = new SpeechSynthesisUtterance(K.ohneFormat(n.text));
    u.voice = stimme;
    u.lang = stimme.lang || "de-DE";
    u.rate = 1.02;
    u.onend = u.onerror = () => { if (vorleseId === n.id) { vorleseId = null; nachrichtNeuZeichnen(n); } };
    vorleseId = n.id;
    nachrichtNeuZeichnen(n);
    SPRACHE.speak(u);
  }

  async function kopieren(text, erfolg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(erfolg, { art: "erfolg", dauer: 2500 });
    } catch {
      const t = document.createElement("textarea");
      t.value = text;
      t.setAttribute("readonly", "");
      t.className = "unsichtbar";
      document.body.append(t);
      t.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      t.remove();
      toast(ok ? erfolg : "Kopieren ging nicht – bitte Text markieren und kopieren.", { art: ok ? "erfolg" : "warn" });
    }
  }

  window.addEventListener("beforeunload", (e) => {
    if (offeneEntwuerfe().length || aufnahmen.size || ordner.geaendert || aufnahme.phase !== "bereit" || erkennt) { e.preventDefault(); e.returnValue = ""; }
  });

  // Los geht's
  eingabeAktualisieren();
  start();
})();
