/* Gabi – Demo-Modus: die App läuft komplett im Browser mit erfundenen Testdaten. Nichts wird an einen Server gesendet.
   Aktiv mit ?demo=1 oder automatisch, wenn kein Backend erreichbar oder eingerichtet ist.
   Dieselben Testdaten nutzt worker/dev/seed_erzeugen.mjs für supabase/seed_test.sql.
   NUR TESTDATEN: alle Patienten, Kürzel und Notizen sind erfunden. */
(function (wurzel, fabrik) {
  const modul = fabrik();
  if (typeof module === "object" && module.exports) module.exports = modul;
  else wurzel.GabiDemo = modul;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TAG_MS = 86400000;
  const ABSCHNITTE = ["befund", "massnahmen", "verlauf", "hausaufgaben"];
  const MAX_ROHTEXT = 50000;
  const DEMO_HINWEIS = "Demo-Modus: Beispiel-Zuordnung ohne KI – bitte prüfen";

  // ------------------------------------------------------------------
  // Erfundene Test-Patienten und Notizen (nur Kürzel/Pseudonyme)
  // ------------------------------------------------------------------
  const PATIENTEN = [
    { id: "7e3c1a52-0001-4000-8000-000000000001", kuerzel: "TP-01", pseudonym: "Testfall Knie rechts (fiktiv)" },
    { id: "7e3c1a52-0002-4000-8000-000000000002", kuerzel: "TP-02", pseudonym: "Testfall Schulter links (fiktiv)" },
    { id: "7e3c1a52-0003-4000-8000-000000000003", kuerzel: "TP-03", pseudonym: "Testfall LWS (fiktiv)" },
  ];

  const NOTIZEN = [
    {
      id: "7e3c1a52-0101-4000-8000-000000000101", kuerzel: "TP-01", tageZurueck: 9, uhrzeit: "08:30",
      rohtext: "Patientin kommt zur dritten Behandlung nach vorderer Kreuzbandplastik rechts. Schmerz in Ruhe bei zwei, bei Belastung bei fünf. Flexion aktiv bis 90 Grad, Extension minus 5 Grad. Leichte Schwellung am medialen Gelenkspalt. Wir haben 20 Minuten Lymphdrainage gemacht, dann Patellamobilisation und Quadrizepsaktivierung im Sitzen. Für zu Hause Quadrizeps anspannen, dreimal zehn Wiederholungen, zweimal täglich. Nächstes Mal Gangschule.",
      strukturiert: {
        befund: ["Z. n. vorderer Kreuzbandplastik rechts, 3. Behandlung (laut Notiz)", "Pat.: Schmerz NRS 2 in Ruhe, NRS 5 bei Belastung", "Flexion Knie rechts aktiv bis 90°, Extension -5°", "Leichte Schwellung medialer Gelenkspalt"],
        massnahmen: ["Manuelle Lymphdrainage, 20 min", "Patellamobilisation", "Quadrizepsaktivierung im Sitzen"],
        verlauf: ["Nächster Termin: Gangschule"],
        hausaufgaben: ["Quadrizeps anspannen 3 × 10 Wdh., 2 × täglich"],
        unklar: [],
      },
    },
    {
      id: "7e3c1a52-0102-4000-8000-000000000102", kuerzel: "TP-01", tageZurueck: 2, uhrzeit: "16:10",
      rohtext: "Knie rechts, fünfte Behandlung. Patientin berichtet, Treppensteigen geht besser. Flexion jetzt bis 110 Grad, Extension null. Schwellung deutlich weniger. Gangschule ohne Unterarmgehstützen, dann Beinpresse mit 30 Kilo, dreimal zwölf. Zu Hause Bridging und Wandsitzen, jeweils dreimal fünfzehn, täglich. In zwei Wochen Kontrolle beim Operateur.",
      strukturiert: {
        befund: ["Flexion Knie rechts bis 110°, Extension 0°"],
        massnahmen: ["Gangschule ohne Unterarmgehstützen", "Beinpresse 30 kg, 3 × 12 Wdh."],
        verlauf: ["Pat.: Treppensteigen geht besser", "Schwellung deutlich weniger", "Kontrolle beim Operateur in 2 Wochen"],
        hausaufgaben: ["Bridging 3 × 15 Wdh., täglich", "Wandsitzen 3 × 15 (unklar), täglich"],
        unklar: ["„dreimal fünfzehn“ beim Wandsitzen unklar (Sekunden oder Wiederholungen)"],
      },
    },
    {
      id: "7e3c1a52-0201-4000-8000-000000000201", kuerzel: "TP-02", tageZurueck: 12, uhrzeit: "10:15",
      rohtext: "Schulter links, Erstbefund. Ärztliche Diagnose Impingement-Syndrom. Patient klagt über Schmerzen beim Überkopfarbeiten, NRS sechs. Abduktion aktiv bis 100 Grad, schmerzhafter Bogen zwischen 70 und 110 Grad. Außenrotation kraftgemindert. Manuelle Therapie am Glenohumeralgelenk, 15 Minuten, danach Skapulastabilisation mit Theraband. Hausaufgabe Pendelübungen dreimal täglich.",
      strukturiert: {
        befund: ["Ärztliche Diagnose: Impingement-Syndrom Schulter links (laut Notiz)", "Pat.: Schmerz bei Überkopfarbeit, NRS 6", "Abduktion aktiv bis 100°, schmerzhafter Bogen 70–110°", "Außenrotation kraftgemindert"],
        massnahmen: ["Manuelle Therapie Glenohumeralgelenk, 15 min", "Skapulastabilisation mit Theraband"],
        verlauf: ["Erstbefund"],
        hausaufgaben: ["Pendelübungen 3 × täglich"],
        unklar: [],
      },
    },
    {
      id: "7e3c1a52-0202-4000-8000-000000000202", kuerzel: "TP-02", tageZurueck: 5, uhrzeit: "11:40",
      rohtext: "Schulter links. Schmerz beim Überkopfarbeiten jetzt bei vier. Abduktion bis 130 Grad. Triggerpunktbehandlung am Supraspinatus, ähm, Infraspinatus und Mobilisation. Theraband rot, Außenrotation dreimal fünfzehn. Patient soll zu Hause weiter pendeln und neu Außenrotation mit Theraband machen. Nächster Termin Kraft der Rotatorenmanschette testen.",
      strukturiert: {
        befund: ["Abduktion bis 130°"],
        massnahmen: ["Triggerpunktbehandlung Supraspinatus/Infraspinatus (unklar)", "Mobilisation", "Außenrotation mit Theraband rot, 3 × 15 Wdh."],
        verlauf: ["Pat.: Schmerz bei Überkopfarbeit jetzt NRS 4", "Nächster Termin: Kraft Rotatorenmanschette testen"],
        hausaufgaben: ["Pendelübungen weiter", "Neu: Außenrotation mit Theraband"],
        unklar: ["„Supraspinatus, ähm, Infraspinatus“ unklar – welcher Muskel behandelt wurde"],
      },
    },
    {
      id: "7e3c1a52-0301-4000-8000-000000000301", kuerzel: "TP-03", tageZurueck: 20, uhrzeit: "09:00",
      rohtext: "Lendenwirbelsäule, Patientin mit Lumbalgie seit drei Wochen, keine Ausstrahlung ins Bein. Finger-Boden-Abstand 25 Zentimeter. Lasègue negativ beidseits. Muskulärer Hartspann paravertebral lumbal. Wärme zehn Minuten, dann Weichteiltechniken und Mobilisation der LWS in Seitlage. Hausaufgabe Katzenbuckel und Pferderücken, zehn Wiederholungen morgens und abends.",
      strukturiert: {
        befund: ["Pat.: Lumbalgie seit 3 Wochen, keine Ausstrahlung ins Bein", "Finger-Boden-Abstand 25 cm", "Lasègue beidseits negativ", "Muskulärer Hartspann paravertebral lumbal"],
        massnahmen: ["Wärme, 10 min", "Weichteiltechniken", "Mobilisation LWS in Seitlage"],
        verlauf: [],
        hausaufgaben: ["Katzenbuckel/Pferderücken 10 Wdh., morgens und abends"],
        unklar: [],
      },
    },
    {
      id: "7e3c1a52-0302-4000-8000-000000000302", kuerzel: "TP-03", tageZurueck: 6, uhrzeit: "14:20",
      rohtext: "LWS. Patientin berichtet deutlich weniger Schmerzen, NRS zwei. Finger-Boden-Abstand jetzt zehn Zentimeter. Isg links etwas blockiert, ähm, oder rechts, muss ich nochmal schauen. Mobilisation ISG, Stabilisationsübungen für den Rumpf, Unterarmstütz dreimal zwanzig Sekunden. Zu Hause Unterarmstütz täglich ergänzen.",
      strukturiert: {
        befund: ["ISG links oder rechts (unklar) etwas blockiert"],
        massnahmen: ["Mobilisation ISG", "Rumpfstabilisation, Unterarmstütz 3 × 20 s"],
        verlauf: ["Pat.: deutlich weniger Schmerz, NRS 2", "Finger-Boden-Abstand jetzt 10 cm"],
        hausaufgaben: ["Unterarmstütz täglich (ergänzend)"],
        unklar: ["Widerspruch: ISG links oder rechts blockiert", "„Isg“ als „ISG“ gelesen"],
      },
    },
  ];

  // Beispieldiktate für die Fake-Spracherkennung (der Reihe nach) – mit einer Notiz, wie die KI sie schreiben soll
  const DIKTATE = [
    {
      rohtext: "Knie rechts. Patientin berichtet weniger Schmerzen beim Treppensteigen, NRS drei. Flexion bis 115 Grad. 20 Minuten Krankengymnastik am Gerät, Beinpresse 35 Kilo dreimal zwölf. Zu Hause weiter Bridging, dreimal fünfzehn, täglich. Nächstes Mal Stabilisation auf dem Kreisel.",
      strukturiert: {
        befund: ["Flexion Knie rechts bis 115°"],
        massnahmen: ["KG am Gerät, 20 min", "Beinpresse 35 kg, 3 × 12 Wdh."],
        verlauf: ["Pat.: weniger Schmerz beim Treppensteigen, NRS 3", "Nächster Termin: Stabilisation auf dem Kreisel"],
        hausaufgaben: ["Bridging 3 × 15 Wdh., täglich (weiter)"],
        unklar: [],
      },
    },
    {
      rohtext: "Schulter links, Abduktion jetzt 140 Grad, kaum noch schmerzhafter Bogen. Manuelle Therapie 15 Minuten, Kräftigung Rotatorenmanschette mit Theraband grün. Für zu Hause Theraband grün, Außenrotation dreimal fünfzehn, jeden zweiten Tag.",
      strukturiert: {
        befund: ["Abduktion Schulter links bis 140°"],
        massnahmen: ["Manuelle Therapie, 15 min", "Kräftigung Rotatorenmanschette mit Theraband grün"],
        verlauf: ["Kaum noch schmerzhafter Bogen"],
        hausaufgaben: ["Außenrotation mit Theraband grün 3 × 15 Wdh., jeden 2. Tag"],
        unklar: [],
      },
    },
    {
      rohtext: "Halswirbelsäule, Patient mit Nackenschmerzen nach langer Bildschirmarbeit, NRS fünf. Rotation nach links eingeschränkt, nach rechts frei. Triggerpunkt am Trapezius Pass descendens links. Fünfzehn Minuten Massage, danach Dehnung. Hausaufgabe Dehnung Trapezius dreimal täglich, je dreißig Sekunden. Arbeitsplatz ergonomisch überprüfen wurde besprochen.",
      strukturiert: {
        befund: ["Pat.: Nackenschmerz nach langer Bildschirmarbeit, NRS 5", "HWS-Rotation links eingeschränkt, rechts frei", "Triggerpunkt M. trapezius pars descendens links"],
        massnahmen: ["Massage, 15 min", "Dehnung"],
        verlauf: ["Besprochen: Arbeitsplatz ergonomisch überprüfen"],
        hausaufgaben: ["Dehnung M. trapezius 3 × täglich, je 30 s"],
        unklar: ["„Pass descendens“ als „pars descendens“ gelesen"],
      },
    },
  ];

  // ------------------------------------------------------------------
  // Hilfen (wie im Worker: worker/src/notiz.js)
  // ------------------------------------------------------------------
  const glatt = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
  const kopie = (x) => JSON.parse(JSON.stringify(x));
  const leereNotiz = () => ({ befund: [], massnahmen: [], verlauf: [], hausaufgaben: [], unklar: [] });

  function punkte(werte) {
    if (typeof werte === "string") werte = werte.split("\n");
    if (!Array.isArray(werte)) return [];
    const gesehen = new Set();
    const aus = [];
    for (const w of werte) {
      if (typeof w !== "string" && typeof w !== "number") continue;
      const t = glatt(w).replace(/^[-•*–]\s*/, "").trim().slice(0, 600);
      const k = t.toLowerCase().replace(/[.;,]+$/, "");
      if (!t || gesehen.has(k)) continue;
      gesehen.add(k);
      aus.push(t);
      if (aus.length >= 30) break;
    }
    return aus;
  }

  function normalisieren(d) {
    const q = d && typeof d === "object" && !Array.isArray(d) ? d : {};
    const n = {};
    for (const k of ABSCHNITTE) n[k] = punkte(q[k]);
    n.unklar = punkte(q.unklar);
    return n;
  }

  const istLeer = (n) => ABSCHNITTE.every((k) => !n[k].length);

  function suchtext(p, rohtext, n) {
    const teile = [p.kuerzel, p.pseudonym, rohtext];
    for (const k of ABSCHNITTE) teile.push(...(n[k] || []));
    teile.push(...(n.unklar || []));
    return teile.filter(Boolean).join("\n").toLowerCase();
  }

  function suchwoerter(q) {
    return String(q || "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/)
      .map((w) => w.replace(/^-+|-+$/g, "")).filter((w) => w.length >= 2).slice(0, 5);
  }

  function kuerzelPruefen(roh) {
    const k = String(roh || "").trim().toUpperCase().replace(/\s+/g, "-");
    if (!/^[A-Z0-9-]{2,12}$/.test(k)) return { fehler: "Kürzel: 2–12 Zeichen, nur A–Z, 0–9 und Bindestrich." };
    if (!/[0-9]/.test(k)) return { fehler: "Kürzel braucht mindestens eine Ziffer (z. B. TP-01) – bitte keine Namen." };
    return { kuerzel: k };
  }

  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
  }

  /** Datum einer Beispielnotiz: vor n Tagen um hh:mm (Ortszeit). */
  function datumVor(tage, uhrzeit, jetzt) {
    const d = new Date(jetzt - tage * TAG_MS);
    const [h, m] = uhrzeit.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }

  /** Einfache Zuordnung ohne KI (nur Demo): Sätze nach Stichwörtern in die Abschnitte. */
  function heuristik(rohtext) {
    const n = leereNotiz();
    // ohne Lookbehind-Regex: ältere iPhone-Safaris würden sonst das ganze Skript nicht laden
    for (const satz of rohtext.replace(/([.!?])\s+/g, "$1\n").split(/\n+/).map(glatt).filter(Boolean)) {
      const k = satz.toLowerCase();
      if (/zu ?hause|hausaufgabe|heimübung/.test(k)) n.hausaufgaben.push(satz);
      else if (/therapie|minuten|behandl|massage|lymph|mobilis|gemacht|übung|training|dehnung|theraband/.test(k)) n.massnahmen.push(satz);
      else if (/nächste|besser|schlechter|weniger|verlauf|termin|kontrolle/.test(k)) n.verlauf.push(satz);
      else n.befund.push(satz);
    }
    n.unklar.push(DEMO_HINWEIS);
    return normalisieren(n);
  }

  /** Notiz zum Transkript: bekannte Beispieldiktate (auch mehrere hintereinander) → passende Notiz, sonst Stichwort-Zuordnung. */
  function demoStrukturieren(rohtext) {
    const zeilen = String(rohtext).split("\n").map(glatt).filter(Boolean);
    const bekannt = zeilen.map((z) => DIKTATE.find((d) => glatt(d.rohtext) === z));
    if (zeilen.length && bekannt.every(Boolean)) {
      const n = leereNotiz();
      for (const d of bekannt) for (const k of Object.keys(n)) n[k].push(...d.strukturiert[k]);
      return normalisieren(n);
    }
    return heuristik(zeilen.join("\n"));
  }

  // ------------------------------------------------------------------
  // Ablage (Browser: localStorage, Tests: Arbeitsspeicher)
  // ------------------------------------------------------------------
  function startDaten(jetzt = Date.now()) {
    const nachKuerzel = Object.fromEntries(PATIENTEN.map((p) => [p.kuerzel, p]));
    return {
      version: 1,
      diktat: 0,
      patienten: PATIENTEN.map((p) => ({ ...p, erstellt_am: datumVor(30, "08:00", jetzt) })),
      notizen: NOTIZEN.map((n) => {
        const p = nachKuerzel[n.kuerzel];
        const strukturiert = normalisieren(n.strukturiert);
        return { id: n.id, patient_id: p.id, rohtext: n.rohtext, strukturiert, suchtext: suchtext(p, n.rohtext, strukturiert), erstellt_am: datumVor(n.tageZurueck, n.uhrzeit, jetzt), geaendert_am: null };
      }),
    };
  }

  function browserAblage(schluessel = "gabi.demo.v1") {
    let fluechtig = null; // falls localStorage gesperrt ist (privates Fenster)
    return {
      lesen() {
        try { const d = JSON.parse(localStorage.getItem(schluessel) || "null"); if (d && d.version === 1) return d; } catch { /* gesperrt */ }
        return fluechtig;
      },
      schreiben(d) { fluechtig = d; try { localStorage.setItem(schluessel, JSON.stringify(d)); } catch { /* gesperrt */ } },
      loeschen() { fluechtig = null; try { localStorage.removeItem(schluessel); } catch { /* gesperrt */ } },
    };
  }

  function speicherAblage() {
    let d = null;
    return { lesen: () => d, schreiben: (x) => { d = x; }, loeschen: () => { d = null; } };
  }

  // ------------------------------------------------------------------
  // Fake-API: dieselben Pfade, Antworten und Fehlertexte wie der Worker
  // ------------------------------------------------------------------
  class DemoFehler extends Error {
    constructor(status, meldung) { super(meldung); this.status = status; }
  }

  function erstelleApi({ ablage = browserAblage(), verzoegerung = true, jetzt = () => Date.now() } = {}) {
    const warte = (ms) => (verzoegerung ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
    const daten = () => {
      let d = ablage.lesen();
      if (!d) { d = startDaten(jetzt()); ablage.schreiben(d); }
      return d;
    };
    const merken = (d) => ablage.schreiben(d);
    const mitPatient = (d, n) => {
      const p = d.patienten.find((x) => x.id === n.patient_id) || {};
      const { suchtext: _s, ...rest } = n;
      return kopie({ ...rest, kuerzel: p.kuerzel || "", pseudonym: p.pseudonym || "" });
    };
    const ohneRohtext = (n) => { const { rohtext: _r, ...rest } = n; return rest; };
    const neuesteZuerst = (a, b) => (a.erstellt_am < b.erstellt_am ? 1 : a.erstellt_am > b.erstellt_am ? -1 : 0);

    async function anfrage(pfad, { methode = "GET", body, text } = {}) {
      const url = new URL(pfad, "https://demo.invalid");
      const p = url.pathname.replace(/\/+$/, "");
      const d = daten();

      if (p === "/api/pruefen" && methode === "GET") return { ok: true };

      if (p === "/api/transkribieren" && methode === "POST") {
        if (!text || String(text).length < 200) throw new DemoFehler(400, "Keine gültige Aufnahme.");
        await warte(700);
        const diktat = DIKTATE[d.diktat % DIKTATE.length];
        d.diktat++;
        merken(d);
        return { text: diktat.rohtext };
      }

      if (p === "/api/strukturieren" && methode === "POST") {
        const t = glatt(body && body.rohtext) ? String(body.rohtext).replace(/\r\n?/g, "\n").trim() : "";
        if (!t) throw new DemoFehler(400, "Kein Text zum Strukturieren.");
        if (t.length > MAX_ROHTEXT) throw new DemoFehler(413, "Transkript zu lang.");
        await warte(900);
        return { strukturiert: demoStrukturieren(t) };
      }

      if (p === "/api/patienten" && methode === "GET") {
        const patienten = d.patienten.map((x) => ({ ...x, anzahl: d.notizen.filter((n) => n.patient_id === x.id).length }));
        patienten.sort((a, b) => a.kuerzel.localeCompare(b.kuerzel));
        return { patienten: kopie(patienten) };
      }

      if (p === "/api/patienten" && methode === "POST") {
        const k = kuerzelPruefen(body && body.kuerzel);
        if (k.fehler) throw new DemoFehler(400, k.fehler);
        const pseudonym = glatt(body && body.pseudonym);
        if (pseudonym.length > 60) throw new DemoFehler(400, "Beschreibung höchstens 60 Zeichen.");
        if (d.patienten.some((x) => x.kuerzel === k.kuerzel)) throw new DemoFehler(409, `Kürzel ${k.kuerzel} gibt es schon.`);
        const neu = { id: uuid(), kuerzel: k.kuerzel, pseudonym, erstellt_am: new Date(jetzt()).toISOString() };
        d.patienten.push(neu);
        merken(d);
        return { patient: { ...neu, anzahl: 0 } };
      }

      if (p === "/api/notizen" && methode === "GET") {
        const patientId = url.searchParams.get("patient_id") || "";
        const woerter = suchwoerter(url.searchParams.get("q"));
        const liste = d.notizen
          .filter((n) => !patientId || n.patient_id === patientId)
          .filter((n) => woerter.every((w) => n.suchtext.includes(w)))
          .sort(neuesteZuerst)
          .map((n) => ohneRohtext(mitPatient(d, n)));
        return { notizen: liste };
      }

      if (p === "/api/notizen" && methode === "POST") {
        const patient = d.patienten.find((x) => x.id === (body && body.patient_id));
        if (!patient) throw new DemoFehler(400, "Bitte einen Test-Patienten wählen.");
        const rohtext = String((body && body.rohtext) || "").replace(/\r\n?/g, "\n").trim();
        if (rohtext.length > MAX_ROHTEXT) throw new DemoFehler(413, "Transkript zu lang.");
        const strukturiert = normalisieren(body && body.strukturiert);
        if (istLeer(strukturiert) && !rohtext) throw new DemoFehler(400, "Die Notiz ist leer.");
        const n = { id: uuid(), patient_id: patient.id, rohtext, strukturiert, suchtext: suchtext(patient, rohtext, strukturiert), erstellt_am: new Date(jetzt()).toISOString(), geaendert_am: null };
        d.notizen.push(n);
        merken(d);
        await warte(250);
        return { notiz: mitPatient(d, n) };
      }

      const treffer = p.match(/^\/api\/notizen\/([^/]+)$/);
      if (treffer) {
        const n = d.notizen.find((x) => x.id === treffer[1]);
        if (!n) throw new DemoFehler(404, "Notiz nicht gefunden.");
        if (methode === "GET") return { notiz: mitPatient(d, n) };
        if (methode === "PATCH") {
          const rohtext = body && "rohtext" in body ? String(body.rohtext || "").replace(/\r\n?/g, "\n").trim() : n.rohtext;
          const strukturiert = body && "strukturiert" in body ? normalisieren(body.strukturiert) : n.strukturiert;
          if (istLeer(strukturiert) && !rohtext) throw new DemoFehler(400, "Die Notiz ist leer.");
          const patient = d.patienten.find((x) => x.id === n.patient_id) || {};
          Object.assign(n, { rohtext, strukturiert, suchtext: suchtext(patient, rohtext, strukturiert), geaendert_am: new Date(jetzt()).toISOString() });
          merken(d);
          return { notiz: mitPatient(d, n) };
        }
        if (methode === "DELETE") {
          d.notizen = d.notizen.filter((x) => x.id !== n.id);
          merken(d);
          return null;
        }
      }
      throw new DemoFehler(404, "Nicht gefunden.");
    }

    return {
      anfrage,
      zuruecksetzen() { ablage.loeschen(); },
      /** Nächstes Beispieldiktat ohne Aufnahme (für Tests ohne Mikrofon). */
      async beispielDiktat() { return anfrage("/api/transkribieren", { methode: "POST", text: "A".repeat(256) }); },
    };
  }

  return { PATIENTEN, NOTIZEN, DIKTATE, DEMO_HINWEIS, DemoFehler, erstelleApi, browserAblage, speicherAblage, startDaten, demoStrukturieren, normalisieren, suchtext, kuerzelPruefen };
});
