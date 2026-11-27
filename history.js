// Zakładka "Historia": lista pomiarów i odtwarzanie trasy.
(function (root) {
  'use strict';

  const { el } = UI;
  const listEl = el('trip-list');
  const emptyEl = el('history-empty');
  const slider = el('replay-slider');
  const playButton = el('replay-play');
  const rateSelect = el('replay-rate');
  const deleteButton = el('replay-delete');

  let trip = null;
  let map = null;
  let layers = null;
  let done = null;         // przejechana część trasy
  let tail = null;         // odcinek od ostatniego punktu do znacznika
  let marker = null;
  let time = 0;            // ms od początku trasy
  let drawnIndex = -1;
  let frame = null;
  let previous = null;
  let confirmTimer = null;
  let request = 0;         // chroni przed spóźnioną odpowiedzią z bazy

  const speedText = (kmh) => UI.speed(Route.corrected(kmh, trip.correction)) + ' km/h';
  const firstT = () => trip.points[0].t;
  const length = () => trip.points[trip.points.length - 1].t - firstT();

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  // ---------- Lista ----------

  async function showList() {
    const current = ++request;
    let trips;
    try {
      trips = (await Storage_.allTrips()).filter((t) => t.finished);
    } catch (err) {
      console.error(err);
      emptyEl.textContent = 'Nie można odczytać pamięci telefonu.';
      emptyEl.hidden = false;
      return;
    }
    if (current !== request) return;

    trips.sort((a, b) => b.startedAt - a.startedAt);
    emptyEl.hidden = trips.length > 0;
    listEl.replaceChildren(...trips.map((t) => {
      const link = node('a', 'trip');
      link.href = '#historia/' + t.id;
      const average = Route.corrected(t.averageKmh, t.correction);
      link.append(
        node('strong', '', UI.date(t.startedAt) + ', ' + UI.clock(t.startedAt)),
        node('span', 'trip-average', UI.speed(average) + ' km/h'),
        node('span', 'trip-details', UI.km(t.distanceM) + ' · ' + UI.duration(t.seconds) +
          (t.interrupted ? ' · przerwany' : '')),
      );
      const item = node('li');
      item.append(link);
      return item;
    }));
  }

  // ---------- Odtwarzanie ----------

  function draw() {
    const p = Route.pointAt(trip.points, firstT() + time);
    const position = [p.lat, p.lon];
    marker.setLatLng(position);
    if (p.index !== drawnIndex) {
      drawnIndex = p.index;
      done.setLatLngs(trip.points.slice(0, p.index + 1).map((q) => [q.lat, q.lon]));
    }
    const travelled = done.getLatLngs();
    tail.setLatLngs([travelled[travelled.length - 1], position]);
    if (frame !== null && !map.getBounds().pad(-0.15).contains(position)) {
      map.panTo(position, { animate: false });
    }

    slider.value = time;
    el('replay-speed').textContent = speedText(p.speed);
    el('replay-clock').textContent = UI.date(firstT() + time) + ', ' + UI.clock(firstT() + time);
    el('replay-position').textContent = p.lat.toFixed(6) + ', ' + p.lon.toFixed(6);
    el('replay-elapsed').textContent = UI.duration(time / 1000) + ' / ' + UI.duration(length() / 1000);
  }

  function pause() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    playButton.textContent = '▶ Odtwórz';
  }

  function step(now) {
    if (previous !== null) time += (now - previous) * Number(rateSelect.value);
    previous = now;
    if (time >= length()) {
      time = length();
      draw();
      pause();
      return;
    }
    draw();
    frame = requestAnimationFrame(step);
  }

  function play() {
    if (time >= length()) time = 0;
    previous = null;
    playButton.textContent = '❚❚ Pauza';
    frame = requestAnimationFrame(step);
  }

  function resetDelete() {
    clearTimeout(confirmTimer);
    deleteButton.textContent = 'Usuń';
    delete deleteButton.dataset.confirm;
  }

  async function showTrip(id) {
    const current = ++request;
    let found = null;
    try {
      found = await Storage_.getTrip(id);
    } catch (err) {
      console.error(err);
    }
    if (current !== request) return;
    if (!found || !found.finished || found.points.length < 2) {
      location.replace('#historia');
      return;
    }
    trip = found;

    const average = Route.corrected(trip.averageKmh, trip.correction);
    el('replay-summary').textContent = 'Średnia ' + UI.speed(average) + ' km/h · maks. ' +
      speedText(Route.maxSpeed(trip.points)) + ' · ' + UI.km(trip.distanceM);

    if (!map) {
      map = UI.createMap(el('replay-map'));
      layers = L.layerGroup().addTo(map);
    }
    map.invalidateSize();
    layers.clearLayers();
    const all = trip.points.map((p) => [p.lat, p.lon]);
    const whole = L.polyline(all, { color: '#757575', weight: 5 }).addTo(layers);
    done = L.polyline([], { color: '#1565c0', weight: 5 }).addTo(layers);
    tail = L.polyline([], { color: '#1565c0', weight: 5 }).addTo(layers);
    UI.dot('#2e7d32').setLatLng(all[0]).addTo(layers);
    UI.dot('#c62828').setLatLng(all[all.length - 1]).addTo(layers);
    marker = UI.dot('#ffb300').setLatLng(all[0]).addTo(layers);
    map.fitBounds(whole.getBounds(), { padding: [30, 30], maxZoom: 17, animate: false });

    time = 0;
    drawnIndex = -1;
    slider.max = length();
    draw();
  }

  playButton.addEventListener('click', () => {
    if (!trip) return;
    if (frame === null) play();
    else pause();
  });

  slider.addEventListener('input', () => {
    if (!trip) return;
    time = Number(slider.value);
    previous = null;
    draw();
  });

  // Usuwanie wymaga drugiego dotknięcia
  deleteButton.addEventListener('click', async () => {
    if (!trip) return;
    if (!deleteButton.dataset.confirm) {
      deleteButton.dataset.confirm = '1';
      deleteButton.textContent = 'Na pewno usunąć?';
      confirmTimer = setTimeout(resetDelete, 4000);
      return;
    }
    resetDelete();
    try {
      await Storage_.deleteTrip(trip.id);
      location.replace('#historia');
    } catch (err) {
      console.error(err);
      UI.toast('Nie udało się usunąć pomiaru');
    }
  });

  root.History_ = {
    showList,
    showTrip,
    leave() {
      request++;
      pause();
      resetDelete();
      trip = null;
    },
  };
})(this);
