# Gabi – Assistenz für Behandlungsnotizen (Testversion)

**Gabi v2** ist Diktat und persönlicher Assistent in einem – für die Physiotherapie-Praxis **PhysioWorks**.
Startbildschirm ist ein Gespräch mit Gabi: Behandlung diktieren (Mikrofon gedrückt halten oder tippen) → Gabi macht
daraus einen Entwurf (Befund · Maßnahmen · Verlauf · Hausaufgaben), gespeichert wird erst nach Bestätigung. Dazu:
Notizen durchsuchen und Fragen beantworten („Was wollte TP-01?“), Berichte als Text und PDF (Verlauf, Zusammenfassung),
Fragen zur Praxis (Leistungen, Standorte) aus `knowledge/physioworks.md`. Der Notizordner bleibt (Karten pro Patient,
Suche, Bearbeiten, Löschen, PDF).

> **Testversion – nur Testdaten.** Keine Klarnamen, keine echten Patientendaten. Kürzel brauchen deshalb eine Ziffer (z. B. `TP-01`).
> Gabi stellt keine Diagnosen und gibt keine Therapieempfehlungen; sie antwortet nur aus gespeicherten Notizen und der Wissensdatei.

Adresse: **https://gabi.automatilabs.de** (Branch `main`, noch v1) · v2 liegt auf Branch `gabi-v2` · Protokoll: `GABI-V2-LOG.md`.

## Aufbau

```
index.html, style.css           Oberfläche (mobile first, Hell/Dunkel nach System, Deutsch) – GitHub Pages
app.js                          Gespräch, Karten (Entwurf, Bericht), Push-to-Talk, Notizordner, Start/Zugang/Demo
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
  dev/seed_erzeugen.mjs         schreibt supabase/seed_test.sql aus demo.js
  test/*.test.js                Unit-Tests (Vitest)
supabase/schema.sql             Tabellen patients_test + notes, RLS an (v2 braucht keine neue Tabelle)
supabase/seed_test.sql          NUR TESTDATEN: 3 erfundene Test-Patienten mit je 2 Notizen
tests/v2.mjs                    Ende-zu-Ende-Tests (Playwright): Handy/Laptop × Hell/Dunkel, Robustheit, echte lokale API, Safari
screenshots/                    Screenshots aus tests/v2.mjs
```

**Datenfluss Gespräch:** Browser → `POST /api/chat` (Verlauf als Text, Zugangscode) → Worker → Claude mit Werkzeugen
(liest Notizen aus Supabase, Praxiswissen steht im Prompt) → Antwort als NDJSON-Strom (Text, Status, Quellen, Entwurf,
Bericht). **Diktat:** Aufnahme → WAV → `/api/transkribieren` (Whisper bei Cloudflare) → `/api/chat` mit
`aktion: diktat` → Strukturierung → Entwurfskarte → Speichern über `POST /api/notizen`. Der Browser kennt keinen
Schlüssel; das Gespräch liegt nur im Browser-Tab (sessionStorage), die Aufnahme wird nirgends gespeichert.

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

**Gegen den echten Worker testen** (Branch vor dem Merge prüfen, echter Zugangscode):
```bash
cd worker && npm run vorschau   # http://localhost:8788 – Oberfläche dieses Branches, API = Live-Worker
```

## Tests

```bash
cd worker && npm test                      # Unit-Tests: API, Härtung, Assistent (Werkzeuge, Strom, Ersatzmodell), Kern, Demo, PDF, Seed
npx wrangler deploy --dry-run              # Worker baut (ohne Deploy)
node dev/seed_erzeugen.mjs                 # seed_test.sql neu schreiben, wenn demo.js geändert wurde
node dev/wissen_erzeugen.mjs               # src/wissen.js neu schreiben, wenn knowledge/physioworks.md geändert wurde
# Ende-zu-Ende (npm run lokal muss laufen; Playwright mit Chromium + WebKit):
PLAYWRIGHT_MODUL=/pfad/zu/playwright/index.mjs node tests/v2.mjs [diktat.wav] [screenshots/]
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
- Der Worker loggt keine Inhalte, Codes, Schlüssel oder IP-Adressen (nur die Art eines Fehlers). Gespräch und Entwurf
  liegen bis zum Speichern nur im Browser-Tab (sessionStorage); der Chatverlauf wird nicht in der Datenbank gespeichert.
- Gabi hat kein Werkzeug zum Speichern, Ändern oder Löschen – das macht nur die Therapeutin per Knopf.
- Worker: nur Anfragen von gabi.automatilabs.de (und localhost zum Testen), Rate-Limit je IP (300/min, Spracherkennung
  und KI je 120/10 min, Gespräch 120 Nachrichten/10 min), Sperre nach 20 falschen Zugangscodes für 15 Minuten,
  Größenlimits (Aufnahme ≤ 5 Minuten, JSON ≤ 300 KB, Gespräch ≤ 40 Nachrichten, höchstens 6 Werkzeug-Runden),
  Eingaben werden auf Typ geprüft.

## Was geht · was fehlt (Stand v2)
**Geht:** Gesprächs-erste Oberfläche mit Schnellaktionen, Push-to-Talk (Finger, Maus, Leertaste; Wegziehen verwirft),
Antworten live mit Tipp-Animation, Quellen, Kopieren, Vorlesen, Stopp, Wiederholen; Diktat → Entwurf → Bearbeiten →
Speichern nach Bestätigung; Fragen zu Notizen und Test-Patienten; Verlaufsbericht und Zusammenfassung als Karte und PDF;
Fragen zur Praxis aus der Wissensdatei; „Was steht heute an?“ (Notizen und unklare Stellen, ohne Kalender);
Notizordner mit Karten, Suche, Bearbeiten, Löschen, PDF; Zugang, Offline, Mikrofon-Hilfe, Lade- und Leerzustände;
Hell/Dunkel; Handy und Laptop; Demo-Modus mit komplettem Assistenten.

**Fehlt bewusst / später:** Anbindung an die Praxissoftware und Terminkalender (Baustein 2), echte Benutzerkonten statt
gemeinsamem Zugangscode, Rollen/Protokoll, EU-only-Verarbeitung für KI und Spracherkennung, Offline-Betrieb,
Aufbewahrungsfristen, gespeicherter Chatverlauf über die Sitzung hinaus.
