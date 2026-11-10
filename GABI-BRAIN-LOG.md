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
| 2 Modell `brain.js`, Suche `brain-suche.js`, Interview-Hilfen `brain-interview.js` | ✅ gebaut (`d39f887`), Unit-Tests dazu in Arbeit (Fork E, Dateien `worker/test/brain*.test.js` noch nicht committet) |
| 3 Speicher `brain-speicher.js` | ✅ `98fb09f` (112 Tests) |
| 4 Seed (Zerlegung, Generator, `brain-seed.js`) | ✅ `e4185de` (35 Tests) |
| 5 Graph `brain-graph.js` | ✅ `805c38d` (41 Tests) |
| 6 Worker (Kontext, Quellen/Lücken, Register, Staging, Supabase-Entwurf) | ✅ `072ecdf` (104 neue Tests, Probe-Build sauber) |
| 7 Ansicht `brain-ansicht.js`, `brain.css`, Einbau in `index.html`/`app.js` | ✅ gebaut (`d39f887`) |
| 8 Interview, Chat-Befehle, Fähigkeiten-Ansicht, Demo-Assistent (`brain-gespraech.js`, `demo.js`) | ✅ gebaut (`d39f887`) |
| 9 Doku (README, Roadmap, Vorlage) | ✅ README ergänzt; Roadmap und Vorlage `e4185de` |
| 10 Tests: `tests/brain.mjs` (Browser), `tests/brain-leistung.mjs`, Unit, Gegenprobe | ⏳ Unit: 618 grün (16:01). Browser-Tests liefen in Chromium und WebKit durch; voller Lauf mit Screenshots, Leistung und `tests/v2.mjs` (ohne Schalter, gegen 8792) stehen aus |
| 11 Prüfrunden (höchstens zwei), Korrekturen | ⏳ |
| 12 Screenshots, Abschlusslauf, Kurzbericht | ⏳ |

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
