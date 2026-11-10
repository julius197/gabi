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
| 1 Bauplan und Log | ✅ |
| 2 Modell `brain.js`, Suche `brain-suche.js` | ⏳ |
| 3 Speicher `brain-speicher.js` | ⏳ |
| 4 Seed (Zerlegung, Generator, `brain-seed.js`) | ⏳ |
| 5 Graph `brain-graph.js` | ⏳ |
| 6 Worker (Kontext, Quellen/Lücken, Register, Staging, Supabase-Entwurf) | ⏳ |
| 7 Ansicht `brain-ansicht.js`, `brain.css`, Einbau in `index.html`/`app.js` | ⏳ |
| 8 Interview, Chat-Befehle, Fähigkeiten-Ansicht, Demo-Assistent | ⏳ |
| 9 Doku (README, Roadmap, Vorlage) | ⏳ |
| 10 Tests (Unit, Browser), Leistung, Gegenprobe | ⏳ |
| 11 Prüfrunden (höchstens zwei), Korrekturen | ⏳ |
| 12 Screenshots, Abschlusslauf, Kurzbericht | ⏳ |

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

## Nicht getan (bewusst)

- Kein Push, kein Merge, kein Deploy, keine Migration ausgeführt, keine Secrets gesetzt.
- Keine Anfrage an den Live-Worker (auch nicht an `/api/status`). Port 8788 nie benutzt.
- `~/Desktop/automati-real-estate` nur gelesen (Brain-Ansicht dort: Bedienung und Designsprache als Ideen; kein Code
  übernommen – die Vorlage nutzt d3-force, hier ist das Layout eine eigene Umsetzung).

## Später / „kann“

- Eingebaute Zitate der Anthropic-API statt Markerzeilen (satzgenaue Quellen) – erst mit Schlüssel im Staging erproben.
