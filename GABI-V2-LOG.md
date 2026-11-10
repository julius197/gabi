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
| Live | **v2 live seit 08.11.2026, 18:00** (auf „Ja, live schalten“), seit 19:00 als **2.0.2** (`main` = `58a3b0d`). Worker 2.0.0 mit allen Korrekturen deployt: `/api/status` → `bereit: true`; fremde Herkunft 403, CORS-Vorabfrage 204, falsche Methode 405, ohne Zugangscode 401. Alle ausgelieferten App-Dateien identisch mit `main` (200, richtige Typen), interne Dateien 404. **Live-E2E gegen gabi.automatilabs.de: 130 von 130** (ohne den Teil mit lokaler API, ohne Zugangscode). Live-Prüfung: 50 Funde gemeldet, 44 bestätigt, einer hätte Montag blockiert (Enter brach Antworten ab) – alle bestätigten sind in 2.0.1/2.0.2 behoben und auf der Live-Seite nachgemessen |

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

## v2.1 – Feinschliff (08.11.2026, live seit 09.11.2026)

Auftrag: 2 Bugfixes (Glow, Flackern), 1 Feature (Gesprächsverlauf wie bei ChatGPT), 1 Hilfsdatei (Testdaten zurücksetzen).
Nur Testdaten. Worker unverändert (2.0.0), Oberfläche 2.1.0.

### A – Glow mit harten Kanten
- **Ursache (im Code belegt):** `.leer { overflow: hidden }` und darin `.glanz` mit 120 % Breite. Der Verlauf endete am
  Rand seiner Box, die Box ragte über `.leer` hinaus, `overflow: hidden` schnitt ihn links und rechts gerade ab.
  Gemessen in der alten Version: Helligkeitssprung von 4–5 Stufen genau an den Rändern von `.leer` (bei 390/768/1440 px).
- **Fix:** Schein als `::before` (`.leer::before`, `.zugang::before`), `z-index: -1` im eigenen Stapel (`isolation:
  isolate`), `pointer-events: none`, Box größer als der Inhalt (bis 680 px), aber innerhalb ihres Behälters. Kein
  `overflow: hidden` mehr an `.leer`, deshalb kein seitliches Scrollen. Der Verlauf hat 11 Stufen auf einer Kosinus-Kurve,
  der letzte Stopp hat Deckkraft 0. Die erste, lineare Fassung mit 4 Stufen zeigte im hellen Modus Ringe an den Knicken
  der Kurve. Die Kosinus-Kurve läuft flach aus.
- **Gemessen** (Pixel für Pixel über die ganze Breite, Text ausgespart): größter Schritt neu 1–2 Stufen (Rundung),
  vorher 4–5 an den Kanten. Geprüft bei 390/768/1440 px, hell und dunkel, für „Noch keine Notizen“,
  „Nichts gefunden“ und die Zugangsseite. Die Fehlerzustände nutzen dasselbe `.leer`.
- **Hinweis:** Im hellen Modus sind beim sehr hellen Grün feine 8-Bit-Abstufungen zu ahnen (Farbtiefe, war vorher auch
  so). Das sind keine Kanten. Das Begrüßungsgespräch hatte nie einen Schein, da gab es nichts zu korrigieren.

### B – Flackern beim Wechsel in den Notizordner
- **Ursachen (im Code belegt):**
  1. `.ansicht { animation: einblenden }`: Bei jedem `hidden → sichtbar` startete die Animation neu. Die ganze Ansicht
     sprang auf unsichtbar und blendete wieder ein, bei jedem Wechsel Gespräch ↔ Notizen.
  2. Die Übersicht baute bei jedem Besuch Kopf, Suche und Platzhalter neu auf und ersetzte danach alles durch die Karten.
  3. Jede Karte hatte `animation: auftauchen` und flog bei jedem Neuaufbau neu ein.
  4. Die Patientenseite zeigte immer zuerst Platzhalter (bei echter Leitung sichtbar), dann die Karten.
  5. Die Seitenleiste wurde bei jeder Nachricht neu gezeichnet, das Gespräch bei jeder Rückkehr komplett neu aufgebaut.
- **Fix:**
  - Einblenden nur beim ersten Erscheinen nach dem Ladekreis; Karten tauchen nur beim ersten Betreten einer Ansicht auf
    (`erstesMal`).
  - `ersetzen()` zeichnet nur, wenn sich der Inhalt geändert hat: ein Aufbau pro Datenstand.
  - Zwischenspeicher für Patienten, Notizlisten und Notizen: Was einmal geladen wurde, erscheint sofort und wird im
    Hintergrund aufgefrischt.
  - Der neue Inhalt wird erst fertig aufgebaut, dann wird umgeschaltet. Der alte Inhalt bleibt bis zu 150 ms stehen,
    erst danach kommen Platzhalter in der Höhe der echten Karten (`mitFrist`).
  - Das Gespräch wird nur nach einem Wechsel neu aufgebaut. „Bewegung reduzieren“ gilt weiter.
- **Gemessen** (10 schnelle Runden mit je 8 Wechseln: Übersicht ↔ Gespräch direkt, Patient, Gespräch, mit „Zurück“ wieder
  zum Patienten, zurück zur Übersicht; gezählt in jedem Bild):

  | 80 Wechsel | v2.0.2 (main) | v2.1.0 |
  |---|---|---|
  | Bilder mit halb durchsichtiger Ansicht | 395 von 719 (Laptop) · 514 von 1003 (Handy) | 0 |
  | Erneute Einblend-Animationen (Ansicht, Karten, Nachrichten) | 213 · 219 | 0 |
  | Neuaufbau im Notizordner · Gespräch · Seitenleiste | 80 · 30 · 60 | 20 · 0 · 0 |
  | Eine Antwort mit „Bewegung reduzieren“: Einblendungen | 23 (blinkt bei jedem Bild) | 2 (die zwei neuen Nachrichten) |
  | Platzhalter sichtbar · Springen derselben Karte | 0 · 0 (Demo ohne Wartezeit) | 0 · 0 |

  Die Prüfung fand dabei noch einen Fall, den die erste Fassung der Messung verdeckt hatte: CSS-Animationen starten bei
  jedem `hidden → sichtbar` neu. Ohne Neuaufbau wären in v2.1 neue Nachrichten und erstmals gezeigte Karten bei jeder
  Rückkehr erneut eingeblendet. Deshalb setzt `beruhigen()` beim Verlassen einer Ansicht alles Gezeigte auf „fertig“.
  „Bewegung reduzieren“ erzwang das Einblenden mit `!important` und schlug so „schon gezeigt“, deshalb blinkte die
  laufende Antwort. Die Statuszeile blendet nur bei neuem Status ein.

  Mit echter Leitung: Antwortet der Server in 60 ms, gibt es keinen Platzhalter. Bei 700 ms bleibt der alte Inhalt
  150 ms stehen, dann kommt der Platzhalter. Ein zweiter Besuch kommt sofort aus dem Zwischenspeicher, auch bei
  langsamer Leitung.

### C – Gesprächsverlauf wie bei ChatGPT
- **Speicher nur auf dem Gerät:** `gespraeche.js`, IndexedDB „gabi“ (Demo: „gabi-demo“), Stores `meta` (Liste ohne Inhalt)
  und `inhalt`. Ohne IndexedDB geht es mit localStorage (`gabi.` bzw. `gabi.demo.`), notfalls nur im Arbeitsspeicher, dann
  mit Hinweis. Eine Schreibprobe beim Start erkennt private Fenster, die nicht schreiben lassen.
  **Nie Worker oder Supabase.** In der Adresse steht nur die ID (`#/gespraech/<id>`). Der Seitentitel bleibt bewusst fest:
  Ein Gesprächstitel landete sonst im Browserverlauf und in dessen Synchronisierung.
- **Bedienung:**
  - Laptop: Seitenleiste mit „Gespräche“ (eigener Scrollbereich), darunter die Test-Patienten (höchstens 26 % der Höhe).
  - Handy und Tablet: ☰ öffnet die Schublade (`<dialog>`). Sie schließt mit Esc, Tipp daneben oder Eintrag antippen;
    beim Schließen geht der Fokus zurück aufs Menü.
  - Gruppen: Heute, Gestern, Letzte 7 Tage, Älter. Sortiert wird nach letzter Aktivität; Kalendertage gelten auch über
    die Zeitumstellung. Das aktive Gespräch ist grün hinterlegt.
  - Umbenennen per Stift: Enter übernimmt, Esc bricht ab, leer bedeutet keine Änderung, die Reihenfolge bleibt.
  - Löschen fragt mit Titel nach, auch „Alle Gespräche löschen“. Offene Entwürfe werden in der Rückfrage genannt.
- **Titel** lokal aus der ersten Nutzernachricht, höchstens 40 Zeichen, an der Wortgrenze gekürzt; „Diktat TP-01: …“,
  „Suche: …“.
- **Leere Gespräche** (nur Gabis Rückfragen) werden nicht gespeichert. Gespeichert wird ab der ersten Nachricht, einem
  Entwurf (z. B. aus v1) oder einer zurückgestellten Aufnahme.
- **Limit 50:** Die am längsten unbenutzten fliegen raus, mit Hinweis. Das offene Gespräch nie, Gespräche mit offenem
  Entwurf zuletzt.
- **Übernahme v2.0:** Das bisherige Gespräch des Tabs (sessionStorage) wird erster Eintrag und bleibt offen. Die alte
  Kopie wird erst nach erfolgreichem Speichern gelöscht. Eine unterbrochene Antwort zeigt „Nochmal versuchen“.
- **Wechsel während einer Antwort:** Die Antwort wird abgebrochen und bleibt im alten Gespräch als „Abgebrochen.“.
  Jede Antwort ist fest an ihr Gespräch gebunden (keine Geisternachrichten), der Diktat-/Such-Modus endet beim Wechsel.
  Kommt eine Aufnahme erst nach dem Wechsel an, wartet sie im eigenen Gespräch mit „Jetzt senden“ (nie im falschen).
  Speichern eines Entwurfs bleibt am eigenen Gespräch.
- **Speichern:** sofort, also ohne Zeitfenster, in dem ein Neuladen etwas verliert. Nur Tippen in einer Karte wird
  gebündelt (300 ms), beim Verlassen und im Hintergrund wird alles sofort gesichert.
- **Mehrere Tabs:** BroadcastChannel. Neue Gespräche erscheinen im anderen Tab; dort Gelöschtes wird hier nicht wieder
  angelegt. Wird das offene Gespräch woanders gelöscht, zeigt dieser Tab ein leeres und einen Hinweis.
- **Abmelden** fragt „Gespräche auf diesem Gerät auch löschen“ (Häkchen vorbelegt). Mit Häkchen wird die Ablage
  geleert, ohne bleiben die Gespräche. Demo-Zurücksetzen löscht auch die Demo-Gespräche. Info-Dialog: „Gespräche
  werden nur auf diesem Gerät gespeichert.“
- **Kopfzeile Handy:** ☰ links. „Notizen“ wird erst ab 440 px ausgeschrieben, nichts wird gequetscht. Unter 360 px
  steht „Neues Gespräch“ nur in der Schublade, so passt alles bis 320 px.
- **Geändertes Verhalten:** „Neues Gespräch“ fragt nicht mehr nach (nichts geht verloren). Aus dem Notizordner
  „Diktieren“/„Bericht“ öffnet das offene Gespräch, wie bisher.

### Unabhängige Prüfung (Workflow: 5 Blickwinkel, je ein Gegenprüfer, der jeden Fund zu widerlegen versucht)

26 Funde, **25 bestätigt**: 1 Blocker, 2 hoch, 10 mittel, 12 niedrig. Ein Fund wurde verworfen: „Alle löschen“ mit
36 px sei zu klein, das ist kein Fehler. Am Handy hat es trotzdem 44 px bekommen. Alle 25 sind behoben, nachgestellt mit
den Skripten der Prüfer.

| Blickwinkel | Bestätigt | Wichtigste Funde → Behebung |
|---|---|---|
| Zustand | 5 | **Blocker:** Kam die Spracherkennung erst nach „Abmelden + Gespräche löschen“ zurück, brachte sie das gelöschte Gespräch samt sendbarer Aufnahme wieder → Sitzungszähler (`verwaist`): nichts aus einer früheren Sitzung oder einem gelöschten Gespräch wird gespeichert oder geparkt · Zurück auf einen alten „#/“-Eintrag legte ein neues Gespräch an und brach die laufende Antwort ab → „#/“ zeigt das offene Gespräch, neue Gespräche legen nur die Knöpfe an · zwei Tabs mit einer Entwurfskarte in Bearbeitung überschrieben sich → `zusammenfuehren` · Aufnahme in gelöschtes Gespräch geparkt · v1-Diktat benannte ein bestehendes Gespräch um → eigenes Gespräch |
| Datenschutz | 5 | Löschen und Abmelden ließen Reste in localStorage/sessionStorage → `resteLoeschen`; hing IndexedDB dabei, bleibt eine Marke, der nächste Start löscht zuerst · nach „Alle löschen“ in Tab A speicherte Tab B sein neues Gespräch nie · zwei Tabs überschrieben sich gegenseitig (auch den Namen) · v2.0-Übernahme verwarf ein dort liegendes v1-Diktat · Abmelden ließ Demo-Gespräche liegen |
| Ruhe (B/A) | 6 | **hoch:** Karten (und Nachrichten) blendeten bei jeder Rückkehr neu ein, weil CSS-Animationen bei `hidden → sichtbar` neu starten → `beruhigen()` · „Bewegung reduzieren“ ließ die laufende Antwort blinken (`!important`) · im Bearbeiten-Modus verlassene Notiz blieb später hängen · Platzhalter zu niedrig (78 statt 102 px, Zeile fehlte) · Suche ohne Treffer zeigte kurz Platzhalter |
| Handy/Barrierefreiheit | 7 | **hoch:** Patienten in der Seitenleiste bei vielen Gesprächen zusammengedrückt (jetzt alle 3 sichtbar bei 50 Gesprächen und 1366 × 768) · Umbenennen per Wegklicken verschluckte den Klick und stahl den Fokus · Dunkelmodus: Titel schien durch Stift/Papierkorb · Hinweise lagen hinter der Schublade (jetzt Popover) · Kontrast des Fußtexts 2,4 : 1 → 4,9 : 1 · Fokus ging nach Öffnen/Löschen verloren · zweimal `aria-current="page"`, Überschriften |
| Rückschritte und D | 2 | Umschalter in der Kopfzeile ohne Namen bei 390–439 px → `aria-label` · `reset_test.sql` vergab neue Patienten-IDs, offene Entwürfe ließen sich danach nicht speichern → feste IDs aus `demo.js` (in Postgres echt geprüft, auch auf dem heutigen Live-Stand mit zufälligen IDs) |

**Zweite Runde (nur die Korrekturen, 7 Agenten):**
- Drei Agenten stellten die 25 Funde am korrigierten Stand nach. Ergebnis: vollständig behoben bis auf 8 Reste, die
  sich teils überschneiden.
- Zwei Agenten suchten neue Fehler, die die Korrekturen selbst eingebaut hatten. Sie meldeten 11, alle 11 bestätigt,
  keiner schwerer als „mittel“.
- Je ein Gegenprüfer hat jeden Fund zu widerlegen versucht.

Alles behoben und mit den Skripten der Prüfer erneut nachgestellt, alles grün:
- Ein Hinweis über der Schublade lag genau über „Neues Gespräch“, ein Tipp ging hindurch. Seine Knöpfe waren über
  Dialogen ohne Funktion. → Hinweise kommen in den offenen Dialog, in der Schublade unten.
- Der Bearbeiten-Zustand einer Karte und „Beispieldiktat benutzt“ sprangen auf den anderen Tab über. → Das ist jetzt
  Zustand des einzelnen Tabs.
- Ein Entwurf ließ sich in zwei Tabs doppelt speichern. → Vor dem Speichern wird nachgesehen, ob er schon gespeichert ist.
- Die Notfall-Kopie brachte ein in einem anderen Tab Gelöschtes zurück oder überschrieb Neueres. → Dauerhafte
  Sperrliste, Zeitpunkt von „Alle löschen“, Zeitstempel je Speichern.
- Abmelden ohne Häkchen ließ eine spät ankommende Aufnahme für die nächste Person sendbar. → Die Sitzung endet immer.
- Fiel IndexedDB genau beim Abmelden aus, blieben Gespräche liegen. → Marke, der nächste Start löscht zuerst, mit Hinweis.
- Ein offener Demo-Tab erfuhr nichts vom Löschen beim Abmelden.
- Die Liste blieb nach dem Umbenennen veraltet.
- Eine Notiz hing nach Abmelden und Anmelden aus dem Bearbeiten-Modus.
- „Suche fehlgeschlagen“ zeigte kurz einen Platzhalter, und bei derselben Suche nach dem Löschen stand die Übersicht
  da wie ein Ergebnis.
- Der Notiz-Platzhalter am Handy ist jetzt 95 px hoch (Versatz höchstens 22 statt 76 px).
- Der Fokus blieb erhalten, wenn das Fenster bei offener Schublade breit gezogen wird.

Zusätzlich selbst gefunden und behoben:
- Umbenennen oder Löschen mit sofortigem Neuladen ging verloren, weil IndexedDB beim Entladen offene Schreibvorgänge
  abbricht → Notfall-Kopie in sessionStorage (5 von 5 Fällen erhalten).
- Speichern jetzt sofort statt mit 150 ms Verzögerung.
- Kopfzeile bei 320–390 px gequetscht.
- Glow im hellen Modus mit Ringen → Kosinus-Kurve.

### D – Testdaten zurücksetzen
`supabase/reset_test.sql` wird aus derselben Quelle wie `seed_test.sql` erzeugt (`node dev/seed_erzeugen.mjs`). Ein Test
prüft, dass beide gleich bleiben. Oben steht zweimal die Warnung „ACHTUNG: löscht ALLE Daten. Nur für Testumgebung. Vor
Ausführen Bestätigung durch Julius.“ Alles läuft in einer Transaktion: erst löschen, dann der Seed-Stand.
**Echt ausgeführt** in einem lokalen Wegwerf-Postgres (Supabase-Image 17.11, nur 127.0.0.1, danach entfernt):
schema → seed → zusätzlicher Patient, zusätzliche und gelöschte Notiz → reset. Ergebnis: genau TP-01/02/03 mit je 2
Notizen und festen IDs; ein zweiter Lauf ergibt dasselbe. Gegen die Live-Datenbank wurde nichts ausgeführt.
Anleitung „Testdaten zurücksetzen in 4 Klicks“ im README.

### Getestet (v2.1)
- **Unit-Tests: 119 grün** (`cd worker && npm test`). Davon neu 24 für den Gesprächsverlauf (Titel, Gruppen samt
  Zeitumstellung, Limit 50, Aufbereiten, Übernahme v2.0, Ablagen, getrennte Demo-Ablage, Reste löschen, Marke,
  Zusammenführen zweier Tabs), 2 für `reset_test.sql`, Versionsstempel mit `gespraeche.js`.
- **Ende-zu-Ende: 258 grün** (`tests/v2.mjs`, Chromium und WebKit). Neu dabei:
  - Schein-Pixelmessung bei 390/768/1440 px, hell und dunkel, für drei Zustände.
  - Ruhige Wechsel: 10 Runden mit je 8 Wechseln in 6 Konfigurationen, auch mit „Bewegung reduzieren“.
  - Gesprächsverlauf am Laptop (Liste, Adresse, Zurück/Vorwärts, Neuladen, Umbenennen, Löschen, alle löschen, Limit 50,
    Gruppen, Wechsel während der Antwort, Diktat-Modus, Entwurf, unterbrochene Antwort, zwei Tabs, Datenschutz).
  - Schublade bei 390 und 320 px.
  - Übergang v1/v2.0.
  - Echte API: Platzhalter-Zeiten, getrennte Ablagen, Abmelden mit und ohne Häkchen, Spracherkennung nach dem Abmelden.
  - Safari-Engine mit IndexedDB.
- **SQL echt ausgeführt** (lokales Wegwerf-Postgres): schema → seed → reset, auch auf dem heutigen Live-Stand.
- **Screenshots** in `screenshots/`:
  - `glow-<390|768|1440>-<hell|dunkel>.png`
  - `laptop-<hell|dunkel>-12-seitenleiste.jpg`
  - `handy-<hell|dunkel>-12-schublade.jpg`
  - `handy-320-schublade.jpg`
  - alle übrigen neu (mit ☰ in der Kopfzeile)

### Live-Gang v2.1 (09.11.2026, auf „Ja, live schalten v2.1“)

- **Worker nicht neu deployt:** In `worker/src`, `wrangler.toml` und `package*.json` gibt es keinen Unterschied zu v2.0.2.
  Der Live-Worker meldet weiter 2.0.0, `bereit: true`.
- **`main` per Fast-Forward** von 71bbb1e auf 8ace709 gebracht und gepusht. Der Pages-Build war nach 33 s fertig, die
  Live-Seite liefert `?v=2.1.0`.
- **Dateiabgleich** (nur GitHub Pages, keine Anfrage an den Worker):
  - 28 App-Dateien sind byte-gleich mit `main`.
  - Alle 86 internen Dateien liefern 404 (Log, README, Tests, Worker, `supabase/`, Screenshots …).
  - `app.js` kommt mit `application/javascript` und `max-age=600`.
- **Live-Ende-zu-Ende** (`GABI_LIVE=1 … tests/v2.mjs … https://gabi.automatilabs.de`): **236 von 236 grün** in Chromium
  und WebKit, ohne Zugangscode. Der Teil „Echte API“ läuft nur lokal.
- **Unabhängige Live-Prüfung** (Workflow): vier Blickwinkel mit je einem Gegenprüfer – Verlauf in der Demo, Ruhe und
  Glow, Übergang von v2.0.2, echter Modus mit nachgebautem Worker.
  - **0 Anfragen an den echten Worker:** Alles wurde im Browser abgefangen, es gab nur Fantasie-Codes.
  - 16 Funde, alle bestätigt: 2 mittel, 14 niedrig, kein Blocker. Nichts davon gefährdet Daten auf dem Server außer
    einer möglichen doppelten Notiz.
  - **Noch nicht behoben** (Vorschlag: v2.1.1 nach Julius' Zustimmung).

| Schwere | Fund |
|---|---|
| mittel | Zwei Tabs, dieselbe Entwurfskarte: Tab A speichert (oder verwirft). Tippt Tab B danach in seiner Bearbeitung, ist die Karte wieder offen. Eine zweite, gleiche Notiz ist dann möglich. |
| mittel | „Nochmal versuchen“ nach einer Antwort mit Entwurf (zweite KI-Runde gescheitert) wirft die Karte weg. Eine gespeicherte Karte verschwindet, dadurch ist eine doppelte Notiz möglich. Korrekturen gehen ohne Rückfrage verloren. Gab es schon in v2.0.2. |
| niedrig | „Neues Gespräch“ bei ungespeicherter Notiz-Bearbeitung: Auch „Weiter bearbeiten“ bricht die laufende Antwort ab und wechselt das Gespräch. |
| niedrig | Demo: „Beispieldiktat nehmen“ ist nach Wechsel und Rückkehr klickbar, meldet aber „Wähle zuerst einen Test-Patienten“. Ein schneller Wechsel schluckt das Beispiel. |
| niedrig | Safari: Nach dem Schließen der Schublade liegt der Fokus auf der Seite statt auf ☰. Nach dem Löschen erscheint ein grüner Rahmen um die Schublade. |
| niedrig | Das Häkchen „Gespeichert bei …“ zeichnet sich bei jeder Rückkehr ins Gespräch neu, auch mit „Bewegung reduzieren“. |
| niedrig | Erste Suche bei langsamer Leitung: Der Platzhalter hat keine Ergebniszeile, die Treffer springen 54–88 px. |
| niedrig | Übergang: Das offene v2.0-Gespräch bleibt nicht offen, wenn der Tab beim Update im Notizordner stand. In der Liste steht es trotzdem. |
| niedrig | Übergang: Das übernommene v2.0-Gespräch erscheint in anderen offenen Tabs erst nach dem Neuladen. „Alle löschen“ nennt dort eine falsche Anzahl. |
| niedrig | Safari: Neuladen mitten in einer Antwort zeigt „Keine Verbindung zum Server“ statt „unterbrochen“. |
| niedrig | 401 bei der Spracherkennung verwirft die Aufnahme ohne Hinweis. Das passiert nur, wenn der Code am Worker geändert wird, während ein Tab offen ist. |
| niedrig | „Abmelden + Gespräche löschen“ lässt ungesendeten Text und den Suchbegriff im offenen Tab stehen. |
| niedrig | Abmelden, während eine Notiz gespeichert wird: Eine Folgeanfrage geht mit leerem Code raus (zählt beim Worker als 1 Fehlversuch), dazu die Meldung „Code gilt nicht mehr“. |
| niedrig | Abmelden verwirft eine ungespeicherte Notiz-Bearbeitung ohne Warnung. |
| niedrig | Die Auswahlkarte „Für welchen Test-Patienten …“ zeigt beim Nachladen kurz den alten Fehler statt Platzhaltern. |
| niedrig | Abmelden ohne Häkchen während einer Antwort: Später steht dort „… weil die Seite neu geladen wurde“. |

Neu mit v2.1 sind die Funde zu Tabs, Gesprächswechsel, Schublade und Übergang sowie der Text nach „Abmelden ohne
Häkchen“. Bei den übrigen ist nicht geprüft, ob es sie schon in v2.0.2 gab.

**Rückweg zu v2.0.2**, falls nötig (der Worker bleibt, 2.0.0 bedient beide):

```
git revert --no-commit 71bbb1e..HEAD && git checkout HEAD -- GABI-V2-LOG.md && git commit -m "Zurück zu v2.0.2" && git push origin main
```

- Der Befehl setzt die App auf 71bbb1e zurück und behält dieses Log.
- Gespräche bleiben im Browser (IndexedDB) liegen. v2.0.2 zeigt sie nicht, nach einem erneuten Update sind sie wieder da.
- Wer v2.1 in den 10 Minuten davor geladen hat, muss eventuell einmal neu laden.

## v2.1.1 – die 16 Funde der Live-Prüfung behoben (09.11.2026, Branch `gabi-v2-1-1`, noch nicht live)

Auf Julius' „Ja, beheben“. Vorgehen:
1. Je Bereich ein Entwurf (sechs Bereiche), jeder Entwurf mit einem Gegenprüfer, der ihn zu widerlegen versucht.
2. Entwürfe per Drei-Wege-Abgleich zusammengeführt, dann die Einwände eingearbeitet (drei waren zwingend, siehe unten).
3. Getestet (Unit, lokaler Gesamtlauf) und noch einmal unabhängig geprüft (fünf Prüfer, je ein Gegenprüfer).

Nur das Frontend hat sich geändert (`app.js`, `gespraeche.js`, `kern.js`, `style.css`, `index.html`). `worker/src` ist
unverändert, der Worker muss nicht neu deployt werden. Version 2.1.1 (`VERSION` und alle `?v=`).

| Fund | Lösung |
|---|---|
| Zwei Tabs, dieselbe Entwurfskarte (mittel) | „Gespeichert“ und „verworfen“ gehen nur noch vorwärts. Kein älterer Stand nimmt sie zurück: weder beim Zusammenführen noch beim Schreiben auf dem Gerät (Lesen, Nachziehen und Schreiben in einem IndexedDB-Vorgang). Tab B beendet sein Bearbeiten mit dem Hinweis „… in einem anderen Fenster gespeichert“. Speichern läuft über eine Sperre je Entwurf (Web Locks): klicken zwei Tabs gleichzeitig, wartet der zweite und findet „gespeichert“. |
| „Nochmal versuchen“ wirft Entwurfskarten weg (mittel) | Kam schon ein Entwurf oder Bericht an, gibt es kein „Nochmal versuchen“ mehr. Stattdessen: „Gabis Antwort ist danach abgebrochen. Der Entwurf ist vollständig angekommen – fehlt noch etwas, frag einfach nochmal.“ Gabi kennt die Karte bei Folgefragen. |
| „Neues Gespräch“ bei bearbeiteter Notiz | Fragt jetzt zuerst. „Weiter bearbeiten“ lässt alles beim Alten, auch eine laufende Antwort. Aus der Schublade: Sie schließt vor der Frage. |
| Beispiel-Chip (Demo) | Gehört zu seinem Diktat-Modus und ist nur aktiv, solange der läuft. Schneller Wechsel → Hinweis „… wurde nicht gesendet“, nie beim falschen Patienten. |
| Safari: Fokus nach der Schublade, grüner Rahmen | Der Fokus geht zurück auf ☰ bzw. den bedienten Knopf, nach Tippen ohne Ring, per Tastatur mit Ring. Nach jeder Rückfrage wird ein verlorener Fokus zurückgegeben. Kein Ring um ganze Dialoge. |
| Häkchen zeichnet sich bei jeder Rückkehr neu | Zeichnet nur einmal direkt nach dem Speichern, mit „Bewegung reduzieren“ gar nicht. |
| Such-Platzhalter springt | Der Platzhalter hat die Ergebniszeile und die Sortierung wie das Ergebnis. Die Sortierung steht jetzt auch bei 1 Treffer, am Handy ist die Kopfzeile immer zweizeilig. Gemessen: 0 px Sprung bei 1, 3 und 12 Treffern. |
| Übergang: v2.0-Gespräch nicht offen, wenn der Tab im Notizordner stand | Bleibt offen, „Gespräch“ führt hin. |
| Übergang: andere Tabs erfahren nichts | Meldung an die anderen Tabs. Vor „Alle löschen“ und vor der Abmelde-Rückfrage wird die Liste frisch gelesen. |
| Safari: Neuladen mitten in der Antwort zeigt „Keine Verbindung“ | Ein Verbindungsfehler gilt erst nach 5 s als echt (oder sofort bei Wechsel, Abmelden, Hintergrund). Lädt die Seite vorher neu, steht dort „unterbrochen“. |
| 401 bei der Spracherkennung | Die Aufnahme bleibt als Karte „Jetzt senden“ und lässt sich nach dem neuen Anmelden schicken. |
| Abmelden lässt Text und Suchbegriff stehen | Eingabefeld, Suche, Notizordner und Adresse werden geleert. |
| Abmelden während des Speicherns: Anfrage ohne Code | Die App schickt nie mehr eine Anfrage ohne Code. Abmelden wartet, bis Laufendes gespeichert ist (Ladekreis mit Text). Der Code ist dabei sofort vom Gerät, Fehlermeldungen bleiben auf der Zugangsseite stehen. |
| Abmelden verwirft eine Notiz-Bearbeitung ohne Warnung | Die Rückfrage warnt (roter Knopf). |
| Auswahlkarte zeigt beim Nachladen den alten Fehler | Zeigt Platzhalter. |
| „… neu geladen“ nach „Abmelden ohne Häkchen“ | Jetzt „Abgebrochen.“ |

**Zwingende Einwände der ersten Gegenprüfung (eingearbeitet):**
- Die verzögerte Bestätigung eines Netzfehlers durfte eine veraltete Kopie über den Stand eines anderen Tabs schreiben.
  Jetzt bestätigt jeder Gesprächswechsel sofort, und geschrieben wird nur das aktuelle Gespräch.
- Abmelden wartet auf laufendes Speichern. Der Code stand in der Zeit noch im Gerät (Tab zu → weiter angemeldet).
  Jetzt wird er als Erstes gelöscht.
- Abmelden räumte alle Hinweise weg, auch „Nicht gespeichert: …“. Fehler bleiben jetzt stehen.

**Bewusst nicht gemacht („Fix 17“, Julius 09.11.2026: nicht einbauen):** Abmelden in einem Tab meldet andere offene
Tabs desselben Browsers nicht ab (sie behalten den Code im Speicher, bis sie neu laden). Gefunden bei der Prüfung, gehört
nicht zu den 16 Funden. Steht unter „Offen“.

**Zweite Gegenprüfung (zusammengeführter Stand):** Alle 16 Funde sind behoben, in Chromium und WebKit, jedes Mal mit
Gegenprobe gegen main. Dabei wurden 13 neue Fehler gefunden und von je einem Gegenprüfer bestätigt: 3 × „sollte“,
10 × „kann“, keiner „muss“. Die meisten betrafen das Abmelden mit zwei offenen Tabs. Alle 13 sind behoben:

| Fund | Lösung |
|---|---|
| Abmelden mit Häkchen, Tab während des Wartens zu → Gespräche blieben (sollte) | Mit Häkchen wird jetzt **sofort** gelöscht, erst danach auf laufendes Speichern gewartet. |
| Zweiter Tab wartet auf die Speicher-Sperre, Abmelden mit Häkchen → Gespräch kam zurück bzw. zweite Notiz (sollte) | Nach dem Warten prüft der Tab, ob das Gespräch inzwischen gelöscht ist, und schickt dann nichts mehr („Nicht gespeichert – das Gespräch wurde inzwischen gelöscht …“). Ein schon abgelegtes Gespräch, das ein anderer Tab gelöscht hat, wird beim Schreiben nie wieder angelegt (Prüfung im selben IndexedDB-Vorgang). |
| Netzfehler-Frist + zweiter Tab → vorläufige Antwort ging verloren (sollte) | Ein anderer Tab übernimmt die vorläufige Fehler-Antwort gleich an ihrer Stelle und schreibt sie nicht mehr weg. Die eigene Fassung („unterbrochen“) überschreibt er nie. |
| Web Locks ohne Frist | Hinweis „… in einem anderen Fenster gespeichert – Gabi wartet darauf.“, nach 25 s Abbruch ohne Senden („bitte dort nachsehen“). |
| Chromium: Neuladen nach der Karte, während Gabi noch schreibt, verlor die Karte (alt) | Die Karte wird sofort auf dem Gerät gesichert. |
| 401 während des Abmeldens wurde verschwiegen | „Nicht gespeichert (TP-01): Der Zugangscode galt nicht mehr.“ bleibt auf der Zugangsseite (auch bei Notiz ändern/löschen). |
| Hinweise außerhalb der gesperrten Seite („Rückgängig“ startete beim Abmelden eine Spracherkennung) | Alte Hinweise gehen schon zu Beginn des Abmeldens weg, „Rückgängig“ prüft das Abmelden. |
| Abmelde-Frist deckte die Warteschlange der Sperre nicht ab (alt) | Die Frist gilt je Anfrage: Schickt ein Entwurf erst spät los, wartet das Abmelden auf seine Antwort. |
| Ladetext beim Abmelden für Screenreader unsichtbar | Der Text bekommt den Fokus, die Seite ist dann nicht mehr gesperrt (sonst ist nichts zu sehen). |
| Safari + „Bewegung reduzieren“: grüner Ring um ☰ | Nach Tippen/Klicken merkt sich die Rückfrage den Knopf nicht mehr; der Fokus kommt ohne Ring zurück. |
| Rückfragen aus dem Info-Dialog: Fokus in Safari auf body (alt) | Fokus zurück aufs Badge. |
| Such-Platzhalter: Restsprung bei langem Begriff (alt) | Die Ergebniszeile bricht nie um (sehr lange Begriffe enden mit „…“, voll stehen sie im Suchfeld). |
| Sortierung umstellen: Fokus auf body (alt) | Der Fokus bleibt auf der Auswahl (Suche und Patientenseite). |

„(alt)“ heißt: gab es schon in v2.1, erst die Prüfung hat es gefunden.

**Nachprüfung der 13 Korrekturen (letzte Prüfrunde, 09.11.2026 abends):** Vier Prüfer, je ein Gegenprüfer, nur gegen den
lokalen Testserver (0 Anfragen an Live, Repo unverändert). Alle 13 Korrekturen sind behoben, in Chromium und WebKit, jede
mit Gegenprobe gegen den Stand davor. Neu gefunden und bestätigt: 1 × „sollte“, 10 × „kann“, keiner „muss“.
Julius' Regel (09.11.2026): nur bestätigte „muss“/„sollte“ einbauen, „kann“ nur ins Log, danach keine weitere Prüfrunde.

| Fund | Lösung |
|---|---|
| Zwei Tabs, Netzfehler gleich nach dem Entwurf: Tab B übernimmt die vorläufige Antwort samt Karte. Korrigiert B den Befund, nachdem A in der Frist neu geladen hat (oder tippt B in der Frist auf „Bearbeiten“), übergeht A die Korrektur, nimmt sie beim nächsten Schreiben zurück und speichert den alten Befund (sollte, neu durch die Nachbesserung) | Sobald B an der Karte arbeitet (Bearbeiten, Übernehmen, Speichern, Verwerfen – nicht PDF), gilt die Antwort in B als bestätigt; A übernimmt B's Änderung auf dem normalen Weg. Dazu kommen „gespeichert“/„verworfen“ aus einer noch vorläufigen Fassung sofort im anderen Tab an. Lösung so vom Gegenprüfer in beiden Engines erprobt (alle Abläufe OK, auch „A korrigiert selbst in der Frist“). |

Die 10 „kann“-Funde stehen unter „Offen“ (Punkt 11).

**Getestet (v2.1.1):**
- Unit-Tests: **149 grün** (v2.1: 119). Neu sind Endzustände, das Zusammenführen mit „veraltet“ und mit vorläufigen
  Netzfehlern anderer Tabs (auch: deren Gespeichertes/Verworfenes kommt gleich an), Netzfehler beim Neuladen, „nicht
  wieder anlegen“ in den Ablagen, der Verlauf für den Server mit Karte und Quelltext-Wächter (Fokus, keine Anfrage ohne
  Code, Abmelde-Reihenfolge, Sperre mit Frist, übernommene vorläufige Antwort gilt beim Arbeiten an der Karte).
- Lokaler Gesamtlauf `tests/v2.mjs`: **431 von 431 grün** (v2.1: 258), in Chromium und WebKit. Neu sind alle 16 Funde
  als Prüfung, dazu Abschnitt 3b (Neuladen mitten in der Antwort, echter Netzfehler, zwei Tabs), 3c (die 13 Funde der
  Gegenprüfung: zwei Tabs, Abmelden mitten im Speichern, Tab zu im Wartefenster, Sperre, 401, Frist je Anfrage,
  Ladetext; dazu der Fund der Nachprüfung: Korrektur am Entwurf nach Netzfehler in zwei Tabs, 4 Abläufe) und 4b (Fokus
  rund um die Schublade, getippt, per Tastatur, am Laptop mit Maus, mit „Bewegung reduzieren“).
- Gegenprobe: Abschnitt 3c gegen den Stand vor der Nachbesserung (alte Dateien per Route) – alle 15 Fehlerprüfungen
  schlagen an (u. a. Gespräche nach „Tab zu“ noch auf dem Gerät, zweite Notiz, Karte weg in Chromium, kein Hinweis bei
  401, Abmelden nach 19 s statt nach der Antwort). WebKit behielt die Karte beim Neuladen schon vorher.
- Gegenprobe für den Fund der Nachprüfung (3c h, Stand vor der Korrektur per Route): alle 6 Fehlerprüfungen schlagen an.
  In beiden Engines ging der alte Befund zum Server, und B zeigte A's Speichern erst nach 4,5 s statt nach 0,6 s.
  „A korrigiert selbst in der Frist“ war schon vorher richtig und bleibt es.
- Kein Test hat eine Anfrage an den Live-Worker oder die Live-Seite geschickt. Die Wache „keine Anfrage ohne Code“ blieb
  in allen Teilen leer.

## v2.1.2 – Eingabefeld ohne Anschnitt, Fachwörter für Whisper, kein erfundenes Geschlecht (10.11.2026, Branch `gabi-v2-1-2`)

Drei Aufträge von Julius (09./10.11.2026). Frontend 2.1.2 (`VERSION` und alle `?v=`) – nur auf dem Branch, nicht auf
`main`, nicht live. Worker 2.0.1 – laut Auftrag nach grünen Tests deployt (siehe „Getestet“).

### A – Eingabefeld „Frag Gabi oder diktiere …“: Cursor am Zeilenanfang angeschnitten

**Ursache (gemessen per Bildvergleich – Bild mit Cursor minus Bild mit `caret-color: transparent`):**
- Das Textfeld hatte keinen eigenen Innenabstand (`.eingabe-text { padding: 9px 0 }`). Die 16 px links saßen am Rahmen
  `.eingabe` mit `border-radius: 26px`, der Text begann also genau an der Kante des Textfelds.
- Dort schnitt eine runde Kante den Cursor am Zeilenanfang an – in Chromium und Safari, hell und dunkel, bei 320, 390 und
  1440 px. Chromium: 11–12 statt 20 px hoch (Fläche 9,5 statt 20 px²). Safari: Fläche 25 statt 38 px². Er sah aus wie
  ein „(“ auf dem „F“.
- Belege: Rahmen ohne Rundung → voller Cursor. 2 px Innenabstand im Textfeld → voller Cursor. Nicht die Ursache:
  `overflow` (Rahmen `visible`, Textfeld `auto`; `hidden` änderte nichts), `appearance`, `text-indent`, `transform`. Der
  grüne Fokus-Ring ist ein äußerer Schatten und verschiebt nichts.
- Zweiter Fund bei 320 px: Der Platzhalter (191 px breit) passte nicht in die Zeile (178 px). Er brach um, die zweite
  Zeile lag unsichtbar unter dem Feld.
- In Ordnung waren Zeilenhöhe und Auto-Höhe: `line-height` 1,4, oben und unten je 9 px, Höhe = Inhalt + Innenabstand. Bei
  5 Zeilen gilt scrollHeight = clientHeight. „gyÄÖ“ war nie beschnitten.
- Die anderen Eingabefelder mit derselben Messung: Suche im Notizordner, Umbenennen, Zugangscode, Entwurf bearbeiten,
  Neuer Test-Patient. Alle ohne Anschnitt, ihr Text beginnt 12–44 px innerhalb des eigenen Felds. Dort nichts geändert.

**Fix (`style.css`):**
- `.eingabe-text { padding: 9px 18px }`, `.eingabe { padding-left: 0 }`. Der Innenabstand sitzt im Textfeld selbst, der
  Text beginnt 18 px vom Rand (vorher 16 px).
- `.aufnahme-anzeige` links 18 px statt 2 px. Die Aufnahme-Anzeige steht genau wie vorher.
- Platzhalter immer einzeilig, zu Langes mit „…“: `::placeholder` nowrap/ellipsis, dazu `text-overflow: ellipsis` am
  Textfeld, weil Chromium das „…“ von dort nimmt. Getippter Text bricht weiter um.
  - Ab 353 px Breite steht der Platzhalter ganz da, darunter „Frag Gabi oder dik…“.
  - Unter 360 px mit Fokus zeigt Chromium kein „…“. Dort blendet eine weiche Maske die letzten 18 px aus, statt hart
    abzuschneiden. Das gilt nur für das leere Feld.

**Test:** `tests/eingabefelder.mjs` (Block 5 von `tests/v2.mjs`, auch allein startbar). Chromium und WebKit, 320/390/1440,
hell/dunkel. Gemessen wird:
- Textanfang ≥ 16 px vom Rahmen, Innenabstand im Textfeld ≥ 18 px links und rechts.
- Cursor am Zeilenanfang (leer und vor Text) so hoch und mindestens 85 % so groß wie ein freier Cursor.
- „gyÄÖ“ so groß wie frei gesetzt.
- Platzhalter einzeilig wie eine vom Browser sauber gekürzte Vergleichszeile; mit Fokus keine harte Kante rechts.
- 5 Zeilen ohne inneres Scrollen, nirgends scrollWidth > clientWidth.
- Dazu die fünf anderen Felder. Die Screenshots entstehen erst, wenn Fokus-Ring und Cursor zu sehen sind.

Gegenproben:
- Alter Stand (`style.css` von 0ee0e92, fertiger Test): 32 von 133 Prüfungen schlagen an. 12× Cursor am Zeilenanfang
  (beide Engines, alle Breiten, hell/dunkel), 4× Platzhalter bei 320 px, 4× Platzhalter mit Fokus hart abgeschnitten,
  12× Innenabstand. Die fünf anderen Felder bestehen auch dort – sie hatten das Problem nicht.
- Ohne die Chromium-Zeile `text-overflow`: Chromium schlägt bei 320 px an (155 statt 150 px Tinte, hart abgeschnitten).

### B – Fachwörter für Whisper (Worker 2.0.1)
- `WHISPER_PROMPT` geht wie bisher als `initial_prompt` an Workers AI. Neu darin: alle 19 Begriffe aus dem Auftrag, dazu
  „am Kniegelenk“. Länge 150 Tokens (Whisper liest höchstens ~224).
  - Bewusst nur eine Liste, ohne Sätze und ohne Ziffern. Bei Stille gibt Whisper manchmal das Ende des Hinweises wieder.
    Ein Echo über 40 Zeichen fängt der Filter ab, ein kürzeres nicht.
  - Eine erste Fassung endete mit „3 mal 12 Wdh., 3 Sätze.“. Ein kurzes Echo davon wäre als erfundene Dosierung im Entwurf
    gelandet (Fund der Gegenprüfung).
  - Jetzt endet der Hinweis wie früher mit „Wiederholungen.“. Ein Unit-Test sichert: keine Ziffern im Hinweis.
- Strukturierung, Regel 9 neu: Hörfehler nur korrigieren, wenn eindeutig ein Fachbegriff passt (z. B. „Terra-Abend“ →
  „Theraband“), sonst wie im Transkript mit „(unklar)“ (z. B. „A12 (unklar)“, nicht „3 × 12“). Jede Korrektur steht unter
  „Bitte prüfen“, nichts wird dazuerfunden. Hinweis: Der Auftrag nennt „unsichere Korrekturen“. Wir melden jede Korrektur –
  sonst sähe die Therapeutin nie, was Gabi geändert hat.
- Lokal vorher/nachher (synthetische Stimme Anna, mlx-whisper wie `dev/whisper_lokal.py`): „Kräftigung mit Teraband“
  wurde zu „Kräftigung mit Theraband“, im kurzen und im 43-s-Diktat. „3 x 12“ bleibt „3 x 12“ – das ist richtig, nur eine
  andere Schreibweise. Mit Ziffern im Hinweis stand dort „3 mal 12“. Den Hörfehler „A12“ und „mein Kniegelenk“ erzeugte die
  Teststimme in keiner Fassung. Gibt es sie live, fängt Regel 9 sie ab: „A12 (unklar)“, unter „Bitte prüfen“.
- Grenze: Mit `condition_on_previous_text: false` wirkt der Hinweis nur im ersten 30-s-Fenster einer Aufnahme (Whisper
  setzt ihn danach zurück, lokal an einem 43-s-Diktat gesehen). Hörfehler später fängt Regel 9 ab („Bitte prüfen“). Siehe
  „Offen“.

### C – Gabi ergänzt kein Geschlecht
- Ursache im Code: Im Chat-Prompt stand direkt bei der Beispielfrage „Was wollte TP-01?“ der Satz „Anliegen und Angaben
  der Patientin stehen meist als „Pat.: …“ …“. Die Abschnitte der Notizen enthalten nur das neutrale „Pat.:“, das
  Geschlecht kam also aus unserem Prompt. (Das Diktat einer Notiz geht beim Lesen mit; sagt es „Patientin“, darf Gabi das
  übernehmen.)
- Fix: Der Satz ist neutral („Anliegen und eigene Angaben …“). Die Regel steht jetzt in Chat-, Bericht- und
  Strukturierungs-Prompt: „Gib nur Personenmerkmale wieder, die wörtlich in der Notiz stehen. Schreibe „Patient“ oder
  „Pat.“ wie im Original, sonst neutral. Also nie Geschlecht, Alter oder Beruf ergänzen.“ Auch die Werkzeug-Beschreibungen
  sind neutral („zu einem Kürzel“).
- Tests (über die echte Route `/api/chat` mit nachgebauter Anthropic-API):
  - Notiz mit „Patient“: Die Regel steht im System-Prompt, die Notiz kommt wörtlich an, nirgends „Patientin“ von uns.
  - Dasselbe umgekehrt für „Patientin“.
  - Kein Prompt und keine Werkzeug-Beschreibung gibt ein Geschlecht vor.
  - Der Demo-Assistent ergänzt keins.
- Grenze: Die Wortwahl des echten Modells lässt sich offline nicht testen. Geprüft ist, dass nichts von uns ein
  Geschlecht vorgibt. → Julius, live:
  - „Was wollte TP-02?“: In den Testdaten sagt das Diktat „Patient“, also darf kein „Patientin“ kommen.
  - Umgekehrt „Was wollte TP-03?“: Dort steht „Patientin“.
  - TP-01 eignet sich nicht, dessen Diktate sagen selbst „Patientin“.

### Getestet (v2.1.2)
- Unit-Tests: **159 grün** (149 + 10 neu: Whisper-Hinweis mit allen Begriffen und ohne Ziffern, Regel 9,
  Personenmerkmale in allen Prompts und über die Route `/api/chat`, Demo-Assistent, Version 2.0.1).
- Lokaler Gesamtlauf `tests/v2.mjs`: **564 von 564 grün** – die 431 bisherigen und 133 neue in Block 5 (Eingabefelder),
  in Chromium und WebKit. Kein Test hat eine Anfrage an den Live-Worker geschickt.
- Probe-Build des Workers (`wrangler deploy --dry-run`) sauber. Das Frontend v2.1 (live) liest aus `/api/status` nur
  „bereit“, nicht die Version – Worker 2.0.1 passt dazu.
- Gegenprüfung (eine Runde, Workflow: 4 Prüfer – Oberfläche, Prompts, Whisper, Tests/Sicherheit – und je Bereich ein
  Gegenprüfer, der muss/sollte-Funde zu widerlegen versucht): kein bestätigter „muss“- oder „sollte“-Fund.
  - Die zwei „sollte“-Funde stuften die Gegenprüfer herab: Der Cursor berührt in Safari den Platzhalter („kein Fehler“,
    siehe „Offen“ 13). Die Ziffern im Whisper-Hinweis („kann“) habe ich trotzdem entfernt, weil sie live eine erfundene
    Dosierung ermöglicht hätten.
  - Aus „kann“-Funden außerdem nur eigene Angaben berichtigt: Testbeschreibung, Log-Zahlen, Live-Probe TP-02/TP-03. Dazu
    kleine Robustheit im neuen Test: Messausschnitt, „webkit“ als Name, keine 0-Prüfungen-Läufe, auch das
    Zugangscode-Fenster stumm.
  - Alle anderen „kann“-Funde stehen unter „Offen“ 14.
- [DEPLOY]

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
7. Später: Terminkalender/Praxissoftware (Baustein 2), Gesprächsverlauf über Geräte hinweg (bräuchte Konten statt
   gemeinsamem Code).
8. ~~16 Funde der Live-Prüfung v2.1~~ – behoben in v2.1.1 (Branch `gabi-v2-1-1`), dazu 13 aus der Gegenprüfung; live
   erst nach Julius' OK. Am echten iPhone noch offen: Schublade, Umbenennen per Tipp, Abmelden mit Häkchen, Fokus.
9. **Andere Tabs beim Abmelden nicht mit abgemeldet** („Fix 17“ – Julius 09.11.2026: nicht einbauen, bleibt offen):
   Ein zweiter offener Tab behält den Code im Speicher, bis er neu lädt. Mit Häkchen sind seine Gespräche aber vom
   Gerät, er legt sie nicht wieder an.
10. **Alt (schon in v2.0/v2.1, selten):** Wird mitten in einer Antwort neu geladen und schreibt danach ein zweiter Tab
   in dasselbe Gespräch, verschwindet die unterbrochene Antwort (die Frage bleibt). Was der Start aus der Notfall-Kopie
   nachträgt, erfahren andere offene Tabs nicht. Beides wäre eine eigene, größere Änderung an der Ablage.
11. **„kann“-Funde der letzten Prüfrunde (09.11.2026, nur notiert – Julius: nicht umsetzen):**
    - Wartet ein zweiter Tab beim Abmelden noch auf die Speicher-Sperre, kann bis zu 25 s später „… bitte dort
      nachsehen“ auf der Zugangsseite stehen. Nach schnellem neuem Anmelden kommt dazu fälschlich „… Gespräch …
      gelöscht“. Drei Prüfer fanden das unabhängig, die Ursache ist dieselbe.
    - Abmelden mit Häkchen, das Leeren des Geräts scheitert und das Warten dauert länger als 8 s: Der Hinweis „… nicht
      vollständig löschen …“ ist dann schon abgelaufen und fehlt auf der Zugangsseite. Das Löschen selbst wird beim
      nächsten Start nachgeholt.
    - B wartet beim Speichern auf die Sperre, A löscht das Gespräch oder meldet sich mit Häkchen ab. Dann zeigt B drei
      Hinweise zugleich: „… Gabi wartet darauf“, „Dieses Gespräch wurde in einem anderen Fenster gelöscht“ und „Nicht
      gespeichert – das Gespräch wurde inzwischen gelöscht …“. Dabei hat A die Notiz gespeichert.
    - Abmelden mit Häkchen, während noch gespeichert wird: Die leere Begrüßung blitzt etwa 150 ms auf, bevor der
      Ladekreis kommt.
    - Fokus (alt, vor allem Safari/Tastatur):
      - Umsortieren ohne Treffer oder nach fehlgeschlagener Suche lässt den Fokus auf body.
      - Info-Dialog mit „Verstanden“ oder Esc geschlossen: Fokus auf body (Safari).
      - Nach „Ja“ verschwindet der auslösende Knopf, der Fokus fällt auf body. Betrifft: Notiz löschen, Änderungen
        verwerfen, Entwurf/Aufnahme verwerfen, Neuer Test-Patient.
      - Safari: Der erste Knopf einer Rückfrage hat nach Tippen sofort einen grünen Ring.
12. **Whisper-Hinweis wirkt nur in den ersten 30 Sekunden** einer Aufnahme (v2.1.2). Mit
    `condition_on_previous_text: false` setzt Whisper den Hinweis nach dem ersten 30-s-Fenster zurück. Lokal an einem
    43-s-Diktat gesehen: erst „Theraband“, später wieder „Teraband“. Danach fängt Regel 9 Hörfehler ab („Bitte prüfen“).
    Abhilfe wäre, die Aufnahme in Stücke von höchstens 30 s zu teilen, jedes mit Hinweis. Nicht umgesetzt – Entscheidung
    bei Julius.
13. **Safari: Cursor berührt im leeren Feld den ersten Buchstaben des Platzhalters** (v2.1.2, Gegenprüfung: „kein
    Fehler“). Der Anschnitt ist behoben. Der 2 px breite Safari-Cursor liegt aber, wie in jedem Safari-Textfeld (auch Suche,
    Kürzel), etwa 0,5 px auf dem Stamm des „F“ von „Frag …“. Chromium setzt ihn direkt daneben. Abhilfe wäre, den
    Platzhalter 3 px einzurücken (`::placeholder { text-indent: 3px }`). Dann springt der Text beim ersten getippten
    Buchstaben um 3 px nach links. Nicht umgesetzt – Entscheidung bei Julius.
14. **„kann“-Funde der Gegenprüfung v2.1.2 (nur notiert):**
    - Oberfläche: Die weiche Ausblendung unter 360 px (leeres Feld mit Fokus) greift auch, wenn der Platzhalter ganz passt.
      Das „?“ von „Wonach suchst du?“ bei 320 px und das „…“ bei 353–359 px werden etwas blasser – nur vergrößert
      sichtbar.
    - Oberfläche: Die anderen Felder haben 12–14 px Innenabstand (Umbenennen, Entwurf, Notiz bearbeiten 12 px;
      Zugangscode, Kürzel, Beschreibung 14 px; Suche 44 px). Gemessen ohne Anschnitt, das 16/18-px-Maß der Haupt-Eingabe
      gilt dort nicht.
    - Prompts: „Schreibe „Patient“ oder „Pat.“ wie im Original“ reibt sich mit der Regel, Beschwerden mit „Pat.:“ zu
      beginnen. Notizen könnten „Patient: …“ statt „Pat.: …“ schreiben, mit dem Modell nicht gemessen. Vorschlag: „Angaben
      zu Beschwerden beginnen weiter mit „Pat.:““.
    - Prompts: Die neue Chat-Regel ist nicht auf Patienten begrenzt. Streng gelesen dürfte Gabi den Beruf eines
      Teammitglieds aus dem Praxiswissen nicht nennen. Nicht gemessen. Vorschlag: „Das gilt für Test-Patienten; Angaben zum
      Praxisteam kommen aus dem Praxiswissen.“
    - Prompts: Im Beispiel-JSON wird aus „Lümfdrainage“ „MLD, 20 min“, der Prüfhinweis nennt aber „Lymphdrainage“. Das
      passt nicht ganz zu „nur das falsch erkannte Wort ersetzen“. War schon vorher so.
    - Tests:
      - „Regel 9 steht unter UNKLARES“ findet die frühe Erwähnung von UNKLARES statt der Überschrift.
      - Die Geschlechts-Regex übersieht „Der Patient“ am Satzanfang und „vom/beim/zum Patienten“.
      - Der Echo-Test prüft keine Listen-Segmente mit Komma.
    - Whisper: Der Echo-Filter verwirft ein echtes Segment über 40 Zeichen, wenn es nur aus Hinweis-Begriffen in derselben
      Reihenfolge besteht (selten, gab es schon vorher). Später ließe sich zusätzlich `no_speech_prob`/`avg_logprob` der
      Segmente nutzen.
    - Live-Lauf: `GABI_LIVE=1 node tests/v2.mjs` von diesem Branch misst in Block 5 das Live-Frontend v2.1 (ohne den Fix)
      und wäre dort rot. Block 5 live erst nach dem Frontend-Release werten.
