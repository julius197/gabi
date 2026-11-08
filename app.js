/* Gabi v2 – Oberfläche: Gespräch mit Gabi (Diktat + Assistent) und Notizordner.
   Kein Schlüssel im Browser: alles läuft über den Gabi-Worker (Zugangscode im Kopf X-Gabi-Zugang) oder im Demo-Modus
   komplett im Browser. Gliederung: 1 Grundlagen · 2 API · 3 Start/Zugang · 4 Navigation · 5 Gespräch · 6 Karten
   7 Eingabe und Aufnahme · 8 Notizen · 9 Kleinigkeiten (Vorlesen, Kopieren, Schutz vor Datenverlust) */
(() => {
  "use strict";

  // Übergang v1 → v2: alte Seite (noch im Browser-Cache) mit neuem Skript → einmal frisch laden, dann ist alles v2
  if (!document.getElementById("ansicht-chat") || !window.GabiKern) {
    try {
      if (!sessionStorage.getItem("gabi.frisch-geladen")) {
        sessionStorage.setItem("gabi.frisch-geladen", "1");
        location.reload();
      }
    } catch { /* Speicher gesperrt – lieber nicht neu laden als endlos */ }
    return;
  }

  const K = window.GabiKern;
  const PDF = window.GabiPdf;
  const DEMO = window.GabiDemo;
  const AUFNAHME = window.GabiAufnahme;

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
    app: $("#app"), kopf: $("#kopf"), haupt: $("#haupt"), testBadge: $("#test-badge"), kopfWechsel: $("#kopf-wechsel"), kopfNeu: $("#kopf-neu"), seiteNeu: $("#seite-neu"),
    seitenPatienten: $("#seiten-patienten"), seitenFussText: $("#seiten-fuss-text"),
    laden: $("#ansicht-laden"), zugang: $("#ansicht-zugang"), offline: $("#ansicht-offline"), chat: $("#ansicht-chat"), notizen: $("#ansicht-notizen"),
    zugangForm: $("#zugang-form"), zugangCode: $("#zugang-code"), zugangZeigen: $("#zugang-zeigen"), zugangFehler: $("#zugang-fehler"), zugangWeiter: $("#zugang-weiter"),
    offlineTitel: $("#offline-titel"), offlineText: $("#offline-text"), offlineErneut: $("#offline-erneut"),
    willkommen: $("#willkommen"), gruss: $("#gruss"), nachrichten: $("#nachrichten"),
    chipsLeiste: $("#chips-leiste"), modusPill: $("#modus-pill"), modusText: $("#modus-text"), modusSymbol: $("#modus-symbol"), modusWeg: $("#modus-weg"),
    eingabe: $("#eingabe"), text: $("#eingabe-text"), mikro: $("#mikro"), senden: $("#senden"), aufnahmeZeit: $("#aufnahme-zeit"), aufnahmeText: $("#aufnahme-text"), wellen: $("#wellen"),
    dialogFrage: $("#dialog-frage"), frageTitel: $("#frage-titel"), frageText: $("#frage-text"), frageJa: $("#frage-ja"), frageNein: $("#frage-nein"),
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
  const GROB = window.matchMedia("(pointer: coarse)").matches;
  const WENIG_BEWEGUNG = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ---------- Toasts ----------
  function toast(text, { art = "", dauer = 4000, aktion } = {}) {
    const t = document.createElement("div");
    t.className = `toast ${art}`;
    t.setAttribute("role", art === "fehler" ? "alert" : "status");
    const ic = art === "erfolg" ? "haken" : art === "fehler" || art === "warn" ? "warn" : "info";
    t.innerHTML = `<span class="toast-symbol">${symbol(ic)}</span><span class="toast-text">${esc(text)}</span>`;
    let uhr = null;
    const weg = () => { clearTimeout(uhr); if (t.classList.contains("weg")) return; t.classList.add("weg"); setTimeout(() => t.remove(), 160); };
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
    while (el.toasts.children.length > 3) el.toasts.firstElementChild.remove();
    uhr = setTimeout(weg, aktion ? Math.max(dauer, 6500) : dauer);
    t.addEventListener("pointerenter", () => clearTimeout(uhr));
    t.addEventListener("pointerleave", () => { clearTimeout(uhr); uhr = setTimeout(weg, 2500); });
  }

  // ---------- Rückfrage (immer nur eine offen) ----------
  let frageOffen = false;
  function frage(titel, text, { ja = "OK", nein = "Abbrechen", gefahr = false } = {}) {
    if (frageOffen) return Promise.resolve(false);
    frageOffen = true;
    el.frageTitel.textContent = titel;
    el.frageText.textContent = text;
    el.frageJa.textContent = ja;
    el.frageNein.textContent = nein;
    el.frageJa.className = `knopf ${gefahr ? "gefahr" : "primaer"}`;
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
  function ansichtZeigen(name) {
    for (const [n, knoten] of [["laden", el.laden], ["zugang", el.zugang], ["offline", el.offline], ["chat", el.chat], ["notizen", el.notizen]]) knoten.hidden = n !== name;
    const mitKopf = name === "chat" || name === "notizen";
    el.kopf.hidden = !mitKopf;
    el.app.classList.toggle("ohne-seite", !mitKopf);
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
    param: "Demo-Modus mit Beispieldaten – nichts geht an einen Server.",
    "nicht-erreichbar": "Server nicht erreichbar – Gabi läuft im Demo-Modus mit Beispieldaten.",
    "nicht-eingerichtet": "Server noch nicht eingerichtet – Gabi läuft im Demo-Modus mit Beispieldaten.",
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

  function offlineZeigen() {
    ansichtZeigen("offline");
    el.offlineTitel.textContent = navigator.onLine === false ? "Kein Internet" : "Server nicht erreichbar";
    el.offlineText.textContent = navigator.onLine === false
      ? "Dein Gerät ist offline. Sobald das Internet wieder da ist, geht es hier weiter."
      : "Gabi erreicht den Server gerade nicht. Versuch es gleich noch einmal – gespeicherte Notizen bleiben erhalten.";
  }
  el.offlineErneut.addEventListener("click", () => start());
  window.addEventListener("online", () => { if (!el.offline.hidden) start(); });

  let gestartet = false;
  function starten() {
    gestartet = true;
    gespraechLaden();
    patientenLaden().catch(() => {});
    gruessen();
    route();
    AUFNAHME.rechtBeobachten((s) => { mikroGesperrt = s === "denied"; });
  }

  async function start() {
    ansichtZeigen("laden");
    if (DEMO_PARAM) return demoStarten("param");
    const grund = await backendPruefen();
    // Auf der echten Adresse nie still in die Demo (die Offline-Seite bietet „Demo ansehen“ an); lokal und in Tests schon
    if (grund === "nicht-erreichbar" && (zugang || PRODUKTION)) return offlineZeigen();
    if (grund) return demoStarten(grund);
    if (zugang) return starten();
    zugangZeigen();
  }

  // Info-Dialog (Badge „Testversion“ / „Demo“)
  el.testBadge.addEventListener("click", () => {
    el.infoTitel.textContent = modus.demo ? "Demo-Modus" : "Testversion";
    el.infoZuruecksetzen.hidden = !modus.demo;
    el.infoVerbinden.hidden = !modus.demo;
    el.infoAbmelden.hidden = modus.demo || !zugang;
    el.dialogInfo.showModal();
  });
  el.infoZuruecksetzen.addEventListener("click", async () => {
    el.dialogInfo.close();
    if (!(await frage("Beispieldaten zurücksetzen?", "Alle Änderungen im Demo-Modus gehen verloren, auch das Gespräch.", { ja: "Zurücksetzen", gefahr: true }))) return;
    demoApi.zuruecksetzen();
    gespraechLeeren();
    await patientenLaden();
    location.hash = "#/";
    route();
    toast("Beispieldaten sind zurückgesetzt.", { art: "erfolg" });
  });
  el.infoVerbinden.addEventListener("click", () => {
    history.replaceState(null, "", `${location.pathname}#/`); // ohne ?demo=1
    location.reload();
  });
  el.infoAbmelden.addEventListener("click", async () => {
    el.dialogInfo.close();
    const verlust = verlustText();
    if (!(await frage("Abmelden?", `Der Zugangscode wird auf diesem Gerät gelöscht. Das Gespräch auch.${verlust ? ` ${verlust}` : ""}`, { ja: "Abmelden", gefahr: Boolean(verlust) }))) return;
    gespraechLeeren();
    zugangVergessen();
    zugangZeigen();
  });

  // ==========================================================
  // 4 Navigation (#/ = Gespräch, #/notizen …)
  // ==========================================================
  let letzterHash = location.hash || "#/";
  let routeLaeuft = false;

  async function route() {
    if (!gestartet || routeLaeuft) return;
    // alte v1-Adressen (#/aufnahme, #/ordner/…) auf v2 umleiten
    const roh = location.hash || "#/";
    const ziel = roh.replace(/^#\/ordner(?=\/|$)/, "#/notizen").replace(/^#\/aufnahme$/, "#/");
    if (ziel !== roh) history.replaceState(null, "", ziel);
    routeLaeuft = true;
    try {
      if (ziel !== letzterHash && ordner.geaendert && !(await frage("Änderungen verwerfen?", "Du hast die Notiz bearbeitet, aber noch nicht gesichert.", { ja: "Verwerfen", nein: "Weiter bearbeiten", gefahr: true }))) {
        history.replaceState(null, "", letzterHash);
        return;
      }
      ordner.geaendert = false;
      letzterHash = ziel;
      const notizen = ziel.startsWith("#/notizen");
      ansichtZeigen(notizen ? "notizen" : "chat");
      for (const a of document.querySelectorAll(".navi a")) a.toggleAttribute("aria-current", a.dataset.navi === (notizen ? "notizen" : "chat"));
      for (const a of document.querySelectorAll(".navi a[aria-current]")) a.setAttribute("aria-current", "page");
      el.kopfWechsel.href = notizen ? "#/" : "#/notizen";
      el.kopfWechsel.innerHTML = notizen ? `${symbol("chat")}<span class="beschriftung">Gespräch</span>` : `${symbol("notizen")}<span class="beschriftung">Notizen</span>`;
      if (notizen) await notizenZeigen(ziel);
      else gespraechZeigen();
      if (!notizen || !ziel.includes("/n/")) window.scrollTo(0, notizen ? 0 : document.documentElement.scrollHeight);
    } finally {
      routeLaeuft = false;
      if ((location.hash || "#/") !== letzterHash) route();
    }
  }
  window.addEventListener("hashchange", route);
  window.addEventListener("scroll", () => el.kopf.classList.toggle("mit-linie", window.scrollY > 4), { passive: true });

  // ==========================================================
  // 5 Gespräch
  // ==========================================================
  const chat = { nachrichten: [], laeuft: null, modus: null, patienten: null };

  function gruessen() {
    const h = new Date().getHours();
    const gruss = h < 5 ? "Hallo" : h < 11 ? "Guten Morgen" : h < 18 ? "Hallo" : "Guten Abend";
    el.gruss.innerHTML = `${gruss}, ich bin Gabi<span class="akzent">.</span>`;
  }

  // ---------- Speichern im Browser (nur diese Sitzung) ----------
  let merkenUhr = null;
  function gespraechSchreiben() {
    merkenUhr = null;
    // „bearbeitung“ (Getipptes in einer Karte) bleibt erhalten – iOS kennt kein beforeunload
    const nachrichten = chat.nachrichten.map(({ laeuft, wartet, status, ...n }) => ({ ...n, karten: (n.karten || []).map(({ speichert, sendet, ...k }) => k) }));
    speicher.schreiben("sitzung", schluessel("gespraech.v2"), JSON.stringify({ nachrichten }));
  }
  function gespraechMerken() {
    clearTimeout(merkenUhr);
    merkenUhr = setTimeout(gespraechSchreiben, 150);
  }
  // App geht in den Hintergrund (iOS verwirft solche Tabs gern): Ausstehendes sofort sichern
  document.addEventListener("visibilitychange", () => { if (document.hidden && merkenUhr) { clearTimeout(merkenUhr); gespraechSchreiben(); } });
  function gespraechLaden() {
    let d = null;
    try { d = JSON.parse(speicher.lesen("sitzung", schluessel("gespraech.v2")) || "null"); } catch { d = null; }
    chat.nachrichten = d && Array.isArray(d.nachrichten) ? d.nachrichten : [];
    for (const n of chat.nachrichten) {
      if (n.rolle !== "gabi" || n.lokal) continue;
      if (n.unterwegs) {
        // Seite wurde mitten in der Antwort neu geladen (z. B. iOS-Tab im Hintergrund) – ehrlich zeigen, Wiederholen anbieten
        delete n.unterwegs;
        Object.assign(n, { fehler: true, fehlerText: "Die Antwort wurde unterbrochen, weil die Seite neu geladen wurde.", wiederholbar: Boolean(n.body) });
      } else if (!n.text && !(n.karten || []).length && !n.fehler) n.abgebrochen = true;
    }
    for (const n of chat.nachrichten) {
      for (const k of n.karten || []) {
        if (k.typ === "entwurf" && k.bearbeitung) k.bearbeiten = true;
        if (k.typ === "beispiel") k.benutzt = true; // gehört zum Diktat-Modus, der nicht übernommen wird
      }
    }
    chat.modus = null; // Diktat-/Such-Modus nicht übernehmen – sonst wird die nächste Frage still zum Diktat
    allesZeigen();
  }
  function gespraechLeeren() {
    if (chat.laeuft) chat.laeuft.abbruch.abort();
    aufnahmen.clear(); // ohne Karte nicht mehr erreichbar – Speicher freigeben
    chat.nachrichten = [];
    chat.modus = null;
    speicher.loeschen("sitzung", schluessel("gespraech.v2"));
    allesZeigen();
  }

  const offeneEntwuerfe = () => chat.nachrichten.flatMap((n) => n.karten || []).filter((k) => k.typ === "entwurf" && !k.gespeichert && !k.verworfen);
  /** Was beim Leeren des Gesprächs verloren ginge – als Satz für die Rückfrage, sonst "". */
  function verlustText() {
    const e = offeneEntwuerfe().length;
    const a = aufnahmen.size;
    return [
      e === 1 ? "Ein Entwurf ist noch nicht gespeichert und geht verloren." : e > 1 ? `${e} Entwürfe sind noch nicht gespeichert und gehen verloren.` : "",
      a === 1 ? "Eine Aufnahme ist noch nicht gesendet und geht verloren." : a > 1 ? `${a} Aufnahmen sind noch nicht gesendet und gehen verloren.` : "",
    ].filter(Boolean).join(" ");
  }

  async function neuesGespraech() {
    if (!chat.nachrichten.length) { location.hash = "#/"; el.text.focus(); return; }
    const verlust = verlustText();
    if (verlust && !(await frage("Neues Gespräch?", verlust, { ja: "Neues Gespräch", gefahr: true }))) return;
    gespraechLeeren();
    location.hash = "#/";
    gruessen();
    route();
    el.text.focus();
  }
  el.kopfNeu.addEventListener("click", neuesGespraech);
  el.seiteNeu.addEventListener("click", neuesGespraech);

  function gespraechZeigen() {
    allesZeigen();
    eingabeAktualisieren();
  }

  // ---------- Darstellung ----------
  const nachrichtKnoten = new Map();

  function allesZeigen() {
    el.nachrichten.textContent = "";
    nachrichtKnoten.clear();
    for (const n of chat.nachrichten) {
      const knoten = nachrichtBauen(n);
      knoten.style.animation = "none"; // beim Wiederherstellen nichts einfliegen lassen
      el.nachrichten.append(knoten);
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

  function gabiHtml(n) {
    const teile = [];
    if (n.text) teile.push(`<div class="nachricht-text${n.laeuft ? " laeuft" : ""}">${K.formatierterText(n.text)}</div>`);
    for (const k of n.karten || []) teile.push(karteHtml(n, k));
    if (n.quellen && n.quellen.length) {
      teile.push(`<div class="quellen"><span class="augenbraue">Quellen</span>${n.quellen.slice(0, 6).map((q) => `<a class="quelle" href="#/notizen/n/${esc(q.id)}">${symbol("dokument")}${esc(q.kuerzel)} · ${esc(K.datumKurz(q.erstellt_am))}</a>`).join("")}</div>`);
    }
    if (n.fehler) {
      teile.push(`<div class="hinweis-box"><div class="hinweis-box-kopf">${symbol("warn")}<span>${esc(n.fehlerText || "Da ist etwas schiefgegangen.")}</span></div>${n.wiederholbar ? `<div><button class="knopf sekundaer klein" type="button" data-aktion="wiederholen">${symbol("zuruecksetzen")}Nochmal versuchen</button></div>` : ""}</div>`);
    }
    if (n.laeuft && n.wartet !== false) {
      teile.push(`<div class="tippen" aria-label="Gabi schreibt"><span class="punkte-tippen"><i></i><i></i><i></i></span>${n.status ? `<span class="status-zeile">${esc(n.status)}</span>` : ""}</div>`);
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
      const unten = nahUnten();
      for (const x of ausstehend) nachrichtNeuZeichnen(x);
      ausstehend.clear();
      if (unten) nachUntenRollen();
    });
  }
  const nahUnten = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
  function nachUntenRollen(sanft = false) {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: sanft && !WENIG_BEWEGUNG.matches ? "smooth" : "auto" });
  }

  function nachrichtHinzufuegen(n) {
    chat.nachrichten.push(n);
    el.nachrichten.append(nachrichtBauen(n));
    rahmenAktualisieren();
    gespraechMerken();
    requestAnimationFrame(() => nachUntenRollen(true));
    return n;
  }

  /** Antwort von Gabi ohne Server (Rückfragen bei den Schnellaktionen). */
  function lokaleAntwort(text, karten = []) {
    return nachrichtHinzufuegen({ id: neueId(), rolle: "gabi", text, karten, lokal: true });
  }

  // ---------- Senden ----------
  /**
   * Eine Nachricht an Gabi schicken.
   * text: was die Nutzerin sieht · senden: was Gabi bekommt (z. B. mit „Suche in meinen Notizen:“) ·
   * aktion: feste Abläufe (Diktat, Bericht) · art/kuerzel/beispiel: nur für die Anzeige
   */
  async function senden({ text, senden: anGabi, aktion = null, art = "", kuerzel = "", beispiel = false }) {
    if (chat.laeuft || !String(text || "").trim()) return;
    const nutzer = nachrichtHinzufuegen({ id: neueId(), rolle: "nutzer", text: text.trim(), ...(anGabi ? { senden: anGabi } : {}), art, kuerzel, beispiel });
    const gabi = nachrichtHinzufuegen({ id: neueId(), rolle: "gabi", text: "", karten: [], quellen: [], laeuft: true, wartet: true, status: "" });
    const verlauf = K.verlaufFuerServer(chat.nachrichten.filter((n) => n !== gabi));
    if (aktion && verlauf.length) verlauf[verlauf.length - 1] = { rolle: "nutzer", text: nutzer.text }; // Diktat pur, ohne Vorsatz
    await antwortHolen(gabi, { nachrichten: verlauf, ...(aktion ? { aktion } : {}) });
  }

  async function antwortHolen(gabi, body) {
    const abbruch = new AbortController();
    chat.laeuft = { abbruch, gabi };
    // falls die Seite mitten in der Antwort neu lädt: erkennbar unterbrochen, mit „Nochmal versuchen“
    gabi.unterwegs = true;
    gabi.body = body;
    gespraechMerken();
    eingabeAktualisieren();
    try {
      await chatStrom(body, (e) => ereignis(gabi, e), abbruch.signal);
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
      chat.laeuft = null;
      nachrichtNeuZeichnen(gabi);
      eingabeAktualisieren();
      gespraechMerken();
      if (nahUnten()) nachUntenRollen();
    }
  }

  function ereignis(gabi, e) {
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
        if (chat.modus && chat.modus.typ === "diktat") modusSetzen(null); // ein Diktat = ein Entwurf; danach normale Fragen
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
    location.hash = "#/";
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
      <button class="chip akzent" type="button" data-aktion="neuer-patient" ${fertig ? "disabled" : ""}>${symbol("person-plus")}Neuer Test-Patient</button></div></div>`;
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
    const pruefen = unklar.length && !k.bearbeiten ? `<section class="abschnitt pruefen"><h3 class="augenbraue">${symbol("warn", "klein")}Bitte prüfen</h3>${punkteHtml(unklar)}</section>` : "";
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

  function berichtAlsText(b) {
    const zeilen = [`${b.titel} · ${b.kuerzel}${b.pseudonym ? ` (${b.pseudonym})` : ""}`, `${b.anzahl === 1 ? "1 Notiz" : `${b.anzahl} Notizen`} · ${zeitraum(b)}`, "", "Zusammenfassung", ...(b.zusammenfassung || []).map((p) => `- ${p}`)];
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
  el.nachrichten.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-aktion]");
    if (!b || b.disabled) return;
    const knoten = b.closest(".nachricht");
    const n = knoten && chat.nachrichten.find((x) => x.id === knoten.dataset.id);
    if (!n) return;
    const kk = b.closest("[data-karte]");
    const k = kk ? (n.karten || []).find((x) => x.id === kk.dataset.karte) : null;
    const aktion = b.dataset.aktion;

    if (aktion === "wiederholen") return wiederholen(n);
    if (aktion === "kopieren") return kopieren(K.ohneFormat(n.text), "Antwort kopiert.");
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
      gespraechMerken();
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
    if (aktion === "entwurf-bearbeiten") { k.bearbeiten = true; nachrichtNeuZeichnen(n); autoHoeheAlle(nachrichtKnoten.get(n.id)); nachrichtKnoten.get(n.id).querySelector("textarea")?.focus(); gespraechMerken(); return; }
    if (aktion === "entwurf-abbrechen") { k.bearbeiten = false; delete k.bearbeitung; nachrichtNeuZeichnen(n); gespraechMerken(); return; }
    if (aktion === "entwurf-uebernehmen") {
      const s = { ...k.strukturiert };
      for (const t of kk.querySelectorAll("textarea[data-abschnitt]")) s[t.dataset.abschnitt] = t.value.split("\n").map((z) => z.trim()).filter(Boolean);
      k.strukturiert = s;
      k.bearbeiten = false;
      delete k.bearbeitung;
      nachrichtNeuZeichnen(n);
      gespraechMerken();
      return;
    }
    if (aktion === "entwurf-speichern") return entwurfSpeichern(n, k, b);
    if (aktion === "entwurf-verwerfen") {
      if (!(await frage("Entwurf verwerfen?", `Der Entwurf für ${k.kuerzel} wird nicht gespeichert.`, { ja: "Verwerfen", gefahr: true }))) return;
      k.verworfen = true;
      nachrichtNeuZeichnen(n);
      gespraechMerken();
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
      gespraechMerken();
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

  async function entwurfSpeichern(n, k, knopf) {
    if (k.speichert) return;
    k.speichert = true;
    knopf.disabled = true;
    knopf.innerHTML = '<span class="drehen"></span>Speichere …';
    try {
      const { notiz } = await api("/api/notizen", { methode: "POST", body: { patient_id: k.patient_id, rohtext: k.rohtext || "", strukturiert: k.strukturiert } });
      k.gespeichert = notiz.id;
      if (chat.modus && chat.modus.typ === "diktat" && chat.modus.patient_id === k.patient_id) modusSetzen(null);
      nachrichtNeuZeichnen(n);
      gespraechMerken();
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
    // offene Auswahl-Karten mit der Liste füllen
    for (const n of chat.nachrichten) if ((n.karten || []).some((k) => k.typ === "auswahl" && !k.gewaehlt)) nachrichtNeuZeichnen(n);
    return patienten;
  }

  function seitenPatientenZeigen() {
    const liste = chat.patienten || [];
    el.seitenPatienten.innerHTML = liste.length
      ? `<span class="augenbraue">Test-Patienten</span>${liste.map((p) => `<a href="#/notizen/p/${esc(p.id)}"><b>${esc(p.kuerzel)}</b><span>${esc(kurzName(p))}</span><span class="badge">${esc(p.anzahl ?? 0)}</span></a>`).join("")}`
      : "";
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

  function eingabeAktualisieren() {
    const laeuft = Boolean(chat.laeuft);
    const hatText = Boolean(el.text.value.trim());
    el.senden.disabled = (!laeuft && !hatText) || (!laeuft && erkennt);
    el.senden.innerHTML = symbol(laeuft ? "stopp" : "senden");
    el.senden.setAttribute("aria-label", laeuft ? "Antwort stoppen" : "Senden");
    el.senden.classList.toggle("stoppt", laeuft);
    el.mikro.disabled = laeuft || erkennt;
    for (const c of document.querySelectorAll("[data-schnell]")) c.disabled = laeuft || erkennt;
  }

  el.text.enterKeyHint = GROB ? "enter" : "send";
  el.text.addEventListener("input", () => { autoHoehe(el.text); eingabeAktualisieren(); });
  el.text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !GROB) { e.preventDefault(); el.eingabe.requestSubmit(); }
    if (e.key === "Escape" && chat.modus) modusSetzen(null);
  });
  el.eingabe.addEventListener("submit", (e) => {
    e.preventDefault();
    if (chat.laeuft) { chat.laeuft.abbruch.abort(); return; }
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
        location.hash = "#/";
        lokaleAntwort(hilfe.schritte && hilfe.schritte.length ? "Ich komme gerade nicht ans Mikrofon." : text, [{ typ: "hilfe", id: neueId(), titel: hilfe.titel || AUFNAHME.BLOCKIERT.titel, text: hilfe.text || "", schritte: hilfe.schritte || [] }]);
      } else toast(text, { art: "fehler", dauer: 6000 });
    },
    beiHinweis(text) { toast(text); },
    beiVerworfen({ holen }) {
      const m = chat.modus ? { ...chat.modus } : null;
      toast("Aufnahme verworfen.", { dauer: 9000, aktion: { text: "Rückgängig", tun: () => {
        if (!erkennt && !chat.laeuft && aufnahme.phase === "bereit") return erkennen(holen, m);
        // Gabi ist beschäftigt: nicht parallel schicken, sondern als Karte parken – „Jetzt senden“, sobald sie fertig ist
        const k = { typ: "aufnahme", id: neueId(), zurueck: true, erneut: true, fehlerText: "Zurückgeholte Aufnahme – noch nicht gesendet." };
        aufnahmen.set(k.id, { holen, modusBeiAufnahme: m });
        location.hash = "#/";
        lokaleAntwort("Deine Aufnahme ist zurück. Tipp auf „Jetzt senden“, sobald ich fertig bin.", [k]);
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

  async function erkennen(holen, modusBeiAufnahme, wiederholung = null) {
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
      if (!text) {
        if (wiederholung) {
          // dieselbe leere Aufnahme nicht nochmal schicken – nur „Verwerfen“ bleibt
          Object.assign(wiederholung.k, { sendet: false, erneut: false, leer: true, fehlerText: "In der Aufnahme habe ich nichts verstanden." });
          aufnahmen.delete(wiederholung.k.id);
          nachrichtNeuZeichnen(wiederholung.n);
          gespraechMerken();
        } else toast("Ich habe nichts verstanden. Bitte nochmal deutlich sprechen.", { art: "warn" });
        return;
      }
      erkennt = false;
      el.eingabe.classList.remove("erkennt");
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
      // bleibende Karte statt Toast: die Aufnahme bleibt erhalten, bis sie nachgeschickt oder verworfen ist
      if (wiederholung) {
        Object.assign(wiederholung.k, { sendet: false, fehlerText: f.message, erneut: !f.keineWiederholung });
        nachrichtNeuZeichnen(wiederholung.n);
      } else {
        const k = { typ: "aufnahme", id: neueId(), fehlerText: f.message, erneut: !f.keineWiederholung };
        aufnahmen.set(k.id, { holen, modusBeiAufnahme });
        location.hash = "#/";
        const fuer = modusBeiAufnahme && modusBeiAufnahme.typ === "diktat" ? ` für **${modusBeiAufnahme.kuerzel}**` : "";
        lokaleAntwort(`Dein ${fuer ? "Diktat" : "gesprochener Text"}${fuer} ist nicht angekommen.`, [k]);
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
    if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); aufnahmeBeginnen(); }
    if (e.key === "Escape") aufnahme.abbrechen();
  });
  el.mikro.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); aufnahme.stopp(); } });
  // App im Hintergrund (Anruf, Sperrbildschirm): Aufnahme sauber beenden und schicken
  document.addEventListener("visibilitychange", () => { if (document.hidden && aufnahme.phase === "aufnahme") aufnahme.stopp(); });
  window.addEventListener("blur", () => { if (aufnahme.phase === "aufnahme" && zeiger === null) aufnahme.stopp(); });

  // ==========================================================
  // 8 Notizen
  // ==========================================================
  const ordner = { geaendert: false, bearbeiten: null, suche: "", suchNummer: 0, beschaeftigt: false };
  const SORTIERUNG = "gabi.sortierung";
  const sortierung = () => (speicher.lesen("lokal", SORTIERUNG) === "alt" ? "alt" : "neu");
  const sortiert = (liste) => [...liste].sort((a, b) => (sortierung() === "alt" ? 1 : -1) * (a.erstellt_am < b.erstellt_am ? -1 : a.erstellt_am > b.erstellt_am ? 1 : 0));

  function skelettHtml(anzahl = 3) {
    return `<div class="raster">${Array.from({ length: anzahl }, () => '<div class="skelett" data-skelett-karte></div>').join("")}</div>`;
  }

  function leerHtml({ sym, titel, text, knopf }) {
    return `<div class="leer"><div class="glanz"></div><div class="kachel">${symbol(sym)}</div><h2>${esc(titel)}</h2>${text ? `<p>${esc(text)}</p>` : ""}${knopf || ""}</div>`;
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

  // ---------- Übersicht: Suche + Patienten-Karten ----------
  async function uebersichtZeigen() {
    const vorhanden = el.notizen.querySelector("#suche");
    if (!vorhanden) {
      el.notizen.innerHTML = `
        <div class="notizen-kopf"><div class="titel-block"><span class="augenbraue">Notizordner</span><h1>Notizen</h1></div>
          <button class="knopf sekundaer klein" type="button" data-ordner="patient-neu">${symbol("person-plus")}Test-Patient</button></div>
        <div class="werkzeugleiste">
          <label class="suche">${symbol("suche")}<span class="unsichtbar">Notizen durchsuchen</span>
            <input id="suche" type="search" placeholder="Notizen durchsuchen …" autocomplete="off" enterkeyhint="search" value="${esc(ordner.suche)}">
            <button class="rund-knopf" type="button" data-ordner="suche-loeschen" aria-label="Suche löschen" ${ordner.suche ? "" : "hidden"}>${symbol("x", "klein")}</button></label>
        </div>
        <div id="ordner-inhalt">${skelettHtml()}</div>`;
    }
    if (ordner.suche.trim()) return sucheAusfuehren();
    const inhalt = el.notizen.querySelector("#ordner-inhalt");
    try {
      const patienten = await patientenLaden();
      if (!patienten.length) {
        inhalt.innerHTML = leerHtml({ sym: "person-plus", titel: "Noch keine Test-Patienten", text: "Leg einen Test-Patienten mit Kürzel an (z. B. TP-01) – bitte nur erfundene Testdaten.", knopf: `<button class="knopf primaer" type="button" data-ordner="patient-neu">${symbol("plus")}Test-Patient anlegen</button>` });
        return;
      }
      const gesamt = patienten.reduce((s, p) => s + (p.anzahl || 0), 0);
      inhalt.innerHTML = `<p class="suche-hinweis">${patienten.length === 1 ? "1 Test-Patient" : `${patienten.length} Test-Patienten`} · ${gesamt === 1 ? "1 Notiz" : `${gesamt} Notizen`}</p>
        <div class="raster">${patienten.map((p, i) => `<a class="patient-karte" href="#/notizen/p/${esc(p.id)}" data-i="${i}">
          <span class="patient-kachel">${esc(p.kuerzel.replace(/^[A-Z]+-?/, "") || p.kuerzel.slice(0, 2))}</span>
          <span class="patient-text"><strong>${esc(p.kuerzel)}</strong><span>${esc(kurzName(p) || "Test-Patient")}</span><small>${p.anzahl === 1 ? "1 Notiz" : `${esc(p.anzahl || 0)} Notizen`}</small></span>${symbol("rechts")}</a>`).join("")}
          <button class="patient-karte neu-karte" type="button" data-ordner="patient-neu">${symbol("plus")}Neuer Test-Patient</button></div>`;
    } catch (f) {
      if (f instanceof Abbruch) return;
      inhalt.innerHTML = leerHtml({ sym: "offline", titel: "Notizen konnten nicht geladen werden", text: f.message, knopf: `<button class="knopf sekundaer" type="button" data-ordner="neu-laden">${symbol("zuruecksetzen")}Nochmal versuchen</button>` });
    }
  }

  let sucheUhr = null;
  async function sucheAusfuehren() {
    const inhalt = el.notizen.querySelector("#ordner-inhalt");
    const q = ordner.suche.trim();
    const loeschen = el.notizen.querySelector('[data-ordner="suche-loeschen"]');
    if (loeschen) loeschen.hidden = !ordner.suche;
    if (!q) { uebersichtZeigen(); return; }
    if (q.replace(/[^\p{L}\p{N}]/gu, "").length < 2) { inhalt.innerHTML = '<p class="suche-hinweis">Bitte mindestens 2 Buchstaben eingeben.</p>'; return; }
    const nummer = ++ordner.suchNummer;
    if (!inhalt.querySelector(".notiz-liste")) inhalt.innerHTML = skelettHtml(2);
    try {
      const { notizen } = await api(`/api/notizen?q=${encodeURIComponent(q)}`);
      if (nummer !== ordner.suchNummer) return; // eine neuere Suche läuft schon
      inhalt.innerHTML = notizen.length
        ? `<div class="ergebnis-kopf"><p class="suche-hinweis">${notizen.length === 1 ? "1 Notiz gefunden" : `${notizen.length} Notizen gefunden`} zu „${esc(q)}“</p>${notizen.length > 1 ? sortierungHtml() : ""}</div><div class="notiz-liste">${sortiert(notizen).map((n) => notizKarteHtml(n, true)).join("")}</div>`
        : leerHtml({ sym: "suche", titel: "Nichts gefunden", text: `Keine Notiz enthält „${q}“.`, knopf: `<button class="knopf sekundaer" type="button" data-ordner="suche-loeschen">Suche löschen</button>` });
    } catch (f) {
      if (f instanceof Abbruch || nummer !== ordner.suchNummer) return;
      inhalt.innerHTML = leerHtml({ sym: "warn", titel: "Suche fehlgeschlagen", text: f.message });
    }
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
      notizenZeigen(location.hash);
    }
  });

  // ---------- Patient ----------
  async function patientZeigen(id) {
    el.notizen.innerHTML = `<a class="zurueck" href="#/notizen">${symbol("links")}Alle Test-Patienten</a><div id="ordner-inhalt">${skelettHtml(2)}</div>`;
    const inhalt = el.notizen.querySelector("#ordner-inhalt");
    try {
      const patienten = chat.patienten || (await patientenLaden());
      const p = patienten.find((x) => x.id === id) || (await patientenLaden()).find((x) => x.id === id);
      if (!p) { inhalt.innerHTML = leerHtml({ sym: "warn", titel: "Test-Patient nicht gefunden", knopf: `<a class="knopf sekundaer" href="#/notizen">Zur Übersicht</a>` }); return; }
      const { notizen } = await api(`/api/notizen?patient_id=${encodeURIComponent(id)}`);
      if (location.hash !== `#/notizen/p/${id}`) return;
      inhalt.innerHTML = `<div class="leser-kopf">
          <div class="leser-titel"><span class="patient-kachel">${esc(p.kuerzel.replace(/^[A-Z]+-?/, "") || p.kuerzel.slice(0, 2))}</span>
            <div class="titel-block"><h1>${esc(p.kuerzel)}</h1><span class="stumm">${esc(p.pseudonym || "Test-Patient")} · ${notizen.length === 1 ? "1 Notiz" : `${notizen.length} Notizen`}</span></div></div>
          <div class="leser-aktionen">
            <button class="knopf primaer klein" type="button" data-ordner="diktieren" data-id="${esc(p.id)}">${symbol("mikro")}Behandlung diktieren</button>
            <button class="knopf sekundaer klein" type="button" data-ordner="bericht" data-id="${esc(p.id)}" ${notizen.length ? "" : "disabled"}>${symbol("bericht")}Bericht</button>
            ${notizen.length > 1 ? `<span class="rechts">${sortierungHtml()}</span>` : ""}
          </div></div>
        ${notizen.length
          ? `<div class="notiz-liste">${sortiert(notizen).map((n) => notizKarteHtml(n, false)).join("")}</div>`
          : leerHtml({ sym: "mikro", titel: `Noch keine Notizen für ${p.kuerzel}`, text: "Diktier die erste Behandlung – Gabi sortiert sie für dich.", knopf: `<button class="knopf primaer" type="button" data-ordner="diktieren" data-id="${esc(p.id)}">${symbol("mikro")}Jetzt diktieren</button>` })}`;
    } catch (f) {
      if (f instanceof Abbruch) return;
      inhalt.innerHTML = leerHtml({ sym: "offline", titel: "Notizen konnten nicht geladen werden", text: f.message, knopf: `<button class="knopf sekundaer" type="button" data-ordner="neu-laden">${symbol("zuruecksetzen")}Nochmal versuchen</button>` });
    }
  }

  // ---------- Notiz lesen und bearbeiten ----------
  let offeneNotiz = null;
  async function notizZeigen(id) {
    el.notizen.innerHTML = `<a class="zurueck" href="#/notizen">${symbol("links")}Zurück</a><div id="ordner-inhalt"><div class="skelett" data-skelett-leser></div></div>`;
    try {
      const { notiz } = await api(`/api/notizen/${encodeURIComponent(id)}`);
      if (location.hash !== `#/notizen/n/${id}`) return;
      offeneNotiz = notiz;
      ordner.bearbeiten = null;
      leserZeichnen();
    } catch (f) {
      if (f instanceof Abbruch) return;
      el.notizen.querySelector("#ordner-inhalt").innerHTML = leerHtml({ sym: "warn", titel: f.status === 404 ? "Notiz nicht gefunden" : "Notiz konnte nicht geladen werden", text: f.status === 404 ? "Vielleicht wurde sie gelöscht." : f.message, knopf: `<a class="knopf sekundaer" href="#/notizen">Zur Übersicht</a>` });
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
    const pruefen = unklar.length && !bearbeiten ? `<section class="abschnitt pruefen"><h3 class="augenbraue">${symbol("warn", "klein")}Bitte prüfen</h3>${punkteHtml(unklar)}</section>` : "";
    const aktionen = bearbeiten
      ? `<button class="knopf primaer klein" type="button" data-leser="sichern">${symbol("haken")}Sichern</button><button class="knopf leise klein" type="button" data-leser="abbrechen">Abbrechen</button>`
      : `<button class="knopf sekundaer klein" type="button" data-leser="bearbeiten">${symbol("stift")}Bearbeiten</button>
         <button class="knopf sekundaer klein" type="button" data-leser="pdf">${symbol("pdf")}PDF</button>
         <button class="knopf gefahr klein rechts" type="button" data-leser="loeschen">${symbol("muell")}Löschen</button>`;
    el.notizen.innerHTML = `<a class="zurueck" href="#/notizen/p/${esc(n.patient_id)}">${symbol("links")}${esc(n.kuerzel)}</a>
      <article class="leser">
        <div class="leser-kopf"><div class="titel-block"><span class="augenbraue">Behandlungsnotiz · ${esc(n.kuerzel)}</span><h1>${esc(K.datumLang(n.erstellt_am))}</h1>
          <span class="stumm leser-zeit">${esc(n.pseudonym || "Test-Patient")}${n.geaendert_am ? ` · bearbeitet ${esc(K.wann(n.geaendert_am))}` : ""}</span></div></div>
        <div class="karte mit-streifen"><div class="abschnitte">${abschnitte}${pruefen}</div></div>
        ${n.rohtext ? `<details class="original"><summary>${symbol("rechts")}Original-Diktat</summary><p>${esc(n.rohtext)}</p></details>` : ""}
        <div class="leser-aktionen">${aktionen}</div>
      </article>`;
    if (bearbeiten) autoHoeheAlle(el.notizen);
  }

  el.notizen.addEventListener("click", async (e) => {
    const o = e.target.closest("[data-ordner]");
    if (o && !o.disabled) {
      const was = o.dataset.ordner;
      if (was === "patient-neu") { const p = await patientAnlegenDialog(); if (p) location.hash = `#/notizen/p/${p.id}`; return; }
      if (was === "suche-loeschen") { ordner.suche = ""; const s = el.notizen.querySelector("#suche"); if (s) { s.value = ""; s.focus(); } uebersichtZeigen(); return; }
      if (was === "neu-laden") { notizenZeigen(location.hash); return; }
      const p = (chat.patienten || []).find((x) => x.id === o.dataset.id);
      if (!p) return;
      if (was === "diktieren") { location.hash = "#/"; await route(); diktatStarten(p); return; }
      if (was === "bericht") {
        location.hash = "#/";
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
        offeneNotiz = notiz;
        ordner.bearbeiten = null;
        ordner.geaendert = false;
        leserZeichnen();
        toast("Änderungen gesichert.", { art: "erfolg" });
      } catch (f) {
        if (!(f instanceof Abbruch)) toast(`Nicht gesichert: ${f.message}`, { art: "fehler", dauer: 6000 });
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
