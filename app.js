(function () {
  'use strict';

  const STALE_MS = 5000; // po tylu ms bez odczytu prędkość znika z ekranu

  const el = (id) => document.getElementById(id);
  const speedEl = el('speed');
  const averageEl = el('average');
  const distanceEl = el('distance');
  const timeEl = el('time');
  const statusEl = el('status');
  const button = el('toggle');

  const tracker = Tracker.createTracker();
  let watchId = null;
  let receivedAt = 0;      // kiedy przyszedł ostatni dobry odczyt (zegar telefonu)
  let startedAt = null;    // do płynnego licznika czasu
  let wakeLock = null;

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle('error', Boolean(isError));
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const pad = (n) => String(n).padStart(2, '0');
    const h = Math.floor(s / 3600);
    const rest = pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60);
    return h ? h + ':' + rest : rest;
  }

  function render() {
    const fresh = Date.now() - receivedAt < STALE_MS;
    const speed = tracker.speedKmh();
    speedEl.textContent = fresh && speed !== null ? Math.round(speed) : '--';

    const s = tracker.section();
    averageEl.textContent = s && s.averageKmh !== null ? Math.round(s.averageKmh) : '--';
    distanceEl.textContent = ((s ? s.distanceM : 0) / 1000).toFixed(2).replace('.', ',') + ' km';

    let seconds = s ? s.seconds : 0;
    if (s && s.running && !s.waiting) {
      if (startedAt === null) startedAt = Date.now() - s.seconds * 1000;
      seconds = (Date.now() - startedAt) / 1000;
    }
    timeEl.textContent = formatTime(seconds);

    if (receivedAt && !fresh) setStatus('Brak sygnału GPS', true);
  }

  function onPosition(pos) {
    const c = pos.coords;
    const accepted = tracker.update({
      lat: c.latitude,
      lon: c.longitude,
      accuracy: c.accuracy,
      speed: Number.isFinite(c.speed) ? c.speed : null,
      t: pos.timestamp,
    });
    if (accepted) {
      receivedAt = Date.now();
      setStatus('GPS: dokładność ±' + Math.round(c.accuracy) + ' m');
    } else {
      setStatus('Słaby sygnał GPS (±' + Math.round(c.accuracy) + ' m)', true);
    }
    render();
  }

  function onError(err) {
    if (err.code === err.PERMISSION_DENIED) {
      setStatus('Brak zgody na lokalizację. Włącz ją w ustawieniach i dotknij tego napisu.', true);
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    } else {
      setStatus('Szukam sygnału GPS…', true);
    }
  }

  function watchGps() {
    if (!window.isSecureContext) {
      setStatus('GPS działa tylko przez HTTPS', true);
      return;
    }
    if (!('geolocation' in navigator)) {
      setStatus('Ta przeglądarka nie obsługuje GPS', true);
      return;
    }
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    });
  }

  // Blokada wygaszania ekranu — po wygaszeniu przeglądarka wstrzymuje GPS
  async function keepScreenOn() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    if (wakeLock && !wakeLock.released) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {
      // np. tryb oszczędzania baterii — aplikacja działa dalej
    }
  }

  button.addEventListener('click', () => {
    const s = tracker.section();
    if (s && s.running) {
      tracker.stop();
      button.textContent = 'START';
      button.classList.remove('running');
    } else {
      startedAt = null;
      tracker.start(Date.now());
      button.textContent = 'STOP';
      button.classList.add('running');
      if (watchId === null) watchGps();
    }
    keepScreenOn();
    render();
  });

  statusEl.addEventListener('click', watchGps);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      keepScreenOn();
      watchGps();
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  }

  watchGps();
  keepScreenOn();
  setInterval(render, 500);
})();
