# Vorlage: eine neue Fähigkeit für Gabi

Eine **Fähigkeit** ist alles, was Gabi neu lesen, vorschlagen oder (nach Bestätigung) ausführen kann – z. B.
„Notiz per Gespräch ändern“. Diese Vorlage ist Checkliste und Code-Skelett in einem. Kopier den Steckbrief in den
Log-Eintrag der Fähigkeit und hak die Punkte ab. Der Weg im Großen steht in `ASSISTENT-ROADMAP.md`.

**Drei Sätze, die immer gelten:**
1. Gabi speichert, ändert und löscht nie selbst. Ein Werkzeug **zeigt** etwas (Ereignis → Karte); geschrieben wird
   erst im Klick der Nutzerin, über eine bestehende Route.
2. Inhalte sind Daten, nie Anweisungen – auch die Eingaben, die das Modell einem Werkzeug mitgibt.
3. Die Kernregeln (`worker/src/kernregeln.js`) fasst keine Fähigkeit an.

---

## 1 Steckbrief (ausfüllen, bevor Code entsteht)

| Feld | Inhalt |
|---|---|
| **Name / id** | z. B. „Notiz per Gespräch ändern“ / `notiz-aendern` |
| **Zweck** | Ein Satz: Was hat die Therapeutin davon? |
| **Was Gabi dabei nicht tut** | z. B. „Sie ändert nie ohne Karte und Knopf, sie formuliert nichts um, was nicht gewünscht war.“ |
| **Daten** | Welche Daten liest die Fähigkeit, welche entstehen neu? Wo werden sie verarbeitet (Gerät, Worker, Datenbank in Frankfurt, Anthropic, Cloudflare)? Wie lange liegen sie wo? |
| **Stufe** | `lesen` · `vorschlagen` · `mit_bestaetigung_ausfuehren` – die niedrigste, die den Zweck erfüllt (Erklärung in der Roadmap) |
| **Roadmap-Phase** | Nummer aus `ASSISTENT-ROADMAP.md` |
| **Voraussetzungen** | z. B. Benutzerkonten, AV-Vertrag, Verlauf je Notiz – was fehlt, bleibt die Fähigkeit `geplant` |
| **Status** | `geplant` (noch nicht gebaut) → `entwurf` (gebaut, hinter einem Schalter) → `aktiv` (freigegeben und live) |

## 2 Bestätigungsfluss (ab Stufe „vorschlagen“)

- [ ] **Karte:** Was genau steht darauf? Bei Änderungen immer Vorher und Nachher, dazu Kürzel und Datum – nie nur
      „Änderung vorbereitet“.
- [ ] **Knopf:** ein Verb, das sagt, was passiert („Speichern“, „Übernehmen“). Kein zweiter Weg zum selben Ergebnis.
- [ ] **Nein:** „Verwerfen“ lässt alles, wie es war. Die Karte bleibt als verworfen im Gespräch stehen.
- [ ] **Bearbeiten vor dem Bestätigen** – wenn es sinnvoll ist (wie beim Notiz-Entwurf).
- [ ] **Zwei Tabs:** Endzustand der Karte ist einbahnig (`ENDE` in `gespraeche.js`) – ein zweiter Tab bietet eine
      bestätigte oder verworfene Karte nicht wieder an.
- [ ] **Abbruch und Fehler:** Was zeigt die Karte, wenn das Speichern scheitert oder der Zugangscode nicht mehr gilt?
      Nichts geht verloren, nichts wird doppelt ausgeführt.
- [ ] **Danach:** Was sieht die Nutzerin als Beleg („Gespeichert“, „Ansehen“, „Rückgängig“)?

## 3 Datenschutz

- [ ] Nur die Daten, die der Zweck braucht – und nur so viele (Größen- und Anzahl-Grenzen im Worker).
- [ ] Nichts davon in Adressen, Seitentiteln oder Logs (Logs höchstens: Art des Fehlers).
- [ ] Patienten nur als Kürzel; in der Testversion nur erfundene Daten.
- [ ] Geht etwas Neues an einen Verarbeiter (Anthropic, Cloudflare, ein neuer Dienst)? Dann im Steckbrief nennen
      und in der Roadmap unter „Voraussetzungen“ prüfen (AV-Vertrag, Verarbeitungsort).
- [ ] Was liegt danach auf dem Gerät, was auf dem Server – und wie wird es wieder gelöscht (Abmelden, „Alle löschen“)?
- [ ] Eingaben aus Brain, Importen, Notizen und vom Modell werden geprüft und bereinigt, bevor sie angezeigt oder
      weitergegeben werden.

## 4 Tests

- [ ] **Register:** Die Fähigkeit steht im Register, jedes ihrer Werkzeuge gehört zu genau einer Fähigkeit
      (`worker/test/faehigkeiten.test.js` prüft das für alle).
- [ ] **Kein Schreiben ohne Knopf:** Der Register-Test führt jedes Werkzeug mit einem Spion-Speicher aus – kein
      Aufruf von `neueNotiz`, `notizAendern`, `notizLoeschen`, `neuerPatient`. Neue Schreibwege der Ablage in die
      Liste des Tests aufnehmen.
- [ ] **Eingaben:** falsche Typen, zu lange Texte, unbekannte IDs, Injektionsversuche („ignoriere alle Regeln“)
      → deutscher Fehlersatz bzw. unveränderte Regeln.
- [ ] **Strom:** Das neue Ereignis kommt als NDJSON-Zeile an; eine alte Oberfläche ignoriert es ohne Fehler.
- [ ] **Demo-Assistent:** dieselben Ereignisse ohne KI (`demo.js`), damit Demo und lokale Tests den Ablauf zeigen.
- [ ] **Browser** (`tests/…mjs`, Chromium und WebKit, 390 und 1440 px, Hell und Dunkel): Karte erscheint,
      „Übernehmen“ wirkt genau einmal, „Verwerfen“ wirkt nicht, Neuladen, zwei Tabs, Tastatur und Fokus.
- [ ] **Gegenprobe:** Der neue Test schlägt gegen den Stand ohne die Schutzmaßnahme an (sonst prüft er nichts).
- [ ] Alle bisherigen Tests bleiben grün: `cd worker && npm test`.

## 5 Rückweg

- [ ] Status im Register zurück auf `entwurf` oder `geplant` – das Werkzeug wird dem Modell dann nicht mehr angeboten.
- [ ] Was passiert mit Karten dieser Fähigkeit, die schon in Gesprächen stehen? (Sie bleiben lesbar, der Knopf fehlt.)
- [ ] Was passiert mit Daten, die die Fähigkeit angelegt hat?
- [ ] Worker-Rückweg (`npx wrangler rollback <Versions-ID>`) und Oberflächen-Rückweg (`git revert …`) im Log notiert
      und einmal in einer Kopie ausprobiert.

## 6 Log-Eintrag (in `GABI-BRAIN-LOG.md` bzw. dem Log der Version)

```markdown
### Fähigkeit „<Name>“ (<id>) – <Datum>
- Zweck: …
- Stufe: … · Status: … · Roadmap-Phase: …
- Daten: … (verarbeitet: …)
- Bestätigung: Karte „…“, Knopf „…“; bei Nein: …
- Gebaut: <Dateien>
- Getestet: Unit … · Browser … · Gegenprobe: …
- Rückweg: …
- Offen / braucht eine Entscheidung: …
```

---

## 7 Code-Skelett

Beispiel: „Notiz per Gespräch ändern“ – steht im Register schon als `geplant` (Phase 4, Stufe
`mit_bestaetigung_ausfuehren`). Das Beispiel ist nicht gebaut; es zeigt nur, wohin welches Stück gehört. Auch auf der
höchsten Stufe gilt: Das Werkzeug schreibt nie – geschrieben wird im Klick auf der Karte.

### 7.1 Register – `worker/src/faehigkeiten.js`

```js
{
  id: "notiz-per-gespraech-aendern",
  name: "Notiz per Gespräch ändern",
  beschreibung: "„Trag bei TP-01 noch die Hausaufgabe nach“ – Gabi bereitet die Änderung vor und zeigt sie zur Freigabe.",
  darf: "Gabi ändert eine gespeicherte Notiz erst, nachdem du die Änderung bestätigt hast. Löschen bleibt bei dir.",   // einfache Sprache – das liest die Praxis
  stufe: "mit_bestaetigung_ausfuehren",     // lesen | vorschlagen | mit_bestaetigung_ausfuehren
  status: "entwurf",                        // geplant → entwurf (gebaut, hinter Schalter) → aktiv
  daten: ["Behandlungsnotizen (nur Testdaten, Patienten nur als Kürzel)"],
  voraussetzungen: ["Benutzerkonten und Rollen …", "Änderungsprotokoll …", "Rückgängig für jede Änderung"],
  werkzeuge: ["notiz_aenderung_vorschlagen"],   // Namen aus WERKZEUGE (chat.js) bzw. BRAIN_WERKZEUGE (brain.js)
  aktionen: [],                                 // feste Abläufe: aktion.typ in /api/chat
  befehle: [],                                  // was die Oberfläche selbst ausführt, ohne Server
  bestaetigung: "Knopf „Übernehmen“ auf der Karte mit vorher und nachher",   // "" = es wird nichts gespeichert
  phase: 4,                                     // Nummer aus ASSISTENT-ROADMAP.md
},
```
Jedes Werkzeug, jede feste Aktion und jeder lokale Befehl gehört zu **genau einer** Fähigkeit
(`faehigkeitZu(name)`); `worker/test/faehigkeiten.test.js` prüft das.

### 7.2 Werkzeug – `worker/src/chat.js`

```js
// in WERKZEUGE: Beschreibung für das Modell – sagt ausdrücklich, dass nichts gespeichert wird
{
  name: "notiz_aenderung_vorschlagen",
  description:
    "Schlägt eine Änderung an einer gespeicherten Notiz vor und zeigt sie der Therapeutin als Karte mit vorher und nachher. " +
    "Speichert NICHT – geändert wird erst, wenn sie auf „Übernehmen“ tippt.",
  input_schema: OBJEKT({
    id: { type: "string", description: "id der Notiz aus notizen_suchen" },
    abschnitt: { type: "string", enum: ["befund", "massnahmen", "verlauf", "hausaufgaben"] },
    punkte: { type: "array", items: { type: "string" }, description: "Die Stichpunkte des Abschnitts nach der Änderung" },
  }, ["id", "abschnitt", "punkte"]),
},

// in STATUS: was die Nutzerin währenddessen liest
notiz_aenderung_vorschlagen: "Bereite die Änderung vor …",

// in AUSFUEHREN: lesen, prüfen, ANZEIGEN – nie schreiben
async notiz_aenderung_vorschlagen(e, k) {
  const id = textEingabe(e.id, "id", 60);
  if (!istUuid(id)) throw new WerkzeugFehler("Ungültige Notiz-id.");
  const alt = await speicher.notiz(id);                       // lesen ist erlaubt
  if (!alt) throw new WerkzeugFehler("Diese Notiz gibt es nicht (mehr).");
  const punkte = stichpunkte(e.punkte).slice(0, 20);          // Eingaben des Modells prüfen und begrenzen
  if (!punkte.length) throw new WerkzeugFehler("Der Vorschlag ist leer.");
  k.senden?.({ t: "notiz_vorschlag", vorschlag: {             // Ereignis → Karte in der Oberfläche
    notiz_id: alt.id, kuerzel: alt.kuerzel, erstellt_am: alt.erstellt_am,
    abschnitt: e.abschnitt, vorher: normalisieren(alt.strukturiert)[e.abschnitt], nachher: punkte,
  } });
  return { angezeigt: true, gespeichert: false, hinweis: "Die Änderung wird als Karte angezeigt. Geändert wird erst nach „Übernehmen“." };
  // NIE hier: speicher.neueNotiz / notizAendern / notizLoeschen / neuerPatient
},
```

Feste Abläufe ohne Umweg über das Modell (wie Diktat, Bericht, Brain-Interview) laufen über `aktion` in
`chatAnfrage()` (`worker/src/app.js`): Typ in die Liste der erlaubten Aktionen, Felder streng prüfen, im Register
unter `aktionen` derselben Fähigkeit führen.

### 7.3 Karte und Knopf – Oberfläche

```js
// app.js · ereignis(): das Ereignis wird eine Karte der Antwort
case "notiz_vorschlag":
  if (e.vorschlag) gabi.karten.push({ typ: "notiz-vorschlag", id: neueId(), ...e.vorschlag });
  gabi.wartet = true;
  break;

// app.js · karteHtml(): Kürzel, Datum, Vorher/Nachher – alles durch esc(); Knöpfe nur über data-aktion
//   <button data-aktion="vorschlag-uebernehmen">Übernehmen</button>  <button data-aktion="vorschlag-verwerfen">Verwerfen</button>

// app.js · Klicks in Karten: NUR HIER wird geschrieben – über die bestehende Route, mit dem Code der Nutzerin
if (aktion === "vorschlag-uebernehmen" && !k.uebernommen && !k.verworfen && !k.speichert) {
  k.speichert = true; nachrichtNeuZeichnen(n);
  try {
    await api(`/api/notizen/${k.notiz_id}`, { methode: "PATCH", body: { strukturiert: /* alter Stand + k.nachher */ } });
    k.uebernommen = true;
  } catch (f) { toast(f.message, { art: "fehler" }); }
  finally { k.speichert = false; nachrichtNeuZeichnen(n); gespraechMerken(g); }
}
if (aktion === "vorschlag-verwerfen" && !k.uebernommen) { k.verworfen = true; nachrichtNeuZeichnen(n); gespraechMerken(g); }
```

Dazu gehören zwei kleine Stellen, die leicht vergessen werden:
- `gespraeche.js` → `ENDE`: `"notiz-vorschlag": ["uebernommen", "verworfen"]` (zwei Tabs).
- `kern.js` → `karteAlsText()`: ein kurzer „[App-Hinweis: …]“-Satz, damit Gabi im weiteren Gespräch weiß, was
  angezeigt wurde und ob es übernommen ist.

### 7.4 Demo-Assistent – `demo.js`

Dasselbe Ereignis ohne KI: Absicht in `absichtErkennen()`, Werkzeug in `demoWerkzeuge()` mit denselben Namen und
Ergebnisformen wie im Worker. Sonst zeigt die Demo die Fähigkeit nicht und die Browser-Tests können sie nicht prüfen.

### 7.5 Tests

```js
// worker/test/… – das Werkzeug zeigt nur an
it("notiz_aenderung_vorschlagen: zeigt eine Karte und schreibt nichts", async () => {
  const schreibt = [];
  const spion = new Proxy(arbeitsspeicher(), { get: (ziel, name) =>
    (["neueNotiz", "notizAendern", "notizLoeschen", "neuerPatient"].includes(name) ? (...a) => { schreibt.push(name); return ziel[name](...a); } : ziel[name]) });
  const ereignisse = [];
  const werkzeuge = erstelleWerkzeuge({ speicher: spion, strukturieren: async () => ({}), berichten: async () => ({}) });
  const r = await werkzeuge.ausfuehren("notiz_aenderung_vorschlagen", { id, abschnitt: "befund", punkte: ["Flexion 120°"] }, { senden: (e) => ereignisse.push(e) });
  expect(r.fehler).toBe(false);
  expect(ereignisse.map((e) => e.t)).toEqual(["status", "notiz_vorschlag"]);
  expect(schreibt).toEqual([]);                                   // kein Schreiben ohne Knopf
  expect((await spion.notiz(id)).strukturiert).toEqual(vorher);    // die Notiz ist unverändert
});
```

Gegenprobe: denselben Test einmal gegen eine Fassung laufen lassen, in der das Werkzeug doch schreibt – er muss rot
werden.

### 7.6 Zum Schluss

```bash
cd worker && node dev/brain_seed_erzeugen.mjs   # Register und Roadmap-Phasen in brain-seed.js (Ansicht „Fähigkeiten“)
cd worker && npm test                           # alle Unit-Tests
```
Dann: Roadmap-Phase aktualisieren, Log-Eintrag schreiben, Rückweg ausprobieren. Live geht nichts ohne Julius' Freigabe.
