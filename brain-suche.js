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
      // „10er-Karte“ ist ein Wort – sonst träfe „Kann ich mit Karte zahlen?“ die Zehnerkarten
      .replace(/(\d+er)[\s-]+(?=[a-zäöüß]{3})/g, "$1")
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
    "laeuft laufen lautet lauten nehmt nehmen nehme nimmt " +
    // gebeugte Formen, Umgangssprache und Mundart, Tageszeiten, Füllverben und Allerweltswörter („Leute“, „Haus“, „Anfang“)
    "welchem is hi hey servus moin guten morgen super top perfekt wollte wollten fragt unserem unserer unseren unseres eurem vieler vielen zwei " +
    "nachmittag nachmittags vormittag vormittags abend abends morgens mittags frueh spaet sitzt sitzen bedeutet bedeuten gemacht " +
    "melde melden leute personen menschen haus anfang ende wos eich habts seids nen ne nem wieviel find " +
    "ihre ihren ihrer ihrem deiner deinem deinen meiner meinem meinen hin her halt eben wohl bloss nix net ned scho amoi denen manchmal " +
    "erste ersten erster naechste naechsten letzte letzten neue neuen neuer gesamt gesamte ganze ganzen genaue genauen " +
    "rein raus hinein drin rauf hoch runter vorbei dabei davor danach dafuer dagegen damals spaeter frueher"
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

  const TAGE = ["mo", "di", "mi", "do", "fr", "sa", "so"];
  const BUCHSTABE = "A-Za-zÄÖÜäöüß";
  const SPANNE = new RegExp(`(^|[^${BUCHSTABE}])(Mo|Di|Mi|Do|Fr|Sa|So)\\.?\\s*[–—-]\\s*(Mo|Di|Mi|Do|Fr|Sa|So)(?![${BUCHSTABE}])`, "g");
  const STRICH_VORN = new RegExp(`([${BUCHSTABE}]{3,})-\\s+(?:und|oder|bzw\\.?|sowie)\\s+([${BUCHSTABE}]{6,})`, "g");
  const STRICH_HINTEN = new RegExp(`([${BUCHSTABE}]{6,})\\s+(?:und|oder|bzw\\.?|sowie)\\s+-([${BUCHSTABE}]{3,})`, "g");
  const BINDESTRICH = new RegExp(`([${BUCHSTABE}]{3,})-([${BUCHSTABE}]{3,})`, "g");
  /**
   * Was in einem Text mitgemeint ist, ausschreiben – nur für den Vergleich, nie für die Anzeige:
   * „Mo–Do“ → mo di mi do · „Rücken- und Schulterschmerzen“ → auch „Rückenschmerzen“ · „Bewegungsanalysen und -korrekturen“ →
   * auch „Bewegungskorrekturen“ · „Kinesio-Tape“ → auch „Kinesiotape“. Wo das Grundwort beginnt, weiß der Code nicht – er
   * bildet jede mögliche Zusammensetzung; die falschen trifft keine Frage.
   */
  function mitgemeint(text) {
    const t = String(text == null ? "" : text);
    if (!/[–—-]/.test(t)) return t;
    const zusatz = [];
    for (const m of t.matchAll(SPANNE)) {
      const i = TAGE.indexOf(m[2].toLowerCase());
      const j = TAGE.indexOf(m[3].toLowerCase());
      if (i >= 0 && j > i) zusatz.push(TAGE.slice(i, j + 1).join(" "));
    }
    for (const m of t.matchAll(STRICH_VORN)) for (let i = 2; i <= m[2].length - 5; i++) zusatz.push(m[1] + m[2].slice(i).toLowerCase());
    for (const m of t.matchAll(STRICH_HINTEN)) for (let i = 4; i < m[1].length; i++) zusatz.push(m[1].slice(0, i) + m[2].toLowerCase());
    for (const m of t.matchAll(BINDESTRICH)) zusatz.push(m[1] + m[2].toLowerCase());
    return zusatz.length ? `${t} ${zusatz.join(" ")}` : t;
  }

  /** Wortstämme eines Texts ohne Füllwörter (mit Wiederholungen) – das, was ein Knoten inhaltlich „sagt“, samt Mitgemeintem. */
  function inhaltsStaemme(text) {
    const liste = [];
    for (const w of normal(mitgemeint(text)).split(" ")) {
      if (!w || FUELLWOERTER.has(w) || (w.length < 2 && !/\d/.test(w))) continue;
      const st = stamm(w);
      if (!FUELLWOERTER.has(st)) liste.push(st);
    }
    return liste;
  }

  /** Suchwörter einer Anfrage: Wortstämme ohne Füllwörter (auch gebeugte: „unserem“, „vielen“), jedes nur einmal. */
  function woerter(text) {
    const gesehen = new Set();
    for (const w of normal(text).split(" ")) {
      if (!w || FUELLWOERTER.has(w) || (w.length < 2 && !/\d/.test(w))) continue;
      const st = stamm(w);
      if (!FUELLWOERTER.has(st)) gesehen.add(st);
    }
    return [...gesehen];
  }

  // Wortfelder: wer nach „Kosten“ fragt, meint auch „Preis“. Bewusst klein gehalten (Wörter in Vergleichsform).
  const WORTFELDER = [
    ["preis", "kost", "kostet", "teuer", "gebuehr", "tarif", "euro", "bezahl", "selbstzahl", "zahlt", "zahlen"],
    ["standort", "adress", "anfahrt", "anschrift", "strass", "wegbeschreibung", "filiale", "postleitzahl", "plz", "stadt"],
    ["oeffnungszeit", "geoeffnet", "offen", "geschlossen", "sprechzeit", "sprechstund", "vorbeikommen", "vorbeischauen"],
    ["telefon", "telefonisch", "telefonnummer", "telefonnr", "tel", "telnr", "rufnummer", "handynummer", "anruf", "anrufen", "nummer", "nr", "erreich", "erreichbar"],
    ["email", "mail"],
    ["termin", "terminbuchung", "terminvergabe", "terminvereinbarung", "buchen", "anmeld", "anmeldung", "vereinbar"],
    ["kass", "kasse", "krankenkass", "kassenpatient", "gesetzlich", "versichert", "privat", "privatpraxis", "privatpatient", "abrechn", "abrechnung"],
    ["rezept", "verordnung", "ueberweisung"],
    ["park", "parkplatz", "parkplaetz", "parkmoeglichkeit", "parkhaus", "tiefgarage", "barrierefrei", "barrierefreiheit", "rollstuhl", "aufzug"],
    ["kind", "jugend", "jugendlich", "youngster"],
    ["alt", "alter", "jahr", "jaehrig"],
    ["team", "mitarbeit", "mitarbeiter", "kolleg", "personal", "therapeut", "therapeutin", "physiotherapeut"],
    ["inhaber", "chef", "gruender", "besitzer", "leitung", "leitet", "leiter", "leiten", "geschaeftsfuehrer", "praxisleitung", "praxismanagerin", "managerin", "manager", "managt"],
    ["gegruendet", "gruendung", "geschicht", "entstehung"],
    ["partner", "kooperation", "kooperationspartner", "referenz", "verein", "club"],
    ["montag", "montags", "mo"], ["dienstag", "dienstags", "di"], ["mittwoch", "mittwochs", "mi"], ["donnerstag", "donnerstags", "do"],
    ["freitag", "freitags", "fr"], ["samstag", "samstags", "sa"], ["sonntag", "sonntags"], ["feiertag", "feiertags"],
    ["dauert", "dauer", "stunde", "minute"],
    ["gross", "groesse", "quadratmeter", "qm", "m2", "flaeche"],
  ];
  const WOCHENTAGE = ["montag", "montags", "mo", "dienstag", "dienstags", "di", "mittwoch", "mittwochs", "mi", "donnerstag", "donnerstags", "do", "freitag", "freitags", "fr", "samstag", "samstags", "sa", "sonntag", "sonntags"];
  // Oberbegriffe gelten nur in eine Richtung: wer nach dem „Tag“ fragt, meint jeden Wochentag – „Montag“ meint aber nicht „Freitag“
  const OBERBEGRIFFE = [
    ["tag", WOCHENTAGE], ["tagen", WOCHENTAGE], ["wochentag", WOCHENTAGE], ["wochenend", ["samstag", "samstags", "sa", "sonntag", "sonntags"]],
    // „Leistungen“ und „Angebot“ meinen alles, was behandelt und therapiert wird – aber „Trainingstherapie“ meint nicht „Leistung“
    ["leistung", ["angebot", "behandlung", "therapi"]], ["angebot", ["leistung", "behandlung", "therapi"]],
    ["behandlung", ["therapi"]], ["therapi", ["behandlung"]],
    ["trainier", ["training"]], ["trainiert", ["training"]],
  ];
  // Oberbegriffe, die eine Eigenschaft meinen (die übrigen sind Themen)
  const OBER_EIGENSCHAFT = ["tag", "tagen", "wochentag", "wochenend"];
  // Felder, die eine Eigenschaft meinen (Preis, Adresse, Zeiten, Kontakt …) und kein eigenes Thema: Eine Antwort darf so ein
  // Wort nicht von einem anderen Thema borgen („Was kostet Akupunktur?“ ist mit dem Preis der Osteopathie nicht beantwortet).
  const EIGENSCHAFT_FELDER = ["preis", "standort", "oeffnungszeit", "telefon", "email", "termin", "kass", "rezept", "park", "alt", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag", "feiertag", "dauert", "gross"];
  // Wörter für die Praxis selbst und ihre Patienten: stehen fast überall und müssen in einer Antwort nicht vorkommen
  // („Ist die Praxis barrierefrei?“, „Was sage ich einem Patienten, der nach Parkplätzen fragt?“)
  const ALLGEMEIN = ["praxis", "praxen", "patient", "patienten", "patientin", "patientinnen"];
  // Verben, die in einer Praxis fast jede Frage tragen („Behandelt ihr Migräne?“): keine Pflicht, aber ein Hinweis fürs Ordnen
  const SCHWACH = ["behandelt", "behandeln", "behandle", "betreut", "betreuen", "betreue", "leitet", "leiten", "leite"];
  const FELD_ZU_WORT = new Map();
  const feldDazu = (wort, feld) => { const alt = FELD_ZU_WORT.get(wort); FELD_ZU_WORT.set(wort, alt ? [...new Set([...alt, ...feld])] : feld); };
  // unter dem Wort und unter seinem Stamm: gesucht wird immer mit Stämmen („Preis“ → „prei“, „Inhaber“ → „inhab“)
  for (const feld of WORTFELDER) for (const w of feld) { feldDazu(w, feld); feldDazu(stamm(w), feld); }
  for (const [ober, unter] of OBERBEGRIFFE) { feldDazu(ober, [ober, ...unter]); feldDazu(stamm(ober), [ober, ...unter]); }
  const EIGENSCHAFT = new Set([
    ...WORTFELDER.filter((feld) => EIGENSCHAFT_FELDER.includes(feld[0])).flatMap((feld) => feld.flatMap((w) => [w, stamm(w)])),
    ...OBER_EIGENSCHAFT.flatMap((ober) => [ober, stamm(ober)]),
  ]);
  const ALLGEMEIN_STAEMME = new Set(ALLGEMEIN.flatMap((w) => woerter(w)));
  // Fragewörter sind Füllwörter, sagen aber, wonach gesucht wird
  const FRAGEWORT = { wo: ["standort", "adress"], wann: ["zeit", "uhr"], wieviel: ["preis"], wer: ["team"] };
  // Wendungen, die eindeutig sagen, worum es geht – zählen wie ein Suchwort (über das Wortfeld auch „Geschichte“, „Gründung“)
  const ABSICHT = [
    [/\bseit wann\b|\bwie lange gibt es\b|\bwie alt ist\b|\bwie lange (?:schon|bereits)\b|\bseit wie viel/, "gegruendet"],
    [/\bwem gehoert\b|\bwer besitzt\b/, "inhaber"],
    [/\bwie heiss(?:t|en)\b/, "name"],
    // „Habt ihr samstags auf?“, „Seid ihr am Sonntag da?“, „Hat die Praxis mittwochs zu?“
    [/\b(?:habt|seid|macht|habts|seids) ihr\b.*\b(?:auf|offen|zu|da)$|\b(?:hat|ist|macht) die praxis\b.*\b(?:auf|offen|zu)$|\bwann\b.*\b(?:macht|habt|seid)\b.*\b(?:auf|zu)$/, "oeffnungszeit"],
  ];
  // Fragen ganz ohne Inhaltswort („Wo seid ihr?“, „Wann habt ihr auf?“, „Wo ist die Praxis?“): das Fragewort ist dann die Frage
  const ABSICHT_OHNE_INHALT = [[/\bwo\b|\bwohin\b/, "standort"], [/\bwann\b/, "oeffnungszeit"], [/\bwie ?viel\b|\bwieviel\b/, "preis"], [/\b(?:bietet|bieten|anbieten|angebot)\b/, "leistung"], [/\bwer\b/, "team"]];
  // Begrüßung und Anrede am Anfang gehören nicht zur Frage („Guten Morgen, kannst du mir sagen …“, „Hey Gabi, …“)
  const GRUSS = /^\s*(?:(?:hallo|hi|hey|servus|moin|grü(?:ß|ss)\s+(?:gott|dich)|guten\s+(?:morgen|tag|abend)|sag\s+mal)(?![A-Za-zÄÖÜäöüß])[\s,!.]*)+(?:gabi(?![A-Za-zÄÖÜäöüß])[\s,!.:]*)?/i;

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
   * Tippfehler ausgleichen: Ein Suchwort (ab 6 Buchstaben), das im Bestand weder genau noch als Wortanfang vorkommt und in
   * keinem Wortfeld steht, wird durch das ähnlichste Wort des Bestands ersetzt – ein Tippfehler, ab 10 Buchstaben zwei;
   * der erste Buchstabe muss stimmen.
   */
  function tippfehlerAusgleichen(such, bestand) {
    const liste = Array.isArray(bestand) ? bestand : [...bestand];
    const ergebnis = [];
    for (const w of such) {
      let wort = w;
      if (w.length >= 6 && !/\d/.test(w) && !FELD_ZU_WORT.has(w) && !liste.some((x) => passung(w, x) >= 0.7)) {
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
   * zusatz = schwache Hinweise aus Fragewörtern („wo“ → Standort); gross = Wörter, die mitten im Satz großgeschrieben
   * sind (Hauptwörter und Namen – steht so ein Wort nirgends im Brain, geht es um etwas Neues).
   * Ohne jedes Inhaltswort wird das Fragewort zur Frage; „Praxis“ und „Patient“ zählen dabei nicht als Inhalt.
   */
  function frageWoerter(anfrage, bestand = null) {
    const ganz = String(anfrage == null ? "" : anfrage);
    const ohneGruss = ganz.replace(GRUSS, "");
    const frage = ohneGruss.trim() ? ohneGruss : ganz;
    const text = normal(frage);
    const roh = text.split(" ").filter(Boolean);
    let such = woerter(frage);
    if (bestand) such = tippfehlerAusgleichen(such, bestand);
    const zusatz = [];
    for (const w of roh) if (FRAGEWORT[w]) zusatz.push(...FRAGEWORT[w]);
    if (roh.includes("wie") && roh.includes("viel")) zusatz.push(...FRAGEWORT.wieviel);
    const gemeintSchon = (wort) => such.some((s) => s === wort || (FELD_ZU_WORT.get(s) || []).includes(wort));
    let wendung = false;
    for (const [muster, wort] of ABSICHT) if (muster.test(text)) { wendung = true; if (!gemeintSchon(wort)) such.push(wort); }
    if (!wendung && !such.some((s) => !ALLGEMEIN_STAEMME.has(s))) {
      for (const [muster, wort] of ABSICHT_OHNE_INHALT) if (muster.test(text)) { if (!such.includes(wort)) such.push(wort); break; }
    }
    // großgeschrieben mitten im Satz (nicht am Satzanfang): Hauptwörter und Namen
    const gross = new Set();
    const stuecke = frage.trim().split(/\s+/);
    stuecke.forEach((stueck, i) => {
      if (i === 0 || /[.!?:]$/.test(stuecke[i - 1])) return;
      if (/^[("„»]*[A-ZÄÖÜ]/.test(stueck)) for (const w of woerter(stueck)) gross.add(w);
    });
    return { such, zusatz: [...new Set(zusatz)], roh, gross: [...gross] };
  }

  // [kürzeres Wort, längeres Wort mit demselben Anfang] – als Wortstämme, wie stamm() sie liefert („Rezeption“ → „rezeptio“)
  const FALSCHE_FREUNDE = [["rezept", "rezeptio"]];
  // Endungen (an Wortstämmen): „telefonisch“ ↔ „Telefon“, „kostet“ ↔ „Kosten“, „Praxis“ ↔ „Praxen“, „Rezeptionistin“ ↔ „Rezeption“
  const ENDUNG = /^(?:e|en|er|ern|es|em|n|s|ns|i|is|in|innen|nen|et|t|st|te|ten|isch|ische|ischen|nisch|ung|ungen|ing|ier|iere|ieren|iert|l|ler|lerin|lich|liche|chen|ist|isti|nist|nisti)$/;
  // allgemeines Grundwort: „Triggerpunktbehandlung“ fragt nach dem Triggerpunkt. („…therapie“ gehört nicht dazu:
  // „Trainingstherapie“ ist ein eigener Name und fragt nicht nach „Training“.)
  const GRUNDWORT = ["behandlung"];
  /**
   * Wie gut passt ein Suchwort zu einem Wort aus dem Bestand?
   * 1 = gleich · 0,7 = deutlich: getippter Wortanfang („Akupunktur“ ↔ „Akupunkturbehandlung“), nur eine Endung mehr
   * („telefonisch“ ↔ „Telefon“), das Gefragte ist das Grundwort („Ärztin“ ↔ „Fachärztin“) · 0,45 = schwach: nur das
   * Bestimmungswort stimmt („Bewegungsbad“ ↔ „Bewegung“), Wortteil, langer gemeinsamer Anfang · 0 = passt nicht.
   */
  function passung(suchwort, wort) {
    if (suchwort === wort) return 1;
    if (/^\d+$/.test(suchwort) || /^\d+$/.test(wort)) return 0; // Zahlen nur genau
    // falsche Freunde: gleicher Wortanfang, anderes Wort („Brauche ich ein Rezept?“ fragt nicht nach der Rezeption)
    for (const [eins, zwei] of FALSCHE_FREUNDE) {
      const a = suchwort.startsWith(zwei) ? 2 : suchwort.startsWith(eins) ? 1 : 0;
      const b = wort.startsWith(zwei) ? 2 : wort.startsWith(eins) ? 1 : 0;
      if (a && b && a !== b) return 0;
    }
    if (suchwort.length <= wort.length) {
      if (suchwort.length >= 4 && wort.startsWith(suchwort)) return 0.7;
      if (suchwort.length >= 5 && wort.endsWith(suchwort)) return 0.7;
      if (suchwort.length >= 5 && wort.includes(suchwort)) return 0.45;
    } else {
      if (wort.length >= 4 && suchwort.startsWith(wort)) {
        const rest = suchwort.slice(wort.length);
        return ENDUNG.test(rest) || GRUNDWORT.includes(rest) || GRUNDWORT.includes(rest.replace(/^s/, "")) ? 0.7 : 0.45;
      }
      if (wort.length >= 5 && suchwort.includes(wort)) return 0.45;
    }
    const kurz = suchwort.length <= wort.length ? suchwort : wort;
    const lang = suchwort.length <= wort.length ? wort : suchwort;
    let gleich = 0;
    while (gleich < kurz.length && kurz[gleich] === lang[gleich]) gleich++;
    if (gleich >= 8) {
      // gleiches Bestimmungswort, Grundwörter aus demselben Wortfeld: „Kiefergelenksbehandlung“ ↔ „Kiefergelenkstherapie“
      const a = suchwort.slice(gleich).replace(/^s/, "");
      const b = wort.slice(gleich).replace(/^s/, "");
      if (a.length >= 4 && b.length >= 4 && (FELD_ZU_WORT.get(a) || []).some((v) => v === b || stamm(v) === b)) return 0.7;
    }
    // verwandt: langer gemeinsamer Wortanfang („trainieren“ ↔ „Training“)
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
  function suchen(index, anfrage, opt) {
    return suchenMitWoertern(index, anfrage, opt).treffer;
  }
  /** Wie suchen(), dazu die Suchwörter, mit denen gesucht wurde: { treffer, such }. */
  function suchenMitWoertern(index, anfrage, { limit = 20, praefix = true } = {}) {
    if (!index || !index.docs.length) return { treffer: [], such: [] };
    // Suchwörter (Tippfehler am Bestand ausgeglichen), dazu schwächer: Fragewörter – und unten die Wortfelder
    const { such, zusatz, roh } = frageWoerter(anfrage, index.vokabular.keys());
    const letztes = praefix && roh.length ? roh[roh.length - 1] : "";
    if (!such.length && !zusatz.length && !(letztes && letztes.length >= 2)) return { treffer: [], such };

    const N = index.docs.length;
    const punkte = new Float64Array(N);
    const direkt = new Float64Array(N); // Zahl der Suchwörter mit direktem Treffer
    const staerke = new Float64Array(N);
    const gefunden = Array.from({ length: N }, () => null);
    const je = Array.from({ length: N }, () => null); // je Knoten: Suchwort → wie gut es dort steht (1 genau … 0,5 nur über das Wortfeld)
    const merke = (nr, suchwort, p) => { const m = je[nr] || (je[nr] = {}); if (!(m[suchwort] >= p)) m[suchwort] = p; };

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
      for (const [nr, t] of direktTf) merke(nr, w, t.p);
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
        for (const nr of tf.keys()) merke(nr, w, 0.5);
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
      ergebnis.push({ id: d.id, punkte: wert, woerter: gefunden[nr] ? [...gefunden[nr]] : [], deckung, stark: staerke[nr] >= 0.45, imTitel, je: je[nr] || {} });
    }
    ergebnis.sort((a, b) => b.punkte - a.punkte || (a.id < b.id ? -1 : 1));
    return { treffer: ergebnis.slice(0, limit), such };
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
   * dazu: Kennungen von Einträgen, die ausdrücklich dazugehören – die Quellen der vorigen Antwort bei einer Folgefrage
   * („Und am Samstag?“). Sie kommen gleich nach den Treffern (höchstens drei), auch wenn die Frage selbst nichts findet.
   */
  function kontextWaehlen({ frage, knoten, kanten = [], maxKnoten = 8, maxZeichen = 6000, proKnoten = 1500, index = null, dazu = [] } = {}) {
    const kandidaten = (Array.isArray(knoten) ? knoten : []).filter((k) => k && k.id && !k.geloescht && !k.abgeleitet && KONTEXT_ARTEN.includes(k.art));
    if (!kandidaten.length || !String(frage || "").trim()) return [];
    const nachId = new Map(kandidaten.map((k) => [k.id, k]));
    const vorab = [...new Set((Array.isArray(dazu) ? dazu : []).filter((id) => nachId.has(id)))].slice(0, 3);
    const alle = suchenMitWoertern(index || erstelleIndex(kandidaten), frage, { limit: 60, praefix: false });
    const treffer = alle.treffer.filter((t) => nachId.has(t.id));
    if (!treffer.length && !vorab.length) return [];
    const bester = treffer.length ? treffer[0].punkte : 0;
    // (1) Je Suchwort die zwei Knoten, die es am besten tragen (wörtlich vor Wortfeld). So fehlt der Eintrag zum Thema nicht,
    //     nur weil ein anderer Knoten zufällig zwei Wörter der Frage enthält („Was kostet die Trainingstherapie?“).
    const gewaehlt = new Set();
    for (const w of alle.such || []) {
      const mit = treffer.filter((t) => (t.je[w] || 0) >= 0.5).sort((x, y) => Number(y.je[w] >= 0.7) - Number(x.je[w] >= 0.7) || y.punkte - x.punkte);
      for (const t of mit.slice(0, 2)) gewaehlt.add(t.id);
    }
    // (2) Dazu, was insgesamt wirklich zur Frage gehört: ein Suchwort steht da und der Abstand zum besten ist nicht zu groß
    for (const t of treffer) if (t.stark && t.punkte >= bester * 0.25) gewaehlt.add(t.id);
    const direkt = treffer.filter((t) => gewaehlt.has(t.id) && t.stark).slice(0, Math.max(1, maxKnoten - 2));
    if (!direkt.length && !vorab.length) return [];
    const reihe = direkt.map((t) => t.id);
    const drin = new Set(reihe);
    for (const id of vorab) if (reihe.length < maxKnoten && !drin.has(id)) { drin.add(id); reihe.push(id); }
    // (3) Nachbarn der zwei besten: ausdrückliche Verweise immer, „gehört zu“ nur, wenn der Nachbar selbst zur Frage passt
    const punkteVon = new Map(treffer.map((t) => [t.id, t.punkte]));
    const nachbarn = [];
    for (const id of direkt.slice(0, 2).map((t) => t.id)) {
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
    // (4) Freie Plätze mit den nächstbesten Treffern füllen, die ein Suchwort deutlich tragen – die Auswahl ist nur eine
    //     Wortsuche; was Gabi (mit KI) davon braucht, entscheidet sie selbst
    for (const t of treffer) {
      if (reihe.length >= maxKnoten) break;
      if (!drin.has(t.id) && Object.values(t.je).some((p) => p >= 0.5)) { drin.add(t.id); reihe.push(t.id); }
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
  const NUMMER_WORT = new Set(["telefonnummer", "telefonnr", "telnr", "rufnummer", "handynummer", "nummer", "nr", "tel"].flatMap((w) => [w, stamm(w)]));
  /** Die Posten einer Aufzählung: Kommas und Strichpunkte außerhalb von Klammern trennen. */
  function posten(text) {
    const teile = [];
    let tiefe = 0;
    let start = 0;
    const t = String(text || "");
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === "(") tiefe += 1;
      else if (c === ")") tiefe = Math.max(0, tiefe - 1);
      else if ((c === "," || c === ";") && tiefe === 0) { teile.push(t.slice(start, i)); start = i + 1; }
    }
    teile.push(t.slice(start));
    return teile.map((x) => x.trim()).filter(Boolean);
  }
  /** Steht ein Wort aus dem Wortfeld des Suchworts in dieser Wortliste? */
  const imWortfeld = (suchwort, wortliste) => (FELD_ZU_WORT.get(suchwort) || []).some((v) => v !== suchwort && wortliste.some((x) => passung(v, x) >= 0.7));
  /** Steht das Suchwort (oder ein Wort aus seinem Wortfeld) in dieser Wortliste? */
  const kommtVor = (suchwort, wortliste) => wortliste.some((x) => passung(suchwort, x) >= 0.45) || imWortfeld(suchwort, wortliste);
  /** … wörtlich: genau, als Wortanfang, mit Endung oder als Grundwort – ohne Wortfeld. */
  const woertlich = (suchwort, wortliste) => wortliste.some((x) => passung(suchwort, x) >= 0.7);
  /** … deutlich: wörtlich oder über das Wortfeld – nicht nur als Teil eines längeren Worts. */
  const kommtDeutlichVor = (suchwort, wortliste) => woertlich(suchwort, wortliste) || imWortfeld(suchwort, wortliste);

  /**
   * Welchen Eintrag meint ein Text („die Telefonzeiten“, „den Preis für Osteopathie“)? Der Eintrag muss ein Inhaltswort in
   * Titel oder Tags tragen (auch über das Wortfeld); Titel zählt doppelt, ein Titel nur aus den genannten Wörtern gewinnt.
   * Kein solcher Eintrag: null – lieber nachfragen als den falschen ändern.
   */
  function zielFinden(text, knoten) {
    const liste = (Array.isArray(knoten) ? knoten : []).filter((k) => k && k.id && k.titel).map((k) => ({ k, titel: inhaltsStaemme(k.titel), tags: inhaltsStaemme((Array.isArray(k.tags) ? k.tags : []).join(" ")) }));
    const { such } = frageWoerter(text, new Set(liste.flatMap((v) => [...v.titel, ...v.tags])));
    let bester = null;
    let wert = 0;
    for (const v of liste) {
      const imTitel = such.filter((s) => kommtDeutlichVor(s, v.titel)).length;
      const inTags = such.filter((s) => !kommtDeutlichVor(s, v.titel) && kommtDeutlichVor(s, v.tags)).length;
      if (!imTitel && !inTags) continue;
      const ganz = v.titel.length > 0 && v.titel.every((t) => such.some((s) => passung(s, t) >= 0.7));
      const w = imTitel * 2 + inTags + (ganz ? 1.5 : 0);
      if (w > wert) { wert = w; bester = v.k; }
    }
    return bester;
  }

  /**
   * Antwort rein aus den übergebenen Kontext-Knoten (Demo-Modus und lokaler Betrieb ohne KI): passende Zeilen wörtlich,
   * Entwürfe und offene Punkte gekennzeichnet. Es steht nie etwas in der Antwort, das nicht in einem der Knoten steht.
   *
   * Grundsatz: lieber eine Lücke als eine Antwort am Thema vorbei.
   *  1. Thema: Wörter der Frage, die im Brain vorkommen und keine Eigenschaft meinen. Ein Wissens-Eintrag kommt nur in die
   *     Antwort, wenn er das ganze Thema trägt (bei mehreren Themenwörtern wörtlich, nicht über ein Wortfeld).
   *  2. Eigenschaft (Preis, Zeiten, Adresse, Kontakt …): zählt nur beim Thema selbst oder als offener Punkt –
   *     „Was kostet Akupunktur?“ ist mit dem Preis der Osteopathie nicht beantwortet.
   *  3. Unbekannt: ein Wort, das nirgends in der Auswahl steht. Dann gibt es nur eine Antwort, wenn der beste Eintrag zwei
   *     bekannte Wörter trägt (eines davon im Text) und das unbekannte kein großgeschriebenes Hauptwort ist („… mit Sauna?“).
   *  4. Nebensache: „Praxis“, „Patient“ und (über nebensache) der Name der Praxis sowie Zahlen müssen nicht vorkommen.
   *  5. Fehlt etwas, steht aber ein offener Punkt genau dazu im Brain: „Das ist im Brain noch offen“. Sonst:
   *     „Dazu steht noch nichts im Brain.“ und die Frage als Lücke.
   */
  function antwortAusKontext(frage, kontextKnoten, { nebensache = [] } = {}) {
    const liste = (Array.isArray(kontextKnoten) ? kontextKnoten : []).filter((k) => k && k.id && k.titel);
    const luecke = { text: NICHTS_IM_BRAIN, quellen: [], luecke: einzeilig(frage) };
    if (!liste.length) return luecke;
    const vorbereitet = liste.map((k, rang) => {
      const titel = inhaltsStaemme(k.titel);
      const kopf = [...titel, ...inhaltsStaemme((Array.isArray(k.tags) ? k.tags : []).join(" "))];
      const zeilen = zeilenVon(k.inhalt, k.titel).map((text) => {
        // „Etikett: Wert“ – das Etikett sagt, wovon die Zeile handelt („Inhaber: …“, „Für wen: …“)
        const m = /^([^:]{2,40}):\s/.exec(text);
        const teile = posten(text);
        return { text, w: inhaltsStaemme(text), etikett: m ? inhaltsStaemme(m[1]) : [], etikettSatz: m ? normal(m[1]) : "", posten: teile.length >= 4 ? teile.map((p) => ({ w: inhaltsStaemme(p) })) : null };
      });
      const text = zeilen.flatMap((z) => z.w);
      return { k, rang, titel, kopf, zeilen, text, alle: [...kopf, ...text], offen: k.status === "zu_klaeren" };
    });
    const { such, zusatz, gross } = frageWoerter(frage, new Set(vorbereitet.flatMap((v) => v.alle)));
    // Die Frage nennt wörtlich ein Etikett aus mehreren Wörtern („Für wen ist die Praxis?“ ↔ „Für wen: …“): diese Zeile ist die Antwort
    const frageText = ` ${normal(frage)} `;
    const etikettTreffer = () => {
      for (const v of vorbereitet) {
        if (v.offen) continue;
        const z = v.zeilen.find((x) => x.etikettSatz.includes(" ") && frageText.includes(` ${x.etikettSatz} `));
        if (z) return { text: `**${v.k.titel}:** ${z.text}`, quellen: [v.k.id], luecke: "" };
      }
      return null;
    };
    if (!such.length) return etikettTreffer() || luecke;

    // worum es gehen muss: alles außer Nebensachen und Zahlen (bleibt sonst nichts, zählen auch die)
    const neben = new Set([...ALLGEMEIN, ...SCHWACH, ...(Array.isArray(nebensache) ? nebensache : [])].flatMap((w) => woerter(w)));
    const schwach = new Set(SCHWACH.flatMap((w) => woerter(w)));
    const istZahl = (s) => /^\d+$/.test(s);
    let pflicht = such.filter((s) => !neben.has(s) && !istZahl(s));
    // nur „Praxis“ oder „Patient“ und nichts, was sagt, worum es geht („Für wen ist die Praxis?“): keine geratene Antwort –
    // außer es ist ein bloßes Stichwort („Praxis“)
    if (!pflicht.length) pflicht = such.filter((s) => !ALLGEMEIN_STAEMME.has(s) && !schwach.has(s) && !istZahl(s)); // der Name der Praxis zählt dann doch
    if (!pflicht.length) pflicht = such.filter((s) => schwach.has(s)); // „Wer leitet die Praxis?“
    if (!pflicht.length && normal(frage).split(" ").length > 2) return etikettTreffer() || luecke;
    if (!pflicht.length) pflicht = such.filter((s) => !istZahl(s));
    if (!pflicht.length) pflicht = such;
    const bekannt = pflicht.filter((s) => vorbereitet.some((v) => kommtDeutlichVor(s, v.alle)));
    const unbekannt = pflicht.filter((s) => !bekannt.includes(s));
    if (!bekannt.length) return luecke;
    const thema = bekannt.filter((s) => !EIGENSCHAFT.has(s));
    const eigenschaft = bekannt.filter((s) => EIGENSCHAFT.has(s));
    const themaTraegt = thema.length >= 2 ? woertlich : kommtDeutlichVor;
    // Fragewörter sagen, was gemeint ist („wo“ → Standort, „wann“ → Zeiten): wer das im Titel oder Tag trägt, rückt nach vorn
    const gemeint = (kopf) => zusatz.some((w) => kopf.some((x) => x.includes(w)));

    // Eine Eigenschaft zählt nur beim Thema: Handelt der Eintrag selbst vom Thema (Titel, Tag), zählt alles darin. Steht das
    // Thema nur im Text – etwa in einer Aufzählung –, muss die Eigenschaft beim selben Posten stehen
    // („Atemtherapie, …, Osteopathie (85 €), …“ nennt keinen Preis für die Atemtherapie).
    const beimThema = (v, s) => {
      // offene Punkte tragen eine Eigenschaft, wo immer sie steht; ein Eintrag, der sie im Titel oder Tag führt, als Ganzes
      if (v.offen || !thema.length || kommtDeutlichVor(s, v.kopf) || thema.some((t) => themaTraegt(t, v.kopf))) return kommtDeutlichVor(s, v.alle);
      return v.zeilen.some((z) => (z.posten || [z]).some((p) => thema.some((t) => themaTraegt(t, p.w)) && kommtDeutlichVor(s, p.w)));
    };
    const bewertet = vorbereitet.map((v) => {
      const deckt = bekannt.filter((s) => (EIGENSCHAFT.has(s) ? beimThema(v, s) : themaTraegt(s, v.alle)));
      const imKopf = bekannt.filter((s) => kommtDeutlichVor(s, v.kopf));
      const imTitel = bekannt.filter((s) => woertlich(s, v.titel));
      const imText = bekannt.filter((s) => kommtDeutlichVor(s, v.text));
      // der Titel besteht nur aus Wörtern der Frage: das ist der Eintrag zum Thema („Manuelle Therapie“)
      const titelGanz = v.titel.length > 0 && v.titel.every((t) => such.some((s) => passung(s, t) >= 0.7));
      const zeilen = v.zeilen.map((z) => ({ text: z.text, treffer: such.filter((s) => kommtVor(s, z.w)).length }));
      // eine Zeile „Etikett: Wert“, deren Etikett gefragt ist („Philosophie: …“, „Telefon: …“)
      // (ein Etikett, das nur den Titel wiederholt – „Team – Training“ / „Training: …“ –, sagt nichts Eigenes)
      // und nur, wenn das ganze Etikett gefragt ist – „Website“ fragt nicht nach „Schwerpunkte laut Website: …“)
      const etikett = v.zeilen.some((z) => z.etikett.length > 0 && !z.etikett.every((w) => v.titel.includes(w)) && z.etikett.every((w) => bekannt.some((s) => kommtDeutlichVor(s, [w]))));
      // „Telefonnummer?“: der Eintrag mit einer Nummer geht vor den mit den Telefonzeiten
      const nummer = bekannt.some((s) => NUMMER_WORT.has(s)) && v.zeilen.some((z) => /\+?\d[\d ()/-]{6,}\d/.test(z.text) && !/\d{1,2}:\d{2}/.test(z.text.replace(/\+?\d[\d ()/-]{6,}\d/g, "")));
      // wörtlich schlägt Wortfeld: „Praxismanagerin“ steht bei der Praxismanagerin, nicht beim Inhaber
      const genau = bekannt.filter((s) => woertlich(s, v.alle)).length / bekannt.length;
      const staerke = deckt.length / bekannt.length + imKopf.length * 0.25 + (gemeint(v.kopf) ? 0.4 : 0) + (titelGanz ? 0.5 : 0) + (etikett ? 0.3 : 0) + (nummer ? 0.8 : 0) + genau * 0.1
        + such.filter((s) => neben.has(s) && woertlich(s, v.titel)).length * 0.1 + such.filter((s) => schwach.has(s) && woertlich(s, v.text)).length * 0.15;
      return { k: v.k, rang: v.rang, titel: v.titel, kopf: v.kopf, alle: v.alle, roh: v.zeilen, zeilen, deckt, imKopf, imTitel, imText, etikett, gemeint: gemeint(v.kopf), offen: v.offen, staerke, ganzesThema: thema.every((s) => deckt.includes(s)) };
    });
    const nachRang = (a, b) => b.staerke - a.staerke || Number(a.offen) - Number(b.offen) || a.rang - b.rang; // bei Gleichstand: Wissen vor offenen Punkten
    // in Frage kommt, wer das ganze Thema trägt – ohne Thema: wer eine der gefragten Eigenschaften im Titel oder Tag trägt
    // (dass irgendwo im Text „offene Punkte“ steht, macht einen Eintrag nicht zur Antwort auf „Habt ihr offen?“)
    const passend = bewertet.filter((b) => b.deckt.length && b.ganzesThema && (thema.length || b.imKopf.length || b.etikett)).sort(nachRang);
    const offenePunkte = bewertet.filter((b) => b.offen && b.deckt.length).sort(nachRang);

    /** Die Antwort aus den gewählten Einträgen: Wissen wörtlich, offene Punkte mit „noch offen“. */
    const fertig = (wissen, offenes) => {
      const teile = [];
      let laenge = 0;
      for (const b of wissen) {
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
      for (const b of offenes) {
        const erste = b.zeilen.length ? ` – ${einzeilig(b.zeilen[0].text, 220)}` : "";
        teile.push({ text: `${mitWissen ? "Noch offen im Brain" : "Das ist im Brain noch offen"}: **${b.k.titel}**${erste}`, id: b.k.id });
      }
      return { text: teile.map((t) => t.text).join("\n\n"), quellen: teile.map((t) => t.id), luecke: "" };
    };

    // „X und Y“ (zwei Themen, kein Eintrag trägt beide): je Thema der Eintrag, der es im Titel oder Tag führt
    if (thema.length >= 2 && !eigenschaft.length && !unbekannt.length && !passend.some((b) => !b.offen) && /\s(?:und|oder|sowie)\s/.test(frageText)) {
      const je = [];
      for (const t of thema) {
        const b = bewertet.filter((x) => !x.offen && woertlich(t, x.kopf)).sort(nachRang)[0];
        if (!b) { je.length = 0; break; }
        if (!je.includes(b)) je.push(b);
      }
      if (je.length && je.length <= 3) return fertig(je, []);
    }

    const fakten = [];
    const offen = [];
    const gedeckt = new Set();
    const dazu = (b) => { if (fakten.includes(b) || offen.includes(b)) return; (b.offen ? offen : fakten).push(b); for (const s of b.deckt) gedeckt.add(s); };
    const fehlt = () => bekannt.filter((s) => !gedeckt.has(s));
    // der beste Eintrag: Wissen, das alles Gefragte trägt, geht vor – sonst der stärkste („Wer ist Dr. Pohle?“ steht im
    // Eintrag zur Akupunktur, auch wenn ein offener Punkt den Namen im Titel trägt)
    const erster = passend.find((b) => !b.offen && b.deckt.length === bekannt.length) || passend[0] || null;
    if (erster) {
      // die Besten – trägt der beste das Gemeinte im Titel („wann“ → „…zeiten“), dann nur noch solche
      // … und führt er das ganze Thema im Titel oder Tag („Praxis Thumenberger Weg“), dann nur noch Einträge, die das auch tun –
      // einer, der das Thema bloß im Text erwähnt („Standorte“), trägt dann nichts Eigenes bei. Ausnahme: Das Fragewort zeigt
      // auf ihn und nicht auf den besten („Wer macht Osteopathie?“ → dazu der Team-Eintrag, der die Person nennt).
      const themaImKopf = (b) => thema.length > 0 && thema.every((t) => themaTraegt(t, b.kopf));
      const nurKopf = themaImKopf(erster);
      const beste = passend.filter((b) => b === erster || (b.staerke >= erster.staerke * 0.75 && (!erster.gemeint || b.gemeint || b.etikett)
        && (!nurKopf || themaImKopf(b) || b.etikett || (b.gemeint && !erster.gemeint))));
      for (const b of beste) if (!b.offen && fakten.length < 3) dazu(b);
      // Übersichts-Eintrag („Dazu gehören: A, B“): die genannten Einträge kommen mit, wenn es höchstens drei sind
      if (!erster.offen) {
        const zeile = erster.roh.map((z) => z.text).find((t) => /^dazu geh(?:ö|oe)ren\s*:/i.test(t));
        const namen = zeile ? zeile.replace(/^[^:]*:/, "").split(/[,;]/).map((t) => t.replace(/[.\s]+$/, "").trim().toLowerCase()).filter(Boolean) : [];
        if (namen.length && namen.length <= 3) for (const b of bewertet) if (!b.offen && fakten.length < 4 && namen.includes(String(b.k.titel).trim().toLowerCase())) dazu(b);
      }
    }
    // Gefragt ist eine Eigenschaft (Preis, Zeiten …), die kein Wissens-Eintrag beim Thema trägt: Dann genügt der eine Eintrag
    // zum Thema – weitere (das Team, die Trainingszeiten) lenken nur von dem ab, was fehlt („Was kostet Atemtherapie?“)
    if (eigenschaft.length && fakten.length > 1 && !fakten.some((b) => eigenschaft.some((s) => b.deckt.includes(s)))) {
      const bleibt = fakten.includes(erster) ? erster : fakten[0];
      fakten.length = 0;
      fakten.push(bleibt);
    }
    // Offene Punkte. Reihenfolge: der beste Eintrag selbst zuerst; dann keiner, der im Titel einen anderen Eintrag nennt (der
    // gehört zu jenem); dann die, die mit dem besten Eintrag verwandt sind (gemeinsame Wörter in Titel/Tags außer denen der
    // Frage); dann nach Stärke.
    const andereTitel = () => bewertet.filter((b) => !b.offen && !fakten.includes(b) && b.titel.length >= 2).map((b) => b.titel);
    const nenntAnderen = (b) => andereTitel().some((t) => t.every((w) => b.titel.includes(w)));
    const verwandt = (b) => (erster && b !== erster ? b.kopf.filter((x) => !such.includes(x) && erster.kopf.includes(x)).length : 0);
    const geordnet = offenePunkte.map((b, i) => ({ b, i, selbst: Number(b !== erster), fremd: Number(nenntAnderen(b)), v: verwandt(b) }))
      .sort((x, y) => x.selbst - y.selbst || x.fremd - y.fremd || y.v - x.v || x.i - y.i).map((x) => x.b);
    if (erster) {
      for (const b of geordnet) {
        if (offen.length >= 2 || offen.includes(b)) continue;
        // (a) es gibt gar kein Wissen, oder der offene Punkt ist selbst der beste Eintrag
        const allein = !fakten.length && b.ganzesThema && b.staerke >= erster.staerke * 0.75;
        // (b) nach genau einem Wort gefragt, es steht im Titel des offenen Punkts (ohne Thema auch über das Wortfeld) und die
        //     Antwort ist noch kurz: „Akupunktur“ → dazu die offene Frage zur Akupunktur
        const einWort = bekannt.length === 1 && !offen.length && fakten.length <= 2 && !nenntAnderen(b)
          && (b.imTitel.length > 0 || (!thema.length && kommtDeutlichVor(bekannt[0], b.titel)));
        // (c) der offene Punkt trägt das ganze Thema und genau das Gemeinte im Titel: „Wo findet das Youngster Training statt?“
        const gemeintes = b.gemeint && thema.length > 0 && thema.every((t) => b.imKopf.includes(t));
        if (allein || b === erster || einWort || gemeintes) dazu(b);
      }
    }
    // fehlt noch eine Eigenschaft („… kostet …“)? Dann darf ein offener Punkt dazu, der sie im Titel oder Tag trägt
    if (fehlt().length && (erster || !thema.length)) {
      for (const b of geordnet) {
        if (!fehlt().length || offen.length >= 2) break;
        if (offen.includes(b) || nenntAnderen(b)) continue;
        if (b.imKopf.some((s) => fehlt().includes(s))) { offen.push(b); for (const s of b.imKopf) gedeckt.add(s); }
      }
    }

    // Ist die Frage damit beantwortet? Alles Bekannte gedeckt – und Unbekanntes nur mit genug Belegen und nie ein Hauptwort
    const grossUnbekannt = unbekannt.some((s) => gross.includes(s));
    const belegt = Boolean(erster) && erster.deckt.length >= 2 && erster.imText.length >= 1;
    const beantwortet = (fakten.length || offen.length) && !fehlt().length && (!unbekannt.length || (belegt && !grossUnbekannt));
    if (!beantwortet) {
      // ein offener Punkt, der das Thema der Frage im Titel trägt: ehrlich sagen, dass genau das noch offen ist – aber nur,
      // wenn die Frage nichts enthält, was das Brain gar nicht kennt, und kein Wissens-Eintrag das Thema schon trägt.
      // Thema = ein Wort, das in dieser Auswahl nicht überall steht („Öffnungszeiten“ ja, „Training“ nein).
      // Was das Brain gar nicht kennt, ist ein großgeschriebenes Hauptwort oder ein Name („Massage“, „WLAN“); ein Wort, das
      // Gabi einordnen kann (ein Wochentag, „Feiertag“), oder ein kleingeschriebenes Füllsel hindert nicht.
      if (unbekannt.some((s) => gross.includes(s) && !FELD_ZU_WORT.has(s)) || fakten.length) return luecke;
      const selten = (s) => bewertet.filter((b) => b.deckt.includes(s)).length <= Math.max(1, Math.floor(bewertet.length / 2));
      const punkte = offenePunkte.filter((b) => b.imKopf.some(selten) && b.deckt.length / bekannt.length >= 0.5 && thema.every((s) => b.deckt.includes(s))).slice(0, 2);
      if (!punkte.length) return luecke;
      offen.length = 0;
      offen.push(...punkte);
    }

    return fertig(fakten, offen);
  }

  return {
    KONTEXT_ARTEN, NICHTS_IM_BRAIN, VERALTET_TAGE,
    normal, stamm, woerter, inhaltsStaemme, mitgemeint, frageWoerter, tippAbstand, passung, erstelleIndex, suchen, filtern, istVeraltet, istNieVerwendet, kuerzen, ohneVerweise,
    kontextWaehlen, antwortAusKontext, zielFinden,
  };
});
