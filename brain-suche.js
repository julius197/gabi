/* Gabi Brain – Suche: deutsche Normalisierung, Rangfolge (BM25 über Titel, Tags, Inhalt), Filter und die Auswahl
   des Kontexts, den Gabi für eine Praxisfrage bekommt. Reine Funktionen ohne Browser – auch in Node und im Worker
   nutzbar. Der Demo-Assistent antwortet mit antwortAusKontext() rein aus den übergebenen Knoten (nichts dazuerfunden). */
(function (wurzel, fabrik) {
  if (typeof module === "object" && module.exports) module.exports = fabrik();
  else wurzel.GabiBrainSuche = fabrik();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TAG_MS = 86400000;
  const VERALTET_TAGE = 90;
  /** Nur diese Arten bekommt Gabi als Praxiswissen – nie Patienten, Notizen oder Berichte. */
  const KONTEXT_ARTEN = ["praxiswissen", "frage", "vorlage"];
  const NICHTS_IM_BRAIN = "Dazu steht noch nichts im Brain.";

  // ---------- Normalisierung ----------
  /** Vergleichsform: klein, Umlaute gefaltet (ä → ae), Akzente weg, alles außer Buchstaben/Ziffern wird Leerzeichen. */
  function normal(text) {
    return String(text == null ? "" : text)
      .normalize("NFC") // zerlegte Umlaute (z. B. Dateinamen vom Mac) erst zusammensetzen – sonst würde „ö“ zu „o“ statt „oe“
      // unsichtbare Zeichen (weiches Trennzeichen, Leerzeichen ohne Breite, Richtungsmarken – oft aus Webseiten mitkopiert) trennen kein Wort
      .replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, "")
      .toLowerCase()
      .replace(/€/g, " euro ")
      // „E-Mail“, „E-Mail-Adresse“, „Mailadresse“ sind ein Wort – sonst sucht „Adresse“ nach den Standorten
      .replace(/(^|[^a-z0-9äöüß])(?:e[\s-]?mail(?:[\s-]?adress[a-z]*)?|mail[\s-]?adress[a-z]*)(?![a-z0-9äöüß])/g, "$1 email ")
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  const FUELLWOERTER = new Set((
    "der die das den dem des ein eine einer eines einem einen und oder aber auch nicht kein keine keinen ist sind war waren wird werden wurde " +
    "hat haben habe hast habt hatte seid kann kannst koennen koennt man ich du er sie es wir ihr mir mich dir dich uns euch ihm ihn ihnen mein meine dein deine " +
    "sein seine unser unsere euer eure von vom zu zum zur mit bei beim fuer auf aus an am im in ins um ueber unter nach vor bis durch als wie was wer " +
    "wo wann warum wieso weshalb welche welcher welches welchen dass ob wenn dann denn noch schon nur sehr mal bitte gibt gib geht gabi sich so da hier " +
    "dort dazu davon diese dieser dieses diesen heute etwas alle alles mehr viel viele gern gerne eigentlich doch ja nein sag sage sagen weisst weiss " +
    "wissen bietet bieten biete anbieten macht machen mach tun tut soll sollen muss muessen darf duerfen will wollen moechte genau denn eure eurer " +
    "euren bitte danke hallo steht stehen laut zb bzw usw etc pro je " +
    // tragen in einer Frage nichts: „Kann ich als Selbstzahler kommen?“, „Wer gehört zum Team?“, „Wie lange dauert …?“
    "seit selbst lang lange kommen komme kommt gehoert gehoeren brauche brauchen braucht brauch moeglich arbeitet arbeiten arbeite zusammen " +
    "eigentlich bekomme bekommen bekommt kriege kriegen heisst heissen nenne nenn nennen erklaere erklaer erklaeren zeig zeige zeigen findet finde " +
    "statt gibts hab haette waere wuerde wuerdest koennte koenntest einfach kurz schnell nochmal bisschen ungefaehr ca eher sonst ueberhaupt jemand " +
    "immer oft wen wem wessen wofuer wozu womit woher wohin worauf woran worueber fuers aufs ans durchs ums uebers bin bist gewesen werde wirst " +
    "konnte musst muesst duerft darfst wollt willst sollt sollst sollte sollten moechtest moechten mag gehe gehen geben gebe gebt mache sagt wisst " +
    "kennst kennt kennen gerade aktuell momentan derzeit jetzt bald ganz gar etwa vielleicht irgendwie irgendwo irgendwann falls weil damit ohne " +
    "neben zwischen gegen ab per wegen bezueglich dies jene manche einige andere anderen beide beiden niemand jeder jede jedes frage fragen info " +
    "infos information informationen thema erzaehl erzaehle erzaehlen suche such suchen erfahren interessiert interessiere hinter denen deren dessen " +
    "laeuft laufen lautet lauten nehmt nehmen nehme nimmt"
  ).split(" "));

  /** Leichtes deutsches Stemming: eine Endung weg, der Stamm bleibt mindestens 4 Zeichen lang. Zahlen bleiben. */
  function stamm(wort) {
    if (wort.length < 5 || /\d/.test(wort)) return wort;
    for (const endung of ["ern", "em", "en", "er", "es", "e", "n", "s"]) {
      if (wort.endsWith(endung) && wort.length - endung.length >= 4) return wort.slice(0, -endung.length);
    }
    return wort;
  }

  /** Alle Wortstämme eines Texts (mit Wiederholungen, in Reihenfolge). */
  function stammListe(text) {
    const liste = [];
    for (const w of normal(text).split(" ")) {
      if (!w || (w.length < 2 && !/\d/.test(w))) continue;
      liste.push(stamm(w));
    }
    return liste;
  }

  /** Wortstämme eines Texts ohne Füllwörter (mit Wiederholungen) – das, was ein Knoten inhaltlich „sagt“. */
  function inhaltsStaemme(text) {
    const liste = [];
    for (const w of normal(text).split(" ")) {
      if (!w || FUELLWOERTER.has(w) || (w.length < 2 && !/\d/.test(w))) continue;
      const st = stamm(w);
      if (!FUELLWOERTER.has(st)) liste.push(st);
    }
    return liste;
  }

  /** Suchwörter einer Anfrage: Wortstämme ohne Füllwörter, jedes nur einmal. */
  function woerter(text) {
    const gesehen = new Set();
    for (const w of normal(text).split(" ")) {
      if (!w || FUELLWOERTER.has(w) || (w.length < 2 && !/\d/.test(w))) continue;
      gesehen.add(stamm(w));
    }
    return [...gesehen];
  }

  // Wortfelder: wer nach „Kosten“ fragt, meint auch „Preis“. Bewusst klein gehalten (Wortstämme in Vergleichsform).
  const WORTFELDER = [
    ["preis", "kost", "kostet", "teuer", "gebuehr", "tarif", "euro", "bezahl", "selbstzahl"],
    ["standort", "adress", "anfahrt", "anschrift", "strass", "wegbeschreibung", "filiale"],
    ["oeffnungszeit", "geoeffnet", "offen", "geschlossen", "sprechzeit", "sprechstund"],
    ["telefon", "telefonisch", "rufnummer", "handynummer", "anruf", "anrufen", "nummer", "erreich", "erreichbar"],
    ["email", "mail"],
    ["termin", "terminbuchung", "terminvergabe", "terminvereinbarung", "buchen", "anmeld", "anmeldung", "vereinbar"],
    ["kass", "krankenkass", "gesetzlich", "versichert", "privat", "privatpraxis", "abrechn", "abrechnung"],
    ["rezept", "verordnung", "ueberweisung"],
    ["park", "parkplatz", "parkplaetz", "parkmoeglichkeit", "parkhaus", "tiefgarage", "barrierefrei", "barrierefreiheit", "rollstuhl", "aufzug"],
    ["kind", "jugend", "jugendlich", "youngster"],
    ["alt", "alter", "jahr"],
    ["team", "mitarbeit", "mitarbeiter", "kolleg", "personal"],
    ["inhaber", "chef", "gruender", "besitzer", "leitung", "leitet", "leiter", "leiten", "geschaeftsfuehrer"],
    ["gegruendet", "gruendung", "geschicht", "entstehung"],
    ["leistung", "angebot", "behandlung", "therapi"],
    ["training", "trainier", "trainingszeit", "geraetetraining", "trainingstherapi"],
    ["partner", "kooperation", "kooperationspartner", "referenz"],
    ["wochenend", "samstag", "sonntag", "sa"],
  ];
  // Felder, die eine Eigenschaft meinen (Preis, Adresse, Zeiten, Kontakt …) und kein eigenes Thema: Eine Antwort darf so ein
  // Wort nicht von einem anderen Thema borgen („Was kostet Akupunktur?“ ist mit dem Preis der Osteopathie nicht beantwortet).
  const EIGENSCHAFT_FELDER = ["preis", "standort", "oeffnungszeit", "telefon", "email", "termin", "kass", "rezept", "park", "alt", "wochenend"];
  // Wörter für die Praxis selbst: stehen fast überall und müssen in einer Antwort nicht vorkommen („Ist die Praxis barrierefrei?“)
  const ALLGEMEIN = ["praxis", "praxen"];
  const FELD_ZU_WORT = new Map();
  // unter dem Wort und unter seinem Stamm: gesucht wird immer mit Stämmen („Preis“ → „prei“, „Inhaber“ → „inhab“)
  for (const feld of WORTFELDER) for (const w of feld) { FELD_ZU_WORT.set(w, feld); FELD_ZU_WORT.set(stamm(w), feld); }
  const EIGENSCHAFT = new Set(WORTFELDER.filter((feld) => EIGENSCHAFT_FELDER.some((w) => feld.includes(w))).flatMap((feld) => feld.flatMap((w) => [w, stamm(w)])));
  // Fragewörter sind Füllwörter, sagen aber, wonach gesucht wird
  const FRAGEWORT = { wo: ["standort", "adress"], wann: ["zeit", "uhr"], wieviel: ["preis"] };
  // Wendungen, die eindeutig sagen, worum es geht – zählen wie ein Suchwort (über das Wortfeld auch „Geschichte“, „Gründung“)
  const ABSICHT = [[/\bseit wann\b|\bwie lange gibt es\b|\bwie alt ist\b|\bwie lange (?:schon|bereits)\b/, "gegruendet"]];
  // Fragen ganz ohne Inhaltswort („Wo seid ihr?“, „Wann habt ihr auf?“): das Fragewort ist dann die Frage
  const ABSICHT_OHNE_INHALT = [[/\bwo\b|\bwohin\b/, "standort"], [/\bwann\b/, "oeffnungszeit"], [/\bwie ?viel\b/, "preis"], [/\b(?:bietet|bieten|anbieten|angebot)\b/, "leistung"]];

  /** Abstand zweier Wörter in Tippfehlern (Buchstabe fehlt, zu viel, falsch oder zwei vertauscht) – höchstens bis max gezählt. */
  function tippAbstand(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let vor2 = null;
    let vor = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const akt = [i];
      let kleinstes = i;
      for (let j = 1; j <= b.length; j++) {
        let w = Math.min(vor[j] + 1, akt[j - 1] + 1, vor[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (vor2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) w = Math.min(w, vor2[j - 2] + 1);
        akt[j] = w;
        if (w < kleinstes) kleinstes = w;
      }
      if (kleinstes > max) return max + 1;
      vor2 = vor;
      vor = akt;
    }
    return vor[b.length];
  }

  /**
   * Tippfehler ausgleichen: Ein Suchwort (ab 6 Buchstaben), das im Bestand weder genau noch als Wortanfang vorkommt, wird
   * durch das ähnlichste Wort des Bestands ersetzt – ein Tippfehler, ab 10 Buchstaben zwei; der erste Buchstabe muss stimmen.
   */
  function tippfehlerAusgleichen(such, bestand) {
    const liste = Array.isArray(bestand) ? bestand : [...bestand];
    const ergebnis = [];
    for (const w of such) {
      let wort = w;
      if (w.length >= 6 && !/\d/.test(w) && !liste.some((x) => passung(w, x) >= 0.7)) {
        const max = w.length >= 10 ? 2 : 1;
        let abstand = max + 1;
        for (const x of liste) {
          if (x.length < 5 || x[0] !== w[0] || /\d/.test(x)) continue;
          const d = tippAbstand(w, x, max);
          if (d < abstand || (d === abstand && d <= max && x < wort)) { abstand = d; wort = x; }
        }
        if (abstand > max) wort = w;
      }
      if (!ergebnis.includes(wort)) ergebnis.push(wort);
    }
    return ergebnis;
  }

  /**
   * Wonach fragt jemand? such = Inhaltswörter (Tippfehler am Bestand ausgeglichen) plus eindeutige Wendungen;
   * zusatz = schwache Hinweise aus Fragewörtern („wo“ → Standort). Ohne jedes Inhaltswort wird das Fragewort zur Frage.
   */
  function frageWoerter(anfrage, bestand = null) {
    const text = normal(anfrage);
    const roh = text.split(" ").filter(Boolean);
    let such = woerter(anfrage);
    if (bestand) such = tippfehlerAusgleichen(such, bestand);
    const zusatz = [];
    for (const w of roh) if (FRAGEWORT[w]) zusatz.push(...FRAGEWORT[w]);
    if (roh.includes("wie") && roh.includes("viel")) zusatz.push(...FRAGEWORT.wieviel);
    for (const [muster, wort] of ABSICHT) if (muster.test(text) && !such.some((s) => (FELD_ZU_WORT.get(s) || []).includes(wort) || s === wort)) such.push(wort);
    if (!such.length) for (const [muster, wort] of ABSICHT_OHNE_INHALT) if (muster.test(text) && !such.includes(wort)) such.push(wort);
    return { such, zusatz: [...new Set(zusatz)], roh };
  }

  // [kürzeres Wort, längeres Wort mit demselben Anfang] – als Wortstämme, wie stamm() sie liefert („Rezeption“ → „rezeptio“)
  const FALSCHE_FREUNDE = [["rezept", "rezeptio"]];
  /** Wie gut passt ein Suchwort zu einem Wort aus dem Bestand? 1 = gleich, 0,7 = Wortanfang, 0,45 = Teil eines Kompositums oder verwandt. */
  function passung(suchwort, wort) {
    if (suchwort === wort) return 1;
    if (/^\d+$/.test(suchwort) || /^\d+$/.test(wort)) return 0; // Zahlen nur genau
    // falsche Freunde: gleicher Wortanfang, anderes Wort („Brauche ich ein Rezept?“ fragt nicht nach der Rezeption)
    for (const [eins, zwei] of FALSCHE_FREUNDE) {
      const a = suchwort.startsWith(zwei) ? 2 : suchwort.startsWith(eins) ? 1 : 0;
      const b = wort.startsWith(zwei) ? 2 : wort.startsWith(eins) ? 1 : 0;
      if (a && b && a !== b) return 0;
    }
    const kurz = suchwort.length <= wort.length ? suchwort : wort;
    const lang = suchwort.length <= wort.length ? wort : suchwort;
    // Wortanfang: getippt „Akupunktur“, im Bestand „Akupunkturbehandlung“ → deutlich. Umgekehrt (gefragt „Behandlungsräume“, im
    // Bestand nur „Behandlung“) ist es bloß das Bestimmungswort eines Kompositums → schwach; Endungen („telefonisch“) zählen voll.
    if (kurz.length >= 4 && lang.startsWith(kurz)) return kurz === suchwort || lang.length - kurz.length <= 5 ? 0.7 : 0.45;
    if (kurz.length >= 5 && lang.includes(kurz)) return 0.45;
    // verwandt: langer gemeinsamer Wortanfang („trainieren“ ↔ „Training“)
    let gleich = 0;
    while (gleich < kurz.length && kurz[gleich] === lang[gleich]) gleich++;
    if (gleich >= 6 && gleich >= kurz.length * 0.7) return 0.45;
    return 0;
  }

  // ---------- Index ----------
  const GEWICHT = { titel: 3, tags: 2, inhalt: 1 };
  const ohneVerweise = (text) => String(text == null ? "" : text).replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1");

  /**
   * Index über Knoten: je Knoten die gewichteten Häufigkeiten der Wortstämme (Titel ×3, Tags ×2, Inhalt ×1).
   * Für ein paar hundert Knoten in wenigen Millisekunden gebaut – deshalb einfach bei jeder Änderung neu.
   */
  function erstelleIndex(knoten) {
    const docs = [];
    const vokabular = new Map(); // Wortstamm → Liste der Dokument-Nummern
    let summe = 0;
    for (const k of Array.isArray(knoten) ? knoten : []) {
      if (!k || !k.id) continue;
      const haeufig = new Map();
      let laenge = 0;
      const zaehlen = (text, gewicht) => {
        for (const w of inhaltsStaemme(text)) {
          haeufig.set(w, (haeufig.get(w) || 0) + gewicht);
          laenge += gewicht;
        }
      };
      zaehlen(k.titel, GEWICHT.titel);
      zaehlen((Array.isArray(k.tags) ? k.tags : []).join(" "), GEWICHT.tags);
      zaehlen(ohneVerweise(k.inhalt), GEWICHT.inhalt);
      const nr = docs.length;
      docs.push({ id: k.id, haeufig, laenge: laenge || 1, titel: new Set(stammListe(k.titel)), titelInhalt: inhaltsStaemme(k.titel) });
      summe += laenge || 1;
      for (const w of haeufig.keys()) {
        if (!vokabular.has(w)) vokabular.set(w, []);
        vokabular.get(w).push(nr);
      }
    }
    return { docs, vokabular, mittel: docs.length ? summe / docs.length : 1 };
  }

  const K1 = 1.2;
  const B = 0.75;

  /**
   * Suche mit Rangfolge. praefix: das letzte getippte Wort zählt schon als Wortanfang (Suche beim Tippen).
   * Ergebnis: [{ id, punkte, woerter, deckung, stark }] – deckung = Anteil der Suchwörter, die direkt vorkommen;
   * stark = mindestens ein Suchwort steht im Knoten (wörtlich, als Wortanfang, als Wortteil oder verwandt).
   */
  function suchen(index, anfrage, { limit = 20, praefix = true } = {}) {
    if (!index || !index.docs.length) return [];
    // Suchwörter (Tippfehler am Bestand ausgeglichen), dazu schwächer: Fragewörter – und unten die Wortfelder
    const { such, zusatz, roh } = frageWoerter(anfrage, index.vokabular.keys());
    const letztes = praefix && roh.length ? roh[roh.length - 1] : "";
    if (!such.length && !zusatz.length && !(letztes && letztes.length >= 2)) return [];

    const N = index.docs.length;
    const punkte = new Float64Array(N);
    const direkt = new Float64Array(N); // Zahl der Suchwörter mit direktem Treffer
    const staerke = new Float64Array(N);
    const gefunden = Array.from({ length: N }, () => null);

    /** tf je Dokument für ein Suchwort (über alle passenden Wörter des Bestands). */
    const treffer = (suchwort, { mindest = 0.45, alsAnfang = false } = {}) => {
      const tf = new Map();
      for (const [wort, nummern] of index.vokabular) {
        let p = passung(suchwort, wort);
        if (alsAnfang && suchwort.length >= 2 && wort.startsWith(suchwort)) p = Math.max(p, 0.8);
        if (p < mindest) continue;
        for (const nr of nummern) {
          const alt = tf.get(nr) || { tf: 0, p: 0, wort: "" };
          alt.tf += (p >= 1 ? 1 : p * p) * index.docs[nr].haeufig.get(wort); // ungenaue Treffer zählen deutlich schwächer
          if (p > alt.p) { alt.p = p; alt.wort = wort; }
          tf.set(nr, alt);
        }
      }
      return tf;
    };
    const werten = (tf, faktor, zaehlt) => {
      if (!tf.size) return;
      const idf = Math.log(1 + (N - tf.size + 0.5) / (tf.size + 0.5));
      for (const [nr, t] of tf) {
        const d = index.docs[nr];
        punkte[nr] += faktor * idf * ((t.tf * (K1 + 1)) / (t.tf + K1 * (1 - B + B * (d.laenge / index.mittel))));
        if (zaehlt) {
          direkt[nr] += 1;
          if (t.p > staerke[nr]) staerke[nr] = t.p;
          (gefunden[nr] || (gefunden[nr] = new Set())).add(t.wort);
        }
      }
    };

    such.forEach((w, i) => {
      const letzter = praefix && i === such.length - 1 && stamm(letztes) === w;
      const direktTf = treffer(w, { alsAnfang: letzter });
      werten(direktTf, 1, true);
      // Wortfeld: nur genaue Treffer und Wortanfänge, deutlich schwächer gewertet – aber das Suchwort gilt als gefunden
      // („Wann kann ich anrufen?“ findet „Telefonzeiten“, auch wenn „anrufen“ nirgends steht)
      const schon = new Set(direktTf.keys());
      for (const verwandt of FELD_ZU_WORT.get(w) || []) {
        if (verwandt === w) continue;
        const tf = treffer(verwandt, { mindest: 0.7 });
        werten(tf, 0.35, false);
        for (const [nr, t] of tf) {
          if (schon.has(nr)) continue;
          schon.add(nr);
          direkt[nr] += 1;
          if (staerke[nr] < 0.5) staerke[nr] = 0.5;
          (gefunden[nr] || (gefunden[nr] = new Set())).add(t.wort);
        }
      }
    });
    // noch kein Wort zu Ende getippt (z. B. „ko“): als Wortanfang suchen
    if (praefix && letztes.length >= 2 && !such.includes(stamm(letztes)) && !FUELLWOERTER.has(letztes)) werten(treffer(letztes, { mindest: 0.8, alsAnfang: true }), 1, true);
    for (const w of zusatz) if (!such.includes(w)) werten(treffer(w, { mindest: 0.7 }), 0.3, false);

    const anzahl = Math.max(1, such.length);
    const ergebnis = [];
    for (let nr = 0; nr < N; nr++) {
      if (!(punkte[nr] > 0)) continue;
      const d = index.docs[nr];
      const deckung = Math.min(1, direkt[nr] / anzahl);
      // Titel trägt die Frage ganz: deutlich nach vorn
      const imTitel = such.length ? such.filter((w) => [...d.titel].some((t) => passung(w, t) >= 0.7)).length / such.length : 0;
      // steht ein Suchwort genau so im Titel („Trainingszeiten“), schlägt das jeden bloßen Wortanfang („Training“)
      const genauImTitel = such.length ? such.filter((w) => d.titel.has(w)).length / such.length : 0;
      // besteht der Titel nur aus Wörtern der Frage („Akupunktur“ für „Wer macht Akupunktur?“), ist das der Eintrag zum Thema –
      // vor einem längeren Titel, in dem das Wort nur vorkommt („Führt … alle Akupunktur-Behandlungen selbst durch?“)
      const titelGanz = such.length && d.titelInhalt.length && d.titelInhalt.every((t) => such.includes(t)) ? 1 : 0;
      const wert = punkte[nr] * (0.6 + 0.4 * deckung) * (1 + 0.5 * imTitel + 0.6 * genauImTitel + 0.5 * titelGanz);
      ergebnis.push({ id: d.id, punkte: wert, woerter: gefunden[nr] ? [...gefunden[nr]] : [], deckung, stark: staerke[nr] >= 0.45, imTitel });
    }
    ergebnis.sort((a, b) => b.punkte - a.punkte || (a.id < b.id ? -1 : 1));
    return ergebnis.slice(0, limit);
  }

  // ---------- Filter ----------
  const anzahlVon = (nutzung, id) => {
    const n = nutzung instanceof Map ? nutzung.get(id) : nutzung && nutzung[id];
    return n ? Number(n.anzahl) || 0 : 0;
  };
  /** Gespeicherter Knoten, seit über 90 Tagen nicht geändert (offene Fragen sind „zu klären“, nicht „veraltet“). */
  function istVeraltet(k, jetzt = Date.now()) {
    return Boolean(k && !k.abgeleitet && !k.geloescht && k.status !== "zu_klaeren" && Number(k.geaendert) > 0 && jetzt - Number(k.geaendert) > VERALTET_TAGE * TAG_MS);
  }
  /** Bestätigtes Praxiswissen, das Gabi noch nie für eine Antwort verwendet hat. */
  function istNieVerwendet(k, nutzung) {
    return Boolean(k && !k.abgeleitet && !k.geloescht && KONTEXT_ARTEN.includes(k.art) && k.status === "bestaetigt" && anzahlVon(nutzung, k.id) === 0);
  }

  /** Knoten filtern: { arten, status, tag, zuKlaeren, veraltet, nieVerwendet, verwendet } – leere Angaben filtern nicht. */
  function filtern(knoten, filter = {}, { nutzung = null, jetzt = Date.now() } = {}) {
    const arten = filter.arten && filter.arten.length ? new Set(filter.arten) : null;
    const status = filter.status && filter.status.length ? new Set(filter.status) : null;
    const tag = filter.tag ? normal(filter.tag) : "";
    return (Array.isArray(knoten) ? knoten : []).filter((k) => {
      if (!k) return false;
      if (arten && !arten.has(k.art)) return false;
      if (status && !status.has(k.status)) return false;
      if (tag && !(Array.isArray(k.tags) ? k.tags : []).some((t) => normal(t) === tag)) return false;
      if (filter.zuKlaeren && k.status !== "zu_klaeren") return false;
      if (filter.veraltet && !istVeraltet(k, jetzt)) return false;
      if (filter.nieVerwendet && !istNieVerwendet(k, nutzung)) return false;
      if (filter.verwendet && !(anzahlVon(nutzung, k.id) > 0)) return false;
      return true;
    });
  }

  // ---------- Kontext für Gabi ----------
  /** Text auf höchstens max Zeichen kürzen – möglichst am Zeilen- oder Satzende, mit „…“. */
  function kuerzen(text, max) {
    const t = String(text == null ? "" : text).trim();
    if (t.length <= max) return t;
    const stueck = t.slice(0, Math.max(1, max - 2));
    const grenze = Math.max(stueck.lastIndexOf("\n"), stueck.lastIndexOf(". "), stueck.lastIndexOf("; "));
    return `${(grenze > max * 0.5 ? stueck.slice(0, grenze + 1) : stueck).trimEnd()} …`;
  }

  /**
   * Die besten Knoten für eine Praxisfrage: Rangfolge über Titel/Tags/Inhalt, dazu Nachbarn über Verweise (ein Sprung),
   * höchstens maxKnoten und rund maxZeichen. Nur Praxiswissen, Fragen und Vorlagen – nie Patienten, Notizen, Berichte,
   * nie der Papierkorb. Der Status geht mit (Entwürfe und „zu klären“ kennzeichnet Gabi in der Antwort).
   */
  function kontextWaehlen({ frage, knoten, kanten = [], maxKnoten = 8, maxZeichen = 6000, proKnoten = 1500, index = null } = {}) {
    const kandidaten = (Array.isArray(knoten) ? knoten : []).filter((k) => k && k.id && !k.geloescht && !k.abgeleitet && KONTEXT_ARTEN.includes(k.art));
    if (!kandidaten.length || !String(frage || "").trim()) return [];
    const nachId = new Map(kandidaten.map((k) => [k.id, k]));
    const treffer = suchen(index || erstelleIndex(kandidaten), frage, { limit: 24, praefix: false }).filter((t) => nachId.has(t.id));
    if (!treffer.length) return [];
    const bester = treffer[0].punkte;
    // nur was wirklich zur Frage gehört: ein Suchwort steht da und der Abstand zum besten Treffer ist nicht zu groß
    const direkt = treffer.filter((t) => t.stark && t.punkte >= bester * 0.25).slice(0, Math.max(1, maxKnoten - 2));
    if (!direkt.length) return [];
    const reihe = direkt.map((t) => t.id);
    const drin = new Set(reihe);
    // Nachbarn der zwei besten: ausdrückliche Verweise immer, „gehört zu“ nur, wenn der Nachbar selbst zur Frage passt
    const punkteVon = new Map(treffer.map((t) => [t.id, t.punkte]));
    const nachbarn = [];
    for (const id of reihe.slice(0, 2)) {
      for (const kante of Array.isArray(kanten) ? kanten : []) {
        if (!kante || (kante.von !== id && kante.nach !== id)) continue;
        const anderer = kante.von === id ? kante.nach : kante.von;
        if (drin.has(anderer) || !nachId.has(anderer)) continue;
        const p = punkteVon.get(anderer) || 0;
        if (kante.art === "verweis" || p > 0) nachbarn.push({ id: anderer, p: p + (kante.art === "verweis" ? bester * 0.1 : 0) });
      }
    }
    nachbarn.sort((a, b) => b.p - a.p || (a.id < b.id ? -1 : 1));
    for (const n of nachbarn) {
      if (reihe.length >= maxKnoten) break;
      if (!drin.has(n.id)) { drin.add(n.id); reihe.push(n.id); }
    }
    const ergebnis = [];
    let rest = maxZeichen;
    for (const id of reihe) {
      const k = nachId.get(id);
      const titel = String(k.titel || "").trim();
      const platz = Math.min(proKnoten, rest - titel.length);
      if (platz < 80 && ergebnis.length) continue; // passt nicht mehr sinnvoll hinein
      // [[Verweise]] bleiben stehen: ein Änderungsvorschlag, der auf dem Kontext aufbaut, löschte sonst die Verbindungen
      const inhalt = kuerzen(k.inhalt, Math.max(80, platz));
      rest -= titel.length + inhalt.length;
      ergebnis.push({ id: k.id, art: k.art, status: k.status, titel, inhalt, tags: (Array.isArray(k.tags) ? k.tags : []).slice(0, 8) });
      if (rest <= 0) break;
    }
    return ergebnis;
  }

  // ---------- Antwort ohne KI (Demo-Assistent) ----------
  const einzeilig = (text, max = 200) => kuerzen(String(text || "").replace(/\s+/g, " ").trim(), max);
  /** Zeilen eines Inhalts ohne Listenzeichen, Überschriften-Rauten und [[ ]]; wiederholt die erste Zeile den Titel, fällt er dort weg. */
  function zeilenVon(inhalt, titel = "") {
    const zeilen = ohneVerweise(inhalt).split("\n").map((z) => z.replace(/^\s*(?:[-•*–]|\d{1,2}[.)])\s+/, "").replace(/^#{1,6}\s+/, "").trim())
      .filter((z) => z && !/^(?:siehe auch|betrifft)\s*:/i.test(z)); // reine Verweis-Zeilen gehören nicht in die Antwort
    const t = String(titel || "").trim();
    if (t && zeilen.length && zeilen[0].toLowerCase().startsWith(`${t.toLowerCase()}:`)) {
      zeilen[0] = zeilen[0].slice(t.length + 1).trim();
      if (!zeilen[0]) zeilen.shift();
    }
    return zeilen;
  }
  /** Steht ein Wort aus dem Wortfeld des Suchworts in dieser Wortliste? */
  const imWortfeld = (suchwort, wortliste) => (FELD_ZU_WORT.get(suchwort) || []).some((v) => v !== suchwort && wortliste.some((x) => passung(v, x) >= 0.7));
  /** Steht das Suchwort (oder ein Wort aus seinem Wortfeld) in dieser Wortliste? */
  const kommtVor = (suchwort, wortliste) => wortliste.some((x) => passung(suchwort, x) >= 0.45) || imWortfeld(suchwort, wortliste);
  /** … und zwar deutlich: wörtlich, als Wortanfang oder über das Wortfeld – nicht nur als Teil eines längeren Worts. */
  const kommtDeutlichVor = (suchwort, wortliste) => wortliste.some((x) => passung(suchwort, x) >= 0.7) || imWortfeld(suchwort, wortliste);

  /**
   * Antwort rein aus den übergebenen Kontext-Knoten (Demo-Modus und lokaler Betrieb ohne KI): passende Zeilen wörtlich,
   * Entwürfe und offene Punkte gekennzeichnet. Es steht nie etwas in der Antwort, das nicht in einem der Knoten steht.
   *
   * Grundsatz: Die Antwort muss die Frage ganz abdecken – lieber eine Lücke als eine Antwort am Thema vorbei.
   *  - Jedes Inhaltswort der Frage steht deutlich in einem der genannten Knoten. Der beste Knoten trägt, was in ihm steht;
   *    weitere nur, was sie im Titel oder Tag tragen (zwei Knoten mit je einem Wort irgendwo im Text sind keine Antwort).
   *  - Eine Eigenschaft (Preis, Zeiten, Adresse, Kontakt …) zählt nur beim gefragten Thema selbst oder als offener Punkt:
   *    „Was kostet Akupunktur?“ ist mit dem Preis der Osteopathie nicht beantwortet.
   *  - Wörter für die Praxis selbst („Praxis“, optional ihr Name über nebensache) müssen nicht vorkommen.
   *  - Fehlt etwas, steht aber ein offener Punkt genau zum Thema im Brain: „Das ist im Brain noch offen“. Sonst:
   *    „Dazu steht noch nichts im Brain.“ und die Frage als Lücke.
   */
  function antwortAusKontext(frage, kontextKnoten, { nebensache = [] } = {}) {
    const liste = (Array.isArray(kontextKnoten) ? kontextKnoten : []).filter((k) => k && k.id && k.titel);
    const luecke = { text: NICHTS_IM_BRAIN, quellen: [], luecke: einzeilig(frage) };
    if (!liste.length) return luecke;
    const vorbereitet = liste.map((k, rang) => {
      const kopf = inhaltsStaemme(`${k.titel} ${(Array.isArray(k.tags) ? k.tags : []).join(" ")}`);
      const zeilen = zeilenVon(k.inhalt, k.titel).map((text) => ({ text, w: inhaltsStaemme(text) }));
      return { k, rang, kopf, zeilen, alle: [...kopf, ...zeilen.flatMap((z) => z.w)] };
    });
    const { such, zusatz } = frageWoerter(frage, new Set(vorbereitet.flatMap((v) => v.alle)));
    if (!such.length) return luecke;
    // worum es gehen muss: alles außer den Wörtern für die Praxis selbst (bleibt sonst nichts, zählen auch die)
    const neben = new Set([...ALLGEMEIN, ...(Array.isArray(nebensache) ? nebensache : [])].flatMap((w) => woerter(w)));
    const ohneNeben = such.filter((s) => !neben.has(s));
    const pflicht = ohneNeben.length ? ohneNeben : such;
    const thema = pflicht.filter((s) => !EIGENSCHAFT.has(s));
    // Fragewörter sagen, was gemeint ist („wo“ → Standort, „wann“ → Zeiten): wer das im Titel oder Tag trägt, rückt nach vorn
    const gemeint = (kopf) => zusatz.some((w) => kopf.some((x) => x.includes(w)));

    const bewertet = vorbereitet.map((v) => {
      const deckt = such.filter((s) => kommtDeutlichVor(s, v.alle)); // welche Wörter der Frage dieser Knoten trägt
      const imKopf = such.filter((s) => kommtDeutlichVor(s, v.kopf)); // … und welche davon schon in Titel oder Tags
      const zeilen = v.zeilen.map((z) => ({ text: z.text, treffer: such.filter((s) => kommtVor(s, z.w)).length }));
      const staerke = deckt.length / such.length + imKopf.length * 0.25 + (gemeint(v.kopf) ? 0.25 : 0);
      // wörtlich im Titel (ohne Tags, ohne Wortfeld): „Standort“ in „… an welchem Standort …“
      const imTitel = such.filter((s) => inhaltsStaemme(v.k.titel).some((x) => passung(s, x) >= 0.7));
      return { k: v.k, rang: v.rang, kopf: v.kopf, alle: v.alle, zeilen, deckt, imKopf, imTitel, offen: v.k.status === "zu_klaeren", staerke };
    });
    // in Frage kommt, wer etwas vom Gefragten trägt – im Titel/Tag oder mit mindestens der halben Frage – und (als Wissen)
    // beim Thema bleibt: nur die gefragte Eigenschaft zu kennen, aber von etwas anderem, reicht nicht
    const passend = bewertet
      .filter((b) => b.deckt.some((s) => pflicht.includes(s))
        && (pflicht.length === 1 || b.imKopf.length >= 1 || b.deckt.length / such.length >= 0.5)
        && (b.offen || !thema.length || b.deckt.some((s) => thema.includes(s))))
      .sort((a, b) => b.staerke - a.staerke || Number(a.offen) - Number(b.offen) || a.rang - b.rang); // bei Gleichstand: Wissen vor offenen Punkten
    if (!passend.length) return luecke;

    const erster = passend[0];
    const beste = passend.filter((b) => b.staerke >= erster.staerke * 0.75);
    const fakten = beste.filter((b) => !b.offen).slice(0, 3);
    const offen = [];
    const traegt = (b) => (b === erster ? b.deckt : b.imKopf);
    const gedeckt = new Set(fakten.flatMap(traegt));
    const fehlt = (woerterListe) => woerterListe.some((s) => pflicht.includes(s) && !gedeckt.has(s));
    const dazu = (b) => { (b.offen ? offen : fakten).push(b); for (const s of traegt(b)) gedeckt.add(s); };
    // offene Punkte zuerst die, die mit dem besten Knoten verwandt sind (gemeinsame Wörter in Titel/Tags außer denen der
    // Frage): zu „Was kostet Akupunktur?“ gehört der offene Punkt zu den Preisen der Leistungen, nicht der zum Jugendtraining
    const verwandt = (b) => (b === erster ? 99 : b.kopf.filter((x) => !such.includes(x) && erster.kopf.includes(x)).length);
    const nachVerwandtschaft = (reihe) => reihe.map((b, i) => ({ b, i })).sort((x, y) => (y.b.offen ? verwandt(y.b) : 0) - (x.b.offen ? verwandt(x.b) : 0) || x.i - y.i).map((x) => x.b);
    // offene Punkte: wenn sie etwas beitragen, wenn es gar kein Wissen gibt – oder einer, wenn nach genau einem Wort gefragt
    // ist, es wörtlich im Titel des offenen Punkts steht und die Antwort noch kurz ist
    for (const b of nachVerwandtschaft(beste)) {
      if (!b.offen || offen.length >= 2) continue;
      const einWort = pflicht.length === 1 && !offen.length && fakten.length <= 2 && b.imTitel.some((s) => pflicht.includes(s));
      if (!fakten.length || b === erster || fehlt(traegt(b)) || einWort) dazu(b);
    }
    // fehlt noch ein Wort der Frage? Dann darf dazu, wer genau dieses Wort im Titel oder Tag trägt („Akupunktur“ + „Kosten“)
    for (const b of nachVerwandtschaft(passend)) {
      if (!fehlt(pflicht)) break;
      if (fakten.includes(b) || offen.includes(b) || !fehlt(traegt(b))) continue;
      if (b.offen ? offen.length < 2 : fakten.length < 3) dazu(b);
    }
    if (fehlt(pflicht)) {
      // ein offener Punkt, der das Thema der Frage im Titel trägt: ehrlich sagen, dass genau das noch offen ist.
      // Thema = ein Wort, das in dieser Auswahl nicht überall steht („Öffnungszeiten“ ja, „Behandlung“ oder „Training“ nein)
      const selten = (s) => pflicht.includes(s) && bewertet.filter((b) => b.deckt.includes(s)).length <= Math.max(1, Math.floor(bewertet.length / 2));
      const punkte = passend.filter((b) => b.offen && b.imKopf.some(selten) && b.deckt.filter((s) => pflicht.includes(s)).length / pflicht.length >= 0.5).slice(0, 2);
      if (!punkte.length) return luecke;
      fakten.length = 0;
      offen.length = 0;
      offen.push(...punkte);
    }

    const teile = [];
    let laenge = 0;
    for (const b of fakten) {
      const { k } = b;
      let zeilen = b.zeilen.map((z) => z.text);
      if (zeilen.join(" ").length > 420) {
        const gute = b.zeilen.filter((z) => z.treffer > 0).slice(0, 4).map((z) => z.text);
        zeilen = gute.length ? gute : zeilen.slice(0, 3);
      }
      const vorsatz = k.status === "entwurf" ? "Laut Entwurf (noch nicht bestätigt) – " : "";
      const text = zeilen.length <= 1 ? `${vorsatz}**${k.titel}:** ${zeilen[0] || ""}`.trim() : `${vorsatz}**${k.titel}:**\n${zeilen.map((z) => `- ${z}`).join("\n")}`;
      if (teile.length && laenge + text.length > 900) break;
      teile.push({ text, id: k.id });
      laenge += text.length;
    }
    const mitWissen = teile.length > 0;
    for (const b of offen) {
      const erste = b.zeilen.length ? ` – ${einzeilig(b.zeilen[0].text, 220)}` : "";
      teile.push({ text: `${mitWissen ? "Noch offen im Brain" : "Das ist im Brain noch offen"}: **${b.k.titel}**${erste}`, id: b.k.id });
    }
    return { text: teile.map((t) => t.text).join("\n\n"), quellen: teile.map((t) => t.id), luecke: "" };
  }

  return {
    KONTEXT_ARTEN, NICHTS_IM_BRAIN, VERALTET_TAGE,
    normal, stamm, woerter, inhaltsStaemme, frageWoerter, tippAbstand, passung, erstelleIndex, suchen, filtern, istVeraltet, istNieVerwendet, kuerzen, ohneVerweise,
    kontextWaehlen, antwortAusKontext,
  };
});
