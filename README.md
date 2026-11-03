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
vendor/jspdf.umd.min.js         PDF-Erzeugung im Browser (jsPDF 4.2.1, MIT)
assets/                         Symbole
CNAME                           gabi.automatilabs.de (GitHub Pages)
worker/                         Cloudflare Worker = einzige Stelle mit Schlüsseln
  src/app.js                    Routen, Zugangscode, CORS, Prüfungen
  src/transkription.js          Spracherkennung: Workers AI, Whisper large v3 turbo (Deutsch)
  src/strukturierung.js         Anthropic API (Claude Opus 5.5, strukturierte JSON-Ausgabe)
  src/notiz.js                  Physio-Prompt, Schema, Normalisierung, Kürzel-Regeln
  src/speicher.js               Supabase (PostgREST) + Arbeitsspeicher-Variante
  dev/lokal.mjs                 lokaler Modus ohne Konten
  test/app.test.js              Unit-Tests (Vitest)
supabase/schema.sql             Tabellen patients_test + notes, RLS an, Test-Patient TP-01
tests/ablauf.mjs                Ende-zu-Ende-Test (Playwright, Fake-Mikrofon)
```

**Datenfluss:** Browser nimmt auf → wandelt in WAV 16 kHz mono → Worker → Whisper (Cloudflare) → Text zurück →
Worker → Claude strukturiert → Entwurf im Browser (bearbeitbar) → Speichern → Worker → Supabase (Frankfurt).
Der Browser kennt keinen Schlüssel; er schickt nur den Zugangscode der Testversion mit. Die Aufnahme wird nirgends gespeichert.

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
cd worker && npm test                      # 18 Unit-Tests: Zugang, CORS, Patienten, Notizen, Suche, Whisper, Claude, Supabase
npx wrangler deploy --dry-run              # Worker baut
# Ende-zu-Ende (lokaler Modus muss laufen, Playwright installiert):
node tests/ablauf.mjs diktat.wav ausgabe/  # Handy + Laptop: Aufnahme → Notiz → Speichern → Ordner → Suche → Bearbeiten → PDF → Löschen
```

## Einrichtung (einmalig)

### 1 Supabase (Datenbank, Region EU/Frankfurt)
1. Neues Projekt anlegen, Region **Central EU (Frankfurt)** – `eu-central-1`.
2. *SQL Editor* → Inhalt von `supabase/schema.sql` einfügen → *Run*.
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
Prüfen: `https://gabi-api.<konto>.workers.dev/api/status` zeigt bei `eingerichtet` überall `true`.

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
- Der Worker loggt keine Inhalte (nur Statuscodes). Der Entwurf liegt bis zum Speichern nur im Browser-Tab (sessionStorage).

## Was geht · was fehlt (Stand Baustein 1)
**Geht:** Push-to-Talk (Finger, Maus, Leertaste), mehrere Aufnahmen ergänzen eine Notiz, Spracherkennung Deutsch mit
Physio-Vokabular, Strukturierung in Befund/Maßnahmen/Verlauf/Hausaufgaben mit „(unklar)“-Markierung und Prüfliste,
Entwurf bearbeiten, Test-Patienten anlegen, Notizordner pro Patient, Volltextsuche, Detailansicht, Bearbeiten, Löschen,
PDF-Export (Kopf: PhysioWorks, Datum, Kürzel), Testbanner, Handy + Laptop.

**Fehlt bewusst / später:** Anbindung an die Praxissoftware (Baustein 2), echte Benutzerkonten statt gemeinsamem
Zugangscode, Rollen/Protokoll, EU-only-Verarbeitung für KI und Spracherkennung, Offline-Betrieb, Aufbewahrungsfristen.
