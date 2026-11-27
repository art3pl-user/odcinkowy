// Przeglądanie zgłoszeń z GitHuba (tylko odczyt).
// Hasło zasłania tę stronę. Same zgłoszenia są publiczne w repozytorium.
(function () {
  'use strict';

  const API = 'https://api.github.com/repos/art3pl-user/odcinkowy/issues';
  const SESSION_KEY = 'odcinkowy.zgloszenia';
  const NEAR_M = 200;      // tak blisko istniejącego początku to prawdopodobnie duplikat

  const el = (id) => document.getElementById(id);
  let auth = null;
  let known = [];
  let request = 0;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  const hex = (buffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');

  async function derive(password) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const salt = Uint8Array.from(auth.salt.match(/../g), (h) => parseInt(h, 16));
    return hex(await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: auth.iterations }, key, 256));
  }

  async function loadKnown() {
    const lists = await Promise.all(['odcinki-wlasne.json', 'odcinki-osm.json'].map(async (name) => {
      try {
        const response = await fetch('../data/' + name, { cache: 'no-cache' });
        return (await response.json()).sections.map(Sections.normalize).filter(Boolean);
      } catch (e) {
        return [];
      }
    }));
    known = lists.flat();
  }

  // Treść zgłoszenia pisze obca osoba — czytamy tylko blok JSON i sprawdzamy go
  function parse(body) {
    const block = /```json\s*([\s\S]*?)```/.exec(body || '');
    if (!block) return { error: 'Brak bloku z danymi (```json)' };
    let raw;
    try {
      raw = JSON.parse(block[1]);
    } catch (e) {
      return { error: 'Dane nie są poprawnym JSON-em' };
    }
    const section = Sections.normalize(raw);
    return section ? { raw, section } : { error: 'Błędne lub niepełne dane (id, współrzędne, zbyt bliskie punkty)' };
  }

  function duplicate(section) {
    return known.find((s) => s.id === section.id ||
      (Sections.distance(s.start, section.start) < NEAR_M &&
        Sections.angle(s.start.heading, section.start.heading) < 60));
  }

  function mapLink(label, p) {
    const link = node('a', '', label);
    link.href = 'https://www.openstreetmap.org/?mlat=' + p.lat + '&mlon=' + p.lon + '#map=17/' + p.lat + '/' + p.lon;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  function issueItem(issue) {
    const item = node('li');
    item.append(
      node('strong', '', '#' + issue.number + ' ' + issue.title),
      node('span', 'meta', (issue.user ? issue.user.login : '?') + ' · ' +
        new Date(issue.created_at).toLocaleString('pl-PL')),
    );
    const links = node('div', 'links');
    const github = node('a', '', 'Otwórz na GitHubie');
    github.href = 'https://github.com/art3pl-user/odcinkowy/issues/' + Number(issue.number);
    github.target = '_blank';
    github.rel = 'noopener noreferrer';

    const { raw, section, error } = parse(issue.body);
    if (error) {
      item.append(node('span', 'warn', error));
    } else {
      const same = duplicate(section);
      item.append(
        node('span', same ? 'warn' : 'ok', same
          ? 'Możliwy duplikat: ' + same.name
          : 'Dane poprawne, brak podobnego odcinka w bazie'),
        node('span', 'meta', section.name + ' · limit ' + (section.limit || '—') + ' · w linii prostej ' +
          (Sections.distance(section.start, section.end) / 1000).toFixed(2).replace('.', ',') + ' km'),
      );
      const json = JSON.stringify(raw);
      item.append(node('pre', '', json));
      const copy = node('button', '', 'Kopiuj dane');
      copy.type = 'button';
      copy.addEventListener('click', () => {
        navigator.clipboard.writeText(json).then(
          () => { copy.textContent = 'Skopiowano'; },
          () => { copy.textContent = 'Nie udało się skopiować'; });
      });
      links.append(mapLink('Początek na mapie', section.start), mapLink('Koniec na mapie', section.end), copy);
    }
    links.append(github);
    item.append(links);
    return item;
  }

  async function load() {
    const mine = ++request;
    el('message').textContent = 'Pobieram…';
    el('issues').replaceChildren();
    try {
      await loadKnown();
      const response = await fetch(API + '?per_page=50&state=' + el('state').value,
        { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(response.status === 403 || response.status === 429
          ? 'GitHub chwilowo ogranicza liczbę zapytań. Spróbuj za kilkadziesiąt minut.'
          : 'GitHub odpowiedział błędem ' + response.status);
      }
      const issues = (await response.json()).filter((i) => !i.pull_request);
      if (mine !== request) return;
      el('issues').replaceChildren(...issues.map(issueItem));
      el('message').textContent = issues.length ? 'Zgłoszeń: ' + issues.length : 'Brak zgłoszeń.';
    } catch (err) {
      if (mine === request) el('message').textContent = err.message || 'Brak połączenia';
    }
  }

  function enter() {
    el('login').hidden = true;
    el('panel').hidden = false;
    load();
  }

  el('login').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!auth) return;
    const button = event.submitter;
    if (button) button.disabled = true;
    el('login-message').textContent = 'Sprawdzam…';
    const hash = await derive(el('password').value);
    if (button) button.disabled = false;
    if (hash !== auth.hash) {
      el('login-message').textContent = 'Błędne hasło';
      return;
    }
    sessionStorage.setItem(SESSION_KEY, hash);
    el('password').value = '';
    el('login-message').textContent = '';
    enter();
  });

  el('reload').addEventListener('click', load);
  el('state').addEventListener('change', load);
  el('logout').addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });

  (async () => {
    try {
      const data = await (await fetch('auth.json', { cache: 'no-cache' })).json();
      if (data && data.hash && data.salt && data.iterations) auth = data;
    } catch (e) {
      console.warn(e);
    }
    if (!auth) el('login-message').textContent = 'Hasło nie zostało jeszcze ustawione.';
    else if (sessionStorage.getItem(SESSION_KEY) === auth.hash) enter();
  })();
})();
