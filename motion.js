// Czujnik ruchu telefonu: zgoda, nasłuch i reakcja na uderzenie.
(function (root) {
  'use strict';

  const COOLDOWN_MS = 5000;    // jedno zdarzenie to wiele odczytów
  const NO_DATA_MS = 3000;

  const detector = Impact.createDetector();
  let state = 'off';           // off | needs-tap | waiting | active | denied | unsupported
  let requesting = false;
  let peak = 0;
  let lastImpact = 0;          // czas ostatniego sygnału
  let lastForce = 0;
  let noDataTimer = null;

  const threshold = () => Storage_.settings().impactG;
  const wanted = () => threshold() > 0 && Storage_.settings().recording;
  const needsPermission = () => typeof window.DeviceMotionEvent?.requestPermission === 'function';
  const format = (g) => g.toFixed(1).replace('.', ',') + ' g';

  function onMotion(event) {
    const force = detector.feed(event, event.timeStamp);
    if (force === null) return;
    state = 'active';
    peak = Math.max(peak, force);
    if (!threshold() || force < threshold()) return;
    const now = Date.now();
    // W czasie przerwy reagujemy tylko na wyraźnie silniejsze uderzenie
    if (now - lastImpact < COOLDOWN_MS && force <= lastForce) return;
    const repeated = now - lastImpact < COOLDOWN_MS;
    lastImpact = now;
    lastForce = force;
    if (Recorder.impact(force) && !repeated) Alerts.impact(format(force));
  }

  function listen() {
    if (state === 'active' || state === 'waiting') return;
    state = 'waiting';
    window.addEventListener('devicemotion', onMotion);
    clearTimeout(noDataTimer);
    noDataTimer = setTimeout(() => {
      if (state === 'waiting') state = 'unsupported';
    }, NO_DATA_MS);
  }

  function stop() {
    window.removeEventListener('devicemotion', onMotion);
    clearTimeout(noDataTimer);
    state = 'off';
  }

  // iPhone pyta o zgodę i wymaga, by pytanie wynikało z dotknięcia ekranu
  async function request() {
    if (requesting) return;
    requesting = true;
    try {
      if (await window.DeviceMotionEvent.requestPermission() === 'granted') {
        state = 'off';
        if (wanted()) listen();
      } else {
        state = 'denied';
      }
    } catch (err) {
      console.warn(err);
      state = 'needs-tap';
    } finally {
      requesting = false;
    }
  }

  // Wywoływane po zmianie ustawień i przy każdym dotknięciu ekranu
  function update(fromTap) {
    if (!wanted()) {
      stop();
    } else if (!window.DeviceMotionEvent) {
      state = 'unsupported';
    } else if (state === 'off' || state === 'needs-tap') {
      if (!needsPermission()) listen();
      else if (fromTap) request();
      else state = 'needs-tap';
    }
  }

  document.addEventListener('click', () => update(true));

  root.Motion = {
    update,
    resetPeak() {
      peak = 0;
    },
    // Opis stanu do ekranu Konfiguracji
    describe() {
      if (!threshold()) return 'Wykrywanie uderzeń jest wyłączone';
      if (!Storage_.settings().recording) return 'Działa tylko przy włączonym nagrywaniu';
      if (state === 'needs-tap') return 'Dotknij ekranu, aby włączyć czujnik';
      if (state === 'denied') return 'Brak zgody na czujnik ruchu';
      if (state === 'unsupported') return 'Czujnik nie przesyła danych';
      if (state !== 'active') return 'Czekam na czujnik…';
      return 'Najsilniejszy wstrząs: ' + format(peak) + (peak >= threshold() ? ' — powyżej progu' : '');
    },
    needsTap: () => state === 'needs-tap',
  };
})(this);
