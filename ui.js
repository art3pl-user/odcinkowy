// Wspólne funkcje ekranu: formatowanie, komunikaty i mapa.
(function (root) {
  'use strict';

  const el = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  let toastTimer = null;

  root.UI = {
    el,

    duration(seconds) {
      const s = Math.max(0, Math.floor(seconds));
      const h = Math.floor(s / 3600);
      const rest = pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60);
      return h ? h + ':' + rest : rest;
    },

    km: (meters) => (meters / 1000).toFixed(2).replace('.', ',') + ' km',
    speed: (kmh) => (kmh === null ? '--' : String(Math.round(kmh))),
    date: (t) => new Date(t).toLocaleDateString('pl-PL'),
    clock: (t) => new Date(t).toLocaleTimeString('pl-PL'),

    toast(text) {
      const toast = el('toast');
      toast.textContent = text;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
    },

    // Mapa OpenStreetMap w podanym elemencie
    createMap(container) {
      const map = L.map(container, { zoomControl: true }).setView([52.07, 19.48], 6);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(map);
      // Po obrocie telefonu lub przełączeniu zakładki mapa musi poznać nowy rozmiar
      new ResizeObserver(() => {
        if (container.clientWidth && container.clientHeight) map.invalidateSize();
      }).observe(container);
      return map;
    },

    dot(color) {
      return L.circleMarker([0, 0], {
        radius: 9, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1,
      });
    },
  };
})(this);
