/* Gabi – Sprachnotizen zur Behandlung (Testversion für PhysioWorks)
   Gliederung: 1 Grundlagen · 2 API · 3 Zugang · 4 Patienten · 5 Aufnahme (Push-to-Talk) · 6 Audio → WAV
               7 Entwurf · 8 Notizordner · 9 PDF · 10 Navigation und Start */
(() => {
  "use strict";

  // ==========================================================
  // 1 Grundlagen
  // ==========================================================
  const lokal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const API = (window.GABI_CONFIG && window.GABI_CONFIG.apiUrl ? window.GABI_CONFIG.apiUrl : "").replace(/\/+$/, "");
  // Demo-Modus: ?demo=1 oder kein Backend erreichbar/eingerichtet → alles lokal mit Beispieldaten (demo.js)
  const DEMO_PARAM = new URLSearchParams(location.search).get("demo") === "1";
  const modus = { demo: false, grund: "" };
  let demoApi = null;
  const ABSCHNITTE = [
    ["befund", "Befund", "Untersuchung, Tests, Schmerz, Beobachtung"],
    ["massnahmen", "Maßnahmen", "Was in der Behandlung gemacht wurde"],
    ["verlauf", "Verlauf", "Veränderung, Reaktion, weiteres Vorgehen"],
    ["hausaufgaben", "Hausaufgaben", "Übungen für zu Hause"],
  ];
  const MIN_DAUER_MS = 800;
  const MAX_DAUER_S = 300;
  const SPEICHER = { zugang: "gabi.zugang", patient: "gabi.patient", entwurf: "gabi.entwurf" };
  /** Speicher-Schlüssel – im Demo-Modus getrennt, damit Beispieldaten nie in echte Entwürfe geraten. */
  const schluessel = (name) => (modus.demo ? `${SPEICHER[name]}.demo` : SPEICHER[name]);

  const $ = (sel, wurzel = document) => wurzel.querySelector(sel);
  const el = {
    ansichten: $("#ansichten"),
    zugang: $("#ansicht-zugang"), aufnahme: $("#ansicht-aufnahme"), ordner: $("#ansicht-ordner"),
    zugangForm: $("#zugang-form"), zugangCode: $("#zugang-code"), zugangFehler: $("#zugang-fehler"), zugangKnopf: $("#zugang-knopf"),
    patientWahl: $("#patient-wahl"), patientNeu: $("#patient-neu"),
    dialogPatient: $("#dialog-patient"), patientForm: $("#patient-form"), patientKuerzel: $("#patient-kuerzel"),
    patientPseudonym: $("#patient-pseudonym"), patientFehler: $("#patient-fehler"), patientAnlegen: $("#patient-anlegen"),
    station: $("#station"), anweisung: $("#anweisung"), buehne: $("#buehne"), ptt: $("#ptt"), zeit: $("#zeit"),
    statusText: $("#status-text"), stationAktion: $("#station-aktion"),
    mikroHilfe: $("#mikro-hilfe"), mikroHilfeTitel: $("#mikro-hilfe-titel"), mikroHilfeText: $("#mikro-hilfe-text"),
    mikroHilfeSchritte: $("#mikro-hilfe-schritte"), mikroErneut: $("#mikro-erneut"),
    entwurf: $("#entwurf"), entwurfStatus: $("#entwurf-status"), neuHinweis: $("#neu-hinweis"),
    entwurfAbschnitte: $("#entwurf-abschnitte"), entwurfUnklar: $("#entwurf-unklar"), entwurfRoh: $("#entwurf-roh"),
    entwurfTranskript: $("#entwurf-transkript"), speichern: $("#speichern"), verwerfen: $("#verwerfen"),
    ordnerBox: $("#ordner"), suche: $("#suche"), sortierung: $("#sortierung"), sortierungFeld: $("#sortierung-feld"), ordnerKopf: $("#ordner-kopf"), ordnerListe: $("#ordner-liste"), leser: $("#leser"),
    toasts: $("#toasts"),
    demoBanner: $("#demobanner"), demoText: $("#demo-text"), demoZuruecksetzen: $("#demo-zuruecksetzen"),
    demoVerbinden: $("#demo-verbinden"), demoBeenden: $("#demo-beenden"), demoDiktat: $("#demo-diktat"),
    testbanner: $(".testbanner"), offline: $("#ansicht-offline"), offlineErneut: $("#offline-erneut"), offlineDemo: $("#offline-demo"),
    dialogFrage: $("#dialog-frage"), frageTitel: $("#frage-titel"), frageText: $("#frage-text"), frageJa: $("#frage-ja"), frageNein: $("#frage-nein"),
  };

  const speicherLesen = (store, key) => { try { return store.getItem(key); } catch { return null; } };
  const speicherSchreiben = (store, key, wert) => { try { wert == null ? store.removeItem(key) : store.setItem(key, wert); } catch { /* privat */ } };

  function esc(text) {
    return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  /** Text sicher einsetzen und „(unklar)“ hervorheben. */
  function mitUnklar(text) {
    return esc(text).replace(/\((unklar)\)/gi, '<mark class="unklar">($1)</mark>');
  }
  const ZEIT = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const DATUM = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const zeitText = (iso) => (iso ? ZEIT.format(new Date(iso)) : "");
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  function toast(text, art = "", dauer = 3500, aktion) {
    const t = document.createElement("div");
    t.className = `toast ${art}`;
    t.setAttribute("role", art === "fehler" ? "alert" : "status");
    const span = document.createElement("span");
    span.textContent = text;
    t.append(span);
    if (aktion) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = aktion.text;
      b.addEventListener("click", () => { aktion.los(); weg(); });
      t.append(b);
    }
    el.toasts.append(t);
    requestAnimationFrame(() => t.classList.add("sichtbar"));
    let weg = () => { t.classList.remove("sichtbar"); setTimeout(() => t.remove(), 250); weg = () => {}; };
    setTimeout(() => weg(), dauer);
  }

  let frageOffen = null; // höchstens eine Nachfrage gleichzeitig – eine neue beantwortet die alte mit „Nein“
  function frage(titel, text, ja = "OK") {
    if (frageOffen) frageOffen(false);
    return new Promise((fertig) => {
      el.frageTitel.textContent = titel;
      el.frageText.textContent = text;
      el.frageJa.textContent = ja;
      const schliessen = (antwort) => {
        if (frageOffen !== schliessen) return;
        frageOffen = null;
        el.frageJa.onclick = el.frageNein.onclick = el.dialogFrage.oncancel = null;
        if (el.dialogFrage.open) el.dialogFrage.close();
        fertig(antwort);
      };
      frageOffen = schliessen;
      el.frageJa.onclick = () => schliessen(true);
      el.frageNein.onclick = () => schliessen(false);
      el.dialogFrage.oncancel = (e) => { e.preventDefault(); schliessen(false); };
      try { if (!el.dialogFrage.open) el.dialogFrage.showModal(); } catch { schliessen(false); }
    });
  }

  // ==========================================================
  // 2 API (Cloudflare Worker – nie Schlüssel im Browser)
  // ==========================================================
  let zugang = speicherLesen(localStorage, SPEICHER.zugang) || "";
  class Abbruch extends Error {}

  const STATUS_TEXT = (s) =>
    s === 429 ? "Zu viele Anfragen – bitte kurz warten und nochmal versuchen."
      : s === 413 ? "Die Daten sind zu groß."
        : s === 404 ? "Nicht gefunden."
          : s >= 500 ? `Server-Fehler (${s}). Bitte nochmal versuchen.`
            : `Fehler ${s}.`;

  async function api(pfad, { methode = "GET", body, text, code = zugang, zeit = 20000 } = {}) {
    if (modus.demo) {
      try { return await demoApi.anfrage(pfad, { methode, body, text }); }
      catch (e) { throw new Error((e && e.message) || "Fehler im Demo-Modus."); }
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
      zugangZeigen("Zugangscode ist nicht mehr gültig. Bitte neu eingeben.");
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

  function fehlerZeigen(e, vorsatz = "") {
    if (e instanceof Abbruch) return;
    toast(`${vorsatz}${e && e.message ? e.message : "Unbekannter Fehler"}`, "fehler", 6000);
  }

  // ==========================================================
  // 3 Zugang
  // ==========================================================
  function zugangVergessen() {
    zugang = "";
    speicherSchreiben(localStorage, SPEICHER.zugang, null);
  }

  function zugangZeigen(meldung = "") {
    el.ansichten.hidden = true;
    el.aufnahme.hidden = el.ordner.hidden = true;
    el.zugang.hidden = false;
    el.zugangFehler.textContent = meldung;
    setTimeout(() => el.zugangCode.focus(), 50);
  }

  el.zugangForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (el.zugangKnopf.classList.contains("laedt")) return; // kein doppeltes Absenden
    const code = el.zugangCode.value.trim();
    if (!code) { el.zugangFehler.textContent = "Bitte Zugangscode eingeben."; return; }
    el.zugangKnopf.classList.add("laedt");
    try {
      await api("/api/pruefen", { code });
      zugang = code;
      speicherSchreiben(localStorage, SPEICHER.zugang, code);
      el.zugangCode.value = "";
      el.zugangFehler.textContent = "";
      starten();
    } catch (err) {
      el.zugangFehler.textContent = err.message === "Zugangscode falsch." ? "Zugangscode falsch." : err.message;
    } finally {
      el.zugangKnopf.classList.remove("laedt");
    }
  });

  // ==========================================================
  // 4 Test-Patienten
  // ==========================================================
  let patienten = [];

  async function patientenLaden() {
    const d = await api("/api/patienten");
    patienten = d.patienten || [];
    patientenAuswahl();
    return patienten;
  }

  function patientName(p) {
    return p.pseudonym ? `${p.kuerzel} · ${p.pseudonym}` : p.kuerzel;
  }

  function patientenAuswahl() {
    const gewaehlt = entwurf.patientId || speicherLesen(localStorage, schluessel("patient")) || "";
    el.patientWahl.innerHTML = "";
    const leer = new Option(patienten.length ? "Bitte wählen …" : "Noch kein Test-Patient – „Neu“", "");
    el.patientWahl.append(leer);
    for (const p of patienten) el.patientWahl.append(new Option(patientName(p), p.id));
    el.patientWahl.value = patienten.some((p) => p.id === gewaehlt) ? gewaehlt : (patienten.length === 1 ? patienten[0].id : "");
    entwurf.patientId = el.patientWahl.value;
    knoepfeAktualisieren();
  }

  el.patientWahl.addEventListener("change", () => {
    entwurf.patientId = el.patientWahl.value;
    speicherSchreiben(localStorage, schluessel("patient"), entwurf.patientId || null);
    entwurfMerken();
    knoepfeAktualisieren();
  });

  el.patientNeu.addEventListener("click", () => {
    el.patientKuerzel.value = "";
    el.patientPseudonym.value = "";
    el.patientFehler.textContent = "";
    el.dialogPatient.showModal();
    setTimeout(() => el.patientKuerzel.focus(), 50);
  });
  el.dialogPatient.querySelector("[data-schliessen]").addEventListener("click", () => el.dialogPatient.close());
  el.patientKuerzel.addEventListener("input", () => {
    const pos = el.patientKuerzel.selectionStart;
    el.patientKuerzel.value = el.patientKuerzel.value.toUpperCase().replace(/\s/g, "-").replace(/[^A-Z0-9-]/g, "");
    try { el.patientKuerzel.setSelectionRange(pos, pos); } catch { /* egal */ }
  });

  el.patientForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (el.patientAnlegen.classList.contains("laedt")) return; // kein doppeltes Absenden
    const kuerzel = el.patientKuerzel.value.trim();
    if (!/^[A-Z0-9-]{2,12}$/.test(kuerzel) || !/[0-9]/.test(kuerzel)) {
      el.patientFehler.textContent = "Kürzel: 2–12 Zeichen (A–Z, 0–9, Bindestrich), mit mindestens einer Ziffer – bitte keine Namen.";
      return;
    }
    el.patientAnlegen.classList.add("laedt");
    try {
      const d = await api("/api/patienten", { methode: "POST", body: { kuerzel, pseudonym: el.patientPseudonym.value } });
      await patientenLaden();
      el.patientWahl.value = d.patient.id;
      el.patientWahl.dispatchEvent(new Event("change"));
      el.dialogPatient.close();
      toast(`Test-Patient ${d.patient.kuerzel} angelegt.`, "erfolg");
    } catch (err) {
      if (!(err instanceof Abbruch)) el.patientFehler.textContent = err.message;
    } finally {
      el.patientAnlegen.classList.remove("laedt");
    }
  });

  // ==========================================================
  // 5 Aufnahme: gedrückt halten = aufnehmen, loslassen = erkennen
  //   Sichtbare Zustände: bereit · nimmt auf · verarbeitet · fertig · Fehler
  // ==========================================================
  const aufnahme = { phase: "bereit", losgelassen: false, zeiger: null, start: 0, rec: null, stream: null, ctx: null, analyser: null, teile: [], mime: "", maxPegel: 0, sperre: null };
  let offeneTranskripte = 0;
  let demoHinweisGezeigt = false;
  let kette = Promise.resolve();
  const WARNUNG_AB_S = MAX_DAUER_S - 30;
  const LABEL = { bereit: "Bereit", startet: "Mikrofon startet", aufnahme: "Nimmt auf", verarbeitet: "Verarbeitet", fertig: "Fertig", fehler: "Fehler" };
  const meldung = { art: "", text: "", aktion: null, uhr: 0 }; // Fehler oder „gespeichert“ an der Station
  // Nicht erkannte Aufnahmen bleiben hier, bis sie gesendet oder mit dem Entwurf verworfen sind – nie still verloren
  const unversendet = [];
  let sendeFehler = "";
  let stationAktion = null;

  // ---------- Gerät / Browser ----------
  const UA = navigator.userAgent;
  const IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const ANDROID = /Android/.test(UA);
  const MAC_SAFARI = !IOS && /Safari/.test(UA) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(UA);
  const IN_APP = /FBAN|FBAV|Instagram|LinkedInApp|Line\/|; wv\)/.test(UA);
  // Safari (auch alle Browser auf dem iPhone) nimmt zuverlässig MP4/AAC auf, die anderen WebM/Opus
  const FORMATE = IOS || MAC_SAFARI
    ? ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  const FORMAT_GESPERRT = "gabi.format.gesperrt";

  function formatWaehlen() {
    const gesperrt = (speicherLesen(sessionStorage, FORMAT_GESPERRT) || "").split(",");
    const geht = (m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } };
    return FORMATE.find((m) => geht(m) && !gesperrt.includes(m)) || "";
  }
  function formatSperren(mime) {
    if (!mime) return;
    const alt = (speicherLesen(sessionStorage, FORMAT_GESPERRT) || "").split(",").filter(Boolean);
    speicherSchreiben(sessionStorage, FORMAT_GESPERRT, [...new Set([...alt, mime])].join(","));
  }

  // ---------- Anzeige ----------
  function entwurfAktuell() {
    return Boolean(entwurf.strukturiert) && entwurf.strukturVersion === entwurf.version;
  }

  function stationAktualisieren() {
    let zustand;
    let text;
    if (aufnahme.phase === "startet") { zustand = "startet"; text = "Mikrofon startet …"; }
    else if (aufnahme.phase === "aufnahme") {
      zustand = "aufnahme";
      const s = Math.floor((performance.now() - aufnahme.start) / 1000);
      text = s >= WARNUNG_AB_S ? `Noch ${Math.max(0, MAX_DAUER_S - s)} s – dann wird automatisch erkannt` : "Aufnahme läuft – loslassen zum Erkennen";
    }
    else if (aufnahme.phase === "stoppt") { zustand = "verarbeitet"; text = "Aufnahme wird abgeschlossen …"; }
    else if (offeneTranskripte > 0) { zustand = "verarbeitet"; text = "Sprache wird erkannt …"; }
    else if (strukturLaeuft) { zustand = "verarbeitet"; text = "Notiz wird geschrieben …"; }
    else if (unversendet.length) {
      zustand = "fehler";
      text = `${unversendet.length === 1 ? "1 Aufnahme" : `${unversendet.length} Aufnahmen`} noch nicht erkannt – fehlt in der Notiz. ${sendeFehler}`;
    }
    else if (meldung.art === "fehler") { zustand = "fehler"; text = meldung.text; }
    else if (meldung.art === "gespeichert") { zustand = "fertig"; text = meldung.text; }
    else if (entwurfAktuell()) { zustand = "fertig"; text = "Notiz fertig – bitte prüfen und speichern. Gedrückt halten ergänzt."; }
    else { zustand = "bereit"; text = entwurf.rohtext ? "Gedrückt halten, um zu ergänzen" : "Gedrückt halten und sprechen"; }
    el.station.dataset.zustand = zustand;
    el.statusText.textContent = LABEL[zustand];
    if (el.anweisung.textContent !== text) el.anweisung.textContent = text;
    const aktion = zustand !== "fehler" ? null
      : unversendet.length ? { text: "Nochmal senden", los: alleNochmalSenden }
        : meldung.aktion;
    stationAktion = aktion;
    el.stationAktion.hidden = !aktion;
    if (aktion) el.stationAktion.textContent = aktion.text;
  }

  function alleNochmalSenden() {
    for (const holen of unversendet.splice(0)) transkriptEinreihen(holen);
  }

  function meldungSetzen(art, text, aktion = null, dauer = 0) {
    clearTimeout(meldung.uhr);
    Object.assign(meldung, { art, text, aktion });
    if (dauer) meldung.uhr = setTimeout(() => meldungLoeschen(), dauer);
    stationAktualisieren();
  }
  function meldungLoeschen() {
    clearTimeout(meldung.uhr);
    Object.assign(meldung, { art: "", text: "", aktion: null });
    stationAktualisieren();
  }
  el.stationAktion.addEventListener("click", () => {
    const aktion = stationAktion;
    if (!aktion) return;
    if (aktion === meldung.aktion) meldungLoeschen();
    aktion.los();
  });

  // ---------- Mikrofon-Freigabe: klare Anleitung je Gerät ----------
  const MIKRO_SCHRITTE = IOS ? [
    "In der Adressleiste links auf „aA“ bzw. das Seiten-Symbol tippen.",
    "„Website-Einstellungen“ → „Mikrofon“ → „Erlauben“ wählen.",
    "Steht dort nichts: iPhone-Einstellungen → (Apps →) Safari → Mikrofon → „Erlauben“.",
    "Diese Seite neu laden und den Knopf wieder gedrückt halten.",
  ] : ANDROID ? [
    "Links in der Adressleiste auf das Schloss- oder Regler-Symbol tippen.",
    "„Berechtigungen“ → „Mikrofon“ → „Zulassen“ wählen.",
    "Darf Chrome selbst nicht aufnehmen: Android-Einstellungen → Apps → Chrome → Berechtigungen → Mikrofon.",
    "Diese Seite neu laden.",
  ] : MAC_SAFARI ? [
    "Menü „Safari“ → „Einstellungen für diese Website …“ öffnen.",
    "Bei „Mikrofon“ „Erlauben“ wählen.",
    "Mac-Systemeinstellungen → Datenschutz & Sicherheit → Mikrofon: Safari muss eingeschaltet sein.",
    "Diese Seite neu laden.",
  ] : [
    "Links in der Adressleiste auf das Schloss- oder Regler-Symbol klicken.",
    "Bei „Mikrofon“ „Zulassen“ wählen.",
    "Am Mac zusätzlich: Systemeinstellungen → Datenschutz & Sicherheit → Mikrofon → Browser einschalten.",
    "Diese Seite neu laden.",
  ];

  function mikroHilfeZeigen(titel, text, schritte = MIKRO_SCHRITTE) {
    el.mikroHilfeTitel.textContent = titel;
    el.mikroHilfeText.textContent = text;
    el.mikroHilfeSchritte.innerHTML = schritte.map((s) => `<li>${esc(s)}</li>`).join("");
    el.mikroHilfeSchritte.hidden = !schritte.length;
    el.mikroHilfe.hidden = false;
  }
  function mikroHilfeVerstecken() { el.mikroHilfe.hidden = true; }
  el.mikroErneut.addEventListener("click", () => location.reload());

  /** Vorab prüfen, ob Aufnehmen überhaupt geht – damit niemand ins Leere drückt. */
  function aufnahmeMoeglich() {
    if (!window.isSecureContext) {
      return { titel: "Sichere Verbindung nötig", text: "Aufnehmen geht nur über https. Bitte https://gabi.automatilabs.de öffnen.", schritte: [] };
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      return IN_APP
        ? { titel: "Bitte im Browser öffnen", text: "In dieser App kann nicht aufgenommen werden. Bitte den Link in Safari (iPhone) oder Chrome (Android) öffnen.", schritte: [] }
        : { titel: "Browser kann nicht aufnehmen", text: "Bitte einen aktuellen Browser verwenden: Safari (iPhone/Mac) oder Chrome.", schritte: [] };
    }
    return null;
  }

  async function mikrofonRechtBeobachten() {
    const geht = aufnahmeMoeglich();
    if (geht) {
      mikroHilfeZeigen(geht.titel, geht.text, geht.schritte);
      meldungSetzen("fehler", geht.text);
      return;
    }
    try {
      const recht = await navigator.permissions.query({ name: "microphone" });
      const pruefen = () => {
        if (recht.state === "denied") {
          mikroHilfeZeigen("Mikrofon ist blockiert", "Gabi darf das Mikrofon nicht benutzen. So geben Sie es frei:");
          meldungSetzen("fehler", "Mikrofon ist blockiert – Anleitung unten.");
        } else if (!el.mikroHilfe.hidden) {
          mikroHilfeVerstecken();
          if (meldung.art === "fehler") meldungLoeschen();
        }
      };
      pruefen();
      recht.onchange = pruefen;
    } catch { /* Abfrage nicht unterstützt (z. B. Firefox, ältere Safaris) – Fehler kommt dann beim Drücken */ }
  }

  function mikrofonFehler(e) {
    const name = (e && e.name) || "";
    if (["NotAllowedError", "SecurityError", "PermissionDeniedError"].includes(name)) {
      mikroHilfeZeigen("Mikrofon ist nicht freigegeben", "Ohne Mikrofon-Freigabe kann Gabi nicht aufnehmen. So geben Sie es frei:");
      return "Mikrofon ist nicht freigegeben – Anleitung unten.";
    }
    if (["NotFoundError", "DevicesNotFoundError"].includes(name)) return "Kein Mikrofon gefunden. Bitte Mikrofon oder Headset anschließen.";
    if (["NotReadableError", "TrackStartError", "AbortError"].includes(name)) return "Mikrofon ist gerade belegt (z. B. Telefonat oder andere App). Bitte dort beenden und nochmal versuchen.";
    return `Mikrofon konnte nicht starten (${name || "unbekannter Fehler"}). Bitte Seite neu laden.`;
  }

  async function mikrofonHolen() {
    // wie Notara: ungefiltertes Signal für die Spracherkennung, nur Lautstärke angleichen
    const wunsch = { audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true } };
    try {
      return await navigator.mediaDevices.getUserMedia(wunsch);
    } catch (e) {
      if (e && (e.name === "OverconstrainedError" || e.name === "TypeError")) return navigator.mediaDevices.getUserMedia({ audio: true });
      throw e;
    }
  }

  // ---------- Aufnahme ----------
  async function aufnahmeStarten() {
    if (aufnahme.phase !== "bereit") return;
    const geht = aufnahmeMoeglich();
    if (geht) { mikroHilfeZeigen(geht.titel, geht.text, geht.schritte); meldungSetzen("fehler", geht.text); return; }
    meldungLoeschen();
    aufnahme.phase = "startet";
    aufnahme.losgelassen = false;
    aufnahme.maxPegel = 0;
    aufnahme.dauer = undefined;
    const startZeit = performance.now();
    stationAktualisieren();
    let ctx = null;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; } // direkt in der Geste (Safari)
    let stream;
    try {
      stream = await mikrofonHolen();
    } catch (e) {
      if (ctx) ctx.close().catch(() => {});
      aufnahme.phase = "bereit";
      meldungSetzen("fehler", mikrofonFehler(e));
      return;
    }
    mikroHilfeVerstecken();
    if (aufnahme.losgelassen) {
      // Schon losgelassen (z. B. während der Mikrofon-Freigabe) – nichts aufnehmen
      stream.getTracks().forEach((t) => t.stop());
      if (ctx) ctx.close().catch(() => {});
      aufnahme.phase = "bereit";
      stationAktualisieren();
      const langeGewartet = performance.now() - startZeit > 700;
      toast(langeGewartet ? "Mikrofon ist bereit. Jetzt gedrückt halten und sprechen." : "Bitte gedrückt halten, bis der Knopf rot ist.", "", 4000);
      return;
    }
    const mime = formatWaehlen();
    let rec;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      if (ctx) ctx.close().catch(() => {});
      formatSperren(mime);
      aufnahme.phase = "bereit";
      meldungSetzen("fehler", `Aufnahme konnte nicht starten (${e.name || "Fehler"}). Bitte nochmal drücken.`);
      return;
    }
    aufnahme.teile = [];
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) aufnahme.teile.push(ev.data); };
    rec.onstop = () => aufnahmeFertig(rec);
    rec.onerror = () => aufnahmeStoppen();
    // Telefonat, Bluetooth-Wechsel o. Ä. beendet das Mikrofon → sauber abschließen
    stream.getAudioTracks().forEach((t) => { t.onended = () => aufnahmeStoppen(); });
    let analyser = null;
    try {
      if (ctx.state === "suspended") await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 1000))]); // WebKit hängt hier manchmal
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      ctx.createMediaStreamSource(stream).connect(analyser);
    } catch { analyser = null; }
    try {
      rec.start();
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      if (ctx) ctx.close().catch(() => {});
      formatSperren(mime);
      aufnahme.phase = "bereit";
      meldungSetzen("fehler", `Aufnahme konnte nicht starten (${e.name || "Fehler"}). Bitte nochmal drücken.`);
      return;
    }
    Object.assign(aufnahme, { rec, stream, ctx, analyser, mime: rec.mimeType || mime, start: performance.now(), phase: "aufnahme" });
    try { if (navigator.vibrate) navigator.vibrate(20); } catch { /* egal */ }
    bildschirmWachHalten(true);
    stationAktualisieren();
    pegelSchleife();
    zeitSchleife();
    if (aufnahme.losgelassen) aufnahmeStoppen();
  }

  function aufnahmeStoppen() {
    aufnahme.losgelassen = true;
    if (aufnahme.phase === "aufnahme" && aufnahme.rec && aufnahme.rec.state !== "inactive") {
      const rec = aufnahme.rec;
      aufnahme.phase = "stoppt";
      aufnahme.dauer = performance.now() - aufnahme.start;
      try { rec.stop(); } catch { aufnahmeFertig(rec); }
      // Wächter: kommt „stop“ nie an, trotzdem abschließen statt hängen zu bleiben
      setTimeout(() => { if (aufnahme.rec === rec && aufnahme.phase === "stoppt") aufnahmeFertig(rec); }, 4000);
      stationAktualisieren();
    }
  }

  /** Bildschirm während der Aufnahme nicht ausgehen lassen (sonst bricht das iPhone die Aufnahme ab). */
  async function bildschirmWachHalten(an) {
    try {
      if (an && navigator.wakeLock && !aufnahme.sperre) {
        const s = await navigator.wakeLock.request("screen");
        s.addEventListener("release", () => { if (aufnahme.sperre === s) aufnahme.sperre = null; });
        if (aufnahme.phase === "aufnahme" && !aufnahme.sperre) aufnahme.sperre = s; // Aufnahme läuft noch?
        else await s.release();
      } else if (!an && aufnahme.sperre) {
        const s = aufnahme.sperre;
        aufnahme.sperre = null;
        await s.release();
      }
    } catch { /* nicht unterstützt oder abgelehnt – Aufnahme geht trotzdem */ }
  }

  function pegelSchleife() {
    if (aufnahme.phase !== "aufnahme") { el.buehne.style.setProperty("--pegel", "0"); return; }
    if (aufnahme.analyser) {
      const d = new Uint8Array(aufnahme.analyser.fftSize);
      aufnahme.analyser.getByteTimeDomainData(d);
      let summe = 0;
      for (let i = 0; i < d.length; i++) { const v = (d[i] - 128) / 128; summe += v * v; }
      const pegel = Math.min(1, Math.sqrt(summe / d.length) * 4);
      aufnahme.maxPegel = Math.max(aufnahme.maxPegel, pegel);
      el.buehne.style.setProperty("--pegel", pegel.toFixed(3));
    }
    requestAnimationFrame(pegelSchleife);
  }

  function zeitSchleife() {
    if (aufnahme.phase !== "aufnahme") { el.zeit.classList.remove("knapp"); return; }
    const s = Math.floor((performance.now() - aufnahme.start) / 1000);
    el.zeit.textContent = mmss(s);
    el.zeit.classList.toggle("knapp", s >= WARNUNG_AB_S);
    stationAktualisieren();
    if (s >= MAX_DAUER_S) {
      toast("Höchstens 5 Minuten am Stück – die Aufnahme wird jetzt erkannt. Für mehr einfach nochmal drücken.", "warn", 6000);
      aufnahmeStoppen();
      return;
    }
    setTimeout(zeitSchleife, 250);
  }

  function aufnahmeFertig(rec) {
    if (aufnahme.rec !== rec) return; // schon abgeschlossen (z. B. durch den Wächter)
    const { stream, ctx, teile, mime, maxPegel } = aufnahme;
    const dauer = aufnahme.dauer ?? performance.now() - aufnahme.start;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    Object.assign(aufnahme, { phase: "bereit", rec: null, stream: null, analyser: null, ctx: null, zeiger: null });
    bildschirmWachHalten(false);
    el.buehne.style.setProperty("--pegel", "0");
    el.zeit.textContent = "0:00";
    el.zeit.classList.remove("knapp");
    if (dauer < MIN_DAUER_MS) {
      if (ctx) ctx.close().catch(() => {});
      stationAktualisieren();
      toast("Zu kurz – bitte gedrückt halten, solange Sie sprechen.", "", 3500);
      return;
    }
    if (ctx && ctx.state === "running" && maxPegel < 0.015) {
      ctx.close().catch(() => {});
      meldungSetzen("fehler", "Es kam kein Ton an. Bitte Mikrofon prüfen (stumm? anderes Gerät?) und nochmal drücken.");
      return;
    }
    if (!teile.length) {
      if (ctx) ctx.close().catch(() => {});
      meldungSetzen("fehler", "Die Aufnahme war leer. Bitte nochmal gedrückt halten und sprechen.");
      return;
    }
    const blob = new Blob(teile, { type: mime || "audio/webm" });
    let b64 = null; // bleibt erhalten, damit „Nochmal senden“ ohne neue Aufnahme geht
    const holen = async () => {
      if (!b64) {
        try {
          b64 = await zuWavBase64(blob, ctx);
        } catch {
          formatSperren(mime);
          const f = new Error("Aufnahme konnte nicht gelesen werden. Bitte nochmal aufnehmen – Gabi nimmt jetzt ein anderes Format.");
          f.keineWiederholung = true;
          throw f;
        } finally {
          if (ctx) ctx.close().catch(() => {});
        }
      }
      const d = await api("/api/transkribieren", { methode: "POST", text: b64, zeit: 180000 });
      return d && d.text;
    };
    transkriptEinreihen(holen);
  }

  /** Ein Transkript holen (Aufnahme oder Beispieldiktat) und an den Entwurf hängen – der Reihe nach. */
  function transkriptEinreihen(holen) {
    const generation = entwurf.generation; // wird der Entwurf verworfen, zählt das Ergebnis nicht mehr
    meldungLoeschen();
    offeneTranskripte++;
    entwurfZeigen();
    statusSetzen("Sprache wird erkannt …", "laeuft");
    stationAktualisieren();
    knoepfeAktualisieren();
    kette = kette
      .then(async () => {
        if (generation !== entwurf.generation) return;
        const text = String((await holen()) || "").trim();
        if (generation !== entwurf.generation) return;
        if (!text) {
          meldungSetzen("fehler", "Kein Text erkannt. Bitte deutlicher oder näher am Mikrofon sprechen.");
          toast("Kein Text erkannt – bitte nochmal aufnehmen.", "warn", 5000);
          return;
        }
        transkriptAnhaengen(text);
        if (modus.demo && !demoHinweisGezeigt) {
          demoHinweisGezeigt = true;
          toast("Demo-Modus: Statt Ihrer Aufnahme steht hier ein Beispieltext.", "warn", 6000);
        }
      })
      .catch((e) => {
        if (e instanceof Abbruch || generation !== entwurf.generation) return;
        if (e.keineWiederholung) meldungSetzen("fehler", `Spracherkennung: ${e.message}`);
        else { unversendet.push(holen); sendeFehler = e.message; }
        toast(`Spracherkennung: ${e.message}`, "fehler", 7000);
      })
      .finally(() => {
        offeneTranskripte--;
        stationAktualisieren();
        knoepfeAktualisieren();
        if (offeneTranskripte === 0) nachTranskript();
      });
  }

  // Zeiger: gedrückt halten (Maus, Finger, Stift). Zeiger wird festgehalten, damit Loslassen immer ankommt.
  el.ptt.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    if (aufnahme.phase !== "bereit") return; // zweiter Finger o. Ä.
    aufnahme.zeiger = e.pointerId;
    try { el.ptt.setPointerCapture(e.pointerId); } catch { /* egal */ }
    aufnahmeStarten();
  });
  for (const art of ["pointerup", "pointercancel", "lostpointercapture"]) {
    el.ptt.addEventListener(art, (e) => {
      if (aufnahme.zeiger !== null && e.pointerId !== aufnahme.zeiger) return; // nur der Finger, der gedrückt hat
      aufnahmeStoppen();
    });
  }
  el.ptt.addEventListener("contextmenu", (e) => e.preventDefault());
  // Tastatur: Leertaste oder Enter gedrückt halten
  el.ptt.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); aufnahme.zeiger = null; aufnahmeStarten(); }
    else if (e.key === " " || e.key === "Enter") e.preventDefault();
  });
  el.ptt.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); aufnahmeStoppen(); } });
  el.ptt.addEventListener("click", (e) => e.preventDefault());
  // App gewechselt, Bildschirm aus, Fenster verlassen → Aufnahme sauber beenden
  window.addEventListener("blur", () => aufnahmeStoppen());
  document.addEventListener("visibilitychange", () => { if (document.hidden) aufnahmeStoppen(); });
  window.addEventListener("beforeunload", (e) => {
    const offen = aufnahme.phase !== "bereit" || offeneTranskripte > 0 || strukturLaeuft || speichertGerade || unversendet.length > 0 || (ordner.bearbeiten && ordner.geaendert);
    if (offen) { e.preventDefault(); e.returnValue = ""; }
  });

  // Demo-Modus: Beispieldiktat ohne Mikrofon (gleicher Ablauf wie nach einer Aufnahme)
  el.demoDiktat.addEventListener("click", () => {
    if (!modus.demo) return;
    transkriptEinreihen(async () => (await demoApi.beispielDiktat()).text);
  });

  // ==========================================================
  // 6 Audio → WAV (16 kHz mono) → Base64: läuft in jedem Browser gleich, Whisper liest es sicher
  // ==========================================================
  function dekodieren(ctx, puffer) {
    return new Promise((ok, fehler) => {
      const p = ctx.decodeAudioData(puffer, ok, fehler);
      if (p && typeof p.then === "function") p.then(ok, fehler);
    });
  }

  function aufMono16k(audio) {
    const n = audio.length;
    const kanaele = audio.numberOfChannels;
    let mono = audio.getChannelData(0);
    if (kanaele > 1) {
      mono = new Float32Array(n);
      for (let c = 0; c < kanaele; c++) {
        const d = audio.getChannelData(c);
        for (let i = 0; i < n; i++) mono[i] += d[i] / kanaele;
      }
    }
    const von = audio.sampleRate;
    const nach = 16000;
    if (von === nach) return mono;
    const faktor = von / nach;
    const laenge = Math.floor(n / faktor);
    const aus = new Float32Array(laenge);
    if (faktor > 1) {
      for (let i = 0; i < laenge; i++) {           // Mittelwert je Fenster = einfacher Tiefpass
        const a = Math.floor(i * faktor);
        const b = Math.min(n, Math.floor((i + 1) * faktor));
        let s = 0;
        for (let j = a; j < b; j++) s += mono[j];
        aus[i] = b > a ? s / (b - a) : mono[a] || 0;
      }
    } else {
      for (let i = 0; i < laenge; i++) {           // lineare Interpolation (selten: Quelle < 16 kHz)
        const x = i * faktor;
        const a = Math.floor(x);
        const t = x - a;
        aus[i] = (mono[a] || 0) * (1 - t) + (mono[a + 1] || 0) * t;
      }
    }
    return aus;
  }

  function wavBlob(pcm, rate) {
    const puffer = new ArrayBuffer(44 + pcm.length * 2);
    const v = new DataView(puffer);
    const schreibe = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    schreibe(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); schreibe(8, "WAVE");
    schreibe(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    schreibe(36, "data"); v.setUint32(40, pcm.length * 2, true);
    for (let i = 0, o = 44; i < pcm.length; i++, o += 2) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([puffer], { type: "audio/wav" });
  }

  function alsBase64(blob) {
    return new Promise((ok, fehler) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).slice(String(r.result).indexOf(",") + 1));
      r.onerror = () => fehler(new Error("Aufnahme konnte nicht gelesen werden."));
      r.readAsDataURL(blob);
    });
  }

  async function zuWavBase64(blob, ctx) {
    let eigener = null;
    if (!ctx || ctx.state === "closed") ctx = eigener = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const audio = await dekodieren(ctx, await blob.arrayBuffer());
      return await alsBase64(wavBlob(aufMono16k(audio), 16000));
    } catch (e) {
      throw new Error(e && e.message && !/decode/i.test(e.message) ? e.message : "Aufnahme konnte nicht gelesen werden.");
    } finally {
      if (eigener) eigener.close().catch(() => {});
    }
  }

  // ==========================================================
  // 7 Entwurf: Transkript sammeln, strukturieren, bearbeiten, speichern
  // ==========================================================
  // generation zählt bei jedem Verwerfen/Speichern hoch: späte Ergebnisse eines alten Entwurfs werden ignoriert
  const entwurf = { patientId: "", rohtext: "", strukturiert: null, manuell: false, version: 0, strukturVersion: 0, generation: 0 };
  let strukturLaeuft = false;
  let speichertGerade = false;

  const leereNotiz = () => ({ befund: [], massnahmen: [], verlauf: [], hausaufgaben: [], unklar: [] });

  function entwurfMerken() {
    const { patientId, rohtext, strukturiert, manuell } = entwurf;
    speicherSchreiben(sessionStorage, schluessel("entwurf"), rohtext || strukturiert ? JSON.stringify({ patientId, rohtext, strukturiert, manuell }) : null);
  }

  function entwurfLaden() {
    try {
      const d = JSON.parse(speicherLesen(sessionStorage, schluessel("entwurf")) || "null");
      if (d && (d.rohtext || d.strukturiert)) Object.assign(entwurf, d, { version: 1, strukturVersion: d.strukturiert ? 1 : 0 });
    } catch { /* kaputt */ }
  }

  function entwurfZeigen() {
    el.entwurf.hidden = false;
    document.body.classList.add("mit-entwurf");
  }

  function statusSetzen(text, art = "") {
    el.entwurfStatus.textContent = text;
    el.entwurfStatus.className = `chip ${art}`;
  }

  function transkriptAnhaengen(text) {
    entwurf.rohtext = entwurf.rohtext ? `${entwurf.rohtext}\n${text}` : text;
    entwurf.version++;
    el.entwurfRoh.value = entwurf.rohtext;
    entwurfMerken();
    knoepfeAktualisieren();
  }

  function nachTranskript() {
    if (!entwurf.rohtext) {
      if (unversendet.length) statusSetzen("Aufnahme nicht erkannt", "rot"); // Fläche bleibt: „Verwerfen“ muss erreichbar sein
      else if (!entwurf.strukturiert) { // nichts erkannt und noch kein Entwurf → Fläche wieder ausblenden
        statusSetzen("");
        el.entwurf.hidden = true;
        document.body.classList.remove("mit-entwurf");
      }
      return;
    }
    if (entwurf.version === entwurf.strukturVersion) { // nichts Neues dazugekommen → Anzeige nicht hängen lassen
      if (unversendet.length) statusSetzen("Aufnahme fehlt noch", "rot");
      else if (entwurf.strukturiert) statusSetzen("Entwurf fertig – bitte prüfen", "gruen");
      return;
    }
    if (entwurf.manuell) {
      el.neuHinweis.hidden = false;
      statusSetzen("Neuer Text ergänzt", "warn");
      return;
    }
    strukturieren();
  }

  async function strukturieren() {
    if (strukturLaeuft) return;
    const text = entwurf.rohtext.trim();
    if (!text) { toast("Noch kein Text – erst aufnehmen oder Transkript eintippen.", "warn"); return; }
    strukturLaeuft = true;
    const version = entwurf.version;
    const generation = entwurf.generation;
    meldungLoeschen();
    statusSetzen("Notiz wird geschrieben …", "laeuft");
    knoepfeAktualisieren();
    try {
      const d = await api("/api/strukturieren", { methode: "POST", body: { rohtext: text }, zeit: 120000 });
      if (generation !== entwurf.generation) return; // Entwurf inzwischen verworfen oder gespeichert
      entwurf.strukturiert = d.strukturiert;
      entwurf.strukturVersion = version;
      entwurf.manuell = false;
      el.neuHinweis.hidden = true;
      abschnitteZeigen();
      entwurfMerken();
      statusSetzen(unversendet.length ? "Aufnahme fehlt noch" : "Entwurf fertig – bitte prüfen", unversendet.length ? "rot" : "gruen");
    } catch (e) {
      if (generation !== entwurf.generation) return;
      statusSetzen("Notiz nicht erstellt", "rot");
      if (!(e instanceof Abbruch)) {
        meldungSetzen("fehler", `Notiz konnte nicht erstellt werden: ${e.message}`, { text: "Nochmal versuchen", los: () => strukturieren() });
        fehlerZeigen(e, "Notiz: ");
      }
      if (!entwurf.strukturiert) abschnitteZeigen();
    } finally {
      strukturLaeuft = false;
      knoepfeAktualisieren();
      const neuerText = generation === entwurf.generation && entwurf.version !== version;
      if (neuerText && offeneTranskripte === 0 && !entwurf.manuell && entwurf.rohtext.trim()) strukturieren(); // neuer Text kam dazu
    }
  }

  function abschnitteZeigen() {
    const n = entwurf.strukturiert || leereNotiz();
    el.entwurfAbschnitte.innerHTML = ABSCHNITTE.map(([key, titel, hilfe]) => `
      <div class="abschnitt${n[key] && n[key].length ? "" : " leer"}">
        <span class="abschnitt-titel"><h3>${titel}</h3><small>${hilfe}</small></span>
        <textarea data-abschnitt="${key}" aria-label="${titel}" rows="${Math.max(2, (n[key] || []).length + 1)}" placeholder="– nichts notiert –">${esc((n[key] || []).join("\n"))}</textarea>
      </div>`).join("");
    unklarZeigen(el.entwurfUnklar, n.unklar);
  }

  function unklarZeigen(ziel, liste) {
    if (!liste || !liste.length) { ziel.hidden = true; ziel.innerHTML = ""; return; }
    ziel.hidden = false;
    ziel.innerHTML = `<h3>Bitte prüfen (${liste.length})</h3><ul>${liste.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>`;
  }

  function ausFeldern(wurzel) {
    const n = leereNotiz();
    wurzel.querySelectorAll("textarea[data-abschnitt]").forEach((t) => {
      n[t.dataset.abschnitt] = t.value.split("\n").map((z) => z.replace(/^\s*[-•–*]\s*/, "").trim()).filter(Boolean);
    });
    return n;
  }

  el.entwurfAbschnitte.addEventListener("input", (e) => {
    if (!e.target.matches("textarea")) return;
    const unklar = (entwurf.strukturiert && entwurf.strukturiert.unklar) || [];
    entwurf.strukturiert = { ...ausFeldern(el.entwurfAbschnitte), unklar };
    entwurf.manuell = true;
    e.target.closest(".abschnitt").classList.toggle("leer", !e.target.value.trim());
    entwurfMerken();
    knoepfeAktualisieren();
  });

  el.entwurfRoh.addEventListener("input", () => {
    entwurf.rohtext = el.entwurfRoh.value;
    entwurf.version++;
    el.neuHinweis.hidden = !entwurf.strukturiert;
    entwurfMerken();
    knoepfeAktualisieren();
  });

  document.addEventListener("click", async (e) => {
    const b = e.target.closest('[data-aktion="neu-strukturieren"]');
    if (!b) return;
    if (entwurf.manuell && !(await frage("Neu strukturieren?", "Ihre Änderungen an der Notiz werden durch einen neuen Entwurf aus dem Transkript ersetzt.", "Ersetzen"))) return;
    entwurf.manuell = false;
    entwurf.strukturVersion = -1;
    strukturieren();
  });

  function entwurfHatInhalt() {
    return Boolean(entwurf.rohtext.trim()) || Boolean(entwurf.strukturiert && ABSCHNITTE.some(([k]) => (entwurf.strukturiert[k] || []).length));
  }

  function knoepfeAktualisieren() {
    const hatInhalt = entwurfHatInhalt();
    el.speichern.disabled = !hatInhalt || strukturLaeuft || offeneTranskripte > 0 || speichertGerade;
    const p = patienten.find((x) => x.id === entwurf.patientId);
    el.speichern.textContent = speichertGerade ? "Wird gespeichert …" : p ? `Speichern bei ${p.kuerzel}` : "Speichern";
    stationAktualisieren();
  }

  function entwurfLeeren() {
    Object.assign(entwurf, { rohtext: "", strukturiert: null, manuell: false, version: 0, strukturVersion: 0 });
    entwurf.generation++;
    unversendet.length = 0;
    el.entwurfRoh.value = "";
    el.entwurfAbschnitte.innerHTML = "";
    unklarZeigen(el.entwurfUnklar, []);
    el.neuHinweis.hidden = true;
    el.entwurfTranskript.open = false;
    el.entwurf.hidden = true;
    document.body.classList.remove("mit-entwurf");
    statusSetzen("");
    entwurfMerken();
    knoepfeAktualisieren();
  }

  el.verwerfen.addEventListener("click", async () => {
    if (await frage("Entwurf verwerfen?", "Transkript und Notiz-Entwurf werden gelöscht.", "Verwerfen")) {
      entwurfLeeren();
      toast("Entwurf verworfen.");
    }
  });

  el.speichern.addEventListener("click", async () => {
    if (speichertGerade) return; // kein doppeltes Absenden
    if (!entwurf.patientId) {
      toast("Bitte zuerst einen Test-Patienten wählen oder anlegen.", "warn", 4500);
      el.patientWahl.focus();
      return;
    }
    if (offeneTranskripte > 0 || strukturLaeuft) { toast("Bitte kurz warten, bis die Notiz fertig ist.", "warn"); return; }
    if (unversendet.length) {
      const anzahl = unversendet.length === 1 ? "Eine Aufnahme wurde" : `${unversendet.length} Aufnahmen wurden`;
      if (!(await frage("Aufnahme fehlt in der Notiz", `${anzahl} noch nicht erkannt und fehlt in der Notiz. Trotzdem speichern?`, "Trotzdem speichern"))) return;
      if (speichertGerade) return;
    }
    const strukturiert = entwurf.strukturiert
      ? { ...ausFeldern(el.entwurfAbschnitte), unklar: entwurf.strukturiert.unklar || [] }
      : leereNotiz();
    speichertGerade = true;
    el.speichern.classList.add("laedt");
    knoepfeAktualisieren();
    try {
      const d = await api("/api/notizen", { methode: "POST", body: { patient_id: entwurf.patientId, rohtext: entwurf.rohtext, strukturiert } });
      speichertGerade = false;
      entwurfLeeren();
      meldungSetzen("gespeichert", `Gespeichert bei ${d.notiz.kuerzel}. Bereit für die nächste Notiz.`, null, 6000);
      patientenLaden().catch(() => {});
      toast(`Gespeichert bei ${d.notiz.kuerzel}${modus.demo ? " (Demo – nur in diesem Browser)" : ""}.`, "erfolg", 5000, { text: "Ansehen", los: () => { location.hash = `#/ordner/n/${d.notiz.id}`; } });
    } catch (e) {
      fehlerZeigen(e, "Speichern: ");
    } finally {
      speichertGerade = false;
      el.speichern.classList.remove("laedt");
      knoepfeAktualisieren();
    }
  });

  // ==========================================================
  // 8 Notizordner: Patienten → Notizen → Detail · Suche · Sortierung · Bearbeiten · Löschen
  // ==========================================================
  const SORTIERUNG = "gabi.sortierung";
  const ordner = {
    patientId: "", notizId: "", suche: "", notizen: [], notiz: null,
    bearbeiten: false, geaendert: false, beschaeftigt: false,
    sortierung: speicherLesen(localStorage, SORTIERUNG) === "alt" ? "alt" : "neu",
  };
  const PFEIL = '<svg class="eintrag-pfeil" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const ZURUECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  el.sortierung.value = ordner.sortierung;

  function notizTitel(n) {
    const s = n.strukturiert || {};
    return (s.befund && s.befund[0]) || (s.massnahmen && s.massnahmen[0]) || (s.verlauf && s.verlauf[0]) || (s.hausaufgaben && s.hausaufgaben[0]) || "(ohne Inhalt)";
  }

  function sortiert(liste) {
    const richtung = ordner.sortierung === "alt" ? 1 : -1;
    return [...liste].sort((a, b) => (a.erstellt_am < b.erstellt_am ? -richtung : a.erstellt_am > b.erstellt_am ? richtung : 0));
  }

  /** Leerer Zustand mit Erklärung und – wo sinnvoll – einem nächsten Schritt. */
  function leerHtml(text, knopf) {
    return `<div class="ordner-nichts"><p>${esc(text)}</p>${knopf ? `<button class="knopf klein" type="button" ${knopf.attr}>${esc(knopf.text)}</button>` : ""}</div>`;
  }

  function notizListeHtml(liste, mitKuerzel) {
    return sortiert(liste).map((n) => `
      <a class="eintrag${n.id === ordner.notizId ? " aktiv" : ""}" href="#/ordner/n/${n.id}">
        <span class="eintrag-titel">${esc(notizTitel(n))}</span>
        <span class="eintrag-unter">${mitKuerzel ? `${esc(n.kuerzel)} · ` : ""}${esc(zeitText(n.erstellt_am))}${n.geaendert_am ? " · bearbeitet" : ""}${n.strukturiert && n.strukturiert.unklar && n.strukturiert.unklar.length ? " · unklare Stellen" : ""}</span>
        <span class="eintrag-rechts">${PFEIL}</span>
      </a>`).join("");
  }

  const suchwoerterAnzahl = (q) => String(q || "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter((w) => w.replace(/^-+|-+$/g, "").length >= 2).length;

  async function ordnerListeZeigen() {
    const box = el.ordnerListe;
    el.sortierungFeld.hidden = !(ordner.suche || ordner.patientId);
    try {
      if (ordner.suche) {
        if (!suchwoerterAnzahl(ordner.suche)) {
          el.ordnerKopf.innerHTML = `<h2>Suche</h2>`;
          box.innerHTML = leerHtml("Bitte mindestens 2 Buchstaben eingeben.");
          return;
        }
        el.ordnerKopf.innerHTML = `<h2>Suche …</h2>`;
        const q = ordner.suche;
        const d = await api(`/api/notizen?q=${encodeURIComponent(q)}`);
        if (q !== ordner.suche) return; // inzwischen weitergetippt
        ordner.notizen = d.notizen;
        el.ordnerKopf.innerHTML = `<h2>${d.notizen.length} ${d.notizen.length === 1 ? "Notiz" : "Notizen"} gefunden</h2>`;
        box.innerHTML = d.notizen.length
          ? notizListeHtml(d.notizen, true)
          : leerHtml(`Keine Notiz zu „${q}“ gefunden.`, { text: "Suche löschen", attr: 'data-ordner="suche-loeschen"' });
      } else if (ordner.patientId) {
        if (!patienten.length) await patientenLaden();
        const p = patienten.find((x) => x.id === ordner.patientId);
        const d = await api(`/api/notizen?patient_id=${encodeURIComponent(ordner.patientId)}`);
        ordner.notizen = d.notizen;
        el.ordnerKopf.innerHTML = `
          <a class="zurueck" href="#/ordner">${ZURUECK}Alle Test-Patienten</a>
          <span class="ordner-kopf-rechts"><span class="chip gruen">${esc(p ? p.kuerzel : "")}</span>
          <button class="knopf klein" type="button" data-ordner="aufnehmen">+ Notiz</button></span>`;
        box.innerHTML = d.notizen.length
          ? notizListeHtml(d.notizen, false)
          : leerHtml(`Für ${p ? p.kuerzel : "diesen Test-Patienten"} gibt es noch keine Notiz.`, { text: "Notiz aufnehmen", attr: 'data-ordner="aufnehmen"' });
      } else {
        await patientenLaden();
        el.ordnerKopf.innerHTML = `<h2>Test-Patienten${patienten.length ? ` (${patienten.length})` : ""}</h2>`;
        box.innerHTML = patienten.length
          ? patienten.map((p) => `
            <a class="eintrag" href="#/ordner/p/${p.id}">
              <span class="eintrag-titel">${esc(p.kuerzel)}${p.pseudonym ? ` <span class="eintrag-zusatz">· ${esc(p.pseudonym)}</span>` : ""}</span>
              <span class="eintrag-unter">${p.anzahl} ${p.anzahl === 1 ? "Notiz" : "Notizen"}</span>
              <span class="eintrag-rechts">${PFEIL}</span>
            </a>`).join("")
          : leerHtml("Noch kein Test-Patient angelegt.", { text: "Test-Patient anlegen", attr: 'data-ordner="patient-neu"' });
      }
    } catch (e) {
      fehlerZeigen(e);
      box.innerHTML = leerHtml("Konnte nicht geladen werden.", { text: "Nochmal versuchen", attr: 'data-ordner="neu-laden"' });
    }
  }

  // Knöpfe in leeren Zuständen und im Kopf
  el.ordnerBox.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ordner]");
    if (!b) return;
    const was = b.dataset.ordner;
    if (was === "suche-loeschen") { el.suche.value = ""; ordner.suche = ""; ordnerListeZeigen(); el.suche.focus(); }
    else if (was === "neu-laden") ordnerListeZeigen();
    else if (was === "patient-neu") { location.hash = "#/aufnahme"; setTimeout(() => el.patientNeu.click(), 50); }
    else if (was === "aufnehmen") {
      const id = ordner.patientId;
      if (entwurfHatInhalt() && entwurf.patientId && entwurf.patientId !== id) {
        toast("Es gibt noch einen offenen Entwurf – bitte erst speichern oder verwerfen.", "warn", 5000);
      } else {
        entwurf.patientId = id;
        speicherSchreiben(localStorage, schluessel("patient"), id);
        entwurfMerken();
      }
      location.hash = "#/aufnahme";
    }
  });

  el.sortierung.addEventListener("change", () => {
    ordner.sortierung = el.sortierung.value === "alt" ? "alt" : "neu";
    speicherSchreiben(localStorage, SORTIERUNG, ordner.sortierung);
    if (ordner.notizen.length) el.ordnerListe.innerHTML = notizListeHtml(ordner.notizen, Boolean(ordner.suche));
  });

  function abschnittLeseHtml(titel, punkte) {
    return `<section class="leser-abschnitt"><h3>${titel}</h3>${punkte && punkte.length
      ? `<ul>${punkte.map((p) => `<li>${mitUnklar(p)}</li>`).join("")}</ul>`
      : `<p class="nichts">– nichts notiert –</p>`}</section>`;
  }

  async function notizZeigen() {
    const id = ordner.notizId;
    if (!id) { el.leser.innerHTML = ""; return; }
    try {
      if (!ordner.notiz || ordner.notiz.id !== id) {
        el.leser.innerHTML = `<p class="leser-leer">Lädt …</p>`;
        ordner.notiz = (await api(`/api/notizen/${encodeURIComponent(id)}`)).notiz;
        ordner.bearbeiten = false;
        ordner.geaendert = false;
      }
    } catch (e) {
      ordner.notiz = null;
      el.leser.innerHTML = `<div class="leser-leer"><p>Notiz nicht gefunden – vielleicht wurde sie gelöscht.</p><a class="zurueck" href="#/ordner">${ZURUECK}Zum Notizordner</a></div>`;
      if (!/nicht gefunden/i.test(e.message)) fehlerZeigen(e);
      return;
    }
    const n = ordner.notiz;
    const s = n.strukturiert || leereNotiz();
    const kopf = `
      <a class="zurueck nur-mobil" href="#/ordner/p/${n.patient_id}">${ZURUECK}Notizen von ${esc(n.kuerzel)}</a>
      <div class="leser-kopf">
        <div class="leser-titel"><h2>Behandlungsnotiz</h2><span class="chip gruen">${esc(n.kuerzel)}</span></div>
        <p class="leser-zeit">${esc(zeitText(n.erstellt_am))}${n.geaendert_am ? ` · bearbeitet ${esc(zeitText(n.geaendert_am))}` : ""}</p>
      </div>`;
    if (ordner.bearbeiten) {
      el.leser.innerHTML = `${kopf}
        <p class="bearbeiten-hinweis">Bearbeiten: ein Stichpunkt pro Zeile.</p>
        <div class="abschnitte" id="bearbeiten-abschnitte">${ABSCHNITTE.map(([key, titel, hilfe]) => `
          <div class="abschnitt"><span class="abschnitt-titel"><h3>${titel}</h3><small>${hilfe}</small></span>
          <textarea data-abschnitt="${key}" aria-label="${titel}" rows="${Math.max(2, (s[key] || []).length + 1)}" placeholder="– nichts notiert –">${esc((s[key] || []).join("\n"))}</textarea></div>`).join("")}
        </div>
        <details class="transkript"><summary>Transkript</summary><div class="transkript-inhalt"><textarea id="bearbeiten-roh" rows="6">${esc(n.rohtext)}</textarea></div></details>
        <div class="leser-aktionen">
          <button class="knopf primaer" type="button" data-leser="sichern">Änderungen speichern</button>
          <button class="knopf" type="button" data-leser="abbrechen">Abbrechen</button>
        </div>`;
      return;
    }
    el.leser.innerHTML = `${kopf}
      <div class="leser-aktionen">
        <button class="knopf" type="button" data-leser="pdf"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>PDF</button>
        <button class="knopf" type="button" data-leser="bearbeiten"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>Bearbeiten</button>
        <button class="knopf gefahr" type="button" data-leser="loeschen">Löschen</button>
      </div>
      ${ABSCHNITTE.map(([key, titel]) => abschnittLeseHtml(titel, s[key])).join("")}
      <div class="pruefliste" id="leser-unklar" hidden></div>
      <details class="transkript"><summary>Transkript</summary><p class="leser-roh">${esc(n.rohtext || "–")}</p></details>`;
    unklarZeigen($("#leser-unklar", el.leser), s.unklar);
  }

  /** Ungespeicherte Änderungen verwerfen? (true = weiter) */
  async function bearbeitenVerlassen() {
    if (!ordner.bearbeiten || !ordner.geaendert) return true;
    const ok = await frage("Änderungen verwerfen?", "Sie haben die Notiz geändert, aber noch nicht gespeichert.", "Verwerfen");
    if (ok) { ordner.bearbeiten = false; ordner.geaendert = false; }
    return ok;
  }

  el.leser.addEventListener("input", (e) => {
    if (ordner.bearbeiten && e.target.matches("textarea")) ordner.geaendert = true;
  });

  el.leser.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-leser]");
    if (!b || !ordner.notiz || ordner.beschaeftigt) return;
    const n = ordner.notiz;
    const was = b.dataset.leser;
    if (was === "pdf") return pdfExport(n);
    if (was === "bearbeiten") { ordner.bearbeiten = true; ordner.geaendert = false; await notizZeigen(); $("#bearbeiten-abschnitte textarea", el.leser)?.focus(); return; }
    if (was === "abbrechen") { if (await bearbeitenVerlassen()) { ordner.bearbeiten = false; notizZeigen(); } return; }
    if (was === "sichern") {
      const strukturiert = { ...ausFeldern($("#bearbeiten-abschnitte", el.leser)), unklar: (n.strukturiert && n.strukturiert.unklar) || [] };
      ordner.beschaeftigt = true; // kein doppeltes Absenden
      b.classList.add("laedt");
      try {
        const d = await api(`/api/notizen/${n.id}`, { methode: "PATCH", body: { strukturiert, rohtext: $("#bearbeiten-roh", el.leser).value } });
        ordner.notiz = d.notiz;
        ordner.bearbeiten = false;
        ordner.geaendert = false;
        await notizZeigen();
        ordnerListeZeigen();
        toast("Änderungen gespeichert.", "erfolg");
      } catch (err) {
        fehlerZeigen(err, "Speichern: ");
        b.classList.remove("laedt");
      } finally {
        ordner.beschaeftigt = false;
      }
      return;
    }
    if (was === "loeschen") {
      if (!(await frage("Notiz löschen?", `Die Notiz vom ${DATUM.format(new Date(n.erstellt_am))} (${n.kuerzel}) wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.`, "Löschen"))) return;
      ordner.beschaeftigt = true;
      try {
        await api(`/api/notizen/${n.id}`, { methode: "DELETE" });
        ordner.notiz = null;
        toast("Notiz gelöscht.");
        location.hash = `#/ordner/p/${n.patient_id}`;
      } catch (err) {
        fehlerZeigen(err, "Löschen: ");
      } finally {
        ordner.beschaeftigt = false;
      }
    }
  });

  let sucheTimer = 0;
  el.suche.addEventListener("input", () => {
    clearTimeout(sucheTimer);
    sucheTimer = setTimeout(() => {
      ordner.suche = el.suche.value.trim();
      ordnerListeZeigen();
    }, 300);
  });
  el.suche.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.suche.value) { el.suche.value = ""; ordner.suche = ""; ordnerListeZeigen(); }
  });

  // ==========================================================
  // 9 PDF-Export (jsPDF, im Browser – nichts verlässt das Gerät dafür)
  // ==========================================================
  function pdfExport(n) {
    if (!window.jspdf || !window.jspdf.jsPDF || !window.GabiPdf) { toast("PDF-Modul nicht geladen. Bitte Seite neu laden.", "fehler"); return; }
    try {
      const doc = window.GabiPdf.erstellen(n, { jsPDF: window.jspdf.jsPDF });
      doc.save(window.GabiPdf.dateiname(n));
      toast("PDF erstellt.", "erfolg", 2500);
    } catch (e) {
      toast(`PDF konnte nicht erstellt werden (${(e && e.name) || "Fehler"}).`, "fehler", 6000);
    }
  }

  // ==========================================================
  // 10 Navigation und Start
  // ==========================================================
  let letzterHash = location.hash;
  let routeLaeuft = false;

  async function route() {
    if (!zugang) return zugangZeigen();
    // Während die Nachfrage offen ist: weitere Seitenwechsel (z. B. zweimal „Zurück“) nicht ausführen
    if (routeLaeuft) { history.replaceState(null, "", letzterHash || "#/ordner"); return; }
    // Ungespeicherte Bearbeitung: erst fragen, sonst zurück zur Notiz (ohne neuen Seitenwechsel)
    if (ordner.bearbeiten && ordner.geaendert && location.hash !== letzterHash) {
      const ziel = location.hash;
      let weiter = false;
      routeLaeuft = true;
      try { weiter = await bearbeitenVerlassen(); } finally { routeLaeuft = false; }
      if (!weiter) { history.replaceState(null, "", letzterHash || "#/ordner"); return; }
      if (location.hash !== ziel) history.replaceState(null, "", ziel);
    }
    letzterHash = location.hash;
    const teile = location.hash.replace(/^#\/?/, "").split("/");
    const ansicht = teile[0] === "ordner" ? "ordner" : "aufnahme";
    el.zugang.hidden = true;
    el.ansichten.hidden = false;
    el.aufnahme.hidden = ansicht !== "aufnahme";
    el.ordner.hidden = ansicht !== "ordner";
    document.querySelectorAll(".ansicht").forEach((a) => a.classList.toggle("aktiv", a.dataset.ansicht === ansicht));
    if (ansicht === "aufnahme") {
      patientenLaden().catch(fehlerZeigen);
      return;
    }
    const notizId = teile[1] === "n" ? teile[2] || "" : "";
    el.ordnerBox.dataset.modus = notizId ? "notiz" : "liste";
    if (notizId) {
      ordner.notizId = notizId;
      notizZeigen().then(() => {
        if (!ordner.suche && ordner.notiz && ordner.notiz.id === notizId) ordner.patientId = ordner.notiz.patient_id;
        ordnerListeZeigen();
      });
    } else {
      ordner.notizId = "";
      ordner.notiz = null;
      ordner.patientId = teile[1] === "p" ? teile[2] || "" : "";
      el.leser.innerHTML = "";
      ordnerListeZeigen();
    }
    window.scrollTo(0, 0);
  }

  function starten() {
    entwurfLaden();
    if (entwurf.rohtext || entwurf.strukturiert) {
      entwurfZeigen();
      el.entwurfRoh.value = entwurf.rohtext;
      abschnitteZeigen();
      statusSetzen("Entwurf wiederhergestellt", "warn");
      if (entwurf.manuell) el.neuHinweis.hidden = true;
    }
    stationAktualisieren();
    mikrofonRechtBeobachten();
    route();
  }

  // ---------- Backend prüfen → normal oder Demo ----------
  const DEMO_TEXTE = {
    param: "Beispieldaten, nur in diesem Browser – nichts wird an einen Server gesendet.",
    "nicht-erreichbar": "Server nicht erreichbar. Beispieldaten, nur in diesem Browser – nichts wird gesendet.",
    "nicht-eingerichtet": "Server noch nicht eingerichtet. Beispieldaten, nur in diesem Browser – nichts wird gesendet.",
    "keine-adresse": "Server-Adresse fehlt (config.js). Beispieldaten, nur in diesem Browser.",
  };

  async function statusHolen() {
    const abbruch = new AbortController();
    const uhr = setTimeout(() => abbruch.abort(), 8000);
    try {
      const r = await fetch(`${API}/api/status`, { cache: "no-store", signal: abbruch.signal });
      if (!r.ok) return "nicht-erreichbar"; // auch 429/5xx: vorübergehend
      const d = (await r.json()) || {};
      const e = d.eingerichtet || {};
      // ältere Worker-Versionen kennen „bereit“ noch nicht
      const bereit = typeof d.bereit === "boolean" ? d.bereit : Boolean(e.zugang && e.supabase);
      return bereit ? "" : "nicht-eingerichtet";
    } catch {
      return "nicht-erreichbar";
    } finally {
      clearTimeout(uhr);
    }
  }

  async function backendPruefen() {
    if (DEMO_PARAM) return "param";
    if (!API && !lokal) return "keine-adresse";
    const erst = await statusHolen();
    if (erst !== "nicht-erreichbar") return erst;
    await new Promise((r) => setTimeout(r, 1500)); // kurzer Aussetzer? einmal nachfassen
    return statusHolen();
  }

  /** Gerät war schon im echten Betrieb (Code gespeichert): nie still in den Demo-Modus, sondern fragen. */
  function offlineZeigen() {
    el.ansichten.hidden = true;
    el.aufnahme.hidden = el.ordner.hidden = el.zugang.hidden = true;
    el.offline.hidden = false;
  }
  el.offlineErneut.addEventListener("click", () => location.reload());
  el.offlineDemo.addEventListener("click", () => { location.href = `${location.pathname}?demo=1#/aufnahme`; });

  function demoStarten(grund) {
    modus.demo = true;
    modus.grund = grund;
    demoApi = window.GabiDemo.erstelleApi();
    zugang = "demo"; // kein Zugangscode im Demo-Modus (wird nicht gespeichert)
    document.body.classList.add("demo");
    el.testbanner.textContent = "";
    el.testbanner.append(Object.assign(document.createElement("strong"), { textContent: "Demo-Modus" }), " – Beispieldaten, nichts geht an einen Server");
    el.demoText.textContent = DEMO_TEXTE[grund] || DEMO_TEXTE.param;
    el.demoVerbinden.hidden = grund === "param" || grund === "keine-adresse";
    el.demoBeenden.hidden = grund !== "param";
    el.demoBanner.hidden = false;
    el.demoDiktat.hidden = false;
    starten();
  }

  el.demoZuruecksetzen.addEventListener("click", async () => {
    if (!(await frage("Beispieldaten zurücksetzen?", "Alle Demo-Patienten und -Notizen in diesem Browser werden auf den Anfang zurückgesetzt.", "Zurücksetzen"))) return;
    demoApi.zuruecksetzen();
    entwurfLeeren();
    ordner.notiz = null;
    toast("Beispieldaten zurückgesetzt.");
    if (location.hash.startsWith("#/ordner/")) location.hash = "#/ordner"; else route();
  });
  el.demoVerbinden.addEventListener("click", () => location.reload());
  el.demoBeenden.addEventListener("click", () => {
    location.href = `${location.pathname}${location.hash}`;
  });

  window.addEventListener("hashchange", route);
  backendPruefen().then((grund) => {
    if (grund === "nicht-erreichbar" && zugang) offlineZeigen();
    else if (grund) demoStarten(grund);
    else if (zugang) starten();
    else zugangZeigen();
  });
})();
