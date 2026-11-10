# Gabi Brain – Log (Mega-Auftrag Version 1)

Auftrag vom 10.11.2026: Gabi bekommt ein **Gedächtnis** – das Brain, ein sichtbarer, bearbeitbarer Wissensgraph.
Gabi beantwortet Praxisfragen nur daraus, zeigt die Quellen und lernt, Lücken zu schließen. Dazu die Vorlage für den
Weg zum Assistenten (Fähigkeiten-Register, Roadmap). Branch `gabi-brain`, abgezweigt von `main` = `b2a21d8`
(Live-Stand v2.1.2). Nur Testdaten.

**Feste Grenzen (eingehalten, siehe „Nicht getan“):** kein Push, kein Merge auf main, kein Deploy, keine Migration
gegen die Live-Datenbank, keine Anfrage an den Live-Worker, keine Secrets, keine Klarnamen von Patienten.

Verträge zwischen den Bausteinen: `BRAIN-BAUPLAN.md`.

## Wo weitermachen (bei Unterbrechung zuerst lesen)

| Schritt | Stand |
|---|---|
| 0 Vorab: main geprüft, Branch, Arbeitskopie | ✅ |
| 1 Bauplan und Log | ✅ `c1ae874` |
| 2 Modell `brain.js`, Suche `brain-suche.js`, Interview-Hilfen `brain-interview.js` | ✅ gebaut (`d39f887`), Unit-Tests `9f81b8f`, Antwortlogik umgebaut `f6f75c8`, zweite Überarbeitung nach Prüfrunde 1 `f214213` |
| 3 Speicher `brain-speicher.js` | ✅ `98fb09f` (112 Tests) |
| 4 Seed (Zerlegung, Generator, `brain-seed.js`) | ✅ `e4185de` (35 Tests) |
| 5 Graph `brain-graph.js` | ✅ `805c38d` (41 Tests) |
| 6 Worker (Kontext, Quellen/Lücken, Register, Staging, Supabase-Entwurf) | ✅ `072ecdf` (104 neue Tests, Probe-Build sauber) |
| 7 Ansicht `brain-ansicht.js`, `brain.css`, Einbau in `index.html`/`app.js` | ✅ gebaut (`d39f887`) |
| 8 Interview, Chat-Befehle, Fähigkeiten-Ansicht, Demo-Assistent (`brain-gespraech.js`, `demo.js`) | ✅ gebaut (`d39f887`) |
| 9 Doku (README, Roadmap, Vorlage) | ✅ README ergänzt; Roadmap und Vorlage `e4185de` |
| 10 Tests | ✅ Abschlusslauf 10.11. abends: Unit 909 grün · `tests/brain.mjs` 650/650 (Chromium + WebKit, Handy/Laptop, Hell/Dunkel, reduzierte Bewegung) · Leistung 60 Bilder/s, 0 Bilder in Ruhe (100/300/500 Knoten, beide Engines) · bisherige `tests/v2.mjs` ohne Schalter: alle bestanden · `wrangler deploy --dry-run` für beide Konfigurationen sauber · zuvor je Gebiet · neue Browser-Checks je Gebiet (`tests/brain-r1-*.mjs`): Handy 319, Daten 174, Graph 274, Sicherheit 94, Antwort 66 – alle grün in Chromium + WebKit. Abschlusslauf siehe unten |
| 11 Prüfrunde 1 + Korrekturen | ✅ alle 40 „muss“/„sollte“-Funde eingebaut, 20 „kann“ stehen unter „Später“. **Keine zweite Prüfrunde** (Sparmodus, siehe unten) |
| 12 Screenshots, Abschlusslauf, Kurzbericht | siehe „Stand“ |

**Sparmodus ab 10.11. ca. 19:30 (Anweisung von Julius):** keine parallelen Agenten mehr, keine zweite Prüfrunde, nur
bestätigte Fehler beheben, volle Endprüfung einmal am Schluss. Die vier laufenden Korrektur-Agenten wurden gestoppt; was
sie bis dahin fertig hatten (Daten komplett, Handy komplett, Graph und Sicherheit im Arbeitsstand mit grünen Tests),
habe ich selbst übernommen, Konflikte aufgelöst und neu getestet.

**Stand:** Alle drei Prioritäten (1 Datenmodell/Speicher/Brain-Ansicht im Demo-Modus · 2 Gabi nutzt das Brain mit
Kontext, Quellen-Chips, Lücken · 3 Fähigkeiten-Register und Roadmap) sind gebaut, geprüft und committet.
**Nächster Schritt:** Kurzbericht an Julius; Freigabe-Entscheidungen (siehe Bericht). Nichts weiter bauen.

Testserver während der Arbeit (nur eigene Ports): 8791 = `PORT=8791 GABI_BRAIN=1 node dev/lokal.mjs` (Brain an),
8792 = `PORT=8792 node dev/lokal.mjs` (ohne Schalter, für `tests/v2.mjs`). 8788 gehört Julius' Vorschau.

Arbeitsordner: **`~/Desktop/gabi-brain`** (Git-Arbeitskopie des Repos `~/Desktop/gabi`, Branch `gabi-brain`).
Tests: `cd ~/Desktop/gabi-brain/worker && npm test`. Lokaler Brain-Server: `npm run brain` (Port 8790).

## Entscheidungen

1. **Eigene Arbeitskopie statt Wechsel im Hauptordner.** Vorab-Prüfung: `main` sauber, gleich `origin/main`
   (`b2a21d8`), `VERSION = "2.1.2"`, Log nennt den Live-Gang v2.1.2 – passt. Auf Port 8788 läuft aber seit dem 09.11.
   Julius' Vorschau (`npm run vorschau`) und liefert die Dateien **direkt aus `~/Desktop/gabi`** aus – gegen den
   echten Worker. Hätte ich dort den Branch gewechselt, hätte seine Vorschau stundenlang halbfertigen Code gezeigt.
   Deshalb: `git worktree add -b gabi-brain ~/Desktop/gabi-brain main`. Der Hauptordner bleibt unberührt auf `main`.
   Der Branch liegt im selben Repository; nach der Freigabe genügt `git worktree remove ~/Desktop/gabi-brain`.
   `node_modules` des Workers als platzsparende APFS-Kopie übernommen (kein Download).
2. **Brain-Dateien werden nur bei aktivem Schalter geladen** (Skripte und `brain.css` per nachgeladenem
   `<script>`/`<link>` von derselben Herkunft – die CSP erlaubt das). Ohne Schalter lädt die App keine einzige
   Brain-Datei: gleiches Verhalten, gleiche Ladezeit, bisherige Tests unberührt. Deshalb auch eine eigene `brain.css`
   statt eines Anhangs an `style.css` (dort prüfen bestehende Tests einzelne Regeln per Textsuche).
3. **Aufteilung der Dateien:** `brain.js` ist das reine Modell (in Node testbar), die Oberfläche steht in
   `brain-ansicht.js` (im Auftrag nicht eigens genannt, aber `app.js` hat schon 3 000 Zeilen). Dazu erzeugt:
   `brain-seed.js`.
4. **Quellen und Lücken über Markerzeilen im Antworttext** (`Quellen: K1, K3`, `Lücke: …`), die der Worker aus dem
   Strom filtert und als Ereignisse `quellen`/`luecke` schickt. Gründe: keine zusätzliche KI-Runde (die Antwort
   erscheint so schnell wie bisher), nur die bereits live erprobte Grund-API, vollständig mit der nachgebauten
   Anthropic-API testbar. Erwogen und zurückgestellt: die eingebauten Zitate der API („citations“) – genauer, aber
   ohne Schlüssel hier nicht erprobbar (steht unter „Später“).
5. **Der Brain-Kontext steht in der Nutzernachricht, nicht im Systemprompt** – als klar abgegrenzter Datenblock.
   Was im Systemprompt steht, hat für das Modell Gewicht wie eine Anweisung; Brain-Inhalte sollen aber Daten bleiben.
   Spitze Klammern werden im Worker ersetzt (`‹ ›`), damit sich kein Block-Ende fälschen lässt.
6. **Im Brain-Modus steht das eingebaute Praxiswissen gar nicht mehr im Prompt.** So kann Gabi nichts
   „dazuerfinden“, was nicht im Kontext steht (ein Test prüft das am fertigen Prompt).
7. **„Zu klären“-Knoten gehen gekennzeichnet mit** (wie Entwürfe): Gabi sagt dann „das ist im Brain noch offen“,
   statt so zu tun, als gäbe es nichts. Als Tatsache nennt sie nur Bestätigtes.
8. **Persona und Brain-Regeln** sind der einzige Weg, auf dem Brain-Text Gabis Verhalten berührt – eng gefasst:
   nur bestätigte Knoten, kurze Längen, eigener Block nach den Kernregeln mit dem Satz „bei Widerspruch gelten die
   Regeln oben“. Importierte Regel- und Persona-Knoten kommen immer als Entwurf an (wirken erst nach Bestätigung).
9. **Abmelden:** das Häkchen „Brain-Daten auf diesem Gerät auch löschen“ ist **nicht** vorbelegt (anders als bei den
   Gesprächen): Das Brain ist mühsam gepflegtes Wissen und liegt im lokalen Modus nur auf diesem Gerät.
10. **Wissensdatei hat 7 „TODO prüfen“-Punkte** (der Auftrag nennt 6; der siebte ist „Parken und Barrierefreiheit“).
    Jeder wird ein eigener Zu-klären-Knoten.
11. **Gemeinsames Bearbeiten braucht zuerst Benutzerkonten und Rollen (Admin = Philipp).** Heute gibt es einen
    einzigen gemeinsamen Zugangscode: Läge das Brain schon in Supabase, könnte jede Person mit dem Code das Wissen
    der ganzen Praxis ändern oder löschen – und niemand sähe, wer es war. Deshalb bleibt das Brain im Prototyp auf dem
    Gerät. Die Supabase-Variante (`supabase/migrations/brain.sql`, Routen `/api/brain…`, serverseitiger Abruf
    `worker/src/brain_abruf.js`) ist nur Code hinter zwei Schaltern (`BRAIN_SPEICHER`, `BRAIN_QUELLE`, beide AUS);
    die Rollen-Vorlage (RLS) steht auskommentiert am Ende der SQL-Datei. Reihenfolge der Umstellung: README
    „Brain in Supabase (Entwurf)“.
12. **Ziehen im Graph = „ruhig“:** Beim Ziehen wandert nur der Knoten selbst, seine Blätter (Knoten, die nur an ihm
    hängen) kommen starr mit; das übrige Bild bleibt stehen (kein „Wackelpudding“ über den ganzen Graphen). Ein
    losgelassener Knoten ist festgesetzt (kleiner Punkt, auch nach dem Neuladen). Lösen: Knopf „Lösen“ im Detail oder
    „Neu anordnen“ in der Werkzeugleiste (löst alle und rechnet frisch). Kanten haben keine Pfeilspitzen (ruhigeres
    Bild; die Richtung steht im Detail unter „Verweise“ und „Rückverweise“).
13. **Eigene Adressen je Reiter** (`#/brain/graph`, `/liste`, `/luecken`, `/faehigkeiten`); `#/brain` öffnet die
    zuletzt genutzte Hauptansicht (beim ersten Mal den Graphen). So funktionieren Zurück-Taste und Links.
14. **Brain-Server lokal auf Port 8790** (`npm run brain`), getrennt von `npm run lokal`/`vorschau` (8788) – so kann
    Julius' Vorschau der Live-Version weiterlaufen, während er das Brain ansieht.

## Leistung des Graphen (gemessen am 10.11., `tests/brain-leistung.mjs`)

MacBook (Apple Silicon), Playwright headless, erfundener Graph über `?brainknoten=N` (das Brain selbst bleibt unberührt).
Laptop = 1440 × 900 bei 2-facher Pixeldichte, Handy = 390 × 844 bei 3-facher. Ziel laut Auftrag: flüssig mit 500 Knoten,
60 Bilder/s.

| Engine | Gerät | Knoten | Kanten | Layout bis zur Ruhe | Bilder/s im Layout | Bilder/s beim Verschieben und Zoomen | längstes Bild (95 %) | Zeichnen je Bild (Median / 95 %) | Bilder in Ruhe | JS-Speicher |
|---|---|---|---|---|---|---|---|---|---|---|
| Chromium | Laptop | 100 | 119 | 1,77 s (244 Schritte, Worker) | 60 | 60 | 16,7 ms | 0,2 / 0,3 ms | 0 | 4,3 MB |
| Chromium | Laptop | 300 | 369 | 1,76 s (244 Schritte, Worker) | 60 | 60 | 16,8 ms | 0,2 / 0,4 ms | 0 | 4,5 MB |
| Chromium | Laptop | 500 | 613 | 1,77 s (244 Schritte, Worker) | 60 | 60 | 16,7 ms | 0,3 / 0,5 ms | 0 | 4,5 MB |
| Chromium | Handy | 500 | 613 | 1,77 s (244 Schritte, Worker) | 60 | 60 | 16,7 ms | 0,3 / 0,4 ms | 0 | 4,5 MB |
| WebKit | Laptop | 100 | 119 | 1,75 s (244 Schritte, Worker) | 60 | 59,9 | 18 ms | 1 / 2 ms | 0 | – |
| WebKit | Laptop | 300 | 369 | 1,77 s (244 Schritte, Worker) | 60 | 60 | 17 ms | 1 / 2 ms | 0 | – |
| WebKit | Laptop | 500 | 613 | 1,77 s (244 Schritte, Worker) | 60 | 60 | 18 ms | 1 / 2 ms | 0 | – |
| WebKit | Handy | 500 | 613 | 1,77 s (244 Schritte, Worker) | 60,1 | 60 | 18 ms | 1 / 2 ms | 0 | – |

Lesehilfe:
- **Layout bis zur Ruhe** ist die sichtbare, bewusst weiche Einschwingzeit (244 Schritte, je Bild einer). Das reine
  Rechnen im Web Worker dauert laut Messung von Fork A 25–83 ms (100–500 Knoten); mit „Bewegung reduzieren“ erscheint
  gleich das fertige Bild. Beim Wiederöffnen liegen die Knoten sofort an ihrem gemerkten Platz.
- **Bilder in Ruhe = 0:** Der Graph zeichnet nur bei Bedarf – kein Dauerlauf, kein Akkuverbrauch im Stillstand.
- **JS-Speicher:** belegter Heap der ganzen Seite nach erzwungener Speicherbereinigung (nur Chromium messbar);
  der Unterschied zwischen 100 und 500 Knoten liegt bei 0,2 MB.
- WebKit nennt Zeichenzeiten nur auf ganze Millisekunden genau.

## Antwortqualität ohne KI – Umbau am 10.11. (vor der Prüfrunde)

Eigene Stichprobe mit 91 Praxisfragen gegen das Demo-Brain: Der Assistent ohne KI (Demo-Modus, `npm run brain`)
antwortete zu oft am Thema vorbei („Wie lange dauert eine Behandlung?“ → Manuelle Therapie, weil „lange“ auf
„langsame“ passte) oder gar nicht („Wo seid ihr?“, „Öfnungszeiten?“, „Wann kann ich anrufen?“). Umbau in
`brain-suche.js` (Regeln: `BRAIN-BAUPLAN.md` §4):

- **Grundsatz: lieber eine Lücke als eine Antwort am Thema vorbei.** Die Antwort muss jedes Inhaltswort der Frage
  abdecken; eine Eigenschaft (Preis, Zeiten, Adresse …) zählt nur beim gefragten Thema oder als offener Punkt.
- Tippfehler (ein Fehler ab 6, zwei ab 10 Buchstaben), „E-Mail-Adresse“ als ein Wort, mehr Füllwörter, Wortfelder
  („anrufen“ ↔ „Telefon“, „Wochenende“ ↔ „Sa“), Fragewort als Frage („Wo seid ihr?“), „seit wann“ → Gründung,
  falsche Freunde („Rezept“ ≠ „Rezeption“), Komposita („Behandlungsräume“ fragt nicht nach „Behandlung“).
- Wortfeld-Treffer gelten in der Kontext-Auswahl als Treffer – das hilft auch dem Weg mit KI („Wer ist der Chef?“
  bekam vorher gar keinen Kontext).
- `demo.js` (nur mit Brain-Kontext): medizinische Rat-Fragen („Soll ich Ibuprofen nehmen?“) bekommen die Absage statt
  einer Lücke – auch wenn so etwas im Brain stünde (Kernregel vor Brain); „Merke dir: Wir empfehlen …“ ist ein
  Merk-Befehl, keine Rat-Frage; Stichwörter („Theraband?“) suchen wie ohne Brain erst in den Notizen.
- Fragenkatalog als Test: `worker/test/brain-fragen.test.js` (80 Fälle). **Gegenprobe:** gegen den Stand davor
  (`42faa05`) schlagen 49 der neuen und angepassten Tests an, am neuen Stand sind alle grün.

Aus Fork E (Unit-Tests) übernommene Funde, alle mit Test und Gegenprobe. Gegenprobe im Browser für die Vorschläge
(`gegenprobe-vorschlag.mjs`, alter Stand `42faa05` auf eigenem Port 8793): langer Eintrag nach „Übernehmen“ nur noch
1 493 von 4 654 Zeichen, späterer Zusatz überschrieben → am neuen Stand bleibt beides erhalten (3/3).

| Fund | Stufe | Korrektur |
|---|---|---|
| Änderungsvorschlag schnitt lange Einträge ab (der Kontext kürzt auf 1 500 Zeichen, „Übernehmen“ ersetzte den ganzen Inhalt) | muss | `brain-gespraech.js`: Vorschlag nur, wenn der Server den Eintrag ungekürzt gesehen hat; sonst Hinweis und Link ins Brain. Dazu: ein Vorschlag gilt nur für den Stand (`rev`), den er kannte – ein veralteter öffnet sich zum Prüfen, statt Neueres zu überschreiben |
| „Theraband?“ wurde mit Brain zur Lücke statt zur Notiz-Suche | sollte | `demo.js`: Stichwörter erst in den Notizen suchen |
| Reine Wortfeld-Treffer kamen nie in Gabis Kontext | sollte | `brain-suche.js` (siehe oben) |
| Kurze Wortanfänge trafen falsch („lange“ → „langsame“) | sollte | Füllwörter, Abdeckungsregel |
| Eingetragene Lücke blieb „eingetragen“, auch wenn ihr Eintrag wieder gelöscht war | sollte | `brain.js`: `lueckeStand` – ohne Eintrag ist die Lücke wieder offen |
| „Merke dir: Wir empfehlen …“ bekam die Absage; „Kannst du dir merken, dass …“ wurde nicht erkannt | kann, gleich mitgemacht | `demo.js`, `brain-interview.js` |
| Nebenwirkung des Umbaus, beim Nachstellen im Browser gefunden: „Ändere die Telefonzeiten: samstags geschlossen“ traf den Eintrag zu den Öffnungszeiten (gesucht wurde mit dem ganzen Satz, also auch mit dem neuen Inhalt – durch die neuen Wortfelder schlug das durch) | muss | Ziel = der Teil vor dem Doppelpunkt (`aendernZiel`); der Browser stellt diesen Eintrag im Kontext nach vorn, der Demo-Assistent wählt danach |

## Prüfrunde 1 (10.11., Stand des Codes `6dd9047`)

Fünf Prüfer mit getrennten Blickwinkeln, jeder Fund von einem zweiten Agenten gegengeprüft (nur lesend, eigene Ports
8801–8815, kein Zugriff nach außen). Ergebnis: **60 Funde, alle 60 bestätigt – 5 „muss“, 35 „sollte“, 20 „kann“.**
(Die zwei „muss“ A1 und S1 sind derselbe Mangel aus zwei Blickwinkeln.) Eingebaut werden nur „muss“ und „sollte“;
„kann“ steht unter „Später“. Jede Korrektur bekommt einen Fehlertest, der gegen den Stand davor anschlägt.

Was die Prüfer ausdrücklich in Ordnung fanden (Auszug): ohne Schalter lädt keine Brain-Datei; CSP unverändert streng;
in 33 Ansichten kein eingeschleustes Markup; Worker kapselt den Kontext; importierte Regeln/Persona kommen als Entwurf;
keine Patienten/Notizen im Brain-Speicher, Kontext oder Export; Graph 60 Bilder/s mit 500 Knoten in beiden Engines,
0 Bilder in Ruhe; alle Texte außer Platzhaltern ≥ 4,5:1; Antworten ohne KI durchweg wörtlich belegt.

### Antwortqualität (Gabi ohne KI, Weg mit KI aus dem Code)

| Nr. | Stufe | Fund | Gegenprüfung | Stand |
|---|---|---|---|---|
| A1 | muss | Rat-Fragen: Absage nur bei wenigen Mustern – sonst Lücke oder Antwort aus dem Brain, bis zur Medikamentenempfehlung | bestätigt | ✅ `f214213` |
| A2 | sollte | Falsches „Das ist im Brain noch offen“: ein offener Punkt mit halber Deckung verdrängt vorhandenes Wissen | bestätigt | ✅ `f214213` |
| A3 | sollte | Preisfragen: der Osteopathie-Preis erscheint als Antwort auf den Preis anderer Leistungen | bestätigt | ✅ `f214213` |
| A4 | sollte | Komposita: Wortanfang zählt als Treffer – falsche Antworten, und der Eintrag mit dem wörtlichen Treffer fällt aus Antwort und Kontext | bestätigt | ✅ `f214213` |
| A5 | sollte | Praxisfragen mit „Termin“, „heute“, „Überblick“, Gruß am Anfang oder „Bericht“ gehen am Brain vorbei – der Katalog-Test prüft diesen Weg nicht | bestätigt | ✅ `f214213` |
| A6 | sollte | Zu Unrecht „Dazu steht noch nichts im Brain.“ bei Alltagsformulierungen – jede dieser Fragen landet zudem als falsche Wissenslücke | bestätigt | ✅ `f214213` |
| A7 | sollte | „Ändere die Öffnungszeiten …“ und „Übernehmen“: der Eintrag bleibt „zu klären“ – Gabi antwortet weiter „noch offen … nicht angegeben“ | bestätigt | ✅ `f214213`, `2b1b7d2` |
| A8 | sollte | „Ändere …“ trifft einen fremden Eintrag, wenn das Ziel nicht im Brain steht | bestätigt | ✅ `f214213` |
| A9 | sollte | Weg mit KI: Kontext nur aus der letzten Nachricht per Wortsuche – Folgefragen und Synonyme bekommen leeren oder unpassenden Kontext, das Budget bleibt ungenutzt | bestätigt | ✅ `f214213`, `2b1b7d2` (Folgefragen) |
| A10 | sollte | Fragen, in denen nur „Praxis“ als Inhaltswort bleibt, liefern Geschichte und Adressen statt der Antwort | bestätigt | ✅ `f214213` |
| A11 | sollte | Notiz-Fragen ohne Kürzel sowie Bedien- und Brain-Fragen werden als Praxisfrage behandelt | bestätigt | ✅ `f214213`, `2b1b7d2` |
| A12 | kann | Markerfilter: „Lücke: keine“ wird als Lücke „keine“ gemeldet; „Quellen: K1 (Titel), K2“ verliert K1; Listenform lässt K-Nummern stehen | bestätigt | später („kann“) |

### Datenschutz, Sicherheit, Prompt-Injektion

| Nr. | Stufe | Fund | Gegenprüfung | Stand |
|---|---|---|---|---|
| S1 | muss | Assistent ohne KI gibt Medikamentenempfehlung und Diagnose aus einem Brain-Eintrag wörtlich aus | bestätigt | ✅ `f214213` |
| S2 | sollte | Fragen mit Patienten-Kürzel werden als Wissenslücke gemerkt, solange die Brain-Ansicht nicht geöffnet war | bestätigt | ✅ `d61bbda` |
| S3 | sollte | Unsichtbare Unicode-Zeichen passieren die Bereinigung in Oberfläche und Worker (versteckter Text im brainKontext) | bestätigt | ✅ `d61bbda` |
| S4 | sollte | Bösartige Markdown-Datei friert den Import ein (Bereinigung mit quadratischer Laufzeit) | bestätigt | ✅ `d61bbda` |
| S5 | sollte | Kein Schutz vor Patientenbezug in Brain-Vorschlägen (Claude-Weg) und in Handeinträgen | bestätigt | ✅ `d61bbda` |
| S6 | kann | Brain-Titel gelangen ungekapselt in den Gesprächsverlauf für den Server | bestätigt | später („kann“) |
| S7 | kann | Marker-Filter wertet jede Antwortzeile mit „Lücke:“ oder „Quellen:“ als Marker – auch ein Zitat aus einem Eintrag | bestätigt | später („kann“) |
| S8 | kann | Notfall-Kopie einer ungespeicherten Bearbeitung bleibt nach dem Abmelden liegen | bestätigt | später („kann“) |
| S9 | kann | Drei Zahlenfelder aus der Ablage gehen ohne esc() in innerHTML | bestätigt | später („kann“) |
| S10 | kann | Brain-Ansicht lädt die ganze Notizliste mit Inhalten, obwohl der Graph nur Datum und Kürzel braucht | bestätigt | später („kann“) |
| S11 | kann | Ziel-Schutz der Browser-Tests nimmt den ersten Treffer „apiUrl:“ – auch aus einem Kommentar | bestätigt | später („kann“) |
| S12 | kann | Bestätigte Brain-Regeln wirken ab der siebten und über 400 Zeichen still nicht | bestätigt | später („kann“) |

### Datenmodell, Speicher, zwei Tabs

| Nr. | Stufe | Fund | Gegenprüfung | Stand |
|---|---|---|---|---|
| D1 | sollte | Eintrag im anderen Fenster gelöscht: die offene Bearbeitung lässt sich nicht speichern, nach Neuladen ist das Getippte still weg | bestätigt | ✅ `182e522` |
| D2 | sollte | Rückgängig in Tab A nimmt stillschweigend auch die spätere Änderung aus Tab B zurück | bestätigt | ✅ `6a27b34` |
| D3 | sollte | Export → Import bringt Verbindungen von Hand nicht zurück (und setzt „zuletzt geändert“ auf heute) | bestätigt | ✅ `6e4e931` |
| D4 | sollte | IndexedDB hängt oder ist kaputt: Gabi wechselt still auf ein zweites, frisch eingespieltes Brain in localStorage | bestätigt | ✅ `21ce1f0` |
| D5 | sollte | Speicher voll, nur lesen, neuere Fassung: die vorbereiteten Meldungen erreichen die Oberfläche nie – und bei vollem Speicher kann das Brain gar nicht mehr aufgehen | bestätigt | ✅ `332a5a3` |
| D6 | sollte | „Brain-Wissen löschen“ beim Abmelden in Tab A: Tab B zeigt ohne Erklärung ein leeres Brain – ein dort angelegter Eintrag verhindert den Seed für immer | bestätigt | ✅ `713433e`, `182e522` |
| D7 | kann | Import → Rückgängig → Wiederholen: Einträge, die der Import aus dem Papierkorb geholt hatte, bleiben im Papierkorb | bestätigt | später („kann“) |
| D8 | kann | Seed nachziehen: drei Randfälle (importierter Knoten wird überschrieben, neuer Seed-Knoten friert ein, Entfallenes bleibt bestätigt) | bestätigt | später („kann“) |
| D9 | kann | Zwei Tabs können denselben Titel anlegen – danach lässt sich keiner der beiden mehr ändern, bis einer umbenannt wird | bestätigt | später („kann“) |
| D10 | kann | Papierkorb-Dialog: Rückmeldungen verschwinden sofort wieder, und er zeigt nach „Papierkorb leeren“ im anderen Tab weiter die alten Einträge | bestätigt | später („kann“) |
| D11 | kann | Supabase-Entwurf: der serverseitige Abruf liefert einen anderen Kontext als der Browser | bestätigt | später („kann“) |
| D12 | kann | Seed: der Osteopathie-Preis steht in zwei Knoten – nach einer Preisänderung nennt Gabi je nach Frage den alten | bestätigt | später („kann“) |

### Graph und Leistung

| Nr. | Stufe | Fund | Gegenprüfung | Stand |
|---|---|---|---|---|
| G1 | sollte | Handy: Tipp auf einen Knoten – das Blatt deckt den ganzen Graphen zu, der Knoten wird aus der Fläche geschoben, nach dem Schließen bleibt der Graph verschoben | bestätigt | ✅ `274dfe0` |
| G2 | sollte | Doppeltipp/Doppelklick: der zweite Tipp trifft das gerade aufgehende Detail – am Handy ändert er den Status, öffnet „Löschen“ oder den Fokus; Zentrieren klappt dort nie | bestätigt | ✅ `274dfe0` |
| G3 | sollte | Handy: Wischen neben einem Knoten zieht und fixiert den Knoten, statt den Ausschnitt zu verschieben | bestätigt | ✅ `274dfe0` |
| G4 | sollte | Kamera springt bei jedem Neuzeichnen der Ansicht zurück (Auswahl außer Sicht → Flug zurück; Fokus-Modus → eigener Zoom weg) | bestätigt | ✅ `274dfe0` |
| G5 | sollte | „Alles zeigen“ rechnet Minimap und Legende nicht ein – in der Standardansicht liegen Knoten darunter | bestätigt | ✅ `274dfe0` |
| G6 | sollte | Nebenfund außerhalb meines Blickwinkels: Detail-Panel und Blatt laufen seitlich über – Text und „Zu klären“ sind rechts abgeschnitten | bestätigt | ✅ `fd2dc39` |
| G7 | sollte | Schloss für geschützte Knoten erst ab Zoom 0,95 – in der Standardansicht meist unsichtbar, obwohl die Legende es nennt | bestätigt | ✅ `274dfe0` |
| G8 | kann | zerstoeren() lässt den Auflösungs-Horcher hängen – jeder zerstörte Graph bleibt samt Zeichenflächen im Speicher | bestätigt | später („kann“) |
| G9 | kann | Drossel der Pixeldichte kann die Fläche leer zurücklassen – und misst die eigentliche Last nicht | bestätigt | später („kann“) |
| G10 | kann | Handy: Labels decken kleine Knoten zu; eine Zoomstufe weiter gibt es gar keine Labels | bestätigt | später („kann“) |
| G11 | kann | Nach einer Größenänderung des Fensters wird nicht neu eingepasst, obwohl die Kamera nie angefasst wurde | bestätigt | später („kann“) |
| G12 | kann | Gabi-Spur: Aufleuchten kann außerhalb des Ausschnitts liegen; der Sprung vom Chip zentriert auf die ganze Fläche statt auf den freien Bereich | bestätigt | später („kann“) |

### Handy und Barrierefreiheit

| Nr. | Stufe | Fund | Gegenprüfung | Stand |
|---|---|---|---|---|
| H1 | muss | Lange Titel in Chips sprengen die Breite: Gespräch scrollt am Handy seitlich, das Detail läuft über (Handy und Laptop) | bestätigt | ✅ `fd2dc39` |
| H2 | muss | Leiste aus Reitern, Suche und Werkzeugen: 640–692 px scrollt die Seite seitlich, bei 768 und 1024 px bleibt dem Suchfeld kein Platz für Text | bestätigt | ✅ `30d7dfb` |
| H3 | muss | Touch-Ziele unter 44 px bei Brain-Elementen im Gespräch und in der Fokus-Leiste | bestätigt | ✅ `dcf6fbf` |
| H4 | sollte | Handy: Das Blatt verdeckt den Graphen ganz, der angetippte Knoten fliegt aus dem Bild und bleibt nach dem Schließen draußen | bestätigt | ✅ `274dfe0` (mit G1) |
| H5 | sollte | Handy: Ein Wisch im Graphen greift in etwa der Hälfte der Fälle einen Knoten und setzt ihn fest, statt den Ausschnitt zu verschieben | bestätigt | ✅ `274dfe0` (mit G3: Wisch verschiebt, Halten greift) |
| H6 | sollte | Liste: Enter öffnet das Detail, der Fokus bleibt in der Liste (53 Tab-Schritte bis ins Detail); Schließen aus dem Detail wirft den Fokus auf body | bestätigt | ✅ `77b12bc` |
| H7 | sollte | Fokus fällt nach vielen Aktionen auf body, das Detail springt dabei an den Anfang zurück | bestätigt | ✅ `77b12bc` |
| H8 | sollte | Esc im Editor mit ungespeicherter Änderung wirkt nicht: die Rückfrage schließt sich nach 1–5 ms selbst | bestätigt | ✅ `77b12bc` |
| H9 | sollte | Platzhalter-Texte der Brain-Felder: Kontrast 2,62:1 (Hell) und 3,57:1 (Dunkel) | bestätigt | ✅ `da4810e` |
| H10 | sollte | Graph-Reiter ohne leere Zustände und ohne Trefferzahl: Suche ohne Treffer blendet nur alles ab, Filter ohne Einträge zeigt eine leere Fläche | bestätigt | ✅ `ec0bb9c` |
| H11 | sollte | Lade-Platzhalter nicht in Echt-Höhe: die Bühne springt um 134 px (Handy) bzw. 34 px (Laptop); Werkzeuge im Lade- und Fehlerzustand ohne Wirkung | bestätigt | ✅ `4e15a9d` |
| H12 | kann | Kleinere Punkte für Hilfstechnik und Verständlichkeit (Sammelpunkt) | bestätigt | später („kann“) |

### Antwortqualität – zweite Überarbeitung (`f214213`, `2b1b7d2`, `cae374e`)

Der Prüfer hat 262 Praxisfragen gestellt und gewertet: 93 richtig, 49 richtig mit Ballast, **60 zu Unrecht eine
Lücke**, 33 verfehlt, 20 zu Recht eine Lücke, 7 zu Unrecht beantwortet. Dazu das „muss“ (A1/S1): Rat-Fragen wurden nur
bei sechs Frageformen abgelehnt, und ein Eintrag mit Medikamentenempfehlung wurde wörtlich zitiert.

| Was | Vorher (`6dd9047`) | Jetzt |
|---|---|---|
| Bitte um medizinischen Rat (35 Formen, z. B. „Was tun bei Rückenschmerzen?“, „Hab ich einen Tumor?“) | 6 Muster abgelehnt, sonst Lücke oder Zitat | 35 von 35 abgelehnt; 31 ähnlich klingende Praxisfragen („Darf ich samstags trainieren?“) nicht |
| Eintrag mit Medikament/Dosis/Diagnose im Brain | wurde wörtlich zitiert | wird nie zitiert; der Rest des Brains antwortet weiter; träfe die Frage nur ihn: Absage |
| 60 zu Unrecht gemeldete Lücken (Wochentage, „In welchem …“, Gruß vor der Frage, „Rücken- und Schulterschmerzen“, „Wer sitzt im Büro?“ …) | Lücke – und als falsche Wissenslücke gemerkt | 57 Antworten, 3 passende offene Punkte |
| 7 zu Unrecht beantwortete Fragen („Habt ihr ein Bewegungsbad?“ → „Bewegung“) | Antwort am Thema vorbei | 6 Lücken; 1 bewusst belassen („Wie viele Therapeuten habt ihr?“ → das Team beim Namen) |
| Preis einer Leistung ohne Preis („Was kostet Atemtherapie?“) | der Preis der Osteopathie | der Eintrag zum Thema und „Noch offen im Brain: Was kosten die übrigen Leistungen …“ |
| „Termin“, „heute“, Gruß, „Bericht“ in einer Praxisfrage | Tagesüberblick bzw. Begrüßung, das Brain wurde nie gefragt | Antwort aus dem Brain; der eigene Tag („Welche Termine habe ich heute?“) bleibt der Überblick |
| „Ändere die Mittagspause: …“ (kein solcher Eintrag) | Vorschlag für irgendeinen Eintrag | Hinweis, kein Vorschlag; Kernregeln/Persona/Regeln im Gespräch nie |
| „Ändere die Öffnungszeiten: …“ + „Übernehmen“ | Eintrag blieb „zu klären“, Antwort weiter „nicht angegeben“ | Platzhalter ersetzt, mit „Übernehmen“ bestätigtes Praxiswissen |
| Folgefrage „Und Akupunktur?“ (Weg mit KI) | Kontext nur aus diesen zwei Wörtern | vorige Frage sucht mit, Quellen der vorigen Antwort gehen mit |
| „Was ist noch offen?“ | ein zufälliger Treffer zum Wort „offen“ | Liste der offenen Punkte |
| Quellen je Antwort (Ballast) | bis 3, oft unpassende dazu | im Schnitt 1,4; 156 von 233 Antworten mit genau einer Quelle |

Tests: Der Fragenkatalog läuft jetzt über den echten Weg (Demo-API statt `antwortAusKontext` direkt – das hatte der
Prüfer bemängelt). Die 262 Fragen stehen als festgeschriebener Stand in `worker/test/brain-fragenkatalog.json`.
**Gegenproben:** `f214213` gegen `6dd9047`: 61 Unit-Tests rot · `2b1b7d2` gegen den Stand davor: 3 neue Unit-Tests rot,
Browser-Checks `tests/brain-r1-antwort.mjs` gegen `6dd9047` 19 von 33 rot (am neuen Stand 66/66 in beiden Engines) ·
`cae374e` gegen den Stand davor: 11 rot. Eigene Nachprüfung der neuen Rat-Riegel fand neun Praxisfragen, die fälschlich
abgelehnt wurden – in `cae374e` behoben.

Grenze, die bleibt: Der Assistent ohne KI versteht keine Bedeutung, nur Wörter, Wortfelder und Regeln. Die Riegel gegen
medizinischen Rat sind Muster – sie decken die geprüften Formen ab, nicht jede denkbare. Im Weg mit Claude steht die
Kernregel im Systemprompt des Workers (dort unverändert); mit dem echten Modell ist das nicht erprobt (kein Schlüssel).

## Vorkommnisse

**Fehlalarm „Anfrage an den Live-Worker“ (10.11., ca. 15:50) – nachgeprüft, nichts passiert.**
Beim ersten Lauf der bisherigen Browser-Tests (`tests/v2.mjs`) gegen den Branch sah es in der Prozessliste so aus,
als sei das leere erste Argument verloren gegangen und der Lauf deshalb auf die Standard-Adresse `localhost:8788`
gegangen – das ist Julius' Vorschau, die mit dem **Live-Worker** spricht. Der Test probiert pro Demo-Ablauf einen
falschen Zugangscode aus; das wäre eine Verletzung der festen Grenze gewesen. Lauf sofort gestoppt, dann geprüft:

- Startbefehl laut Verlauf: `node tests/v2.mjs "" <bilder-ordner> http://localhost:8792` – die Adresse war gesetzt.
- Die 50 Screenshots des Laufs liegen im angegebenen Ordner → die Argumente wurden richtig zugeordnet
  (bei verschobenen Argumenten wäre ein Ordner `http:/localhost:8792` entstanden; es gibt keinen).
- Das Protokoll des **lokalen** Servers 8792 zeigt genau die vier absichtlichen Fehlversuche
  (`GET /api/pruefen -> 401`, je einer pro Demo-Ablauf) und sonst nur `/api/status`.

Ergebnis: **Keine Anfrage hat den Live-Worker oder Port 8788 erreicht.** Die Falle dahinter ist aber echt: Die
Standard-Adresse der bisherigen Tests (8788) ist derselbe Port wie die Vorschau gegen den Live-Worker. Deshalb neu:
`tests/ziel.mjs` – alle Browser-Tests (`v2`, `eingabefelder`, `brain`, `brain-leistung`) lesen vor dem Start die
ausgelieferte `/config.js` und brechen ab, wenn dort ein echter Worker steht oder kein Gabi-Server antwortet
(`2bed5ff`, 7 Unit-Tests, dazu Probelauf gegen eine Attrappe: alle vier Skripte enden mit Code 2, bevor ein Browser
startet). `GABI_LIVE=1` bleibt der bewusste Live-Lauf ohne Code-Tests. Regel für mich: Adresse immer ausdrücklich
angeben, nie auf die Standard-Adresse verlassen.

## Nicht getan (bewusst)

- Kein Push, kein Merge, kein Deploy, keine Migration ausgeführt, keine Secrets gesetzt.
- Keine Anfrage an den Live-Worker (auch nicht an `/api/status`). Port 8788 nie benutzt.
- `~/Desktop/automati-real-estate` nur gelesen (Brain-Ansicht dort: Bedienung und Designsprache als Ideen; kein Code
  übernommen – die Vorlage nutzt d3-force, hier ist das Layout eine eigene Umsetzung).

## Später / „kann“

- Eingebaute Zitate der Anthropic-API statt Markerzeilen (satzgenaue Quellen) – erst mit Schlüssel im Staging erproben.
- Nutzungs-Spur (`meta.audit`) bei zwei gleichzeitig schreibenden Tabs: der letzte gewinnt, einzelne Einträge der
  Spur können fehlen (nur Anzeige „wann wurde welche Fähigkeit genutzt“, kein Wissen betroffen).
- Supabase-Entwurf: Stapel (Seed/Import) und Verlauf laufen in Einzelschritten – für den echten Betrieb gehört der
  Stapel in eine Postgres-Funktion (eine Transaktion).
- Graph: Pfeilspitzen an den Kanten als Option; „Treffer hervorheben“ bewegt die Kamera bewusst nicht.
- Aus Fork E, nicht eingebaut (alle „kann“): Umbenennen zieht Verweise in Einträgen im Papierkorb nicht nach ·
  Export/Import ist bei „<“ direkt vor einem Buchstaben und bei einer Zeile `%%% gabi-brain %%%` im Inhalt nicht
  zeichengleich · ZIP ohne Prüfsummen-Kontrolle, verschlüsselte ZIPs ergeben Zeichensalat · eine von Hand gelöschte
  Seed-Verbindung kommt mit der nächsten Seed-Fassung wieder · „FFP2-Maske“ und „Typ-2“ gelten als Kürzel und werden
  nie eine Lücke · ein gescheitertes Rückgängig verwirft den Schritt.
- Antwort ohne KI: Fragen, deren Antwort nur sinngemäß im Brain steht („Nehmt ihr Privatpatienten?“ ↔ „Privatpraxis“),
  werden eine Lücke – das kann erst das echte Modell.

**Aus Prüfrunde 1 – alle 20 „kann“-Funde (gegengeprüft, bewusst nicht eingebaut):**
- *Worker, Marker-Filter (A12, S7):* „Lücke: keine“ wird als Lücke „keine“ gemerkt; „Quellen: K1 (Titel), K2“ verliert
  K1; die Listenform („- K1“) bleibt sichtbar; ein vom Modell zitierter Eintrag-Satz, der mit „Lücke:“ beginnt, gilt als
  Marker. Erst mit dem echten Modell im Staging ansehen, ob es so schreibt (Vorschläge der Prüfer liegen vor; „Marker nur
  am Ende“ widerspräche getestetem Verhalten).
- *Worker (S6):* Brain-Titel stehen ungekapselt im Gesprächsverlauf (nach Interview-Antwort, nach Vorschlagskarte) –
  entschärfen (Anführungszeichen und Klammern heraus, kürzen), nicht weglassen.
- *Abmelden (S8):* Die Notfall-Kopie einer ungespeicherten Bearbeitung bleibt nach dem Abmelden ohne Häkchen im Tab
  liegen, obwohl der Dialog „geht verloren“ sagt.
- *Härtung (S9):* Drei Zahlenfelder aus der Ablage gehen ohne `esc()` ins HTML (nur über eine von Hand veränderte
  Browser-Datenbank erreichbar, CSP sperrt Inline-Skripte).
- *Datensparsamkeit (S10):* Die Brain-Ansicht lädt die ganze Notizliste mit Inhalten, braucht aber nur Datum und
  Kürzel – braucht eine schlanke Liste vom Worker (Worker-Änderung, erst nach Freigabe).
- *Tests (S11):* `tests/ziel.mjs` wertet den ersten Treffer `apiUrl:` – auch aus einem Kommentar in `config.js`.
- *Regeln (S12):* Ab der siebten bestätigten Regel und über 400 Zeichen geht nichts mehr an Gabi – ohne Hinweis im
  Eintrag.
- *Modell (D7–D9):* Import → Rückgängig → Wiederholen lässt Einträge im Papierkorb, die der Import herausgeholt hatte ·
  Seed nachziehen: ein importierter Knoten mit Seed-Kennung wird überschrieben, zwei Tabs gleichzeitig frieren einen
  neuen Seed-Knoten ein, Entfallenes bleibt bestätigt · zwei Tabs können im selben Augenblick denselben Titel anlegen
  (danach lässt sich keiner ändern, bis einer umbenannt ist).
- *Papierkorb-Dialog (D10):* Rückmeldungen verschwinden sofort; nach „Papierkorb leeren“ im anderen Tab zeigt er
  weiter die alten Zeilen.
- *Supabase-Entwurf (D11):* Der serverseitige Abruf bildet keine Kanten aus `[[Verweisen]]` und kürzt Persona/Regeln
  anders als der Browser (Entwurf hinter zwei Schaltern, beide AUS).
- *Seed (D12):* Der Osteopathie-Preis steht in zwei Knoten (eigener Eintrag und Sammelpunkt) – nach einer
  Preisänderung in einem der beiden nennt Gabi je nach Frage den alten. Die Doppelung ist im Zerlegungsplan Absicht
  („jeder Punkt wörtlich“); der Umzug wäre eine bewusste Abkehr davon → Entscheidung für Julius/Philipp.
- *Graph (G8–G12):* `zerstoeren()` lässt einen Auflösungs-Horcher hängen (rund 12 MB je Abmelden, bis zum Neuladen) ·
  die Drossel der Pixeldichte kann im letzten Bild einer Bewegung die Fläche leer lassen · am Handy decken Labels
  kleine Knoten zu, eine Zoomstufe weiter gibt es keine Labels · nach einer Größenänderung des Fensters wird nicht neu
  eingepasst · das Aufleuchten der Gabi-Spur kann außerhalb des Ausschnitts liegen.
- *Hilfstechnik, Sammelpunkt (H12):* Bereiche hinter den Reitern ohne `role=tabpanel` · Menü „Mehr“ bleibt bei Tab
  offen · Optionen der Palette mit eigenem Tab-Stopp · `aria-controls` zeigt zugeklappt ins Leere · der Griff heißt
  im Editor auch vergrößert „Vergrößern“ · die Status-Radiogruppe speichert bei jedem Pfeiltastendruck · der Kopf zählt
  43 Einträge, die Liste 53 (mit Test-Patienten und Kernregeln) · im Filter stehen zwei Chips „Zu klären“ nebeneinander
  · in Chromium leert Esc in der Befehlspalette erst nur das Feld.
- *Antwort ohne KI, eigene Beobachtung:* „Was soll ich zum Training anziehen?“ bekommt die Absage – das alte Muster
  „was soll ich“ aus v2.1 greift vor dem Brain-Zweig (ohne Schalter soll sich nichts ändern, deshalb belassen).
