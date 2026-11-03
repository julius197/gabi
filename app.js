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
  const ABSCHNITTE = [
    ["befund", "Befund", "Untersuchung, Tests, Schmerz, Beobachtung"],
    ["massnahmen", "Maßnahmen", "Was in der Behandlung gemacht wurde"],
    ["verlauf", "Verlauf", "Veränderung, Reaktion, weiteres Vorgehen"],
    ["hausaufgaben", "Hausaufgaben", "Übungen für zu Hause"],
  ];
  const MIN_DAUER_MS = 800;
  const MAX_DAUER_S = 300;
  const SPEICHER = { zugang: "gabi.zugang", patient: "gabi.patient", entwurf: "gabi.entwurf" };

  const $ = (sel, wurzel = document) => wurzel.querySelector(sel);
  const el = {
    ansichten: $("#ansichten"),
    zugang: $("#ansicht-zugang"), aufnahme: $("#ansicht-aufnahme"), ordner: $("#ansicht-ordner"),
    zugangForm: $("#zugang-form"), zugangCode: $("#zugang-code"), zugangFehler: $("#zugang-fehler"), zugangKnopf: $("#zugang-knopf"),
    patientWahl: $("#patient-wahl"), patientNeu: $("#patient-neu"),
    dialogPatient: $("#dialog-patient"), patientForm: $("#patient-form"), patientKuerzel: $("#patient-kuerzel"),
    patientPseudonym: $("#patient-pseudonym"), patientFehler: $("#patient-fehler"), patientAnlegen: $("#patient-anlegen"),
    station: $("#station"), anweisung: $("#anweisung"), buehne: $("#buehne"), ptt: $("#ptt"), zeit: $("#zeit"),
    entwurf: $("#entwurf"), entwurfStatus: $("#entwurf-status"), neuHinweis: $("#neu-hinweis"),
    entwurfAbschnitte: $("#entwurf-abschnitte"), entwurfUnklar: $("#entwurf-unklar"), entwurfRoh: $("#entwurf-roh"),
    entwurfTranskript: $("#entwurf-transkript"), speichern: $("#speichern"), verwerfen: $("#verwerfen"),
    ordnerBox: $("#ordner"), suche: $("#suche"), ordnerKopf: $("#ordner-kopf"), ordnerListe: $("#ordner-liste"), leser: $("#leser"),
    toasts: $("#toasts"),
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
  const UHR = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
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

  function frage(titel, text, ja = "OK") {
    return new Promise((fertig) => {
      el.frageTitel.textContent = titel;
      el.frageText.textContent = text;
      el.frageJa.textContent = ja;
      const schliessen = (antwort) => {
        el.frageJa.onclick = el.frageNein.onclick = el.dialogFrage.oncancel = null;
        el.dialogFrage.close();
        fertig(antwort);
      };
      el.frageJa.onclick = () => schliessen(true);
      el.frageNein.onclick = () => schliessen(false);
      el.dialogFrage.oncancel = (e) => { e.preventDefault(); schliessen(false); };
      el.dialogFrage.showModal();
    });
  }

  // ==========================================================
  // 2 API (Cloudflare Worker – nie Schlüssel im Browser)
  // ==========================================================
  let zugang = speicherLesen(localStorage, SPEICHER.zugang) || "";
  class Abbruch extends Error {}

  async function api(pfad, { methode = "GET", body, text, code = zugang } = {}) {
    const headers = { "X-Gabi-Zugang": code };
    let inhalt;
    if (text !== undefined) { headers["Content-Type"] = "text/plain"; inhalt = text; }
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; inhalt = JSON.stringify(body); }
    let r;
    try {
      r = await fetch(`${API}${pfad}`, { method: methode, headers, body: inhalt, cache: "no-store" });
    } catch {
      throw new Error("Keine Verbindung zum Server. Bitte Internet prüfen.");
    }
    if (r.status === 401 && code === zugang) {
      zugangVergessen();
      zugangZeigen("Zugangscode ist nicht mehr gültig. Bitte neu eingeben.");
      throw new Abbruch();
    }
    const daten = r.status === 204 ? null : await r.json().catch(() => null);
    if (!r.ok) throw new Error((daten && daten.fehler) || `Fehler ${r.status}`);
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
    const gewaehlt = entwurf.patientId || speicherLesen(localStorage, SPEICHER.patient) || "";
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
    speicherSchreiben(localStorage, SPEICHER.patient, entwurf.patientId || null);
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
  // ==========================================================
  const aufnahme = { phase: "bereit", losgelassen: false, start: 0, rec: null, stream: null, ctx: null, analyser: null, teile: [], mime: "", maxPegel: 0 };
  let offeneTranskripte = 0;
  let kette = Promise.resolve();

  function stationSetzen(zustand, text) {
    el.station.dataset.zustand = zustand;
    if (text) el.anweisung.textContent = text;
  }

  function bereitText() {
    if (offeneTranskripte > 0) return "Sprache wird erkannt …";
    return entwurf.rohtext ? "Gedrückt halten, um zu ergänzen" : "Gedrückt halten und sprechen";
  }

  function mikrofonFehler(e) {
    if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) return "Kein Mikrofon-Zugriff. Bitte im Browser erlauben (Adressleiste → Mikrofon) und neu laden.";
    if (e && e.name === "NotFoundError") return "Kein Mikrofon gefunden.";
    return `Mikrofon konnte nicht gestartet werden (${(e && e.name) || "Fehler"}).`;
  }

  async function aufnahmeStarten() {
    if (aufnahme.phase !== "bereit") return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      toast("Dieser Browser kann nicht aufnehmen. Bitte Safari oder Chrome verwenden.", "fehler", 6000);
      return;
    }
    aufnahme.phase = "startet";
    aufnahme.losgelassen = false;
    aufnahme.maxPegel = 0;
    aufnahme.dauer = undefined;
    const startZeit = performance.now();
    stationSetzen("startet", "Mikrofon startet …");
    let ctx = null;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; } // direkt in der Geste (Safari)
    let stream;
    try {
      // wie Notara: ungefiltertes Signal für die Spracherkennung, nur Lautstärke angleichen
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
    } catch (e) {
      if (ctx) ctx.close().catch(() => {});
      aufnahme.phase = "bereit";
      stationSetzen("bereit", bereitText());
      toast(mikrofonFehler(e), "fehler", 8000);
      return;
    }
    if (aufnahme.losgelassen) {
      // Schon losgelassen (z. B. während der Mikrofon-Freigabe) – nichts aufnehmen
      stream.getTracks().forEach((t) => t.stop());
      if (ctx) ctx.close().catch(() => {});
      aufnahme.phase = "bereit";
      stationSetzen("bereit", bereitText());
      const langeGewartet = performance.now() - startZeit > 700;
      toast(langeGewartet ? "Mikrofon ist bereit. Jetzt gedrückt halten und sprechen." : "Bitte gedrückt halten, bis der Knopf rot ist.", "", 4000);
      return;
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || "";
    let rec;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      if (ctx) ctx.close().catch(() => {});
      aufnahme.phase = "bereit";
      stationSetzen("bereit", bereitText());
      toast(`Aufnahme konnte nicht starten (${e.name || "Fehler"}).`, "fehler", 6000);
      return;
    }
    aufnahme.teile = [];
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) aufnahme.teile.push(ev.data); };
    rec.onstop = aufnahmeFertig;
    let analyser = null;
    try {
      if (ctx.state === "suspended") await ctx.resume();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      ctx.createMediaStreamSource(stream).connect(analyser);
    } catch { analyser = null; }
    Object.assign(aufnahme, { rec, stream, ctx, analyser, mime: rec.mimeType || mime, start: performance.now(), phase: "aufnahme" });
    rec.start();
    stationSetzen("aufnahme", "Aufnahme läuft – loslassen zum Erkennen");
    pegelSchleife();
    zeitSchleife();
    if (aufnahme.losgelassen) aufnahmeStoppen();
  }

  function aufnahmeStoppen() {
    aufnahme.losgelassen = true;
    if (aufnahme.phase === "aufnahme" && aufnahme.rec && aufnahme.rec.state !== "inactive") {
      aufnahme.phase = "stoppt";
      aufnahme.dauer = performance.now() - aufnahme.start;
      aufnahme.rec.stop();
    }
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
    if (aufnahme.phase !== "aufnahme") return;
    const s = Math.floor((performance.now() - aufnahme.start) / 1000);
    el.zeit.textContent = mmss(s);
    if (s >= MAX_DAUER_S) {
      toast("Höchstens 5 Minuten am Stück – Aufnahme wird erkannt. Für mehr einfach nochmal drücken.", "warn", 6000);
      aufnahmeStoppen();
      return;
    }
    setTimeout(zeitSchleife, 250);
  }

  function aufnahmeFertig() {
    const { stream, ctx, teile, mime, maxPegel } = aufnahme;
    const dauer = aufnahme.dauer ?? performance.now() - aufnahme.start;
    stream.getTracks().forEach((t) => t.stop());
    Object.assign(aufnahme, { phase: "bereit", rec: null, stream: null, analyser: null, ctx: null });
    el.buehne.style.setProperty("--pegel", "0");
    el.zeit.textContent = "0:00";
    if (dauer < MIN_DAUER_MS) {
      if (ctx) ctx.close().catch(() => {});
      stationSetzen("bereit", bereitText());
      toast("Zu kurz – bitte gedrückt halten, solange Sie sprechen.", "", 3500);
      return;
    }
    if (ctx && ctx.state === "running" && maxPegel < 0.015) {
      ctx.close().catch(() => {});
      stationSetzen("bereit", bereitText());
      toast("Es kam kein Ton an. Bitte Mikrofon prüfen.", "warn", 5000);
      return;
    }
    const blob = new Blob(teile, { type: mime || "audio/webm" });
    offeneTranskripte++;
    entwurfZeigen();
    statusSetzen("Sprache wird erkannt …", "laeuft");
    stationSetzen("bereit", bereitText());
    kette = kette
      .then(async () => {
        const b64 = await zuWavBase64(blob, ctx);
        const d = await api("/api/transkribieren", { methode: "POST", text: b64 });
        const text = String(d.text || "").trim();
        if (!text) { toast("Kein Text erkannt. Bitte deutlicher oder näher am Mikrofon sprechen.", "warn", 5000); return; }
        transkriptAnhaengen(text);
      })
      .catch((e) => fehlerZeigen(e, "Spracherkennung: "))
      .finally(() => {
        if (ctx) ctx.close().catch(() => {});
        offeneTranskripte--;
        if (aufnahme.phase === "bereit") stationSetzen("bereit", bereitText());
        if (offeneTranskripte === 0) nachTranskript();
      });
  }

  // Zeiger: gedrückt halten (Maus, Finger, Stift). Zeiger wird festgehalten, damit Loslassen immer ankommt.
  el.ptt.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    try { el.ptt.setPointerCapture(e.pointerId); } catch { /* egal */ }
    aufnahmeStarten();
  });
  for (const art of ["pointerup", "pointercancel", "lostpointercapture"]) el.ptt.addEventListener(art, () => aufnahmeStoppen());
  el.ptt.addEventListener("contextmenu", (e) => e.preventDefault());
  // Tastatur: Leertaste oder Enter gedrückt halten
  el.ptt.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); aufnahmeStarten(); }
    else if (e.key === " " || e.key === "Enter") e.preventDefault();
  });
  el.ptt.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); aufnahmeStoppen(); } });
  el.ptt.addEventListener("click", (e) => e.preventDefault());
  window.addEventListener("blur", () => aufnahmeStoppen());

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
  const entwurf = { patientId: "", rohtext: "", strukturiert: null, manuell: false, version: 0, strukturVersion: 0 };
  let strukturLaeuft = false;

  const leereNotiz = () => ({ befund: [], massnahmen: [], verlauf: [], hausaufgaben: [], unklar: [] });

  function entwurfMerken() {
    const { patientId, rohtext, strukturiert, manuell } = entwurf;
    speicherSchreiben(sessionStorage, SPEICHER.entwurf, rohtext || strukturiert ? JSON.stringify({ patientId, rohtext, strukturiert, manuell }) : null);
  }

  function entwurfLaden() {
    try {
      const d = JSON.parse(speicherLesen(sessionStorage, SPEICHER.entwurf) || "null");
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
    if (!entwurf.rohtext) { if (!entwurf.strukturiert) statusSetzen(""); return; }
    if (entwurf.version === entwurf.strukturVersion) return;
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
    statusSetzen("Notiz wird geschrieben …", "laeuft");
    knoepfeAktualisieren();
    try {
      const d = await api("/api/strukturieren", { methode: "POST", body: { rohtext: text } });
      entwurf.strukturiert = d.strukturiert;
      entwurf.strukturVersion = version;
      entwurf.manuell = false;
      el.neuHinweis.hidden = true;
      abschnitteZeigen();
      entwurfMerken();
      statusSetzen("Entwurf fertig – bitte prüfen", "gruen");
    } catch (e) {
      statusSetzen("Notiz nicht erstellt", "rot");
      fehlerZeigen(e, "Notiz: ");
      if (!entwurf.strukturiert) abschnitteZeigen();
    } finally {
      strukturLaeuft = false;
      knoepfeAktualisieren();
      if (entwurf.version !== version && offeneTranskripte === 0 && !entwurf.manuell) strukturieren(); // neuer Text kam dazu
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

  function knoepfeAktualisieren() {
    const hatInhalt = Boolean(entwurf.rohtext.trim()) || Boolean(entwurf.strukturiert && ABSCHNITTE.some(([k]) => entwurf.strukturiert[k].length));
    el.speichern.disabled = !hatInhalt || strukturLaeuft || offeneTranskripte > 0;
    const p = patienten.find((x) => x.id === entwurf.patientId);
    el.speichern.textContent = p ? `Speichern bei ${p.kuerzel}` : "Speichern";
  }

  function entwurfLeeren() {
    Object.assign(entwurf, { rohtext: "", strukturiert: null, manuell: false, version: 0, strukturVersion: 0 });
    el.entwurfRoh.value = "";
    el.entwurfAbschnitte.innerHTML = "";
    unklarZeigen(el.entwurfUnklar, []);
    el.neuHinweis.hidden = true;
    el.entwurfTranskript.open = false;
    el.entwurf.hidden = true;
    document.body.classList.remove("mit-entwurf");
    statusSetzen("");
    entwurfMerken();
    stationSetzen(el.station.dataset.zustand, bereitText());
    knoepfeAktualisieren();
  }

  el.verwerfen.addEventListener("click", async () => {
    if (await frage("Entwurf verwerfen?", "Transkript und Notiz-Entwurf werden gelöscht.", "Verwerfen")) {
      entwurfLeeren();
      toast("Entwurf verworfen.");
    }
  });

  el.speichern.addEventListener("click", async () => {
    if (!entwurf.patientId) {
      toast("Bitte zuerst einen Test-Patienten wählen oder anlegen.", "warn", 4500);
      el.patientWahl.focus();
      return;
    }
    const strukturiert = entwurf.strukturiert
      ? { ...ausFeldern(el.entwurfAbschnitte), unklar: entwurf.strukturiert.unklar || [] }
      : leereNotiz();
    el.speichern.classList.add("laedt");
    try {
      const d = await api("/api/notizen", { methode: "POST", body: { patient_id: entwurf.patientId, rohtext: entwurf.rohtext, strukturiert } });
      entwurfLeeren();
      patientenLaden().catch(() => {});
      toast(`Gespeichert bei ${d.notiz.kuerzel}.`, "erfolg", 5000, { text: "Ansehen", los: () => { location.hash = `#/ordner/n/${d.notiz.id}`; } });
    } catch (e) {
      fehlerZeigen(e, "Speichern: ");
    } finally {
      el.speichern.classList.remove("laedt");
    }
  });

  // ==========================================================
  // 8 Notizordner: Patienten → Notizen → Detail, Suche, Bearbeiten
  // ==========================================================
  const ordner = { patientId: "", notizId: "", suche: "", notizen: [], notiz: null, bearbeiten: false };
  const PFEIL = '<svg class="eintrag-pfeil" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const ZURUECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';

  function notizTitel(n) {
    const s = n.strukturiert || {};
    return (s.befund && s.befund[0]) || (s.massnahmen && s.massnahmen[0]) || (s.verlauf && s.verlauf[0]) || (s.hausaufgaben && s.hausaufgaben[0]) || "(ohne Inhalt)";
  }

  function notizListeHtml(liste, mitKuerzel) {
    if (!liste.length) return `<p class="ordner-nichts">${ordner.suche ? "Keine Notiz gefunden." : "Noch keine Notizen."}</p>`;
    return liste.map((n) => `
      <a class="eintrag${n.id === ordner.notizId ? " aktiv" : ""}" href="#/ordner/n/${n.id}">
        <span class="eintrag-titel">${esc(notizTitel(n))}</span>
        <span class="eintrag-unter">${mitKuerzel ? `${esc(n.kuerzel)} · ` : ""}${esc(zeitText(n.erstellt_am))}${n.strukturiert && n.strukturiert.unklar && n.strukturiert.unklar.length ? " · unklare Stellen" : ""}</span>
        <span class="eintrag-rechts">${PFEIL}</span>
      </a>`).join("");
  }

  async function ordnerListeZeigen() {
    const box = el.ordnerListe;
    try {
      if (ordner.suche) {
        el.ordnerKopf.innerHTML = `<h2>Suchergebnis</h2>`;
        const d = await api(`/api/notizen?q=${encodeURIComponent(ordner.suche)}`);
        ordner.notizen = d.notizen;
        el.ordnerKopf.innerHTML = `<h2>${d.notizen.length} ${d.notizen.length === 1 ? "Notiz" : "Notizen"} gefunden</h2>`;
        box.innerHTML = notizListeHtml(d.notizen, true);
      } else if (ordner.patientId) {
        if (!patienten.length) await patientenLaden();
        const p = patienten.find((x) => x.id === ordner.patientId);
        el.ordnerKopf.innerHTML = `<a class="zurueck" href="#/ordner">${ZURUECK}Alle Test-Patienten</a><span class="chip gruen">${esc(p ? p.kuerzel : "")}</span>`;
        const d = await api(`/api/notizen?patient_id=${encodeURIComponent(ordner.patientId)}`);
        ordner.notizen = d.notizen;
        box.innerHTML = notizListeHtml(d.notizen, false);
      } else {
        await patientenLaden();
        el.ordnerKopf.innerHTML = `<h2>Test-Patienten</h2>`;
        box.innerHTML = patienten.length
          ? patienten.map((p) => `
            <a class="eintrag" href="#/ordner/p/${p.id}">
              <span class="eintrag-titel">${esc(p.kuerzel)}${p.pseudonym ? ` <span class="eintrag-zusatz">· ${esc(p.pseudonym)}</span>` : ""}</span>
              <span class="eintrag-unter">${p.anzahl} ${p.anzahl === 1 ? "Notiz" : "Notizen"}</span>
              <span class="eintrag-rechts">${PFEIL}</span>
            </a>`).join("")
          : `<p class="ordner-nichts">Noch kein Test-Patient. In „Aufnahme“ über „Neu“ anlegen.</p>`;
      }
    } catch (e) {
      fehlerZeigen(e);
      box.innerHTML = `<p class="ordner-nichts">Konnte nicht geladen werden.</p>`;
    }
  }

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
      }
    } catch (e) {
      fehlerZeigen(e);
      el.leser.innerHTML = `<p class="leser-leer">Notiz nicht gefunden.</p>`;
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

  el.leser.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-leser]");
    if (!b || !ordner.notiz) return;
    const n = ordner.notiz;
    const was = b.dataset.leser;
    if (was === "pdf") return pdfExport(n);
    if (was === "bearbeiten") { ordner.bearbeiten = true; return notizZeigen(); }
    if (was === "abbrechen") { ordner.bearbeiten = false; return notizZeigen(); }
    if (was === "sichern") {
      const strukturiert = { ...ausFeldern($("#bearbeiten-abschnitte", el.leser)), unklar: (n.strukturiert && n.strukturiert.unklar) || [] };
      b.classList.add("laedt");
      try {
        const d = await api(`/api/notizen/${n.id}`, { methode: "PATCH", body: { strukturiert, rohtext: $("#bearbeiten-roh", el.leser).value } });
        ordner.notiz = d.notiz;
        ordner.bearbeiten = false;
        await notizZeigen();
        ordnerListeZeigen();
        toast("Änderungen gespeichert.", "erfolg");
      } catch (err) {
        fehlerZeigen(err, "Speichern: ");
        b.classList.remove("laedt");
      }
      return;
    }
    if (was === "loeschen") {
      if (!(await frage("Notiz löschen?", `Die Notiz vom ${DATUM.format(new Date(n.erstellt_am))} (${n.kuerzel}) wird endgültig gelöscht.`, "Löschen"))) return;
      try {
        await api(`/api/notizen/${n.id}`, { methode: "DELETE" });
        ordner.notiz = null;
        toast("Notiz gelöscht.");
        location.hash = `#/ordner/p/${n.patient_id}`;
      } catch (err) {
        fehlerZeigen(err, "Löschen: ");
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

  // ==========================================================
  // 9 PDF-Export (jsPDF, im Browser – nichts verlässt das Gerät dafür)
  // ==========================================================
  // Standard-Schriften im PDF kennen nur Westeuropäisch (WinAnsi) – Zeichen außerhalb umschreiben
  const PDF_ERSATZ = { "→": "->", "←": "<-", "↑": "hoch", "↓": "runter", "≤": "<=", "≥": ">=", "≈": "~", "‑": "-", "−": "-", "✓": "ok", " ": " ", " ": " " };
  function pdfText(t) {
    return String(t ?? "")
      .replace(/[→←↑↓≤≥≈‑−✓  ]/g, (c) => PDF_ERSATZ[c])
      .replace(/[^\x20-\x7e -ÿ–—‘’‚“”„•…€\n]/g, "");
  }

  function pdfExport(n) {
    if (!window.jspdf || !window.jspdf.jsPDF) { toast("PDF-Modul nicht geladen. Bitte Seite neu laden.", "fehler"); return; }
    const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    const B = 210, RAND = 20, BREITE = B - 2 * RAND, UNTEN = 297 - 22;
    const datum = new Date(n.erstellt_am);
    let y = 22;

    // Kopf: PhysioWorks, Datum, Kürzel
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(35, 44, 51);
    doc.text("PhysioWorks", RAND, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(86, 99, 107);
    doc.text("Behandlungsnotiz", RAND, y + 7);
    doc.setFontSize(10.5); doc.setTextColor(35, 44, 51);
    doc.text(`Datum: ${DATUM.format(datum)}, ${UHR.format(datum)} Uhr`, B - RAND, y - 1, { align: "right" });
    doc.text(pdfText(`Kürzel: ${n.kuerzel}`), B - RAND, y + 5, { align: "right" });
    if (n.geaendert_am) {
      doc.setFontSize(9); doc.setTextColor(135, 147, 154);
      doc.text(`bearbeitet ${DATUM.format(new Date(n.geaendert_am))}`, B - RAND, y + 10, { align: "right" });
    }
    y += 15;
    doc.setDrawColor(16, 168, 75); doc.setLineWidth(0.8); doc.line(RAND, y, B - RAND, y);
    y += 10;

    const neueSeite = (bedarf) => { if (y + bedarf > UNTEN) { doc.addPage(); y = 22; } };
    const s = n.strukturiert || leereNotiz();
    const abschnitt = (titel, punkte, farbe) => {
      neueSeite(16);
      doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.setTextColor(...(farbe || [35, 44, 51]));
      doc.text(pdfText(titel), RAND, y);
      y += 6.5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(11);
      if (!punkte || !punkte.length) {
        doc.setTextColor(135, 147, 154);
        doc.text("– nichts notiert –", RAND + 5, y);
        y += 9;
        return;
      }
      doc.setTextColor(35, 44, 51);
      for (const p of punkte) {
        const zeilen = doc.splitTextToSize(pdfText(p), BREITE - 6);
        neueSeite(zeilen.length * 5.2 + 1);
        doc.text("•", RAND + 1, y);
        doc.text(zeilen, RAND + 6, y);
        y += zeilen.length * 5.2 + 1.6;
      }
      y += 5;
    };
    for (const [key, titel] of ABSCHNITTE) abschnitt(titel, s[key]);
    if (s.unklar && s.unklar.length) abschnitt("Bitte prüfen (unklare Stellen)", s.unklar, [138, 83, 0]);

    // Fuß auf jeder Seite
    const seiten = doc.getNumberOfPages();
    for (let i = 1; i <= seiten; i++) {
      doc.setPage(i);
      doc.setDrawColor(224, 230, 227); doc.setLineWidth(0.3); doc.line(RAND, 297 - 16, B - RAND, 297 - 16);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(135, 147, 154);
      doc.text("TESTVERSION – nur Testdaten · KI-Entwurf, fachlich zu prüfen · erstellt mit Gabi", RAND, 297 - 11);
      doc.text(`Seite ${i} von ${seiten}`, B - RAND, 297 - 11, { align: "right" });
    }
    const tag = `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}-${String(datum.getDate()).padStart(2, "0")}`;
    doc.setProperties({ title: `Behandlungsnotiz ${n.kuerzel} ${tag}`, subject: "Testversion – nur Testdaten", creator: "Gabi (PhysioWorks)" });
    doc.save(`PhysioWorks_${n.kuerzel}_${tag}.pdf`);
  }

  // ==========================================================
  // 10 Navigation und Start
  // ==========================================================
  function route() {
    if (!zugang) return zugangZeigen();
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
    stationSetzen("bereit", bereitText());
    route();
  }

  window.addEventListener("hashchange", route);
  if (!API && !lokal) {
    zugangZeigen("Server-Adresse fehlt (config.js). Bitte Einrichtung prüfen.");
    el.zugangKnopf.disabled = true;
  } else if (zugang) {
    starten();
  } else {
    zugangZeigen();
  }
})();
