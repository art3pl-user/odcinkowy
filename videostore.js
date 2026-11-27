// Nagrania w IndexedDB: opis klipu i osobno kolejne kawałki obrazu.
(function (root) {
  'use strict';

  const DB_NAME = 'odcinkowy-video';

  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('clips', { keyPath: 'id' });
          request.result.createObjectStore('chunks', { keyPath: ['clip', 'seq'] });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch((err) => {
        dbPromise = null;
        throw err;
      });
    }
    return dbPromise;
  }

  async function run(stores, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const request = action(tx);
      tx.oncomplete = () => resolve(request && request.result);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  }

  const range = (id) => IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);

  const api = {
    // Kawałek i opis klipu zapisujemy razem, więc zawsze są zgodne
    addChunk: (clip, seq, blob) => run(['clips', 'chunks'], 'readwrite', (tx) => {
      tx.objectStore('chunks').put({ clip: clip.id, seq, blob });
      tx.objectStore('clips').put(clip);
    }),
    put: (clip) => run('clips', 'readwrite', (tx) => tx.objectStore('clips').put(clip)),
    get: (id) => run('clips', 'readonly', (tx) => tx.objectStore('clips').get(id)),
    all: () => run('clips', 'readonly', (tx) => tx.objectStore('clips').getAll()),
    remove: (id) => run(['clips', 'chunks'], 'readwrite', (tx) => {
      tx.objectStore('clips').delete(id);
      tx.objectStore('chunks').delete(range(id));
    }),

    async blob(clip) {
      const chunks = await run('chunks', 'readonly', (tx) => tx.objectStore('chunks').getAll(range(clip.id)));
      return new Blob(chunks.map((c) => c.blob), { type: clip.mime });
    },

    // Zmienia wybrane pola (np. "zachowane") bez nadpisywania reszty opisu
    update: (id, changes) => run('clips', 'readwrite', (tx) => {
      const store = tx.objectStore('clips');
      const request = store.get(id);
      request.onsuccess = () => {
        if (request.result) store.put({ ...request.result, ...changes });
      };
    }),

    // Pętla trzyma co najmniej keepMs ostatnich niezachowanych nagrań. Liczymy czas,
    // nie liczbę plików, więc kilka krótkich klipów nie wypchnie dłuższego.
    async prune(keepMs) {
      const loop = (await api.all())
        .filter((c) => c.finished && !c.saved)
        .sort((a, b) => b.startedAt - a.startedAt);
      let kept = 0;
      for (const clip of loop) {
        if (kept >= keepMs) await api.remove(clip.id);
        else kept += clip.endedAt - clip.startedAt;
      }
    },

    // Klipy przerwane zamknięciem aplikacji nadają się do odtworzenia
    async recover() {
      for (const clip of await api.all()) {
        if (!clip.finished) await api.put({ ...clip, finished: true });
      }
    },
  };

  root.VideoStore = api;
})(this);
