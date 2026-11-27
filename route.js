// Korekta prędkości i operacje na zapisanej trasie — bez dostępu do DOM.
(function (root) {
  'use strict';

  const MAX_CORRECTION = 20;      // km/h w każdą stronę
  const MAX_SPEED_MS = 100;       // 360 km/h — szybszy "skok" to błąd GPS

  function clampCorrection(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return 0;
    return Math.max(-MAX_CORRECTION, Math.min(MAX_CORRECTION, n));
  }

  // Prędkość po korekcie. Na postoju zawsze 0.
  function corrected(kmh, correction) {
    if (kmh === null) return null;
    return kmh > 0 ? Math.max(0, kmh + correction) : 0;
  }

  // Dopisuje punkt do trasy; pomija powtórki i skoki GPS
  function addPoint(points, point, distanceM) {
    const prev = points[points.length - 1];
    if (prev) {
      const dt = (point.t - prev.t) / 1000;
      if (dt <= 0 || distanceM(prev, point) / dt > MAX_SPEED_MS) return false;
    }
    points.push(point);
    return true;
  }

  // Położenie i prędkość w chwili t (interpolacja między punktami)
  function pointAt(points, t) {
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (points[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    const a = points[lo];
    const b = points[lo + 1];
    if (!b || t <= a.t) return { index: lo, lat: a.lat, lon: a.lon, speed: a.speed };
    const k = (t - a.t) / (b.t - a.t);
    return {
      index: lo,
      lat: a.lat + (b.lat - a.lat) * k,
      lon: a.lon + (b.lon - a.lon) * k,
      speed: a.speed === null || b.speed === null ? a.speed : a.speed + (b.speed - a.speed) * k,
    };
  }

  function maxSpeed(points) {
    return points.reduce((max, p) => (p.speed !== null && p.speed > max ? p.speed : max), 0);
  }

  const api = { MAX_CORRECTION, clampCorrection, corrected, addPoint, pointAt, maxSpeed };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Route = api;
})(this);
