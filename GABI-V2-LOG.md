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

## v2.1.2 – Eingabefeld ohne Anschnitt, Fachwörter für Whisper, kein erfundenes Geschlecht (10.11.2026, live seit 10.11.2026)

Drei Aufträge von Julius (09./10.11.2026). Frontend 2.1.2 (`VERSION` und alle `?v=`) – live seit 10.11.2026 auf sein
„Ja, live schalten v2.1.2“ (siehe „Live-Gang v2.1.2“). Worker 2.0.1 – laut Auftrag nach grünen Tests deployt (siehe
„Getestet“).

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
- **Worker 2.0.1 deployt** am 10.11.2026 nach den grünen Tests, aus Commit c705813.
  - Versions-ID `4c13be8c-05a9-4dcf-96bf-9377c18b4abd`, vorher 2.0.0 = `c266d957-e455-4222-a145-06872b19da79`.
  - Geprüft nur über `/api/status`: version 2.0.1, bereit, alles eingerichtet. Keine Anfrage mit Code.
  - Rückweg: `cd worker && npx wrangler rollback c266d957-e455-4222-a145-06872b19da79`.
  - Die Live-Seite bleibt Frontend v2.1, der Branch ist nicht gemergt. Die Worker-Änderungen sind nur Prompt-Texte und
    die Version, v2.1 liest aus `/api/status` nur „bereit“.

### Live-Gang v2.1.2 (10.11.2026, auf „Ja, live schalten v2.1.2“)
- Worker bleibt 2.0.1 (seit dem Vormittag live), kein neuer Deploy.
- `main` per Fast-Forward 1a18c05 → edee1ef (v2.1.1, v2.1.2, Log), gepusht. Pages-Build „built“ nach 34 s, ohne Fehler.
- Dateiabgleich gegen `main`: 16 von 16 App-Dateien byte-gleich. Die Startseite kam auch ohne Zusatz in der Adresse
  (so lädt sie ein Browser) schon neu (Age 0). Alle 88 internen Dateien liefern 404: Log, README, `tests/` (auch
  `eingabefelder.mjs`), `worker/`, `supabase/`, `knowledge/`, `screenshots/`, `_config.yml`, `.gitignore`.
- Live-Prüfung `GABI_LIVE=1 node tests/v2.mjs … https://gabi.automatilabs.de`: **460 von 460 grün**, in Chromium und
  WebKit. Nur Demo- und Mock-Teile, Block 5 (Eingabefelder) inklusive. Die Zugangsseite wird nur angezeigt (fragt
  `/api/status`), nie ein Code abgeschickt, also keine Anfrage mit falschem Code an den Live-Worker.
- Rückweg zu v2.1 (im Klon getestet: danach unterscheidet sich nur das Log vom alten Live-Stand 1a18c05). Worker 2.0.1
  passt auch zu v2.1; der Worker-Rückweg steht unter „Getestet (v2.1.2)“.
  ```bash
  git revert --no-commit 1a18c05..HEAD && git checkout HEAD -- GABI-V2-LOG.md && git commit -m "Zurück zu v2.1" && git push origin main
  ```
- Jetzt am echten iPhone möglich: Eingabefeld (Cursor, Platzhalter), Schublade, Abmelden mit Häkchen, Fokus.

## v2.3 – Design im PhysioWorks-Stil mit Glas (15.11.2026, Branch `gabi-v2-3-design`, nicht live)

Auftrag von Julius (15.11.2026): Oberfläche im PhysioWorks-Stil mit „glassy“ Look, gründlich getestet. Kein Push, kein
Deploy, keine Live-Änderung, Worker unverändert, nur Testdaten. Keine Funktionsänderung.

**Ausgangsstand:** Einen Branch `gabi-v2-2` (Prompt 3: „Bitte prüfen“/Notiz per Gespräch) gibt es nicht – weder lokal
noch im Remote, auch kein Hinweis in den Handoffs. Darum von `main` abgezweigt (b2a21d8 = Live-Stand v2.1.2).
Gearbeitet in einem eigenen Worktree mit eigenem Server (Port 8789): Die Vorschau gegen den Live-Worker
(`npm run vorschau`, Port 8788, seit 09.11. offen) liefert die Dateien aus `~/Desktop/gabi` – die blieb während der
Arbeit unberührt. Erst am Ende ist `~/Desktop/gabi` auf `gabi-v2-3-design` umgestellt (zum Ansehen mit
`npm run lokal`; zurück mit `git checkout main`).

### Was neu ist
- **Tokens an einer Stelle** (`style.css`, Abschnitt 1): zuerst die PhysioWorks-Grundfarben `--pw-blau` #3391F0,
  `--pw-marine` #072D53, `--pw-grund` #EDF4FA, `--pw-karte` #F8FAFD, `--pw-flaeche` #DFE7F2, `--pw-text` #1B1E21
  (+ `--pw-cyan` #62CFF4 für die zweite Lichtfläche), daraus alle Rollen (Text-Stufen, Akzent, Glas, Schatten, Fokus,
  Warn/Fehler) – je für Hell und Dunkel. Außerhalb der Tokens steht keine Farbe mehr fest im CSS; einzige Ausnahme ist
  das Abdunkeln in `::backdrop` (ältere Safari erben dort keine Variablen, Werte im Token-Block notiert).
- **Schriften lokal:** DM Sans als variable Schrift (ein File, 37 KB, latin, alle Gewichte 400–700) und Red Hat Display
  nur fett 700 (15 KB) für Überschriften, Wortmarke, Karten- und Patiententitel. Aus @fontsource 5.3.0 (npm, nur
  diese zwei Dateien + OFL-Lizenzen in `assets/fonts/`), beide vorgeladen. Inter ist entfernt. CSP `font-src 'self'`
  unverändert.
- **Grund:** ruhiger Verlauf #EDF4FA → #DFE7F2 (Dunkel: Marine #072D53 → #05213F), darüber drei große weiche
  Lichtflächen (Akzentblau oben rechts, helles Cyan links, Akzentblau unten). Fest hinter allem (`body::before`,
  `position: fixed`), keine Animation.
- **Glas** (halbtransparent, `backdrop-filter: blur(18px) saturate(160%)`, feine helle Innenkante, flacher Schatten):
  Kopfzeile (Handy), Seitenleiste (Laptop), Eingabe-Band mit Chips und Eingabefeld, Schnellaktionen, Entwurfs- und
  Berichtskarten, Zugangs- und Offline-Karte, Dialoge, Schublade, Toasts.
- **Weiße Karten** (#F8FAFD, 10 px Ecken, sehr flache Schatten) für Patienten, Notizen und den Notiz-Leser;
  Knöpfe, Chips und Eingabefeld bleiben rund.
- **Grün entfällt überall** → Blau: Akzent, Schein hinter leeren Zuständen, Häkchen, Fokusring, Chips, Mikrofon,
  eigene Blase, Avatar, Streifen, Markenpunkt, Toast-Symbol, PDF.
- **Marke:** „Gabi.“ bleibt Text (Red Hat Display, Marine, Punkt in #3391F0), Untertitel „PHYSIOWORKS“. Kein Logo,
  keine Fotos von der Website.
- **Favicon und Apple-Touch-Icon:** #3391F0 mit weißem G und Marine-Punkt (gleiche Form wie vorher).
- **PDF:** Akzentstreifen Cyan → #3391F0 → #1A6FD0, „TESTVERSION“-Pill #15569F auf #E4EFFC, Aufzählungspunkte und
  Verlaufsdaten blau, Grautöne blaugrau. Schrift bleibt Helvetica, Testbanner „Testversion – Testdaten“ bleibt.
- **Version 2.3.0** (`VERSION` in `app.js` und alle `?v=` in `index.html`), damit Pages nach einem späteren Release
  sofort die neuen Dateien lädt.

### Entscheidungen
1. **Akzent #3391F0 nur für Flächen und Symbole.** Weiß darauf hat nur 3,26:1, Marine darauf 4,27:1 – zu wenig für
   Schrift. Darum: Knöpfe mit Text, eigene Blase und Avatar in #1A6FD0 mit Weiß (4,97:1); Text in Akzentfarbe
   #15569F (≥ 4,8:1 auch über der stärksten Lichtfläche). Dunkel: Knöpfe #3391F0 mit dunkler Schrift #04182E (5,49:1),
   Akzent-Text #93C8FB. Fokusring #1A6FD0 bzw. #7DBBF7 (≥ 3:1 auf Grund und Flächen; #3391F0 hätte auf dem Grund nur
   2,93:1).
2. **Lichtflächen als Verläufe statt `filter: blur()`:** Kosinus-Abfall in 11 Stufen wie beim bisherigen Schein – sieht
   aus wie stark weichgezeichnete Flächen, kostet aber keine Unschärfe-Rechnung über den ganzen Bildschirm und zeichnet
   nie nach. Keine Kanten (gemessen in `tests/design.mjs` Teil G; Chromium dithert die Verläufe mit einem feinen Muster,
   siehe „Tests angepasst“).
3. **Text auf Kopfzeile und Eingabe-Band hält 4,5:1 auch ohne Unschärfe:** Playwright-WebKit zeichnet
   `backdrop-filter` nicht (siehe „Testgrenzen“). Dort liegt der Verlauf nur abgetönt und scharf unter dem Glas. Damit
   die Schrift auch dann lesbar bleibt (z. B. wenn ein Browser die Unschärfe auslässt): Tönung 78 % (Hell) bzw. 82 %
   (Dunkel), Untertitel „PHYSIOWORKS“ in Marine (Dunkel: #93C8FB), Hinweiszeile unter dem Feld in Text-2, Hinweise in
   Marine, Eingabefeld und Chips im Dunkeln fast deckend.
4. **Handy: höchstens 2–3 Unschärfe-Ebenen übereinander.** Unschärfe nur in Kopfzeile und Eingabe-Band (eine Ebene für
   Chips, Feld und Hinweis), dazu offene Dialoge, Schublade und Toasts. Karten und Schnellaktionen im Verlauf sind
   unter 640 px Glas ohne `backdrop-filter` (dahinter liegt nur der ruhige Grund – gleicher Eindruck, keine Ebene pro
   Karte beim Scrollen). Eigene Blasen deckend. Hinter Dialogen wird nur abgedunkelt, nicht mehr zusätzlich 2 px
   unscharf.
5. **Deckend:** ohne `backdrop-filter`-Unterstützung (`@supports not`), bei „Transparenz reduzieren“ und bei „Bewegung
   reduzieren“ sind alle Glasflächen deckend in denselben Farben. „Bewegung reduzieren“ nimmt jetzt auch die Übergänge
   ganz weg (vorher 120 ms), Ein-/Ausblenden bleibt kurz wie bisher.
6. **Kontrast-Korrekturen am Bestand:** Verworfene Entwürfe nicht mehr per `opacity: 0.7` (Schrift fiel unter 4,5:1),
   sondern als durchsichtige Karte mit Rand und Text-3. Kopfzeile der eigenen Blase („Diktat · TP-01 · Beispiel“)
   ohne 90 % Deckkraft (4,34 → 4,97:1). Fehlerrot Hell #9B0F08 (vorher #C4170E), Dunkel #FFB4AE.
7. **Einzige Kontrast-Ausnahme** (neben deaktivierten Knöpfen, WCAG 1.4.3): der Markenpunkt „.“ hinter „Gabi“ in
   #3391F0 – Logo, trägt keine Information.
8. **Tastatur-Fokus in der Gesprächsliste** zeigt jetzt dieselbe Fläche wie Zeigen (Stift und Papierkorb liegen auf
   deckender Fläche; auf Glas passte der alte Übergang auf `--bg` nicht). Reine Darstellung.

### Tests angepasst
- `tests/v2.mjs` Block 1: erwartete Hintergrundfarbe Hell `rgb(237, 244, 250)` statt `rgb(243, 243, 240)`, Dunkel
  `rgb(7, 45, 83)` statt `rgb(12, 18, 19)`.
- `tests/v2.mjs` Block 2b (Schein ohne Kante): misst jetzt **den Schein allein**. Grund: Der Grund ist seit v2.3 ein
  Verlauf mit drei Lichtflächen, und Chromium dithert jeden Verlauf mit einem feinen, regelmäßigen Muster (je Schicht
  etwa ±1 Stufe). Über fünf Schichten springen Nachbarpixel um 3–4 Stufen (z. B. Rot Zeile für Zeile 219 ↔ 223), obwohl
  nirgends eine Kante ist – über 9 px gemittelt bleibt jeder Schritt unter 1 Stufe. Der alte Test erwartete einen flachen
  Grund und schlug darum an (größter Schritt 3–4 statt ≤ 2). Gegenproben: Grund + Schein ohne Lichtflächen ≤ 1–2;
  Lichtflächen als weichgezeichnete Schatten statt Verläufe ändern nichts (3–4). Für die Messung bekommt der Grund kurz
  seine flache Grundfarbe (per CSSOM, CSP unverändert), Messung und Schwelle (≤ 2) sind dieselben. Den Verlauf selbst
  prüft `tests/design.mjs` Teil G mit einer Messung, die das Muster wegmittelt, und einer eingebauten Kontrollkante.
- Unit-Tests: nichts angepasst – sie prüfen Regeln, die geblieben sind (Version, Häkchen, Ergebniszeile, Dialog-Fokus).

### Neue Tests
- `tests/design.mjs` (A–F, siehe Kopf der Datei): Kontrast jeder sichtbaren Textstelle gegen ihren echten Hintergrund –
  Bild ohne Text, Pixel im Textrahmen gegen die Textfarbe, 2-%-Perzentil, Deckkraft der Vorfahren eingerechnet. Zwei
  Durchgänge: Inhalt und Glas-Ebenen; bei den Glas-Ebenen bleibt der Verlauf dahinter sichtbar, also wird Text auf Glas
  mit dem gemessen, was darunter liegt. Platzhalter, Feldinhalte und Auswahllisten zählen mit. Dazu Schriften
  (document.fonts), kein Fremd-Request und kein CSP-Verstoß, kein seitliches Scrollen bei 320/390/768/1440 px,
  Glas-Unschärfe (Kantenstärke unter Kopfzeile und Band mit vs. ohne `backdrop-filter`), deckende Varianten. 18
  Hauptansichten × Chromium/WebKit × Hell/Dunkel × 390/1440 px als Screenshots in `screenshots/design/`.
- `tests/design-leistung.mjs`: Gespräch mit ≥ 50 Nachrichten (Fragen mit Quellen, Diktate mit Entwurfskarten, Berichte),
  ganz hinunter und wieder hinauf – Bild für Bild per Skript (1200 px/s) und per Mausrad; Abstand zwischen zwei Bildern
  (requestAnimationFrame) und lange Frames (long-animation-frame); Vergleich ohne Unschärfe.

### Messwerte
Alle Werte aus `screenshots/design/messwerte.json` und `leistung.json` (finaler Lauf, 15.11.2026).
- **Kontrast:** 3 952 Textstellen in 144 Ansichten (18 Ansichten × Chromium/WebKit × Hell/Dunkel × 390/1440 px), alle
  ≥ 4,5:1. Kleinster Wert je Gruppe: Chromium Hell 4,97 (Weiß auf #1A6FD0, z. B. „Speichern“, Avatar „G“), Chromium
  Dunkel 5,49 (#04182E auf #3391F0), WebKit Hell 4,97, WebKit Dunkel 4,68 („PHYSIOWORKS“ in der Kopfzeile, gemessen mit
  scharfem Text dahinter – WebKit zeichnet die Unschärfe nicht, also der ungünstigste Fall). Ausgenommen: deaktivierte
  Bedienelemente (392 Stellen über alle Ansichten, z. B. ausgegraute Auswahl-Chips) und der Markenpunkt (108).
- **Schriften:** DM Sans und Red Hat Display in jedem Lauf „loaded“, beide Dateien geladen; Text „DM Sans“, Überschrift
  „Red Hat Display“ 700; Inter nirgends mehr.
- **Kein Fremd-Request:** alle Anfragen an die eigene Adresse; kein CSP-Verstoß der App (WebKit-Auswahlliste siehe
  Testgrenzen).
- **Kein seitliches Scrollen:** bei 320, 390, 768 und 1440 px in allen 18 Ansichten, Chromium und WebKit.
- **Glas wirkt (Chromium):** Kantenstärke des Verlaufs unter dem Glas (eigener Inhalt ausgeblendet) – mit Unschärfe
  höchstens 0,9–1,2 Stufen, ohne Unschärfe 35–44 Stufen (Kopfzeile und Eingabe-Band, 320/390/768/1440, Hell/Dunkel).
  WebKit: nicht messbar (Testgrenze).
- **Grund ohne Kante:** größter Sprung zwischen 8×8-Mitteln 0,9–1,8 Stufen (Schwelle 3), roh springt das Dither-Muster
  um bis zu 3; die eingebaute Kontrollkante wurde mit 6,0–6,6 Stufen sicher erkannt.
- **Deckend:** „Bewegung reduzieren“ (Chromium + WebKit), „Transparenz reduzieren“ (Chromium per CDP) und der
  `@supports not`-Rückfall (eingespielt, Chromium + WebKit): Kopfzeile, Band, Eingabefeld, Schnellaktion und Dialog
  ohne `backdrop-filter`, Fläche deckend (Alpha 1), Übergänge 0 s.
- **Scroll-Leistung** (Chromium, neue Headless-Variante mit GPU/Metal, Gespräch mit 50 Nachrichten und 6 Karten, ganz
  hinunter und wieder hinauf, Last des Macs 3–5):
  | | Bild für Bild (1200 px/s) | Mausrad |
  |---|---|---|
  | 390 px, mit Glas | 983 Bilder, längstes 16,8 ms, 0 ausgelassen | 807 Bilder, längstes 33,4 ms, 21× ein Bild ausgelassen |
  | 390 px, Unschärfe aus | 983 Bilder, 16,8 ms, 0 | 810 Bilder, 33,4 ms, 21× |
  | 390 px, alter Stand v2.1.2 | 991 Bilder, 16,8 ms, 0 | 807 Bilder, 33,4 ms, 16× |
  | 1440 px, mit Glas | 765 Bilder, 16,8 ms, 0 | 646 Bilder, 33,4 ms, 4× |
  | 1440 px, Unschärfe aus | 765 Bilder, 16,8 ms, 0 | 645 Bilder, 33,4 ms, 6× |
  | 1440 px, alter Stand v2.1.2 | 765 Bilder, 16,8 ms, 0 | 650 Bilder, 33,4 ms, 6× |

  Kein Bildabstand über 34 ms, keine langen Frames (≥ 50 ms). Die einzelnen 33,4-ms-Abstände beim Mausrad (= genau ein
  ausgelassenes Bild bei 60 Hz) gibt es gleich oft ohne Unschärfe und im alten Stand – sie kommen vom eingespielten
  Mausrad, nicht vom Glas. Gemessen am Mac, nicht auf einem Handy (siehe Offen 15).

### Testgrenzen
- **Playwright-WebKit zeichnet `backdrop-filter` headless gar nicht** (Kontrollprobe ohne App: Text hinter einer
  Unschärfe-Fläche bleibt scharf). Die WebKit-Screenshots zeigen das Glas darum nur abgetönt – so sieht es in echtem
  Safari nicht aus. Ein iOS-Simulator ist auf dem Mac nicht installiert (kein Xcode). Die Glas-Wirkung in Safari habe ich
  also nicht selbst gesehen; die WebKit-Kontraste gelten für den ungünstigeren Fall ohne Unschärfe.
- **Die alte Chromium-Headless-Shell** zeichnet `backdrop-filter` nach manchen Stil-Umschaltungen nicht mehr (Bild ohne
  Unschärfe, obwohl die Seite sie hat; gemessen). `tests/design.mjs` und `tests/design-leistung.mjs` nutzen darum die
  neue Headless-Variante mit GPU (`channel: "chromium"`, Metal); `GABI_CHROMIUM_SHELL=1` schaltet zurück.
- **WebKit meldet beim Einsetzen der Sortier-Auswahl CSP-Verstöße** (`style-src-attr`, Ziel `<select>`): WebKit gibt
  der Auswahl eigene Inline-Stile, die `style-src 'self'` blockt. Schon in v2.1.2 genauso (gegen `main` geprüft),
  harmlos; der Test zählt sie getrennt. Playwright-Screenshots erzeugen in WebKit eigene CSP-Meldungen (eingefügtes
  `<style>`) – der CSP-Teil läuft darum ohne Screenshots.
- **Zeitkritische Schritte von `tests/v2.mjs` unter Last:** Während der Arbeit lief der Mac mit Last 9–29 (10 Kerne;
  andere Sitzungen: eine VM, Clip-Aufnahmen mit Playwright und ffmpeg, ein RUGGED-Agent mit 100 % CPU). Dabei brachen
  einzelne zeitkritische Schritte ab – jedes Mal ein anderer: Push-to-Talk „schließende iPhone-Tastatur“ (Block 2, 2×),
  „Wegziehen nach oben“ (Block 2, 1×), „Neuladen mitten in der Antwort“ (Block 3b, 2×, Warten auf strömende Antwort).
  Gegenproben: Der unveränderte Test gegen den unveränderten `main` (v2.1.2) brach unter derselben Last noch früher ab
  (Block 1, erste Mikrofon-Aufnahme). Einzeln laufen die Schritte immer (Push-to-Talk-Block 3/3 komplett grün, Diktat
  gegen `main` 6/6). Mit Farben, Glas oder Schrift haben sie nichts zu tun. Darum ist der Gesamtlauf in Teilen belegt
  (siehe „Getestet“) statt in einem einzigen grünen Durchgang.

### Getestet (v2.3)
- **Unit-Tests:** 159 von 159 grün (unverändert).
- **`tests/design.mjs` (A–G, finaler Lauf):** 427 von 427 grün, 6 Hinweise „WebKit-Glasprobe nicht messbar“.
- **`tests/design-leistung.mjs`:** 4 von 4 grün (siehe Tabelle).
- **`tests/v2.mjs` (bisherige Ende-zu-Ende-Tests):** Unter der hohen Last kein einzelner durchgehender Lauf; belegt in
  Teilen, alle mit dem finalen Stand:
  - Gesamtlauf bis Block 3 (Blöcke 1, 2, 2b, 3): 315 grün, 1 rot (Push-to-Talk „Wegziehen nach oben“ unter Last 22),
    danach Abbruch in 3b (Warten auf eine strömende Antwort, 30 s).
  - Push-to-Talk-Block aus Block 2 einzeln: 3 Läufe, je 12 von 12 grün.
  - Blöcke 3b, 3c und 4 bis 4b als Nachlauf aus derselben Datei: 54 + 65 grün, 0 rot.
  - Block 5 (`tests/eingabefelder.mjs`, Chromium + WebKit, 320/390/1440, Hell/Dunkel): 133 von 133 grün – Cursor,
    Platzhalter und „gyÄÖ“ mit den neuen Schriften ohne Anschnitt.
  - Schein-Messung (Block 2b) mit der Anpassung: 18 von 18 grün (Schritte ≤ 2, Schein 7–11 Stufen).
- **PDF:** Notiz und Bericht in Node erzeugt und angesehen (Streifen, Pill, Punkte blau; Helvetica; Testbanner).
- **Sichtprüfung:** alle 144 Screenshots als Kontaktbögen, dazu einzelne Bilder in voller Größe (Glas-Ausschnitte von
  Kopfzeile und Band). Behoben dabei: Kopf der eigenen Blase zu blass, verworfener Entwurf zu blass, Schatten der
  Seitenleiste lief in den Inhalt. Die alten Bilder unter `screenshots/*.jpg` zeigen noch v2.1.
- **Nicht geprüft:** echtes Safari/iPhone (siehe Testgrenzen), echte Claude-Antworten (unverändert, kein Worker-Diff).

## v2.4 – Brain + Glas-Design zusammen, Einstellungen, Brain im neuen Look (15.11.2026, Branch `gabi-v2-4`, nicht live)

Auftrag von Julius (15.11.2026): Brain-Stand und PhysioWorks-Glas-Design zusammenführen, Einstellungen einbauen
(Hell/Dunkel/System), Brain-Ansicht in den neuen Look ziehen; gründlich und vollständig testen. Kein Push, kein Deploy,
keine Live-Änderung, Worker unverändert, nur Test- und Demodaten. Brain bleibt hinter seinem Schalter (Standard AUS).

**Ausgangsstand:** `gabi-v2-4` neu von `gabi-brain` (754720f: Physik, Labels, Osteopathie-Fix D12), darauf
`gabi-v2-3-design` (c9d82a5) gemergt. Gearbeitet in einem eigenen Worktree mit eigenen Ports: 8792 (Brain AN) und
8793 (Brain AUS). 8788 (Live-Vorschau) und 8790 (Julius' alter Brain-Server) blieben unberührt.
`worker/src` ist gegenüber `gabi-brain` unverändert (`git diff --quiet gabi-brain gabi-v2-4 -- worker/src` leer).

### Konfliktlösung beim Merge (2e0457f)
- **index.html:** Schrift-Preloads aus v2.3 (DM Sans, Red Hat Display) + Brain-Teile aus `gabi-brain`; alle `?v=` auf
  2.4.0.
- **app.js:** nur `VERSION` stritt (Brain 2.2.0-brain, Design 2.3.0) → 2.4.0. Brain-Logik unverändert.
- **README.md:** beide Datei-Listen und Test-Aufrufe behalten.
- **worker/test/oberflaeche.test.js:** erwartete Fassung 2.4.0.
- **style.css und brain.css** liefen ohne Konflikt zusammen – das Brain hat eine eigene Datei mit eigenen `--brain-*`
  Tokens. Die eigentliche Angleichung ist darum Handarbeit in Teil 3 (unten), kein Merge-Ergebnis.
- Beifang: Auf `gabi-brain` liegt ein versehentlich eingecheckter Ordner `http:/localhost:8794/` (Screenshots eines
  früheren Testlaufs mit falsch übergebenem Pfad). Er ist mitgekommen; nicht gelöscht, weil er nicht aus diesem Auftrag
  stammt – kann bei Gelegenheit weg.

### Was neu ist
- **Einstellungen** (Zahnrad unten links in der Seitenleiste, unten in der Schublade am Handy): nativer `<dialog>` im
  Glas-Look wie die anderen Dialoge, Escape und Schließen geben den Fokus an den Auslöser zurück.
  - **Darstellung:** Hell / Dunkel / System (Standard System) als Segment-Wahl (Radios, Pfeiltasten).
  - **Transparenz:** Schalter „Glas-Effekt“. Aus = deckend wie bei „Transparenz reduzieren“; die Systemeinstellungen
    („Transparenz reduzieren“, „Bewegung reduzieren“) bleiben vorrangig: dann bleibt es deckend, egal wie der Schalter steht, und ein Hinweis darunter sagt warum.
  - **Konto und Gerät:** Version (aus `VERSION`, dazu „Demo“/„Brain an“), Hinweis „Gespräche nur auf diesem Gerät“,
    „Alle Gespräche löschen“ (bestehende Rückfrage), „Abmelden“ (bestehende Rückfrage mit Häkchen; in der Demo
    stattdessen „Mit Server verbinden“ wie im Info-Dialog).
  - **Später:** Benutzerkonto, Praxis-Einstellungen, Datenschutz als deaktivierte Zeilen „Folgt“ (ohne Funktion).
  - Weitere Abschnitte: ein `<section class="einstellungen-abschnitt">` mit Überschrift dazu; Speichern über
    `GabiDarstellung.setzen()` oder eigene Schlüssel.
- **`darstellung.js`** (neu, 3,7 KB, im `<head>` vor `style.css`): setzt vor dem ersten Bild `data-thema`
  (hell/dunkel), `data-thema-wahl` und `data-glas="aus"` am `<html>` und `meta theme-color`. Externe Datei statt
  Inline-Skript wegen CSP `script-src 'self'`. Gespeichert nur in `localStorage` „gabi.darstellung“, jeder Zugriff in
  try/catch (ohne Speicher: System + Glas an). „System“ folgt dem Betriebssystem auch bei offener Seite; andere Tabs
  ziehen über das `storage`-Ereignis mit. Meldet Änderungen als Ereignis „gabi:darstellung“.
- **Brain im neuen Look:** Kopf, Zähler, Reiter, Filter, Suche, Detail-Panel, Legende, Zoom-Knöpfe, Minikarte, Liste,
  Lücken, Fähigkeiten und Dialoge auf die v2.3-Tokens (Schrift, Ecken, Schatten, Akzent). Glas für die Leisten über
  dem Graphen (Knöpfe, Legende, Fokus, Stand, Minikarte) und für Detail-Panel und Mehr-Menü; Kennzahlen und
  Filter-Leiste als Glas ohne Unschärfe. Bühne des Graphen ruhig (#F8FAFD hell, #051F3B dunkel), mit feiner Innenkante.
- **Version 2.4.0**, `darstellung.js` ist die 9. eigene Datei mit `?v=` (Unit-Test angepasst).

### Entscheidungen
1. **Ein Dunkel-Block, gesteuert über `data-thema`.** Die Dunkel-Tokens standen in `@media (prefers-color-scheme:
   dark)`. Sie stehen jetzt unter `:root[data-thema="dunkel"]` (style.css und brain.css) – sonst bräuchte „Dunkel“
   bei hellem System und „Hell“ bei dunklem System jeweils eine zweite Kopie aller Tokens. `darstellung.js` setzt das
   Attribut immer, auch bei „System“; ohne Skript bliebe Hell.
2. **Deckend gewinnt im Dunkeln:** Die Regeln für „Transparenz/Bewegung reduzieren“ und den @supports-not-Rückfall
   haben den Selektor `:root[data-thema], :root:not([data-thema])` (Spezifität 0,2,0), damit sie den Dunkel-Block
   (0,2,0, aber früher) sicher überschreiben. `:root[data-glas="aus"]` nutzt dieselben deckenden Tokens.
3. **Canvas live ohne Neuladen:** Der Graph liest seine Farben aus den `--brain-*`-Variablen. Statt des alten
   `matchMedia`-Listeners hört `brain-ansicht.js` auf „gabi:darstellung“ und ruft `farbenNeu()` – ein Neuzeichnen,
   kein neues Layout (gemessen: gleiche Labels an gleicher Stelle).
4. **Knotenfarben: Bedeutung vor Marke.** Acht Arten bleiben unterscheidbar (Blau, Orange, Indigo, Violett, Pink,
   Petrol, Grau, Ocker), abgestimmt auf Marine/Blau der Palette: Praxiswissen = PhysioWorks-Akzent #1A6FD0
   (dunkel #5AA6F4). Alle Knotenfarben ≥ 4,3:1 zur Bühne (≥ 3:1 genügt für Grafik), Labels auf ihrer Platte ≥ 9,5:1
   auch über Knoten.
5. **Fokusfalle im Einstellungs-Dialog selbst gebaut:** `showModal()` hält Tab in Chromium nicht im Dialog, WebKit
   springt ohne „Tab zu allen Bedienelementen“ gar nicht auf Knöpfe. Der Dialog führt Tab/Umschalt+Tab darum selbst
   im Kreis (nur sichtbare, aktive Ziele; bei der Segment-Wahl nur das gewählte Radio). Die anderen Dialoge bleiben,
   wie sie waren (ihre Tests unverändert).
6. **Einstellungen über der Schublade (Handy):** Die Schublade bleibt offen; Escape schließt nur die Einstellungen,
   ein zweites Escape die Schublade – wie bei den anderen Dialogen aus der Schublade.
7. **Glas-Schalter ändert nur das Glas,** keine Übergänge (die hängen an „Bewegung reduzieren“).

### Getestet (alles mit dem finalen Stand, Browser-Tests nacheinander, Last vor jeder Zeitmessung geprüft)
- **Unit (Vitest):** 920 von 920 grün (20 Dateien; neu: `darstellung.js` als 9. Datei mit `?v=2.4.0`, Fassung 2.4.0,
  Dunkel-Block unter `:root[data-thema="dunkel"]`, Bühnenfarben #F8FAFD/#051F3B).
- **`tests/einstellungen.mjs` (neu, Chromium + WebKit):** 86 von 86 grün – gegen den Server ohne Brain (8793) und mit
  Brain (8792). Öffnen über Seitenleiste und Schublade, Abschnitte und „Folgt“-Zeilen, 320/390/768/1440 px ohne
  seitliches Scrollen, Hell/Dunkel sofort ohne Neuladen, gespeichert nach Neuladen, „System“ folgt dem Gerät live,
  Glas an/aus, Systemeinstellung vorrangig, Version, Alle löschen (Rückfrage), Abmelden mit Häkchen (echter lokaler
  Server, Code „test“), Tastatur (14× Tab bleibt im Dialog, Pfeiltasten, Escape → Fokus zurück), Handy-Schublade.
  - **Kein Aufblitzen gemessen:** gespeichert „dunkel“ bei hellem System, „hell“ bei dunklem, „system“ bei dunklem –
    in beiden Engines steht `data-thema` schon, wenn `<body>` entsteht, und das erste gemalte Bild hat die richtige
    Grundfarbe (rgb(7,45,83) bzw. rgb(237,244,250)).
- **`tests/brain-thema.mjs` (neu, Chromium + WebKit, 1440 und 390 px):** 20 von 20 grün. Hell → Dunkel → Hell über die
  Einstellungen: die Label-Platten im Canvas wechseln sofort (rgb 253,254,255 → 7,40,74 → 253,254,255), Bühne
  rgb(5,31,59), ohne Neuladen, gleiche Labels an gleicher Stelle. **Kontrast der Graph-Labels** (Pixel der Platte
  gegen die Textfarbe, 2-%-Perzentil, 29 Labels am Laptop): Hell kleinster 14,67:1, Dunkel kleinster 11,39:1.
- **`tests/design.mjs` (erweitert):** Gesamtlauf 552 grün + 14 rot – alle 14 Mess-Artefakte des neuen Tests, kein
  Fehler der Oberfläche (siehe „Tests angepasst“); nach der Korrektur Teil A bei 390 px und Teil H komplett erneut:
  276 von 276 grün. Zusammen: **204 Ansichten, 7 200 Textstellen ≥ 4,5:1, kleinster 4,68:1** (Untertitel
  „PHYSIOWORKS“ im Dunkeln, wie in v2.3). Einstellungen 8 Ansichten, kleinster 5,94:1; Brain 52 Ansichten / 3 016
  Textstellen, kleinster 4,68:1. Glas-Effekt aus: alle Glasflächen deckend ohne Unschärfe (Chromium + WebKit,
  Hell + Dunkel); Rückfall ohne backdrop-filter, Bewegung/Transparenz reduzieren, Grund ohne Kante, Schriften, kein
  Fremd-Request, kein CSP-Verstoß – grün wie in v2.3.
- **Brain (Server mit Schalter AN):** `tests/brain.mjs` 650 von 650 (inkl. Teil 1 „ohne Schalter“: keine Brain-Datei
  geladen, `#/brain` führt ins Gespräch); `brain-r1-antwort` 66/66, `brain-r1-daten` 174/174, `brain-r1-handy`
  319/319, `brain-r1-sicherheit` 94/94, `brain-labels-zoom` 24/24, `brain-physik` 64/64; `brain-r1-graph` siehe unten.
- **`brain-r1-graph`:** 1. Lauf (Last 4) 272 grün, 2 rot – Fund 4 „Auswahlring bleibt“ in beiden Engines, weil der
  Test fest nach *grünen* Ring-Pixeln suchte; der Ring ist jetzt blau (Akzent). Test liest nun `--brain-g-akzent`
  → 7/8 Ring-Punkte, grün. 2. Lauf: Chromium grün, WebKit 12 rot bei Last 17 (Bild-für-Bild-Animation, Doppeltipp-
  Pausen) – einzeln nachgefahren bei Last 6: **WebKit 137 von 137 grün**. Lastbedingt, kein Fehler.
- **Leistung (`brain-leistung.mjs`, Last 3,7):** 100/300/500 Knoten, Laptop und Handy, Chromium und WebKit: **60
  Bilder/s** im Layout, beim Verschieben/Zoomen und beim Ziehen; 95 % der Bilder ≤ 18 ms; Zeichnen ≤ 1 ms je Bild;
  0 Bilder in Ruhe; Layout bis zur Ruhe 1,76 s; JS-Speicher 4,7 MB bei 500 Knoten.
- **`tests/v2.mjs` (ohne Schalter, 8793):** **564 von 564 grün in einem Lauf**, inklusive Push-to-Talk/Mikrofon und
  Neuladen-Schritten, die in v2.3 lastbedingt ausfielen (Last zu Beginn 15, am Ende 7). Ein Nachfahren war darum
  nicht nötig; Block 5 (Eingabefelder) eingeschlossen.
- **Gegenprobe:** `tests/einstellungen.mjs` gegen `gabi-v2-3-design` (c9d82a5, eigener Server 8794): rot in Chromium
  und WebKit („Einstellungen und Darstellung fehlen … Stand vor v2.4?“), gegen v2.4 grün. Zuerst stürzte der Test dort
  ab statt sauber rot zu melden – jetzt bricht er mit einer roten Prüfung ab.
- **Sichtprüfung:** Einstellungen und alle Brain-Ansichten (Graph, Detail, Mehr-Menü, Liste, Lücken, Fähigkeiten,
  Schublade) in Hell/Dunkel bei 390 und 1440 px angesehen, dazu Kontaktbögen. Auffällig nur, was unter „Offen“ steht.

### Tests angepasst
- `design.mjs` Teil F: Rückfall-Regex auf den neuen Selektor (`:root[^{]*\{…\}`); Schalter „Glas-Effekt aus“ als
  eigene Prüfung (Übergänge bleiben dort erlaubt).
- `design.mjs` Kontrast: Leisten und Panels über dem Graphen (Knöpfe, Legende, Fokus, Stand, Detail, Mehr-Menü)
  zählen als Glas-Ebene. **Zwei offene Dialoge** (Handy: Einstellungen über der Schublade): nur der oberste wird
  gemessen – die Schublade liegt hinter dessen `::backdrop` abgedunkelt und inaktiv (vorher 2 Artefakte: 3,94/4,04 auf
  dem Schubladen-Knopf). **Legenden-Zeichen „?“ im Ring** ausgenommen: das ist das Bild des Graph-Zeichens (Grafik,
  WCAG 1.4.11); der Ring in derselben Farbe reicht kantengeglättet in die Ecken des Schriftrahmens und drückte die
  Messung auf 1:1 (12 Artefakte). Echte Farben: #A65510 auf hell 4,74:1, #F6A85A auf dunkel 7,16:1.
- `brain-r1-graph.mjs` Fund 4: Ring-Farbe aus dem Token statt fest grün.

### Testgrenzen (wie v2.3)
- Playwright-WebKit zeichnet `backdrop-filter` nicht: In WebKit-Bildern liegt Text hinter Glas scharf darunter (z. B.
  Schublade hinter den Einstellungen am Handy). Chromium mit GPU zeigt die Unschärfe; echtes Safari/iPhone nicht
  gesehen.
- Echter Claude-Weg (Gespräch mit Brain-Kontext über die Anthropic-API) nicht geprüft – lokal ohne Schlüssel, Worker
  unverändert.

## v2.5 – „Bitte prüfen“ erledigbar, Notiz per Gespräch ändern (15./16.11.2026, Branch `gabi-v2-5`, nicht live)

Auftrag von Julius (15.11.2026): (A) Prüfliste abhakbar, (B) Notiz per Gespräch ändern, im Stand v2.4; vorher
Aufräumen. Kein Push, kein Deploy, keine Live-Änderung, nur Testdaten; Worker-Deploy nur nach seiner Freigabe.
Gearbeitet in einem eigenen Worktree mit eigenen Ports: 8795 (ohne Brain), 8796 (Brain AN), 8797 (Gegenprobe v2.4).

**Aufräumen (eigener Commit 51f51ce):** Ordner `http:/localhost:8794/` (49 alte Brain-Screenshots eines Testlaufs mit
falsch übergebenem Pfad) aus `gabi-v2-5` entfernt. Auf `gabi-brain` liegt er weiter – dort nicht angefasst.

### Was neu ist
- **(A) „Bitte prüfen“ zum Abhaken** – in der Entwurfskarte und in der Notiz-Ansicht:
  - Häkchen je Punkt, Zähler „2 von 3 erledigt“, erledigte Punkte dezent durchgestrichen. Sind alle erledigt, wird der
    Kasten blau, mit Häkchen statt Warnzeichen.
  - **Automatisch erledigt:** Wird die „(unklar)“-Stelle im Text korrigiert (Markierung entfernt oder die Zeile
    umgeschrieben), ist der zugehörige Punkt erledigt – mit dem Hinweis „im Text korrigiert“. Dieses Häkchen lässt sich
    nicht abwählen. Steht die Stelle wieder mit „(unklar)“ da, ist der Punkt wieder offen.
  - Korrekturmeldungen der Spracherkennung („„Isg“ als „ISG“ gelesen“) haben keine markierte Stelle: nur von Hand.
  - Ein Häkchen in der Notiz wird sofort gespeichert. Ein Häkchen im Entwurf gehört zur Karte und wird beim
    „Speichern“ mit der Notiz übernommen.
  - Gabi selbst sieht nur noch die offenen Punkte als „unklar“, auch im Tagesüberblick und in Berichten. Erledigte
    stehen getrennt als „unklar_erledigt“. Das PDF nennt erledigte Punkte mit „– erledigt“ und den Zähler.
- **(B) Notiz per Gespräch ändern** – z. B. „Ändere bei TP-01 die Beinpresse auf 35 kg“:
  - Gabi antwortet mit einer **Änderungskarte**. Die betroffenen Abschnitte stehen darin, unveränderte Zeilen leise,
    die geänderte Zeile hervorgehoben (Vorher/Nachher, der geänderte Teil markiert). Darunter „Übernehmen“ und
    „Verwerfen“ und der Satz „Das Original-Diktat bleibt unverändert“.
  - Erst „Übernehmen“ speichert – über denselben Weg wie „Bearbeiten“ im Notizordner (PATCH /api/notizen/:id).
  - Mehrdeutiges Ziel (zwei passende Notizen oder Zeilen): Gabi fragt mit Datum und Zeile nach.
  - Vage Wünsche („mach es besser“): freundliche Absage mit Nachfrage, was genau geändert werden soll.
  - Ohne Kürzel: Gabi fragt danach.
  - Im Worker gibt es nur lesende Werkzeuge plus `notiz_aenderung_vorschlagen`, das Vorschläge anzeigt. Kein
    Schreibwerkzeug. Das Werkzeug lehnt ab, was nicht wörtlich in der Notiz steht, „Bitte prüfen“ oder das Diktat
    betrifft. Höchstens 5 Zeilen je Vorschlag, 3 Vorschläge je Nachricht.
- **Demo:** Beides läuft ohne KI. Änderungswünsche beantwortet ein vorbereiteter Ablauf: nachfragen, ablehnen oder
  Karte zeigen. Jede dieser Antworten endet mit „Vorbereitete Antwort ohne KI (Demo-Modus).“
- **Gemeinsame Logik in `notizlogik.js`:** dieselbe Datei für Oberfläche, Demo und Worker. Der Worker importiert sie,
  `wrangler deploy --dry-run` bündelt sie mit.
- **Version 2.5.0:** `notizlogik.js` ist die 10. eigene Datei mit `?v=`.

### Speicherung – keine Schemaänderung, keine Migration
- Die Prüfliste stand schon in der Notiz: `notes.strukturiert.unklar` (JSONB, Liste von Texten).
- Der Status kommt ins selbe JSONB-Feld: `strukturiert.pruefung = [{ punkt, erledigt, stelle? }]`. `punkt` ist der
  Text des Prüfpunkts; `stelle` ist die markierte Stelle im Text (Abschnitt, Ausschnitt „bis zu drei Wörter +
  (unklar)“, gemeinsame Schlüsselwörter).
- Darum keine SQL-Migration nötig, `supabase/migrations` unverändert.
- Alte Notizen ohne `pruefung` bleiben gültig: Alle Punkte sind offen, das Feld fehlt, bis es etwas zu merken gibt.
- **Worker-Änderung nötig (nicht deployt):**
  - `normalisieren()` warf unbekannte Felder weg und behält jetzt `pruefung`.
  - Neue PATCH-Form `{ pruefpunkt: { punkt, erledigt } }`: setzt nur dieses Häkchen, auf dem gespeicherten Stand.
    Inhalt, Diktat und „bearbeitet“ bleiben.
  - Neue PATCH-Form `{ strukturiert, pruefung_basis }`: führt die Häkchen dreiseitig zusammen.
  - Neues Werkzeug und neue Prompt-Regeln.
  - **Reihenfolge beim Livegang:** zuerst der Worker, dann die Oberfläche. Der Worker allein ist rückwärtsverträglich:
    Die v2.4-Oberfläche schickt weder `pruefung` noch `pruefung_basis`, die gespeicherten Häkchen bleiben dann.

### Entscheidungen
1. **Status im JSONB statt eigener Spalte oder Tabelle.**
   - Die Prüfliste steht schon dort, also auch ihr Status.
   - Keine Migration, alte Notizen bleiben gültig.
   - Der Punkt wird über seinen Text erkannt, nicht über eine Nummer: So überlebt der Status Umsortieren und das
     Zusammenführen.
   - Wird der Text eines Prüfpunkts selbst geändert, ist es ein neuer Punkt (offen).
2. **„Automatisch erledigt“ hängt an der Stelle, nicht am Prüfpunkt-Text.**
   - Beim Entwurf und vor jeder Änderung wird jeder Punkt der markierten Stelle mit den meisten gemeinsamen Wörtern
     zugeordnet und die Stelle festgehalten.
   - Offen bleibt der Punkt, solange im Abschnitt eine Zeile mit „(unklar)“ steht, die den Ausschnitt oder alle
     Schlüsselwörter enthält.
   - Damit gilt: Markierung entfernt → erledigt. Zeile umgeschrieben → erledigt. Wieder mit „(unklar)“ versehen →
     offen. Nur woanders in der Zeile etwas geändert, die Markierung steht noch → offen, denn die Stelle ist noch als
     unklar markiert.
   - Korrekturmeldungen („… als … gelesen“) haben keine markierte Stelle: Sie sind nur von Hand abzuhaken.
3. **Häkchen von Hand und automatisch:** Ein Punkt ist erledigt, wenn eins von beiden zutrifft. Ein automatisch
   erledigter Punkt lässt sich nicht von Hand „wieder öffnen“; dafür markiert man die Stelle wieder mit „(unklar)“.
4. **Zwei Tabs:**
   - Ein Häkchen speichert nur diesen einen Punkt, auf dem gespeicherten Stand des Servers.
   - Beim Bearbeiten schickt die Oberfläche `pruefung_basis` mit (die Häkchen beim Laden). Der Server führt dreiseitig
     zusammen: Was dieser Tab geändert hat, gilt; sonst das Gespeicherte.
   - Notizinhalt bei zwei Tabs: wie bisher, der letzte Speichervorgang gewinnt (unverändert seit v2.0).
5. **„Übernehmen“ wendet auf den frisch geladenen Stand an:**
   - Steht die Vorher-Zeile dort nicht mehr (die Notiz wurde inzwischen geändert), wird nichts gespeichert. Die Karte
     sagt „passt nicht mehr“.
   - Dieselbe Karte in zwei Tabs: Sperre und Ablage-Abgleich wie beim Entwurf, die Änderung kommt genau einmal an.
   - Gelöschte Notiz: Hinweis auf der Karte, nichts wird neu angelegt.
6. **Kein Schreibwerkzeug.**
   - `notiz_aenderung_vorschlagen` liest die Notiz und zeigt die Karte, es speichert nichts.
   - Es nimmt nur Zeilen, die wörtlich in der Notiz stehen (sonst Fehler an Claude: „bitte zuerst lesen“).
   - Gezählt werden nur angezeigte Vorschläge. Ein abgelehnter darf korrigiert wiederholt werden.
   - Im Fähigkeiten-Register wurde „Notiz per Gespräch ändern“ von „geplant (Phase 4)“ zu „aktiv“, Stufe
     „vorschlagen“, mit Knopf „Übernehmen“. Benutzerkonten, Änderungsprotokoll und „Rückgängig“, dort früher als
     Voraussetzung genannt, gibt es noch nicht (siehe Offen).
7. **Prompt bewusst erweitert:**
   - Regeln zum Ändern: nur Gesagtes, mehrdeutig nachfragen, Vages ablehnen, Diktat und „Bitte prüfen“ nie.
   - Regel 7 sagt jetzt auch „Du löschst auch nichts“.
   - Bedienung um Änderungskarte und Prüfliste ergänzt.
   - Die Fingerabdruck-Tests des Prompts („Ohne Brain bleibt alles wie in Worker 2.0.1“) sind auf den neuen Stand
     gesetzt.
   - Kernregel-Belege und Brain-Prompt passen weiter (Tests grün).
8. **Brain unverändert:** keine Datei des Brain angefasst.
   - `brain-seed.js` ist neu erzeugt, weil das Fähigkeiten-Register darin steht.
   - Das neue Werkzeug steht auch in der Werkzeugliste mit Brain, so wie alle Gesprächswerkzeuge.
   - Im Demo-Modus mit Brain greift der Änderungsablauf nur mit Kürzel. „Ändere die Telefonzeiten: …“ bleibt ein
     Brain-Befehl.
9. **Demo-Assistent:**
   - Erkennt „ändere/korrigier/setz … die/den <Begriff> auf <Zahl> [Einheit]“, optional „in der Notiz vom TT.MM.“ oder
     „in der letzten/ersten Notiz“.
   - Ersetzt nur den ersten Wert hinter dem Begriff. Die Einheit der Zeile bleibt.
   - Mehr kann die Demo nicht. Der echte Claude-Weg versteht freiere Formulierungen.

### Tested
All runs were sequential; the load was checked before every timing measurement. Every run below is on the final
state.

**Unit tests**
- **Vitest:** 949 of 949 green (21 files).
- **New file `worker/test/pruefliste-aenderung.test.js`** (29 tests):
  - Status logic: open, assigning marked spots, done automatically, open again, manual tick, cleanup.
  - Merging for two tabs.
  - Change suggestion: checking, applying, conflict, before/after.
  - Worker routes and tool.
  - Claude path against the mocked API.
  - Prompt rules: change only what was said, ask back, add nothing, no gender, don't save, don't delete.
  - Demo answers, also with the Brain switch.
  - History hint, end states of the card.
- **Adjusted, intentionally:**
  - Tool lists in `chat.test`, `brain-worker.test`, `faehigkeiten.test`: 7 instead of 6 tools.
  - Prompt fingerprints.
  - Capability register: "Notiz per Gespräch ändern" is active.
  - Stamp test: 10 files, 2.5.0.

**`tests/v25.mjs` (new, Chromium + WebKit): 134 of 134 green**
- Matrix 320/390/1440 × light/dark: checklist, struck-through items, counter, touch target ≥ 44 px on the phone,
  change card, Übernehmen, original dictation unchanged, no sideways scrolling.
- Demo in depth:
  - Keyboard (space bar), reload.
  - Automatically done when the text is corrected, and open again.
  - Tick in the draft survives reload and is saved with the note.
  - Ambiguous target, vague request, Verwerfen, card state after reload.
- Real local server:
  - Two tabs (different ticks; editing with an old state; Übernehmen twice → exactly one change).
  - Deleted note, note changed in the meantime.
  - Logging out while saving: Übernehmen and tick. Logout waits about 2.5 s, the change and the tick are saved.

**Counter-check against `gabi-v2-4`**
- Own server 8797. `tests/v25.mjs` is red in both engines: 46 red, both features independently in every section.
  Only the 16 "keine Skriptfehler" checks stay green.
- The new unit file can't run on v2.4 (module missing). With the logic file copied in, 19 of 28 are red; only the
  pure logic tests of the new module pass.

**Existing suites, all green**

| Suite | Result |
|---|---|
| `tests/v2.mjs` (without switch) | 564/564 in one run, including microphone and reload |
| `tests/design.mjs` A–H | 607/607 |
| `tests/einstellungen.mjs` (8795 and 8796) | 86/86 each |
| `tests/brain.mjs` | 650/650 |
| brain-r1-antwort / -daten / -graph / -handy / -sicherheit | 66 / 174 / 274 / 319 / 94 |
| brain-labels-zoom | 24/24 |
| brain-physik | 64/64 |
| brain-thema | 20/20 |
| brain-leistung | 60 frames/s with 500 nodes, laptop and phone, both engines |

- design.mjs measured 220 views and 7,892 text spots, smallest contrast 4.68:1. New views 07b (change card) and 15b
  (checklist ticked): at least 4.68 and 5.35.

**Found and fixed during testing**
- `design.mjs`: 4.56:1 on the marked "Nachher" value. The thin border sat right on the glyph edge; it's gone now
  (4.97:1).
- Phone: after a tap, the hover box stayed behind the ticked item. Hover now only with a real pointer.
- `design.mjs`: the change view interfered with the glass probe (different content under the header). It is now 07b,
  after the probe.
- Demo with Brain:
  - The new flow caught "Ändere die Telefonzeiten: TP 1 …" (`brain-r1-sicherheit` red, 4×).
  - With Brain it now only takes concrete note changes; the command form and vague requests stay with the Brain, as
    in v2.4. Unit test added.
- `brain.mjs` expected 6 planned capabilities, there are 5 now.

**Load-related**
- In a first `design.mjs` run, part D (offline view at 320 px) timed out at load 32. The full run at load 4–7 was green.
- `tests/v25.mjs` ran once more at load 15–26: 134/134.

**Untested**
- The **real Claude path** (no key locally). Tested only against the mocked Anthropic API: tool call, card event,
  tool result.
- Whether Claude follows the new rules in real conversations (change only what was said, ask back when ambiguous,
  decline vague requests) is open → Offen 22.

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
15. **Glas in echtem Safari und auf dem iPhone ansehen** (v2.3): Playwright-WebKit zeichnet `backdrop-filter` nicht,
    ein iOS-Simulator ist nicht installiert. Die Kontraste halten auch ohne Unschärfe (gemessen). Am iPhone prüfen:
    Kopfzeile und Eingabe-Band beim Scrollen (Text dahinter unscharf, nichts ruckelt), Schublade, Dialoge. Die
    Leistung ist nur am Mac gemessen; auf älteren iPhones wären Kopfzeile + Band die einzigen Unschärfe-Ebenen.
16. ~~**Brain-Ansicht nicht umgebaut** (v2.3)~~ – erledigt in v2.4 (Brain auf den Tokens, Knotenfarben auf der Palette).
    Damals: `gabi-brain` liegt nicht in diesem Stand (eigener Branch). Beim
    Zusammenführen bekommt das Brain die neuen Tokens; eigene Farben dort (Graph, Knoten) dann auf `--pw-*` umstellen.
17. **v2.2 fehlt** (v2.3): Einen Branch `gabi-v2-2` („Bitte prüfen“/Notiz per Gespräch) gab es nicht, darum basiert
    `gabi-v2-3-design` auf `main`. Wird v2.2 später gebaut, sind beim Zusammenführen Konflikte in `style.css`,
    `index.html` und `VERSION` zu erwarten (Version dann 2.3.x oder höher wählen).
18. **Glas über dem Graphen am iPhone ansehen** (v2.4): wie 15, dazu Legende, Zoom-Knöpfe, Minikarte, Detail-Blatt und
    Mehr-Menü über dem Canvas. Unter 1024 px haben die kleinen Graph-Leisten bewusst keine Unschärfe (weniger
    Ebenen am Handy), nur Tönung.
19. **Label unter den Zoom-Knöpfen (Handy)** (v2.4, Sichtprüfung): Öffnet ein Knoten am linken Rand sein Detail, kann
    das Label eines Nachbarn („Kontakt“) unter der Glas-Leiste der Zoom-Knöpfe liegen und schimmert durch. Vorher
    verdeckte die deckende Leiste es ganz. Label-Regeln und Kamera bleiben laut Auftrag unverändert – wenn es stört:
    Labels unter Leisten ausblenden (eigene kleine Änderung an `brain-graph.js`).
20. **Ordner `http:/localhost:8794/` auf `gabi-brain`** (in v2.5 auf `gabi-v2-5` entfernt; auf `gabi-brain` noch da) (gefunden beim Merge v2.4): versehentlich eingecheckte
    Screenshots eines älteren Testlaufs (Pfad als Ordner gelesen). Mit v2.4 mitgekommen, nicht gelöscht, weil nicht aus
    diesem Auftrag – kann mit `git rm -r "http:"` weg.
21. **Einstellungen „Folgt“** (v2.4): Benutzerkonto, Praxis-Einstellungen, Datenschutz sind nur Platzhalter ohne
    Funktion. Neue Abschnitte: eine `<section class="einstellungen-abschnitt">` im Dialog, Werte in `einstellungenFuellen()`.
22. **Echter Claude-Weg für v2.5 ungetestet** (kein Schlüssel lokal): Ob Claude nur Gesagtes ändert, bei zwei
    passenden Notizen nachfragt und Vages ablehnt, ist nur über Prompt-Regeln und die nachgebaute API geprüft. →
    Julius: auf Staging oder live mit Code drei Fälle: „Ändere bei TP-01 die Beinpresse auf 35 kg“, „Ändere bei TP-01
    die Flexion auf 110 Grad“ (zwei Notizen – muss nachfragen), „Mach die Notiz von TP-02 besser“ (muss ablehnen).
23. **Worker-Deploy für v2.5 nötig – nur nach Julius' Freigabe.** Reihenfolge: erst Worker, dann Oberfläche (die
    v2.5-Oberfläche gegen den alten Worker verliert Häkchen still: der alte Worker kennt `pruefpunkt` nicht). Der
    Worker bringt gegenüber dem Live-Stand (main) auch den Brain-Code aus `gabi-brain` mit – ohne gesetzten Schalter
    inaktiv (`wrangler.toml` setzt keinen BRAIN-Wert).
24. **„Notiz per Gespräch ändern“ ohne Rückgängig und ohne Änderungsprotokoll.** Im Fähigkeiten-Register waren dafür
    früher Benutzerkonten, ein Änderungsprotokoll und „Rückgängig“ als Voraussetzung genannt. Gebaut ist: Vorschlag,
    Bestätigung, Konflikt-Erkennung. Eine übernommene Änderung lässt sich nur von Hand zurückändern („Bearbeiten“).
25. **Gleichzeitiges Bearbeiten derselben Notiz in zwei Tabs:** Häkchen werden zusammengeführt, der Inhalt nicht –
    wie seit v2.0 gewinnt das letzte Speichern. Nur „Übernehmen“ prüft, ob die Zeile noch dasteht.
26. **„Bitte prüfen“ im Gespräch abhaken** (Register: weiter „geplant“): Abhaken geht in Notiz und Entwurf, nicht per
    Sprache/Gespräch.

