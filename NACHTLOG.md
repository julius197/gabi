# 🌙 Nachtlog – Gabi Baustein 1, Nachtschicht 03./04.11.2026

Branch **`nachtschicht`** (von `main` @ `fa402fe`). **Nicht** auf `main` gepusht, **kein** Deploy des Workers,
Live-Worker und Cloudflare-Secrets unverändert, keine anderen Projekte angefasst. Nur erfundene Testdaten.

## Was gemacht wurde (in der Reihenfolge des Auftrags)

| # | Thema | Ergebnis | Commit |
|---|---|---|---|
| 1 | Demo-Modus | `?demo=1` oder Backend nicht erreichbar/eingerichtet → App läuft komplett im Browser (`demo.js`): 3 Test-Patienten mit je 2 Notizen, Fake-Transkript nach echter Aufnahme, Fake-Notiz, Ordner, PDF. Banner mit Grund, „Beispieldaten zurücksetzen“, „Erneut verbinden“/„Demo beenden“, Knopf „Beispieldiktat einfügen“ (ohne Mikrofon). | `26eae8d` |
| 2 | Handy-UX | Statusanzeige Bereit · Nimmt auf · Verarbeitet · Fertig · Fehler; Knopf bis 240 px; Mikrofon blockiert/fehlt/belegt → verständliche Meldung + Anleitung je Gerät (iPhone, Android, Mac-Safari, Desktop); Vorabprüfung https / In-App-Browser / gesperrte Berechtigung; MediaRecorder-Fallback (iPhone/Safari MP4 zuerst, sonst WebM, nicht lesbares Format wird gesperrt); 5-Minuten-Limit mit Countdown ab 4:30; Bildschirm bleibt während der Aufnahme an; App-Wechsel/Telefonat beendet sauber; nur der drückende Finger beendet; „Nochmal senden“ ohne neue Aufnahme; Zeitlimits + deutsche Texte für alle Anfragen; Speichern/Zugang/Patient gegen Doppelklick gesichert. | `2a0e229` |
| 3 | Notiz-Prompt | Kurze Stichpunkte (≤ 12 Wörter, ≤ 12 je Abschnitt), klare Zuordnung, erlaubte Fachabkürzungen, „Pat.:“ für Patientenangaben, Selbstkorrekturen, nichts erfinden, (unklar)-Regeln, ein vollständiges Beispiel. KI-Antwort auch mit Code-Zaun lesbar; ohne Schlüssel verständliche Meldung; Transkript-Grenze nicht verschiebbar. | `8bfded2` |
| 4 | PDF | Eigenes Modul `pdf.js`: Kopf PhysioWorks + „TESTVERSION“, Infobox Kürzel/Beschreibung/Datum/Uhrzeit, Abschnitte mit Linie, hängender Einzug, „(unklar)“ gelb markiert, „Bitte prüfen“ farbig, Überschrift nie allein am Seitenende, Kopfzeile ab Seite 2, Fuß „Testversion – Testdaten“ + Seitenzahl auf jeder Seite. | `e28485b` |
| 5 | Notizordner | Sortierung nach Datum (wird gemerkt), Leerzustände mit nächstem Schritt, Suche (Hinweis unter 2 Buchstaben, Escape, veraltete Antworten ignoriert), Abbrechen/Wegnavigieren mit ungespeicherten Änderungen fragt nach, Löschen mit Bestätigung, „+ Notiz“ wählt Patienten vor. | `0a10e44` |
| 6 | Worker härten | Rate-Limit je IP (300/min, Spracherkennung + KI je 120/10 min), Sperre nach 20 falschen Codes für 15 min (429 + Retry-After), fremde Origin → 403 (erlaubt: gabi.automatilabs.de + localhost), Content-Type/-Length vor dem Lesen, Aufnahme nur gültiges WAV-Base64 ≤ 5 min, Typprüfung aller Felder, 405 mit Allow, Sicherheits-Header, Ausfall Spracherkennung → 502 mit deutscher Meldung, Logs nur Fehlerart. Version 1.1.0, `/api/status` meldet `bereit`. | `3ee1bea` |
| 7 | Seed | `supabase/seed_test.sql`: „NUR TESTDATEN“ am Anfang, 3 erfundene Test-Patienten mit je 2 Notizen, idempotent, erzeugt aus `demo.js`. | `24373c6` |
| 8 | Tests | 3 neue Unit-Test-Dateien + `tests/demo.mjs` (Ende-zu-Ende Demo-Modus). | `2abbf73` |
| 9 | Secret-Prüfung | siehe unten | – |
| – | 320-px-Handys | Ein Knopf verbreiterte die Spalte um 12 px – behoben, Test prüft jetzt alle Ansichten bei 320 px | `110dc32` |
| – | Unabhängige Prüfung | Zweiter Prüfer (Subagent) hat den ganzen Diff gelesen – Funde und Korrekturen siehe unten | `2440d1f` |
| 10/11 | MORGEN.md, NACHTLOG.md, README | Checkliste ohne Terminal, dieses Protokoll, README auf neuem Stand | (letzter Commit) |

## Was getestet wurde – Ergebnisse

| Test | Ergebnis |
|---|---|
| `cd worker && npm test` – Unit-Tests (Vitest) | **48 von 48 bestanden** (4 Dateien: API 18, Härtung 14, Strukturierung 7, Oberfläche/Demo/PDF/Seed 9) |
| `tests/demo.mjs` – Demo-Modus Ende-zu-Ende (Playwright) | **49 von 49 bestanden**: Handy 390 px + Laptop 1366 px mit Fake-Mikrofon (bereit → nimmt auf → verarbeitet → fertig → speichern mit Doppelklick = 1 Notiz → Beispieldiktat → verwerfen → Ordner → Sortierung → Suche + Leerzustand → PDF → Wegnavigieren fragt → bearbeiten → löschen, **0 Server-Anfragen**, 0 Konsolenfehler); Backend nicht erreichbar / nicht eingerichtet → automatisch Demo; 320 px ohne seitliches Scrollen; Server weg bei gespeichertem Code → „Server nicht erreichbar“ statt Demo; Spracherkennung fällt aus → Aufnahme bleibt, „Nochmal senden“ klappt, Speichern fragt nach, Verwerfen räumt auf; Verwerfen während der Verarbeitung → nichts kommt zurück; Mikrofon verweigert → Fehlerzustand + iPhone-Anleitung; Safari-Engine (WebKit) ohne Mikrofon bis zum PDF |
| `tests/ablauf.mjs` – echte lokale API mit lokalem Whisper (Regression) | **32 von 32 bestanden** (Handy + Laptop, echte Spracherkennung des Testdiktats) |
| `schema.sql` + `seed_test.sql` in einem Wegwerf-Container (Supabase-Postgres 17) | je **2 × fehlerfrei** (idempotent), 3 Patienten × 2 Notizen, Suche „theraband“ = 2, Rolle `anon` **kein Zugriff**, `service_role` sieht 6 Notizen; Container danach gelöscht |
| `wrangler deploy --dry-run` | Worker baut (906 KB), **nicht** deployt |
| PDF visuell (kurz + 4 Seiten lang) | Kopf, Infobox, Abschnitte, gelbe (unklar)-Markierung, Kopfzeile ab Seite 2, Fuß auf jeder Seite – geprüft; Fehler „kleine Schrift nach Seitenumbruch“ gefunden und behoben |

## Unabhängige Prüfung (zweiter Prüfer über den ganzen Diff)
| Fund | Schwere | Was ich gemacht habe |
|---|---|---|
| Fehlgeschlagene Aufnahme konnte still verloren gehen (Fehler wurde von der nächsten Notiz-Erstellung überschrieben) | hoch | Eigene Liste „nicht erkannt“ mit „Nochmal senden“, bleibt bis gesendet/verworfen; Speichern fragt nach; zusätzlich Meldung |
| Kurzer Serverausfall schickte ein echtes Gerät still in den Demo-Modus (Beispieltext statt Aufnahme, nur lokal gespeichert) | hoch | Gerät mit gespeichertem Code → „Server nicht erreichbar“ mit „Erneut versuchen“ / „Demo öffnen“; Status wird einmal nachgefasst; Demo-Hinweis oben fest sichtbar; Hinweis „Beispieltext statt Ihrer Aufnahme“ |
| Verwerfen während der Verarbeitung: verworfener Text tauchte versteckt wieder auf | mittel | Zähler je Entwurf – späte Ergebnisse alter Entwürfe werden ignoriert |
| Statusanzeige blieb auf „Sprache wird erkannt …“ hängen | mittel | Anzeige wird nach jedem Durchlauf neu gesetzt |
| Aufnahme konnte hängen (start() wirft, resume() hängt in WebKit, stop kommt nie) | mittel | start() abgesichert, resume() mit Zeitlimit, Wächter beim Stoppen |
| Seitenwechsel-Schutz ließ sich mit zweimal „Zurück“ umgehen, Nachfragen konnten sich überlagern | niedrig–mittel | Zweiter Wechsel wird während der Nachfrage abgefangen, try/finally, Nachfrage immer nur einmal |
| Demo-Speicher: Wettlauf beim Fake-Transkript | niedrig | Daten nach dem Warten neu lesen |
| Bildschirmsperre: Wettlauf am Aufnahmeende | niedrig | Nach dem Holen prüfen, ob die Aufnahme noch läuft; Freigabe-Ereignis beachtet |
| Sperre/Rate-Limit je IP trifft eine ganze Praxis hinter einer Adresse | niedrig (Design) | Grenzen angehoben (300/min, 120/10 min, Sperre erst nach 20 falschen Codes) – globale Lösung bleibt offen |
| Geprüft und in Ordnung | – | XSS (alle Texte werden escaped), Content-Types von Oberfläche ↔ Worker, Vorab-Check (OPTIONS), lokaler Modus startet nie als Demo, Demo/echt getrennt, PDF (40 Stress-Varianten: nichts ragt in den Fuß), iOS-16.4-Syntax |

## Secret-Prüfung (Repo + gesamte Git-History, 10 Commits, alle Branches)
Gesucht nach: Anthropic-Keys (`sk-ant-…`), `sk-…`, Supabase `sb_secret_…`/`sb_publishable_…`, JWTs (`eyJ…`),
GitHub-/AWS-/Slack-Tokens, Private Keys, Supabase-Projekt-URLs, Zuweisungen `key/secret/token/password = "…"`,
`Bearer …`, Cloudflare-Konto-ID, `.env`/`.dev.vars`.
**Ergebnis: keine echten Secrets.** Einzige Treffer: die bewusst erfundenen Platzhalter `sk-ant-GEHEIM` und
`sb_secret_GEHEIM` in `worker/test/haertung.test.js` (Test prüft, dass solche Werte nie in Logs landen).
Keine `.env`/`.dev.vars` im Repo, keine Konto-ID, keine echten Patientendaten (nur Kürzel TP-xx, alles fiktiv).
Die Worker-Adresse `gabi-api.julius-422.workers.dev` ist öffentlich und kein Geheimnis.

## Entscheidungen, die ich getroffen habe
1. **Demo auch bei „nicht eingerichtet“**: nicht nur bei Netzwerkfehler, sondern auch wenn der Worker antwortet, aber Zugangscode oder Datenbank fehlen – sonst wäre gabi.automatilabs.de vor dem Einrichten unbenutzbar.
2. **Demo nur beim Start, nie mitten in der Sitzung**: fällt der Server später aus, kommen Fehlermeldungen – sonst würden Notizen unbemerkt nur im Browser landen. Und: ein Gerät mit gespeichertem Zugangscode geht nie automatisch in den Demo-Modus, sondern fragt.
3. **Demo-Daten im localStorage**, getrennte Schlüssel für Entwurf/Patient, damit Beispieldaten nie in echte Entwürfe geraten; „Zurücksetzen“-Knopf.
4. **Demo-Aufnahme nutzt das echte Mikrofon** (testet Berechtigung, Format, WAV-Umwandlung), liefert aber Beispieldiktate der Reihe nach; für passende Diktate eine Musternotiz, sonst einfache Stichwort-Zuordnung mit Hinweis – keine KI im Demo.
5. **Mikrofon-Anleitung nach Gerät** (User-Agent): iPhone, Android, Mac-Safari, sonst Desktop.
6. **Fehlgeschlagene Spracherkennung**: Aufnahme bleibt im Tab → „Nochmal senden“; bei nicht lesbarem Format wird es für die Sitzung gesperrt und das nächste probiert.
7. **Prompt**: „Pat.:“ vor Patientenangaben, Messwerte in Befund, ausdrückliche Vergleiche in Verlauf, höchstens 12 Stichpunkte je Abschnitt (vorher 15), ein Beispiel im Prompt.
8. **PDF ohne Transkript** – nur die strukturierte Notiz (wie eine Behandlungsdokumentation); lässt sich leicht ergänzen.
9. **Rate-Limit im Speicher der Worker-Instanz** (kostenlos, ohne Zusatzdienst). Schützt gut gegen Ausprobieren, ist aber nicht global über alle Cloudflare-Standorte – nächster Schritt wäre das Cloudflare-Rate-Limiting-Binding. Grenzen großzügig gewählt, weil eine Praxis oft eine gemeinsame IP-Adresse hat.
10. **Fremde Origin → 403** (statt nur fehlender CORS-Header). Anfragen ohne Origin (z. B. curl) bleiben möglich, brauchen aber den Zugangscode.
11. **Aufnahme nur als WAV** akzeptiert – die Oberfläche schickt immer WAV 16 kHz mono.
12. **Seed aus `demo.js` erzeugt** (eine Quelle für Demo und Datenbank), feste IDs, Zeiten relativ zu „heute“; ein Test schlägt fehl, wenn beides auseinanderläuft.
13. **Oberflächen-Tests laufen mit dem Vitest im `worker/`** – keine zweite Installation nötig.
14. **WebKit-CSP-Meldung**: Safari-Engine blockiert die eingebauten Stile von `<select>` und Suchfeld unter `style-src 'self'` (nachgewiesen: ohne beide Elemente 0 Meldungen, unser CSS unbetroffen). CSP **nicht** gelockert; der Test ignoriert gezielt nur diese Meldung.
15. **MORGEN.md ohne Terminal**: Secrets über das Cloudflare-Dashboard statt `wrangler secret put`; Merge, Deploy und GitHub-Upload macht Claude auf Zuruf.
16. Die offenen Terminal-Tabs von gestern („GitHub-Login“ wartet auf Y/n, „Secrets“ wartet auf Eingabe) habe ich **nicht angefasst**.

## Was offen bleibt
- **Julius (MORGEN.md):** GitHub-Login, Supabase-Projekt Frankfurt + `schema.sql` + `seed_test.sql`, 4 Secrets, IONOS-CNAME `gabi`, HTTPS, Live-Test am Handy.
- **Claude, nach Julius' OK:** `nachtschicht` → `main`, Worker neu deployen (die Härtung ist erst dann live), öffentliches Repo anlegen + pushen, GitHub Pages mit `gabi.automatilabs.de`.
- **Nicht prüfbar ohne Secrets:** echte Claude-Strukturierung mit dem neuen Prompt (nur offline geprüft: Regeln, Beispiel, Antwort-Lesen); Workers-AI-Whisper live mit echter Aufnahme (lokal mit gleichem Modell geprüft); Supabase live.
- **Echtes iPhone** noch nicht getestet (WebKit-Engine, iPhone-Anleitung und verweigertes Mikrofon simuliert).
- **Nachfrage beim Wegnavigieren**: Nach „Abbrechen“ wird die Adresse zurückgesetzt; der vorherige Eintrag im Browser-Verlauf zeigt danach auf die Notiz (kleiner Schönheitsfehler, kein Datenverlust).
- **Später:** globales Rate-Limit (Cloudflare-Binding), Benutzerkonten statt gemeinsamem Zugangscode, AV-Verträge und EU-only-Verarbeitung vor echten Daten, Anbindung Praxissoftware (Baustein 2).

**Nachtschicht abgeschlossen** – offen: (1) Julius: GitHub-Login, Supabase Frankfurt + schema.sql + seed_test.sql, 4 Secrets, IONOS-CNAME „gabi“, HTTPS, Live-Test am Handy (MORGEN.md) · (2) Claude nach OK: nachtschicht → main, Worker deployen, Repo + GitHub Pages · (3) echte Claude-Strukturierung und Workers-AI-Whisper live prüfen · (4) Test auf echtem iPhone · (5) später: globales Rate-Limit, Benutzerkonten, AV-Verträge/EU-only vor echten Daten, Baustein 2 Praxissoftware
