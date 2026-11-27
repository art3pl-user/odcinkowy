// Obliczenia GPS — bez dostępu do DOM, żeby dało się je testować osobno.
(function (root) {
  'use strict';

  const MAX_ACCURACY_M = 50;   // gorsze odczyty są pomijane
  const MAX_SPEED_MS = 100;    // 360 km/h — szybszy "skok" to błąd GPS
  const MOVING_SPEED_MS = 1;   // poniżej tego uznajemy, że stoimy
  const FRESH_FIX_MS = 3000;   // jak świeży musi być odczyt, by od niego zacząć

  // Odległość między dwoma punktami w metrach (wzór haversine)
  function distanceM(a, b) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function createTracker() {
    let last = null;       // ostatni dobry odczyt
    let speedMs = null;    // aktualna prędkość
    let ref = null;        // punkt odniesienia, gdy telefon nie podaje prędkości
    let section = null;    // trwający lub zakończony pomiar

    function addToSection(fix) {
      if (!section.anchor) {
        section.anchor = fix;
        section.startT = fix.t;
        section.endT = fix.t;
        return;
      }
      const dt = (fix.t - section.anchor.t) / 1000;
      if (dt <= 0) return;
      const d = distanceM(section.anchor, fix);
      if (d / dt > MAX_SPEED_MS) return;

      section.endT = fix.t;

      // Na postoju pozycja GPS "pływa" — nie doliczamy tego do dystansu
      const moved = fix.speed === null
        ? d > Math.max(fix.accuracy, 10)
        : fix.speed >= MOVING_SPEED_MS || d > Math.max(2 * fix.accuracy, 25);
      if (moved) {
        section.distance += d;
        section.anchor = fix;
      }
    }

    // Prędkość z pozycji: liczona dopiero po wyraźnym przemieszczeniu,
    // a brak ruchu przez 5 s oznacza postój
    function estimateSpeed(fix) {
      if (!ref) {
        ref = fix;
        return;
      }
      const d = distanceM(ref, fix);
      const dt = (fix.t - ref.t) / 1000;
      if (d / dt > MAX_SPEED_MS) return;
      if (d > Math.max(fix.accuracy, 10)) {
        speedMs = d / dt;
        ref = fix;
      } else if (dt >= 5) {
        speedMs = 0;
        ref = fix;
      }
    }

    return {
      // fix: { lat, lon, accuracy, speed (m/s lub null), t (ms) }
      // Zwraca false, gdy odczyt jest zbyt niedokładny.
      update(fix) {
        if (!(fix.accuracy <= MAX_ACCURACY_M)) return false;
        if (last && fix.t <= last.t) return true;

        if (fix.speed !== null && fix.speed >= 0) {
          speedMs = fix.speed;
          ref = fix;
        } else {
          fix = { ...fix, speed: null };
          estimateSpeed(fix);
        }

        last = fix;
        if (section && section.running) addToSection(fix);
        return true;
      },

      start(now) {
        section = { running: true, distance: 0, anchor: null, startT: null, endT: null };
        if (last && now - last.t <= FRESH_FIX_MS) addToSection(last);
      },

      stop() {
        if (section) section.running = false;
      },

      // Aktualna prędkość w km/h
      speedKmh() {
        if (speedMs === null) return null;
        return speedMs < 0.5 ? 0 : speedMs * 3.6;
      },

      section() {
        if (!section) return null;
        const seconds = section.startT === null ? 0 : (section.endT - section.startT) / 1000;
        return {
          running: section.running,
          waiting: section.startT === null,
          startT: section.startT,
          distanceM: section.distance,
          seconds,
          averageKmh: seconds > 0 ? (section.distance / seconds) * 3.6 : null,
        };
      },

      lastFix() { return last; },
    };
  }

  const api = { createTracker, distanceM, MAX_ACCURACY_M };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Tracker = api;
})(this);
