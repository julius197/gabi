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

> **Testversion – nur Testdaten.** Keine Klarnamen, keine echten Patientendaten. Kürzel brauchen deshalb eine Ziffer (z. B. `TP-01`).
> Gabi stellt keine Diagnosen und gibt keine Therapieempfehlungen; sie antwortet nur aus gespeicherten Notizen und der Wissensdatei.

Adresse: **https://gabi.automatilabs.de** (Branch `main`, v2 seit 08.11.2026) · Protokoll: `GABI-V2-LOG.md`.

> **Neue Version veröffentlichen:** in `index.html` die Kennung `?v=…` an `style.css` und allen eigenen Skripten (auch `gespraeche.js`) hochzählen
> und `VERSION` oben in `app.js` gleich setzen (ein Test prüft das) – GitHub Pages lässt Dateien 10 Minuten im Browser-Cache;
> passen Seite und Skript nicht zusammen, lädt die App einmal neu.
> Pages liefert nur die App aus: Notizen, Worker, Tests und Screenshots stehen in `_config.yml` unter `exclude` –
> neue Dateien oder Ordner, die nicht zur App gehören, dort ergänzen.

## Aufbau

```
index.html, style.css           Oberfläche (mobile first, Hell/Dunkel nach System, Deutsch) – GitHub Pages
app.js                          Gespräch, Gesprächsverlauf, Karten (Entwurf, Bericht), Push-to-Talk, Notizordner, Start/Zugang/Demo
gespraeche.js                   Gesprächsverlauf: Ablage nur im Browser (IndexedDB → localStorage), Titel, Gruppen, Limit 50
kern.js                         reine Hilfen: sicherer Text (Markdown-Ersatz), NDJSON-Leser, Verlauf für den Server, Datum
aufnahme.js                     Aufnahme: MediaRecorder → WAV 16 kHz mono, Mikrofon-Hilfe je Gerät, Wake Lock
demo.js                         Demo-Modus: Fake-API, Demo-Assistent ohne KI, erfundene Testdaten (Quelle für seed_test.sql)
pdf.js                          PDF: Behandlungsnotiz und Bericht (Browser und Node)
config.js                       öffentliche API-Adresse (kein Geheimnis)
knowledge/physioworks.md        Wissen über die Praxis (von physio-works.de, Unklares als „TODO prüfen“)
vendor/jspdf.umd.min.js         PDF-Erzeugung im Browser (jsPDF 4.2.1, MIT)
assets/                         Symbole, Schrift Inter (OFL, lokal)
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
  test/*.test.js                Unit-Tests (Vitest)
supabase/schema.sql             Tabellen patients_test + notes, RLS an (v2 braucht keine neue Tabelle)
supabase/seed_test.sql          NUR TESTDATEN: 3 erfundene Test-Patienten mit je 2 Notizen
supabase/reset_test.sql         ⚠️ löscht ALLE Notizen und Test-Patienten, dann Stand von seed_test.sql (nur von Hand, nach OK)
tests/v2.mjs                    Ende-zu-Ende-Tests (Playwright): Handy/Laptop × Hell/Dunkel, Robustheit, echte lokale API, Safari
tests/eingabefelder.mjs         Eingabefelder ohne Anschnitt (Cursor, Text, Platzhalter per Bildvergleich) – Block 5 von v2.mjs
screenshots/                    Screenshots aus tests/v2.mjs
```

**Datenfluss Gespräch:** Browser → `POST /api/chat` (Verlauf als Text, Zugangscode) → Worker → Claude mit Werkzeugen
(liest Notizen aus Supabase, Praxiswissen steht im Prompt) → Antwort als NDJSON-Strom (Text, Status, Quellen, Entwurf,
Bericht). **Diktat:** Aufnahme → WAV → `/api/transkribieren` (Whisper bei Cloudflare) → `/api/chat` mit
`aktion: diktat` → Strukturierung → Entwurfskarte → Speichern über `POST /api/notizen`. Der Browser kennt keinen
Schlüssel. **Gespräche** liegen nur im Browser dieses Geräts (IndexedDB „gabi“, Demo getrennt in „gabi-demo“; ohne
IndexedDB localStorage): der Worker bekommt pro Frage nur den Verlauf zum Antworten und speichert nichts davon. In der
Adresse steht nur die Gesprächs-ID, im Seitentitel nichts vom Inhalt (der Titel landet sonst im Browserverlauf und in dessen
Synchronisierung). Die Aufnahme wird nirgends gespeichert (bis zum Senden nur im Arbeitsspeicher des Tabs).

## Demo-Modus (ohne Backend, ohne Secrets)

`?demo=1` an die Adresse hängen, z. B. `http://localhost:8788/?demo=1`. Die App startet auch automatisch im Demo-Modus,
wenn der Worker nicht erreichbar oder noch nicht eingerichtet ist (Hinweis per Toast, Badge „Demo“). Ausnahme: Ein Gerät
mit gespeichertem Zugangscode bekommt bei Serverproblemen die Seite „Server nicht erreichbar“. Im Demo-Modus geht keine
einzige Anfrage an einen Server: kompletter Assistent mit Fake-Antworten (Fragen zu Notizen, Bericht, Heute, Praxis),
3 erfundene Test-Patienten mit je 2 Notizen, die Aufnahme nutzt das echte Mikrofon und liefert Beispieldiktate;
„Beispieldiktat nehmen“ geht ganz ohne Mikrofon. „Beispieldaten zurücksetzen“ über das Demo-Badge.

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
```

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
