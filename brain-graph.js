/* Gabi – Brain-Graph: der Wissensgraph als eigene Umsetzung (keine Bibliothek, läuft unter der strengen CSP).
   1 Rechnen (rein, auch in Node testbar): Hash, Barnes-Hut, Kraft-Layout, Kamera, Label-Auswahl, Pfeiltasten-Richtung, Testdaten
   2 Web Worker: dieselbe Datei rechnet dort nur das Layout – mit Rückstau-Schutz (erst nach „ack“ geht es weiter)
   3 Browser: Canvas-Zeichner, Bedienung (Maus, Finger, Tastatur), Minimap, Messwerte
   Gezeichnet wird nur bei Bedarf: In Ruhe entsteht kein einziges Bild. Inhalte stehen nie in Adressen oder Logs. */
(function (wurzel, fabrik) {
  const g = fabrik();
  if (typeof module === "object" && module.exports) module.exports = g;
  else wurzel.GabiBrainGraph = g;
  // als Web Worker geladen (kein Dokument, aber importScripts): nur das Layout rechnen
  if (typeof document === "undefined" && typeof importScripts === "function" && typeof wurzel.postMessage === "function") g.workerStarten(wurzel);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ==========================================================
  // 1 Rechnen – ohne Browser
  // ==========================================================
  const ZWEI_PI = Math.PI * 2;
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const klemmen = (w, min, max) => (w < min ? min : w > max ? max : w);
  /** Zwei Mengen mit demselben Inhalt? */
  const gleicheMenge = (a, b) => { if (a.size !== b.size) return false; for (const w of a) if (!b.has(w)) return false; return true; };
  const uhr = typeof performance !== "undefined" && performance && typeof performance.now === "function" ? () => performance.now() : () => Date.now();
  const nachId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  /** 32-Bit-Hash (FNV-1a mit Nachmischen): ähnliche IDs landen weit auseinander. */
  function hash32(text) {
    const s = String(text);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  /** Feste Zahl in [0, 1) aus einem Text – statt Zufall: gleicher Graph, gleiches Bild. */
  const einheit = (text) => hash32(text) / 4294967296;
  /** Zufallsfolge aus einer Saat (für Testdaten). */
  function zufall(saat) {
    let a = (Number(saat) >>> 0) || 1;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Barnes-Hut: Abstoßung in O(n log n) ----------
  const MAX_TIEFE = 22;
  /**
   * Quadtree in flachen Feldern (kein Objekt je Zelle, nichts wird je Tick neu angelegt).
   * koerper[c]: -1 = leeres Blatt · ≥ 0 = Blatt mit diesem Körper (weitere an derselben Stelle über naechster[]) · -2 = innere Zelle
   */
  function erstelleBaum() {
    let cap = 256;
    let kinder = new Int32Array(cap * 4);
    let koerper = new Int32Array(cap);
    let masse = new Float64Array(cap);   // Summe der Ladungen
    let gewicht = new Float64Array(cap); // Summe der Beträge (für den Schwerpunkt)
    let sx = new Float64Array(cap);
    let sy = new Float64Array(cap);
    let naechster = new Int32Array(0);
    const stapelZ = new Int32Array(4 * MAX_TIEFE + 16);
    const stapelS = new Float64Array(4 * MAX_TIEFE + 16);
    let anzahl = 0;
    let x0 = 0;
    let y0 = 0;
    let seite = 1;

    function wachsen() {
      const neu = cap * 2;
      const kopie = (Typ, alt, faktor = 1) => { const f = new Typ(neu * faktor); f.set(alt); return f; };
      kinder = kopie(Int32Array, kinder, 4);
      koerper = kopie(Int32Array, koerper);
      masse = kopie(Float64Array, masse);
      gewicht = kopie(Float64Array, gewicht);
      sx = kopie(Float64Array, sx);
      sy = kopie(Float64Array, sy);
      cap = neu;
    }
    function neueZelle() {
      if (anzahl === cap) wachsen();
      const c = anzahl++;
      const k = c * 4;
      kinder[k] = -1; kinder[k + 1] = -1; kinder[k + 2] = -1; kinder[k + 3] = -1;
      koerper[c] = -1;
      return c;
    }
    function einfuegen(i, x, y) {
      const px = x[i];
      const py = y[i];
      let c = 0;
      let cx = x0;
      let cy = y0;
      let s = seite;
      let tiefe = 0;
      for (;;) {
        const inhalt = koerper[c];
        if (inhalt === -2) {
          s *= 0.5;
          const rechts = px >= cx + s ? 1 : 0;
          const unten = py >= cy + s ? 1 : 0;
          if (rechts) cx += s;
          if (unten) cy += s;
          const platz = c * 4 + rechts + unten * 2;
          let kind = kinder[platz];
          if (kind < 0) { kind = neueZelle(); kinder[platz] = kind; } // erst anlegen, dann eintragen (das Feld kann dabei wachsen)
          c = kind;
          tiefe++;
          continue;
        }
        if (inhalt === -1) { koerper[c] = i; naechster[i] = -1; return; }
        // Blatt ist belegt: gleiche Stelle oder größte Tiefe → an die Kette hängen, sonst teilen
        if (tiefe >= MAX_TIEFE || (x[inhalt] === px && y[inhalt] === py)) { naechster[i] = inhalt; koerper[c] = i; return; }
        koerper[c] = -2;
        const h = s * 0.5;
        const kind = neueZelle();
        kinder[c * 4 + (x[inhalt] >= cx + h ? 1 : 0) + (y[inhalt] >= cy + h ? 2 : 0)] = kind;
        koerper[kind] = inhalt; // samt Kette (alle an derselben Stelle)
      }
    }
    /** Baum für n Körper aufbauen: Lagen x/y, Ladungen q. */
    function bauen(x, y, q, n) {
      if (naechster.length < n) naechster = new Int32Array(n);
      anzahl = 0;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        if (x[i] < minX) minX = x[i];
        if (x[i] > maxX) maxX = x[i];
        if (y[i] < minY) minY = y[i];
        if (y[i] > maxY) maxY = y[i];
      }
      if (!(minX <= maxX)) { minX = 0; maxX = 1; minY = 0; maxY = 1; }
      seite = Math.max(maxX - minX, maxY - minY, 1e-6) * 1.0001 + 1e-9;
      x0 = minX;
      y0 = minY;
      neueZelle();
      for (let i = 0; i < n; i++) einfuegen(i, x, y);
      // Kinder haben immer einen höheren Index als ihre Eltern: rückwärts ist von unten nach oben
      for (let c = anzahl - 1; c >= 0; c--) {
        let m = 0;
        let w = 0;
        let gx = 0;
        let gy = 0;
        if (koerper[c] === -2) {
          for (let k = c * 4; k < c * 4 + 4; k++) {
            const kind = kinder[k];
            if (kind < 0) continue;
            m += masse[kind]; w += gewicht[kind]; gx += sx[kind] * gewicht[kind]; gy += sy[kind] * gewicht[kind];
          }
        } else {
          for (let j = koerper[c]; j >= 0; j = naechster[j]) { const g = Math.abs(q[j]); m += q[j]; w += g; gx += x[j] * g; gy += y[j] * g; }
        }
        masse[c] = m;
        gewicht[c] = w;
        sx[c] = w > 0 ? gx / w : 0;
        sy[c] = w > 0 ? gy / w : 0;
      }
    }
    /**
     * Abstoßung auf Körper i: weit entfernte Zellen zählen als ein Körper im Schwerpunkt (Seite² / theta² < Abstand²).
     * Kraft je Partner: Richtung × Ladung × alpha / Abstand² (wie üblich bei Kraft-Layouts); aus[0], aus[1] = Summe.
     */
    function kraft(i, x, y, q, alpha, theta2, min2, max2, aus) {
      const px = x[i];
      const py = y[i];
      let ax = 0;
      let ay = 0;
      let sp = 0;
      if (anzahl) { stapelZ[0] = 0; stapelS[0] = seite; sp = 1; }
      while (sp > 0) {
        sp--;
        const c = stapelZ[sp];
        const s = stapelS[sp];
        const inhalt = koerper[c];
        if (inhalt === -2) {
          const dx = sx[c] - px;
          const dy = sy[c] - py;
          let l = dx * dx + dy * dy;
          if (s * s / theta2 < l) {
            if (l < max2) {
              if (l < min2) l = Math.sqrt(min2 * l);
              const f = masse[c] * alpha / l;
              ax += dx * f;
              ay += dy * f;
            }
            continue;
          }
          const h = s * 0.5;
          for (let k = c * 4; k < c * 4 + 4; k++) {
            if (kinder[k] >= 0) { stapelZ[sp] = kinder[k]; stapelS[sp] = h; sp++; }
          }
        } else {
          for (let j = inhalt; j >= 0; j = naechster[j]) {
            if (j === i) continue;
            let dx = x[j] - px;
            let dy = y[j] - py;
            let l = dx * dx + dy * dy;
            if (l === 0) { // genau übereinander: fester kleiner Versatz statt Zufall
              dx = (((i * 73 + j * 37) % 17) - 8.5) * 1e-2;
              dy = (((i * 31 + j * 59) % 13) - 6.5) * 1e-2;
              l = dx * dx + dy * dy;
            }
            if (l >= max2) continue;
            if (l < min2) l = Math.sqrt(min2 * l);
            const f = q[j] * alpha / l;
            ax += dx * f;
            ay += dy * f;
          }
        }
      }
      aus[0] = ax;
      aus[1] = ay;
    }
    return { bauen, kraft, get zellen() { return anzahl; } };
  }

  /** Abstoßung aller Körper mit Barnes-Hut → { ax, ay } (für Tests und Messungen). */
  function abstossung(x, y, q, { theta = 0.9, alpha = 1, abstandMin = 1, abstandMax = Infinity } = {}) {
    const n = x.length;
    const baum = erstelleBaum();
    baum.bauen(x, y, q, n);
    const ax = new Float64Array(n);
    const ay = new Float64Array(n);
    const aus = [0, 0];
    for (let i = 0; i < n; i++) {
      baum.kraft(i, x, y, q, alpha, theta * theta, abstandMin * abstandMin, abstandMax * abstandMax, aus);
      ax[i] = aus[0];
      ay[i] = aus[1];
    }
    return { ax, ay, zellen: baum.zellen };
  }
  /** Dieselbe Abstoßung als direkte Summe über alle Paare (O(n²)) – der Maßstab für Barnes-Hut. */
  function abstossungDirekt(x, y, q, { alpha = 1, abstandMin = 1, abstandMax = Infinity } = {}) {
    const n = x.length;
    const ax = new Float64Array(n);
    const ay = new Float64Array(n);
    const min2 = abstandMin * abstandMin;
    const max2 = abstandMax * abstandMax;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        let l = dx * dx + dy * dy;
        if (l === 0 || l >= max2) continue;
        if (l < min2) l = Math.sqrt(min2 * l);
        ax[i] += dx * q[j] * alpha / l;
        ay[i] += dy * q[j] * alpha / l;
      }
    }
    return { ax, ay };
  }

  // ---------- Kraft-Layout ----------
  const LAYOUT_STANDARD = {
    theta: 0.9,            // Barnes-Hut: ab wann eine Zelle als ein Körper zählt
    ladung: -60,           // Abstoßung je Knoten …
    ladungJeGrad: 0.5,     // … mal (1 + das × √Grad): Naben halten mehr Abstand
    abstandMin: 4,
    abstandMax: Infinity,  // keine harte Grenze: sie ließe die Kraft springen, wenn eine ferne Zelle hinein- oder hinausrutscht
    federLaenge: 46,       // Ruhelänge einer Kante …
    federJeGrad: 7,        // … plus das × √(größerer Grad): Platz für die Blätter einer Nabe
    federStaerke: 0.85,    // geteilt durch √(kleinerer Grad): Naben hängen weicher aneinander als Blätter an ihrer Nabe
    weite: 0,              // Abstands-Faktor; 0 = nach Knotenzahl (kleine Graphen luftiger: Platz für alle Labels)
    mitte: 0.06,           // schwacher Zug zur Mitte (hält lose Teile beisammen)
    seite: 1,              // Höhe : Breite der Fläche (0,5–2): im Hochformat zieht die Mitte seitlich stärker – das Bild wird hoch
    kollision: 0.75,
    kollisionRand: 7,
    alphaMin: 0.001,
    alphaZerfall: 0.028,   // ≈ 245 Ticks von 1 bis zur Ruhe
    // Was schon liegt, bleibt liegen: Kommen Knoten dazu, rechnen nur die neuen – der Rest des Bildes steht still.
    // (Ein ganzes Nachwärmen ließe alles wandern: Die Ruhelage eines abgekühlten Layouts ist kein Gleichgewicht.)
    lokalAlpha: 0.3,
    thetaLokal: 0.4,       // wenige Knoten rechnen: genauer (kein Zittern)
    ziehTiefe: 1,          // „lebendiges“ Ziehen: Nachbarn bis zu dieser Tiefe reagieren mit
    reibung: 0.42,
    radiusBasis: 5,
    radiusJeGrad: 2.4,
    radiusMax: 22,
  };
  /** Abstands-Faktor nach Knotenzahl: bis 60 Knoten 1,5 (jedes Label hat Platz), ab 260 Knoten 1 (kompakt). */
  const weiteFuer = (n) => klemmen(1.5 - 0.5 * (n - 60) / 200, 1, 1.5);
  /** Radius eines Knotens aus seinem Grad (Welt-Einheiten = Pixel bei Zoom 1). */
  function knotenRadius(grad, o = LAYOUT_STANDARD) {
    return Math.min(o.radiusMax, o.radiusBasis + o.radiusJeGrad * Math.sqrt(Math.max(0, Number(grad) || 0)));
  }

  /**
   * Layout anlegen. eingabe: { knoten: [{ id, x?, y?, fest?, grad? }], kanten: [{ von, nach }] }.
   * Intern nach ID sortiert – die Reihenfolge der Eingabe ändert das Bild nicht. Knoten mit x/y behalten ihre Lage,
   * neue landen neben einem Nachbarn; ohne jede Lage entsteht die Startlage aus gehashten IDs.
   */
  function erstelleLayout(eingabe, optionen) {
    const o = { ...LAYOUT_STANDARD, ...(optionen || {}) };
    const baum = erstelleBaum();
    const aus = [0, 0];
    let ids = [];
    let index = new Map();
    let n = 0;
    let x = new Float32Array(0);
    let y = new Float32Array(0);
    let vx = new Float32Array(0);
    let vy = new Float32Array(0);
    let fx = new Float32Array(0);
    let fy = new Float32Array(0);
    let fest = new Uint8Array(0);
    let radius = new Float32Array(0);
    let ladung = new Float32Array(0);
    let grad = new Int32Array(0);
    let nachbarn = [];
    let kA = new Int32Array(0);
    let kB = new Int32Array(0);
    let kLaenge = new Float32Array(0);
    let kStaerke = new Float32Array(0);
    let kAnteil = new Float32Array(0);
    let signatur = "";
    let alpha = 1;
    let alphaZiel = 0;
    let ticks = 0;
    let aktiv = null;       // null = alle rechnen · sonst Maske der Knoten, die sich bewegen dürfen
    let aktivListe = null;
    let ziehIndex = -1;
    // Kollisions-Raster
    const RASTER = 64;
    const zStart = new Int32Array(RASTER * RASTER + 1);
    let zInhalt = new Int32Array(0);
    let zVon = new Int32Array(0);
    let zLauf = new Int32Array(0);

    function startlagen(hat) {
      let bekannt = 0;
      for (let i = 0; i < n; i++) if (hat[i]) bekannt++;
      const neu = n - bekannt;
      if (!neu) return 0;
      if (!bekannt) {
        // Zusammenhangsteile, der größte zuerst; je Teil vom Knoten mit den meisten Kanten aus in die Breite
        const teilVon = new Int32Array(n).fill(-1);
        const teile = [];
        for (let i = 0; i < n; i++) {
          if (teilVon[i] >= 0) continue;
          const liste = [i];
          teilVon[i] = teile.length;
          for (let k = 0; k < liste.length; k++) for (const j of nachbarn[liste[k]]) if (teilVon[j] < 0) { teilVon[j] = teile.length; liste.push(j); }
          teile.push(liste);
        }
        teile.sort((a, b) => b.length - a.length || a[0] - b[0]);
        const ring = 80 + 26 * Math.sqrt(n);
        const richtung = new Float32Array(n);
        teile.forEach((liste, t) => {
          let w = liste[0];
          for (const i of liste) if (grad[i] > grad[w] || (grad[i] === grad[w] && i < w)) w = i;
          if (t === 0) { x[w] = 0; y[w] = 0; }
          else {
            const a = t * GOLDEN + einheit(ids[w]) * 0.5;
            const r = ring * (0.5 + 0.5 * Math.sqrt(t / teile.length));
            x[w] = Math.cos(a) * r;
            y[w] = Math.sin(a) * r;
          }
          hat[w] = 1;
          richtung[w] = NaN;
          const reihe = [w];
          for (let k = 0; k < reihe.length; k++) {
            const p = reihe[k];
            const kinder = nachbarn[p].filter((j) => !hat[j]);
            const fein = einheit(ids[p]) * ZWEI_PI;
            kinder.forEach((j, nr) => {
              // Wurzel: rundum verteilt; sonst ein Fächer weg vom eigenen Elternknoten – so entfaltet sich der Baum
              const a = Number.isNaN(richtung[p])
                ? fein + (nr / kinder.length) * ZWEI_PI
                : richtung[p] + ((nr + 0.5) / kinder.length - 0.5) * Math.PI * 1.15 + (einheit(ids[j]) - 0.5) * 0.35;
              const d = o.federLaenge * (0.8 + 0.4 * einheit(`${ids[j]}#`));
              x[j] = x[p] + Math.cos(a) * d;
              y[j] = y[p] + Math.sin(a) * d;
              richtung[j] = a;
              hat[j] = 1;
              reihe.push(j);
            });
          }
        });
        return neu;
      }
      // ein Teil ist bekannt: Neue neben einen Nachbarn mit Lage (auch über mehrere Sprünge)
      let offen = [];
      for (let i = 0; i < n; i++) if (!hat[i]) offen.push(i);
      let fortschritt = true;
      while (offen.length && fortschritt) {
        fortschritt = false;
        const rest = [];
        for (const i of offen) {
          const anker = nachbarn[i].find((j) => hat[j]);
          if (anker === undefined) { rest.push(i); continue; }
          const a = einheit(ids[i]) * ZWEI_PI;
          const d = o.federLaenge * 0.8;
          x[i] = x[anker] + Math.cos(a) * d;
          y[i] = y[anker] + Math.sin(a) * d;
          hat[i] = 1;
          fortschritt = true;
        }
        offen = rest;
      }
      if (offen.length) {
        // ohne Anschluss: auf einen Ring um die vorhandenen Knoten
        let mx = 0;
        let my = 0;
        let weit = 0;
        let zahl = 0;
        for (let i = 0; i < n; i++) if (hat[i]) { mx += x[i]; my += y[i]; zahl++; }
        mx /= zahl || 1;
        my /= zahl || 1;
        for (let i = 0; i < n; i++) if (hat[i]) weit = Math.max(weit, Math.hypot(x[i] - mx, y[i] - my));
        for (const i of offen) {
          const a = einheit(ids[i]) * ZWEI_PI;
          const r = weit * 0.6 + 70 + 40 * einheit(`${ids[i]}#`);
          x[i] = mx + Math.cos(a) * r;
          y[i] = my + Math.sin(a) * r;
          hat[i] = 1;
        }
      }
      return neu;
    }

    /** Nur diese Knoten (und ihre Nachbarn bis tiefe) bewegen sich; null = alle. dazu: bisher Aktive bleiben es. */
    function aktivSetzen(indizes, dazu = false, tiefe = 0) {
      if (!indizes) { aktiv = null; aktivListe = null; return; }
      const maske = dazu && aktiv && aktiv.length === n ? aktiv : new Uint8Array(n);
      let rand = [];
      for (const i of indizes) if (i >= 0 && i < n) { maske[i] = 1; rand.push(i); }
      for (let t = 0; t < tiefe; t++) {
        const naechste = [];
        for (const a of rand) for (const b of nachbarn[a]) if (!maske[b]) { maske[b] = 1; naechste.push(b); }
        rand = naechste;
      }
      const liste = [];
      for (let i = 0; i < n; i++) if (maske[i]) liste.push(i);
      aktiv = maske;
      aktivListe = Int32Array.from(liste);
    }

    /** alt: Map id → { x, y, fest, aktiv } aus dem bisherigen Stand (dann gewinnen diese Lagen). */
    function aufbauen(daten, alt) {
      const liefGanz = Boolean(alt) && aktiv === null && !(alphaZiel === 0 && alpha < o.alphaMin); // ein ganzes Layout ist noch unterwegs
      const roh = (daten && Array.isArray(daten.knoten) ? daten.knoten : []).filter((k) => k && typeof k.id === "string" && k.id);
      const gesehen = new Set();
      const liste = [];
      for (const k of roh) { if (!gesehen.has(k.id)) { gesehen.add(k.id); liste.push(k); } }
      liste.sort(nachId);
      n = liste.length;
      ids = liste.map((k) => k.id);
      index = new Map(ids.map((id, i) => [id, i]));
      x = new Float32Array(n); y = new Float32Array(n); vx = new Float32Array(n); vy = new Float32Array(n);
      fx = new Float32Array(n); fy = new Float32Array(n); fest = new Uint8Array(n);
      radius = new Float32Array(n); ladung = new Float32Array(n); grad = new Int32Array(n);
      zInhalt = new Int32Array(n); zVon = new Int32Array(n); zLauf = new Int32Array(RASTER * RASTER + 1);
      // Kanten: nur zwischen vorhandenen Knoten, ohne Schleifen, jedes Paar einmal
      const paare = new Set();
      const kanten = [];
      for (const k of daten && Array.isArray(daten.kanten) ? daten.kanten : []) {
        if (!k) continue;
        const a = index.get(k.von);
        const b = index.get(k.nach);
        if (a === undefined || b === undefined || a === b) continue;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const schluessel = lo * n + hi;
        if (paare.has(schluessel)) continue;
        paare.add(schluessel);
        kanten.push([lo, hi]);
      }
      kanten.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      const m = kanten.length;
      kA = new Int32Array(m); kB = new Int32Array(m); kLaenge = new Float32Array(m); kStaerke = new Float32Array(m); kAnteil = new Float32Array(m);
      nachbarn = Array.from({ length: n }, () => []);
      kanten.forEach(([a, b], e) => { kA[e] = a; kB[e] = b; grad[a]++; grad[b]++; nachbarn[a].push(b); nachbarn[b].push(a); });
      for (const l of nachbarn) l.sort((a, b) => a - b);
      const weite = o.weite > 0 ? o.weite : weiteFuer(n);
      for (let e = 0; e < m; e++) {
        const ga = grad[kA[e]];
        const gb = grad[kB[e]];
        kLaenge[e] = weite * (o.federLaenge + o.federJeGrad * Math.sqrt(Math.max(ga, gb)));
        kStaerke[e] = o.federStaerke / Math.sqrt(Math.min(ga, gb));
        kAnteil[e] = ga / (ga + gb); // wer mehr Kanten hat, bewegt sich weniger
      }
      const hat = new Uint8Array(n);
      const neue = [];        // ohne Lage: nur sie rechnen
      const weiterAktiv = []; // waren beim örtlichen Nachwärmen noch unterwegs
      for (let i = 0; i < n; i++) {
        const k = liste[i];
        const g = Math.max(grad[i], Math.floor(Number(k.grad) || 0));
        radius[i] = knotenRadius(g, o) + o.kollisionRand;
        ladung[i] = o.ladung * weite * weite * (1 + o.ladungJeGrad * Math.sqrt(grad[i]));
        const a = alt && alt.get(k.id);
        if (a) { x[i] = a.x; y[i] = a.y; fest[i] = a.fest ? 1 : 0; hat[i] = 1; if (a.aktiv) weiterAktiv.push(i); }
        else if (Number.isFinite(k.x) && Number.isFinite(k.y)) { x[i] = k.x; y[i] = k.y; fest[i] = k.fest ? 1 : 0; hat[i] = 1; }
        if (a && "fest" in k) fest[i] = k.fest ? 1 : 0; // ausdrücklich mitgegeben: gilt
        if (!hat[i]) neue.push(i);
      }
      const neu = startlagen(hat);
      for (let i = 0; i < n; i++) { fx[i] = x[i]; fy[i] = y[i]; }
      const neueSignatur = `${ids.join("\u0001")}\u0002${Array.from(kA).join(",")}\u0002${Array.from(kB).join(",")}`;
      const gleich = neueSignatur === signatur;
      signatur = neueSignatur;
      alphaZiel = 0;
      ziehIndex = -1;
      if (!n) { alpha = 0; aktivSetzen(null); }
      else if (neu === n) { aktivSetzen(null); alpha = 1; } // nichts liegt schon: ganz rechnen (auch nach einem leeren Stand)
      else if (!alt) {
        // frisches Layout mit bekannten Lagen: alles bekannt → das Bild steht · wenige neu → nur sie rechnen ·
        // das meiste neu → die wenigen bekannten Lagen sind nur noch ein Anfang, alles rechnet
        if (!neu) { aktivSetzen(null); alpha = 0; }
        else if (neu / n <= 0.5) { aktivSetzen(neue); alpha = o.lokalAlpha; }
        else { aktivSetzen(null); alpha = 0.5; }
      } else if (neu) {
        // laufender Graph: Was schon liegt, bleibt liegen – außer das ganze Layout ist ohnehin noch unterwegs
        if (liefGanz) aktivSetzen(null);
        else aktivSetzen([...weiterAktiv, ...neue]);
        alpha = Math.max(alpha, o.lokalAlpha);
      } else if (aktiv) {
        if (weiterAktiv.length) aktivSetzen(weiterAktiv); // Maske auf die neue Reihenfolge übertragen
        else { aktivSetzen(null); if (!liefGanz) alpha = 0; }
      }
      return { neu, geaendert: !gleich };
    }

    function kollisionen() {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let rMax = 0;
      for (let i = 0; i < n; i++) {
        const cx = x[i] + vx[i];
        const cy = y[i] + vy[i];
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        if (radius[i] > rMax) rMax = radius[i];
      }
      const zelle = Math.max(2 * rMax, 1);
      const gw = klemmen(Math.ceil((maxX - minX) / zelle) || 1, 1, RASTER);
      const gh = klemmen(Math.ceil((maxY - minY) / zelle) || 1, 1, RASTER);
      const zw = Math.max(zelle, (maxX - minX) / gw + 1e-6);
      const zh = Math.max(zelle, (maxY - minY) / gh + 1e-6);
      const zellen = gw * gh;
      zStart.fill(0, 0, zellen + 1);
      for (let i = 0; i < n; i++) {
        const c = Math.min(gh - 1, Math.floor((y[i] + vy[i] - minY) / zh)) * gw + Math.min(gw - 1, Math.floor((x[i] + vx[i] - minX) / zw));
        zVon[i] = c;
        zStart[c + 1]++;
      }
      for (let c = 0; c < zellen; c++) zStart[c + 1] += zStart[c];
      zLauf.set(zStart.subarray(0, zellen + 1));
      for (let i = 0; i < n; i++) zInhalt[zLauf[zVon[i]]++] = i;
      for (let i = 0; i < n; i++) {
        const cx = zVon[i] % gw;
        const cy = (zVon[i] - cx) / gw;
        const xi = x[i] + vx[i];
        const yi = y[i] + vy[i];
        for (let ny = Math.max(0, cy - 1); ny <= Math.min(gh - 1, cy + 1); ny++) {
          for (let nx = Math.max(0, cx - 1); nx <= Math.min(gw - 1, cx + 1); nx++) {
            const c = ny * gw + nx;
            for (let p = zStart[c]; p < zStart[c + 1]; p++) {
              const j = zInhalt[p];
              if (j <= i) continue;
              let dx = xi - x[j] - vx[j];
              let dy = yi - y[j] - vy[j];
              const r = radius[i] + radius[j];
              let l = dx * dx + dy * dy;
              if (l >= r * r) continue;
              if (l === 0) { dx = (((i * 73 + j * 37) % 17) - 8.5) * 1e-3; dy = (((i * 31 + j * 59) % 13) - 6.5) * 1e-3; l = dx * dx + dy * dy; }
              l = Math.sqrt(l);
              const schub = (r - l) / l * o.kollision * 0.5;
              vx[i] += dx * schub; vy[i] += dy * schub;
              vx[j] -= dx * schub; vy[j] -= dy * schub;
            }
          }
        }
      }
    }

    function tick() {
      alpha += (alphaZiel - alpha) * o.alphaZerfall;
      // Federn
      for (let e = 0; e < kA.length; e++) {
        const a = kA[e];
        const b = kB[e];
        let dx = x[b] + vx[b] - x[a] - vx[a];
        let dy = y[b] + vy[b] - y[a] - vy[a];
        let l = Math.sqrt(dx * dx + dy * dy);
        if (l === 0) { dx = (((a * 73 + b * 37) % 17) - 8.5) * 1e-3; dy = (((a * 31 + b * 59) % 13) - 6.5) * 1e-3; l = Math.sqrt(dx * dx + dy * dy); }
        l = (l - kLaenge[e]) / l * alpha * kStaerke[e];
        dx *= l;
        dy *= l;
        vx[b] -= dx * kAnteil[e]; vy[b] -= dy * kAnteil[e];
        vx[a] += dx * (1 - kAnteil[e]); vy[a] += dy * (1 - kAnteil[e]);
      }
      // Abstoßung (örtlich: nur für die Aktiven, dafür genauer)
      if (n > 1) {
        baum.bauen(x, y, ladung, n);
        const theta = aktivListe ? o.thetaLokal : o.theta;
        const theta2 = theta * theta;
        const min2 = o.abstandMin * o.abstandMin;
        const max2 = o.abstandMax * o.abstandMax;
        const zahl = aktivListe ? aktivListe.length : n;
        for (let s = 0; s < zahl; s++) {
          const i = aktivListe ? aktivListe[s] : s;
          baum.kraft(i, x, y, ladung, alpha, theta2, min2, max2, aus);
          vx[i] += aus[0];
          vy[i] += aus[1];
        }
      }
      // Zug zur Mitte – je nach Seitenverhältnis der Fläche seitlich oder senkrecht stärker
      const form = Math.pow(klemmen(Number(o.seite) || 1, 0.5, 2), 0.75);
      const zugX = o.mitte * alpha * form;
      const zugY = o.mitte * alpha / form;
      for (let i = 0; i < n; i++) { vx[i] -= x[i] * zugX; vy[i] -= y[i] * zugY; }
      if (o.kollision > 0 && n > 1) kollisionen();
      const bleibt = 1 - o.reibung;
      for (let i = 0; i < n; i++) {
        if (fest[i]) { x[i] = fx[i]; y[i] = fy[i]; vx[i] = 0; vy[i] = 0; continue; }
        if (aktiv && !aktiv[i]) { vx[i] = 0; vy[i] = 0; continue; } // nicht betroffen: bleibt genau stehen
        let ax = vx[i] * bleibt;
        let ay = vy[i] * bleibt;
        if (!(ax === ax) || !(ay === ay)) { ax = 0; ay = 0; } // NaN nie weitertragen
        vx[i] = ax;
        vy[i] = ay;
        x[i] += ax;
        y[i] += ay;
      }
      ticks++;
    }

    const ruht = () => alphaZiel === 0 && alpha < o.alphaMin;
    aufbauen(eingabe, null);

    return {
      get ids() { return ids; },
      get anzahl() { return n; },
      get kantenZahl() { return kA.length; },
      get alpha() { return alpha; },
      get ticks() { return ticks; },
      /** Zahl der Knoten, die gerade rechnen dürfen (0 = alle). */
      get lokal() { return aktivListe ? aktivListe.length : 0; },
      optionen: o,
      ruht,
      index: (id) => (index.has(id) ? index.get(id) : -1),
      /** k Ticks rechnen (in Ruhe: nichts). */
      schritt(k = 1) {
        for (let s = 0; s < k && !ruht(); s++) tick();
        return alpha;
      },
      /** Bis zur Ruhe rechnen (höchstens maxTicks bzw. maxMs) → Zahl der Ticks. */
      bisRuhe(maxTicks = 1500, maxMs = Infinity) {
        const ende = uhr() + maxMs;
        let k = 0;
        while (!ruht() && k < maxTicks && (maxMs === Infinity || uhr() < ende)) { tick(); k++; }
        return k;
      },
      /** Die unruhige erste Phase ohne Bild rechnen: bis alpha ≤ bisAlpha. */
      vorrechnen(bisAlpha = 0.35, maxMs = 300) {
        const ende = uhr() + maxMs;
        let k = 0;
        while (alpha > bisAlpha && !ruht() && uhr() < ende) { tick(); k++; }
        return k;
      },
      /** Lagen als [x0, y0, x1, y1, …] in ID-Reihenfolge. */
      lagen() { const p = new Float32Array(n * 2); this.lagenIn(p); return p; },
      lagenIn(p) { for (let i = 0; i < n; i++) { p[2 * i] = x[i]; p[2 * i + 1] = y[i]; } return p; },
      lage(id) { const i = index.get(id); return i === undefined ? null : { x: x[i], y: y[i], fest: Boolean(fest[i]) }; },
      /** Knoten am Zeiger festhalten. ruhig: niemand sonst reagiert; sonst federn die Nachbarn mit („lebendig“). */
      ziehen(id, wx, wy, { ruhig = false } = {}) {
        const i = index.get(id);
        if (i === undefined) return;
        fest[i] = 1; fx[i] = wx; fy[i] = wy; x[i] = wx; y[i] = wy; vx[i] = 0; vy[i] = 0;
        if (ruhig) return;
        if (ziehIndex !== i) {
          // nur der gezogene Knoten und seine Nachbarn reagieren – außer das ganze Layout läuft ohnehin noch
          const inRuhe = ruht();
          if (inRuhe || aktiv !== null) aktivSetzen([i], !inRuhe, o.ziehTiefe);
          ziehIndex = i;
        }
        alphaZiel = o.lokalAlpha;
        if (alpha < 0.08) alpha = 0.08;
      },
      loslassen(id, bleibtFest = true) {
        const i = index.get(id);
        if (i !== undefined) fest[i] = bleibtFest ? 1 : 0;
        ziehIndex = -1;
        alphaZiel = 0;
      },
      fixieren(id, an, wx, wy) {
        const i = index.get(id);
        if (i === undefined) return;
        if (Number.isFinite(wx) && Number.isFinite(wy)) { x[i] = wx; y[i] = wy; }
        fest[i] = an ? 1 : 0; fx[i] = x[i]; fy[i] = y[i]; vx[i] = 0; vy[i] = 0;
      },
      /** Das ganze Layout aufwärmen (alle Knoten rechnen wieder). */
      waermen(a = 0.12) { aktivSetzen(null); if (a > alpha) alpha = Math.min(1, a); },
      /** Lagen von außen setzen (z. B. mitgezogene Blätter) – ohne zu fixieren und ohne aufzuwärmen. */
      versetzen(liste) {
        for (const eintrag of liste || []) {
          const i = index.get(eintrag[0]);
          if (i === undefined || !Number.isFinite(eintrag[1]) || !Number.isFinite(eintrag[2])) continue;
          x[i] = eintrag[1]; y[i] = eintrag[2]; fx[i] = x[i]; fy[i] = y[i]; vx[i] = 0; vy[i] = 0;
        }
      },
      /** Nur diese Knoten nachwärmen (z. B. nach dem Lösen einer Fixierung) – der Rest bleibt stehen. */
      anstossen(idListe, a = 0.2) {
        const liste = (idListe || []).map((id) => index.get(id)).filter((i) => i !== undefined);
        if (!liste.length) return;
        const inRuhe = ruht();
        if (inRuhe || aktiv !== null) aktivSetzen(liste, !inRuhe);
        if (a > alpha) alpha = Math.min(1, a);
      },
      /**
       * Neuer Datenstand: Was schon liegt, bleibt liegen (Lage und Fixierung) – gerechnet wird nur für neue Knoten.
       * Neue oder entfernte Kanten zwischen bekannten Knoten bewegen nichts → { neu, geaendert }.
       */
      aktualisieren(daten) {
        const alt = new Map();
        const unterwegs = !ruht();
        for (let i = 0; i < n; i++) alt.set(ids[i], { x: x[i], y: y[i], fest: Boolean(fest[i]), aktiv: Boolean(unterwegs && aktiv && aktiv[i]) });
        return aufbauen(daten, alt);
      },
    };
  }

  // ---------- Kamera ----------
  // Welt → Bild: bx = (wx − kamera.x) × zoom + breite / 2 (kamera.x/y = Weltpunkt in der Bildmitte)
  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 5;
  const zuBild = (k, wx, wy, breite, hoehe) => ({ x: (wx - k.x) * k.zoom + breite / 2, y: (wy - k.y) * k.zoom + hoehe / 2 });
  const zuWelt = (k, bx, by, breite, hoehe) => ({ x: (bx - breite / 2) / k.zoom + k.x, y: (by - hoehe / 2) / k.zoom + k.y });
  /** Zoomen um einen Bildpunkt: Der Weltpunkt darunter bleibt, wo er ist. */
  function zoomUmPunkt(k, faktor, bx, by, breite, hoehe, { min = ZOOM_MIN, max = ZOOM_MAX } = {}) {
    const zoom = klemmen(k.zoom * faktor, min, max);
    const w = zuWelt(k, bx, by, breite, hoehe);
    return { x: w.x - (bx - breite / 2) / zoom, y: w.y - (by - hoehe / 2) / zoom, zoom };
  }
  /** Kamera, die grenzen ({ minX, minY, maxX, maxY }) in die freie Fläche einpasst; verdeckt = Ränder unter Panels (px). */
  function kameraEinpassen(grenzen, breite, hoehe, { rand = 48, verdeckt = null, maxZoom = 1.5, minZoom = ZOOM_MIN } = {}) {
    const v = verdeckt || {};
    const l = Math.max(0, v.links || 0);
    const r = Math.max(0, v.rechts || 0);
    const ob = Math.max(0, v.oben || 0);
    const u = Math.max(0, v.unten || 0);
    const fb = Math.max(40, breite - l - r - 2 * rand);
    const fh = Math.max(40, hoehe - ob - u - 2 * rand);
    const gb = Math.max(1, grenzen.maxX - grenzen.minX);
    const gh = Math.max(1, grenzen.maxY - grenzen.minY);
    const zoom = klemmen(Math.min(fb / gb, fh / gh), minZoom, maxZoom);
    const mx = (grenzen.minX + grenzen.maxX) / 2;
    const my = (grenzen.minY + grenzen.maxY) / 2;
    const zielX = l + (breite - l - r) / 2; // Mitte der freien Fläche
    const zielY = ob + (hoehe - ob - u) / 2;
    return { x: mx - (zielX - breite / 2) / zoom, y: my - (zielY - hoehe / 2) / zoom, zoom };
  }
  /** Zwei Kameras zeigen dasselbe Bild (Unterschied unter einem Zwanzigstel Pixel). */
  const gleicheKamera = (a, b) => Boolean(a && b) && Math.abs(a.zoom / b.zoom - 1) < 1e-4 && Math.abs(a.x - b.x) * a.zoom < 0.05 && Math.abs(a.y - b.y) * a.zoom < 0.05;
  const FREI_MIN = 120; // px
  /**
   * Die Ränder, mit denen die Kamera rechnet. Bleibt neben einem Panel oder über einem Blatt weniger als mindest frei
   * (am Handy deckt das Blatt die Fläche fast ganz zu), zählen sie gar nicht – sonst flöge alles ins Verdeckte oder das
   * Bild fiele auf den kleinsten Zoom zusammen. einpassen: false = nur für den Blick auf einen Knoten, „Alles zeigen“ nimmt
   * die ganze Fläche (ein Blatt liegt nur darüber).
   */
  function freieRaender(verdeckt, breite, hoehe, mindest = FREI_MIN) {
    const v = verdeckt || {};
    const zahl = (w) => (Number.isFinite(w) && w > 0 ? w : 0);
    const r = { links: zahl(v.links), rechts: zahl(v.rechts), oben: zahl(v.oben), unten: zahl(v.unten), einpassen: v.einpassen !== false };
    if (breite - r.links - r.rechts < mindest || hoehe - r.oben - r.unten < mindest) return { links: 0, rechts: 0, oben: 0, unten: 0, einpassen: true };
    return r;
  }
  /** Liegt der Bildpunkt in der freien Fläche – mit Abstand zum Rand (höchstens rand, in einem schmalen Streifen ein Viertel davon)? */
  function imFreien(p, breite, hoehe, raender, rand = 56) {
    const rx = Math.min(rand, (breite - raender.links - raender.rechts) / 4);
    const ry = Math.min(rand, (hoehe - raender.oben - raender.unten) / 4);
    return p.x >= raender.links + rx && p.x <= breite - raender.rechts - rx && p.y >= raender.oben + ry && p.y <= hoehe - raender.unten - ry;
  }
  /**
   * Kamera so verschieben – erst wenn das nicht reicht, verkleinern –, dass kein Knoten unter einem Bedienelement liegt,
   * das über der Fläche schwebt (Minimap, Legende, Knöpfe). Rein.
   *   punkte      [{ x, y, r }] in Welt-Koordinaten (r = Radius im Bild bei Zoom 1)
   *   hindernisse [{ x, y, breite, hoehe }] im Bild
   *   frei        { links, oben, rechts, unten }: Kanten der freien Fläche im Bild (Standard: alles)
   *   rand, randUnten: so viel Abstand zum Rand bleibt mindestens (unten mehr: dort stehen die Labels)
   *   radius(r, zoom) → Radius im Bild · abstand: Luft um jedes Bedienelement · schritte: höchstens so oft um 5 % verkleinern
   * Ohne Lösung bleibt die Kamera, wie sie war.
   */
  function kameraAusweichen(kamera, punkte, breite, hoehe, { hindernisse = [], frei = null, rand = 14, randUnten = rand, abstand = 5, schritte = 12, raster = 4, radius = (r, zoom) => r * zoom, minZoom = ZOOM_MIN } = {}) {
    const f = frei || { links: 0, oben: 0, rechts: breite, unten: hoehe };
    const dinge = [];
    for (const h of hindernisse || []) {
      if (!h || !(h.breite > 0) || !(h.hoehe > 0)) continue;
      const d = { l: h.x - abstand, o: h.y - abstand, r: h.x + h.breite + abstand, u: h.y + h.hoehe + abstand };
      if (d.r <= f.links || d.l >= f.rechts || d.u <= f.oben || d.o >= f.unten) continue; // liegt selbst im Verdeckten
      dinge.push(d);
    }
    const n = punkte ? punkte.length : 0;
    if (!dinge.length || !n || !(kamera.zoom > 0)) return kamera;
    // der Weltpunkt, der beim Start in der Mitte der freien Fläche liegt, bleibt der Anker
    const cx = (f.links + f.rechts) / 2;
    const cy = (f.oben + f.unten) / 2;
    const anker = zuWelt(kamera, cx, cy, breite, hoehe);
    const bx = new Float32Array(n);
    const by = new Float32Array(n);
    const br = new Float32Array(n);
    const nah = [];
    let zoom = kamera.zoom;
    for (let s = 0; s <= schritte && zoom >= minZoom; s++, zoom *= 0.95) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        const p = punkte[i];
        bx[i] = cx + (p.x - anker.x) * zoom;
        by[i] = cy + (p.y - anker.y) * zoom;
        br[i] = radius(p.r, zoom);
        if (bx[i] - br[i] < minX) minX = bx[i] - br[i];
        if (bx[i] + br[i] > maxX) maxX = bx[i] + br[i];
        if (by[i] - br[i] < minY) minY = by[i] - br[i];
        if (by[i] + br[i] > maxY) maxY = by[i] + br[i];
      }
      // so weit darf das Bild rücken, ohne dass ein Knoten dem Rand zu nahe kommt
      const dxMin = f.links + rand - minX;
      const dxMax = f.rechts - rand - maxX;
      const dyMin = f.oben + rand - minY;
      const dyMax = f.unten - randUnten - maxY;
      if (dxMin > dxMax || dyMin > dyMax) continue; // passt bei diesem Zoom nicht in die Ränder
      // nur Knoten, die überhaupt unter ein Bedienelement geraten können
      nah.length = 0;
      for (let i = 0; i < n; i++) {
        for (const d of dinge) {
          if (bx[i] + br[i] + dxMax > d.l && bx[i] - br[i] + dxMin < d.r && by[i] + br[i] + dyMax > d.o && by[i] - br[i] + dyMin < d.u) { nah.push(i); break; }
        }
      }
      const trifft = (dx, dy) => {
        for (const i of nah) {
          const x = bx[i] + dx;
          const y = by[i] + dy;
          for (const d of dinge) {
            const qx = x < d.l ? d.l : x > d.r ? d.r : x;
            const qy = y < d.o ? d.o : y > d.u ? d.u : y;
            if ((x - qx) * (x - qx) + (y - qy) * (y - qy) < br[i] * br[i]) return true;
          }
        }
        return false;
      };
      // die kleinste Verschiebung gewinnt (feste Reihenfolge: gleiches Bild → gleiches Ergebnis)
      let bestX = 0;
      let bestY = 0;
      let bester = Infinity;
      const x0 = klemmen(0, dxMin, dxMax);
      const y0 = klemmen(0, dyMin, dyMax);
      const xs = [x0];
      const ys = [y0];
      for (let x = x0 - raster; x >= dxMin; x -= raster) xs.push(x);
      for (let x = x0 + raster; x <= dxMax; x += raster) xs.push(x);
      for (let y = y0 - raster; y >= dyMin; y -= raster) ys.push(y);
      for (let y = y0 + raster; y <= dyMax; y += raster) ys.push(y);
      if (!xs.includes(dxMax)) xs.push(dxMax); // die Ränder des Spielraums gehören dazu
      if (!xs.includes(dxMin)) xs.push(dxMin);
      if (!ys.includes(dyMax)) ys.push(dyMax);
      if (!ys.includes(dyMin)) ys.push(dyMin);
      for (const dy of ys) {
        for (const dx of xs) {
          const w = dx * dx + dy * dy;
          if (w >= bester || trifft(dx, dy)) continue;
          bester = w;
          bestX = dx;
          bestY = dy;
        }
      }
      if (bester === Infinity) continue;
      if (s === 0 && bestX === 0 && bestY === 0) return kamera; // nichts liegt darunter
      return { x: anker.x - (cx + bestX - breite / 2) / zoom, y: anker.y - (cy + bestY - hoehe / 2) / zoom, zoom };
    }
    return kamera;
  }

  // ---------- Labels ----------
  /** Titel für das Label: an der Wortgrenze gekürzt, mit „…“. */
  function kuerzen(text, max = 30) {
    const t = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    const schnitt = t.slice(0, max - 1);
    const anWort = /\s/.test(t.charAt(max - 1)) ? schnitt : schnitt.replace(/\s+\S*$/, "");
    return `${(anWort.length >= Math.floor(max * 0.55) ? anWort : schnitt).replace(/[\s,.;:·–-]+$/u, "")}…`;
  }
  /**
   * Ab welchem Zoom ein Knoten sein Label zeigt: Naben immer, Mittelfeld ab der Übersicht, Blätter erst aus der Nähe.
   * rang = Platz nach Grad, geteilt durch die Knotenzahl (0 = wichtigster).
   */
  function labelSchwelle(grad, rang, anzahl) {
    if (anzahl <= 24) return grad >= 3 ? 0 : 0.45;
    if (grad >= 8 || rang < 0.05) return 0;
    if (grad >= 4 || rang < 0.18) return 0.55;
    if (grad >= 2 || rang < 0.45) return 0.95;
    return 1.3;
  }
  const PLAETZE = 6; // 0 unten · 1 rechts · 2 oben · 3 links · 4 unten rechts · 5 unten links
  function platzLage(platz, k, w, h) {
    const ab = k.r + 4;
    switch (platz) {
      case 1: return [k.x + ab + 2, k.y - h / 2];
      case 2: return [k.x - w / 2, k.y - ab - h];
      case 3: return [k.x - ab - 2 - w, k.y - h / 2];
      case 4: return [k.x + ab * 0.6, k.y + ab * 0.75];
      case 5: return [k.x - ab * 0.6 - w, k.y + ab * 0.75];
      default: return [k.x - w / 2, k.y + ab];
    }
  }
  /**
   * Labels für ein Bild setzen (rein). kandidaten: [{ id, x, y, r, breite, vorrang, erzwungen }] in Bildkoordinaten.
   * Ein Raster verhindert Überlappung (auch mit Knoten: sperren = [{ x, y, r }]); merk (Map id → Platz) hält ein Label
   * an seiner Stelle, solange sie frei ist – so springt nichts. Höchstens max Labels, wichtige zuerst.
   */
  function labelsWaehlen(kandidaten, { breite, hoehe, merk = new Map(), max = 140, zeile = 16, polster = 10, sperren = [], innen = false, rechtsZuerst = false, fest = null } = {}) {
    // innen: ein Label liegt ganz im Bild oder gar nicht, nie überlappend erzwungen · rechtsZuerst: Standardseite ist rechts ·
    // fest: Kennungen, deren Seite sich gerade nicht ändern darf (nur der gemerkte Platz, sonst kein Label)
    const ZB = 12;
    const ZH = 8;
    const sp = Math.max(1, Math.ceil(breite / ZB));
    const ze = Math.max(1, Math.ceil(hoehe / ZH));
    const belegt = new Uint8Array(sp * ze);
    const bereich = (x0, y0, x1, y1) => [Math.max(0, Math.floor(x0 / ZB)), Math.max(0, Math.floor(y0 / ZH)), Math.min(sp - 1, Math.floor(x1 / ZB)), Math.min(ze - 1, Math.floor(y1 / ZH))];
    const frei = (x0, y0, x1, y1) => {
      const [a, b, c, d] = bereich(x0, y0, x1, y1);
      for (let zy = b; zy <= d; zy++) for (let zx = a; zx <= c; zx++) if (belegt[zy * sp + zx]) return false;
      return true;
    };
    const belegen = (x0, y0, x1, y1) => {
      const [a, b, c, d] = bereich(x0, y0, x1, y1);
      for (let zy = b; zy <= d; zy++) for (let zx = a; zx <= c; zx++) belegt[zy * sp + zx] = 1;
    };
    // Knoten sperren ihre Fläche – um eine halbe Zelle enger, damit ein Label direkt neben seinem Knoten Platz findet
    for (const s of sperren) {
      const rx = Math.max(0, s.r - ZB / 2);
      const ry = Math.max(0, s.r - ZH / 2);
      belegen(s.x - rx, s.y - ry, s.x + rx, s.y + ry);
    }
    const liste = [...kandidaten].sort((a, b) => (Number(Boolean(b.erzwungen)) - Number(Boolean(a.erzwungen))) || (b.vorrang - a.vorrang) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const ergebnis = [];
    for (const k of liste) {
      if (ergebnis.length >= max) break;
      const w = k.breite + polster;
      const h = zeile;
      const gemerkt = merk.get(k.id);
      let gesetzt = null;
      const reihe = gemerkt !== undefined && fest && fest.has(k.id) ? [gemerkt]
        : gemerkt !== undefined ? [gemerkt, ...[0, 1, 2, 3, 4, 5].filter((p) => p !== gemerkt)]
        : rechtsZuerst ? [1, 0, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5];
      for (let versuch = 0; versuch < reihe.length && !gesetzt; versuch++) {
        const platz = reihe[versuch];
        const [x0, y0] = platzLage(platz, k, w, h);
        if (x0 + w < 0 || y0 + h < 0 || x0 > breite || y0 > hoehe) continue;
        if (innen && (x0 < 0 || y0 < 0 || x0 + w > breite || y0 + h > hoehe)) continue;
        if (frei(x0, y0, x0 + w, y0 + h)) gesetzt = { id: k.id, x: x0, y: y0, breite: w, hoehe: h, platz };
      }
      if (!gesetzt && k.erzwungen && !innen) {
        const platz = gemerkt === undefined ? 0 : gemerkt;
        const [x0, y0] = platzLage(platz, k, w, h);
        gesetzt = { id: k.id, x: x0, y: y0, breite: w, hoehe: h, platz };
      }
      if (!gesetzt) continue;
      belegen(gesetzt.x, gesetzt.y, gesetzt.x + w, gesetzt.y + h);
      merk.set(k.id, gesetzt.platz);
      ergebnis.push(gesetzt);
    }
    return ergebnis;
  }

  // ---------- Zeichen am Knoten, Trefferflächen ----------
  /**
   * Schloss an einem geschützten Knoten (r = Radius im Bild): Es wächst mit dem Knoten – in der Übersicht klein, ab 6 px
   * in voller Größe. Sehr kleine Knoten tragen es zarter, die kleinsten Punkte gar nicht (sonst wäre das Zeichen größer
   * als der Knoten). Am Zoom hängt es nicht.
   */
  function schlossMass(r) {
    return { groesse: klemmen(r / 6, 0.5, 1), deckkraft: klemmen((r - 2.6) / 0.8, 0, 1) };
  }
  /**
   * Trefferfläche eines Knotens (r = Radius im Bild, Ergebnis in px). Maus: knapp um den Knoten. Finger: zum Antippen
   * mindestens 44 px Durchmesser – zum sofortigen Ziehen aber nur der sichtbare Knoten selbst, sonst zöge fast jeder
   * Wisch durch den Graphen einen Knoten mit (greifen geht über kurzes Halten, siehe HALTEN_MS).
   */
  function trefferRadius(r, zeigerTyp, ziehen = false) {
    if (zeigerTyp === "mouse") return r + 5;
    return ziehen ? r + 2 : Math.max(22, r + 8);
  }

  // ---------- Tastatur: Nachbar in Pfeilrichtung ----------
  const RICHTUNGEN = { links: [-1, 0], rechts: [1, 0], oben: [0, -1], unten: [0, 1] };
  /**
   * Der Kandidat, der von „von“ aus am besten in der Richtung liegt (Kegel ±60°, nah und geradeaus bevorzugt).
   * kandidaten: [{ id, x, y }] – y wächst nach unten (wie im Bild). Keiner im Kegel → null.
   */
  function nachbarInRichtung(von, kandidaten, richtung) {
    const v = RICHTUNGEN[richtung];
    if (!v || !von) return null;
    let bester = null;
    let wert = Infinity;
    for (const k of kandidaten || []) {
      const dx = k.x - von.x;
      const dy = k.y - von.y;
      const l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      const cos = (dx * v[0] + dy * v[1]) / l;
      if (cos < 0.5) continue;
      const w = l * (1 + (1 - cos) * 2.5);
      if (w < wert || (w === wert && bester && k.id < bester.id)) { wert = w; bester = k; }
    }
    return bester ? bester.id : null;
  }

  // ---------- Testdaten (erfunden, für Messungen mit 100/300/500 Knoten) ----------
  function testDaten(anzahl = 300, saat = 1) {
    const n = Math.max(1, Math.floor(anzahl));
    const z = zufall(saat);
    const nr = (i) => String(i).padStart(4, "0");
    const THEMEN = ["Standort", "Leistung", "Team", "Kontakt", "Training", "Partner", "Abrechnung", "Termine", "Material", "Ablauf", "Geräte", "Kurse"];
    const knoten = [];
    const kanten = [];
    const paare = new Set();
    const verbinde = (a, b, art) => {
      if (a === b) return;
      const s = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (paare.has(s)) return;
      paare.add(s);
      kanten.push({ von: knoten[a].id, nach: knoten[b].id, art });
    };
    const naben = Math.min(n, Math.max(3, Math.round(n / 16)));
    const patienten = [];
    for (let i = 0; i < n; i++) {
      const id = `t-${nr(i)}`;
      if (i === 0) { knoten.push({ id, art: "praxiswissen", titel: "Praxis (Testdaten)", status: "bestaetigt", geschuetzt: false }); continue; }
      if (i < naben) {
        knoten.push({ id, art: "praxiswissen", titel: `${THEMEN[(i - 1) % THEMEN.length]} ${Math.floor((i - 1) / THEMEN.length) + 1}`, status: "bestaetigt", geschuetzt: false });
        verbinde(i, 0, "gehoert_zu");
        if (i > 2 && z() < 0.3) verbinde(i, 1 + Math.floor(z() * (i - 1)), "verweis");
        continue;
      }
      const w = z();
      let art = "praxiswissen";
      let status = "bestaetigt";
      let geschuetzt = false;
      if (w < 0.1) { art = "frage"; status = "zu_klaeren"; }
      else if (w < 0.15) art = "regel";
      else if (w < 0.19) art = "vorlage";
      else if (w < 0.25) { art = "patient"; geschuetzt = true; }
      else if (w < 0.39 && patienten.length) { art = "notiz"; geschuetzt = true; }
      else if (w < 0.42 && patienten.length) { art = "bericht"; geschuetzt = true; }
      else if (w < 0.43) art = "persona";
      if (!geschuetzt && status === "bestaetigt" && z() < 0.12) status = "entwurf";
      const titel = art === "patient" ? `TP-${nr(i)}`
        : art === "notiz" ? `${String(1 + Math.floor(z() * 28)).padStart(2, "0")}.${String(1 + Math.floor(z() * 12)).padStart(2, "0")}. · Notiz ${i}`
          : art === "bericht" ? `Bericht ${i}`
            : art === "frage" ? `Offene Frage ${i}?`
              : `${THEMEN[Math.floor(z() * THEMEN.length)]} – Eintrag ${i}${z() < 0.25 ? " mit einem längeren Titel zum Kürzen" : ""}`;
      knoten.push({ id, art, titel, status, geschuetzt });
      if (art === "patient") { patienten.push(i); verbinde(i, 0, "gehoert_zu"); continue; }
      if (art === "notiz" || art === "bericht") { verbinde(i, patienten[Math.floor(z() * patienten.length)], art === "notiz" ? "notiz_von" : "bericht_zu"); continue; }
      const nabe = 1 + Math.floor(Math.pow(z(), 1.6) * (naben - 1)); // einige Naben sind beliebter
      verbinde(i, Math.min(nabe, naben - 1) || 0, "gehoert_zu");
      if (z() < 0.28) verbinde(i, naben + Math.floor(z() * (i - naben)), "verweis");
      if (z() < 0.05) continue;
    }
    const grad = new Map(knoten.map((k) => [k.id, 0]));
    for (const k of kanten) { grad.set(k.von, grad.get(k.von) + 1); grad.set(k.nach, grad.get(k.nach) + 1); }
    for (const k of knoten) k.grad = grad.get(k.id);
    return { knoten, kanten };
  }

  // ==========================================================
  // 2 Web Worker – nur Layout
  // ==========================================================
  const TICKS_JE_BILD = 2;
  const MAX_TICKS = 2000;
  /**
   * Nachrichten: start { nr, knoten, kanten, optionen, sofort } · neu { nr, knoten, kanten, sofort } · ack { nr, puffer? } ·
   * zieh/los/fest/lage/waerme · pause/weiter
   * Antworten: bereit { nr, ids } · lagen { nr, puffer (übertragen), alpha, ticks, ruht }
   * Rückstau-Schutz: Nach jedem „lagen“ wartet der Worker auf „ack“ – die Seite bekommt nie mehr Bilder, als sie zeichnet.
   */
  function workerStarten(w) {
    let layout = null;
    let nr = 0;
    let wartet = false;
    let pause = false;
    let melden = false; // nach „los“/„fest“ bekommt die Seite auf jeden Fall noch einen Stand – auch wenn nichts mehr rechnet
    const frei = [];
    const senden = () => {
      const laenge = layout.anzahl * 2;
      let p = frei.pop();
      if (!p || p.length !== laenge) p = new Float32Array(laenge);
      layout.lagenIn(p);
      wartet = true;
      w.postMessage({ typ: "lagen", nr, puffer: p, alpha: layout.alpha, ticks: layout.ticks, ruht: layout.ruht() }, [p.buffer]);
    };
    const weiter = () => {
      if (!layout || wartet || pause) return;
      if (layout.ruht()) { if (melden) { melden = false; senden(); } return; }
      layout.schritt(TICKS_JE_BILD);
      if (layout.ruht()) melden = false; // dieses Bild meldet die Ruhe
      senden();
    };
    w.onmessage = (ereignis) => {
      const d = ereignis.data || {};
      if (d.typ === "start") {
        nr = d.nr;
        pause = false;
        melden = false;
        frei.length = 0;
        layout = erstelleLayout({ knoten: d.knoten, kanten: d.kanten }, d.optionen);
        w.postMessage({ typ: "bereit", nr, ids: layout.ids });
        if (d.sofort) layout.bisRuhe(MAX_TICKS, 4000);
        else layout.vorrechnen(0.35, 300);
        wartet = false;
        senden();
        return;
      }
      if (d.typ === "neu" && layout) {
        // neuer Datenstand: Lagen bleiben, gerechnet wird nur rund um das Geänderte
        nr = d.nr;
        frei.length = 0;
        layout.aktualisieren({ knoten: d.knoten, kanten: d.kanten });
        if (d.sofort) layout.bisRuhe(MAX_TICKS, 4000);
        wartet = false;
        senden();
        return;
      }
      if (!layout || d.nr !== nr) return; // gehört zu einem älteren Datenstand
      switch (d.typ) {
        case "ack":
          if (d.puffer && frei.length < 2) frei.push(d.puffer);
          wartet = false;
          weiter();
          break;
        case "zieh": layout.ziehen(d.id, d.x, d.y, { ruhig: Boolean(d.ruhig) }); weiter(); break;
        case "los": layout.loslassen(d.id, d.fest !== false); melden = true; weiter(); break;
        case "fest": layout.fixieren(d.id, Boolean(d.fest), d.x, d.y); if (!d.fest && !d.ruhig) layout.anstossen([d.id], 0.2); melden = true; weiter(); break;
        case "lage": layout.versetzen(d.lagen); break;
        case "waerme": layout.waermen(d.alpha); weiter(); break;
        case "pause": pause = true; break;
        case "weiter": pause = false; weiter(); break;
        default: break;
      }
    };
  }

  // ==========================================================
  // 3 Browser – zeichnen und bedienen
  // ==========================================================
  const ARTEN_REIHE = ["notiz", "bericht", "patient", "vorlage", "regel", "persona", "frage", "praxiswissen"]; // Zeichenreihenfolge: Wissen liegt oben
  const ART_NAMEN = { praxiswissen: "Praxiswissen", regel: "Regel", persona: "Persona", patient: "Test-Patient", notiz: "Notiz", bericht: "Bericht", frage: "Frage", vorlage: "Vorlage" };
  const STATUS_NAMEN = { bestaetigt: "bestätigt", entwurf: "Entwurf", zu_klaeren: "zu klären" };
  const FARBEN_STANDARD = {
    hintergrund: "#f3f3f0", platte: "#ffffff", text: "#1f2a2c", textLeise: "#626e71",
    kante: "rgba(75, 88, 91, 0.34)", kanteStark: "#3b484a", akzent: "#28773d", warn: "#a85a14",
    arten: { praxiswissen: "#2f8a45", regel: "#4f6b8f", persona: "#7a5aa6", patient: "#2f7f86", notiz: "#6b7f86", bericht: "#8a6d2f", frage: "#a85a14", vorlage: "#a3567d" },
  };
  const R_MIN = 2.4;          // kleinster Knoten im Bild (px)
  const DIMM_HOVER = 0.16;    // Rest beim Zeigen auf einen Knoten
  const DIMM_TREFFER = 0.22;  // Rest bei Suchtreffern
  const FLUG_MS = 260;
  const DOPPEL_MS = 320;      // zwei Tipps an derselben Stelle in dieser Zeit = Doppeltipp
  const DOPPEL_PX = 24;
  const HALTEN_MS = 250;      // Finger so lange still auf einem Knoten = gegriffen (kürzer als ein Doppeltipp – ein gehaltener Tipp ist nie dessen zweiter)
  const PULS_MS = 6000;       // „zu klären“ pulsiert so lange nach dem Erscheinen – danach steht der Ring still (kein Dauerlauf)
  const PULS_PERIODE = 1700;
  const SCHEIN_MS = 1800;
  const radiusZoom = (z) => Math.pow(z, 0.85);

  /**
   * Graph in einem Behälter anlegen (der Behälter braucht eine feste Größe und position: relative).
   * optionen:
   *   farben()         → { hintergrund, platte, text, textLeise, kante, kanteStark, akzent, warn, arten: { art: Farbe } }
   *                      (kante = fertige Farbe samt Deckkraft; bei Hell/Dunkel-Wechsel farbenNeu() rufen)
   *   wenigBewegung()  → true: Layout fertig rechnen und ein Bild zeigen, keine Flüge, kein Puls, kein Schein
   *   workerUrl        Adresse dieser Datei für den Web Worker (null = Layout im Hauptfaden, höchstens 6 ms je Bild)
   *   positionen       { lesen() → { id: [x, y, fest] }, schreiben(obj) } – nach dem Beruhigen und nach dem Ziehen
   *   beiAuswahl(id | null, { quelle: "zeiger" | "tastatur" }) · beiOeffnen(id, { quelle }) · beiHover(id | null) · ansage(text)
   *   beiFixiert(id, true) nach dem Ziehen eines Knotens (er bleibt liegen, bis fixieren(id, false) oder neuAnordnen({ auchFeste }))
   *   hindernisse()    → [{ x, y, breite, hoehe }] relativ zum Behälter: was über der Fläche schwebt (Minimap, Legende, Knöpfe) –
   *                      beim Einpassen bleibt kein Knoten darunter
   *   ziehen           "ruhig" (Standard): nur der Knoten wandert, seine Blätter kommen starr mit, der Rest steht still ·
   *                    "lebendig": die Nachbarn federn über das Layout mit
   *   layout           eigene Layout-Werte (siehe LAYOUT_STANDARD) · drossel: false = Pixeldichte nie senken
   * Über den Bauplan hinaus: verdeckt(ränder), lageImBild(id), istFest(id), istAktiv(), neuAnordnen({ auchFeste }),
   * messen() mit ruht/worker/zoom/fest/schloesser.
   * Kamera und Detail: verdeckt(ränder) meldet, was Panel oder Blatt verdecken. Geht es auf, holt auswaehlen(id) den
   * Knoten einmal in den freien Bereich (nur beim Wechsel der Auswahl – ein bloßes Neuzeichnen bewegt nichts); geht es
   * zu, steht die Kamera wieder wie vorher, wenn sie inzwischen niemand von Hand bewegt hat.
   */
  function erstelle(behaelter, optionen) {
    const opt = optionen || {};
    const dok = behaelter.ownerDocument;
    const fenster = dok.defaultView;
    const jetztMs = () => fenster.performance.now();
    const wenig = () => { try { return Boolean(opt.wenigBewegung && opt.wenigBewegung()); } catch { return false; } };
    const ZIEHEN_LEBENDIG = opt.ziehen === "lebendig"; // Standard „ruhig“: beim Ziehen bleibt der Rest des Bildes stehen
    /** Rückruf der Ansicht: Ein Fehler dort hält den Graph nicht an, bleibt aber in der Konsole sichtbar. */
    const rufe = (name, ...args) => {
      if (typeof opt[name] !== "function") return;
      try { opt[name](...args); } catch (e) { fenster.setTimeout(() => { throw e; }, 0); }
    };

    // ---------- Elemente ----------
    const flaeche = dok.createElement("canvas");
    flaeche.className = "brain-graph-flaeche";
    flaeche.tabIndex = 0;
    flaeche.setAttribute("role", "application");
    flaeche.setAttribute("aria-roledescription", "Wissensgraph");
    flaeche.setAttribute("aria-label", "Wissensgraph. Pfeiltasten springen zum nächsten verbundenen Knoten, Eingabe öffnet die Details, Plus und Minus zoomen, 0 zeigt alles.");
    flaeche.style.touchAction = "none";
    flaeche.style.webkitTouchCallout = "none"; // Halten greift einen Knoten – kein Auswahlmenü des Systems
    const ersatz = dok.createElement("ul"); // Ersatzinhalt für Hilfstechnik: dieselben Knoten als Liste
    flaeche.append(ersatz);
    const karte = dok.createElement("canvas");
    karte.className = "brain-graph-karte";
    karte.setAttribute("aria-hidden", "true");
    karte.style.touchAction = "none";
    behaelter.append(flaeche, karte);
    const ctx = flaeche.getContext("2d");
    const kctx = karte.getContext("2d");

    // ---------- Zustand ----------
    let zerstoert = false;
    let istAktiv = true;
    let K = [];                 // Knoten in ID-Reihenfolge
    let nIndex = new Map();
    let kanten = [];            // { a, b, gestrichelt, bogen }
    let nachbarn = [];
    let nachArt = new Map();    // Art → Indizes
    let px = new Float32Array(0);
    let py = new Float32Array(0);
    let hatLage = new Uint8Array(0);
    let deck = new Float32Array(0);
    let deckZiel = new Float32Array(0);
    let bx = new Float32Array(0);
    let by = new Float32Array(0);
    let br = new Float32Array(0);
    let kStufe = new Uint8Array(0);
    let signatur = "";
    let ersatzSignatur = "";
    let kam = { x: 0, y: 0, zoom: 1 };
    let flug = null;            // { von, nach, start, dauer }
    let kameraBeruehrt = false; // seit dem letzten Datenstand von Hand bewegt → nicht mehr automatisch einpassen
    let ersteLagen = true;
    let verdeckt = { links: 0, rechts: 0, oben: 0, unten: 0, einpassen: true, offen: false };
    let gewuenscht = null;      // Auswahl der Ansicht (der Eintrag im offenen Detail) – nur ihr Wechsel holt den Knoten in den Blick
    let blick = null;           // { vorher, nach }: Kamera vor und nach dem Verschieben für das Detail (zum Zurückstellen)
    let mitteAuf = null;        // { i, kamera }: zuletzt auf diesen Knoten zentriert
    let auswahl = -1;
    let hover = -1;
    let trefferMenge = null;    // Set von Indizes
    let sichtbarMenge = null;   // Set von IDs (Filter der Ansicht)
    let fokusMenge = null;      // Set von Indizes (Fokus-Modus)
    let fokusZustand = null;    // { id, tiefe, kamera }
    const hervor = new Map();   // Index → { start, dauer }
    let pulsBis = 0;
    const labelMerk = new Map();  // id → Platz
    // Labels: Sichtbarkeit, Seite und Kürzung werden NICHT bei jedem Bild entschieden, sondern einmal, wenn Zoom, Verschieben
    // und Ziehen 150 ms ruhen (labelStand). Dazwischen folgen die Labels nur ihrem Knoten.
    let labelStand = null;        // Map id → { i, platz, breite, hoehe, rr, text, fett, vorrang, unterdr }
    let labelLetzt = "";          // Fingerabdruck der Knotenlagen (Kamera, Layout, Ziehen) im letzten Bild
    let labelBewegt = -1e9;       // Zeitpunkt der letzten Bewegung
    let labelSchmutz = true;      // es gibt etwas Neues zu entscheiden
    let labelSchluessel = "";     // Auswahl, Hover, Treffer, Spur – ändern sich ohne Bewegung
    const labelSeitSeit = new Map(); // id → Zeitpunkt des letzten Seitenwechsels (höchstens einer pro Sekunde)
    const labelDeck = new Map();  // id → { a, ziel, x, y, breite, hoehe, text, fett }
    const breiten = new Map();    // „fett|text“ → Breite
    let farbe = FARBEN_STANDARD;
    let schrift = "sans-serif";
    let scheinBild = null;
    let cssB = 0;
    let cssH = 0;
    let dpr = 1;
    let gedrosselt = false;
    let groesseUhr = 0;
    let karteB = 0;
    let karteH = 0;
    let karteMass = null;
    let gespeichert = {};
    let speicherUhr = 0;
    let layoutBeginn = 0;
    let layoutMs = null;
    let layoutTicks = 0;
    let layoutLaeuft = false;
    let rafId = 0;
    let letztesBild = 0;
    const kosten = [];           // Zeichenkosten der letzten Bilder (ms)
    const bildZeiten = [];       // Zeitpunkte der letzten Bilder
    let bilder = 0;
    let schloesser = 0;          // im letzten Bild gezeichnete Schlösser (Messwert)
    let letzterTipp = null;      // { id, zeit, x, y } – Ort im Fenster: die Fläche kann unter dem Finger wandern
    let halteUhr = 0;
    const zeiger = new Map();
    let geste = null;
    let treiber = null;
    let uebergang = null;         // { von, ziel, hatte, start, dauer } – nur beim Neu-Anordnen

    try { gespeichert = (opt.positionen && opt.positionen.lesen && opt.positionen.lesen()) || {}; } catch { gespeichert = {}; }
    if (!gespeichert || typeof gespeichert !== "object") gespeichert = {};

    // ---------- Farben, Schrift ----------
    function farbenLesen() {
      let f = null;
      try { f = typeof opt.farben === "function" ? opt.farben() : opt.farben; } catch { f = null; }
      f = f && typeof f === "object" ? f : {};
      farbe = { ...FARBEN_STANDARD, ...f, arten: { ...FARBEN_STANDARD.arten, ...(f.arten || {}) } };
      try { schrift = fenster.getComputedStyle(behaelter).fontFamily || "sans-serif"; } catch { schrift = "sans-serif"; }
      // Schein als kleines Bild: radialer Verlauf, der auf einer Kosinus-Kurve bei Deckkraft 0 ausläuft (keine Kante)
      scheinBild = dok.createElement("canvas");
      scheinBild.width = 128;
      scheinBild.height = 128;
      const s = scheinBild.getContext("2d");
      s.fillStyle = farbe.akzent;
      s.fillRect(0, 0, 128, 128);
      const bild = s.getImageData(0, 0, 128, 128);
      for (let yy = 0; yy < 128; yy++) {
        for (let xx = 0; xx < 128; xx++) {
          const d = Math.min(1, Math.hypot(xx - 63.5, yy - 63.5) / 63.5);
          bild.data[(yy * 128 + xx) * 4 + 3] = Math.round(255 * (0.5 + 0.5 * Math.cos(Math.PI * d)) * (1 - d * 0.15));
        }
      }
      s.putImageData(bild, 0, 0);
      breiten.clear();
    }
    const labelSchrift = (fett) => `${fett ? 600 : 500} 12px ${schrift}`;
    function textBreite(text, fett) {
      const s = `${fett ? 1 : 0}|${text}`;
      let w = breiten.get(s);
      if (w === undefined) {
        ctx.font = labelSchrift(fett);
        w = ctx.measureText(text).width;
        breiten.set(s, w);
      }
      return w;
    }

    // ---------- Größe ----------
    function pufferAnlegen() {
      const r = behaelter.getBoundingClientRect();
      cssB = Math.max(0, Math.round(r.width));
      cssH = Math.max(0, Math.round(r.height));
      dpr = Math.min(fenster.devicePixelRatio || 1, 2) * (gedrosselt ? 0.67 : 1);
      dpr = Math.max(1, dpr);
      const b = Math.max(1, Math.round(cssB * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      if (flaeche.width !== b || flaeche.height !== h) { flaeche.width = b; flaeche.height = h; }
      const schmal = cssB < 720;
      karteB = schmal ? 112 : 168;
      karteH = schmal ? 76 : 112;
      const kd = Math.min(fenster.devicePixelRatio || 1, 2);
      karte.style.width = `${karteB}px`;
      karte.style.height = `${karteH}px`;
      if (karte.width !== Math.round(karteB * kd)) { karte.width = Math.round(karteB * kd); karte.height = Math.round(karteH * kd); }
    }
    function groesseGeaendert() {
      // sofort mit dem alten Puffer weiterzeichnen (das Canvas wird gestreckt), erst nach kurzer Ruhe neu anlegen
      const r = behaelter.getBoundingClientRect();
      const b = Math.round(r.width);
      const h = Math.round(r.height);
      if (b === cssB && h === cssH && Math.abs(Math.min(fenster.devicePixelRatio || 1, 2) * (gedrosselt ? 0.67 : 1) - dpr) < 0.01) return;
      const vorher = cssB > 1 && cssH > 1;
      cssB = Math.max(0, b);
      cssH = Math.max(0, h);
      fenster.clearTimeout(groesseUhr);
      if (!vorher) { pufferAnlegen(); if (!kameraBeruehrt) einpassenJetzt(true); anfordern(); return; }
      groesseUhr = fenster.setTimeout(() => { if (zerstoert) return; pufferAnlegen(); anfordern(); }, 120);
      anfordern();
    }

    // ---------- Daten ----------
    const versteckt = (i) => Boolean((sichtbarMenge && !sichtbarMenge.has(K[i].id)) || (fokusMenge && !fokusMenge.has(i)));

    let nahe = null; // Nachbarn von Auswahl und Hover: ihre Labels kommen dazu, auch in der Übersicht
    function zieleRechnen() {
      const n = K.length;
      let nah = null;
      if (hover >= 0 && !versteckt(hover)) { nah = new Uint8Array(n); nah[hover] = 1; for (const j of nachbarn[hover]) nah[j] = 1; }
      nahe = nah ? Uint8Array.from(nah) : null;
      if (auswahl >= 0 && !versteckt(auswahl)) { if (!nahe) nahe = new Uint8Array(n); for (const j of nachbarn[auswahl]) nahe[j] = 1; }
      for (let i = 0; i < n; i++) {
        let z = 1;
        if (versteckt(i)) z = 0;
        else if (i === auswahl) z = 1;
        else if (nah) z = nah[i] ? 1 : DIMM_HOVER;
        else if (trefferMenge) z = trefferMenge.has(i) ? 1 : DIMM_TREFFER;
        deckZiel[i] = z;
      }
      if (wenig()) deck.set(deckZiel);
      anfordern();
    }

    function ersatzListe() {
      const sig = K.map((k) => `${k.id}\u0001${k.titel}\u0001${k.art}\u0001${k.status}`).join("\u0002");
      if (sig === ersatzSignatur) return;
      ersatzSignatur = sig;
      const neu = dok.createDocumentFragment();
      for (const k of K) {
        const li = dok.createElement("li");
        const a = dok.createElement("a");
        a.href = `#/brain/${encodeURIComponent(k.id)}`;
        a.tabIndex = -1;
        a.textContent = `${k.titel} – ${ART_NAMEN[k.art] || k.art}, ${STATUS_NAMEN[k.status] || k.status}${k.geschuetzt ? ", geschützt" : ""}`;
        li.append(a);
        neu.append(li);
      }
      ersatz.replaceChildren(neu);
    }

    function setzen(daten) {
      if (zerstoert) return;
      const roh = (daten && Array.isArray(daten.knoten) ? daten.knoten : []).filter((k) => k && typeof k.id === "string" && k.id);
      const gesehen = new Set();
      const liste = [];
      for (const k of roh) { if (!gesehen.has(k.id)) { gesehen.add(k.id); liste.push(k); } }
      liste.sort(nachId);
      const n = liste.length;
      const alt = { index: nIndex, px, py, hatLage, deck, K };
      const auswahlId = auswahl >= 0 && K[auswahl] ? K[auswahl].id : null;
      const hoverId = hover >= 0 && K[hover] ? K[hover].id : null;
      const trefferIds = trefferMenge ? [...trefferMenge].map((i) => K[i] && K[i].id) : null;
      const fokusIds = fokusMenge ? [...fokusMenge].map((i) => K[i] && K[i].id) : null;
      const hervorAlt = [...hervor].map(([i, h]) => [K[i] && K[i].id, h]);
      const ziehId = geste && geste.i >= 0 && K[geste.i] ? K[geste.i].id : null;
      const mitIds = ziehId && geste.mit ? geste.mit.map((i) => K[i] && K[i].id) : null;

      uebergang = null; // neuer Datenstand: ein laufendes Hinübergleiten endet (die Reihenfolge der Knoten kann sich ändern)
      mitteAuf = null;  // … und gemerkte Nummern von Knoten gelten nicht mehr
      if (flug) flug.mitte = -1;
      nIndex = new Map(liste.map((k, i) => [k.id, i]));
      // Kanten: jedes Paar einmal, ohne Schleifen
      const paare = new Set();
      kanten = [];
      for (const k of daten && Array.isArray(daten.kanten) ? daten.kanten : []) {
        if (!k) continue;
        const a = nIndex.get(k.von);
        const b = nIndex.get(k.nach);
        if (a === undefined || b === undefined || a === b) continue;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        if (paare.has(lo * n + hi)) continue;
        paare.add(lo * n + hi);
        kanten.push({ a: lo, b: hi, gestrichelt: k.art === "notiz_von" || k.art === "bericht_zu", bogen: (hash32(`${liste[lo].id}>${liste[hi].id}`) & 1 ? 1 : -1) * 0.09 });
      }
      kanten.sort((p, q) => p.a - q.a || p.b - q.b);
      nachbarn = Array.from({ length: n }, () => []);
      for (const e of kanten) { nachbarn[e.a].push(e.b); nachbarn[e.b].push(e.a); }
      const reihe = liste.map((_, i) => i).sort((a, b) => nachbarn[b].length - nachbarn[a].length || a - b);
      const rang = new Float32Array(n);
      reihe.forEach((i, platz) => { rang[i] = n ? platz / n : 0; });

      px = new Float32Array(n); py = new Float32Array(n); hatLage = new Uint8Array(n);
      deck = new Float32Array(n); deckZiel = new Float32Array(n);
      bx = new Float32Array(n); by = new Float32Array(n); br = new Float32Array(n);
      kStufe = new Uint8Array(kanten.length);
      nachArt = new Map();
      const layoutOpt = { ...LAYOUT_STANDARD, ...(opt.layout || {}) };
      K = liste.map((k, i) => {
        const grad = nachbarn[i].length;
        const j = alt.index.get(k.id);
        let fest = false;
        if (j !== undefined && alt.hatLage[j]) { px[i] = alt.px[j]; py[i] = alt.py[j]; hatLage[i] = 1; deck[i] = alt.deck[j]; fest = alt.K[j].fest; }
        else {
          const g = gespeichert[k.id];
          if (Array.isArray(g) && Number.isFinite(g[0]) && Number.isFinite(g[1])) { px[i] = g[0]; py[i] = g[1]; hatLage[i] = 1; fest = Boolean(g[2]); }
          deck[i] = 0; // neue Knoten blenden ein
        }
        const art = String(k.art || "");
        if (!nachArt.has(art)) nachArt.set(art, []);
        nachArt.get(art).push(i);
        const titel = String(k.titel == null ? "" : k.titel);
        return { id: k.id, art, titel, kurz: kuerzen(titel), status: String(k.status || ""), geschuetzt: Boolean(k.geschuetzt), grad, r: knotenRadius(Math.max(grad, Math.floor(Number(k.grad) || 0)), layoutOpt), rang: rang[i], schwelle: labelSchwelle(grad, rang[i], n), fest };
      });
      const idx = (id) => (id != null && nIndex.has(id) ? nIndex.get(id) : -1);
      auswahl = idx(auswahlId);
      hover = idx(hoverId);
      trefferMenge = trefferIds ? new Set(trefferIds.map(idx).filter((i) => i >= 0)) : null;
      fokusMenge = fokusIds ? new Set(fokusIds.map(idx).filter((i) => i >= 0)) : null;
      hervor.clear();
      for (const [id, h] of hervorAlt) if (idx(id) >= 0) hervor.set(idx(id), h);
      if (geste && geste.i >= 0) {
        // mitten in einer Geste kam ein neuer Datenstand (z. B. aus einem anderen Fenster): die Geste folgt ihrem Knoten
        if (idx(ziehId) < 0) { halteEnde(); if (geste.typ === "knoten") geste = null; else geste.i = -1; } // der Knoten ist weg
        else { geste.i = idx(ziehId); if (mitIds) geste.mit = mitIds.map(idx).filter((i) => i >= 0); }
      }
      for (const id of [...labelDeck.keys()]) if (!nIndex.has(id)) { labelDeck.delete(id); labelMerk.delete(id); labelSeitSeit.delete(id); }
      labelStand = null; labelSchmutz = true; // neue Knotenliste: Indizes stimmen nicht mehr

      const neueSignatur = `${liste.map((k) => k.id).join("\u0001")}\u0002${kanten.map((e) => `${e.a}>${e.b}`).join(",")}`;
      const strukturNeu = neueSignatur !== signatur;
      signatur = neueSignatur;
      zieleRechnen();
      ersatzListe();
      pulsBis = jetztMs() + PULS_MS;
      if (strukturNeu) layoutStarten();
      // Lagen schon da (gespeichert): gleich einpassen – sonst zeigte das erste Bild kurz den falschen Ausschnitt
      if (ersteLagen && !kameraBeruehrt && hatLage.some((h) => h)) einpassenJetzt(true);
      anfordern();
    }

    // ---------- Layout-Treiber: Web Worker oder Hauptfaden ----------
    /** ohneLagen: frisch anordnen – nur fixierte Knoten geben ihre Lage mit. */
    function layoutEingabe(ohneLagen = false) {
      return {
        knoten: K.map((k, i) => (hatLage[i] && (!ohneLagen || k.fest) ? { id: k.id, x: px[i], y: py[i], fest: k.fest } : { id: k.id, fest: k.fest })),
        kanten: kanten.map((e) => ({ von: K[e.a].id, nach: K[e.b].id })),
      };
    }
    function lagenAnwenden(puffer) {
      const n = K.length;
      if (!puffer || puffer.length !== n * 2) return false;
      if (uebergang) { uebergang.ziel = Float32Array.from(puffer); return true; } // „Neu anordnen“: das Bild gleitet hinüber (siehe bild)
      const gezogen = geste && geste.typ === "knoten" && geste.bewegt ? geste.i : -1;
      const mit = gezogen >= 0 && geste.mit && geste.mit.length ? new Set(geste.mit) : null;
      for (let i = 0; i < n; i++) {
        if (i === gezogen || (mit && mit.has(i))) continue;
        px[i] = puffer[2 * i];
        py[i] = puffer[2 * i + 1];
        hatLage[i] = 1;
      }
      if (ersteLagen) { ersteLagen = false; if (!kameraBeruehrt) einpassenJetzt(true); }
      return true;
    }
    function ruheErreicht() {
      if (!layoutLaeuft) return;
      layoutLaeuft = false;
      if (layoutMs === null) layoutMs = Math.round(jetztMs() - layoutBeginn);
      if (!kameraBeruehrt) einpassenJetzt(false);
      lagenSpeichernBald();
      pulsBis = jetztMs() + PULS_MS;
    }
    function lagenSpeichernJetzt() {
      fenster.clearTimeout(speicherUhr);
      speicherUhr = 0;
      const rund = (w) => Math.round(w * 10) / 10;
      for (let i = 0; i < K.length; i++) if (hatLage[i]) gespeichert[K[i].id] = [rund(px[i]), rund(py[i]), K[i].fest ? 1 : 0];
      const alle = Object.keys(gespeichert);
      if (alle.length > 3000) for (const id of alle) if (!nIndex.has(id)) delete gespeichert[id];
      try { opt.positionen.schreiben(gespeichert); } catch { /* voll oder gesperrt – dann eben beim nächsten Mal neu anordnen */ }
    }
    function lagenSpeichernBald() {
      if (!opt.positionen || typeof opt.positionen.schreiben !== "function") return;
      fenster.clearTimeout(speicherUhr);
      speicherUhr = fenster.setTimeout(() => { if (!zerstoert) lagenSpeichernJetzt(); }, 450);
    }

    function treiberLokal() {
      let layout = null;
      return {
        art: "hauptfaden",
        start(eingabe, { sofort }) {
          layout = erstelleLayout(eingabe, layoutOptionen());
          if (sofort) layout.bisRuhe(MAX_TICKS, 2500);
          else layout.vorrechnen(0.35, 30);
          lagenAnwenden(layout.lagen());
          layoutTicks = layout.ticks;
          if (layout.ruht()) ruheErreicht();
        },
        /** Im Bild rechnen: höchstens budget ms. true = läuft noch. */
        tick(budget) {
          if (!layout) return false;
          if (layout.ruht()) { if (layoutLaeuft) ruheErreicht(); return false; }
          const ende = jetztMs() + budget;
          let k = 0;
          do { layout.schritt(1); k++; } while (k < 4 && !layout.ruht() && jetztMs() < ende);
          lagenAnwenden(layout.lagen());
          layoutTicks = layout.ticks;
          if (layout.ruht()) { ruheErreicht(); return false; }
          return true;
        },
        /** Neuer Datenstand: Lagen bleiben, nur rund um das Geänderte wird gerechnet. */
        neu(eingabe, { sofort }) {
          if (!layout) { this.start(eingabe, { sofort }); return; }
          layout.aktualisieren(eingabe);
          if (sofort) layout.bisRuhe(MAX_TICKS, 2500);
          lagenAnwenden(layout.lagen());
          layoutTicks = layout.ticks;
          if (layout.ruht()) ruheErreicht();
        },
        zieh(id, x, y, ruhig) { if (layout) { layout.ziehen(id, x, y, { ruhig }); anfordern(); } },
        versetzen(liste) { if (layout) layout.versetzen(liste); },
        los(id, fest, ruhig) { if (layout) { layout.loslassen(id, fest); if (!ruhig) layoutLaeuft = true; anfordern(); } },
        fest(id, an, x, y, ruhig) { if (layout) { layout.fixieren(id, an, x, y); if (!an && !ruhig) { layout.anstossen([id], 0.2); layoutLaeuft = true; } anfordern(); } },
        pause() {},
        weiter() { anfordern(); },
        ende() { layout = null; },
      };
    }
    function treiberWorker(url) {
      let w = null;
      let nr = 0;
      let bereit = false;
      let wache = 0;
      let eingang = null;
      let letzter = null;
      let gestartet = false;
      try { w = new fenster.Worker(url); } catch { return null; }
      const ausfall = () => {
        // Worker lädt nicht (z. B. CSP, Netz) oder antwortet nicht: im Hauptfaden weiterrechnen
        if (!w) return;
        fenster.clearTimeout(wache);
        try { w.terminate(); } catch { /* schon weg */ }
        w = null;
        if (zerstoert) return;
        treiber = treiberLokal();
        if (letzter) treiber.start(layoutEingabe(), letzter);
        anfordern();
      };
      w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); ausfall(); };
      w.onmessageerror = ausfall;
      w.onmessage = (ereignis) => {
        const d = ereignis.data;
        if (!d || d.nr !== nr) return;
        if (d.typ === "bereit") { bereit = true; fenster.clearTimeout(wache); return; }
        if (d.typ === "lagen") { eingang = d; anfordern(); }
      };
      const senden = (d, uebertragen) => { if (w) { try { w.postMessage({ ...d, nr }, uebertragen || []); } catch { ausfall(); } } };
      return {
        art: "worker",
        start(eingabe, extra) {
          letzter = extra;
          nr++;
          bereit = false;
          gestartet = true;
          eingang = null;
          fenster.clearTimeout(wache);
          wache = fenster.setTimeout(() => { if (!bereit) ausfall(); }, 3000);
          senden({ typ: "start", knoten: eingabe.knoten, kanten: eingabe.kanten, optionen: layoutOptionen(), sofort: Boolean(extra.sofort) });
        },
        /** Neuer Datenstand: der Worker behält seine Lagen und rechnet nur rund um das Geänderte. */
        neu(eingabe, extra) {
          if (!gestartet) { this.start(eingabe, extra); return; }
          letzter = extra;
          nr++;
          eingang = null;
          senden({ typ: "neu", knoten: eingabe.knoten, kanten: eingabe.kanten, sofort: Boolean(extra.sofort) });
        },
        /** Im Bild: den neuesten Stand übernehmen und quittieren. */
        tick() {
          if (!eingang) return false;
          const d = eingang;
          eingang = null;
          lagenAnwenden(d.puffer);
          layoutTicks = d.ticks;
          if (d.ruht) ruheErreicht();
          senden({ typ: "ack", puffer: d.puffer }, [d.puffer.buffer]);
          return false; // das nächste Bild fordert die nächste Nachricht an
        },
        zieh(id, x, y, ruhig) { senden({ typ: "zieh", id, x, y, ruhig }); },
        versetzen(liste) { senden({ typ: "lage", lagen: liste }); },
        los(id, fest, ruhig) { if (!ruhig) layoutLaeuft = true; senden({ typ: "los", id, fest }); }, // ruhig gezogen: es kommt kein Bild mehr zurück
        fest(id, an, x, y, ruhig) { if (!an && !ruhig) layoutLaeuft = true; senden({ typ: "fest", id, fest: an, x, y, ruhig }); },
        pause() { senden({ typ: "pause" }); },
        weiter() { senden({ typ: "weiter" }); anfordern(); },
        ende() { fenster.clearTimeout(wache); if (w) { try { w.terminate(); } catch { /* egal */ } w = null; } },
      };
    }
    /** Layout-Werte für einen frischen Lauf: die der Ansicht plus das Seitenverhältnis der Fläche. */
    function layoutOptionen() {
      const seite = cssB > 1 && cssH > 1 ? klemmen(cssH / cssB, 0.5, 2) : 1;
      return { ...(opt.layout || {}), seite: Math.round(seite * 20) / 20 };
    }
    function layoutStarten() {
      layoutBeginn = jetztMs();
      layoutMs = null;
      layoutLaeuft = true;
      ersteLagen = !K.some((_, i) => hatLage[i]) || ersteLagen;
      const erster = !treiber;
      if (!treiber) treiber = (opt.workerUrl && typeof fenster.Worker === "function" && treiberWorker(opt.workerUrl)) || treiberLokal();
      if (erster) treiber.start(layoutEingabe(), { sofort: wenig() });
      else treiber.neu(layoutEingabe(), { sofort: wenig() });
    }

    // ---------- Kamera ----------
    function grenzen(nurSichtbare = true) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let zahl = 0;
      for (let i = 0; i < K.length; i++) {
        if (!hatLage[i] || (nurSichtbare && versteckt(i))) continue;
        const r = K[i].r;
        if (px[i] - r < minX) minX = px[i] - r;
        if (px[i] + r > maxX) maxX = px[i] + r;
        if (py[i] - r < minY) minY = py[i] - r;
        if (py[i] + r > maxY) maxY = py[i] + r;
        zahl++;
      }
      return zahl ? { minX, minY, maxX, maxY, zahl } : null;
    }
    /** mitte: Nummer des Knotens, auf den der Flug zentriert (ändert sich dabei der freie Bereich, zieht das Ziel nach). */
    function fliegen(ziel, dauer = FLUG_MS, mitte = -1) {
      if (!flug && gleicheKamera(kam, ziel)) return; // steht schon dort
      if (dauer <= 0 || wenig() || cssB < 2) { kam = { ...ziel }; flug = null; anfordern(); return; }
      flug = { von: { ...kam }, nach: { ...ziel }, start: 0, dauer, mitte };
      anfordern();
    }
    /** Wohin die Kamera will: das Ziel eines laufenden Flugs, sonst ihr Stand. */
    const kameraZiel = () => (flug ? flug.nach : kam);
    /** Die Ränder, mit denen gerechnet wird (zu wenig frei → keine, siehe freieRaender). */
    const frei = () => freieRaender(verdeckt, cssB, cssH);
    /** Liegt der Knoten bei dieser Kamera in der freien Fläche (mit rand px Abstand zu ihrem Rand)? */
    const knotenFrei = (i, kamera, r = frei(), rand = 56) => imFreien(zuBild(kamera, px[i], py[i], cssB, cssH), cssB, cssH, r, rand);
    const RAND_DETAIL = 12; // geht das Detail auf, rückt die Kamera nur für Knoten, die es (fast) verdeckt – nicht für jeden am Rand
    /** Bedienelemente über der Fläche (Minimap, Legende, Knöpfe): Die Kamera rückt, bis kein Knoten darunter liegt. */
    function meiden(ziel, r, schmal) {
      let dinge = null;
      try { dinge = typeof opt.hindernisse === "function" ? opt.hindernisse() : null; } catch { dinge = null; }
      if (!Array.isArray(dinge) || !dinge.length) return ziel;
      const punkte = [];
      for (let i = 0; i < K.length; i++) if (hatLage[i] && !versteckt(i)) punkte.push({ x: px[i], y: py[i], r: K[i].r });
      return kameraAusweichen(ziel, punkte, cssB, cssH, {
        hindernisse: dinge, frei: { links: r.links, oben: r.oben, rechts: cssB - r.rechts, unten: cssH - r.unten },
        rand: schmal ? 12 : 16, randUnten: schmal ? 24 : 32, radius: (w, zoom) => Math.max(R_MIN, w * radiusZoom(zoom)),
      });
    }
    function einpassenJetzt(sofort) {
      const g = grenzen(true);
      if (!g || cssB < 2 || cssH < 2) return;
      const r = frei();
      const schmal = cssB < 520;
      // Platz für die Labels unter den Knoten mitdenken; ein Blatt (einpassen: false) liegt nur über der Fläche
      const flaecheFrei = r.einpassen ? r : { links: 0, rechts: 0, oben: 0, unten: 0 };
      let ziel = meiden(kameraEinpassen(g, cssB, cssH, { rand: schmal ? 28 : 56, verdeckt: flaecheFrei, maxZoom: 1.5 }), flaecheFrei, schmal);
      // … dann muss der Eintrag des offenen Details im freien Streifen stehen
      const i = gewuenscht != null && nIndex.has(gewuenscht) ? nIndex.get(gewuenscht) : -1;
      if (!r.einpassen && i >= 0 && hatLage[i] && !versteckt(i) && !knotenFrei(i, ziel, r, RAND_DETAIL)) ziel = kameraAuf(i, ziel.zoom);
      fliegen(ziel, sofort ? 0 : FLUG_MS);
    }
    const freieMitte = () => { const r = frei(); return { x: r.links + (cssB - r.links - r.rechts) / 2, y: r.oben + (cssH - r.oben - r.unten) / 2 }; };
    function kameraAuf(i, zoom) {
      const m = freieMitte();
      const z = klemmen(zoom, ZOOM_MIN, ZOOM_MAX);
      return { x: px[i] - (m.x - cssB / 2) / z, y: py[i] - (m.y - cssH / 2) / z, zoom: z };
    }
    /**
     * Knoten in die freie Fläche holen, wenn er außerhalb liegt. fuerDetail: Das Verschieben gilt dem aufgehenden Detail –
     * die Kamera davor wird gemerkt (blickZurueck stellt sie wieder her).
     */
    function sichtbarMachen(i, fuerDetail = false) {
      if (i < 0 || !hatLage[i] || cssB < 2) return;
      const jetzt = kameraZiel();
      if (knotenFrei(i, jetzt, frei(), fuerDetail ? RAND_DETAIL : 56)) return;
      const ziel = kameraAuf(i, jetzt.zoom);
      if (fuerDetail) {
        if (!(blick && gleicheKamera(jetzt, blick.nach))) blick = { vorher: { ...jetzt } }; // sonst: weiter vom Stand vor dem ersten Verschieben aus
        blick.nach = { ...ziel };
      }
      fliegen(ziel);
    }
    /**
     * Das Detail ist zu: Kamera zurück – aber nur, wenn sie seit dem Verschieben niemand von Hand bewegt hat.
     * sofort: ohne Flug (am Handy springt mit dem Blatt ohnehin das ganze Bild zurück – dann steht gleich alles wie vorher).
     */
    function blickZurueck(sofort) {
      const b = blick;
      blick = null;
      if (!kameraBeruehrt) { einpassenJetzt(sofort); return; } // nie von Hand bewegt: wieder alles zeigen, jetzt in der ganzen Fläche
      if (b && gleicheKamera(kameraZiel(), b.nach)) fliegen(b.vorher, sofort ? 0 : FLUG_MS); // eigener Ausschnitt: genau dorthin zurück
    }
    /**
     * Ränder setzen, die Panel oder Blatt verdecken (offen: Das Detail ist da – auch wenn es gerade nichts verdeckt).
     * zurueck: Geht es zu, die Kamera zurückstellen.
     */
    function verdecktSetzen(v, zurueck) {
      const b0 = cssB;
      const h0 = cssH;
      groesseGeaendert(); // das Blatt ändert am Handy auch die Höhe der Fläche – erst damit stimmt die Rechnung
      const neu = { links: Math.max(0, (v && v.links) || 0), rechts: Math.max(0, (v && v.rechts) || 0), oben: Math.max(0, (v && v.oben) || 0), unten: Math.max(0, (v && v.unten) || 0), einpassen: !(v && v.einpassen === false) };
      neu.offen = Boolean(v && v.offen) || neu.links + neu.rechts + neu.oben + neu.unten > 0;
      const war = verdeckt.offen;
      const gleich = neu.offen === war && neu.einpassen === verdeckt.einpassen && ["links", "rechts", "oben", "unten"].every((s) => Math.abs(neu[s] - verdeckt[s]) < 1.5);
      verdeckt = neu;
      const andereGroesse = neu.offen !== war && b0 > 1 && h0 > 1 && (cssB !== b0 || cssH !== h0);
      if (andereGroesse) {
        // Mit dem Detail ändert sich die Größe der Fläche (das Blatt nimmt ihr unten Höhe): Das Bild bleibt dabei oben
        // links stehen, statt um die halbe Differenz zu rutschen – und steht nach dem Schließen wieder genau wie vorher
        const dx = (cssB - b0) / 2;
        const dy = (cssH - h0) / 2;
        for (const k of flug ? [kam, flug.von, flug.nach] : [kam]) { k.x += dx / k.zoom; k.y += dy / k.zoom; }
        if (blick) for (const k of [blick.vorher, blick.nach]) { k.x += dx / k.zoom; k.y += dy / k.zoom; }
        if (mitteAuf) { mitteAuf.kamera.x += dx / mitteAuf.kamera.zoom; mitteAuf.kamera.y += dy / mitteAuf.kamera.zoom; }
      }
      if (gleich) return;
      if (neu.offen) {
        // eben auf einen Knoten zentriert (Doppeltipp, Sprung vom Quellen-Chip), und erst jetzt geht das Detail auf: Mitte des freien Bereichs
        const m = mitteAuf;
        if (m && m.i < K.length && hatLage[m.i] && gleicheKamera(kameraZiel(), m.kamera)) {
          const ziel = kameraAuf(m.i, m.kamera.zoom);
          m.kamera = ziel;
          if (flug) flug.nach = { ...ziel }; else fliegen(ziel, FLUG_MS, m.i);
        }
      } else if (war && zurueck) blickZurueck(andereGroesse);
    }

    // ---------- Zeichnen ----------
    function rundRechteck(c, x, y, w, h, r) {
      c.beginPath();
      if (typeof c.roundRect === "function") { c.roundRect(x, y, w, h, r); return; }
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }
    /** s: Größe (1 = volle Größe, kleiner an kleinen Knoten – siehe schlossMass). */
    function schlossZeichnen(x, y, a, s = 1) {
      ctx.globalAlpha = a;
      ctx.fillStyle = farbe.platte;
      ctx.beginPath();
      ctx.arc(x, y, 5.6 * s, 0, ZWEI_PI);
      ctx.fill();
      ctx.fillStyle = farbe.textLeise;
      ctx.strokeStyle = farbe.textLeise;
      ctx.lineWidth = Math.max(0.8, 1.1 * s);
      ctx.setLineDash([]);
      rundRechteck(ctx, x - 2.7 * s, y - 0.7 * s, 5.4 * s, 3.9 * s, 0.9 * s);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y - 0.9 * s, 1.7 * s, Math.PI, 0);
      ctx.stroke();
    }

    function zeichnen(zeit, dt) {
      const b = cssB;
      const h = cssH;
      if (b < 2 || h < 2) return false;
      const t0 = jetztMs();
      const n = K.length;
      const z = kam.zoom;
      const f = farbe;
      const ruhig = wenig();
      let laeuft = false;
      ctx.setTransform(flaeche.width / b, 0, 0, flaeche.height / h, 0, 0);
      ctx.clearRect(0, 0, b, h);
      const rz = radiusZoom(z);
      const hb = b / 2;
      const hh = h / 2;
      for (let i = 0; i < n; i++) {
        bx[i] = (px[i] - kam.x) * z + hb;
        by[i] = (py[i] - kam.y) * z + hh;
        br[i] = Math.max(R_MIN, K[i].r * rz);
      }
      const rand = 40;
      const imBild = (i) => hatLage[i] && deck[i] > 0.012 && bx[i] > -rand && bx[i] < b + rand && by[i] > -rand && by[i] < h + rand;

      // 1 Schein (Gabi-Spur): weich, ohne Kante – liegt unter allem
      if (hervor.size) {
        for (const [i, s] of [...hervor]) {
          const alter = zeit - s.start;
          if (alter >= s.dauer) { hervor.delete(i); continue; }
          if (!imBild(i) || ruhig) continue;
          const phase = alter / s.dauer;
          const staerke = Math.pow(Math.sin(Math.PI * phase * 2), 2) * (1 - phase * 0.3); // zwei sanfte Wellen
          const r = br[i] + 22 + 16 * staerke;
          ctx.globalAlpha = 0.55 * staerke * deck[i];
          ctx.drawImage(scheinBild, bx[i] - r, by[i] - r, r * 2, r * 2);
        }
        if (hervor.size && !ruhig) laeuft = true;
      }

      // 2 Kanten: nach Deckkraft-Stufe und Strichart gebündelt
      const E = kanten.length;
      let stufen = 0;
      for (let e = 0; e < E; e++) {
        const k = kanten[e];
        kStufe[e] = 0;
        if (!hatLage[k.a] || !hatLage[k.b]) continue;
        const d = Math.min(deck[k.a], deck[k.b]);
        if (d < 0.02) continue;
        if ((bx[k.a] < -rand && bx[k.b] < -rand) || (bx[k.a] > b + rand && bx[k.b] > b + rand) || (by[k.a] < -rand && by[k.b] < -rand) || (by[k.a] > h + rand && by[k.b] > h + rand)) continue;
        const stark = d > 0.5 && ((hover >= 0 && (k.a === hover || k.b === hover)) || (auswahl >= 0 && (k.a === auswahl || k.b === auswahl)));
        const s = stark ? 9 : Math.max(1, Math.round(d * 8));
        kStufe[e] = s;
        stufen |= 1 << (s + (k.gestrichelt ? 10 : 0));
      }
      const breiteLinie = klemmen(0.65 + 0.35 * z, 0.75, 1.5);
      for (let strich = 0; strich < 2; strich++) {
        for (let s = 1; s <= 9; s++) {
          if (!(stufen & (1 << (s + strich * 10)))) continue;
          ctx.beginPath();
          for (let e = 0; e < E; e++) {
            if (kStufe[e] !== s || Number(kanten[e].gestrichelt) !== strich) continue;
            const k = kanten[e];
            let x1 = bx[k.a];
            let y1 = by[k.a];
            let x2 = bx[k.b];
            let y2 = by[k.b];
            const dx = x2 - x1;
            const dy = y2 - y1;
            const l = Math.sqrt(dx * dx + dy * dy);
            if (l <= br[k.a] + br[k.b] + 1) continue;
            const ux = dx / l;
            const uy = dy / l;
            x1 += ux * br[k.a]; y1 += uy * br[k.a];
            x2 -= ux * br[k.b]; y2 -= uy * br[k.b];
            ctx.moveTo(x1, y1);
            if (l < 30) ctx.lineTo(x2, y2);
            else ctx.quadraticCurveTo((x1 + x2) / 2 - uy * l * k.bogen, (y1 + y2) / 2 + ux * l * k.bogen, x2, y2); // leicht gebogen
          }
          ctx.setLineDash(strich ? [2.5, 3.5] : []);
          ctx.globalAlpha = s === 9 ? 1 : s / 8;
          ctx.strokeStyle = s === 9 ? f.kanteStark : f.kante;
          ctx.lineWidth = s === 9 ? breiteLinie + 0.6 : breiteLinie;
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);

      // 3 Knoten: je Art eine Farbe, je Deckkraft ein Pfad; feiner Rand in Hintergrundfarbe trennt sie von den Kanten
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = f.hintergrund;
      const arten = [...ARTEN_REIHE, ...[...nachArt.keys()].filter((a) => !ARTEN_REIHE.includes(a))];
      for (const art of arten) {
        const liste = nachArt.get(art);
        if (!liste) continue;
        ctx.fillStyle = f.arten[art] || f.textLeise;
        let stufe = -1;
        for (const i of liste) {
          if (!imBild(i)) continue;
          const a = Math.round((K[i].status === "entwurf" ? deck[i] * 0.3 : deck[i]) * 20);
          if (a !== stufe) {
            if (stufe >= 0) { ctx.fill(); ctx.stroke(); }
            ctx.beginPath();
            ctx.globalAlpha = a / 20;
            stufe = a;
          }
          ctx.moveTo(bx[i] + br[i], by[i]);
          ctx.arc(bx[i], by[i], br[i], 0, ZWEI_PI);
        }
        if (stufe >= 0) { ctx.fill(); ctx.stroke(); }
      }

      // 4 Status und Zustände – nie nur über Farbe
      const puls = !ruhig && zeit < pulsBis;
      let zuKlaerenDa = false;
      let gezeichnet = 0;
      for (let i = 0; i < n; i++) {
        if (!imBild(i)) continue;
        const k = K[i];
        const x = bx[i];
        const y = by[i];
        const r = br[i];
        const a = deck[i];
        if (k.status === "entwurf") {
          ctx.globalAlpha = a;
          ctx.strokeStyle = f.arten[k.art] || f.textLeise;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3.2, 2.6]);
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, r - 0.75), 0, ZWEI_PI);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (k.status === "zu_klaeren") {
          zuKlaerenDa = true;
          const ab = Math.min(3.2, 1.3 + r * 0.28); // Ring und Puls wachsen mit dem Knoten – in der Übersicht bleibt es fein
          const dick = klemmen(r * 0.28, 1.1, 2);
          ctx.strokeStyle = f.warn;
          ctx.setLineDash([]);
          if (puls) {
            for (let welle = 0; welle < 2; welle++) {
              const p = (((zeit + welle * PULS_PERIODE / 2 + (hash32(k.id) % 400)) % PULS_PERIODE) / PULS_PERIODE);
              ctx.globalAlpha = a * 0.5 * (1 - p) * (1 - p);
              ctx.lineWidth = dick * 0.8;
              ctx.beginPath();
              ctx.arc(x, y, r + ab + p * Math.min(11, 3 + r), 0, ZWEI_PI);
              ctx.stroke();
            }
          }
          ctx.globalAlpha = a;
          ctx.lineWidth = dick;
          ctx.beginPath();
          ctx.arc(x, y, r + ab, 0, ZWEI_PI);
          ctx.stroke();
          if (ruhig) { // ohne Bewegung: stiller Doppelring
            ctx.globalAlpha = a * 0.5;
            ctx.lineWidth = Math.max(1, dick * 0.6);
            ctx.beginPath();
            ctx.arc(x, y, r + ab * 2 + 0.4, 0, ZWEI_PI);
            ctx.stroke();
          }
          if (r >= 6.5) {
            ctx.globalAlpha = a;
            ctx.fillStyle = f.platte;
            ctx.font = `700 ${Math.round(klemmen(r * 1.25, 10, 18))}px ${schrift}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("?", x, y + 0.5);
          }
        }
        if (k.geschuetzt) { // Schloss: wächst mit dem Knoten, hängt nicht am Zoom
          const m = schlossMass(r);
          if (m.deckkraft > 0) { schlossZeichnen(x + r * 0.74, y + r * 0.74, a * m.deckkraft, m.groesse); gezeichnet++; }
        }
        if (k.fest && r >= 4.5) { // fixiert: kleiner Punkt oben rechts
          ctx.globalAlpha = a;
          ctx.fillStyle = f.platte;
          ctx.beginPath();
          ctx.arc(x + r * 0.74, y - r * 0.74, 3.4, 0, ZWEI_PI);
          ctx.fill();
          ctx.fillStyle = f.textLeise;
          ctx.beginPath();
          ctx.arc(x + r * 0.74, y - r * 0.74, 1.8, 0, ZWEI_PI);
          ctx.fill();
        }
        const aussen = k.status === "zu_klaeren" ? 3.6 : 0;
        if (trefferMenge && trefferMenge.has(i) && i !== auswahl) {
          ctx.globalAlpha = a;
          ctx.strokeStyle = f.akzent;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(x, y, r + 3 + aussen, 0, ZWEI_PI);
          ctx.stroke();
        }
        if (hervor.has(i) && ruhig) { // Gabi-Spur ohne Bewegung: stiller Ring
          ctx.globalAlpha = a;
          ctx.strokeStyle = f.akzent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, r + 6.5 + aussen, 0, ZWEI_PI);
          ctx.stroke();
        }
        if (i === hover && i !== auswahl) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = f.text;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.arc(x, y, r + 3 + aussen, 0, ZWEI_PI);
          ctx.stroke();
        }
        if (i === auswahl) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = f.akzent;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(x, y, r + 4.4 + aussen, 0, ZWEI_PI);
          ctx.stroke();
        }
      }
      if (puls && zuKlaerenDa) laeuft = true;
      schloesser = gezeichnet;

      // 5 Labels. Entscheidung (Sichtbarkeit, Seite, Kürzung) nur, wenn Zoom/Verschieben/Ziehen 150 ms ruhen; dazwischen folgt
      // jedes Label nur seinem Knoten. Seite: standardmäßig rechts, ein Wechsel höchstens einmal pro Sekunde. Ein Label liegt
      // ganz im Bild oder gar nicht; sich überlappende Labels gibt es nicht (Gewinner: Verbindungen, dann Kennung).
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < n; i++) { sx += bx[i] + deck[i]; sy += by[i]; }
      const lage = `${Math.round(sx * 10)}|${Math.round(sy * 10)}|${b}|${h}`;
      if (lage !== labelLetzt) { labelLetzt = lage; labelBewegt = zeit; labelSchmutz = true; }
      const schluessel = `${auswahl}|${hover}|${trefferMenge ? trefferMenge.size : 0}|${hervor.size}`;
      if (schluessel !== labelSchluessel) { labelSchluessel = schluessel; labelSchmutz = true; }
      if (labelSchmutz && (labelStand === null || zeit - labelBewegt >= 150)) {
        labelSchmutz = false;
        const kandidaten = [];
        const sperren = [];
        for (let i = 0; i < n; i++) {
          if (!imBild(i)) continue;
          if (br[i] >= 3.5 && deck[i] > 0.5) sperren.push({ x: bx[i], y: by[i], r: br[i] + 1 }); // gedimmte Knoten dürfen überdeckt werden
          if (deck[i] < 0.5 || bx[i] < 0 || bx[i] > b || by[i] < 0 || by[i] > h) continue;
          const k = K[i];
          const erzwungen = i === auswahl || i === hover;
          const treffer = Boolean(trefferMenge && trefferMenge.has(i));
          const spur = hervor.has(i);
          const nachbar = Boolean(nahe && nahe[i]);
          // Hysterese: ein Label, das schon steht, bleibt bis 15 % unter seiner Schwelle
          const steht = Boolean(labelStand && labelStand.has(k.id));
          if (!erzwungen && !treffer && !spur && !nachbar && z < (steht ? k.schwelle * 0.85 : k.schwelle)) continue;
          const fett = k.grad >= 6;
          kandidaten.push({ id: k.id, i, x: bx[i], y: by[i], r: br[i] + (k.status === "zu_klaeren" ? 4 : 0), rr: k.status === "zu_klaeren" ? 4 : 0, breite: textBreite(k.kurz, fett), vorrang: k.grad + (treffer ? 1000 : 0) + (spur ? 800 : 0) + (nachbar ? 400 : 0), erzwungen, fett });
        }
        const vorher = new Map(labelMerk);
        const fest = new Set();
        for (const [id, t] of labelSeitSeit) if (zeit - t < 1000) fest.add(id);
        const gesetzt = labelsWaehlen(kandidaten, { breite: b, hoehe: h, merk: labelMerk, max: 140, sperren, innen: true, rechtsZuerst: true, fest });
        const nachIdKand = new Map(kandidaten.map((k) => [k.id, k]));
        labelStand = new Map();
        for (const g of gesetzt) {
          const k = nachIdKand.get(g.id);
          if (vorher.has(g.id) && vorher.get(g.id) !== g.platz) labelSeitSeit.set(g.id, zeit);
          labelStand.set(g.id, { i: k.i, platz: g.platz, breite: g.breite, hoehe: g.hoehe, rr: k.rr, text: K[k.i].kurz, fett: k.fett, vorrang: k.vorrang, unterdr: false });
        }
      } else if (labelSchmutz) laeuft = true; // die Entscheidung steht noch aus: weiterzeichnen, bis sie fällt

      // Sicherung zwischen zwei Entscheidungen: ein Label, das aus dem Bild liefe oder ein stärkeres berührte, wird
      // ausgeblendet und bleibt es bis zur nächsten Entscheidung – es kommt nie etwas dazu, so wechselt jedes höchstens einmal
      const rechtecke = [];
      if (labelStand) {
        const reihe = [...labelStand].sort((p, q) => (q[1].vorrang - p[1].vorrang) || (p[0] < q[0] ? -1 : 1));
        for (const [id, s2] of reihe) {
          if (!K[s2.i] || K[s2.i].id !== id) { s2.unterdr = true; continue; }
          const [x0, y0] = platzLage(s2.platz, { x: bx[s2.i], y: by[s2.i], r: br[s2.i] + s2.rr }, s2.breite, s2.hoehe);
          s2.x = x0; s2.y = y0;
          if (s2.unterdr) continue;
          if (x0 < 0 || y0 < 0 || x0 + s2.breite > b || y0 + s2.hoehe > h || rechtecke.some((r2) => x0 < r2[2] && x0 + s2.breite > r2[0] && y0 < r2[3] && y0 + s2.hoehe > r2[1])) { s2.unterdr = true; continue; }
          rechtecke.push([x0, y0, x0 + s2.breite, y0 + s2.hoehe]);
        }
      }
      for (const l of labelDeck.values()) l.ziel = 0;
      if (labelStand) {
        for (const [id, s2] of labelStand) {
          if (s2.unterdr) continue;
          let l = labelDeck.get(id);
          if (!l) { l = { a: ruhig ? 1 : 0 }; labelDeck.set(id, l); }
          l.ziel = 1; l.x = s2.x; l.y = s2.y; l.breite = s2.breite; l.hoehe = s2.hoehe; l.text = s2.text; l.fett = s2.fett; l.i = s2.i;
        }
      }
      // Ein- und Ausblenden nur über die Deckkraft: linear in 150 ms (bei „Bewegung reduzieren“ sofort)
      const schritt = ruhig ? 1 : dt / 150;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (let durchgang = 0; durchgang < 2; durchgang++) {
        ctx.font = labelSchrift(durchgang === 1);
        for (const [id, l] of labelDeck) {
          if (Boolean(l.fett) !== (durchgang === 1)) continue; // je Schrift ein Durchgang
          l.a = l.ziel > l.a ? Math.min(l.ziel, l.a + schritt) : Math.max(l.ziel, l.a - schritt);
          if (l.a !== l.ziel) laeuft = true;
          if (l.a <= 0.001) { if (l.ziel === 0) labelDeck.delete(id); continue; }
          const a = l.a * (l.i !== undefined && l.i < n ? Math.max(0.35, deck[l.i]) : 1);
          ctx.globalAlpha = a * 0.86;
          ctx.fillStyle = f.platte;
          rundRechteck(ctx, l.x, l.y, l.breite, l.hoehe, 5);
          ctx.fill();
          ctx.globalAlpha = a;
          ctx.fillStyle = f.text;
          ctx.fillText(l.text, l.x + 5, l.y + l.hoehe / 2 + 0.5);
        }
      }
      ctx.globalAlpha = 1;

      karteZeichnen();

      // Messwerte
      const dauer = jetztMs() - t0;
      kosten.push(dauer);
      if (kosten.length > 240) kosten.shift();
      bildZeiten.push(zeit);
      if (bildZeiten.length > 240) bildZeiten.shift();
      bilder++;
      drosselPruefen();
      return laeuft;
    }

    /** Zeichnen dauert auf diesem Gerät dauerhaft zu lang (p90 > 12 ms über 2 s Bewegung): einmal die Pixeldichte senken. */
    function drosselPruefen() {
      if (gedrosselt || opt.drossel === false || kosten.length < 120 || bilder % 60 || (fenster.devicePixelRatio || 1) <= 1) return;
      const letzte = kosten.slice(-120).sort((a, b) => a - b);
      if (letzte[107] > 12) { gedrosselt = true; kosten.length = 0; pufferAnlegen(); }
    }

    function karteZeichnen() {
      if (!karteB || karte.width < 2) return;
      const w = karteB;
      const h = karteH;
      kctx.setTransform(karte.width / w, 0, 0, karte.height / h, 0, 0);
      kctx.clearRect(0, 0, w, h);
      const g = grenzen(false);
      if (!g) { karteMass = null; return; }
      const polster = 6;
      const gb = Math.max(60, g.maxX - g.minX);
      const gh = Math.max(60, g.maxY - g.minY);
      const s = Math.min((w - 2 * polster) / gb, (h - 2 * polster) / gh);
      const ox = (w - gb * s) / 2 - (g.minX + (g.maxX - g.minX - gb) / 2) * s;
      const oy = (h - gh * s) / 2 - (g.minY + (g.maxY - g.minY - gh) / 2) * s;
      karteMass = { s, ox, oy };
      for (const [art, liste] of nachArt) {
        kctx.fillStyle = farbe.arten[art] || farbe.textLeise;
        kctx.globalAlpha = 0.9;
        for (const i of liste) {
          if (!hatLage[i] || deckZiel[i] === 0) continue;
          const d = K[i].grad >= 6 ? 3.2 : 2.2;
          kctx.fillRect(px[i] * s + ox - d / 2, py[i] * s + oy - d / 2, d, d);
        }
      }
      // Ausschnitt
      if (cssB > 1 && cssH > 1) {
        const x0 = klemmen((kam.x - cssB / 2 / kam.zoom) * s + ox, 1, w - 1);
        const y0 = klemmen((kam.y - cssH / 2 / kam.zoom) * s + oy, 1, h - 1);
        const x1 = klemmen((kam.x + cssB / 2 / kam.zoom) * s + ox, 1, w - 1);
        const y1 = klemmen((kam.y + cssH / 2 / kam.zoom) * s + oy, 1, h - 1);
        kctx.globalAlpha = 0.07;
        kctx.fillStyle = farbe.akzent;
        kctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        kctx.globalAlpha = 0.9;
        kctx.strokeStyle = farbe.akzent;
        kctx.lineWidth = 1.25;
        rundRechteck(kctx, x0 + 0.5, y0 + 0.5, Math.max(3, x1 - x0 - 1), Math.max(3, y1 - y0 - 1), 3);
        kctx.stroke();
      }
      kctx.globalAlpha = 1;
    }

    // ---------- Bildschleife: nur bei Bedarf ----------
    function anfordern() {
      if (rafId || !istAktiv || zerstoert) return;
      rafId = fenster.requestAnimationFrame(bild);
    }
    function bild(zeit) {
      rafId = 0;
      if (!istAktiv || zerstoert) return;
      const dt = letztesBild ? Math.min(100, Math.max(1, zeit - letztesBild)) : 16.7;
      let weiter = false;
      if (treiber && treiber.tick(6)) weiter = true;
      if (uebergang && uebergang.ziel) {
        if (!uebergang.start) uebergang.start = zeit;
        const t = klemmen((zeit - uebergang.start) / uebergang.dauer, 0, 1);
        const e = 1 - Math.pow(1 - t, 3);
        const { von, ziel, hatte } = uebergang;
        if (ziel.length === K.length * 2) {
          for (let i = 0; i < K.length; i++) {
            px[i] = hatte[i] ? von[2 * i] + (ziel[2 * i] - von[2 * i]) * e : ziel[2 * i];
            py[i] = hatte[i] ? von[2 * i + 1] + (ziel[2 * i + 1] - von[2 * i + 1]) * e : ziel[2 * i + 1];
            hatLage[i] = 1;
          }
        }
        if (t >= 1 || ziel.length !== K.length * 2) uebergang = null; else weiter = true;
      }
      if (flug) {
        if (!flug.start) flug.start = zeit;
        const t = klemmen((zeit - flug.start) / flug.dauer, 0, 1);
        const e = 1 - Math.pow(1 - t, 4); // weich auslaufend
        kam = {
          x: flug.von.x + (flug.nach.x - flug.von.x) * e,
          y: flug.von.y + (flug.nach.y - flug.von.y) * e,
          zoom: flug.von.zoom * Math.pow(flug.nach.zoom / flug.von.zoom, e),
        };
        if (t >= 1) flug = null; else weiter = true;
      }
      // Deckkraft weich angleichen (≈ 140 ms)
      const k = 1 - Math.exp(-dt / 48);
      for (let i = 0; i < deck.length; i++) {
        const d = deckZiel[i] - deck[i];
        if (d === 0) continue;
        if (Math.abs(d) < 0.012) deck[i] = deckZiel[i];
        else { deck[i] += d * k; weiter = true; }
      }
      if (zeichnen(zeit, dt)) weiter = true;
      if (weiter) { letztesBild = zeit; anfordern(); }
      else letztesBild = 0;
    }

    // ---------- Auswahl, Hover ----------
    function beschreibung(i) {
      const k = K[i];
      const g = k.grad;
      return `${k.titel}, ${ART_NAMEN[k.art] || k.art}, ${STATUS_NAMEN[k.status] || k.status}, ${g} ${g === 1 ? "Verbindung" : "Verbindungen"}${k.geschuetzt ? ", geschützt" : ""}${k.fest ? ", fixiert" : ""}`;
    }
    function auswahlSetzen(i) {
      if (i === auswahl) return;
      auswahl = i;
      zieleRechnen();
    }
    function hoverSetzen(i) {
      if (i === hover) return;
      hover = i;
      flaeche.style.cursor = i >= 0 ? "pointer" : "";
      zieleRechnen();
      rufe("beiHover", i >= 0 ? K[i].id : null);
    }
    /**
     * Knoten unter einem Bildpunkt (der nächste, dessen Trefferfläche den Punkt enthält); Finger: mindestens 44 px.
     * ziehen: die engere Fläche, auf der ein Wisch den Knoten sofort mitnimmt (siehe trefferRadius).
     */
    function treffen(x, y, zeigerTyp, ziehen = false) {
      const rz = radiusZoom(kam.zoom);
      let bester = -1;
      let wert = Infinity;
      for (let i = 0; i < K.length; i++) {
        if (!hatLage[i] || deckZiel[i] === 0) continue;
        const dx = (px[i] - kam.x) * kam.zoom + cssB / 2 - x;
        const dy = (py[i] - kam.y) * kam.zoom + cssH / 2 - y;
        const r = trefferRadius(Math.max(R_MIN, K[i].r * rz), zeigerTyp, ziehen);
        const d = dx * dx + dy * dy;
        if (d <= r * r && d < wert) { wert = d; bester = i; }
      }
      return bester;
    }

    // ---------- Zeiger ----------
    const punkt = (e, el = flaeche) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const halteEnde = () => { if (halteUhr) { fenster.clearTimeout(halteUhr); halteUhr = 0; } };
    function zeigerRunter(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const p = punkt(e);
      const typ = e.pointerType || "mouse";
      try { flaeche.setPointerCapture(e.pointerId); } catch { /* egal */ }
      if (dok.activeElement !== flaeche) { try { flaeche.focus({ preventScroll: true, focusVisible: false }); } catch { /* egal */ } }
      zeiger.set(e.pointerId, { x: p.x, y: p.y, typ });
      flug = null;
      halteEnde();
      if (zeiger.size >= 2) {
        if (geste && geste.typ === "knoten" && geste.bewegt) knotenLoslassen(geste.i, geste.mit, geste.ruhig);
        if (geste && geste.gegriffen && hover >= 0) hoverSetzen(-1);
        const [a, b] = [...zeiger.values()];
        geste = { typ: "pinch", abstand: Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, kam: { ...kam } };
        return;
      }
      // Maus: Der Knoten unter dem Zeiger wird gezogen. Finger: Antippen trifft großzügig (44 px); sofort gezogen wird nur,
      // wer auf dem Knoten selbst ansetzt – ein Wisch daneben verschiebt den Ausschnitt. Kurzes Halten greift den Knoten.
      const getippt = treffen(p.x, p.y, typ);
      const direkt = typ === "mouse" ? getippt : treffen(p.x, p.y, typ, true);
      const i = direkt >= 0 ? direkt : getippt;
      const w = zuWelt(kam, p.x, p.y, cssB, cssH);
      const g = { typ: direkt >= 0 ? "knoten" : "frei", i, startX: p.x, startY: p.y, bewegt: false, gegriffen: false, kamX: kam.x, kamY: kam.y, zeigerTyp: typ, versatzX: i >= 0 ? px[i] - w.x : 0, versatzY: i >= 0 ? py[i] - w.y : 0 };
      geste = g;
      if (typ !== "mouse" && i >= 0) {
        halteUhr = fenster.setTimeout(() => {
          halteUhr = 0;
          if (zerstoert || geste !== g || g.bewegt || g.i < 0) return;
          g.typ = "knoten"; // gegriffen: Die nächste Bewegung zieht den Knoten
          g.gegriffen = true;
          hoverSetzen(g.i); // zeigt es: Ring und Label wie beim Zeigen mit der Maus
        }, HALTEN_MS);
      }
    }
    function knotenLoslassen(i, mit, ruhig) {
      K[i].fest = true; // gezogen = fixiert (lösen über fixieren(id, false))
      if (mit && mit.length) treiber.versetzen(mit.map((j) => [K[j].id, px[j], py[j]]));
      treiber.los(K[i].id, true, Boolean(ruhig));
      lagenSpeichernBald();
      anfordern();
      if (typeof opt.beiFixiert === "function") opt.beiFixiert(K[i].id, true);
    }
    function zeigerBewegt(e) {
      const p = punkt(e);
      const z = zeiger.get(e.pointerId);
      if (!z) {
        if ((e.pointerType || "mouse") === "mouse" && !zeiger.size) hoverSetzen(treffen(p.x, p.y, "mouse"));
        return;
      }
      z.x = p.x;
      z.y = p.y;
      if (!geste) return;
      if (geste.typ === "pinch") {
        if (zeiger.size < 2) return;
        const [a, b] = [...zeiger.values()];
        const abstand = Math.max(8, Math.hypot(a.x - b.x, a.y - b.y));
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const k = zoomUmPunkt(geste.kam, abstand / geste.abstand, geste.mx, geste.my, cssB, cssH);
        k.x -= (mx - geste.mx) / k.zoom;
        k.y -= (my - geste.my) / k.zoom;
        kam = k;
        kameraBeruehrt = true;
        anfordern();
        return;
      }
      const dx = p.x - geste.startX;
      const dy = p.y - geste.startY;
      if (!geste.bewegt) {
        if (Math.hypot(dx, dy) < (geste.zeigerTyp === "mouse" ? 4 : 8)) return; // noch ein Tipp
        geste.bewegt = true;
        halteEnde(); // losgewischt, bevor gegriffen war: Der Ausschnitt wandert
        flaeche.style.cursor = "grabbing";
        if (hover >= 0 && geste.typ === "frei") hoverSetzen(-1);
        if (geste.typ === "knoten") {
          // Ruhiges Ziehen (Standard): nur der Knoten wandert, seine Blätter (Knoten mit nur dieser einen Kante) kommen
          // starr mit – der Rest bleibt stehen. „lebendig“: die Nachbarn federn über das Layout mit.
          geste.ruhig = !ZIEHEN_LEBENDIG || wenig();
          geste.mit = geste.ruhig && !layoutLaeuft ? nachbarn[geste.i].filter((j) => nachbarn[j].length === 1 && !K[j].fest && hatLage[j]) : null;
        }
      }
      if (geste.typ === "knoten") {
        const w = zuWelt(kam, p.x, p.y, cssB, cssH);
        const i = geste.i;
        const nx = w.x + geste.versatzX;
        const ny = w.y + geste.versatzY;
        if (geste.mit) for (const j of geste.mit) { px[j] += nx - px[i]; py[j] += ny - py[i]; }
        px[i] = nx;
        py[i] = ny;
        kameraBeruehrt = true; // nach dem Ziehen rückt die Kamera nicht von selbst nach
        if (!geste.ruhig) layoutLaeuft = true;
        treiber.zieh(K[i].id, nx, ny, geste.ruhig);
      } else {
        kam = { x: geste.kamX - dx / kam.zoom, y: geste.kamY - dy / kam.zoom, zoom: kam.zoom };
        kameraBeruehrt = true;
      }
      anfordern();
    }
    function zeigerHoch(e, abbruch = false) {
      const z = zeiger.get(e.pointerId);
      if (!z) return;
      zeiger.delete(e.pointerId);
      try { flaeche.releasePointerCapture(e.pointerId); } catch { /* egal */ }
      if (!geste) return;
      if (geste.typ === "pinch") {
        // ein Finger bleibt: als Verschieben weiterführen
        if (zeiger.size === 1) { const r = [...zeiger.values()][0]; geste = { typ: "frei", i: -1, startX: r.x, startY: r.y, bewegt: true, kamX: kam.x, kamY: kam.y, zeigerTyp: r.typ, versatzX: 0, versatzY: 0 }; }
        else if (!zeiger.size) geste = null;
        return;
      }
      const g = geste;
      geste = null;
      halteEnde();
      if (g.gegriffen && hover >= 0) hoverSetzen(-1); // der Finger ist weg: Das Greif-Zeichen auch
      flaeche.style.cursor = hover >= 0 ? "pointer" : "";
      if (g.typ === "knoten" && g.bewegt) { knotenLoslassen(g.i, g.mit, g.ruhig); return; }
      if (g.bewegt || abbruch) return;
      tipp(g.i, punkt(e), g.zeigerTyp, e);
    }
    /**
     * Zweiter Tipp eines Doppeltipps? Es zählen Zeit und Ort im Fenster – nicht, was dann dort liegt: Nach dem ersten Tipp
     * geht das Detail auf, die Kamera fliegt, am Handy rollt die Seite.
     */
    const zweiterTipp = (e) => Boolean(letzterTipp) && jetztMs() - letzterTipp.zeit < DOPPEL_MS && Math.hypot(e.clientX - letzterTipp.x, e.clientY - letzterTipp.y) < DOPPEL_PX;
    function tipp(i, p, zeigerTyp, e) {
      const erster = letzterTipp;
      const doppelt = zweiterTipp(e) && (erster.id != null || i < 0);
      letzterTipp = doppelt ? null : { id: i >= 0 ? K[i].id : null, zeit: jetztMs(), x: e.clientX, y: e.clientY };
      if (doppelt && erster.id != null) { zentrieren(erster.id); return; } // der Knoten des ERSTEN Tipps kommt in die Mitte
      if (doppelt) { kameraBeruehrt = true; fliegen(zoomUmPunkt(kam, 1.7, p.x, p.y, cssB, cssH), 200); return; }
      if (i >= 0) {
        const id = K[i].id;
        auswahlSetzen(i);
        rufe("beiAuswahl", id, { quelle: "zeiger" });
        rufe("beiOeffnen", id, { quelle: "zeiger" });
        return;
      }
      // leere Stelle: Die Auswahl fällt auf den Eintrag zurück, dessen Detail offen ist (der Ring bleibt bei ihm) – sonst ist nichts mehr gewählt
      const bleibt = gewuenscht != null && nIndex.has(gewuenscht) ? nIndex.get(gewuenscht) : -1;
      if (auswahl !== bleibt) { auswahlSetzen(bleibt); if (bleibt < 0) rufe("beiAuswahl", null, { quelle: "zeiger" }); }
      if (zeigerTyp !== "mouse" && hover >= 0) hoverSetzen(-1);
    }
    /** Der zweite Tipp landet nicht immer auf der Fläche (am Handy rollt sie unter dem Finger weg) – er zählt trotzdem. */
    function tippDaneben(e) {
      if (e.target === flaeche || !letzterTipp || letzterTipp.id == null || !zweiterTipp(e)) return;
      const id = letzterTipp.id;
      letzterTipp = null;
      zentrieren(id);
    }
    function rad(e) {
      e.preventDefault();
      const p = punkt(e);
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 16;
      else if (e.deltaMode === 2) delta *= cssH || 600;
      flug = null;
      kam = zoomUmPunkt(kam, Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0016)), p.x, p.y, cssB, cssH);
      kameraBeruehrt = true;
      anfordern();
    }
    // Safari (Trackpad am Mac): Pinch kommt als gesture-Ereignis, nicht als Rad mit ctrlKey
    let gesteSafari = null;
    function gesteStart(e) { e.preventDefault(); gesteSafari = { kam: { ...kam }, ...punkt(e) }; }
    function gesteLaeuft(e) {
      e.preventDefault();
      if (!gesteSafari) return;
      flug = null;
      kam = zoomUmPunkt(gesteSafari.kam, e.scale || 1, gesteSafari.x, gesteSafari.y, cssB, cssH);
      kameraBeruehrt = true;
      anfordern();
    }
    function gesteEnde(e) { e.preventDefault(); gesteSafari = null; }

    // ---------- Tastatur ----------
    function springen(richtung) {
      let ziel = -1;
      const lageVon = (j) => ({ id: j, x: px[j], y: py[j] });
      const zeigbar = (j) => hatLage[j] && deckZiel[j] > 0;
      if (auswahl < 0 || !zeigbar(auswahl)) {
        // ohne Auswahl: der Knoten nahe der Mitte
        const m = freieMitte();
        const w = zuWelt(kam, m.x, m.y, cssB, cssH);
        let wert = Infinity;
        for (let j = 0; j < K.length; j++) {
          if (!zeigbar(j)) continue;
          const d = (px[j] - w.x) ** 2 + (py[j] - w.y) ** 2;
          if (d < wert) { wert = d; ziel = j; }
        }
      } else {
        const von = { x: px[auswahl], y: py[auswahl] };
        let j = nachbarInRichtung(von, nachbarn[auswahl].filter(zeigbar).map(lageVon), richtung);
        if (j === null) {
          // kein verbundener Knoten in dieser Richtung: der nächste sichtbare überhaupt
          const alle = [];
          for (let q = 0; q < K.length; q++) if (q !== auswahl && zeigbar(q)) alle.push(lageVon(q));
          j = nachbarInRichtung(von, alle, richtung);
        }
        ziel = j === null ? -1 : j;
      }
      if (ziel < 0) { rufe("ansage", "Kein weiterer Knoten in dieser Richtung."); return; }
      auswahlSetzen(ziel);
      sichtbarMachen(ziel);
      rufe("beiAuswahl", K[ziel].id, { quelle: "tastatur" });
      rufe("ansage", beschreibung(ziel));
    }
    function taste(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const richtung = { ArrowLeft: "links", ArrowRight: "rechts", ArrowUp: "oben", ArrowDown: "unten" }[e.key];
      if (richtung) {
        e.preventDefault();
        if (e.shiftKey) {
          const v = RICHTUNGEN[richtung];
          kameraBeruehrt = true;
          fliegen({ x: kam.x + v[0] * 80 / kam.zoom, y: kam.y + v[1] * 80 / kam.zoom, zoom: kam.zoom }, 140);
        } else springen(richtung);
        return;
      }
      if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomen(1.3); return; }
      if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomen(1 / 1.3); return; }
      if (e.key === "0") { e.preventDefault(); kameraBeruehrt = false; einpassenJetzt(false); return; }
      if (e.key === "Enter" || e.key === " ") {
        if (e.key === " " || auswahl >= 0) e.preventDefault(); // die Leertaste rollt hier nie die Seite
        if (auswahl >= 0) rufe("beiOeffnen", K[auswahl].id, { quelle: "tastatur" });
      }
    }

    // ---------- Minimap ----------
    let karteZeiger = null;
    function karteZu(e) {
      if (!karteMass) return;
      const p = punkt(e, karte);
      flug = null;
      kam = { x: (p.x - karteMass.ox) / karteMass.s, y: (p.y - karteMass.oy) / karteMass.s, zoom: kam.zoom };
      kameraBeruehrt = true;
      anfordern();
    }
    function karteRunter(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      karteZeiger = e.pointerId;
      try { karte.setPointerCapture(e.pointerId); } catch { /* egal */ }
      karteZu(e);
    }
    function karteBewegt(e) { if (karteZeiger === e.pointerId) karteZu(e); }
    function karteHoch(e) { if (karteZeiger === e.pointerId) { karteZeiger = null; try { karte.releasePointerCapture(e.pointerId); } catch { /* egal */ } } }

    // ---------- Öffentliche Aktionen ----------
    function zentrieren(id) {
      const i = nIndex.has(id) ? nIndex.get(id) : -1;
      if (i < 0 || !hatLage[i]) return;
      kameraBeruehrt = true;
      const ziel = kameraAuf(i, Math.max(kam.zoom, 1.35));
      mitteAuf = { i, kamera: ziel };
      fliegen(ziel, FLUG_MS, i);
    }
    function zoomen(faktor) {
      const m = freieMitte();
      kameraBeruehrt = true;
      fliegen(zoomUmPunkt(flug ? flug.nach : kam, faktor, m.x, m.y, cssB, cssH), 160);
    }
    function fokus(id, tiefe = 1) {
      const i = id != null && nIndex.has(id) ? nIndex.get(id) : -1;
      if (i < 0) {
        if (!fokusZustand) return;
        const zurueck = fokusZustand.kamera;
        fokusZustand = null;
        fokusMenge = null;
        zieleRechnen();
        fliegen(zurueck);
        return;
      }
      const t = klemmen(Math.round(Number(tiefe) || 1), 1, 3);
      const menge = new Set([i]);
      let rand = [i];
      for (let s = 0; s < t; s++) {
        const naechste = [];
        for (const a of rand) for (const b of nachbarn[a]) if (!menge.has(b) && !(sichtbarMenge && !sichtbarMenge.has(K[b].id))) { menge.add(b); naechste.push(b); }
        rand = naechste;
      }
      // eingepasst wird nur, wenn sich Knoten, Tiefe oder die gezeigte Menge geändert haben – ein bloßes Neuzeichnen der
      // Ansicht (Suche, Filterzeile, Klick auf einen Nachbarn) lässt den eigenen Ausschnitt stehen
      const gleich = Boolean(fokusZustand && fokusMenge) && fokusZustand.id === id && fokusZustand.tiefe === t && gleicheMenge(menge, fokusMenge);
      if (!fokusZustand) fokusZustand = { id, tiefe: t, kamera: { ...(flug ? flug.nach : kam) } };
      else { fokusZustand.id = id; fokusZustand.tiefe = t; }
      fokusMenge = menge;
      zieleRechnen();
      if (gleich) return;
      kameraBeruehrt = true;
      einpassenJetzt(false);
    }

    // ---------- Anschließen ----------
    const horcher = [];
    const hoere = (ziel, typ, fn, o) => { ziel.addEventListener(typ, fn, o); horcher.push(() => ziel.removeEventListener(typ, fn, o)); };
    hoere(flaeche, "pointerdown", zeigerRunter);
    hoere(flaeche, "pointermove", zeigerBewegt);
    hoere(flaeche, "pointerup", (e) => zeigerHoch(e));
    hoere(flaeche, "pointercancel", (e) => zeigerHoch(e, true));
    hoere(flaeche, "pointerleave", (e) => { if ((e.pointerType || "mouse") === "mouse" && !zeiger.size) hoverSetzen(-1); });
    hoere(flaeche, "wheel", rad, { passive: false });
    hoere(flaeche, "gesturestart", gesteStart);
    hoere(flaeche, "gesturechange", gesteLaeuft);
    hoere(flaeche, "gestureend", gesteEnde);
    hoere(flaeche, "keydown", taste);
    hoere(flaeche, "contextmenu", (e) => { if (geste && geste.zeigerTyp !== "mouse") e.preventDefault(); }); // Halten mit dem Finger greift – kein Menü
    hoere(dok, "pointerup", tippDaneben, true);
    hoere(karte, "pointerdown", karteRunter);
    hoere(karte, "pointermove", karteBewegt);
    hoere(karte, "pointerup", karteHoch);
    hoere(karte, "pointercancel", karteHoch);
    let beobachter = null;
    if (typeof fenster.ResizeObserver === "function") { beobachter = new fenster.ResizeObserver(groesseGeaendert); beobachter.observe(behaelter); }
    else hoere(fenster, "resize", groesseGeaendert);
    // Pixelverhältnis ändert sich (anderer Bildschirm, Browser-Zoom): Puffer neu anlegen
    let dichte = null;
    const dichteHorchen = () => {
      if (zerstoert || typeof fenster.matchMedia !== "function") return;
      dichte = fenster.matchMedia(`(resolution: ${fenster.devicePixelRatio || 1}dppx)`);
      const neu = () => { if (zerstoert) return; pufferAnlegen(); anfordern(); dichteHorchen(); };
      if (dichte.addEventListener) dichte.addEventListener("change", neu, { once: true });
    };
    dichteHorchen();
    if (dok.fonts && dok.fonts.ready && typeof dok.fonts.ready.then === "function") dok.fonts.ready.then(() => { if (zerstoert) return; breiten.clear(); anfordern(); });

    farbenLesen();
    pufferAnlegen();

    return {
      setzen,
      /**
       * Auswahl der Ansicht setzen (der Eintrag im offenen Detail; null = keiner). Der Ring wird jedes Mal gesetzt, in den
       * Blick geholt wird der Knoten nur beim Wechsel – wer danach woanders hinschiebt, wird beim nächsten Neuzeichnen
       * nicht zurückgeholt. zentrieren: ausdrücklich hinfliegen (Sprung vom Quellen-Chip), auch wenn er schon gewählt ist.
       */
      auswaehlen(id, { zentrieren: hin = false } = {}) {
        const i = id != null && nIndex.has(id) ? nIndex.get(id) : -1;
        const neu = (i >= 0 ? id : null) !== gewuenscht;
        gewuenscht = i >= 0 ? id : null;
        auswahlSetzen(i);
        if (i >= 0 && hin) zentrieren(id);
        else if (i >= 0 && neu) sichtbarMachen(i, true);
      },
      zentrieren,
      /** Gabi-Spur: diese Knoten leuchten kurz auf (mit „Bewegung reduzieren“: stiller Ring für dieselbe Zeit). */
      hervorheben(ids, { dauer = SCHEIN_MS } = {}) {
        const start = jetztMs();
        for (const id of ids || []) if (nIndex.has(id)) hervor.set(nIndex.get(id), { start, dauer });
        anfordern();
        if (wenig()) fenster.setTimeout(() => { if (!zerstoert) anfordern(); }, dauer + 30);
      },
      /** Suchtreffer markieren (null = keine Suche). */
      treffer(ids) {
        trefferMenge = ids ? new Set([...ids].filter((id) => nIndex.has(id)).map((id) => nIndex.get(id))) : null;
        zieleRechnen();
      },
      /** Filter: nur diese IDs zeigen (null = alle). Die Lagen bleiben, nichts ordnet sich neu. */
      sichtbarkeit(idMenge) {
        sichtbarMenge = idMenge ? new Set(idMenge) : null;
        if (fokusZustand) { const z = fokusZustand; fokus(z.id, z.tiefe); return; }
        zieleRechnen();
      },
      fokus,
      /** Alles zeigen – in der freien Fläche, und so, dass kein Knoten unter Minimap, Legende oder Knöpfen liegt. */
      einpassen({ verdeckt: v, sofort = false } = {}) {
        if (v) verdecktSetzen(v, false);
        kameraBeruehrt = false;
        blick = null;
        einpassenJetzt(sofort);
      },
      /**
       * Ränder, die Panel oder Blatt verdecken ({ links, rechts, oben, unten } in px; offen: true = das Detail ist da;
       * einpassen: false = die Ränder gelten nur für den Blick auf einen Knoten, „Alles zeigen“ nimmt die ganze Fläche).
       * Die Kamera bewegt das nicht – außer das Detail ist wieder zu: dann steht sie wie vorher.
       */
      verdeckt(v) { verdecktSetzen(v, true); },
      /** Wird gerade gezeichnet (Ansicht im Bild)? */
      istAktiv: () => istAktiv,
      zoomen,
      fixieren(id, fest) {
        const i = nIndex.has(id) ? nIndex.get(id) : -1;
        if (i < 0) return;
        K[i].fest = Boolean(fest);
        if (treiber) treiber.fest(id, Boolean(fest), px[i], py[i], wenig());
        lagenSpeichernBald();
        anfordern();
      },
      /** Ist der Knoten festgesetzt (von Hand gezogen oder über fixieren)? */
      istFest(id) {
        const i = nIndex.has(id) ? nIndex.get(id) : -1;
        return i >= 0 && Boolean(K[i].fest);
      },
      /**
       * Das ganze Bild neu anordnen (frisch gerechnet, mit Bewegung). Fixierte Knoten bleiben, wo sie sind –
       * mit auchFeste werden auch sie gelöst.
       */
      neuAnordnen({ auchFeste = false } = {}) {
        const n = K.length;
        if (!n) return;
        if (auchFeste) for (const k of K) k.fest = false;
        // weich: jeder Knoten gleitet von seiner alten Lage in die neue (mit „Bewegung reduzieren“: ein Sprung)
        const von = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) { von[2 * i] = px[i]; von[2 * i + 1] = py[i]; }
        uebergang = wenig() ? null : { von, ziel: null, hatte: Uint8Array.from(hatLage), start: 0, dauer: 520 };
        kameraBeruehrt = false;
        layoutBeginn = jetztMs();
        layoutMs = null;
        layoutLaeuft = true;
        if (!treiber) treiber = (opt.workerUrl && typeof fenster.Worker === "function" && treiberWorker(opt.workerUrl)) || treiberLokal();
        treiber.start(layoutEingabe(true), { sofort: wenig() });
        anfordern();
      },
      farbenNeu() { farbenLesen(); anfordern(); },
      /** Ansicht verdeckt → nichts zeichnen, nichts rechnen; beim Zurückkommen geht es ruhig weiter. */
      aktiv(an) {
        const neu = Boolean(an);
        if (neu === istAktiv) return;
        istAktiv = neu;
        if (!neu) { if (rafId) { fenster.cancelAnimationFrame(rafId); rafId = 0; } letztesBild = 0; if (treiber) treiber.pause(); return; }
        pulsBis = jetztMs() + PULS_MS;
        groesseGeaendert();
        if (treiber) treiber.weiter();
        anfordern();
      },
      /** Messwerte: Bilder, Zeichenkosten, Bildrate der letzten zusammenhängenden Bewegung, Layout-Zeit. */
      messen() {
        const sortiert = [...kosten].sort((a, b) => a - b);
        const q = (p) => (sortiert.length ? Math.round(sortiert[Math.min(sortiert.length - 1, Math.floor(sortiert.length * p))] * 100) / 100 : null);
        let anfang = bildZeiten.length - 1;
        while (anfang > 0 && bildZeiten[anfang] - bildZeiten[anfang - 1] < 250) anfang--;
        const lauf = bildZeiten.length - anfang;
        const spanne = lauf > 1 ? bildZeiten[bildZeiten.length - 1] - bildZeiten[anfang] : 0;
        return {
          knoten: K.length, kanten: kanten.length, fest: K.reduce((n, k) => n + (k.fest ? 1 : 0), 0), bilder, zeichnenP50: q(0.5), zeichnenP95: q(0.95),
          fps: lauf >= 8 && spanne > 0 ? Math.round((lauf - 1) / spanne * 10000) / 10 : null,
          layoutMs, ticks: layoutTicks, ruht: !layoutLaeuft, worker: Boolean(treiber && treiber.art === "worker"),
          zoom: Math.round(kam.zoom * 1000) / 1000, pixel: Math.round(dpr * 100) / 100, breite: cssB, hoehe: cssH, labels: [...labelDeck.values()].filter((l) => l.ziel === 1).length, labelIds: [...labelDeck].filter(([, l]) => l.ziel === 1).map(([id]) => id), labelInfo: [...labelDeck].map(([id, l]) => ({ id, ziel: l.ziel, a: Math.round(l.a * 100) / 100, x: Math.round(l.x * 10) / 10, y: Math.round(l.y * 10) / 10, w: Math.round(l.breite), h: l.hoehe, text: l.text, platz: labelStand && labelStand.has(id) ? labelStand.get(id).platz : -1 })),
          schloesser,
        };
      },
      /** Lage eines Knotens im Bild (CSS-Pixel relativ zum Behälter) – für Tests und zum Ausrichten von Hinweisen. */
      lageImBild(id) {
        const i = nIndex.has(id) ? nIndex.get(id) : -1;
        if (i < 0 || !hatLage[i]) return null;
        const p = zuBild(kam, px[i], py[i], cssB, cssH);
        return { x: p.x, y: p.y, r: Math.max(R_MIN, K[i].r * radiusZoom(kam.zoom)), sichtbar: deckZiel[i] > 0 };
      },
      zerstoeren() {
        if (zerstoert) return;
        if (speicherUhr) lagenSpeichernJetzt(); // gerade Gezogenes nicht verlieren, wenn die Ansicht gleich danach zugeht
        zerstoert = true;
        if (rafId) fenster.cancelAnimationFrame(rafId);
        fenster.clearTimeout(groesseUhr);
        halteEnde();
        for (const weg of horcher) weg();
        if (beobachter) beobachter.disconnect();
        if (treiber) treiber.ende();
        flaeche.remove();
        karte.remove();
      },
    };
  }

  return {
    erstelle, workerStarten,
    // rein (für Tests, Messungen und die Ansicht)
    erstelleLayout, erstelleBaum, abstossung, abstossungDirekt, LAYOUT_STANDARD, knotenRadius,
    kamera: { zuBild, zuWelt, zoomUmPunkt, einpassen: kameraEinpassen, ausweichen: kameraAusweichen, freieRaender, imFreien, gleich: gleicheKamera, ZOOM_MIN, ZOOM_MAX, FREI_MIN },
    kuerzen, labelSchwelle, labelsWaehlen, nachbarInRichtung, testDaten, hash32, einheit, zufall, schlossMass, trefferRadius, gleicheMenge,
    ART_NAMEN, STATUS_NAMEN, FARBEN_STANDARD,
  };
});
