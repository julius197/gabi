# Gabi – Sprachnotizen zur Behandlung (Testversion, Baustein 1)

Push-to-Talk-Sprachnotizen für die Physiotherapie-Praxis **PhysioWorks**: Knopf gedrückt halten und sprechen, loslassen.
Gabi erkennt den Text, macht daraus eine Physio-Notiz (Befund · Maßnahmen · Verlauf · Hausaufgaben), ordnet sie einem
Test-Patienten (Kürzel) zu und speichert sie. Im Notizordner: Liste pro Patient, Suche, Detailansicht, Bearbeiten, PDF.

> **Testversion – nur Testdaten.** Keine Klarnamen, keine echten Patientendaten. Kürzel brauchen deshalb eine Ziffer (z. B. `TP-01`).

Adresse: **https://gabi.automatilabs.de** · Basis: Notara-Kern (Prompt-Regeln, Halluzinationsfilter, Aufnahme, Gestaltung), angepasst für die Cloud.

## Aufbau

```
index.html, app.js, style.css   Oberfläche (mobile first, Deutsch) – GitHub Pages
config.js                       öffentliche API-Adresse (kein Geheimnis)
demo.js                         Demo-Modus: Fake-API + erfundene Testdaten (auch Quelle für seed_test.sql)
pdf.js                          PDF der Behandlungsnotiz (Browser und Node)
vendor/jspdf.umd.min.js         PDF-Erzeugung im Browser (jsPDF 4.2.1, MIT)
assets/                         Symbole
CNAME                           gabi.automatilabs.de (GitHub Pages)
worker/                         Cloudflare Worker = einzige Stelle mit Schlüsseln
  src/app.js                    Routen, Zugangscode, CORS, Eingabeprüfung, Sicherheits-Header
  src/begrenzer.js              Rate-Limit je IP, Sperre nach falschen Zugangscodes
  src/transkription.js          Spracherkennung: Workers AI, Whisper large v3 turbo (Deutsch)
  src/strukturierung.js         Anthropic API (Claude Opus 5.5, strukturierte JSON-Ausgabe)
  src/notiz.js                  Physio-Prompt, Schema, Normalisierung, Kürzel-Regeln
  src/speicher.js               Supabase (PostgREST) + Arbeitsspeicher-Variante
  dev/lokal.mjs                 lokaler Modus ohne Konten
  dev/seed_erzeugen.mjs         schreibt supabase/seed_test.sql aus demo.js
  test/*.test.js                Unit-Tests (Vitest): API, Härtung, Strukturierung, Demo, PDF, Seed
supabase/schema.sql             Tabellen patients_test + notes, RLS an, Test-Patient TP-01
supabase/seed_test.sql          NUR TESTDATEN: 3 erfundene Test-Patienten mit je 2 Notizen
tests/ablauf.mjs                Ende-zu-Ende-Test gegen die lokale API (Playwright, Fake-Mikrofon)
tests/demo.mjs                  Ende-zu-Ende-Test des Demo-Modus (Handy, Laptop, Safari-Engine)
MORGEN.md · NACHTLOG.md         Checkliste zum Live-Schalten · Protokoll der Nachtschicht
```

**Datenfluss:** Browser nimmt auf → wandelt in WAV 16 kHz mono → Worker → Whisper (Cloudflare) → Text zurück →
Worker → Claude strukturiert → Entwurf im Browser (bearbeitbar) → Speichern → Worker → Supabase (Frankfurt).
Der Browser kennt keinen Schlüssel; er schickt nur den Zugangscode der Testversion mit. Die Aufnahme wird nirgends gespeichert.

## Demo-Modus (ohne Backend, ohne Secrets)

`?demo=1` an die Adresse hängen, z. B. `https://gabi.automatilabs.de/?demo=1` oder `http://localhost:8788/?demo=1`.
Die App startet auch automatisch im Demo-Modus, wenn der Worker nicht erreichbar oder noch nicht eingerichtet ist
(Zugangscode oder Datenbank fehlen) – ein blauer Banner sagt das. Ausnahme: Ein Gerät mit gespeichertem Zugangscode
(war schon im echten Betrieb) bekommt bei Serverproblemen „Server nicht erreichbar“ und entscheidet selbst. Im Demo-Modus geht keine einzige Anfrage an einen
Server: 3 erfundene Test-Patienten mit je 2 Notizen, die Aufnahme nutzt das echte Mikrofon, liefert aber
Beispieldiktate; „Beispieldiktat einfügen“ geht ganz ohne Mikrofon. Daten bleiben nur in diesem Browser
(„Beispieldaten zurücksetzen“ stellt den Anfang wieder her).

## Lokal ausprobieren (ohne Konten)

```bash
cd worker && npm install
npm run lokal          # http://localhost:8788 · Zugangscode: test
```

Ohne weitere Einstellungen liefert die Spracherkennung einen Demo-Text und die Notiz wird ohne KI grob zugeordnet.
Optional: `ANTHROPIC_API_KEY=… npm run lokal` (echte Strukturierung) und
`GABI_WHISPER_CMD="python3 dev/whisper_lokal.py"` (echte Spracherkennung lokal, braucht `mlx-whisper` auf Apple Silicon).

## Tests

```bash
cd worker && npm test                      # 48 Unit-Tests: API, Härtung, Rate-Limit, Prompt, KI-Antwort, Demo, PDF, Seed
npx wrangler deploy --dry-run              # Worker baut (ohne Deploy)
node dev/seed_erzeugen.mjs                 # seed_test.sql neu schreiben, wenn demo.js geändert wurde
# Ende-zu-Ende (lokaler Modus muss laufen, Playwright mit Chromium + WebKit):
node tests/demo.mjs diktat.wav ausgabe/    # 49 Prüfungen: Demo auf Handy + Laptop, Backend fehlt, Ausfälle, Mikrofon verweigert, Safari
node tests/ablauf.mjs diktat.wav ausgabe/  # echte lokale API: Aufnahme → Notiz → Speichern → Ordner → Suche → Bearbeiten → PDF → Löschen
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
| `ANTHROPIC_API_KEY` | Worker-Secret | Strukturierung mit Claude |
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
- Der Worker loggt keine Inhalte, Codes, Schlüssel oder IP-Adressen (nur die Art eines Fehlers). Der Entwurf liegt bis
  zum Speichern nur im Browser-Tab (sessionStorage).
- Worker: nur Anfragen von gabi.automatilabs.de (und localhost zum Testen), Rate-Limit je IP (300/min, Spracherkennung
  und KI je 120/10 min), Sperre nach 20 falschen Zugangscodes für 15 Minuten, Größenlimits (Aufnahme ≤ 5 Minuten,
  JSON ≤ 300 KB), Eingaben werden auf Typ geprüft.

## Was geht · was fehlt (Stand Baustein 1)
**Geht:** Push-to-Talk (Finger, Maus, Leertaste) mit klaren Zuständen (Bereit · Nimmt auf · Verarbeitet · Fertig ·
Fehler), Anleitung bei gesperrtem Mikrofon, iPhone-Safari-Format, 5-Minuten-Limit mit Countdown, „Nochmal senden“;
mehrere Aufnahmen ergänzen eine Notiz, Spracherkennung Deutsch mit Physio-Vokabular, Strukturierung in
Befund/Maßnahmen/Verlauf/Hausaufgaben mit „(unklar)“-Markierung und Prüfliste, Entwurf bearbeiten, Test-Patienten
anlegen, Notizordner pro Patient mit Sortierung und Suche, Bearbeiten und Löschen mit Bestätigung, mehrseitiges PDF
(Kopf: PhysioWorks, Datum, Kürzel · Fuß: „Testversion – Testdaten“), Demo-Modus ohne Backend, Testbanner, Handy + Laptop.

**Fehlt bewusst / später:** Anbindung an die Praxissoftware (Baustein 2), echte Benutzerkonten statt gemeinsamem
Zugangscode, Rollen/Protokoll, EU-only-Verarbeitung für KI und Spracherkennung, Offline-Betrieb, Aufbewahrungsfristen.
