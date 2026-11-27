// Zapis w pamięci telefonu: trasy w IndexedDB, ustawienia w localStorage.
(function (root) {
  'use strict';

  const DB_NAME = 'odcinkowy';
  const STORE = 'trips';
  const CORRECTION_KEY = 'odcinkowy.correction';

  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch((err) => {
        dbPromise = null;
        throw err;
      });
    }
    return dbPromise;
  }

  async function run(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  }

  const api = {
    saveTrip: (trip) => run('readwrite', (store) => store.put(trip)),
    getTrip: (id) => run('readonly', (store) => store.get(id)),
    allTrips: () => run('readonly', (store) => store.getAll()),
    deleteTrip: (id) => run('readwrite', (store) => store.delete(id)),

    // Pomiary przerwane zamknięciem aplikacji trafiają do historii
    async recoverTrips() {
      for (const trip of await api.allTrips()) {
        if (trip.finished) continue;
        if (trip.points.length < 2) await api.deleteTrip(trip.id);
        else await api.saveTrip({ ...trip, finished: true, interrupted: true });
      }
    },

    loadCorrection() {
      try {
        return Route.clampCorrection(localStorage.getItem(CORRECTION_KEY) || 0);
      } catch (e) {
        return 0;
      }
    },

    saveCorrection(value) {
      try {
        localStorage.setItem(CORRECTION_KEY, String(value));
      } catch (e) {
        // brak dostępu do pamięci — ustawienie działa do zamknięcia aplikacji
      }
    },
  };

  root.Storage_ = api;
})(this);
