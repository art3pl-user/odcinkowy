// Ekran startowy: sprawdzenie wersji, pobieranie aktualizacji i nowości.
(function (root) {
  'use strict';

  const SEEN_KEY = 'odcinkowy.seenVersion';
  const CHECK_TIMEOUT_MS = 4000;
  const UPDATE_TIMEOUT_MS = 90000;
  const AUTO_CONTINUE_MS = 2500;

  const el = (id) => document.getElementById(id);
  const splash = el('splash');
  const bar = el('splash-bar');
  const go = el('splash-go');
  const later = el('splash-later');
  const current = RELEASE.version;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function newer(a, b) {
    const x = String(a).split('.').map(Number);
    const y = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    }
    return false;
  }

  const status = (text) => { el('splash-status').textContent = text; };

  function progress(percent) {
    bar.classList.toggle('busy', percent === null);
    bar.firstElementChild.style.width = percent === null ? '' : percent + '%';
    if (percent === null) bar.removeAttribute('aria-valuenow');
    else bar.setAttribute('aria-valuenow', Math.round(percent));
  }

  function news(title, notes) {
    el('splash-news-title').textContent = title;
    el('splash-notes').replaceChildren(...(Array.isArray(notes) ? notes : []).map((note) => {
      const item = document.createElement('li');
      item.textContent = String(note);
      return item;
    }));
    el('splash-news').hidden = false;
  }

  // Rozwiązuje się po dotknięciu przycisku (lub samo po czasie, jeśli podany)
  function choice(button, label, autoMs) {
    button.textContent = label;
    button.hidden = false;
    return new Promise((resolve) => {
      const timer = autoMs ? setTimeout(resolve, autoMs) : null;
      button.onclick = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  async function remoteRelease() {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), CHECK_TIMEOUT_MS);
    try {
      const response = await fetch('version.json?t=' + Date.now(), { cache: 'no-store', signal: abort.signal });
      if (!response.ok) return null;
      const data = await response.json();
      return data && typeof data.version === 'string' ? data : null;
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function workerVersion(worker) {
    if (!worker) return Promise.resolve(null);
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 1000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolve(event.data);
      };
      worker.postMessage({ type: 'version' }, [channel.port2]);
    });
  }

  // Czeka, aż nowa wersja zostanie pobrana. Zwraca rejestrację albo null.
  async function download(version, cancelled) {
    const onMessage = (event) => {
      const m = event.data;
      if (m?.type === 'precache' && m.version === version) {
        progress(m.done / m.total * 100);
        status('Pobieram aktualizację… ' + Math.round(m.done / m.total * 100) + '%');
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    navigator.serviceWorker.startMessages?.();
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return null;
      await registration.update();
      const deadline = Date.now() + UPDATE_TIMEOUT_MS;
      let idle = 0;
      while (Date.now() < deadline && !cancelled()) {
        for (const worker of [registration.waiting, registration.active]) {
          if (await workerVersion(worker) === version) return registration;
        }
        // Nic się nie pobiera: błąd instalacji albo serwer nie ma jeszcze nowych plików
        idle = registration.installing ? 0 : idle + 1;
        if (idle > 10) return null;
        await sleep(400);
      }
      return null;
    } catch (err) {
      console.warn(err);
      return null;
    } finally {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    }
  }

  function activate(registration) {
    const reload = () => location.reload();
    if (registration.waiting) {
      navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
      registration.waiting.postMessage({ type: 'skipWaiting' });
      setTimeout(reload, 4000);
    } else {
      reload();
    }
  }

  // Zwraca true, gdy aplikacja ma się przeładować w nowej wersji
  async function update(remote) {
    status('Dostępna jest wersja ' + remote.version);
    news('Co nowego w wersji ' + remote.version, remote.notes);
    progress(0);
    let skipped = false;
    const postponed = choice(later, 'Później').then(() => { skipped = true; return null; });
    const registration = await Promise.race([download(remote.version, () => skipped), postponed]);
    later.hidden = true;
    if (skipped) return false;
    if (!registration) {
      status('Nie udało się pobrać aktualizacji. Spróbuję przy następnym uruchomieniu.');
      bar.hidden = true;
      await choice(go, 'Uruchom obecną wersję');
      return false;
    }
    progress(100);
    status('Aktualizacja gotowa');
    await choice(go, 'Uruchom nową wersję');
    status('Uruchamiam…');
    activate(registration);
    return true;
  }

  async function run() {
    el('splash-version').textContent = 'wersja ' + current;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(console.error);
    }
    status('Sprawdzam nową wersję…');
    progress(null);
    const remote = await remoteRelease();

    if (remote && newer(remote.version, current) && 'serviceWorker' in navigator) {
      if (await update(remote)) return new Promise(() => {});   // czekamy na przeładowanie
    } else {
      status(remote ? 'Masz najnowszą wersję' : 'Brak połączenia — nie sprawdzono aktualizacji');
      progress(100);
      let seen = null;
      try { seen = localStorage.getItem(SEEN_KEY); } catch (e) { /* pamięć niedostępna */ }
      const fresh = seen !== current;
      if (fresh) news('Co nowego w wersji ' + current, RELEASE.notes);
      await choice(go, 'Rozpocznij', fresh ? 0 : AUTO_CONTINUE_MS);
      try { localStorage.setItem(SEEN_KEY, current); } catch (e) { /* pokażemy ponownie */ }
    }
    splash.classList.add('done');
    setTimeout(() => { splash.hidden = true; }, 400);
  }

  root.Startup = {
    run,
    showNews() {
      el('splash-version').textContent = 'wersja ' + current;
      status('');
      bar.hidden = true;
      later.hidden = true;
      news('Co nowego w wersji ' + current, RELEASE.notes);
      splash.hidden = false;
      splash.classList.remove('done');
      choice(go, 'Zamknij').then(() => { splash.hidden = true; });
    },
  };
})(this);
