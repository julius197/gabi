// Speicher: Supabase (PostgREST) – Zugriff nur hier im Worker mit dem geheimen Schlüssel.
// Dieselbe Schnittstelle gibt es als Arbeitsspeicher-Variante für Tests und den lokalen Modus.

export class SpeicherFehler extends Error {
  constructor(meldung, status = 500) {
    super(meldung);
    this.status = status;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const istUuid = (id) => typeof id === "string" && UUID.test(id);

const NOTIZ_LISTE = "id,patient_id,erstellt_am,geaendert_am,strukturiert,patients_test(kuerzel,pseudonym)";
const NOTIZ_VOLL = "id,patient_id,rohtext,strukturiert,erstellt_am,geaendert_am,patients_test(kuerzel,pseudonym)";

function flach(n) {
  const p = n.patients_test || {};
  const { patients_test, suchtext, ...rest } = n;
  return { ...rest, kuerzel: p.kuerzel || "", pseudonym: p.pseudonym || "" };
}

export function supabaseSpeicher(env) {
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const schluessel = env.SUPABASE_SECRET_KEY || "";
  const basis = `${url}/rest/v1`;

  async function anfrage(pfad, { methode = "GET", body, prefer } = {}) {
    if (!url || !schluessel) throw new SpeicherFehler("Datenbank ist nicht eingerichtet.", 503);
    const headers = { apikey: schluessel, Accept: "application/json" };
    if (schluessel.startsWith("eyJ")) headers.Authorization = `Bearer ${schluessel}`; // alter service_role-Schlüssel (JWT)
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;
    let antwort;
    try {
      antwort = await fetch(`${basis}/${pfad}`, { method: methode, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new SpeicherFehler("Datenbank nicht erreichbar.", 502);
    }
    if (antwort.status === 409) throw new SpeicherFehler("Eintrag existiert schon.", 409);
    if (!antwort.ok) {
      console.log(`supabase ${methode} ${pfad.split("?")[0]} -> ${antwort.status}`); // keine Inhalte loggen
      throw new SpeicherFehler(`Datenbank-Fehler (${antwort.status}).`, 502);
    }
    if (antwort.status === 204) return null;
    const text = await antwort.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    async patienten() {
      const zeilen = await anfrage("patients_test?select=id,kuerzel,pseudonym,erstellt_am,notes(count)&order=kuerzel.asc");
      return zeilen.map(({ notes, ...p }) => ({ ...p, anzahl: notes?.[0]?.count ?? 0 }));
    },
    async patient(id) {
      const zeilen = await anfrage(`patients_test?select=id,kuerzel,pseudonym,erstellt_am&id=eq.${id}`);
      return zeilen[0] || null;
    },
    async neuerPatient({ kuerzel, pseudonym }) {
      const zeilen = await anfrage("patients_test", { methode: "POST", body: { kuerzel, pseudonym }, prefer: "return=representation" });
      return { ...zeilen[0], anzahl: 0 };
    },
    async notizen({ patientId, woerter = [] } = {}) {
      const q = new URLSearchParams({ select: NOTIZ_LISTE, order: "erstellt_am.desc", limit: "200" });
      if (patientId) q.set("patient_id", `eq.${patientId}`);
      if (woerter.length) q.set("and", `(${woerter.map((w) => `suchtext.like.*${w}*`).join(",")})`);
      const zeilen = await anfrage(`notes?${q}`);
      return zeilen.map(flach);
    },
    async notiz(id) {
      const zeilen = await anfrage(`notes?select=${NOTIZ_VOLL}&id=eq.${id}`);
      return zeilen[0] ? flach(zeilen[0]) : null;
    },
    async neueNotiz(daten) {
      const zeilen = await anfrage(`notes?select=${NOTIZ_VOLL}`, { methode: "POST", body: daten, prefer: "return=representation" });
      return flach(zeilen[0]);
    },
    async notizAendern(id, daten) {
      const zeilen = await anfrage(`notes?select=${NOTIZ_VOLL}&id=eq.${id}`, { methode: "PATCH", body: daten, prefer: "return=representation" });
      return zeilen[0] ? flach(zeilen[0]) : null;
    },
    async notizLoeschen(id) {
      const zeilen = await anfrage(`notes?id=eq.${id}`, { methode: "DELETE", prefer: "return=representation" });
      return Array.isArray(zeilen) && zeilen.length > 0;
    },
  };
}

/** Arbeitsspeicher-Variante (Tests, lokaler Modus ohne Supabase). */
export function arbeitsspeicher() {
  const patienten = new Map();
  const notizen = new Map();
  const jetzt = () => new Date().toISOString();
  const mitPatient = (n) => {
    const p = patienten.get(n.patient_id) || {};
    const { suchtext, ...rest } = n;
    return { ...rest, kuerzel: p.kuerzel || "", pseudonym: p.pseudonym || "" };
  };
  return {
    async patienten() {
      return [...patienten.values()]
        .sort((a, b) => a.kuerzel.localeCompare(b.kuerzel))
        .map((p) => ({ ...p, anzahl: [...notizen.values()].filter((n) => n.patient_id === p.id).length }));
    },
    async patient(id) {
      return patienten.get(id) || null;
    },
    async neuerPatient({ kuerzel, pseudonym }) {
      if ([...patienten.values()].some((p) => p.kuerzel === kuerzel)) throw new SpeicherFehler("Eintrag existiert schon.", 409);
      const p = { id: crypto.randomUUID(), kuerzel, pseudonym, erstellt_am: jetzt() };
      patienten.set(p.id, p);
      return { ...p, anzahl: 0 };
    },
    async notizen({ patientId, woerter = [] } = {}) {
      return [...notizen.values()]
        .filter((n) => !patientId || n.patient_id === patientId)
        .filter((n) => woerter.every((w) => n.suchtext.includes(w)))
        .sort((a, b) => b.erstellt_am.localeCompare(a.erstellt_am))
        .map((n) => {
          const { rohtext, ...ohne } = mitPatient(n);
          return ohne;
        });
    },
    async notiz(id) {
      const n = notizen.get(id);
      return n ? mitPatient(n) : null;
    },
    async neueNotiz(daten) {
      const n = { id: crypto.randomUUID(), erstellt_am: jetzt(), geaendert_am: null, ...daten };
      notizen.set(n.id, n);
      return mitPatient(n);
    },
    async notizAendern(id, daten) {
      const n = notizen.get(id);
      if (!n) return null;
      Object.assign(n, daten);
      return mitPatient(n);
    },
    async notizLoeschen(id) {
      return notizen.delete(id);
    },
  };
}
