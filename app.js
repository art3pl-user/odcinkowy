// Menu, przełączanie zakładek i konfiguracja.
(function () {
  'use strict';

  const { el } = UI;
  const menu = el('menu');
  const backdrop = el('backdrop');
  const menuButton = el('menu-button');
  const titles = {
    measure: 'Odcinkowy pomiar',
    history: 'Historia',
    replay: 'Trasa',
    recordings: 'Nagrania',
    database: 'Baza odcinków',
    settings: 'Konfiguracja',
  };

  function setMenu(open) {
    menu.classList.toggle('open', open);
    backdrop.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
  }

  menuButton.addEventListener('click', () => setMenu(!menu.classList.contains('open')));
  backdrop.addEventListener('click', () => setMenu(false));
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenu(false);
  });

  // Zakładki są w adresie (#historia), więc działa przycisk "wstecz" telefonu
  function route() {
    const [tab, id] = location.hash.slice(1).split('/');
    let view = 'measure';
    if (tab === 'historia') view = id ? 'replay' : 'history';
    else if (tab === 'nagrania') view = 'recordings';
    else if (tab === 'odcinki') view = 'database';
    else if (tab === 'konfiguracja') view = 'settings';

    History_.leave();
    Recordings.leave();
    if (view !== 'measure') Recorder.minimize();
    for (const name of Object.keys(titles)) el('view-' + name).hidden = name !== view;
    el('title').textContent = titles[view];
    document.body.dataset.view = view;
    for (const link of menu.querySelectorAll('a')) {
      const active = link.dataset.tab === (view === 'replay' ? 'history' : view);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    setMenu(false);

    if (view === 'measure') Measure.show();
    if (view === 'history') History_.showList();
    if (view === 'replay') History_.showTrip(id);
    if (view === 'recordings') Recordings.refresh();
    if (view === 'database') Database.render();
    if (view === 'settings') renderSettings();
  }

  // ---------- Konfiguracja ----------

  function renderSettings() {
    // Minuta nagrania to najwyżej ok. 19 MB; do pętli dochodzi trwający klip
    const { clipMinutes, loopClips } = Storage_.settings();
    const gigabytes = (loopClips + 1) * clipMinutes * 19 / 1000;
    el('loop-size').textContent = 'Pętla zajmie maksymalnie około ' +
      gigabytes.toFixed(1).replace('.', ',') + ' GB pamięci telefonu.';
    el('impact-state').textContent = Motion.describe();
    const correction = Measure.correction();
    el('correction').textContent = (correction > 0 ? '+' : '') + correction;
    el('correction-minus').disabled = correction <= -Route.MAX_CORRECTION;
    el('correction-plus').disabled = correction >= Route.MAX_CORRECTION;
    const gps = Measure.gpsSpeed();
    el('correction-preview').textContent = gps === null
      ? 'Brak sygnału GPS'
      : 'GPS: ' + UI.speed(gps) + ' km/h → na ekranie: ' +
        UI.speed(Route.corrected(gps, correction)) + ' km/h';
  }

  function changeCorrection(value) {
    Measure.setCorrection(value);
    renderSettings();
  }

  el('correction-minus').addEventListener('click', () => changeCorrection(Measure.correction() - 1));
  el('correction-plus').addEventListener('click', () => changeCorrection(Measure.correction() + 1));
  el('correction-reset').addEventListener('click', () => changeCorrection(0));
  for (const name of ['auto', 'sound']) {
    const box = el('setting-' + name);
    box.checked = Boolean(Storage_.settings()[name]);
    box.addEventListener('change', () => Storage_.setSetting(name, box.checked));
  }
  const approach = el('setting-approach');
  approach.value = String(Storage_.settings().approachM);
  approach.addEventListener('change', () => Storage_.setSetting('approachM', Number(approach.value)));
  el('alert-test').addEventListener('click', Alerts.test);

  const sideButtons = document.querySelectorAll('[data-side-choice]');
  function showSide() {
    for (const button of sideButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.sideChoice === Storage_.settings().rightSide));
    }
  }
  for (const button of sideButtons) {
    button.addEventListener('click', () => {
      Storage_.setSetting('rightSide', button.dataset.sideChoice);
      // Wybór układu z mapą przywraca ją, nawet jeśli była schowana
      Storage_.setSetting('mapHidden', false);
      showSide();
      Measure.layout();
    });
  }
  showSide();

  const recording = el('setting-recording');
  recording.checked = Boolean(Storage_.settings().recording);
  recording.addEventListener('change', () => {
    Recorder.setEnabled(recording.checked);
    Motion.update(true);
    renderSettings();
  });
  for (const [id, name] of [['setting-clip', 'clipMinutes'], ['setting-loop', 'loopClips']]) {
    const select = el(id);
    select.value = String(Storage_.settings()[name]);
    select.addEventListener('change', () => {
      Storage_.setSetting(name, Number(select.value));
      renderSettings();
    });
  }

  const impact = el('setting-impact');
  impact.value = String(Storage_.settings().impactG);
  impact.addEventListener('change', () => {
    Storage_.setSetting('impactG', Number(impact.value));
    Motion.resetPeak();
    Motion.update(true);
    renderSettings();
  });
  el('impact-info').addEventListener('click', () => Sheet.info('Wykrywanie uderzenia',
    'Po wykryciu uderzenia trwające nagranie jest automatycznie zachowywane. ' +
    'Im wyższa czułość, tym słabszy wstrząs wystarczy. ' +
    'Jeśli zapisują się nagrania po dziurach i progach, zmniejsz czułość.'));
  el('impact-reset').addEventListener('click', () => {
    Motion.resetPeak();
    renderSettings();
  });

  setInterval(() => {
    if (!el('view-settings').hidden) renderSettings();
  }, 1000);

  el('about-version').textContent = 'Wersja ' + RELEASE.version + ' z ' + RELEASE.date;
  el('about-news').addEventListener('click', Startup.showNews);
  // Sprawdzenie odbywa się na ekranie startowym, więc uruchamiamy aplikację od nowa
  el('about-update').addEventListener('click', () => {
    if (Measure.measuring()) UI.toast('Najpierw zatrzymaj pomiar');
    else location.reload();
  });

  // Listy w stylu aplikacji — po ustawieniu wartości początkowych
  for (const select of document.querySelectorAll('select')) Sheet.enhance(select);

  window.addEventListener('hashchange', route);
  // Najpierw ekran startowy (aktualizacje) i porządek w przerwanych pomiarach,
  // dopiero potem GPS i kamera
  route();
  Startup.run()
    .then(() => Storage_.recoverTrips())
    .catch(console.error)
    .then(() => {
      Database.load().catch(console.error);
      Measure.init();
      route();
      Recorder.init();
      Motion.update(false);
      if (Motion.needsTap()) UI.toast('Dotknij ekranu, aby włączyć wykrywanie uderzeń');
      el('toggle').disabled = false;
    });
})();
