// Zakładka "Odcinkowy pomiar": GPS, pomiar, zapis trasy i mapa na żywo.
(function (root) {
  'use strict';

  const STALE_MS = 5000;      // po tylu ms bez odczytu prędkość znika z ekranu
  const AUTOSAVE_MS = 5000;   // co ile zapisywać trwający pomiar

  const { el } = UI;
  const speedEl = el('speed');
  const averageEl = el('average');
  const distanceEl = el('distance');
  const timeEl = el('time');
  const statusEl = el('status');
  const button = el('toggle');
  const mapEl = el('live-map');
  const centerButton = el('center');
  const landscape = window.matchMedia('(orientation: landscape)');

  const tracker = Tracker.createTracker();
  const watcher = Sections.createWatcher();
  let course = null;       // kierunek jazdy w stopniach
  let courseFrom = null;
  let sections = [];
  let sectionLayer = null;
  let watchId = null;
  let receivedAt = 0;      // kiedy przyszedł ostatni dobry odczyt (zegar telefonu)
  let startedAt = null;    // do płynnego licznika czasu
  let wakeLock = null;
  let trip = null;         // nagrywana trasa
  let savedAt = 0;
  let correction = Storage_.loadCorrection();

  let map = null;
  let marker = null;
  let line = null;
  let routeOnMap = [];     // punkty ostatniego pomiaru pokazane na mapie
  let follow = true;

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle('error', Boolean(isError));
  }

  function render() {
    Alerts.tick();
    const fresh = Date.now() - receivedAt < STALE_MS;
    const speed = fresh ? Route.corrected(tracker.speedKmh(), correction) : null;
    speedEl.textContent = UI.speed(speed);

    const s = tracker.section();
    averageEl.textContent = UI.speed(s ? Route.corrected(s.averageKmh, correction) : null);
    distanceEl.textContent = UI.km(s ? s.distanceM : 0);

    let seconds = s ? s.seconds : 0;
    if (s && s.running && !s.waiting) {
      if (startedAt === null) startedAt = Date.now() - s.seconds * 1000;
      seconds = (Date.now() - startedAt) / 1000;
    }
    timeEl.textContent = UI.duration(seconds);

    if (receivedAt && !fresh) {
      setStatus('Brak sygnału GPS', true);
      Alerts.hide();
    }
  }

  // ---------- Mapa ----------

  // Mapa jest widoczna tylko w poziomie; w pionie nie pobieramy kafelków
  function updateMap() {
    if (!landscape.matches || el('view-measure').hidden) return;
    if (!map) {
      map = UI.createMap(mapEl);
      line = L.polyline(routeOnMap, { color: '#1565c0', weight: 5 }).addTo(map);
      sectionLayer = L.layerGroup().addTo(map);
      drawSections();
      marker = UI.dot('#1565c0');
      map.on('dragstart', () => {
        follow = false;
        centerButton.hidden = false;
      });
    }
    map.invalidateSize();
    line.setLatLngs(routeOnMap);
    const fix = tracker.lastFix();
    if (!fix) return;
    const position = [fix.lat, fix.lon];
    const first = !map.hasLayer(marker);
    marker.setLatLng(position).addTo(map);
    if (follow) map.setView(position, first ? 16 : map.getZoom(), { animate: false });
  }

  // Punkty odcinków: pomarańczowy — początek, fioletowy — koniec
  function drawSections() {
    if (!sectionLayer) return;
    sectionLayer.clearLayers();
    for (const s of sections) {
      for (const [point, color, label] of [[s.start, '#ef6c00', 'Początek'], [s.end, '#6a1b9a', 'Koniec']]) {
        const text = document.createElement('span');
        text.textContent = label + ': ' + s.name + (s.limit ? ' (' + s.limit + ' km/h)' : '');
        L.circleMarker([point.lat, point.lon], {
          radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1,
        }).bindPopup(text).addTo(sectionLayer);
      }
    }
  }

  // ---------- Zapis trasy ----------

  function recordPoint() {
    const fix = tracker.lastFix();
    const kmh = tracker.speedKmh();
    const added = Route.addPoint(trip.points, {
      t: fix.t,
      lat: fix.lat,
      lon: fix.lon,
      speed: kmh === null ? null : Math.round(kmh * 10) / 10,
      accuracy: Math.round(fix.accuracy),
    }, Tracker.distanceM);
    if (added) routeOnMap.push([fix.lat, fix.lon]);
  }

  function snapshot(finished) {
    const s = tracker.section();
    return {
      ...trip,
      finished,
      endedAt: Date.now(),
      distanceM: s.distanceM,
      seconds: s.seconds,
      averageKmh: s.averageKmh,
      correction,
    };
  }

  function autosave() {
    if (!trip || !trip.points.length) return;
    savedAt = Date.now();
    Storage_.saveTrip(snapshot(false)).catch((err) => {
      console.error(err);
      UI.toast('Nie można zapisać trasy w pamięci telefonu');
    });
  }

  // now: chwila startu; section: odcinek przy starcie automatycznym
  function start(now = Date.now(), section = null) {
    startedAt = null;
    savedAt = 0;
    routeOnMap = [];
    follow = true;
    centerButton.hidden = true;
    tracker.start(now);
    trip = { id: String(now), startedAt: now, points: [] };
    if (section) {
      trip.auto = true;
      trip.sectionId = section.id;
      trip.sectionName = section.name;
    }
    // Świeży odczyt sprzed naciśnięcia START to pierwszy punkt trasy
    if (!tracker.section().waiting) recordPoint();
    button.textContent = 'STOP';
    button.classList.add('running');
    if (watchId === null) watchGps();
  }

  async function stop(extra) {
    tracker.stop();
    const done = { ...snapshot(true), ...extra };
    trip = null;
    button.textContent = 'START';
    button.classList.remove('running');
    try {
      if (done.points.length < 2) {
        await Storage_.deleteTrip(done.id);
        UI.toast('Za mało danych GPS — pomiaru nie zapisano');
      } else {
        await Storage_.saveTrip(done);
        UI.toast('Zapisano w Historii');
      }
    } catch (err) {
      console.error(err);
      UI.toast('Błąd zapisu — pomiar nie trafił do Historii');
    }
  }

  // ---------- Odcinki ----------

  // Sygnały i automatyczny start/stop. Punkt minięcia leży między odczytami,
  // więc dopisujemy go do pomiaru przed bieżącym odczytem.
  function watchSections(fix) {
    const result = watcher.update(fix, Storage_.settings().approachM);
    for (const event of result.events) {
      if (event.type === 'start' && Storage_.settings().auto) {
        if (trip) {
          UI.toast('Pomiar już trwa — nie uruchamiam nowego');
        } else {
          tracker.update(event.at);
          start(event.at.t, event.section);
          render();
        }
      }
      const ours = trip && trip.auto && trip.sectionId === event.section.id;
      if (ours && event.type === 'end') {
        tracker.update(event.at);
        recordPoint();
        stop();
      } else if (ours && event.type === 'abandon') {
        stop({ incomplete: true });
      }
    }
    Alerts.handle(result);
  }

  function updateCourse(fix) {
    if (courseFrom && Sections.distance(courseFrom, fix) < 10) return;
    if (courseFrom) course = Sections.bearing(courseFrom, fix);
    courseFrom = fix;
  }

  // ---------- GPS ----------

  function onPosition(pos) {
    const c = pos.coords;
    const fix = {
      lat: c.latitude,
      lon: c.longitude,
      accuracy: c.accuracy,
      speed: Number.isFinite(c.speed) ? c.speed : null,
      t: pos.timestamp,
    };
    // Najpierw odcinki: pomiar może zacząć się lub skończyć tuż przed tym odczytem
    const usable = fix.accuracy <= Tracker.MAX_ACCURACY_M;
    if (usable) {
      updateCourse(fix);
      watchSections(fix);
    }
    const accepted = tracker.update(fix);
    if (accepted) {
      receivedAt = Date.now();
      setStatus('GPS: dokładność ±' + Math.round(c.accuracy) + ' m');
      if (trip) {
        recordPoint();
        if (Date.now() - savedAt >= AUTOSAVE_MS) autosave();
      }
      updateMap();
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

  // ---------- Zdarzenia ----------

  button.addEventListener('click', () => {
    if (trip) {
      stop();
    } else {
      start();
    }
    keepScreenOn();
    render();
    updateMap();
  });

  centerButton.addEventListener('click', () => {
    follow = true;
    centerButton.hidden = true;
    updateMap();
  });

  statusEl.addEventListener('click', watchGps);
  landscape.addEventListener('change', () => requestAnimationFrame(updateMap));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      keepScreenOn();
      watchGps();
    } else {
      autosave();
    }
  });
  window.addEventListener('pagehide', autosave);

  root.Measure = {
    init() {
      Database.onChange((list) => {
        sections = list;
        watcher.setSections(list);
        drawSections();
      });
      watchGps();
      keepScreenOn();
      render();
      setInterval(render, 500);
    },
    show: updateMap,
    correction: () => correction,
    setCorrection(value) {
      correction = Route.clampCorrection(value);
      Storage_.saveCorrection(correction);
      render();
    },
    // Aktualne położenie (do dodawania odcinków)
    position() {
      const fix = tracker.lastFix();
      if (!fix || Date.now() - receivedAt >= STALE_MS) return null;
      return { ...fix, course, speedKmh: tracker.speedKmh() || 0 };
    },
    // Surowa prędkość z GPS (do podglądu w Konfiguracji)
    gpsSpeed: () => (Date.now() - receivedAt < STALE_MS ? tracker.speedKmh() : null),
  };
})(this);
