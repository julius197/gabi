# Gabi v2 – Log (Redesign + Assistent)

Auftrag vom 08.11.2026: Gabi vom „Notara-Klon“ (Aufnahme-Knopf + Notizordner) zu einer Mischung aus Diktat und
persönlichem Assistenten umbauen, kompletter Redesign im Stil von automati-real-estate. Branch `gabi-v2`, nicht `main`.
Nur Testdaten. Selbstständig gearbeitet, Entscheidungen unten.

## Was gebaut ist

| Bereich | Was | Dateien |
|---|---|---|
| Design | Neues Design-System: warmes Grau, weiße schwebende Karten mit 5-%-Kante und langen weichen Schatten, ein Akzent (tiefes Grün), runde Bedienelemente, Inter (lokal), Hell/Dunkel nach System, Bewegung ≤ 260 ms, „Bewegung reduzieren“ = nur Ein-/Ausblenden | `style.css`, `index.html`, `assets/fonts/` |
| Start | Gesprächs-erste Oberfläche: Begrüßung nach Tageszeit, 4 Schnellaktionen (Behandlung diktieren, Notiz suchen, Bericht erstellen, Was steht heute an?), Eingabefeld mit Mikrofon (Push-to-Talk) | `index.html`, `app.js` |
| Gespräch | Antworten live (Streaming), Tipp-Animation mit Status („Durchsuche die Notizen …“), Quellen-Chips zu den genutzten Notizen, Kopieren, Vorlesen (Sprachausgabe des Browsers, nur auf Knopfdruck), Stopp-Knopf, „Nochmal versuchen“, Verlauf pro Sitzung (sessionStorage), „Neues Gespräch“ | `app.js`, `kern.js` |
| Diktat | Chip → Test-Patient wählen → Diktat-Modus (Pill) → gedrückt halten und sprechen (Pegelwellen, Zeit, Wegziehen = verwerfen) oder tippen → Entwurfskarte (Befund/Maßnahmen/Verlauf/Hausaufgaben, „(unklar)“ markiert, „Bitte prüfen“) → Bearbeiten → **Speichern erst auf Knopfdruck** | `app.js`, `aufnahme.js` |
| Bericht | Chip → Patient → Verlaufsbericht oder Zusammenfassung → Karte mit Zeitleiste, Hausaufgaben, offenen Punkten → PDF oder Text kopieren | `app.js`, `pdf.js`, `worker/src/chat.js` |
| Assistent (Worker) | Neue Route `POST /api/chat`: Claude mit Werkzeugen (patienten_auflisten, notizen_suchen, notiz_lesen, heute_ueberblick, notiz_entwurf_erstellen, bericht_erstellen), Antwort als NDJSON-Strom, feste Abläufe für Diktat und Bericht aus den Chips, Praxiswissen im Systemprompt | `worker/src/chat.js`, `worker/src/app.js` |
| Wissen | `knowledge/physioworks.md` aus physio-works.de (gegründet 2011, 2 Standorte Nürnberg, Profisportler, Leistungen, Team, Kontakt); Unklares als „TODO prüfen“ | `knowledge/`, `worker/src/wissen.js` (erzeugt) |
| Notizordner | Karten pro Patient, Suche (mit Sortierung bei Treffern), Patientenseite mit „Diktieren“ und „Bericht“, Notiz-Ansicht mit Original-Diktat, Bearbeiten (fragt bei ungesicherten Änderungen), Löschen mit Bestätigung, PDF | `app.js` |
| PDF | Neuer Look (Farbstreifen, PhysioWorks-Kopf, Testversion-Pill, ruhige Infobox, Abschnitte, „(unklar)“ markiert, Fuß „Testversion – Testdaten“), neu: Bericht-PDF | `pdf.js` |
| Zugang & Zustände | Zugangsbildschirm im neuen Design (Code anzeigen, verständliche Fehler), Offline-Seite, Mikrofon-Hilfe je Gerät im Gespräch, Ladezustände (Skelett-Karten), leere Zustände mit Aktion, Toasts | `index.html`, `app.js`, `aufnahme.js` |
| Demo | `?demo=1` zeigt den kompletten Assistenten mit Fake-Antworten: Absichtserkennung ohne KI, dieselben Werkzeuge und Ergebnisformen wie der Worker, Praxis-Antworten nur aus der Wissensdatei, Beispieldiktat passend zum Patienten | `demo.js` |
| Lokal | `npm run lokal` streamt jetzt und nutzt ohne KI-Schlüssel den Demo-Assistenten mit den echten Worker-Werkzeugen; neu `npm run vorschau` = v2-Oberfläche gegen den echten Worker | `worker/dev/lokal.mjs`, `worker/dev/vorschau.mjs` |

## Entscheidungen

1. **Kein Skill „frontend-design“ verfügbar** (Suche ohne Treffer) – nach denselben Grundsätzen gearbeitet; Designsprache von
   automati-real-estate nur gelesen (Farben, Typo, Abstände, Schatten, Bewegung), kein Code und keine Inhalte kopiert.
2. **Schrift Inter** wie die Referenz, aber frisch von npm (@fontsource-variable/inter 5.2.8, nur Latin-Teil, 48 KB, OFL-Lizenz
   liegt bei) und lokal eingebunden – die strenge CSP erlaubt keine fremden Quellen.
3. **Dunkelmodus selbst gebaut** – die Referenz hat keinen. Im Dunkeln wird der Akzent hell (Grün mit dunkler Schrift).
4. **Kein Tab-Menü**: Handy = Kopfzeile mit „Notizen/Gespräch“-Umschalter, Laptop = Seitenleiste mit Gespräch, Notizen und
   Test-Patienten. Testhinweis nur als kleines Badge („Testversion“ bzw. „Demo“), Erklärung per Tipp darauf.
5. **Speichern nur durch die Therapeutin**: Claude hat kein Werkzeug zum Speichern, Ändern oder Löschen. Entwürfe sind Karten,
   gespeichert wird über die bestehende Route `POST /api/notizen`.
6. **Feste Abläufe für die Chips**: „Diktat“ und „Bericht“ laufen mit `aktion` direkt über die bewährte Strukturierung bzw.
   den Bericht – ohne dass die Gesprächs-KI erst entscheiden muss (schneller, vorhersehbar, billiger). Freie Fragen gehen an
   Claude mit Werkzeugen.
7. **Entwürfe über die bestehende Strukturierung** (`strukturierung.js`, Prompt mit allen Physio-Regeln), nicht von der
   Gesprächs-KI selbst geschrieben – eine Quelle für das Notizformat. Das Diktat wird nicht von der KI abgeschrieben
   (Werkzeug nimmt die letzte Nachricht wörtlich).
8. **Berichte**: eigener KI-Aufruf mit JSON-Schema; die KI verweist nur auf Notiz-Nummern, Datum und IDs setzt der Code –
   so können keine Daten erfunden werden. Ungültige Nummern fallen weg.
9. **Kein Chatverlauf in der Datenbank** (keine neue Migration nötig): Gespräch bleibt nur im Browser-Tab (sessionStorage),
   der Server bekommt bei jeder Anfrage den Text-Verlauf (max. 24 Nachrichten / 90 000 Zeichen). Weniger Kopien von
   Gesundheitsdaten; `schema.sql` unverändert.
10. **Modell und API**: `claude-opus-5-5`, effort `low` (schnell), Denken immer an (bei Opus 5.5 nicht abschaltbar),
    kein erzwungener Werkzeugaufruf (bei Opus 5.5 nicht erlaubt), Systemprompt + Werkzeuge gecacht, Ersatzmodell bei
    Ablehnung über `fallbacks: "default"`. Innerhalb einer Anfrage wird der Verlauf unverändert angehängt (Denkblöcke
    bleiben gültig); nach einem Wechsel aufs Ersatzmodell bleibt vor dem Wechsel nur Text (so verlangt es die API).
    Kein „eager input streaming“: Werkzeug-Eingaben sind klein und werden nicht live angezeigt.
11. **Grenzen für /chat**: JSON ≤ 300 KB, ≤ 40 Nachrichten, ≤ 20 000 Zeichen je Nachricht, ≤ 120 000 gesamt, höchstens
    6 Werkzeug-Runden, eigenes Rate-Limit 120 Nachrichten je 10 Minuten und IP, CORS und Zugangscode wie bisher.
    Logs nur mit Fehlerart (getestet).
12. **„Was steht heute an?“** ohne Kalender (Baustein 2): Gabi sagt das offen und zeigt die heutigen Notizen und
    „(unklar)“-Stellen der letzten 7 Tage.
13. **Praxiswissen** steht im Systemprompt (klein, gecacht), nicht in einem Werkzeug. Erzeugt aus der Markdown-Datei,
    ein Test prüft den Gleichlauf.
14. **Vorlesen** nur auf Knopfdruck (Browser-Sprachausgabe, deutsche Stimme, wenn vorhanden). In allen Testbrowsern
    ist die Sprachausgabe durch eine stumme Attrappe ersetzt.
15. **Alte Oberflächen-Tests ersetzt**: `tests/demo.mjs` und `tests/ablauf.mjs` prüften die alte Oberfläche; neu ist
    `tests/v2.mjs`. Alle 48 bisherigen Unit-Tests laufen unverändert weiter.
16. **Bewusst nicht gemacht**: kein Deploy der Oberfläche, kein Merge auf `main`, kein Push des Branches
    (Julius testet erst lokal). Der Worker ist deployt (Auftrag: „erst, wenn alle Tests grün sind“) – er bleibt mit der
    v1-Oberfläche auf `main` kompatibel.
17. **PDF**: „(unklar)“ bleibt in einem Textstück mit der Zeile (Textsuche im PDF bleibt intakt). In manchen PDF-Vorschauen
    sitzt die Markierung dadurch um wenige Millimeter versetzt – bewusst so gelassen, weil getrennt gesetzter Text in
    Vorschauen mit abweichender Schrift überlappen könnte.

## Getestet

| Was | Ergebnis |
|---|---|
| Unit-Tests (`cd worker && npm test`) | **95 grün**: alle 48 bisherigen unverändert + 47 neue – Werkzeug-Auswahl und -Ausführung, Gesprächsschleife mit nachgebauter Anthropic-API (SSE: Werkzeug-Runde, mehrere Werkzeuge, Ersatzmodell mitten in der Antwort, Ablehnung, leere Antwort, Endlosschleife, Rate-Limit-Fehler), Anfrage-Prüfung (Diktat nur aus `aktion.text`), NDJSON-Route inkl. Header/CORS/Logs/Lebenszeichen, feste Abläufe, Deckel für teure Werkzeuge, Abbruch, Bericht-Schema, Praxiswissen-Gleichlauf, Kern (XSS-sichere Formatierung, NDJSON-Leser, Verlauf, Datum), Demo-Assistent (Absichten, gleiche Werkzeuge und Texte wie der Worker, jede Zahl in Praxis-Antworten steht in der Wissensdatei), Bericht-PDF; seit dem Live-Gang: KI-Ausfall beim Bericht → Fehler mit Wiederholen, Fehler-Log ohne Inhalte und ohne Abbrüche, Prompt-Regeln |
| Ende-zu-Ende (`tests/v2.mjs`, Playwright) | **141 von 141 Prüfungen grün** – Demo komplett auf Handy (390 px) und Laptop (1440 px), jeweils Hell und Dunkel: Diktat per Fake-Mikrofon → Entwurf → Speichern, Frage mit Quellen, Verlaufsbericht + PDF, Heute, Praxiswissen, keine Empfehlungen, Notizordner (Suche, Bearbeiten mit Nachfrage, Löschen, PDF), Zugang mit falschem Code, kein seitliches Scrollen, keine Konsolenfehler, null Server-Anfragen im Demo-Modus; 320 px; automatisch Demo bei fehlendem Backend; Offline-Seite; Mikrofon verweigert (iPhone-Anleitung); Stopp; Neues Gespräch während einer Antwort; Vorlesen (stumm); echte lokale API mit NDJSON-Strom, Fehler + „Nochmal versuchen“, echte Spracherkennung (Whisper lokal) → Entwurf → Speichern; Safari-Engine bis zum PDF; seit dem Live-Gang zusätzlich: Hinweise verdecken weder Mikrofon noch Senden, schließende iPhone-Tastatur beim Halten (nachgebauter `visualViewport`, Gegenprobe ohne Korrektur schlägt fehl), Wegziehen → Rückgängig → Parken, Warnung bei nicht gesendeter Aufnahme, Bearbeitung und Beispiel-Chip nach dem Neuladen, leere Nachsendung, Offline-Seite mit gespeichertem Code, Vorlesen nur mit lokaler Stimme; nach der Live-Prüfung zusätzlich: Laptop-Kanten bei 1280 × 600 (Enter während einer Antwort, Karte von oben, Mikrofon-Klick, Kopieren, Seitenleiste, Suche), Handy-Kanten (Bericht beendet Diktat-Modus, Notiz öffnet oben, leere Zustände, „Bitte prüfen“ erledigen, Info-Fokus, 320-px-Badge), v1-Entwurf-Übernahme, Versionsstempel, „nicht eingerichtet“ mit Code, Demo ohne Internet |
| Screenshots | `screenshots/` – je Gerät und Modus: Start, Aufnahme, Entwurf, Antwort, Bericht, Gespräch, Notizen, Notiz, Zugang; dazu Offline, Mikrofon-Hilfe, 320 px |
| Kontraste | alle Texte ≥ 4,5 : 1 (WCAG AA) in Hell und Dunkel – Fließtext 13 : 1 bzw. 16 : 1, Knöpfe 5,5 : 1 bzw. 7,8 : 1, „(unklar)“ 6,1 : 1 |
| Worker-Build | `wrangler deploy --dry-run` baut (942 KB, gzip 173 KB) |
| Code-Review | unabhängiger Review (zweiter Agent) – Funde und Behebung siehe unten |
| Live | **v2 live seit 08.11.2026, 18:00** (auf „Ja, live schalten“): `main` per Fast-Forward auf `22d8ad1`, GitHub Pages gebaut 18:00:41. Worker 2.0.0 mit den Live-Gang-Korrekturen neu deployt: `/api/status` → `bereit: true`; fremde Herkunft 403, CORS-Vorabfrage 204, falsche Methode 405, ohne Zugangscode 401. Alle 12 ausgelieferten Dateien (unter den Adressen mit `?v=`) identisch mit `main`, 200 und richtige Typen. Danach Live-Prüfung (Workflow, fünf Blickwinkel + Gegenprüfung), siehe „Live-Gang“ |

## Review-Funde (unabhängiger Code-Review) und Behebung

| Stufe | Fund | Behoben |
|---|---|---|
| HOCH | Nach einem abgebrochenen oder gescheiterten Diktat landete dessen Text im nächsten Entwurf – ggf. bei einem anderen Patienten (der Server fasst aufeinanderfolgende Nutzer-Nachrichten zusammen) | Diktat geht ausdrücklich als `aktion.text` mit und nur das wird strukturiert; „letzte Nachricht“ = einzelne letzte Nachricht; gescheiterte Wortwechsel fallen ganz aus dem Verlauf. Tests dazu |
| MITTEL | „Nochmal versuchen“ tat nichts bei Fehlern mitten im Strom | Anfrage wird bei jedem Fehler gemerkt; E2E prüft HTTP-Fehler und Fehler im Strom |
| MITTEL | „Mit Server verbinden“ lud im automatischen Demo-Modus nicht neu | lädt jetzt wirklich neu (ohne `?demo=1`) |
| MITTEL | Während der Spracherkennung konnte man senden → Transkript verloren; Modus wurde erst nach der Erkennung gelesen | Modus wird beim Loslassen gemerkt, Senden und Chips sind während der Erkennung gesperrt, Notfall: Text landet im Eingabefeld |
| NIEDRIG | Bearbeitungen in der Entwurfskarte wurden überschrieben, solange Gabi noch schrieb | Speichern/Bearbeiten erst nach der Antwort; Getipptes bleibt beim Neuzeichnen und beim Wechsel in den Notizordner erhalten |
| NIEDRIG | Original-Diktat auf der Karte nicht sichtbar | aufklappbar auf der Karte |
| NIEDRIG | Eine Anfrage konnte viele teure KI-Aufrufe auslösen; Abbruch wurde nicht geprüft | höchstens 3 Entwürfe/Berichte je Anfrage, zählen im KI-Limit; nach Abbruch keine weiteren Werkzeuge |
| NIEDRIG | Kein Lebenszeichen bei langen Werkzeugen | `{t:"puls"}` alle 15 s |
| NIEDRIG | „Dazu habe ich nichts gespeichert.“ unter einer Karte | entfällt, wenn eine Karte gezeigt wurde |
| NIEDRIG | Ohne Schlüssel: Hinweis „von Hand ausfüllen“ passt nicht zu v2 | eigene Meldung im Gespräch (v1-Text für die Live-Seite unverändert) |

Selbst gefunden (Screenshots/eigene Durchsicht): Aufnahme-Anzeige und Diktat-Pill sprengten auf dem Handy die Breite
(Grid-Spalte wuchs mit), graue statt dunkle Titel der Schnellaktionen (zu breiter Selektor), fehlender Abstand zwischen
Nachrichten, doppelter Fokusring bei falschem Code, Geisternachricht nach „Neues Gespräch“ während einer Antwort,
Diktat-Modus blieb nach dem Entwurf aktiv, lokaler Betrieb startete fälschlich die Demo, zu blasser Hinweistext
(Kontrast 2,4 : 1 → jetzt ≥ 4,5 : 1). Alles behoben und in den Tests abgedeckt.

## Live-Gang (08.11.2026, auf „Ja, live schalten“)

**Vorabprüfung** (Workflow mit drei unabhängigen Prüfern – Öffentlich/Datenschutz, Produktion, Kunden-Risiko – plus
Gegenprüfung je Fund; danach ein zweiter Workflow, der den Korrektur-Diff adversarial prüft). Ergebnis Öffentlich-Check:
keine Secrets, keine echten Patientendaten, Screenshots nur mit Demo-Daten. Umgesetzt vor dem Push:

| Fund | Umsetzung |
|---|---|
| Browser-Cache (10 min) mischt v1- und v2-Dateien → App hängt (bestätigt, wichtig) | `?v=2.0.0` an CSS und allen Skripten; alte v1-Seite mit neuem Skript lädt sich einmal frisch |
| Echter Claude-Weg nie gelaufen, Fehler wären unsichtbar (bestätigt, wichtig) | API-Fehler werden ohne Inhalte geloggt (Status, Fehlerart, Request-ID → `npx wrangler tail`); Rückweg zu v1 siehe unten |
| Vorlesen konnte Online-Stimmen nutzen (Text ginge an Google/Microsoft) | nur noch lokale deutsche Stimmen, sonst Hinweis |
| Falsches Pronomen „Zusammenfassung … ihn“ | „sie“ bei Zusammenfassungen |
| iPhone zoomt in Textfelder unter 16 px | 16 px in allen Feldern auf Touch-Geräten |
| Eingabetaste heißt auf dem Handy „senden“, macht aber Zeilenumbruch | Taste heißt dort „Zeilenumbruch“; Tastatur schließt beim Mikrofon und nach dem Senden |
| Diktat konnte verloren gehen (8-s-Toast, Wegziehen ohne Rückgängig, Hintergrund-Upload) | bleibende Karte „nicht angekommen“ mit „Nochmal senden“; Verwerfen erst nach 140 px nach links/oben und mit „Rückgängig“; Upload erst, wenn die App sichtbar ist |
| Demo ersetzt die echte Aufnahme ohne Hinweis; echte Adresse fiel bei Serverproblemen still in die Demo | Hinweis + „Beispiel“ an der Blase; auf gabi.automatilabs.de Offline-Seite mit „Demo ansehen“ |
| Patientenliste lädt nicht → ewige Platzhalter | Fehler mit „Nochmal versuchen“ |
| Neuladen mitten in einer Antwort: leere/halbe Blase, Diktat-Modus bleibt | „Antwort wurde unterbrochen“ mit „Nochmal versuchen“; Modus wird nicht übernommen; begonnene Bearbeitung bleibt |
| Prompt: App-Hinweise im Verlauf nachahmbar, Smalltalk-Regel, Verwechslung mit Praxismanagerin Gabi Diem | drei Regeln ergänzt |
| Bericht für Patienten ohne Notizen → rote Fehlerbox | Patienten ohne Notiz in der Auswahl gesperrt; fachliche Hinweise als normale Antwort |
| Alte v1-Links (#/aufnahme, #/ordner/…) | werden umgeleitet |
| CPU-Zeit im Worker (Gratis-Tarif) | Aufnahme-Prüfung nur noch über Anfang und Ende |
| Kleine Texte („1 Notizen“, „Neu strukturieren“, „Daten sicher gespeichert“), Notch im Querformat | korrigiert |

**Zweite Prüfung (nur der Korrektur-Diff, je Bereich ein Prüfer + Gegenprüfung):**

| Fund | Umsetzung |
|---|---|
| KI-Ausfall bei „Bericht erstellen“ kam als normale Antwort ohne „Nochmal versuchen“ (Regression aus der ersten Runde) | Ausfall, Überlastung und unlesbare Antwort gelten als technischer Fehler → rote Box mit „Nochmal versuchen“; Ablehnung bleibt ein fachlicher Hinweis; Tests |
| Bericht-Fehler doppelt geloggt, einmal fälschlich als „gespraech“ | ein Log-Eintrag je Fehler mit richtigem Ort |
| Zeitüberschreitung und Verbindungsfehler hießen im Log nur „Error“; jeder Stopp-Tipp sah aus wie ein KI-Ausfall | Abbrüche werden nicht geloggt; „timeout“ / „verbindung“ benannt; ein gemeinsamer Helfer für Gespräch, Bericht und Notiz |
| Regel 10 (Fragen zur Bedienung ohne Werkzeuge) lud zu erfundenen Bedienhinweisen ein | Prompt-Abschnitt BEDIENUNG mit den echten Knöpfen und Gesten; was dort nicht steht: „weiß ich nicht“ |
| iPhone: Schließt sich beim Halten des Mikrofons die Tastatur (das Textfeld verschwindet während der Aufnahme), wandert der sichtbare Ausschnitt – ein ruhiger Finger zählte als „nach oben weggezogen“ und das Diktat wurde verworfen | Wischen wird in Bildschirm-Koordinaten gemessen (`visualViewport`); E2E-Test mit nachgebautem Ausschnitt |
| Nachgeschickte Aufnahme kam leer zurück → Karte hing auf „Sende …“ | Karte zeigt „nichts verstanden“, nur „Verwerfen“; Karte bleibt nie auf „Sende …“ stehen |
| Begonnene Bearbeitung einer Entwurfskarte wurde nie wirklich gesichert (bzw. „Abbrechen“ kam nach dem Neuladen zurück) | wird beim Tippen, Öffnen und Abbrechen gesichert, beim Wechsel in den Hintergrund sofort |
| „Rückgängig“ nach dem Verwerfen konnte parallel zu einer laufenden Erkennung starten | ist Gabi beschäftigt, wartet die Aufnahme als Karte mit „Jetzt senden“ |
| Nicht gesendete Aufnahmen: blieben nach „Neues Gespräch“ im Speicher, fehlten in allen Warnungen | werden beim Leeren freigegeben; Warnung bei „Neues Gespräch“, „Abmelden“ und beim Schließen des Tabs |
| Demo: „Beispieldiktat nehmen“ nach dem Neuladen eine Sackgasse | Chip nach dem Neuladen gesperrt |
| „Ein Entwurf ist … und gehen verloren.“ (Abmelden) | Einzahl korrigiert |
| Selbst gefunden beim Testen: Auf dem Laptop (1024–1920 px) lagen Hinweise unten rechts genau über Mikrofon und Senden – solange die Maus darauf lag, blieben sie stehen | Hinweise auf dem Laptop unten links (Seitenleiste + freier Rand); E2E prüft, dass Mikrofon und Senden frei bleiben |

Bewusst nicht gemacht: dauerhafte Worker-Logs (`[observability]`) – das speichert Anfrage-Metadaten bei Cloudflare und ist eine
Datenschutz-Entscheidung für Julius; `npx wrangler tail` zeigt Fehler live auch ohne. Die localhost-Freigabe im Worker bleibt,
damit `npm run vorschau` gegen den Live-Worker funktioniert.

**Live-Prüfung nach dem Umschalten** (Workflow mit fünf Blickwinkeln – Technik, iPhone, Laptop, Übergang v1 → v2,
Texte aus Kundensicht – und je einer Gegenprüfung; strikt ohne Zugangscode und ohne /api-Anfragen außer `/api/status`,
weil der Worker jede Anfrage ohne richtigen Code als Fehlversuch für die IP zählt). Umgesetzt (`?v=2.0.1`):

| Fund | Umsetzung |
|---|---|
| Unter gabi.automatilabs.de waren auch interne Notizen (Log, README, MORGEN/NACHTLOG), Worker-Quellen, Tests und Screenshots abrufbar (`.nojekyll` → Pages lieferte alles aus) | `_config.yml` mit `exclude` statt `.nojekyll` – Pages liefert nur noch die App; das öffentliche Repo bleibt, wie es ist |
| App lief eingebettet in fremden Seiten (GitHub Pages kann kein `frame-ancestors`/HSTS setzen) | startet in einem fremden Rahmen nicht, zeigt nur „Gabi in einem eigenen Tab öffnen“; HSTS bleibt eine Grenze von GitHub Pages |
| Demo: TP-03 (LWS, Patientin) bekam ein HWS-Diktat; neue Test-Patienten auch | eigenes LWS-Beispiel, neutrales Beispiel für unbekannte Beschreibungen |
| Satz nach dem Entwurf „Eine Stelle habe ich als „(unklar)“ markiert.“ stimmte oft nicht (gezählt werden die Punkte unter „Bitte prüfen“) | „Schau dir bitte den Punkt / die N Punkte unter „Bitte prüfen“ an.“ – Worker und Demo gleich |
| Demo: „Danke“, „Tschüss“, „Wie geht's dir?“ → „Dazu habe ich nichts gespeichert.“; „Wer ist Gabi Diem?“, Rezept, Trainingszeiten, Vereine falsch oder vorbei beantwortet; „Fasse … zusammen“ ergab Verlaufsbericht | eigene kurze Antworten; Muster und Texte aus dem Praxiswissen ergänzt (Rezept: „steht nicht auf der Website“) |
| Demo sagte nirgends, dass die Antworten vorbereitet sind | Zugang, Seitenleiste und Info-Dialog: „vorbereitete Antworten, ohne KI“ |
| Demo „Was steht heute an?“ klang nach Zusage („Termine kommen mit der Anbindung …“) | „Termine und Kalender sind in der Testversion noch nicht angebunden.“ |
| „(laut Notiz)“ hinter Diagnosen (aus Notara) – für Physios unverständlich; PDF sagte „ohne Diagnosen“ über einer Diagnose | Prompt: ärztliche Diagnosen immer mit Quelle („Diagnose laut Verordnung: …“), nie als eigene Feststellung; PDF: „Gabi ergänzt keine eigenen Diagnosen oder Empfehlungen“ |
| Kleine Texte: „bearbeitet Heute“, „Sichern“ neben „Speichern“, „Erneut“ neben „Nochmal versuchen“, „in 1 Sekunden“, „Gabi ist ausgelastet“ in Gabis eigener Blase, „(?)“, doppelte Klammern im kopierten Bericht, „gefunden zu …“, Suchbegriff klein, „Bitte prüfen (offene Punkte)“ im PDF, „Quellen“ zeigte alle gefundenen Notizen | korrigiert; Überschrift heißt jetzt „Gefundene Notizen“ |

Zweite Welle derselben Prüfung (Laptop und Übergang v1 → v2), umgesetzt in `?v=2.0.2`:

| Fund | Umsetzung |
|---|---|
| **Laptop (hoch):** Enter während einer Antwort wirkte wie „Stopp“ – Doppel-Enter brach ab; beim Vorausschreiben ging der Diktat-Entwurf verloren und die nächste Frage wurde zum Diktat | Enter sendet nur, wenn Gabi fertig ist; abbrechen nur über den Stopp-Knopf |
| Niedrige Laptop-Bildschirme (600–770 px): neuer Entwurf/Bericht „von unten“, Kopf und Befund weggescrollt | passt die Antwort nicht ganz hinein, wird ihr Anfang gezeigt |
| Mikrofon nur angeklickt: Hinweis „gedrückt halten“ erschien unten links, weit weg | Mikrofon-Hinweise stehen direkt unter der Eingabezeile |
| Kopieren unter einem Entwurf kopierte nur den Einleitungssatz | kopiert Entwurf bzw. Bericht mit |
| Suchtreffer: Kürzel und Datum mal mittig, mal rechts; Seitenleiste lief bei langen Beschreibungen seitlich über; kein Abstand über der Notizliste | Layout korrigiert (nur „zu prüfen“ rechts, `minmax(0,1fr)`, Abstand) |
| Dunkelmodus: „Löschen“ beim Hovern 2,28 : 1; Karten hoben sich beim Hovern nicht | 7,6 : 1; Animation überschreibt den Hover nicht mehr |
| Tastatur: nach einer Aufnahme per Leertaste verlor das Mikrofon den Fokus; Suche leeren + schnell wegklicken zeigte die falsche Ansicht | Fokus kommt zurück; verspätete Suche zeichnet nicht über eine neue Seite |
| **Übergang:** ungespeicherter v1-Entwurf verschwand beim Umstieg ohne Hinweis | wird beim Start einmal als Entwurfskarte übernommen („Aus der Vorversion …“) |
| Cache-Schutz griff nur bei v1 → v2; ein Hotfix (Pages ignoriert `?v=`) oder der Rückweg konnte eine leere Seite zeigen; das Merkzeichen wurde nie gelöscht | Versionsstempel: `VERSION` in app.js muss zum `?v=` passen (Test), sonst einmal je Version neu laden, danach Hinweis „Neu laden“ statt leerer Seite |
| „Server nicht eingerichtet“ schaltete auf der echten Adresse still in die Demo, auch mit gespeichertem Code | Hinweisseite „Gabi ist gerade nicht bereit“ mit „Demo ansehen“ |
| „Demo ansehen“ ohne Internet führte auf die Fehlerseite des Browsers | Demo startet im selben Tab |
| **iPhone:** „Bericht“ im Notizordner ließ einen offenen Diktat-Modus stehen – die nächste Eingabe wurde ein Entwurf beim falschen Patienten | „Bericht“ beendet den Modus |
| „Bitte prüfen“ / „1 zu prüfen“ ließ sich nie erledigen | beim Bearbeiten als Feld – Geklärtes löschen |
| Unter 360 px fehlte der Knopf „Testversion“ – kein Abmelden, keine Info | bleibt sichtbar (kleiner) |
| Nach dem Neuladen schimmerten beantwortete Patienten-Auswahlen als Platzhalter | werden mit der Liste neu gezeichnet |
| Notiz aus dem Gespräch öffnete unten (Datum, Patient nicht sichtbar); leeres Gespräch im Querformat startete unter dem Kopf; nach dem Neuladen lag „Nochmal versuchen“ unter der Eingabezeile | Notiz öffnet oben; leeres Gespräch oben; die App steuert das Scrollen selbst |
| Leere Zustände im Notizordner: Seite 20 px seitlich verschiebbar; „Suche löschen“ ließ das × stehen | korrigiert |
| Verzögerte Suche (250 ms) bzw. verspätet geladene Übersicht überschrieben die gerade geöffnete Seite oder die Suchtreffer | prüfen vor dem Zeichnen, ob die Ansicht noch passt (der zweite Fall fiel beim Testen auf) |
| Toasts oben verdeckten „Alle Test-Patienten“ bzw. den Kartenkopf | Tipps gehen durch, nur der Knopf im Toast fängt sie |
| „Neuer Test-Patient“ in der Bericht-Auswahl (Sackgasse); Info-Dialog mit Fokus auf „Zurücksetzen“/„Abmelden“ | entfernt; Fokus auf „Verstanden“ |
| Demo: „Notiz suchen“ mit „Termin“/„Diagnose“/„Bericht“ sprang in andere Abläufe; Bedienfragen („Wie verwerfe ich eine Aufnahme?“) unbeantwortet | Such-Modus sucht immer; Antworten aus denselben Fakten wie BEDIENUNG |

Bewusst gelassen: englische Fehlernamen bei Mikrofonproblemen (helfen bei der Fehlersuche), „Test-Patient“ im
Ordnerkopf (kein Platz bei 320 px), kontextabhängige Platzhalter; in der Demo der Zeitraum („letzte Woche“) – die echte
Gabi versteht ihn, die Demo nimmt die neueste Notiz; „Gefundene Notizen“ zeigt alles, was das Werkzeug geliefert hat.
Rückweg zu v1: Wer die Seite in den 10 Minuten davor
geladen hat, kann einmal eine leere Seite sehen (v1 kennt den Versionsstempel nicht) – einmal neu laden hilft.

**Rückweg zu v1** (falls der echte Claude-Weg am Montag hakt):
`git revert --no-commit e9968ff..HEAD && git checkout HEAD -- _config.yml && git rm -f .nojekyll && git commit -m "Zurück zu v1"`
und pushen. Die beiden Zwischenschritte halten die internen Dateien weiter unter Verschluss (sonst brächte der Revert
`.nojekyll` zurück und alles wäre wieder abrufbar). Der Worker 2.0 bleibt und bedient v1 weiter; Browser-Speicher von v1
und v2 vertragen sich (offene v2-Entwurfskarten gehen in v1 allerdings verloren – vorher speichern).

## Offen

1. **Echte Claude-Antworten noch nicht live erprobt** (Gespräch mit Werkzeugen, Bericht, Diktat): lokal fehlt der
   Schlüssel, live fehlt mir der Zugangscode. Getestet ist alles gegen eine nachgebaute Anthropic-API. → Julius: auf
   https://gabi.automatilabs.de mit dem echten Code eine freie Frage, einen Bericht und ein Diktat; parallel zeigt
   `cd worker && npx wrangler tail` Fehler (nur Status, Art, Request-ID – keine Inhalte).
2. **Cloudflare-Tarif prüfen**: Im Gratis-Tarif gibt es 10 ms CPU je Anfrage. Das Gespräch liest einen Antwortstrom;
   das sollte reichen, ist aber live noch nicht gemessen. Falls Antworten abbrechen: Workers Paid (5 $/Monat).
3. **Echtes iPhone**: Push-to-Talk, Tastatur und das unten klebende Eingabefeld nur in der Safari-Engine und mit
   Handy-Emulation getestet.
4. **Praxiswissen bestätigen** (in `knowledge/physioworks.md` als „TODO prüfen“): Abrechnung/Kassen, Öffnungszeiten der
   Praxen, welche Leistung an welchem Standort, Preis und Ort Youngster Training, wer Akupunktur macht, Preise und Rezept.
5. **Geschwindigkeit**: Opus 5.5 mit effort „low“. Falls es im Alltag zu langsam wirkt, wäre Sonnet 5.5 die schnellere
   Wahl – Entscheidung bei Julius.
6. ~~Merge auf `main`~~ – erledigt am 08.11.2026 (v2 live). Rückweg zu v1 siehe „Live-Gang“.
7. Später: Terminkalender/Praxissoftware (Baustein 2), Chatverlauf über die Sitzung hinaus, Konten statt gemeinsamem Code.
