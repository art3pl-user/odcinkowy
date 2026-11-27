// Sygnały: dźwięk, wibracja i baner na ekranie.
(function (root) {
  'use strict';

  const { el } = UI;
  const banner = el('alert');

  // [częstotliwość Hz, początek s, długość s]
  const SOUNDS = {
    approach: [[880, 0, 0.18], [880, 0.28, 0.18], [880, 0.56, 0.18]],
    start: [[660, 0, 0.2], [990, 0.24, 0.5]],
    end: [[990, 0, 0.2], [660, 0.24, 0.5]],
    abandon: [[330, 0, 0.5]],
  };

  let audio = null;
  let flashTimer = null;
  let holdUntil = 0;       // przez ten czas komunikat o minięciu punktu zostaje na ekranie

  // Przeglądarki pozwalają włączyć dźwięk dopiero po dotknięciu ekranu
  function unlock() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    if (!audio) audio = new Context();
    if (audio.state !== 'running') audio.resume().catch(() => {});
  }
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('click', unlock);

  function sound(kind) {
    if (!Storage_.settings().sound) return true;
    if (!audio || audio.state !== 'running') return false;
    const now = audio.currentTime;
    for (const [frequency, from, length] of SOUNDS[kind]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + from);
      gain.gain.exponentialRampToValueAtTime(0.5, now + from + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + from + length);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(now + from);
      oscillator.stop(now + from + length);
    }
    return true;
  }

  function show(kind, title, details) {
    banner.className = kind;
    el('alert-title').textContent = title;
    el('alert-details').textContent = details;
    banner.hidden = false;
  }

  function hide() {
    banner.hidden = true;
    document.body.classList.remove('flash');
  }

  // Sygnał jednorazowy: dźwięk, wibracja, mignięcie ekranu
  function signal(kind) {
    const audible = sound(kind);
    if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) {
      navigator.vibrate([200, 100, 200]);
    }
    document.body.classList.add('flash');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => document.body.classList.remove('flash'), 3000);
    if (!audible) UI.toast('Dotknij ekranu, aby włączyć dźwięk');
  }

  const meters = (m) => (m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m / 10) * 10 + ' m');
  const limit = (s) => (s.limit ? 'limit ' + s.limit + ' km/h · ' : '');

  root.Alerts = {
    // result: wynik z obserwatora odcinków
    handle(result) {
      for (const event of result.events) {
        const s = event.section;
        if (event.type === 'approach' || event.type === 'approachEnd') {
          signal('approach');
        } else {
          const titles = { start: 'Początek odcinka', end: 'Koniec odcinka', abandon: 'Nie minięto końca odcinka' };
          signal(event.type);
          show(event.type, titles[event.type], limit(s) + s.name);
          holdUntil = Date.now() + 5000;
        }
      }
      if (Date.now() < holdUntil || result.idle) return;

      const { upcoming, inside } = result;
      if (upcoming) {
        show('approach', 'Odcinkowy pomiar za ' + meters(upcoming.distance),
          limit(upcoming.section) + upcoming.section.name);
      } else if (inside) {
        show('inside', 'Pomiar odcinkowy', limit(inside.section) + 'do końca ' + meters(inside.distanceToEnd));
      } else {
        hide();
      }
    },
    hide,
    // Komunikat o końcu odcinka znika także wtedy, gdy samochód stoi
    tick() {
      if (Date.now() >= holdUntil && ['end', 'abandon'].includes(banner.className)) hide();
    },
    test() {
      unlock();
      // resume() jest asynchroniczne, więc dźwięk odtwarzamy chwilę później
      setTimeout(() => {
        signal('approach');
        show('approach', 'Odcinkowy pomiar za 500 m', 'To jest sygnał próbny');
        holdUntil = Date.now() + 3000;
        setTimeout(() => { if (Date.now() >= holdUntil) hide(); }, 3100);
      }, 100);
    },
  };
})(this);
