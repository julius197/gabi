// Öffentliche Einstellungen (kein Geheimnis): Adresse der Gabi-API (Cloudflare Worker).
// Wird nach `npx wrangler deploy` eingetragen, z. B. "https://gabi-api.<konto>.workers.dev".
window.GABI_CONFIG = {
  apiUrl: "https://gabi-api.julius-422.workers.dev",
  // Brain (Gedächtnis der Praxis, Bereich „Brain“): im Code AUS. Zum Ausprobieren ?brain=1 an die Adresse hängen
  // oder lokal `cd worker && npm run brain`. Ohne Schalter lädt die App keine Brain-Datei.
  brain: false,
};
