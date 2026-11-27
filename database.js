// Baza odcinków: pliki ze strony, własne wpisy z telefonu i zgłoszenia na GitHub.
(function (root) {
  'use strict';

  const { el } = UI;
  const REPOSITORY = 'https://github.com/art3pl-user/odcinkowy';
  const FILES = ['data/odcinki-wlasne.json', 'data/odcinki-osm.json'];
  const LOCAL_KEY = 'odcinkowy.sections';
  const DRAFT_KEY = 'odcinkowy.draft';
  const MAX_ACCURACY_M = 25;      // tak dokładny musi być GPS przy dodawaniu punktu
  const MIN_SPEED_KMH = 15;       // wolniej nie da się wiarygodnie ustalić kierunku

  let shared = [];
  let updated = '';
  let loadError = false;
  const listeners = [];
  let local = (Storage_.read(LOCAL_KEY, [])).map(Sections.normalize).filter(Boolean);
  let draft = Storage_.read(DRAFT_KEY, {});

  // Wpisy z telefonu mają pierwszeństwo; powtórzone identyfikatory pomijamy
  function all() {
    const byId = new Map();
    for (const s of [...local, ...shared]) if (!byId.has(s.id)) byId.set(s.id, s);
    return [...byId.values()];
  }

  const changed = () => {
    for (const listener of listeners) listener(all());
    render();
  };

  async function load() {
    const results = await Promise.allSettled(FILES.map(async (file) => {
      const response = await fetch(file);
      if (!response.ok) throw new Error(file + ': ' + response.status);
      return response.json();
    }));
    loadError = results.some((r) => r.status === 'rejected');
    const loaded = [];
    results.forEach((result) => {
      if (result.status !== 'fulfilled') {
        console.warn(result.reason);
        return;
      }
      const data = result.value;
      if (data.updated) updated = String(data.updated);
      if (Array.isArray(data.sections)) loaded.push(...data.sections.map(Sections.normalize).filter(Boolean));
    });
    if (loaded.length) shared = loaded;
    changed();
  }

  // ---------- Zgłoszenie do wspólnej bazy ----------

  function issueUrl(section) {
    const body = 'Nowy odcinek do pliku `data/odcinki-wlasne.json`:\n\n```json\n' +
      JSON.stringify(section) + '\n```\n\nSkąd wiadomo, że to odcinkowy pomiar (opis, źródło):\n';
    return REPOSITORY + '/issues/new?title=' + encodeURIComponent('Odcinek: ' + section.name) +
      '&body=' + encodeURIComponent(body);
  }

  function capture(which) {
    const here = Measure.position();
    if (!here || here.accuracy > MAX_ACCURACY_M) {
      UI.toast('Poczekaj na dokładniejszy sygnał GPS');
      return;
    }
    if (here.course === null || here.speedKmh < MIN_SPEED_KMH) {
      UI.toast('Punkt zapisz w trakcie jazdy — potrzebny jest kierunek (robi to pasażer)');
      return;
    }
    draft[which] = {
      lat: Number(here.lat.toFixed(6)),
      lon: Number(here.lon.toFixed(6)),
      heading: Math.round(here.course) % 360,
    };
    Storage_.write(DRAFT_KEY, draft);
    render();
  }

  function saveDraft(event) {
    event.preventDefault();
    const name = el('new-name').value.trim();
    const section = Sections.normalize({
      id: 'user-' + Date.now().toString(36),
      name,
      limit: Number(el('new-limit').value) || null,
      start: draft.start,
      end: draft.end,
    });
    if (!name || !section) {
      UI.toast(!name ? 'Podaj nazwę odcinka' : 'Początek i koniec muszą być oddalone');
      return;
    }
    local = [section, ...local];
    Storage_.write(LOCAL_KEY, local);
    draft = {};
    Storage_.write(DRAFT_KEY, draft);
    el('new-section').reset();
    changed();
    UI.toast('Zapisano w telefonie. Możesz wysłać odcinek do wspólnej bazy.');
  }

  // ---------- Ekran ----------

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function localItem(section) {
    const item = node('li', 'card');
    const send = node('a', 'action', 'Wyślij do wspólnej bazy');
    send.href = issueUrl(section);
    send.target = '_blank';
    send.rel = 'noopener';
    const remove = node('button', 'danger', 'Usuń');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      if (!remove.dataset.confirm) {
        remove.dataset.confirm = '1';
        remove.textContent = 'Na pewno?';
        return;
      }
      local = local.filter((s) => s.id !== section.id);
      Storage_.write(LOCAL_KEY, local);
      changed();
    });
    const row = node('div', 'row');
    row.append(send, remove);
    item.append(node('strong', '', section.name + (section.limit ? ' · ' + section.limit + ' km/h' : '')), row);
    return item;
  }

  function render() {
    el('database-count').textContent = 'Odcinków w bazie: ' + all().length +
      (updated ? ' · dane z OpenStreetMap z ' + updated : '') +
      (loadError ? ' · nie udało się pobrać całej bazy' : '');
    for (const which of ['start', 'end']) {
      const p = draft[which];
      el('new-' + which + '-value').textContent = p ? p.lat + ', ' + p.lon : 'nie zapisano';
    }
    el('local-list').replaceChildren(...local.map(localItem));
    el('local-title').hidden = !local.length;
  }

  el('new-start').addEventListener('click', () => capture('start'));
  el('new-end').addEventListener('click', () => capture('end'));
  el('new-section').addEventListener('submit', saveDraft);
  el('database-reload').addEventListener('click', async () => {
    await load();
    UI.toast(loadError ? 'Brak połączenia — używam zapisanej bazy' : 'Baza odświeżona');
  });

  root.Database = {
    load,
    render,
    all,
    onChange(listener) {
      listeners.push(listener);
      listener(all());
    },
  };
})(this);
