// Motyw dzienny i nocny: ręcznie albo według wschodu i zachodu słońca.
(function (root) {
  'use strict';

  const APPLIED_KEY = 'odcinkowy.theme';        // czytany w <head>, żeby nie było błysku
  const POSITION_KEY = 'odcinkowy.position';
  const POLAND = { lat: 52, lon: 19 };          // zanim poznamy pozycję z GPS
  const COLORS = { day: '#f4f1ea', night: '#070a12' };

  let position = Storage_.read(POSITION_KEY, POLAND);

  const choice = () => {
    const value = Storage_.settings().theme;
    return value === 'day' || value === 'night' ? value : 'auto';
  };

  function effective() {
    if (choice() !== 'auto') return choice();
    return Sun.isDay(Date.now(), position.lat, position.lon) ? 'day' : 'night';
  }

  function apply() {
    const theme = effective();
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = COLORS[theme];
    try { localStorage.setItem(APPLIED_KEY, theme); } catch (e) { /* bez zapamiętania */ }
    for (const button of document.querySelectorAll('[data-theme-choice]')) {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice()));
    }
    const toggle = document.getElementById('theme-toggle');
    toggle.setAttribute('aria-label', theme === 'day' ? 'Włącz tryb nocny' : 'Włącz tryb dzienny');
  }

  function set(value) {
    Storage_.setSetting('theme', value);
    apply();
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-theme-choice]');
    if (button) set(button.dataset.themeChoice);
  });
  document.getElementById('theme-toggle').addEventListener('click',
    () => set(effective() === 'day' ? 'night' : 'day'));
  document.addEventListener('visibilitychange', apply);
  setInterval(apply, 60000);
  apply();

  root.Theme = {
    // Przybliżona pozycja (ok. 10 km) wystarcza do wschodu i zachodu słońca
    setPosition(lat, lon) {
      if (Math.abs(lat - position.lat) < 0.1 && Math.abs(lon - position.lon) < 0.1) return;
      position = { lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10 };
      Storage_.write(POSITION_KEY, position);
      apply();
    },
  };
})(this);
