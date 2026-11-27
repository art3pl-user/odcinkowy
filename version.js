// Numer wydania i lista nowości. Po zmianie: node tools/release.js
(function (root) {
  'use strict';

  const release = {
    version: '2.0.0',
    date: '2026-11-27',
    notes: [
      'Nowy, elegancki wygląd z zegarem prędkości',
      'Motyw dzienny i nocny, przełączany ręcznie lub według pory dnia',
      'Ekran startowy z aktualizacją aplikacji i listą nowości',
      'Wykrywanie uderzenia z automatycznym zachowaniem nagrania',
    ],
  };

  if (typeof module !== 'undefined') module.exports = release;
  else root.RELEASE = release;
})(this);
