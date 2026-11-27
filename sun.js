// Wysokość słońca nad horyzontem (przybliżenie astronomiczne) — bez dostępu do DOM.
(function (root) {
  'use strict';

  const RAD = Math.PI / 180;
  const SUNSET_DEG = -0.833;   // górna krawędź tarczy na horyzoncie

  // t: milisekundy od 1970 r.; wynik w stopniach
  function elevation(t, lat, lon) {
    const d = t / 86400000 - 10957.5;                       // dni od 1.01.2000 12:00 UTC
    const g = (357.529 + 0.98560028 * d) * RAD;
    const q = 280.459 + 0.98564736 * d;
    const l = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
    const e = (23.439 - 0.00000036 * d) * RAD;
    const ascension = Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l));
    const declination = Math.asin(Math.sin(e) * Math.sin(l));
    const sidereal = (18.697374558 + 24.06570982441908 * d) * 15 + lon;
    const hour = sidereal * RAD - ascension;
    return Math.asin(Math.sin(lat * RAD) * Math.sin(declination) +
      Math.cos(lat * RAD) * Math.cos(declination) * Math.cos(hour)) / RAD;
  }

  const isDay = (t, lat, lon) => elevation(t, lat, lon) > SUNSET_DEG;

  const api = { elevation, isDay };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Sun = api;
})(this);
