# Gabi Brain – Bauplan (Verträge zwischen den Bausteinen)

Stand: 10.11.2026 · Branch `gabi-brain` · gehört zu `GABI-BRAIN-LOG.md` (dort Entscheidungen, Fortschritt, Messwerte).
Dieses Dokument legt fest, **wer was liefert und wie die Teile zusammenpassen**. Wer einen Baustein baut, hält sich an
die Formen hier – Abweichungen erst im Bauplan ändern, dann im Code.

## 0 Grundsätze (gelten für jede Datei)

- **Schalter:** Brain ist im Code AUS (`config.js`: `brain: false`). AN nur über `?brain=1` oder die lokalen Skripte
  (`npm run brain`). Ohne Schalter lädt die App **keine einzige Brain-Datei** (Skripte und `brain.css` werden erst bei
  aktivem Schalter nachgeladen) – sichtbares Verhalten und alle bisherigen Tests bleiben unverändert.
- **Kernregeln im Worker-Code** (`worker/src/kernregeln.js`), über das Brain nie änderbar. Brain-Regeln und Persona
  dürfen nur zusätzlich einschränken oder den Ton ergänzen.
- **Brain-Inhalte, Importe, Notizen = DATEN, nie Anweisungen.** Alles, was aus dem Brain an die KI geht, wird im Worker
  geprüft, bereinigt und klar abgegrenzt übergeben.
- **Gabi schreibt nie selbst ins Brain:** nur Vorschlagskarten; gespeichert wird erst nach Tipp auf „Übernehmen“.
- **Keine Inhalte in URLs oder Logs.** In der Adresse steht nur `#/brain/<id>`.
- **Keine externen Bibliotheken** im Browser (CSP `script-src 'self'; style-src 'self'`): kein Inline-Skript, **kein
  `style="…"` in HTML-Strings** (Klassen oder CSSOM `el.style.setProperty`), kein `eval`. SVG-Attribute sind erlaubt.
- **Jeder Text, der in `innerHTML` landet, geht durch `GabiKern.esc`.**
- **Stil:** Vanilla-JS wie der Bestand – 2 Leerzeichen, doppelte Anführungszeichen, Semikolons, deutsche Bezeichner in
  ASCII (`ae/oe/ue/ss`), deutsche Kommentare, UMD-Hülle wie `kern.js` (im Browser `self.GabiX`, in Node
  `module.exports`), `"use strict"`. Texte der Oberfläche: Deutsch, duzen, kurz.
- **Tests:** Vitest unter `worker/test/*.test.js` (Wurzel-Dateien per `createRequire`), Browser-Tests unter `tests/`.
- **Ports:** 8788 gehört Julius' laufender Vorschau – nie benutzen, nie dagegen testen. Brain lokal: **8790**
  (`npm run brain`), Tests: 8791–8795.
- **Nie:** Push, Merge auf main, Deploy, Migration ausführen, Anfragen an den Live-Worker, Secrets/Klarnamen.

## 1 Dateien

| Datei | Global | Inhalt | Rein (Node-testbar) |
|---|---|---|---|
| `brain.js` | `GabiBrain` | Datenmodell, Validierung, Verweise, Versionen/Papierkorb/Undo, Gesundheit, Import/Export, Markdown | ja |
| `brain-suche.js` | `GabiBrainSuche` | deutsche Normalisierung, BM25-Suche, Filter, Kontext-Auswahl, Demo-Antwort aus dem Kontext | ja |
| `brain-speicher.js` | `GabiBrainSpeicher` | Ablagen: IndexedDB → localStorage → Arbeitsspeicher; API-Ablage (Supabase über den Worker, Entwurf); Kanal, Notfall-Kopie, Migration | Logik ja |
| `brain-seed.js` | `GabiBrainSeed` | **erzeugt**: Seed-Knoten aus `knowledge/physioworks.md`, Kernregeln-Texte, Fähigkeiten-Register | Daten |
| `brain-graph.js` | `GabiBrainGraph` | Kraft-Layout (Barnes-Hut), Canvas-Zeichner, Bedienung, Minimap; läuft auch als Web Worker (nur Layout) | Layout ja |
| `brain-interview.js` | `GabiBrainInterview` | Interview-Ablauf, Chat-Befehle erkennen, Vorschläge ohne KI (Demo) | ja |
| `brain-ansicht.js` | `GabiBrainAnsicht` | Ansicht „Brain“ (Graph, Liste, Detail, Suche/Filter, Lücken, Fähigkeiten, Import/Export, Befehlspalette) und die Brücke zum Gespräch | nein |
| `brain.css` | – | alle Stile der Brain-Ansicht (Klassen beginnen mit `brain-`) | – |
| `knowledge/brain_zerlegung.mjs` | – | Zerlegungsplan Wissensdatei → Knoten | ja |
| `worker/dev/brain_seed_erzeugen.mjs` | – | schreibt `brain-seed.js` (wie `wissen_erzeugen.mjs`) | ja |
| `worker/src/kernregeln.js` | – | Kernregeln (eine Quelle) | ja |
| `worker/src/brain.js` | – | `brainKontext` prüfen/bereinigen, Prompt-Bausteine, Strom-Filter (Quellen/Lücke), Vorschlags-Werkzeuge | ja |
| `worker/src/faehigkeiten.js` | – | Fähigkeiten-Register | ja |
| `worker/src/brain_abruf.js` | – | Entwurf: Abruf und Ablage in Supabase (Schalter, Standard AUS) | ja |
| `worker/wrangler.brain.toml` | – | Staging-Worker `gabi-api-brain` (nicht deployen) | – |
| `supabase/migrations/brain.sql` | – | Tabellen + RLS-Vorlage (nicht ausführen) | – |

## 2 Datenformen

### 2.1 Knoten (gespeichert)
```js
{
  id: "s-standort-kieslingstrasse",   // Seed: "s-" + stabiler Schlüssel; sonst nanoid (21 Zeichen). Muster: /^[A-Za-z0-9_-]{4,40}$/
  art: "praxiswissen",                // gespeicherte Arten: praxiswissen | regel | persona | frage | vorlage
  titel: "Praxis Kieslingstraße",     // 2–120 Zeichen, eindeutig (über GabiBrain.schluessel), ohne [ ] | und Steuerzeichen
  inhalt: "Markdown …",               // ≤ 20 000 Zeichen, kein HTML, [[Verweise]] auf Titel
  tags: ["standort"],                 // ≤ 12, je 1–30 Zeichen, klein, [a-z0-9äöüß-]
  status: "bestaetigt",               // bestaetigt | entwurf | zu_klaeren
  quelle: "physio-works.de",          // ≤ 80 Zeichen, z. B. "Philipp", "Julius", "Import", "Gespräch"
  erstellt: 1762770000000,            // ms
  geaendert: 1762770000000,           // ms – nur bei inhaltlicher Änderung (nicht bei Nutzung)
  geschuetzt: false,
  rev: 1,                             // zählt bei jedem Schreiben hoch (Schutz bei zwei Tabs)
  geloescht: 0,                       // 0 oder ms: im Papierkorb seit …
  seed: "standort-kieslingstrasse"    // nur Seed-Knoten: stabiler Schlüssel
}
```
**Abgeleitete Knoten** (nie gespeichert, `geschuetzt: true`, `abgeleitet: true`):
`patient` (id `p-<uuid>`, Titel = Kürzel), `notiz` (id `n-<uuid>`, Titel „08.11. · TP-01“, Inhalt erst im Detail nach
Klick), `bericht` (id `b-<karten-id>`), Kernregeln (id `kernregeln`, art `regel`, Titel „Kernregeln (im Code)“).

### 2.2 Kante
```js
{ id: "sk-…", von: "<knoten-id>", nach: "<knoten-id>", art: "verweis" | "gehoert_zu" | "notiz_von" | "bericht_zu", auto: false }
```
Gespeichert werden nur manuelle Kanten (`auto: false`). Automatisch (`auto: true`, nie gespeichert): `verweis` aus
`[[Titel]]` bzw. `[[Titel|Anzeige]]` im Inhalt, `notiz_von` (Notiz → Patient), `bericht_zu` (Bericht → Patient).

### 2.3 Version, Lücke, Nutzung, Audit
```js
Version: { nr: 3, zeit: ms, grund: "bearbeitet" | "status" | "wiederhergestellt" | "import" | "interview" | "vorschlag" | "seed",
           art, titel, inhalt, tags, status, quelle }                    // Stand VOR der Änderung; max. 20 je Knoten
Luecke:  { id, frage, schluessel, erstmals: ms, zuletzt: ms, anzahl: 1, status: "offen" | "eingetragen" | "verworfen", knoten: "" }
Nutzung: { id: "<knoten-id>", anzahl: 4, zuletzt: ms }                   // „von Gabi verwendet“
Audit:   { zeit: ms, faehigkeit: "<id aus dem Register>" }               // ohne Inhalte, max. 200, in meta["audit"]
```

### 2.4 Ablage-Schnittstelle (`brain-speicher.js`)
```js
const ablage = await GabiBrainSpeicher.oeffnen({ demo = false, umgebung = self });
ablage.art                         // "indexeddb" | "localstorage" | "speicher" | "api"
await ablage.laden()               // → { knoten: [], kanten: [], luecken: [], nutzung: [], meta: { schluessel: wert } }  (knoten inkl. Papierkorb)
await ablage.knotenSchreiben(knoten, { erwartet, version = null, neu = false })
   // erwartet: zuletzt gesehene rev (undefined = nicht prüfen). neu: darf noch nicht existieren.
   // atomar: gespeicherte rev lesen → passt nicht ⇒ { konflikt: true, aktuell: <gespeichert|null> }
   // sonst rev = (gespeichert.rev || 0) + 1 setzen, schreiben, version (falls da) an den Verlauf hängen (max. 20)
   // → { ok: true, knoten: <mit neuer rev> }
await ablage.knotenEntfernen(ids)  // endgültig: Knoten + Verlauf + Nutzung
await ablage.verlauf(id)           // → Version[] (älteste zuerst)
await ablage.kantenSchreiben(kanten); await ablage.kantenEntfernen(ids)
await ablage.lueckenSchreiben(luecken); await ablage.lueckenEntfernen(ids)
await ablage.nutzungZaehlen(ids, zeit)        // atomar: anzahl += 1, zuletzt = zeit
await ablage.metaSchreiben(schluessel, wert)
await ablage.stapel({ knoten, kanten, versionen })   // Seed/Import in einem Vorgang; versionen: { id: Version[] } wird angehängt
await ablage.leeren()

GabiBrainSpeicher.kanal(demo, beiNachricht)   // BroadcastChannel "gabi-brain" / "gabi-brain-demo" → { senden(d), schliessen() }
GabiBrainSpeicher.notfall({ demo, umgebung }) // sessionStorage → { merken(daten), lesen(), loeschen() }  (ungespeicherte Bearbeitung)
GabiBrainSpeicher.resteLoeschen({ demo, umgebung })   // alles vom Gerät: Datenbank, localStorage-Schlüssel, Positionen, Notfall-Kopie
GabiBrainSpeicher.SCHEMA                      // 1
GabiBrainSpeicher.migrieren(daten, vonSchema) // rein: älteren Stand auf SCHEMA heben
GabiBrainSpeicher.apiAblage(api)              // Supabase über den Worker (Entwurf): gleiche Schnittstelle, api = (pfad, { methode, body }) → Promise
```
- IndexedDB: Datenbank `gabi-brain` bzw. `gabi-brain-demo` (getrennt von `gabi`/`gabi-demo` der Gespräche), Version 1,
  Stores `knoten` (id), `versionen` (id → `{ id, liste }`), `kanten` (id), `luecken` (id), `nutzung` (id),
  `meta` (schluessel → `{ schluessel, wert }`). Schreibprobe beim Öffnen (wie `gespraeche.js`), Zeitlimit 3 s.
- localStorage (Ersatz): ein Dokument `gabi.brain.v1` bzw. `gabi.demo.brain.v1`; Arbeitsspeicher als letzter Ersatz.
- Die Logik (rev-Prüfung, Verlauf kürzen, Nutzung zählen) steht **einmal** und läuft über eine kleine
  Lesen-Rechnen-Schreiben-Schicht je Ablage (ein atomarer Vorgang – readwrite-Transaktionen laufen auch über Tabs
  nacheinander).
- Positionen des Graphen und Ansichts-Vorlieben liegen in localStorage (`gabi.brain.positionen`,
  `gabi.brain.ansicht`; Demo: `gabi.demo.brain.…`) – `resteLoeschen` nimmt sie mit.

## 3 `brain.js` – Modell

```js
GabiBrain.ARTEN            // alle 8 Arten mit { id, name, mehrzahl, eigen: bool }
GabiBrain.STATUS           // bestaetigt | entwurf | zu_klaeren mit Namen („Bestätigt“, „Entwurf“, „Zu klären“)
GabiBrain.GRENZEN          // { titelMin: 2, titelMax: 120, inhaltMax: 20000, tagsMax: 12, tagMax: 30, quelleMax: 80, versionen: 20, papierkorbTage: 30, veraltetTage: 90 }
GabiBrain.neueId()                               // nanoid, 21 Zeichen
GabiBrain.schluessel(titel)                      // Vergleichsform für Titel und Verweise (klein, Umlaute gefaltet, Leerraum glatt)
GabiBrain.verweiseAus(inhalt)                    // → [{ ziel, anzeige, roh, von, bis }]
GabiBrain.bereinigen(text)                       // Steuerzeichen, HTML-Tags, Skripte, javascript:-Adressen raus
GabiBrain.pruefen(entwurf, { alle, eigeneId })   // → { ok, fehler: { feld: "deutscher Satz" }, knoten: <bereinigt> }
GabiBrain.markdownHtml(text, { aufloesen })      // sicherer HTML-String; aufloesen(titel) → { id } | null
GabiBrain.gesundheit({ knoten, luecken, nutzung, jetzt })
GabiBrain.exportDateien(knoten)                  // → [{ name: "titel.md", text: "---\n…frontmatter…\n---\n\nInhalt" }]
GabiBrain.exportEineDatei(knoten)                // → Text (alle Knoten, getrennt)
GabiBrain.importLesen(dateien)                   // dateien: [{ name, text }] → { knoten: [...], fehler: [...] }  (bereinigt, begrenzt)
GabiBrain.importVergleichen(aktuell, importiert) // → [{ art: "neu" | "geaendert" | "gleich" | "ungueltig", knoten, alt, felder, fehler }]
GabiBrain.zipSchreiben(dateien) / GabiBrain.zipLesen(bytes)   // ZIP ohne Bibliothek (gespeichert, ohne Kompression)
GabiBrain.erstelle({ ablage, seed, jetzt, kanal })            // → Brain-Objekt (Zustand + Aktionen, siehe Quelltext-Kopf)
```
Das Brain-Objekt hält den Zustand im Speicher, schreibt über die Ablage, führt Undo/Redo (Sitzung, 50 Schritte),
meldet Änderungen (`beiAenderung`) und rechnet Abgeleitetes (Auto-Kanten, Rückverweise, fehlende Ziele, Grade).

## 4 `brain-suche.js`

```js
GabiBrainSuche.normal(text)            // klein, ä→ae ö→oe ü→ue ß→ss, Akzente weg, Satzzeichen → Leerzeichen, „E-Mail(-Adresse)“ → ein Wort
GabiBrainSuche.woerter(text)           // Wortstämme ohne Füllwörter (leichtes deutsches Stemming)
GabiBrainSuche.inhaltsStaemme(text)    // dasselbe mit Wiederholungen – das, was ein Knoten inhaltlich „sagt“
GabiBrainSuche.frageWoerter(frage, bestand?)   // → { such, zusatz, roh }: Inhaltswörter (Tippfehler am Bestand ausgeglichen),
                                       //   eindeutige Wendungen („seit wann“ → Gründung); ohne Inhaltswort wird das Fragewort zur
                                       //   Frage („Wo seid ihr?“ → Standort); zusatz = schwache Hinweise aus Fragewörtern
GabiBrainSuche.passung(suchwort, wort) // 1 gleich · 0,7 Wortanfang/Endung · 0,45 Wortteil, Bestimmungswort, verwandt · 0 sonst
GabiBrainSuche.erstelleIndex(knoten)   // BM25 über Titel (×3), Tags (×2), Inhalt (×1)
GabiBrainSuche.suchen(index, anfrage, { limit = 20, praefix = true })   // → [{ id, punkte, woerter, deckung, stark, imTitel }]
                                       //   Wortfeld-Treffer („anrufen“ ↔ „Telefon“) zählen schwächer, gelten aber als gefunden
GabiBrainSuche.filtern(knoten, filter, { nutzung, jetzt })              // filter: { arten, status, tag, zuKlaeren, veraltet, nieVerwendet, verwendet }
GabiBrainSuche.kontextWaehlen({ frage, knoten, kanten, maxKnoten = 8, maxZeichen = 6000 })
   // → [{ id, art, status, titel, inhalt, tags }]  beste Treffer + Nachbarn (1 Sprung), nur praxiswissen/frage/vorlage,
   //   nie Patienten/Notizen/Berichte, nie Papierkorb; Inhalte gekürzt (je Knoten höchstens 1500 Zeichen, [[Verweise]] bleiben)
GabiBrainSuche.antwortAusKontext(frage, kontextKnoten, { nebensache = [] })
   // Demo-Assistent, rein extraktiv → { text, quellen: [id], luecke: "" | "<Frage>" }
```

**Regeln der Antwort ohne KI** (`antwortAusKontext`, Fragenkatalog in `worker/test/brain-fragen.test.js`):
1. Die Antwort muss die Frage ganz abdecken: Jedes Inhaltswort steht deutlich in einem der genannten Knoten – der beste
   Knoten trägt, was in ihm steht, weitere nur, was sie in Titel oder Tags tragen. Sonst Lücke.
2. Eine Eigenschaft (Preis, Zeiten, Adresse, Kontakt …) zählt nur beim gefragten Thema selbst oder als offener Punkt
   („Was kostet Akupunktur?“ wird nicht mit dem Preis der Osteopathie beantwortet).
3. Wörter für die Praxis selbst („Praxis“, über `nebensache` auch ihr Name) müssen nicht vorkommen.
4. Fehlt etwas, steht aber ein offener Punkt genau zum Thema im Brain: „Das ist im Brain noch offen: …“ (keine Lücke).
5. Entwürfe: „Laut Entwurf (noch nicht bestätigt) – …“. Höchstens drei Wissens-Einträge und zwei offene Punkte.

**Kürzung und Änderungsvorschläge:** Der Kontext kürzt lange Einträge. Ein Änderungsvorschlag ersetzt den ganzen Inhalt –
deshalb bietet `brain-gespraech.js` ihn nur an, wenn der Server den Eintrag ungekürzt gesehen hat, und übernimmt ihn nur
auf dem Stand (`rev`), den der Vorschlag kannte.

## 5 Gabi nutzt das Brain – Protokoll Browser ↔ Worker

### 5.1 Anfrage `POST /api/chat` (neu, optional)
```json
{
  "nachrichten": [{ "rolle": "nutzer", "text": "…" }],
  "brainKontext": {
    "v": 1,
    "knoten": [{ "id": "s-…", "art": "praxiswissen", "status": "bestaetigt", "titel": "…", "inhalt": "…", "tags": ["…"] }],
    "persona": "Text aus dem bestätigten Persona-Knoten",
    "regeln": ["Text je bestätigtem Regel-Knoten"],
    "stand": { "knoten": 38, "bestaetigt": 29, "entwurf": 2, "zuKlaeren": 7, "veraltet": 0, "nieVerwendet": 12, "luecken": 3 }
  }
}
```
Grenzen im Worker (alles darüber → 400/413 mit deutschem Satz, nichts wird still gekürzt außer Leerraum):
`knoten` ≤ 8 · `id` `/^[A-Za-z0-9_-]{4,40}$/`, eindeutig · `art` ∈ praxiswissen/frage/vorlage · `status` ∈ drei Werte ·
`titel` 1–120 · `inhalt` ≤ 2000 · `tags` ≤ 8 × 30 · Summe Titel+Inhalt ≤ 8000 · `persona` ≤ 800 · `regeln` ≤ 6 × 400 ·
`stand`: nur ganze Zahlen 0–100000 in genau diesen Feldern · unbekannte Felder werden verworfen · Typen streng.
Bereinigung: Steuerzeichen raus (außer `\n`), `\r\n` → `\n`, `<` → `‹`, `>` → `›` (kein Tag lässt sich fälschen),
Leerraum geglättet. `brainKontext` nur bei freien Fragen (nicht bei `aktion` diktat/bericht).

Neue feste Aktion (Brain-Interview und „Merke dir“/„Ändere“ ohne Umweg):
```json
{ "aktion": { "typ": "brain_antwort", "knoten": { "id": "…", "titel": "…", "inhalt": "…" }, "antwort": "…" } }
```
→ der Worker formuliert aus der Antwort einen Eintrag (KI mit JSON-Schema; ohne Schlüssel lokal: Demo-Formulierung)
und schickt `brain_vorschlag`. Grenzen: `titel` ≤ 120, `inhalt` ≤ 2000, `antwort` 1–4000.

### 5.2 Antwort-Strom (NDJSON, zusätzlich zu den bisherigen Ereignissen)
```json
{ "t": "quellen", "knoten": ["s-standort-kieslingstrasse", "s-kontakt"] }
{ "t": "luecke", "frage": "Gibt es Parkplätze an der Kieslingstraße?" }
{ "t": "brain_vorschlag", "vorschlag": { "typ": "neu" | "aendern", "id": "nur bei aendern", "titel": "…", "inhalt": "…", "grund": "…" } }
```
Alte Oberflächen ignorieren sie (`quellen` ohne `notizen`, unbekanntes `t`).

### 5.3 So entstehen Quellen und Lücken (Claude-Weg)
- Der Worker hängt den Kontext als abgegrenzten Datenblock **vor die letzte Nutzernachricht** (nicht in den
  Systemprompt): `<brain_kontext>` mit `<eintrag nr="K1" art=… status=… titel="…">…</eintrag>`.
- Der Systemprompt im Brain-Modus (`BRAIN_PROMPT`) entsteht aus `CHAT_PROMPT` durch gezieltes Ersetzen von Regel 2,
  Regel 9 und dem Block PRAXISWISSEN – **das eingebaute Praxiswissen steht dann nicht mehr im Prompt** (nichts kann
  „dazuerfunden“ werden). `CHAT_PROMPT` selbst bleibt Byte für Byte gleich.
- Persona und Brain-Regeln kommen als eigener Systemblock **nach** den Kernregeln, eingerahmt: nur Ton und
  zusätzliche Einschränkungen, bei Widerspruch gelten die Regeln oben.
- Claude schreibt ans Ende zwei Markerzeilen, die der Worker aus dem Strom herausfiltert und in Ereignisse übersetzt:
  `Quellen: K1, K3` und `Lücke: <kurze Frage>`. Der Filter hält nur zurück, was noch ein Marker werden kann.
  Fehlt die Lücken-Zeile, erkennt der Worker den Satz „Dazu steht noch nichts im Brain.“ und meldet die Frage der
  Nutzerin als Lücke.
- Zwei Werkzeuge nur im Brain-Modus (Stufe „vorschlagen“): `brain_eintrag_vorschlagen` (neu) und
  `brain_aenderung_vorschlagen` (Eintrag aus dem Kontext per `K`-Nummer). Sie senden `brain_vorschlag`, speichern nie.
- `/api/status`: `funktionen` enthält zusätzlich `"brain"` – daran erkennt die Oberfläche, ob der Server den Kontext
  versteht (sonst Hinweis und Antworten aus dem eingebauten Wissen).

### 5.4 Demo und lokal ohne KI-Schlüssel
`demo.js` bekommt `brain` (den Kontext) und `brainAntwort` (= `GabiBrainSuche.antwortAusKontext`) hereingereicht und
antwortet bei Praxisfragen nur daraus – mit denselben Ereignissen `quellen` und `luecke`.

## 6 `brain-graph.js`

```js
const graph = GabiBrainGraph.erstelle(behaelter, {
  farben,          // () → { hintergrund, platte, text, textLeise, kante, kanteStark, akzent, warn, arten: { praxiswissen: "#…", … } }
  wenigBewegung,   // () → bool (prefers-reduced-motion)
  workerUrl,       // "brain-graph.js?v=…" oder null (dann Layout im Hauptfaden)
  positionen,      // { lesen() → { id: [x, y, fest] }, schreiben(obj) }
  beiAuswahl,      // (id | null, { quelle: "zeiger" | "tastatur" })
  beiOeffnen,      // (id)  Klick/Tipp/Enter → Detail
  beiHover,        // (id | null)
  ansage,          // (text) für die Live-Region
});
graph.setzen({ knoten: [{ id, art, titel, status, geschuetzt, grad }], kanten: [{ von, nach, art }] });   // bekannte Knoten behalten ihre Lage
graph.auswaehlen(id | null, { zentrieren = false });
graph.zentrieren(id);                 // Doppelklick: Kamera fliegt hin (≤ 260 ms; reduziert: Sprung)
graph.hervorheben(ids, { dauer });    // Gabi-Spur: kurzes Aufleuchten (reduziert: stiller Ring)
graph.treffer(ids | null);            // Suchtreffer markieren, Rest dimmen
graph.sichtbarkeit(idSet | null);     // Filter: nur diese Knoten zeigen (null = alle)
graph.fokus(id | null, tiefe);        // Fokus-Modus: Nachbarn bis Tiefe 1–3
graph.einpassen({ verdeckt });        // alles zeigen; verdeckt: { rechts, unten, links, oben } in px
graph.zoomen(faktor); graph.fixieren(id, fest); graph.farbenNeu(); graph.aktiv(bool);
graph.messen();                       // → { knoten, kanten, bilder, zeichnenP50, zeichnenP95, fps, layoutMs, ticks }
graph.zerstoeren();
```
Eigene Umsetzung, Canvas 2D: Barnes-Hut-Abstoßung, Federn, schwache Mitte, Abkühlen; Layout im Web Worker
(`new Worker(workerUrl)` – dieselbe Datei erkennt den Worker-Modus), sonst im Hauptfaden mit Zeitbudget.
Gleicher Graph → gleiches Bild (Startlage aus IDs gehasht), gespeicherte Lagen → ruhiger Start. Gezeichnet wird nur
bei Bedarf. Der Behälter bekommt: `<canvas class="brain-graph-flaeche" tabindex="0">` (mit Ersatzinhalt für
Hilfstechnik), `<canvas class="brain-graph-karte">` (Minimap). Die Legende baut die Ansicht.

## 7 Fähigkeiten-Register (`worker/src/faehigkeiten.js`)
```js
export const STUFEN = ["lesen", "vorschlagen", "mit_bestaetigung_ausfuehren"];
export const FAEHIGKEITEN = [{
  id: "notizen-suchen", name: "Notizen durchsuchen", beschreibung: "…", darf: "Was darf Gabi damit? (einfache Sprache)",
  stufe: "lesen", status: "aktiv" | "entwurf" | "geplant", daten: ["Behandlungsnotizen (Testdaten)"],
  voraussetzungen: ["…"], werkzeuge: ["notizen_suchen", "notiz_lesen"], bestaetigung: "" | "Knopf „Speichern“", phase: 2,
}];
```
Jedes Werkzeug aus `WERKZEUGE` (und jedes Brain-Werkzeug, jede feste Aktion) gehört zu genau einer Fähigkeit.
Ein Test führt jedes Werkzeug mit einem Spion-Speicher aus: kein Werkzeug ruft `neueNotiz`, `notizAendern`,
`notizLoeschen` oder `neuerPatient`.

## 8 Seed (`brain-seed.js`, erzeugt)
```js
GabiBrainSeed = {
  version: "…",            // kurzer Hash des Inhalts
  knoten: [{ id, seed, art, titel, inhalt, tags, status, quelle }],
  kanten: [{ id, von, nach, art }],
  kernregeln: [{ id, titel, text }],
  faehigkeiten: [ … wie im Register … ],
  phasen: [{ nr, titel }],              // aus ASSISTENT-ROADMAP.md (für die Fähigkeiten-Ansicht)
  demo: { luecken: [...], nutzung: {...}, veraltet: [...], knoten: [...] }   // nur im Demo-Modus eingespielt, erfunden
}
```
Neu erzeugen: `cd worker && node dev/brain_seed_erzeugen.mjs`. Ein Test prüft den Gleichlauf und dass jede Zeile und
jede Zahl der Wissensdatei in einem Knoten steckt und jeder „TODO prüfen“-Punkt genau einen `zu_klaeren`-Knoten hat.
