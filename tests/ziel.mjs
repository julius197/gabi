// Schutz vor dem falschen Ziel – für alle Browser-Tests.
//
// Die Tests melden sich mit dem Testcode „test“ an und probieren absichtlich falsche Zugangscodes aus. Das darf nur einen
// lokalen Server treffen (`npm run lokal`, `npm run brain`). Spricht die Oberfläche unter der Adresse dagegen mit einem
// echten Worker – die Live-Seite oder `npm run vorschau`, das auf demselben Standard-Port 8788 läuft wie `npm run lokal` –,
// zählt dort jeder dieser Versuche als Fehlversuch für die eigene IP (Sperre nach 20). Deshalb läuft ohne GABI_LIVE=1
// gegen einen echten Worker nichts an. Gelesen wird dafür nur die ausgelieferte /config.js (eine Datei, keine API-Anfrage).
const LOKAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/;

/** Liefert die API-Adresse, mit der die Oberfläche unter `basis` spricht ("" = derselbe Server), oder null. */
export async function apiAdresse(basis, holen = fetch) {
  try {
    const antwort = await holen(`${String(basis).replace(/\/+$/, "")}/config.js`, { cache: "no-store" });
    if (!antwort.ok) return null;
    const m = /apiUrl:\s*["']([^"']*)["']/.exec(await antwort.text());
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** true, wenn die Tests gegen diese Oberfläche laufen dürfen, ohne einen echten Worker zu treffen. */
export function istLokaleApi(api) {
  return api === "" || (typeof api === "string" && LOKAL.test(api));
}

/**
 * Bricht den Lauf ab (Ende mit Code 2), wenn die Oberfläche unter `basis` mit einem echten Worker spricht oder gar
 * kein Gabi-Server antwortet. Mit GABI_LIVE=1 (bewusster Lauf gegen die Live-Seite, ohne Code-Tests) wird nicht geprüft.
 */
export async function zielPruefen(basis, { live = process.env.GABI_LIVE === "1", holen = fetch, ende = (code) => process.exit(code), melden = console.error } = {}) {
  if (live) return true;
  const api = await apiAdresse(basis, holen);
  if (api === null) {
    melden(`ABBRUCH: Unter ${basis} antwortet kein Gabi-Server (/config.js nicht lesbar). Erst „cd worker && npm run lokal“ (oder „npm run brain“) starten – oder die Adresse als Argument angeben.`);
    ende(2);
    return false;
  }
  if (!istLokaleApi(api)) {
    melden(`ABBRUCH: ${basis} spricht mit einem echten Worker (${api}). Diese Tests probieren Zugangscodes aus – das würde dort als Fehlversuch für die eigene IP zählen. Bitte gegen einen lokalen Server laufen lassen („cd worker && npm run lokal“ / „npm run brain“) oder bewusst mit GABI_LIVE=1.`);
    ende(2);
    return false;
  }
  return true;
}
