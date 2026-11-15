/* Gabi – Darstellung vor dem ersten Bild (v2.4).
   Läuft im <head> vor style.css (CSP: script-src 'self', also eine eigene kleine Datei statt Inline-Skript) und setzt am
   <html>-Element:
     data-thema="hell" | "dunkel"     – das wirksame Farbschema (bei „System“ nach prefers-color-scheme)
     data-thema-wahl="hell" | "dunkel" | "system"
     data-glas="aus"                  – Glas-Effekt in den Einstellungen ausgeschaltet (sonst fehlt das Attribut)
   Dazu meta theme-color. Gespeichert wird nur lokal im Browser (localStorage „gabi.darstellung“, jeder Zugriff in
   try/catch – ohne Speicher läuft alles mit „System“ und Glas an). Andere Skripte nutzen window.GabiDarstellung und das
   Ereignis „gabi:darstellung“ (z. B. der Brain-Graph, der seine Canvas-Farben neu liest). */
(function () {
  "use strict";
  var SCHLUESSEL = "gabi.darstellung";
  var FARBE = { hell: "#edf4fa", dunkel: "#072d53" }; // = --pw-grund / --pw-marine in style.css
  var wurzel = document.documentElement;
  var mq = null;
  try { mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null; } catch (e) { mq = null; }

  function normal(w) {
    w = w && typeof w === "object" ? w : {};
    return { thema: w.thema === "hell" || w.thema === "dunkel" ? w.thema : "system", glas: w.glas !== false };
  }
  function lesen() {
    try { return normal(JSON.parse(window.localStorage.getItem(SCHLUESSEL) || "null")); } catch (e) { return normal(null); }
  }
  var stand = lesen();

  function wirksam() { return stand.thema === "system" ? (mq && mq.matches ? "dunkel" : "hell") : stand.thema; }
  function anwenden() {
    var t = wirksam();
    wurzel.setAttribute("data-thema", t);
    wurzel.setAttribute("data-thema-wahl", stand.thema);
    if (stand.glas) wurzel.removeAttribute("data-glas"); else wurzel.setAttribute("data-glas", "aus");
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", FARBE[t]);
  }
  function melden() {
    try { window.dispatchEvent(new CustomEvent("gabi:darstellung", { detail: { thema: wirksam(), wahl: stand.thema, glas: stand.glas } })); } catch (e) { /* sehr alter Browser */ }
  }

  anwenden();
  // meta theme-color steht im <head> nach diesem Skript – sobald das Dokument gelesen ist, noch einmal setzen
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", anwenden);
  // „System“ folgt dem Betriebssystem auch während die Seite offen ist
  function systemWechsel() { if (stand.thema === "system") { anwenden(); melden(); } }
  if (mq) { if (mq.addEventListener) mq.addEventListener("change", systemWechsel); else if (mq.addListener) mq.addListener(systemWechsel); }
  // anderer Tab hat umgestellt
  window.addEventListener("storage", function (e) {
    if (e.key !== SCHLUESSEL) return;
    stand = lesen(); anwenden(); melden();
  });

  window.GabiDarstellung = {
    /** { thema: "hell" | "dunkel" | "system", glas: true | false } – die Wahl, nicht das wirksame Schema */
    wahl: function () { return { thema: stand.thema, glas: stand.glas }; },
    /** wirksames Schema: "hell" | "dunkel" */
    thema: wirksam,
    /** Wahl ändern: wirkt sofort, wird (wenn möglich) gespeichert */
    setzen: function (neu) {
      stand = normal({ thema: neu && neu.thema !== undefined ? neu.thema : stand.thema, glas: neu && neu.glas !== undefined ? neu.glas : stand.glas });
      try { window.localStorage.setItem(SCHLUESSEL, JSON.stringify(stand)); } catch (e) { /* privat/voll – gilt dann nur in diesem Tab */ }
      anwenden(); melden();
    },
  };
})();
