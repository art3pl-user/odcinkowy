// Baza odcinków i wykrywanie ich początku oraz końca — bez dostępu do DOM.
(function (root) {
  'use strict';

  const PASS_RADIUS_M = 60;      // w takiej odległości uznajemy punkt za miniony
  const MAX_GAP_S = 15;          // dłuższa przerwa w GPS — nie zgadujemy, co się stało
  const MIN_MOVE_M = 15;         // mniejszy ruch nie wyznacza pewnie kierunku jazdy
  const PASS_ANGLE = 60;         // zgodność kierunku jazdy przy mijaniu punktu
  const AHEAD_ANGLE = 45;        // punkt musi być przed nami
  const APPROACH_ANGLE = 75;     // luźniej przed punktem, bo droga może skręcać
  const REPEAT_S = 120;          // ten sam punkt nie zadziała ponownie przez tyle sekund
  const REARM_M = 500;           // po oddaleniu się ostrzegamy od nowa
  const ODOMETER_STEP_M = 30;    // krok licznika drogi (odporny na drgania GPS)

  const RAD = Math.PI / 180;

  // Położenie punktu b względem a w metrach (x na wschód, y na północ)
  function offset(a, b) {
    return {
      x: (b.lon - a.lon) * RAD * Math.cos((a.lat + b.lat) / 2 * RAD) * 6371000,
      y: (b.lat - a.lat) * RAD * 6371000,
    };
  }

  function distance(a, b) {
    const o = offset(a, b);
    return Math.hypot(o.x, o.y);
  }

  function bearing(a, b) {
    const o = offset(a, b);
    return (Math.atan2(o.x, o.y) / RAD + 360) % 360;
  }

  const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

  // Czy między odczytami a i b minęliśmy punkt? Zwraca miejsce i chwilę minięcia.
  function passing(a, b, point) {
    const ab = offset(a, b);
    const ap = offset(a, point);
    const length2 = ab.x ** 2 + ab.y ** 2;
    const raw = (ap.x * ab.x + ap.y * ab.y) / length2;
    if (raw >= 1) return null;                       // punkt wciąż przed nami
    const k = Math.max(0, raw);
    if (Math.hypot(ap.x - k * ab.x, ap.y - k * ab.y) > PASS_RADIUS_M) return null;
    return {
      ...b,
      lat: a.lat + (b.lat - a.lat) * k,
      lon: a.lon + (b.lon - a.lon) * k,
      t: Math.round(a.t + (b.t - a.t) * k),
    };
  }

  function validPoint(p) {
    return Boolean(p) && Number.isFinite(p.lat) && Number.isFinite(p.lon) &&
      Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 &&
      (p.heading === undefined || p.heading === null || Number.isFinite(p.heading));
  }

  // Sprawdza i uzupełnia wpis z bazy; błędny wpis daje null
  function normalize(s) {
    if (!s || typeof s.id !== 'string' || !s.id || !validPoint(s.start) || !validPoint(s.end)) return null;
    if (distance(s.start, s.end) < 50) return null;
    const direct = bearing(s.start, s.end);
    const point = (p) => ({ lat: p.lat, lon: p.lon, heading: Number.isFinite(p.heading) ? p.heading : direct });
    return {
      id: s.id,
      name: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : 'Odcinek',
      limit: Number.isFinite(s.limit) && s.limit > 0 ? s.limit : null,
      lengthM: Number.isFinite(s.lengthM) && s.lengthM > 0 ? s.lengthM : null,
      start: point(s.start),
      end: point(s.end),
    };
  }

  function createWatcher() {
    let sections = [];
    let previous = null;             // punkt, od którego liczymy kierunek i przejazd
    let lastT = null;                // czas ostatniego odczytu
    let inside = null;               // { section, travelled, anchor, endWarned }
    const warned = new Set();        // odcinki, przed którymi już ostrzegliśmy
    const passed = new Map();        // punkt -> czas ostatniego minięcia

    function recently(key, t) {
      return passed.has(key) && t - passed.get(key) < REPEAT_S * 1000;
    }

    // Znacznie dłuższa droga niż odcinek oznacza, że zjechaliśmy z trasy
    function limitM(s) {
      return s.lengthM ? s.lengthM * 1.3 + 1000 : distance(s.start, s.end) * 2 + 2000;
    }

    function checkPoints(a, b, course, events) {
      // Najpierw koniec — tam może zaczynać się następny odcinek
      if (inside) {
        const s = inside.section;
        const at = passing(a, b, s.end);
        if (at && angle(course, s.end.heading) <= PASS_ANGLE) {
          events.push({ type: 'end', section: s, at });
          inside = null;
        }
      }
      let best = null;
      for (const s of sections) {
        if (distance(b, s.start) > 2000 || recently(s.id, b.t)) continue;
        const at = passing(a, b, s.start);
        if (!at) continue;
        const difference = angle(course, s.start.heading);
        const off = distance(at, s.start);
        if (difference <= PASS_ANGLE && (!best || off < best.off)) best = { section: s, at, off };
      }
      if (best) {
        if (inside) events.push({ type: 'abandon', section: inside.section, at: best.at });
        passed.set(best.section.id, b.t);
        inside = { section: best.section, travelled: 0, anchor: best.at, endWarned: false };
        events.push({ type: 'start', section: best.section, at: best.at });
      }
    }

    function checkOverrun(b, events) {
      if (!inside) return;
      const step = distance(inside.anchor, b);
      if (step >= ODOMETER_STEP_M) {
        inside.travelled += step;
        inside.anchor = b;
      }
      if (inside.travelled > limitM(inside.section)) {
        events.push({ type: 'abandon', section: inside.section, at: b });
        inside = null;
      }
    }

    function findUpcoming(b, course, approachM) {
      let nearest = null;
      for (const s of sections) {
        const d = distance(b, s.start);
        if (d > approachM + REARM_M) warned.delete(s.id);
        if (d > approachM || (nearest && d >= nearest.distance) || recently(s.id, b.t)) continue;
        if (angle(course, bearing(b, s.start)) > AHEAD_ANGLE) continue;
        if (angle(course, s.start.heading) > APPROACH_ANGLE) continue;
        nearest = { section: s, distance: d };
      }
      return nearest;
    }

    return {
      setSections(list) {
        sections = list;
      },

      // fix: { lat, lon, t (ms), ... } — kolejne dokładne odczyty GPS
      update(fix, approachM) {
        const events = [];
        if (lastT !== null && fix.t <= lastT) return { events, upcoming: null, inside: status(fix), idle: true };
        // Po przerwie w sygnale zaczynamy od nowa
        const a = lastT !== null && (fix.t - lastT) / 1000 <= MAX_GAP_S ? previous : null;
        lastT = fix.t;
        // Przy powolnej jeździe czekamy, aż uzbiera się wyraźne przemieszczenie
        if (a && distance(a, fix) < MIN_MOVE_M) {
          return { events, upcoming: null, inside: status(fix), idle: true };
        }
        previous = fix;
        let upcoming = null;
        if (a) {
          const course = bearing(a, fix);
          checkPoints(a, fix, course, events);
          upcoming = findUpcoming(fix, course, approachM);
          if (upcoming && !warned.has(upcoming.section.id)) {
            warned.add(upcoming.section.id);
            events.push({ type: 'approach', section: upcoming.section, distance: upcoming.distance });
          }
          if (inside && !inside.endWarned) {
            const d = distance(fix, inside.section.end);
            if (d <= approachM && angle(course, bearing(fix, inside.section.end)) <= AHEAD_ANGLE) {
              inside.endWarned = true;
              events.push({ type: 'approachEnd', section: inside.section, distance: d });
            }
          }
        }
        checkOverrun(fix, events);
        return { events, upcoming, inside: status(fix) };
      },
    };

    function status(fix) {
      return inside ? { section: inside.section, distanceToEnd: distance(fix, inside.section.end) } : null;
    }
  }

  const api = { createWatcher, normalize, distance, bearing, angle, PASS_RADIUS_M };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Sections = api;
})(this);
