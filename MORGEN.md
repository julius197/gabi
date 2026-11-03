# ☀️ Gabi live schalten – Checkliste für Julius

Ein Schritt nach dem anderen. Pro Schritt eine Aktion, ganz ohne Terminal.
Wo „🤖 Claude“ steht, schreibst du Claude nur den Satz in Anführungszeichen – den Rest macht Claude.
Alles bleibt **Testversion: nur Testdaten, keine echten Patientendaten.**

---

### 0. 👀 Vorher kurz ansehen (optional, 2 Minuten)
🤖 Sag Claude: **„Zeig mir die Gabi-Demo.“**
Claude öffnet die App im Demo-Modus (blauer Banner, Beispieldaten, nichts wird gesendet).
Probier: „Beispieldiktat einfügen“ → Speichern → Notizordner → PDF.
✅ **Fertig wenn:** Du ein PDF mit „PhysioWorks“ oben und „Testversion – Testdaten“ unten gesehen hast.

---

### 1. 🐙 Bei GitHub anmelden
🤖 Sag Claude: **„Starte den GitHub-Login.“**
Im Terminal erscheint ein 8-stelliger Code → **Enter** drücken → im Browser den Code eingeben → **Authorize** klicken.
(Falls im Terminal-Tab „GitHub-Login“ von gestern noch „(Y/n)“ steht: dort einfach **Enter** drücken.)
✅ **Fertig wenn:** Im Terminal „Logged in as …“ steht.

---

### 2. 🗄️ Supabase-Projekt anlegen (Frankfurt)
Auf **supabase.com** anmelden → **New project** → Name `gabi` → Region **Central EU (Frankfurt)** →
Datenbank-Passwort mit **Generate** erzeugen und im Passwort-Manager speichern → **Create new project**.
✅ **Fertig wenn:** Das Projekt „gabi“ geöffnet ist und kein Ladebalken mehr läuft (dauert ca. 2 Minuten).

---

### 3. 📋 Tabellen anlegen (`schema.sql`)
🤖 Sag Claude: **„Kopier mir schema.sql.“** (liegt dann in deiner Zwischenablage)
In Supabase links **SQL Editor** → **New query** → einfügen → **Run**.
✅ **Fertig wenn:** Unten „Success. No rows returned“ steht.

---

### 4. 🌱 Beispieldaten einspielen (`seed_test.sql`)
🤖 Sag Claude: **„Kopier mir seed_test.sql.“**
Wieder **SQL Editor** → **New query** → einfügen → **Run**.
✅ **Fertig wenn:** „Success“ steht und links unter **Table Editor → patients_test** die Kürzel TP-01, TP-02, TP-03 stehen.

---

### 5. 🔐 Die 4 Secrets eintragen (Cloudflare-Webseite)
**dash.cloudflare.com** → **Workers & Pages** → **gabi-api** → **Settings** → **Variables and Secrets** → **+ Add**.
Pro Eintrag: Typ **Secret** wählen, Name und Wert eintragen, **Deploy** (bzw. Speichern) klicken. Viermal:

| Name | Wert – wo du ihn findest |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → **API Keys** → **Create Key** (Name „gabi“) |
| `SUPABASE_URL` | Supabase → **Project Settings** → **Data API** → **Project URL** (`https://….supabase.co`) |
| `SUPABASE_SECRET_KEY` | Supabase → **Project Settings** → **API Keys** → **Secret key** (`sb_secret_…`) |
| `GABI_ZUGANGSCODE` | selbst ausdenken, z. B. vier zufällige Wörter – im Passwort-Manager speichern |

(Steht im Terminal-Tab „Secrets“ von gestern noch eine Abfrage? Den Tab einfach schließen – wir nehmen die Webseite.)
✅ **Fertig wenn:** https://gabi-api.julius-422.workers.dev/api/status bei `zugang`, `anthropic`, `supabase` und `spracherkennung` überall `true` zeigt.

---

### 6. 🤖 Nachtschicht übernehmen und hochladen
🤖 Sag Claude: **„Nachtschicht übernehmen und live schalten.“**
Claude übernimmt den Branch `nachtschicht` in `main`, spielt den gehärteten Worker neu ein, legt das öffentliche
GitHub-Repo an, lädt alles hoch, schaltet GitHub Pages mit `gabi.automatilabs.de` ein und sagt dir deinen GitHub-Namen.
✅ **Fertig wenn:** Claude dir den genauen CNAME-Wert nennt (z. B. `deinname.github.io`) und `/api/status` `"bereit": true` zeigt.

---

### 7. 🌐 IONOS: Adresse `gabi` eintragen
IONOS → **Domains & SSL** → **automatilabs.de** → **DNS** → **Eintrag hinzufügen** → **CNAME**:
Host-Name **`gabi`** · Zeigt auf **`<dein-github-name>.github.io`** (Wert aus Schritt 6) → **Speichern**.
✅ **Fertig wenn:** Der Eintrag in der IONOS-Liste steht. (Bis er überall gilt: 5–30 Minuten.)

---

### 8. 🔒 HTTPS einschalten
GitHub → Repo **gabi** → **Settings** → **Pages** → Haken bei **Enforce HTTPS**.
(Ist der Haken grau: GitHub besorgt noch das Zertifikat – nach 15–60 Minuten nochmal schauen.)
✅ **Fertig wenn:** **https://gabi.automatilabs.de** mit Schloss-Symbol lädt und **kein** blauer Demo-Banner erscheint.

---

### 9. 📱 Live-Test am Handy
iPhone → **Safari** → **gabi.automatilabs.de** → Zugangscode (Schritt 5) → Test-Patient **TP-01** wählen →
runden Knopf **gedrückt halten** und diesen erfundenen Text sprechen, dann loslassen:

> „Knie rechts, sechste Behandlung. Flexion bis 120 Grad, Schmerz bei zwei. Zwanzig Minuten Krankengymnastik am Gerät,
> Beinpresse 40 Kilo, dreimal zwölf. Zu Hause weiter Bridging, dreimal fünfzehn, täglich. Nächstes Mal Treppe üben.“

Beim ersten Mal fragt Safari nach dem Mikrofon → **Erlauben**. Notiz prüfen → **Speichern bei TP-01** →
**Notizordner** → die Notiz öffnen → **PDF**.
✅ **Fertig wenn:** Die Notiz Befund · Maßnahmen · Verlauf · Hausaufgaben zeigt und das PDF oben „PhysioWorks“,
Datum und „TP-01“ hat und unten „Testversion – Testdaten“.

---

🎉 **Geschafft.** Wenn etwas hakt: Screenshot an Claude schicken und dazuschreiben, bei welchem Schritt.
