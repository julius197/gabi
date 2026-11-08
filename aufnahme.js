/* Gabi – Aufnahme (Push-to-Talk): MediaRecorder → 16-kHz-Mono-WAV → Base64 für die Spracherkennung.
   Übernommen aus Gabi v1 (bewährt auf iPhone, Android, Mac): Formatwahl je Browser, Mikrofon-Hilfe je Gerät,
   Bildschirm wach halten, Wächter gegen hängende Aufnahmen. Keine Inhalte verlassen das Gerät ohne „senden“. */
(function (wurzel) {
  "use strict";

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
  const MIN_DAUER_MS = 700;
  const MAX_DAUER_S = 300;
  const WARNUNG_AB_S = MAX_DAUER_S - 30;

  const sitzung = {
    lesen(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    schreiben(k, v) { try { sessionStorage.setItem(k, v); } catch { /* privat/voll – egal */ } },
  };
  function formatWaehlen() {
    const gesperrt = (sitzung.lesen(FORMAT_GESPERRT) || "").split(",");
    const geht = (m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } };
    return FORMATE.find((m) => geht(m) && !gesperrt.includes(m)) || "";
  }
  function formatSperren(mime) {
    if (!mime) return;
    const alt = (sitzung.lesen(FORMAT_GESPERRT) || "").split(",").filter(Boolean);
    sitzung.schreiben(FORMAT_GESPERRT, [...new Set([...alt, mime])].join(","));
  }

  // ---------- Mikrofon-Freigabe: klare Anleitung je Gerät ----------
  const HILFE_SCHRITTE = IOS ? [
    "In der Adressleiste links auf „aA“ bzw. das Seiten-Symbol tippen.",
    "„Website-Einstellungen“ → „Mikrofon“ → „Erlauben“ wählen.",
    "Steht dort nichts: iPhone-Einstellungen → (Apps →) Safari → Mikrofon → „Erlauben“.",
    "Seite neu laden und das Mikrofon wieder gedrückt halten.",
  ] : ANDROID ? [
    "Links in der Adressleiste auf das Schloss- oder Regler-Symbol tippen.",
    "„Berechtigungen“ → „Mikrofon“ → „Zulassen“ wählen.",
    "Darf Chrome selbst nicht aufnehmen: Android-Einstellungen → Apps → Chrome → Berechtigungen → Mikrofon.",
    "Seite neu laden.",
  ] : MAC_SAFARI ? [
    "Menü „Safari“ → „Einstellungen für diese Website …“ öffnen.",
    "Bei „Mikrofon“ „Erlauben“ wählen.",
    "Mac-Systemeinstellungen → Datenschutz & Sicherheit → Mikrofon: Safari einschalten.",
    "Seite neu laden.",
  ] : [
    "Links in der Adressleiste auf das Schloss- oder Regler-Symbol klicken.",
    "Bei „Mikrofon“ „Zulassen“ wählen.",
    "Am Mac zusätzlich: Systemeinstellungen → Datenschutz & Sicherheit → Mikrofon → Browser einschalten.",
    "Seite neu laden.",
  ];

  /** Geht Aufnehmen hier überhaupt? null = ja, sonst eine Erklärung. */
  function moeglich() {
    if (!window.isSecureContext) return { titel: "Sichere Verbindung nötig", text: "Aufnehmen geht nur über https. Bitte https://gabi.automatilabs.de öffnen.", schritte: [] };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      return IN_APP
        ? { titel: "Bitte im Browser öffnen", text: "In dieser App kann ich nicht aufnehmen. Öffne den Link bitte in Safari (iPhone) oder Chrome (Android).", schritte: [] }
        : { titel: "Browser kann nicht aufnehmen", text: "Bitte einen aktuellen Browser nehmen: Safari (iPhone/Mac) oder Chrome.", schritte: [] };
    }
    return null;
  }

  /** Mikrofon-Recht beobachten (wo möglich): ruft beiAenderung("denied" | "granted" | "prompt"). */
  async function rechtBeobachten(beiAenderung) {
    try {
      const recht = await navigator.permissions.query({ name: "microphone" });
      beiAenderung(recht.state);
      recht.onchange = () => beiAenderung(recht.state);
    } catch { /* Abfrage nicht unterstützt (z. B. Firefox, ältere Safaris) – Fehler kommt dann beim Drücken */ }
  }

  const BLOCKIERT = { titel: "Mikrofon ist nicht freigegeben", text: "Ohne Freigabe kann ich nicht zuhören. So gibst du das Mikrofon frei:" };
  function fehlerAusMikrofon(e) {
    const name = (e && e.name) || "";
    if (["NotAllowedError", "SecurityError", "PermissionDeniedError"].includes(name)) return { text: "Das Mikrofon ist nicht freigegeben.", hilfe: { ...BLOCKIERT, schritte: HILFE_SCHRITTE } };
    if (["NotFoundError", "DevicesNotFoundError"].includes(name)) return { text: "Kein Mikrofon gefunden. Bitte Mikrofon oder Headset anschließen." };
    if (["NotReadableError", "TrackStartError", "AbortError"].includes(name)) return { text: "Das Mikrofon ist gerade belegt (z. B. Telefonat oder andere App). Bitte dort beenden und nochmal versuchen." };
    return { text: `Das Mikrofon konnte nicht starten (${name || "unbekannter Fehler"}). Bitte Seite neu laden.` };
  }

  async function mikrofonHolen() {
    // ungefiltertes Signal für die Spracherkennung, nur Lautstärke angleichen
    const wunsch = { audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true } };
    try {
      return await navigator.mediaDevices.getUserMedia(wunsch);
    } catch (e) {
      if (e && (e.name === "OverconstrainedError" || e.name === "TypeError")) return navigator.mediaDevices.getUserMedia({ audio: true });
      throw e;
    }
  }

  /**
   * Eine Aufnahme-Steuerung. Rückmeldungen:
   *  beiZustand(phase)  "startet" | "aufnahme" | "stoppt" | "bereit"
   *  beiPegel(0…1), beiZeit(sekunden)
   *  beiFertig({ holen, dauerMs })  holen() → Base64-WAV (einmal umgewandelt, beliebig oft abrufbar)
   *  beiFehler({ text, hilfe })     beiHinweis(text)
   */
  function erstelle({ beiZustand = () => {}, beiPegel = () => {}, beiZeit = () => {}, beiFertig = () => {}, beiFehler = () => {}, beiHinweis = () => {} } = {}) {
    const a = { phase: "bereit", losgelassen: false, verwerfen: false, rec: null, stream: null, ctx: null, analyser: null, teile: [], mime: "", start: 0, dauer: undefined, maxPegel: 0, sperre: null };
    const setze = (phase) => { a.phase = phase; beiZustand(phase); };

    async function wachHalten(an) {
      try {
        if (an && navigator.wakeLock && !a.sperre) {
          const s = await navigator.wakeLock.request("screen");
          s.addEventListener("release", () => { if (a.sperre === s) a.sperre = null; });
          if (a.phase === "aufnahme" && !a.sperre) a.sperre = s;
          else await s.release();
        } else if (!an && a.sperre) {
          const s = a.sperre;
          a.sperre = null;
          await s.release();
        }
      } catch { /* nicht unterstützt oder abgelehnt – Aufnahme geht trotzdem */ }
    }

    function pegelSchleife() {
      if (a.phase !== "aufnahme") { beiPegel(0); return; }
      if (a.analyser) {
        const d = new Uint8Array(a.analyser.fftSize);
        a.analyser.getByteTimeDomainData(d);
        let summe = 0;
        for (let i = 0; i < d.length; i++) { const v = (d[i] - 128) / 128; summe += v * v; }
        const pegel = Math.min(1, Math.sqrt(summe / d.length) * 4);
        a.maxPegel = Math.max(a.maxPegel, pegel);
        beiPegel(pegel);
      }
      requestAnimationFrame(pegelSchleife);
    }

    function zeitSchleife() {
      if (a.phase !== "aufnahme") return;
      const s = Math.floor((performance.now() - a.start) / 1000);
      beiZeit(s);
      if (s >= MAX_DAUER_S) {
        beiHinweis("Höchstens 5 Minuten am Stück – ich schicke die Aufnahme jetzt. Für mehr einfach nochmal gedrückt halten.");
        stopp();
        return;
      }
      setTimeout(zeitSchleife, 250);
    }

    function aufraeumen(ctxAuch) {
      if (a.stream) a.stream.getTracks().forEach((t) => t.stop());
      if (ctxAuch && a.ctx) a.ctx.close().catch(() => {});
      Object.assign(a, { rec: null, stream: null, analyser: null, ...(ctxAuch ? { ctx: null } : {}) });
      wachHalten(false);
    }

    async function start() {
      if (a.phase !== "bereit") return;
      const geht = moeglich();
      if (geht) { beiFehler({ text: geht.text, hilfe: geht }); return; }
      a.losgelassen = false;
      a.verwerfen = false;
      a.maxPegel = 0;
      a.dauer = undefined;
      const startZeit = performance.now();
      setze("startet");
      let ctx = null;
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; } // direkt in der Geste (Safari)
      let stream;
      try {
        stream = await mikrofonHolen();
      } catch (e) {
        if (ctx) ctx.close().catch(() => {});
        setze("bereit");
        beiFehler(fehlerAusMikrofon(e));
        return;
      }
      if (a.losgelassen) {
        // schon losgelassen (z. B. während der Freigabe-Abfrage) – nichts aufnehmen
        stream.getTracks().forEach((t) => t.stop());
        if (ctx) ctx.close().catch(() => {});
        setze("bereit");
        beiHinweis(performance.now() - startZeit > 700 ? "Das Mikrofon ist bereit. Jetzt gedrückt halten und sprechen." : "Halte das Mikrofon gedrückt, solange du sprichst.");
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
        setze("bereit");
        beiFehler({ text: `Die Aufnahme konnte nicht starten (${e.name || "Fehler"}). Bitte nochmal drücken.` });
        return;
      }
      a.teile = [];
      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) a.teile.push(ev.data); };
      rec.onstop = () => fertig(rec);
      rec.onerror = () => stopp();
      stream.getAudioTracks().forEach((t) => { t.onended = () => stopp(); }); // Telefonat, Bluetooth-Wechsel …
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
        setze("bereit");
        beiFehler({ text: `Die Aufnahme konnte nicht starten (${e.name || "Fehler"}). Bitte nochmal drücken.` });
        return;
      }
      Object.assign(a, { rec, stream, ctx, analyser, mime: rec.mimeType || mime, start: performance.now() });
      setze("aufnahme");
      try { if (navigator.vibrate) navigator.vibrate(18); } catch { /* egal */ }
      wachHalten(true);
      pegelSchleife();
      zeitSchleife();
      if (a.losgelassen) stopp();
    }

    /** Loslassen: Aufnahme beenden und senden. */
    function stopp() {
      a.losgelassen = true;
      if (a.phase === "aufnahme" && a.rec && a.rec.state !== "inactive") {
        const rec = a.rec;
        a.dauer = performance.now() - a.start;
        setze("stoppt");
        try { rec.stop(); } catch { fertig(rec); }
        // Wächter: kommt „stop“ nie an, trotzdem abschließen statt hängen zu bleiben
        setTimeout(() => { if (a.rec === rec && a.phase === "stoppt") fertig(rec); }, 4000);
      }
    }

    /** Abbrechen: Aufnahme beenden und verwerfen. */
    function abbrechen() {
      a.verwerfen = true;
      stopp();
    }

    function fertig(rec) {
      if (a.rec !== rec) return; // schon abgeschlossen (z. B. durch den Wächter)
      const { ctx, teile, mime, maxPegel, verwerfen } = a;
      const dauer = a.dauer ?? performance.now() - a.start;
      aufraeumen(false);
      a.ctx = null;
      setze("bereit");
      beiZeit(0);
      const schliessen = () => { if (ctx) ctx.close().catch(() => {}); };
      if (verwerfen) { schliessen(); beiHinweis("Aufnahme verworfen."); return; }
      if (dauer < MIN_DAUER_MS) { schliessen(); beiHinweis("Zu kurz – halte das Mikrofon gedrückt, solange du sprichst."); return; }
      if (ctx && ctx.state === "running" && maxPegel < 0.015) { schliessen(); beiFehler({ text: "Es kam kein Ton an. Bitte Mikrofon prüfen (stumm? anderes Gerät?) und nochmal versuchen." }); return; }
      if (!teile.length) { schliessen(); beiFehler({ text: "Die Aufnahme war leer. Bitte nochmal gedrückt halten und sprechen." }); return; }
      const blob = new Blob(teile, { type: mime || "audio/webm" });
      let b64 = null;
      let laeuft = null;
      const holen = () => {
        if (b64) return Promise.resolve(b64);
        if (!laeuft) {
          laeuft = zuWavBase64(blob, ctx)
            .then((x) => { b64 = x; return x; })
            .catch(() => {
              formatSperren(mime);
              const f = new Error("Die Aufnahme konnte nicht gelesen werden. Bitte nochmal aufnehmen – ich nehme jetzt ein anderes Format.");
              f.keineWiederholung = true;
              throw f;
            })
            .finally(() => { schliessen(); laeuft = null; });
        }
        return laeuft;
      };
      beiFertig({ holen, dauerMs: dauer });
    }

    return {
      start, stopp, abbrechen,
      get phase() { return a.phase; },
    };
  }

  // ---------- Audio → WAV (16 kHz mono) → Base64: in jedem Browser gleich, Whisper liest es sicher ----------
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
      for (let i = 0; i < laenge; i++) { // Mittelwert je Fenster = einfacher Tiefpass
        const a = Math.floor(i * faktor);
        const b = Math.min(n, Math.floor((i + 1) * faktor));
        let s = 0;
        for (let j = a; j < b; j++) s += mono[j];
        aus[i] = b > a ? s / (b - a) : mono[a] || 0;
      }
    } else {
      for (let i = 0; i < laenge; i++) { // lineare Interpolation (selten: Quelle < 16 kHz)
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
      r.onerror = () => fehler(new Error("Die Aufnahme konnte nicht gelesen werden."));
      r.readAsDataURL(blob);
    });
  }

  async function zuWavBase64(blob, ctx) {
    let eigener = null;
    if (!ctx || ctx.state === "closed") ctx = eigener = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const audio = await dekodieren(ctx, await blob.arrayBuffer());
      return await alsBase64(wavBlob(aufMono16k(audio), 16000));
    } finally {
      if (eigener) eigener.close().catch(() => {});
    }
  }

  wurzel.GabiAufnahme = { moeglich, rechtBeobachten, erstelle, HILFE_SCHRITTE, BLOCKIERT, IOS, ANDROID, MAX_DAUER_S, WARNUNG_AB_S };
})(window);
