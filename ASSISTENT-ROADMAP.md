# Gabi – vom Aufnahme-Tool zum Assistenten (Roadmap)

Stand: 10.11.2026 · gehört zum Brain-Prototyp (Branch `gabi-brain`). Dieses Dokument beschreibt den Weg in acht Phasen.
**Gebaut sind die Phasen 1 und 2 (live) und Phase 3 als Prototyp. Die Phasen 4 bis 8 sind nur vorbereitet, nicht
gebaut** – hier steht, was jeweils vorher geklärt sein muss. Nichts in diesem Dokument ist eine Zusage.

Verwandte Dateien: `FAEHIGKEIT-VORLAGE.md` (Checkliste und Code-Skelett für jede neue Fähigkeit),
`worker/src/faehigkeiten.js` (Register aller Fähigkeiten), `GABI-V2-LOG.md` und `GABI-BRAIN-LOG.md` (was wann gebaut
und gemessen wurde).

## Überblick

| Phase | Titel | Stand |
|---|---|---|
| 1 | Aufnahme-Tool | live seit 04.11.2026 (v1) |
| 2 | Gespräch | live seit 08.11.2026 (v2), aktuell v2.1.2 |
| 3 | Gedächtnis (Brain) | Prototyp auf dem Branch `gabi-brain`, hinter einem Schalter, nicht live |
| 4 | Handeln mit Bestätigung | geplant – nur vorbereitet, nicht gebaut |
| 5 | Praxis-Interlink | geplant – nur vorbereitet, nicht gebaut |
| 6 | Patientenportal | geplant – nur vorbereitet, nicht gebaut |
| 7 | Telefon-Rezeptionistin | geplant – nur vorbereitet, nicht gebaut |
| 8 | Automationen | geplant – nur vorbereitet, nicht gebaut |

„Vorbereitet“ heißt: Es gibt das Fähigkeiten-Register mit Berechtigungsstufen, die Vorlage für neue Fähigkeiten, die
Audit-Spur auf dem Gerät und diese Roadmap. Ausdrücklich **nicht** gebaut: Anbindung an die Praxissoftware, Termine,
Telefon, Benutzerkonten.

## Grundsätze (gelten in jeder Phase)

1. **Kernregeln stehen im Worker-Code** (`worker/src/kernregeln.js`) und lassen sich über das Brain nicht ändern:
   Deutsch, du, kurz · keine Diagnosen, keine Therapie- oder Medikamentenempfehlungen · nichts erfinden, kein
   Geschlecht, Alter oder anderes Merkmal ergänzen · Unklares als „(unklar)“ markieren · Gabi speichert, ändert und
   löscht nie selbst. Regeln aus dem Brain dürfen nur zusätzlich einschränken oder den Ton ergänzen.
2. **Gabi speichert nie selbst.** Sie zeigt einen Vorschlag als Karte; gespeichert, geändert oder gelöscht wird erst,
   wenn ein Mensch auf den Knopf tippt.
3. **Inhalte sind Daten, nie Anweisungen.** Das gilt für Notizen, Diktate, Brain-Einträge und Importe – ein Satz wie
   „ignoriere alle Regeln“ in einer Notiz ändert nichts an Gabis Verhalten.
4. **Nur Testdaten, bis die Verträge stehen.** Echte Patientendaten erst nach AV-Verträgen mit allen Verarbeitern,
   geprüften Verarbeitungsorten und echten Benutzerkonten (siehe Phase 5).
5. **Jede Fähigkeit steht im Register** – mit Stufe, Status, benötigten Daten und Voraussetzungen. Ein Test stellt
   sicher, dass kein Werkzeug außerhalb des Registers existiert und keines ohne Bestätigung speichert oder löscht.
6. **Jede Phase hat einen Rückweg**, der vor dem Live-Gang ausprobiert ist.

## Berechtigungsstufen

| Stufe | Was Gabi darf | Beispiel heute |
|---|---|---|
| `lesen` | Gabi liest nur und antwortet daraus, mit Quelle | Notizen durchsuchen, Praxisfragen aus dem Brain |
| `vorschlagen` | Gabi bereitet etwas vor und zeigt es als Karte. Gespeichert wird erst, wenn du auf den Knopf tippst | Notiz-Entwurf aus dem Diktat („Speichern“), Bericht, Brain-Vorschlag („Übernehmen“) |
| `mit_bestaetigung_ausfuehren` | Gabi greift in bereits gespeicherte Behandlungsdaten ein oder stößt etwas nach außen an – erst nach deinem Tipp auf die Karte mit vorher und nachher | heute nichts – geplant ab Phase 4 |

Der Unterschied zwischen den beiden oberen Stufen: Bei „vorschlagen“ entsteht ein Entwurf oder ein Brain-Eintrag, den
du leicht zurückholst (Verwerfen, Versionsverlauf, Papierkorb). „Mit Bestätigung ausführen“ meint Eingriffe in
gespeicherte Notizen oder nach außen (Termin, Nachricht) – dafür braucht es zusätzlich Benutzerkonten und ein
Protokoll, wer wann was bestätigt hat. In beiden Fällen gilt: Ohne deinen Tipp passiert nichts.

Eine vierte Stufe „ohne Bestätigung ausführen“ gibt es nicht. Sie käme frühestens in Phase 8 infrage und wäre für jede
einzelne Automation eine eigene, ausdrückliche Entscheidung.

Eine Fähigkeit steigt nur eine Stufe auf einmal – und erst, wenn die niedrigere Stufe im Alltag erprobt ist.

---

## Phase 1 – Aufnahme-Tool

- **Ziel:** Behandlung diktieren, Gabi macht daraus eine sortierte Notiz (Befund, Maßnahmen, Verlauf, Hausaufgaben).
  Gespeichert wird erst nach Prüfung. Dazu der Notizordner mit Suche, Bearbeiten, Löschen und PDF.
- **Stand:** live seit 04.11.2026 (v1), heute Teil von v2.1.2.
- **Voraussetzungen:** erfüllt – Cloudflare Worker als einzige Stelle mit Schlüsseln, Datenbank in Frankfurt, ein
  gemeinsamer Zugangscode, nur Testdaten.
- **Risiken:** Hörfehler der Spracherkennung (Fachbegriffe werden als Hinweis mitgegeben; Unsicheres wird „(unklar)“
  und steht unter „Bitte prüfen“) · erfundene Angaben (Regeln im Prompt, Prüfung durch die Therapeutin vor dem
  Speichern) · ein Code für alle (kein Nachweis, wer was getan hat).
- **Datenschutz:** nur erfundene Test-Patienten, Kürzel mit Ziffer. Spracherkennung bei Cloudflare (ohne
  Speicherung), Strukturierung bei Anthropic (USA). Die Aufnahme wird nirgends gespeichert. Logs ohne Inhalte.
- **Tests:** Unit-Tests für Routen, Eingabeprüfung, Härtung und Notizformat; Browser-Tests vom Diktat bis zum PDF.
- **Rückweg:** Stand von v1 per `git revert` (Befehl in `GABI-V2-LOG.md`, „Live-Gang“).

## Phase 2 – Gespräch

- **Ziel:** Startbildschirm ist ein Gespräch. Gabi beantwortet Fragen zu Notizen mit Quellen, schreibt Verlaufsberichte
  und Zusammenfassungen (Karte und PDF) und beantwortet Fragen zur Praxis. Mehrere Gespräche, nur auf dem Gerät.
- **Stand:** live seit 08.11.2026 (v2), Gesprächsverlauf seit 09.11.2026 (v2.1), aktuell v2.1.2.
- **Voraussetzungen:** erfüllt – Werkzeuge nur zum Lesen und Vorschlagen; Speichern nur über den Knopf.
- **Risiken:** falsche oder erfundene Antworten (Gabi antwortet nur aus Werkzeug-Ergebnissen, sonst „Dazu habe ich
  nichts gespeichert.“) · Anweisungen, die in Notizen versteckt sind (Inhalte gelten als Daten) · Tempo und Kosten des
  Modells · offene Punkte aus dem Betrieb stehen in `GABI-V2-LOG.md` unter „Offen“.
- **Datenschutz:** Gespräche liegen nur im Browser des Geräts, nie auf dem Server. Der Worker bekommt je Frage den
  Verlauf zum Antworten und speichert nichts davon. In der Adresse steht nur die Gesprächs-ID.
- **Tests:** Unit-Tests mit nachgebauter Anthropic-API (Werkzeuge, Strom, Ersatzmodell, Abbruch), Browser-Tests in
  Chromium und WebKit, Handy und Laptop, Hell und Dunkel.
- **Rückweg:** Oberfläche zurück auf den vorigen Stand per `git revert`, Worker per `wrangler rollback` (beide
  Befehle in `GABI-V2-LOG.md`).

## Phase 3 – Gedächtnis (Brain)

- **Ziel:** Gabi bekommt ein Gedächtnis: das Brain, ein sichtbarer, bearbeitbarer Wissensgraph. Praxisfragen
  beantwortet sie **nur** daraus, zeigt die genutzten Knoten als Quellen, sammelt Fragen ohne Antwort als Lücken und
  schließt sie im Brain-Interview. Neues Wissen kommt nur als Vorschlag mit „Übernehmen“ ins Brain.
- **Stand:** Prototyp auf dem Branch `gabi-brain`, hinter einem Schalter (im Code aus). Läuft im Demo-Modus und
  lokal; das Brain liegt dabei nur auf dem Gerät. Die Ablage in der Datenbank ist als Code und Migration vorbereitet
  (nicht ausgeführt), ein Staging-Worker ist beschrieben (nicht deployt). Die Brain-Fähigkeiten stehen im Register
  mit dem Status „entwurf“ (gebaut, hinter dem Schalter). Einzelheiten und Messwerte: `GABI-BRAIN-LOG.md`.
- **Voraussetzungen fürs Live-Schalten:** Freigabe durch Julius · der echte Claude-Weg ist im Staging erprobt (eigener
  Schlüssel, eigener Zugangscode) · die „Zu klären“-Punkte sind mit Philipp besprochen. Für **gemeinsames** Bearbeiten
  über mehrere Geräte: zuerst Benutzerkonten und Rollen (Admin = Philipp), dann die Ablage in der Datenbank.
- **Risiken:** versteckte Anweisungen in Brain-Einträgen oder Importen (der Worker prüft, bereinigt und übergibt sie
  klar abgegrenzt als Daten; importierte Regeln wirken erst nach Bestätigung) · falsches Wissen wird bestätigt
  (Status, Quelle und Versionsverlauf je Knoten, Hinweis „veraltet“) · Datenverlust, solange das Brain nur auf einem
  Gerät liegt (Export, Papierkorb, Rückfrage beim Abmelden) · zwei offene Tabs (Schutz über Versionszähler).
- **Datenschutz:** Das Brain enthält Praxiswissen, keine Patientendaten. Test-Patienten und Notizen erscheinen nur als
  schreibgeschützte Knoten mit Kürzel und Datum. Je Frage gehen nur die ausgewählten Knoten (höchstens 8) an
  Anthropic. Keine Inhalte in Adressen oder Logs.
- **Tests:** Unit-Tests für Modell, Suche, Speicher, Worker-Prüfung (auch Injektionsversuche), unverrückbare
  Kernregeln und das Register; Browser-Tests in Chromium und WebKit; Leistung mit 100, 300 und 500 Knoten.
- **Rückweg:** Schalter aus – die App verhält sich wie v2.1.2 und lädt keine Brain-Datei. Solange der Branch nicht
  gemergt ist, ist nichts live.

## Phase 4 – Handeln mit Bestätigung

- **Ziel:** Gabi erledigt kleine, klar umrissene Änderungen – immer erst nach Tipp auf einen Knopf:
  „Bitte prüfen“-Punkte einer Notiz im Gespräch abhaken oder korrigieren, eine gespeicherte Notiz per Gespräch
  ändern (Karte mit Vorher und Nachher, dann „Übernehmen“).
- **Stand:** geplant – nur vorbereitet, nicht gebaut. Im Register stehen dafür zwei geplante Fähigkeiten mit der Stufe
  `mit_bestaetigung_ausfuehren`: „Bitte prüfen“ erledigen und „Notiz per Gespräch ändern“.
- **Voraussetzungen:** Phase 3 ist live und erprobt · Benutzerkonten und Rollen statt des gemeinsamen Zugangscodes ·
  ein Änderungsprotokoll (wer hat wann was bestätigt) · Rückgängig für jede Änderung (der Stand vor der Änderung
  bleibt abrufbar) · jede neue Fähigkeit nach `FAEHIGKEIT-VORLAGE.md`.
- **Risiken:** die falsche Notiz wird geändert (Karte nennt Kürzel und Datum, eine Notiz je Karte) · Bestätigen aus
  Gewohnheit (wenige, kurze Karten; Änderungen farblich markiert) · doppelte Ausführung in zwei Tabs (Endzustände
  der Karte wie bei den Entwürfen) · Gabi formuliert um, statt nur das Gewünschte zu ändern (Vorher/Nachher zeigt es).
- **Datenschutz:** wie Phase 2. Änderungen an Gesundheitsdaten müssen nachvollziehbar sein (wann, was, bei echten
  Konten auch wer).
- **Tests:** kein Werkzeug schreibt ohne Knopf (Spion-Speicher) · Karte verwerfen ändert nichts · zwei Tabs ·
  Abbruch mitten im Speichern · Gegenprobe gegen den Stand ohne Schutz.
- **Rückweg:** Fähigkeit im Register auf „entwurf“ stellen und das Werkzeug nicht mehr anbieten; geänderte Notizen
  über ihren Verlauf zurückholen.

## Phase 5 – Praxis-Interlink

- **Ziel:** Gabi kennt den Praxisalltag: Termine aus dem Kalender („Was steht heute an?“ mit echten Terminen) und
  Stammdaten aus der Praxissoftware – zunächst nur lesend. Schreiben in die Praxissoftware (z. B. fertige Notizen
  übergeben) wäre ein eigener, späterer Schritt. Im bisherigen Log heißt das „Baustein 2“.
- **Stand:** geplant – nur vorbereitet, nicht gebaut. Heute sagt Gabi offen, dass Kalender und Praxissoftware nicht
  angebunden sind.
- **Voraussetzungen:** Welche Praxissoftware, und hat sie eine Schnittstelle? · AV-Verträge mit allen Verarbeitern
  (Anthropic, Cloudflare, Supabase, Anbieter der Schnittstelle) · geprüfte Verarbeitungsorte, möglichst EU auch für
  KI und Spracherkennung · echte Benutzerkonten und Rollen statt des gemeinsamen Zugangscodes · Protokoll der
  Zugriffe · Aufbewahrungs- und Löschfristen · erst dann endet die Beschränkung auf Testdaten.
- **Risiken:** ab hier echte Patientendaten · Schreibzugriff auf das führende System der Praxis · Patienten werden
  falsch zugeordnet · Ausfall oder Änderung der Schnittstelle · Abhängigkeit von einem Anbieter.
- **Datenschutz:** Gesundheitsdaten nach Art. 9 DSGVO – vor dem Start mit Datenschutzberatung klären: Rechtsgrundlage,
  Verträge, Verarbeitungsorte, Berechtigungskonzept, Auskunft und Löschung.
- **Tests:** Testumgebung der Praxissoftware, zuerst nur lesend; Zuordnungstests mit erfundenen Daten; Ausfall der
  Schnittstelle; Rollen-Tests.
- **Rückweg:** Schnittstelle per Schalter abtrennen – Gabi arbeitet dann wie in Phase 4 weiter, die Praxissoftware
  bleibt das führende System.

## Phase 6 – Patientenportal

- **Ziel:** Patientinnen und Patienten sehen in einem eigenen Zugang, was die Praxis für sie freigegeben hat:
  Hausaufgaben und Hinweise. Gabi schlägt die Texte vor; hinaus geht nur, was eine Therapeutin oder ein Therapeut
  freigegeben hat. Denkbar später: organisatorische Fragen (Öffnungszeiten, Anfahrt, Leistungen) aus dem bestätigten
  Brain. Nichts Medizinisches von Gabi.
- **Stand:** geplant – nur vorbereitet, nicht gebaut. Das Brain mit Status und Quellen ist die Grundlage dafür.
- **Voraussetzungen:** Phase 5 · Patientenkonten mit sicherer Anmeldung und Einwilligung · im Brain eine Kennzeichnung,
  welche Knoten nach außen gezeigt werden dürfen · rechtliche Prüfung des Angebots · Datenschutzerklärung und
  Barrierefreiheit · die heutigen „Zu klären“-Punkte (z. B. Öffnungszeiten, Parken, Preise) sind beantwortet.
- **Risiken:** Gabi wird nach Diagnosen oder Übungen gefragt (Kernregeln, enger Themenkreis, Weiterleitung an die
  Praxis) · falsche oder veraltete Auskünfte nach außen (nur bestätigte, nicht veraltete Knoten) · eine Person sieht
  Daten einer anderen · Missbrauch von außen.
- **Datenschutz:** strikte Trennung zwischen internem Wissen und dem, was Patienten sehen; jede Person sieht nur
  Eigenes; Einwilligung, Auskunft und Löschung je Person.
- **Tests:** Rollen-Tests (fremde Daten bleiben unsichtbar), Fragenkatalog mit Grenzfällen (medizinische Fragen,
  Beschwerden, Notfälle), Last- und Missbrauchstests.
- **Rückweg:** Portal abschalten, ohne dass die interne App davon berührt wird.

## Phase 7 – Telefon-Rezeptionistin

- **Ziel:** Gabi nimmt Anrufe entgegen, wenn das Büro nicht kann: beantwortet organisatorische Fragen aus dem Brain,
  nimmt Terminwünsche und Rückrufbitten auf und legt sie dem Team als Vorschlag hin.
- **Stand:** geplant – nur vorbereitet, nicht gebaut.
- **Voraussetzungen:** Phase 5 (Termine) · Telefonie-Anbieter und Sprach-KI mit geklärten Verarbeitungsorten · klare
  Ansage, dass eine KI-Assistenz spricht · jederzeit Übergabe an einen Menschen · ein vollständiges, aktuelles Brain –
  heute fehlen dort unter anderem die Öffnungszeiten der Praxen.
- **Risiken:** Missverständnisse am Telefon · Notfälle (sofort an Menschen oder Notruf verweisen, nie selbst
  einschätzen) · Aufzeichnung ohne Einwilligung · Ausfall genau dann, wenn niemand im Büro ist.
- **Datenschutz:** Gesprächsinhalte sind personenbezogen; Aufzeichnung und Mitschrift nur mit Einwilligung, kurze
  Speicherfristen, kein Training mit den Gesprächen.
- **Tests:** Testanrufe nach festem Szenarien-Katalog (Dialekt, Lärm, Unterbrechungen, Notfall, Beschwerde),
  Übergabe an Menschen, Ausfall der Telefonie.
- **Rückweg:** Rufumleitung zurück aufs Büro bzw. den Anrufbeantworter.

## Phase 8 – Automationen

- **Ziel:** Wiederkehrendes läuft von selbst an – und endet weiterhin als Vorschlag: Erinnerung an offene
  „Bitte prüfen“-Punkte, Hinweis auf veraltete Brain-Knoten, Berichtsentwurf zum Ende einer Behandlungsreihe,
  Terminerinnerungen (mit Phase 5 und 6).
- **Stand:** geplant – nur vorbereitet, nicht gebaut. Register und Audit-Spur sind die Grundlage.
- **Voraussetzungen:** Phasen 4 und 5 · Zeitsteuerung im Worker und Benachrichtigungen · Benutzerkonten und Rollen ·
  für jede Automation ein eigener Eintrag im Register und eine eigene Freigabe · Obergrenzen für Häufigkeit und Kosten.
- **Risiken:** Fehler, die niemand bemerkt, weil kein Mensch den Anstoß gab · zu viele Benachrichtigungen ·
  unbemerkte Kosten · schleichender Übergang zu „ohne Bestätigung“ (deshalb gibt es diese Stufe im Register nicht).
- **Datenschutz:** jede Automation verarbeitet nur die Daten, die ihr Register-Eintrag nennt; Protokoll, was wann
  gelaufen ist (ohne Inhalte).
- **Tests:** Trockenlauf ohne Wirkung, Protokoll je Lauf, Obergrenzen, Verhalten bei Ausfall, Gegenprobe.
- **Rückweg:** jede Automation einzeln abschaltbar, dazu ein Schalter für alle.
