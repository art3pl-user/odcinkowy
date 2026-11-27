// Zakładka "Nagrania": odtwarzanie, zapis w telefonie i usuwanie.
(function (root) {
  'use strict';

  const { el } = UI;
  const player = el('clip-player');
  const panel = el('clip-panel');
  const keepButton = el('clip-keep');
  const deleteButton = el('clip-delete');

  let selected = null;     // { clip, file, url }
  let request = 0;

  const megabytes = (bytes) => (bytes / 1e6).toFixed(0) + ' MB';
  const title = (clip) => UI.date(clip.startedAt) + ', ' + UI.clock(clip.startedAt);
  const details = (clip) => UI.duration((clip.endedAt - clip.startedAt) / 1000) + ' · ' +
    megabytes(clip.size) + (clip.saved ? ' · zachowane' : ' · w pętli');

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function fileName(clip) {
    const d = new Date(clip.startedAt);
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' +
      pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds());
    return 'odcinkowy_' + stamp + (clip.mime === 'video/mp4' ? '.mp4' : '.webm');
  }

  function close() {
    request++;
    if (selected) {
      player.pause();
      player.removeAttribute('src');
      player.load();
      URL.revokeObjectURL(selected.url);
      selected = null;
    }
    panel.hidden = true;
    delete deleteButton.dataset.confirm;
    deleteButton.textContent = 'Usuń';
  }

  function showSelected() {
    el('clip-title').textContent = title(selected.clip) + ' · ' + details(selected.clip);
    keepButton.textContent = selected.clip.saved ? 'Nie zachowuj' : 'Zachowaj';
  }

  async function select(clip) {
    close();
    const mine = request;
    try {
      const blob = await VideoStore.blob(clip);
      if (mine !== request) return;
      // Plik przygotowujemy od razu: udostępnianie musi ruszyć w chwili dotknięcia
      const file = new File([blob], fileName(clip), { type: clip.mime });
      selected = { clip, file, url: URL.createObjectURL(file) };
      player.src = selected.url;
      showSelected();
      panel.hidden = false;
      el('view-recordings').scrollTop = 0;
    } catch (err) {
      console.error(err);
      UI.toast('Nie można otworzyć nagrania');
    }
  }

  async function refresh() {
    if (el('view-recordings').hidden) return;
    let clips;
    try {
      clips = await VideoStore.all();
    } catch (err) {
      console.error(err);
      el('clips-info').textContent = 'Nie można odczytać pamięci telefonu.';
      return;
    }
    const active = Recorder.activeId();
    clips = clips.filter((c) => c.finished && c.id !== active).sort((a, b) => b.startedAt - a.startedAt);

    const total = clips.reduce((sum, c) => sum + c.size, 0);
    el('clips-info').textContent = clips.length
      ? 'Nagrań: ' + clips.length + ' · ' + megabytes(total) +
        (active ? ' · trwające pojawi się po zakończeniu klipu' : '')
      : (active ? 'Trwa pierwszy klip — pojawi się po jego zakończeniu.' : 'Brak nagrań. Włącz nagrywanie w Konfiguracji.');

    el('clip-list').replaceChildren(...clips.map((clip) => {
      const button = node('button', 'trip');
      button.type = 'button';
      button.append(
        node('strong', '', title(clip)),
        node('span', 'trip-average', clip.saved ? '★' : '▶'),
        node('span', 'trip-details', details(clip)),
      );
      button.addEventListener('click', () => select(clip));
      const item = node('li');
      item.append(button);
      return item;
    }));
    if (selected && !clips.some((c) => c.id === selected.clip.id)) close();
  }

  // Na telefonie otwiera okno udostępniania (np. "Zachowaj wideo"), inaczej pobiera plik
  el('clip-export').addEventListener('click', async () => {
    if (!selected) return;
    const { file, url } = selected;
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn(err);
      }
    }
    const link = node('a');
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
  });

  keepButton.addEventListener('click', async () => {
    if (!selected) return;
    const { clip } = selected;
    try {
      await VideoStore.setSaved(clip.id, !clip.saved);
      clip.saved = !clip.saved;
      showSelected();
      refresh();
    } catch (err) {
      console.error(err);
      UI.toast('Nie udało się zapisać zmiany');
    }
  });

  deleteButton.addEventListener('click', async () => {
    if (!selected) return;
    if (!deleteButton.dataset.confirm) {
      deleteButton.dataset.confirm = '1';
      deleteButton.textContent = 'Na pewno?';
      return;
    }
    const { id } = selected.clip;
    close();
    try {
      await VideoStore.remove(id);
    } catch (err) {
      console.error(err);
      UI.toast('Nie udało się usunąć nagrania');
    }
    refresh();
  });

  root.Recordings = { refresh, leave: close };
})(this);
