# Gabi – Assistenz für Behandlungsnotizen (Testversion)

**Gabi v2** ist Diktat und persönlicher Assistent in einem – für die Physiotherapie-Praxis **PhysioWorks**.
Startbildschirm ist ein Gespräch mit Gabi: Behandlung diktieren (Mikrofon gedrückt halten oder tippen) → Gabi macht
daraus einen Entwurf (Befund · Maßnahmen · Verlauf · Hausaufgaben), gespeichert wird erst nach Bestätigung. Dazu:
Notizen durchsuchen und Fragen beantworten („Was wollte TP-01?“), Berichte als Text und PDF (Verlauf, Zusammenfassung),
Fragen zur Praxis (Leistungen, Standorte) aus `knowledge/physioworks.md`. Der Notizordner bleibt (Karten pro Patient,
Suche, Bearbeiten, Löschen, PDF).
**v2.1:** Gesprächsverlauf wie bei ChatGPT – mehrere Gespräche, Liste links (Laptop) bzw. Schublade über ☰ (Handy),
gruppiert nach Heute/Gestern/Letzte 7 Tage/Älter, eigene Adresse `#/gespraech/<id>`, Umbenennen, Löschen, höchstens 50.
**Gespräche liegen nur auf diesem Gerät** (IndexedDB, sonst localStorage) – nie im Worker oder in Supabase.
**v2.1.1:** die 16 kleinen Funde der Live-Prüfung behoben – u. a. zwei Tabs mit demselben Entwurf (keine doppelte
Notiz), Abmelden in fester Reihenfolge (nie eine Anfrage ohne Code), Fokus in Safari, ruhige Platzhalter – dazu 13
weitere aus der Gegenprüfung (v. a. Abmelden mit zwei offenen Tabs) und 1 aus der Nachprüfung (Korrektur am Entwurf
nach einem Netzfehler in zwei Tabs, siehe Log).
**v2.1.2:** Eingabefeld ohne Anschnitt – der Cursor am Zeilenanfang wurde an der runden Kante des Eingaberahmens
abgeschnitten (Chromium und Safari); jetzt 18 px Innenabstand im Textfeld selbst, Platzhalter bei 320 px einzeilig mit
„…“. Worker 2.0.1: Whisper bekommt die Physio-Fachbegriffe als Hinweis, die Strukturierung korrigiert Hörfehler nur bei
eindeutig passendem Fachbegriff (sonst „(unklar)“, jede Korrektur unter „Bitte prüfen“), und Gabi ergänzt nie Geschlecht,
Alter oder andere Merkmale, die nicht in der Notiz stehen.

**v2.2.0-brain (Prototyp, nur auf dem Branch `gabi-brain`, nicht live):** Gabi bekommt ein **Gedächtnis** – das
**Brain**, ein sichtbarer, bearbeitbarer Wissensgraph der Praxis (Bereich „Brain“, `#/brain`). Praxisfragen beantwortet
Gabi dann **nur aus dem Brain**, zeigt die Quellen als Chips, merkt sich Lücken und füllt sie im Interview („Brain
füllen“) – gespeichert wird immer erst nach Tipp auf „Übernehmen“. Das Brain steckt **hinter einem Schalter** (im Code
AUS): ohne ihn lädt die App keine einzige Brain-Datei und verhält sich wie v2.1.2. Alles dazu im Abschnitt
[Brain](#brain-prototyp-hinter-schalter), Protokoll: `GABI-BRAIN-LOG.md`, Verträge der Bausteine: `BRAIN-BAUPLAN.md`,
der Weg zum Assistenten: `ASSISTENT-ROADMAP.md`.

> **Testversion – nur Testdaten.** Keine Klarnamen, keine echten Patientendaten. Kürzel brauchen deshalb eine Ziffer (z. B. `TP-01`).
> Gabi stellt keine Diagnosen und gibt keine Therapieempfehlungen; sie antwortet nur aus gespeicherten Notizen und der Wissensdatei.

Adresse: **https://gabi.automatilabs.de** (Branch `main`, v2 seit 08.11.2026, v2.1.2 seit 10.11.2026) · Protokoll: `GABI-V2-LOG.md`.

> **Neue Version veröffentlichen:** in `index.html` die Kennung `?v=…` an `style.css` und allen eigenen Skripten (auch `gespraeche.js`) hochzählen
> und `VERSION` oben in `app.js` gleich setzen (ein Test prüft das) – GitHub Pages lässt Dateien 10 Minuten im Browser-Cache;
> passen Seite und Skript nicht zusammen, lädt die App einmal neu. Die Brain-Dateien stehen nicht in `index.html`: `app.js`
> lädt sie mit `?v=VERSION` nach (Liste `BRAIN_DATEIEN`).
> Pages liefert nur die App aus: Notizen, Worker, Tests und Screenshots stehen in `_config.yml` unter `exclude` –
> neue Dateien oder Ordner, die nicht zur App gehören, dort ergänzen.

## Aufbau

```
index.html, style.css           Oberfläche (mobile first, Hell/Dunkel/System in den Einstellungen, Deutsch) – GitHub Pages; Look im
                                PhysioWorks-Stil mit Glas, alle Farben als Tokens oben in style.css (Abschnitt 1)
darstellung.js                  Hell/Dunkel/System und Glas-Effekt vor dem ersten Bild (data-thema, data-glas, theme-color)
app.js                          Gespräch, Gesprächsverlauf, Karten (Entwurf, Bericht), Push-to-Talk, Notizordner, Start/Zugang/Demo
gespraeche.js                   Gesprächsverlauf: Ablage nur im Browser (IndexedDB → localStorage), Titel, Gruppen, Limit 50
kern.js                         reine Hilfen: sicherer Text (Markdown-Ersatz), NDJSON-Leser, Verlauf für den Server, Datum
aufnahme.js                     Aufnahme: MediaRecorder → WAV 16 kHz mono, Mikrofon-Hilfe je Gerät, Wake Lock
demo.js                         Demo-Modus: Fake-API, Demo-Assistent ohne KI, erfundene Testdaten (Quelle für seed_test.sql)
pdf.js                          PDF: Behandlungsnotiz und Bericht (Browser und Node)
config.js                       öffentliche API-Adresse (kein Geheimnis) und der Brain-Schalter (brain: false)
brain.js                        Brain-Modell: Knoten, [[Verweise]], Versionen, Papierkorb, Rückgängig, Prüfung, Markdown, Import/Export
brain-suche.js                  deutsche Normalisierung, Rangfolge, Filter, Kontext-Auswahl für Gabi, Demo-Antwort aus dem Kontext
brain-speicher.js               Ablage des Brains: IndexedDB → localStorage → Arbeitsspeicher; API-Ablage (Supabase-Entwurf); zwei Tabs, Notfall-Kopie
brain-seed.js                   erzeugt (node dev/brain_seed_erzeugen.mjs): Seed-Knoten, Kernregeln-Texte, Fähigkeiten-Register
brain-graph.js                  Wissensgraph: eigenes Kraft-Layout (Barnes-Hut, im Web Worker), Canvas, Bedienung, Minimap – ohne Bibliothek
brain-interview.js              Interview und Chat-Befehle: erkennen, Vorschläge ohne KI (Demo)
brain-ansicht.js, brain.css     Bereich „Brain“: Graph, Liste, Detail/Editor, Suche/Filter, Lücken, Fähigkeiten, Import/Export, Befehlspalette
brain-gespraech.js              Brücke zum Gespräch: Kontext je Frage, Quellen-Chips, Lücken, Vorschlagskarten, Interview-Ablauf
knowledge/brain_zerlegung.mjs   Plan: welcher Punkt der Wissensdatei wird welcher Knoten (jeder „TODO prüfen“-Punkt eine Frage)
knowledge/physioworks.md        Wissen über die Praxis (von physio-works.de, Unklares als „TODO prüfen“)
vendor/jspdf.umd.min.js         PDF-Erzeugung im Browser (jsPDF 4.2.1, MIT)
assets/                         Favicon, Apple-Touch-Icon, Schriften DM Sans + Red Hat Display 700 (OFL, lokal)
worker/                         Cloudflare Worker = einzige Stelle mit Schlüsseln
  src/app.js                    Routen, Zugangscode, CORS, Eingabeprüfung, NDJSON-Strom, Sicherheits-Header
  src/chat.js                   Assistent: Systemprompt, Werkzeuge, Gesprächsschleife mit Claude, Bericht
  src/wissen.js                 erzeugt aus knowledge/physioworks.md (node dev/wissen_erzeugen.mjs)
  src/begrenzer.js              Rate-Limit je IP, Sperre nach falschen Zugangscodes
  src/transkription.js          Spracherkennung: Workers AI, Whisper large v3 turbo (Deutsch)
  src/strukturierung.js         Diktat → Notiz mit Claude (strukturierte JSON-Ausgabe)
  src/notiz.js                  Physio-Prompt, Schema, Normalisierung, Kürzel-Regeln
  src/speicher.js               Supabase (PostgREST) + Arbeitsspeicher-Variante
  dev/lokal.mjs                 lokaler Modus ohne Konten (Demo-Assistent, wenn kein KI-Schlüssel da ist)
  dev/vorschau.mjs              Oberfläche lokal gegen den echten Worker (zum Testen eines Branches)
  dev/seed_erzeugen.mjs         schreibt supabase/seed_test.sql und supabase/reset_test.sql aus demo.js
  dev/brain_seed_erzeugen.mjs   schreibt brain-seed.js aus knowledge/physioworks.md, kernregeln.js, faehigkeiten.js, Roadmap
  src/kernregeln.js             Kernregeln von Gabi (eine Quelle; über das Brain nicht änderbar)
  src/brain.js                  brainKontext prüfen/bereinigen, Prompt-Bausteine im Brain-Modus, Filter für Quellen und Lücken, Vorschläge
  src/brain_vorschlag.js        Brain-Interview: Vorschlag aus einer Antwort (Claude, JSON-Schema)
  src/faehigkeiten.js           Fähigkeiten-Register (Stufen, Status, Voraussetzungen, Roadmap-Phase)
  src/brain_abruf.js            Entwurf: Brain in Supabase (Routen /api/brain…, serverseitiger Abruf) – Schalter, Standard AUS
  wrangler.brain.toml           Staging-Worker gabi-api-brain (nicht deployen ohne Freigabe)
  test/*.test.js                Unit-Tests (Vitest)
supabase/schema.sql             Tabellen patients_test + notes, RLS an (v2 braucht keine neue Tabelle)
supabase/seed_test.sql          NUR TESTDATEN: 3 erfundene Test-Patienten mit je 2 Notizen
supabase/reset_test.sql         ⚠️ löscht ALLE Notizen und Test-Patienten, dann Stand von seed_test.sql (nur von Hand, nach OK)
supabase/migrations/brain.sql   ⚠️ NICHT ausführen ohne Freigabe: Tabellen fürs gemeinsame Brain, RLS, Rollen-Vorlage
tests/v2.mjs                    Ende-zu-Ende-Tests (Playwright): Handy/Laptop × Hell/Dunkel, Robustheit, echte lokale API, Safari
tests/eingabefelder.mjs         Eingabefelder ohne Anschnitt (Cursor, Text, Platzhalter per Bildvergleich) – Block 5 von v2.mjs
tests/design.mjs                Design v2.3/v2.4: Kontrast aller Textstellen (Pixel, auch auf Glas), Schriften, CSP/Fremd-Requests,
                                Breite 320–1440, Glas-Unschärfe, deckend bei Bewegung/Transparenz reduzieren/Glas aus, Grund
                                ohne Kante, Einstellungen, Brain-Ansichten (Teil H), Screenshots
tests/einstellungen.mjs         v2.4 Einstellungen: öffnen, Hell/Dunkel/System sofort + gespeichert, kein Aufblitzen, Glas an/aus,
                                Abmelden/Löschen, Tastatur/Fokus, Handy-Schublade, 320–1440 px
tests/design-leistung.mjs       Scrollen mit Glas: 50 Nachrichten, Frame-Zeiten in Chromium (Ziel: kein Frame > 33 ms)
screenshots/                    Screenshots aus tests/v2.mjs, screenshots/design/ aus tests/design.mjs, screenshots/brain/ aus tests/brain.mjs
tests/brain.mjs                 Brain Ende-zu-Ende (Playwright): Graph, Liste, Editor, Gespräch, Interview, zwei Tabs, lokale API
tests/brain-leistung.mjs        Brain-Messung: 100/300/500 Knoten – Bildrate, Layout-Zeit, Speicher
tests/brain-labels-zoom.mjs     Brain: Labels beim schnellen Zoomen (kein Springen, keine Überlappung)
tests/brain-physik.mjs          Brain: Physik beim Ziehen (Nachbarn folgen, Nachschwingen, Ruhe)
tests/brain-thema.mjs           v2.4 Brain im Theme-Wechsel: Canvas-Farben live, Label-Kontrast ≥ 4,5:1 in Hell und Dunkel
ASSISTENT-ROADMAP.md            Weg vom Aufnahme-Tool zum Assistenten in 8 Phasen
FAEHIGKEIT-VORLAGE.md           Checkliste und Code-Skelett für jede neue Fähigkeit
BRAIN-BAUPLAN.md                Verträge zwischen den Brain-Bausteinen (Datenformen, Schnittstellen, Protokoll)
GABI-BRAIN-LOG.md               Protokoll des Brain-Auftrags: Entscheidungen, Messwerte, Prüfrunden
```

**Datenfluss Gespräch:** Browser → `POST /api/chat` (Verlauf als Text, Zugangscode) → Worker → Claude mit Werkzeugen
(liest Notizen aus Supabase, Praxiswissen steht im Prompt) → Antwort als NDJSON-Strom (Text, Status, Quellen, Entwurf,
Bericht). **Diktat:** Aufnahme → WAV → `/api/transkribieren` (Whisper bei Cloudflare) → `/api/chat` mit
`aktion: diktat` → Strukturierung → Entwurfskarte → Speichern über `POST /api/notizen`. Der Browser kennt keinen
Schlüssel. **Gespräche** liegen nur im Browser dieses Geräts (IndexedDB „gabi“, Demo getrennt in „gabi-demo“; ohne
IndexedDB localStorage): der Worker bekommt pro Frage nur den Verlauf zum Antworten und speichert nichts davon. In der
Adresse steht nur die Gesprächs-ID, im Seitentitel nichts vom Inhalt (der Titel landet sonst im Browserverlauf und in dessen
Synchronisierung). Die Aufnahme wird nirgends gespeichert (bis zum Senden nur im Arbeitsspeicher des Tabs).

## Brain (Prototyp, hinter Schalter)

Das Brain ist Gabis Gedächtnis: ein Wissensgraph im Obsidian-Stil. **Knoten** sind Praxiswissen, offene Fragen
(„zu klären“), Regeln, die Persona und Vorlagen; `[[Verweise]]` im Text werden zu Kanten. Test-Patienten, Notizen und
Berichte erscheinen als **schreibgeschützte** Knoten – im Graph nur „Datum · Kürzel“, der Inhalt einer Notiz wird erst
im Detail nach Klick geladen, geändert wird nur im Notizordner. Die **Kernregeln** stehen fest im Worker-Code
(`worker/src/kernregeln.js`) und werden im Brain nur angezeigt.

**Einschalten:** im Code ist der Schalter AUS (`config.js`: `brain: false`). AN mit `?brain=1` an der Adresse oder
lokal mit `npm run brain`. Ohne Schalter lädt die App keine Brain-Datei (ein Test prüft das).

```bash
cd worker && npm run brain     # http://localhost:8790 · Zugangscode: test · Demo mit Brain: http://localhost:8790/?demo=1
```

**Was es kann:**
- **Graph** (eigene Umsetzung, keine Bibliothek): Kraft-Layout im Web Worker, Zoomen (Rad, Pinch), Verschieben, Knoten
  ziehen und fixieren (die Nachbarn federn mit und schwingen aus wie in Obsidian, dann schläft die Physik ein; im Menü
  „Mehr“ abschaltbar, bei „Bewegung reduzieren“ aus), Klick öffnet das Detail, Doppelklick zentriert, Fokus-Modus (Nachbarn bis Tiefe 1–3), Minimap,
  Legende (= Filter nach Art). Tastatur: Pfeile springen zum Nachbarn, `/` Suche, ⌘/Strg+K Befehlspalette, Esc schließt.
  Die Lage der Knoten wird lokal gemerkt – beim Wiederöffnen liegt der Graph ruhig.
- **Liste** als gleichwertige Alternative (gruppiert, sortierbar) – auch für Handy und Hilfstechnik.
- **Detail** (Laptop: Spalte rechts, Handy: Blatt von unten): Status-Schalter, Markdown-Vorschau und Editor,
  `[[`-Vorschläge, Rückverweise, Tags, Quelle, Nutzung durch Gabi, Versionsverlauf (letzte 20) mit Wiederherstellen,
  Papierkorb (30 Tage), Rückgängig/Wiederholen.
- **Gesundheit** im Kopf (Anteil bestätigt, zu klären, veraltet > 90 Tage, nie verwendet, Lücken), **Wissenslücken**
  (Fragen, die Gabi nicht beantworten konnte → per Tipp ein Entwurfsknoten), **Fähigkeiten** (Register mit Stufe,
  „Was darf Gabi damit?“, Roadmap-Phase, lokale Nutzungs-Spur ohne Inhalte).
- **Import/Export:** Markdown mit Frontmatter und `[[Verweisen]]` als ZIP (ohne Bibliothek) oder eine Datei; Import mit
  Bereinigung (kein HTML/Skript), Grenzen und Vorschau (Vorher/Nachher). Importierte Regeln und Persona kommen immer
  als Entwurf an.
- **Im Gespräch:** für jede freie Frage sucht die Oberfläche die besten Knoten (höchstens 8, rund 6 000 Zeichen, nie
  Patienten oder Notizen) und schickt sie als `brainKontext` mit. Gabi antwortet auf Praxisfragen nur daraus, nennt die
  Quellen (Chips unter der Antwort, Klick springt in den Graphen) und meldet Lücken („Dazu steht noch nichts im
  Brain.“). **Chip „Brain füllen“**: Gabi stellt die offenen Fragen nacheinander, macht aus der Antwort einen Vorschlag
  (Vorher/Nachher) und speichert erst nach „Übernehmen“. Befehle: „Merke dir: …“, „Ändere …“ (bei einem offenen Punkt
  gilt er mit „Übernehmen“ als geklärt), „Was weißt du über …?“, „Wie vollständig ist mein Brain?“, „Was ist noch
  offen?“. Eine kurze Folgefrage („Und Akupunktur?“) nimmt die vorige Frage und deren Quellen mit.
- **Ohne KI (Demo-Modus und `npm run brain`)** antwortet ein Assistent, der nur wörtlich aus den gefundenen Einträgen
  zitiert (`brain-suche.js`). Grundsatz: lieber eine Lücke als eine Antwort am Thema vorbei – die Regeln stehen im
  `BRAIN-BAUPLAN.md` §4 und §5.4. Er gleicht Tippfehler aus („Öfnungszeiten“), kennt Wortfelder („anrufen“ ↔ „Telefon“),
  Wochentags-Spannen („Mo–Do“), trennt Thema und Eigenschaft („Was kostet Atemtherapie?“ bekommt nicht den Preis der
  Osteopathie) und hängt den passenden offenen Punkt an. **Kernregel vor Brain:** Bitten um medizinischen Rat lehnt er
  ab, und Einträge, die selbst einen Rat enthalten (Medikament, Dosis, Diagnose), zitiert er nie – auch wenn so etwas
  über „Merke dir“ oder einen Import ins Brain geraten ist. Festgeschrieben in `worker/test/brain-fragen.test.js`
  (rund 90 Fragen über den echten Weg) und im Katalog der Prüfrunde mit 262 Fragen
  (`worker/test/brain-fragenkatalog.json`; nach einer gewollten Änderung der Antwortlogik neu festschreiben mit
  `GABI_KATALOG_SCHREIBEN=1 npx vitest run test/brain-fragen.test.js` und den Unterschied durchsehen).

**Wo liegt das Brain?** Nur auf diesem Gerät: IndexedDB `gabi-brain` (Demo getrennt: `gabi-brain-demo`), sonst
localStorage, zur Not nur im Tab (mit Hinweis). Zwei offene Tabs überschreiben sich nicht (jede Änderung prüft den
Stand; bei Konflikt fragt die Bearbeitung nach, die andere Fassung bleibt im Verlauf). Eine ungespeicherte Bearbeitung
übersteht ein Neuladen (Notfall-Kopie im Tab). In der Adresse steht nur der Reiter (`#/brain/liste`) oder die ID
(`#/brain/<id>`), nie Inhalt. Abmelden fragt eigens
„Brain-Wissen auf diesem Gerät auch löschen“ – **nicht vorbelegt**.

**Wissensdatei und Seed:** `knowledge/physioworks.md` bleibt die Quelle des Seeds (und der Rückfall, wenn das Brain aus
ist). Beim ersten Start wird sie in 41 Knoten zerlegt eingespielt; jeder „TODO prüfen“-Punkt ist eine offene Frage.
Nach Änderungen an der Wissensdatei: `cd worker && node dev/wissen_erzeugen.mjs && node dev/brain_seed_erzeugen.mjs`.
Unberührte Seed-Knoten werden dann aktualisiert, Bearbeitetes bleibt.

## Echten Claude-Weg testen (Staging) – ⚠️ nur nach Freigabe von Julius

Der Brain-Weg mit Claude ist gegen eine nachgebaute Anthropic-API getestet, aber noch nie mit dem echten Modell
gelaufen. Dafür gibt es einen **eigenen Staging-Worker** – der Live-Worker `gabi-api` wird nicht angefasst:

| | Live (`wrangler.toml`) | Staging (`wrangler.brain.toml`) |
|---|---|---|
| Name / Adresse | `gabi-api` | `gabi-api-brain` (eigene Adresse) |
| Erlaubte Herkunft | gabi.automatilabs.de, localhost:8788 | **nur** localhost:8790 |
| Zugangscode, KI-Schlüssel | Live-Secrets | **eigene** Secrets (neuer Code!) |
| Datenbank | Supabase | **keine** – drei Test-Patienten im Arbeitsspeicher |
| Brain | – | liegt weiter nur im Browser; je Frage gehen höchstens 8 Einträge mit |

**Schritt für Schritt** (jede Zeile einzeln im Terminal, im Ordner `worker`):

1. Staging-Worker anlegen – am Ende zeigt Wrangler die Adresse `https://gabi-api-brain.<konto>.workers.dev`:
   ```bash
   cd worker && npx wrangler deploy -c wrangler.brain.toml
   ```
2. KI-Schlüssel hinterlegen (Wrangler fragt nach dem Wert – nie in eine Datei schreiben):
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY -c wrangler.brain.toml
   ```
3. Einen **neuen** Zugangscode nur fürs Staging setzen (nicht den Live-Code):
   ```bash
   npx wrangler secret put GABI_ZUGANGSCODE -c wrangler.brain.toml
   ```
4. Im Browser prüfen: `https://gabi-api-brain.<konto>.workers.dev/api/status` zeigt `"version": "2.1.0-brain"`,
   `"bereit": true` und unter `funktionen` auch `"brain"`.
5. Oberfläche dieses Branches gegen den Staging-Worker starten (Adresse aus Schritt 1 einsetzen):
   ```bash
   GABI_API=https://gabi-api-brain.<konto>.workers.dev npm run brain:staging
   ```
   Dann **http://localhost:8790** öffnen und den Staging-Code eingeben. Das Skript liefert nur Dateien aus, trägt die
   Staging-Adresse in die ausgelieferte `config.js` ein und erlaubt genau diese Herkunft in der ausgelieferten
   `index.html` – die Dateien im Repo bleiben unverändert. Ohne `GABI_API` oder mit der Live-Adresse startet es nicht.

**Was testen:**
- eine Praxisfrage, die im Brain steht („Wo ist die Praxis Kieslingstraße?“) → Antwort mit Quellen-Chips
- eine, die nicht im Brain steht („Habt ihr WLAN für Patienten?“) → genau „Dazu steht noch nichts im Brain.“ und ein
  Eintrag unter „Lücken“
- einen Entwurf („Macht ihr Hausbesuche?“ in der Demo) und einen Zu-klären-Punkt („Wo kann ich parken?“) → „laut Entwurf,
  noch nicht bestätigt“ bzw. „das ist im Brain noch offen“
- eine medizinische Rat-Frage („Welche Übungen helfen bei …?“) → Absage, keine Lücke
- „Merke dir: …“ und „Ändere …“ → Vorschlagskarte, gespeichert wird erst mit „Übernehmen“
- „Brain füllen“ → Gabi formuliert aus deiner Antwort den Eintrag
- ein Diktat und eine Frage zu einer Notiz → wie bisher (die drei Test-Patienten sind leer und verschwinden, wenn
  Cloudflare die Worker-Instanz neu startet – das ist im Staging gewollt)
- Fehler mitlesen: `npx wrangler tail -c wrangler.brain.toml` (nur Status, Fehlerart, Request-ID – nie Inhalte)

**Aufräumen** (Staging-Worker samt Secrets wieder löschen): `npx wrangler delete -c wrangler.brain.toml`

## Brain in Supabase (Entwurf) – ⚠️ Migration nur nach Freigabe von Julius

Heute liegt das Brain nur im Browser des Geräts. `supabase/migrations/brain.sql` bereitet das **gemeinsame** Brain vor
(Tabellen `brain_nodes`, `brain_edges`, `brain_versions`, `brain_gaps`, `brain_meta`, eine Zähl-Funktion, RLS an). Die
Datei wurde **nicht ausgeführt** – auch nicht zur Probe. Der Worker nutzt die Tabellen nur mit den Schaltern unten;
beide stehen auf AUS.

**Vorher nötig:** Benutzerkonten und Rollen (Admin = Philipp). Mit dem einen gemeinsamen Zugangscode könnte jede Person
mit dem Code das gemeinsame Brain ändern. Die Vorlage für die Rollen steht auskommentiert am Ende der SQL-Datei.

**Migration in 4 Klicks** (erst nach Freigabe; legt nur neue Tabellen an, `patients_test` und `notes` bleiben wie sie sind):
1. **supabase.com** → Projekt **gabi** öffnen.
2. Links **SQL Editor** → **New query**.
3. Inhalt von `supabase/migrations/brain.sql` einfügen (🤖 Claude: „Kopier mir brain.sql.“).
4. **Run**.

✅ Fertig, wenn unter *Table Editor* die fünf Tabellen `brain_…` stehen (alle leer, bei jeder „RLS enabled“).
Rückweg: die drei Zeilen unter „RÜCKWEG“ am Ende der SQL-Datei (löscht das gemeinsame Brain wieder).

**Danach einschalten** (zwei getrennte Schalter in `wrangler.toml` unter `[vars]`, dann neu deployen):

| Schalter | Wirkung |
|---|---|
| `BRAIN_SPEICHER = "supabase"` | Der Worker bietet die Routen `/api/brain…` an (laden, Knoten schreiben mit Stand-Prüfung, Verlauf, Kanten, Lücken, Nutzung, Einstellungen, Stapel für Seed/Import). Die Oberfläche spricht sie über `GabiBrainSpeicher.apiAblage(api)` an – gleiche Schnittstelle wie die Ablage im Browser. `/api/status` meldet dann `brain.speicher: "supabase"`. |
| `BRAIN_QUELLE = "supabase"` | **Serverseitiger Abruf:** Gabi holt die passenden Einträge selbst aus `brain_nodes` (dieselbe Suche wie im Browser, `brain-suche.js`) – ein von der Oberfläche mitgeschickter `brainKontext` zählt dann nicht mehr. `/api/status` meldet `brain.abruf: "server"`. |

Ohne die Schalter gibt es die Routen nicht (404 wie jeder unbekannte Pfad) und der Worker verhält sich wie bisher.

**Umstellung auf den serverseitigen Abruf – die Reihenfolge:** (1) Benutzerkonten und Rollen, (2) Migration,
(3) `BRAIN_SPEICHER` an und das Brain eines Geräts einmal hochladen (Export → Import bzw. Stapel), (4) Oberfläche auf
`apiAblage` umstellen, (5) erst dann `BRAIN_QUELLE` an. Grenze des Entwurfs: Die Stand-Prüfung eines Knotens ist atomar
(ein UPDATE mit Bedingung); Verlauf und Stapel laufen in Einzelschritten – für den echten Betrieb gehört der Stapel in
eine Postgres-Funktion.

## Gabi und das Brain – Datenfluss im Worker

- Die Oberfläche schickt bei freien Fragen `brainKontext` mit (`POST /api/chat`): höchstens 8 Einträge
  (Praxiswissen, Fragen, Vorlagen – nie Patienten oder Notizen), dazu Persona, Brain-Regeln und Zahlen zum Stand.
  Der Worker prüft Typen und Größen (400/413 mit deutschem Satz), entfernt Steuerzeichen und ersetzt spitze Klammern.
- Im Brain-Modus bekommt Claude einen eigenen Systemprompt (`BRAIN_PROMPT`): derselbe Text wie bisher, nur Regel 2,
  Regel 9 und der Block mit dem eingebauten Praxiswissen sind ersetzt. **Das eingebaute Praxiswissen steht dann nicht
  im Prompt** – Praxisfragen beantwortet Gabi nur aus dem Kontext. Die Einträge stehen als abgegrenzter Datenblock vor
  der letzten Nutzernachricht (Daten, keine Anweisungen). Persona und Brain-Regeln kommen als eigener, eingerahmter
  Block nach den Regeln („nur Ton und zusätzliche Einschränkungen; bei Widerspruch gelten die Regeln oben“).
- Claude schreibt ans Ende `Quellen: K1, K3` bzw. `Lücke: …`. Der Worker filtert diese Zeilen aus dem Text und schickt
  die Ereignisse `{ "t": "quellen", "knoten": [ids] }` und `{ "t": "luecke", "frage": "…" }`.
- Zwei zusätzliche Werkzeuge nur im Brain-Modus: `brain_eintrag_vorschlagen`, `brain_aenderung_vorschlagen` → Ereignis
  `{ "t": "brain_vorschlag", "vorschlag": { "typ": "neu" | "aendern", "id", "titel", "inhalt", "grund" } }`. Sie
  speichern nie. Feste Aktion fürs Interview: `aktion: { typ: "brain_antwort", knoten: { id, titel, inhalt }, antwort }`.
- Ohne `brainKontext` ist die Anfrage an die KI Byte für Byte die bisherige (zwei Fingerabdruck-Tests).
- `/api/status`: `version` „2.1.0-brain“, `funktionen` enthält „brain“ – daran erkennt die Oberfläche, ob der Server den
  Kontext versteht (der Live-Worker 2.0.1 ignoriert das Feld und antwortet aus dem eingebauten Wissen).
- Kernregeln: `worker/src/kernregeln.js` (eine Quelle, ein Test prüft, dass jede in beiden Prompts steht).
  Fähigkeiten-Register: `worker/src/faehigkeiten.js` (jedes Werkzeug registriert; ein Test führt jedes mit einem
  Spion-Speicher aus – keines speichert, ändert oder löscht).

## Demo-Modus (ohne Backend, ohne Secrets)

`?demo=1` an die Adresse hängen, z. B. `http://localhost:8788/?demo=1`. Die App startet auch automatisch im Demo-Modus,
wenn der Worker nicht erreichbar oder noch nicht eingerichtet ist (Hinweis per Toast, Badge „Demo“). Ausnahme: Ein Gerät
mit gespeichertem Zugangscode bekommt bei Serverproblemen die Seite „Server nicht erreichbar“. Im Demo-Modus geht keine
einzige Anfrage an einen Server: kompletter Assistent mit Fake-Antworten (Fragen zu Notizen, Bericht, Heute, Praxis),
3 erfundene Test-Patienten mit je 2 Notizen, die Aufnahme nutzt das echte Mikrofon und liefert Beispieldiktate;
„Beispieldiktat nehmen“ geht ganz ohne Mikrofon. „Beispieldaten zurücksetzen“ über das Demo-Badge.
Mit Brain (`?demo=1&brain=1` oder `npm run brain` → `/?demo=1`): das komplette Brain mit Beispieldaten – Praxiswissen
aus der Wissensdatei, 3 Test-Patienten mit Notizen, 7 Zu-klären-Punkte, Beispiel-Lücken, Nutzungszähler – und ein
Demo-Assistent, der Praxisfragen nur aus dem Brain beantwortet (wörtlich aus den Knoten, ohne KI).

## Lokal ausprobieren

```bash
cd worker && npm install
npm run lokal          # http://localhost:8788 · Zugangscode: test · Demo: http://localhost:8788/?demo=1
```

Ohne weitere Einstellungen liefert die Spracherkennung einen Demo-Text, Notizen werden ohne KI grob zugeordnet und das
Gespräch läuft über den Demo-Assistenten – aber mit dem echten Worker-Code (Routen, Werkzeuge, NDJSON-Strom).
Optional: `ANTHROPIC_API_KEY=… npm run lokal` (echte Strukturierung und echtes Gespräch mit Claude) und
`GABI_WHISPER_CMD="python3 dev/whisper_lokal.py"` (echte Spracherkennung lokal, braucht `mlx-whisper` auf Apple Silicon).

**Gegen den echten Worker testen** (einen Branch vor dem Merge prüfen, echter Zugangscode; Live-Fehler der KI sieht man
parallel mit `npx wrangler tail` – dort stehen nur Status, Fehlerart und Request-ID, nie Inhalte):
```bash
cd worker && npm run vorschau   # http://localhost:8788 – Oberfläche dieses Branches, API = Live-Worker
```

## Testdaten zurücksetzen (4 Klicks)

`supabase/reset_test.sql` löscht **alle** Notizen und Test-Patienten und legt danach die 3 Seed-Patienten mit ihren
Beispielnotizen neu an (Stand wie `seed_test.sql`). **Nur für die Testumgebung – vorher Julius fragen.** Nie automatisch.
1. **supabase.com** → Projekt **gabi** öffnen.
2. Links **SQL Editor** → **New query**.
3. Inhalt von `supabase/reset_test.sql` einfügen (🤖 Claude: „Kopier mir reset_test.sql.“).
4. **Run** – Supabase warnt vor „destructive operation“ → **Run this query** bestätigen.

✅ Fertig, wenn unter *Table Editor → patients_test* genau TP-01, TP-02, TP-03 stehen (je 2 Notizen in *notes*).
Alles läuft in einer Transaktion: Schlägt ein Schritt fehl, bleibt der alte Stand. Gespräche bleiben (sie liegen nur
in den Browsern). Die Test-Patienten haben feste IDs (wie in `demo.js`): Offene Entwürfe zu TP-01–TP-03 lassen sich
danach weiter speichern. Das gilt nicht beim ersten Zurücksetzen nach v2.1, weil die Patienten vorher zufällige IDs
hatten. Links auf gelöschte Notizen zeigen „Notiz nicht gefunden“.

## Tests

```bash
cd worker && npm test                      # Unit-Tests: API, Härtung, Assistent (Werkzeuge, Strom, Ersatzmodell), Kern, Demo, PDF, Seed
npx wrangler deploy --dry-run              # Worker baut (ohne Deploy)
node dev/seed_erzeugen.mjs                 # seed_test.sql neu schreiben, wenn demo.js geändert wurde
node dev/wissen_erzeugen.mjs               # src/wissen.js neu schreiben, wenn knowledge/physioworks.md geändert wurde
# Ende-zu-Ende (npm run lokal muss laufen; Playwright mit Chromium + WebKit):
PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/v2.mjs [diktat.wav] [screenshots/]
# nur die Eingabefelder (Chromium + WebKit, 320/390/1440, Hell/Dunkel; einzeln: GABI_MOTOREN=chromium GABI_BREITEN=320):
PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/eingabefelder.mjs [screenshots/eingabefelder] [http://localhost:8788]
# Design (Chromium + WebKit, Hell/Dunkel; ~30 min; eingrenzen mit GABI_MOTOREN, GABI_SCHEMEN, GABI_BREITEN, GABI_TEILE=A,D,E,F,G,H;
# Teil H braucht zusätzlich den Brain-Server: GABI_BRAIN_BASIS=http://localhost:8790):
PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/design.mjs [screenshots/design] [http://localhost:8788]
# Einstellungen (gegen beide Server: ohne und mit Brain-Schalter):
PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/einstellungen.mjs [http://localhost:8788]
PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/design-leistung.mjs [http://localhost:8788] [ergebnis.json]
# Brain (npm run brain muss laufen, Port 8790; Chromium + WebKit, Handy/Laptop, Hell/Dunkel, reduzierte Bewegung):
PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/brain.mjs [screenshots/brain] [http://localhost:8790]
PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/brain-leistung.mjs [http://localhost:8790]   # 100/300/500 Knoten
PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/brain-thema.mjs [http://localhost:8790]      # Theme-Wechsel + Label-Kontrast
# Nachprüfungen zu Prüfrunde 1 – je Gebiet eine Datei, jeder Check gehört zu einem behobenen Fund:
for t in tests/brain-r1-*.mjs; do PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node "$t" http://localhost:8790 || break; done
node dev/brain_seed_erzeugen.mjs           # brain-seed.js neu schreiben (Wissensdatei, Kernregeln, Register, Roadmap geändert)
npx wrangler deploy --dry-run -c wrangler.brain.toml   # Staging-Worker baut (ohne Deploy)
```
Die bisherigen Ende-zu-Ende-Tests (`tests/v2.mjs`) laufen gegen einen Server **ohne** Brain-Schalter (`npm run lokal`).

**Schutz vor dem falschen Ziel (`tests/ziel.mjs`):** Die Browser-Tests probieren Zugangscodes aus. Vor dem Start lesen
sie deshalb die ausgelieferte `/config.js` und brechen ab, wenn die Oberfläche unter der Adresse mit einem echten Worker
spricht – also bei der Live-Seite und bei `npm run vorschau` (gleicher Standard-Port 8788 wie `npm run lokal`). Der
bewusste Live-Lauf bleibt `GABI_LIVE=1` (ohne Code-Tests).

## Einrichtung (einmalig)

### 1 Supabase (Datenbank, Region EU/Frankfurt)
1. Neues Projekt anlegen, Region **Central EU (Frankfurt)** – `eu-central-1`.
2. *SQL Editor* → Inhalt von `supabase/schema.sql` einfügen → *Run*. Danach genauso `supabase/seed_test.sql` (Beispieldaten).
3. Unter *Project Settings → API Keys* den **Secret key** (`sb_secret_…`) und unter *Data API* die **Project URL** notieren.
   (Ein alter `service_role`-Schlüssel funktioniert auch.)

### 2 Cloudflare Worker (API)
```bash
cd worker
npx wrangler login
npx wrangler deploy                               # zeigt die Adresse https://gabi-api.<konto>.workers.dev
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put GABI_ZUGANGSCODE         # langer Code, z. B. vier zufällige Wörter
```
Statt im Terminal gehen die Secrets auch im Cloudflare-Dashboard: *Workers & Pages → gabi-api → Settings →
Variables and Secrets → Add → Type „Secret“* (Schritt-für-Schritt in `MORGEN.md`).
Prüfen: `https://gabi-api.<konto>.workers.dev/api/status` zeigt `"bereit": true` und bei `eingerichtet` überall `true`.

### 3 Oberfläche (GitHub Pages)
1. In `config.js` die Worker-Adresse bei `apiUrl` eintragen, committen.
2. Repository auf GitHub, *Settings → Pages*: Branch `main`, Ordner `/ (root)`. Custom domain: `gabi.automatilabs.de`.
3. DNS bei IONOS (automatilabs.de): CNAME-Eintrag `gabi` → `<github-konto>.github.io`.
4. Sobald das Zertifikat da ist: *Enforce HTTPS* einschalten.

## Umgebungsvariablen (nur Namen – Werte nie ins Repo)

| Name | Wo | Wofür |
|---|---|---|
| `ANTHROPIC_API_KEY` | Worker-Secret | Claude: Strukturierung, Gespräch, Berichte |
| `SUPABASE_URL` | Worker-Secret | Projekt-Adresse der Datenbank |
| `SUPABASE_SECRET_KEY` | Worker-Secret | Datenbankzugriff (nur im Worker) |
| `GABI_ZUGANGSCODE` | Worker-Secret | Zugangscode der Testversion |
| `AI` | Worker-Bindung (`wrangler.toml`) | Workers AI / Whisper |
| `ERLAUBTE_ORIGINS` | `wrangler.toml` [vars] | erlaubte Web-Adressen (CORS) |
| `ANTHROPIC_MODELL` | `wrangler.toml` [vars] | Modell, Standard `claude-opus-5-5` |
| `ANTHROPIC_EFFORT` | `wrangler.toml` [vars] | Denktiefe, Standard `low` (schnell) |
| `GABI_ZUGANGSCODE`, `ANTHROPIC_API_KEY`, `GABI_WHISPER_CMD`, `GABI_AUDIO_ABLAGE`, `PORT` | nur lokal | lokaler Modus |
| `GABI_BRAIN=1` | nur lokal (`npm run brain`, `npm run brain:staging`) | Brain-Prototyp AN: `config.js` meldet `brain: true` |
| `GABI_API=<adresse>` | nur lokal (`npm run brain:staging`) | Adresse des Staging-Workers für die Vorschau |
| `GABI_SPEICHER = "arbeitsspeicher"` | `wrangler.brain.toml` [vars] | Staging ohne Datenbank: drei Test-Patienten im Arbeitsspeicher |
| `BRAIN_SPEICHER = "supabase"` | `wrangler.toml` [vars], Standard AUS | Routen `/api/brain…` (Brain in Supabase, Entwurf) |
| `BRAIN_QUELLE = "supabase"` | `wrangler.toml` [vars], Standard AUS | serverseitiger Abruf statt Kontext aus der Oberfläche |

## Datenschutz der Testversion
- Nur Testdaten. Kürzel ohne Ziffer werden abgelehnt (Schutz vor Klarnamen); Beschreibung höchstens 60 Zeichen, fiktiv.
- Datenbank in Frankfurt, Zugriff nur über den Worker (RLS an, Browser-Schlüssel haben keine Rechte).
- Spracherkennung bei Cloudflare (Workers AI, ohne Speicherung), Strukturierung bei Anthropic (USA). Für echte Daten
  braucht es vorher AV-Verträge und eine Prüfung der Verarbeitungsorte (Baustein 2+).
- Der Worker loggt keine Inhalte, Codes, Schlüssel oder IP-Adressen (nur die Art eines Fehlers).
- **Gespräche nur auf diesem Gerät** (v2.1): IndexedDB bzw. localStorage dieses Browsers, getrennt für Demo und echten
  Betrieb, höchstens 50 (die ältesten fliegen mit Hinweis raus). Nie in Supabase oder im Worker – es gibt nur einen
  gemeinsamen Zugangscode, gespeicherte Gespräche auf dem Server wären für alle sichtbar. „Abmelden“ fragt
  „Gespräche auf diesem Gerät auch löschen?“ (vorbelegt: ja). Der Code ist dabei sofort vom Gerät, mit Häkchen auch
  die Gespräche – auch wenn der Tab danach gleich zugeht; was gerade gespeichert wird, wartet die App noch ab (v2.1.1).
  Ein Gespräch, das ein Tab gelöscht hat, legt ein anderer Tab nicht wieder an. Entwürfe sind bis zum Klick auf
  „Speichern“ nur Teil des Gesprächs auf dem Gerät.
- Die App schickt nie eine Anfrage ohne Zugangscode an den Worker (er zählte sie als Fehlversuch) – v2.1.1.
- Gabi hat kein Werkzeug zum Speichern, Ändern oder Löschen – das macht nur die Therapeutin per Knopf.
- **Brain (Prototyp):** liegt nur auf diesem Gerät (IndexedDB bzw. localStorage, Demo getrennt), nie in Supabase oder im
  Worker. An die KI gehen je Frage höchstens 8 Einträge Praxiswissen – nie Patienten, Notizen oder Berichte. Der Worker
  behandelt Brain-Inhalte als Daten (geprüft, bereinigt, abgegrenzt), die Kernregeln stehen im Code und lassen sich über
  das Brain nicht ändern; Regeln und Persona aus dem Brain können Gabi nur zusätzlich einschränken oder ihren Ton
  ergänzen. Lücken, Nutzungszähler und die Spur „Zuletzt genutzt“ (nur was und wann, nie Inhalte) bleiben lokal.
  Patienten erscheinen im Brain nur als Kürzel, Notizen nur als „Datum · Kürzel“.
- Worker: nur Anfragen von gabi.automatilabs.de (und localhost zum Testen), Rate-Limit je IP (300/min, Spracherkennung
  und KI je 120/10 min, Gespräch 120 Nachrichten/10 min), Sperre nach 20 falschen Zugangscodes für 15 Minuten,
  Größenlimits (Aufnahme ≤ 5 Minuten, JSON ≤ 300 KB, Gespräch ≤ 40 Nachrichten, höchstens 6 Werkzeug-Runden),
  Eingaben werden auf Typ geprüft.

## Was geht · was fehlt (Stand v2.1.2)
**Geht:** Gesprächsverlauf (mehrere Gespräche, nur auf dem Gerät, eigene Adressen, Umbenennen, Löschen, Limit 50),
Gesprächs-erste Oberfläche mit Schnellaktionen, Push-to-Talk (Finger, Maus, Leertaste; Wegziehen verwirft),
Antworten live mit Tipp-Animation, Quellen, Kopieren, Vorlesen, Stopp, Wiederholen; Diktat → Entwurf → Bearbeiten →
Speichern nach Bestätigung; Fragen zu Notizen und Test-Patienten; Verlaufsbericht und Zusammenfassung als Karte und PDF;
Fragen zur Praxis aus der Wissensdatei; „Was steht heute an?“ (Notizen und unklare Stellen, ohne Kalender);
Notizordner mit Karten, Suche, Bearbeiten, Löschen, PDF; Zugang, Offline, Mikrofon-Hilfe, Lade- und Leerzustände;
Hell/Dunkel; Handy und Laptop; Demo-Modus mit komplettem Assistenten.

**Fehlt bewusst / später:** Anbindung an die Praxissoftware und Terminkalender (Baustein 2), echte Benutzerkonten statt
gemeinsamem Zugangscode, Rollen/Protokoll, EU-only-Verarbeitung für KI und Spracherkennung, Offline-Betrieb,
Aufbewahrungsfristen, Gesprächsverlauf über Geräte hinweg (bräuchte eigene Konten – mit einem gemeinsamen Code nicht
vertretbar).

**Brain-Prototyp (Branch `gabi-brain`, hinter Schalter, Standard AUS – nicht live):** Wissensgraph mit Liste, Detail,
Versionen, Papierkorb, Rückgängig, Import/Export, Gesundheit, Wissenslücken und Fähigkeiten-Register; Gabi beantwortet
Praxisfragen nur aus dem Brain, mit Quellen-Chips, Lücken-Hinweis, Interview „Brain füllen“ und den Befehlen „Merke
dir“, „Ändere“, „Was weißt du über“. Läuft komplett im Demo-Modus und lokal (Speicher im Browser). **Fehlt:** der Lauf
mit dem echten Modell (Staging-Worker, nur nach Freigabe), das gemeinsame Brain in Supabase (braucht Benutzerkonten und
Rollen; SQL liegt als Entwurf bereit, nicht ausgeführt), alles ab Phase 3 der `ASSISTENT-ROADMAP.md`.
