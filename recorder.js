// Wideorejestrator: obraz z kamery z naniesionymi pomiarami, nagrywany w pętli.
(function (root) {
  'use strict';

  const FPS = 24;
  const BITRATE = 2500000;       // ok. 19 MB na minutę
  const CHUNK_MS = 1000;         // co tyle obraz trafia do pamięci telefonu
  const NEAR_START_S = 30;       // "Zapisz" tuż po zmianie klipu zachowuje też poprzedni
  const AFTER_IMPACT_S = 30;     // tyle nagrania po uderzeniu zachowujemy co najmniej
  const IMPACT_LABEL_MS = 5000;  // napis o uderzeniu na obrazie
  const TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm'];

  const { el } = UI;
  const box = el('camera');
  const canvas = el('camera-canvas');
  const context = canvas.getContext('2d');
  const video = el('camera-video');
  const saveButton = el('camera-save');

  let stream = null;
  let output = null;             // strumień z płótna
  let current = null;            // trwający klip
  let previous = null;           // poprzedni klip
  let timer = null;
  let generation = 0;            // unieważnia spóźnione uruchomienia kamery
  let starting = false;
  let ready = false;             // po uporządkowaniu przerwanych nagrań
  let keepUntil = 0;             // klipy zaczęte przed tą chwilą są zachowywane
  let impactLabel = { text: '', until: 0 };

  const settings = () => Storage_.settings();
  // Z zapasem 2 s, bo klip bywa o ułamek sekundy dłuższy lub krótszy od ustawionego
  const loopMs = () => settings().loopClips * (settings().clipMinutes * 60000 - 2000);

  function message(text) {
    el('camera-state').textContent = text;
  }

  // ---------- Obraz z pomiarami ----------

  function draw() {
    const { width, height } = canvas;
    context.drawImage(video, 0, 0, width, height);

    const unit = Math.min(width, height) / 18;
    const data = Measure.overlay();
    const lines = [
      { size: unit * 1.2, text: Date.now() < impactLabel.until ? impactLabel.text : '' },
      { size: unit * 1.7, text: data.speed + ' km/h    średnia ' + data.average + ' km/h' },
      { size: unit * 0.85, text: data.measurement },
      { size: unit * 0.75, text: data.date + (data.position ? '    ' + data.position : '') },
    ].filter((line) => line.text);
    const barHeight = lines.reduce((sum, line) => sum + line.size * 1.25, unit * 0.5);

    context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    context.fillRect(0, height - barHeight, width, barHeight);
    context.fillStyle = '#fff';
    context.textBaseline = 'top';
    let y = height - barHeight + unit * 0.35;
    for (const line of lines) {
      context.font = '600 ' + Math.round(line.size) + 'px system-ui, sans-serif';
      context.fillText(line.text, unit * 0.5, y, width - unit);
      y += line.size * 1.25;
    }
  }

  // ---------- Klipy ----------

  function beginClip() {
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const media = new MediaRecorder(output, {
      ...(type && { mimeType: type }),
      videoBitsPerSecond: BITRATE,
      // Bez częstych klatek kluczowych MP4 oddaje dane dopiero co kilka sekund
      videoKeyFrameIntervalDuration: CHUNK_MS,
    });
    const now = Date.now();
    const clip = {
      id: String(now), startedAt: now, endedAt: now, size: 0,
      mime: (media.mimeType || type || 'video/webm').split(';')[0],
      width: canvas.width, height: canvas.height, saved: now < keepUntil, finished: false,
    };
    const entry = { media, clip, seq: 0, queue: Promise.resolve() };

    media.ondataavailable = (event) => {
      if (!event.data.size) return;
      const seq = entry.seq++;
      clip.size += event.data.size;
      clip.endedAt = Date.now();
      entry.queue = entry.queue
        .then(() => VideoStore.addChunk({ ...clip }, seq, event.data))
        .catch(storageFailed);
    };
    media.onstop = () => {
      entry.queue = entry.queue.then(async () => {
        if (!clip.size) return;
        clip.finished = true;
        await VideoStore.put({ ...clip });
        await VideoStore.prune(loopMs());
        root.Recordings?.refresh();
      }).catch(storageFailed);
    };
    media.onerror = (event) => {
      console.error(event.error || event);
      if (current === entry) fail('Błąd nagrywania');
    };
    media.start(CHUNK_MS);
    return entry;
  }

  function endClip(entry) {
    if (!entry) return;
    previous = entry;
    if (entry.media.state !== 'inactive') entry.media.stop();
  }

  // Nowy klip startuje przed zatrzymaniem starego, żeby nie było przerwy
  function nextClip() {
    const old = current;
    try {
      current = beginClip();
      endClip(old);
    } catch (err) {
      endClip(old);
      current = beginClip();
    }
    showSaved();
  }

  function showSaved() {
    saveButton.textContent = current?.clip.saved ? '✓ Zachowane' : 'Zapisz';
  }

  function tick() {
    if (!current || !video.videoWidth) return;
    const rotated = video.videoWidth !== canvas.width || video.videoHeight !== canvas.height;
    if (rotated) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    draw();
    const seconds = (Date.now() - current.clip.startedAt) / 1000;
    try {
      // Po obrocie telefonu zaczynamy nowy klip w nowych wymiarach
      if (rotated || seconds >= settings().clipMinutes * 60) nextClip();
    } catch (err) {
      console.error(err);
      fail('Błąd nagrywania');
      return;
    }
    message('● REC ' + UI.duration((Date.now() - current.clip.startedAt) / 1000));
  }

  async function storageFailed(err) {
    console.error(err);
    if (!current) return;
    fail('Brak miejsca w pamięci — nagrywanie zatrzymane. Usuń stare nagrania.');
  }

  // ---------- Kamera ----------

  function stop() {
    generation++;
    starting = false;
    clearInterval(timer);
    timer = null;
    endClip(current);
    current = null;
    for (const s of [stream, output]) s?.getTracks().forEach((track) => track.stop());
    stream = output = null;
    video.srcObject = null;
    box.hidden = true;
    setFull(false);
  }

  function fail(text) {
    stop();
    UI.toast(text);
    el('recording-state').textContent = text;
  }

  async function start() {
    if (!ready || starting || current || !settings().recording || document.visibilityState !== 'visible') return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !canvas.captureStream) {
      fail('Ta przeglądarka nie obsługuje nagrywania');
      return;
    }
    starting = true;
    const mine = ++generation;
    try {
      const camera = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (mine !== generation) {
        camera.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = camera;
      video.srcObject = stream;
      await video.play();
      if (mine !== generation) return;
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      draw();
      output = canvas.captureStream(FPS);
      current = beginClip();
      timer = setInterval(tick, 1000 / FPS);
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (mine === generation) fail('Kamera została wyłączona przez telefon');
      });
      box.hidden = false;
      showSaved();
      el('recording-state').textContent = '';
      navigator.storage?.persist?.().catch(() => {});
    } catch (err) {
      if (mine !== generation) return;
      console.error(err);
      fail(err.name === 'NotAllowedError'
        ? 'Brak zgody na kamerę. Włącz ją w ustawieniach przeglądarki.'
        : 'Nie można uruchomić kamery');
    } finally {
      if (mine === generation) starting = false;
    }
  }

  // Zmiany trafiają do kolejki klipu, więc nie wyprzedzą ich zapisy obrazu
  function keep(entry, changes = {}) {
    const update = { ...changes, saved: true };
    Object.assign(entry.clip, update);
    entry.queue = entry.queue.then(() => VideoStore.update(entry.clip.id, update)).catch(storageFailed);
  }

  // Zachowany klip nie jest nadpisywany przez pętlę
  function protect(changes) {
    keep(current, changes);
    if (previous && Date.now() - current.clip.startedAt < NEAR_START_S * 1000) keep(previous);
    showSaved();
  }

  function save() {
    if (!current) return;
    protect();
    UI.toast('Nagranie zostanie zachowane — znajdziesz je w zakładce Nagrania');
  }

  // Zwraca false, gdy nic nie jest nagrywane
  function impact(force) {
    if (!current) return false;
    const now = Date.now();
    // Jeśli klip zaraz się skończy, zachowujemy też następny
    keepUntil = now + AFTER_IMPACT_S * 1000;
    impactLabel = { text: 'UDERZENIE ' + force.toFixed(1).replace('.', ',') + ' g', until: now + IMPACT_LABEL_MS };
    protect({ impact: Math.max(current.clip.impact || 0, Math.round(force * 10) / 10) });
    return true;
  }

  // ---------- Okno podglądu ----------

  function setFull(full) {
    box.classList.toggle('full', full);
    el('camera-size').textContent = full ? '✕' : '⛶';
    el('camera-size').setAttribute('aria-label', full ? 'Zmniejsz' : 'Pełny ekran');
  }

  saveButton.addEventListener('click', save);
  el('camera-size').addEventListener('click', () => setFull(!box.classList.contains('full')));
  canvas.addEventListener('click', () => setFull(!box.classList.contains('full')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setFull(false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') start();
    else stop();
  });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', () => start());

  root.Recorder = {
    impact,
    async init() {
      try {
        await VideoStore.recover();
        await VideoStore.prune(loopMs());
      } catch (err) {
        console.error(err);
      }
      ready = true;
      start();
    },
    setEnabled(enabled) {
      Storage_.setSetting('recording', enabled);
      el('recording-state').textContent = '';
      if (enabled) start();
      else stop();
    },
    minimize: () => setFull(false),
    activeId: () => current?.clip.id ?? null,
  };
})(this);
