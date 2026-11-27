// Siła wstrząsu z odczytów akcelerometru — bez dostępu do DOM.
(function (root) {
  'use strict';

  const G = 9.81;
  const WARMUP_MS = 1000;      // czas na ustalenie kierunku grawitacji
  const GRAVITY_S = 0.5;       // jak szybko filtr nadąża za zmianą ułożenia telefonu
  const MAX_GAP_MS = 1000;     // po dłuższej przerwie zaczynamy od nowa

  const complete = (v) => Boolean(v) && [v.x, v.y, v.z].every(Number.isFinite);

  function createDetector() {
    let gravity = null;
    let startT = 0;
    let lastT = 0;

    return {
      // motion: { acceleration, accelerationIncludingGravity } w m/s², t w ms.
      // Zwraca przeciążenie w g bez grawitacji albo null, gdy nie da się go policzyć.
      feed(motion, t) {
        // Większość telefonów sama odejmuje grawitację
        if (complete(motion.acceleration)) {
          const a = motion.acceleration;
          return Math.hypot(a.x, a.y, a.z) / G;
        }
        const a = motion.accelerationIncludingGravity;
        if (!complete(a)) return null;
        if (!gravity || t - lastT > MAX_GAP_MS) {
          gravity = { x: a.x, y: a.y, z: a.z };
          startT = lastT = t;
          return null;
        }
        const dt = Math.max(0, t - lastT) / 1000;
        lastT = t;
        const force = Math.hypot(a.x - gravity.x, a.y - gravity.y, a.z - gravity.z) / G;
        const k = dt / (GRAVITY_S + dt);
        for (const axis of ['x', 'y', 'z']) gravity[axis] += (a[axis] - gravity[axis]) * k;
        return t - startT < WARMUP_MS ? null : force;
      },
    };
  }

  const api = { createDetector };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Impact = api;
})(this);
