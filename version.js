// Numer wydania i lista nowości. Po zmianie: node tools/release.js
(function (root) {
  'use strict';

  const release = {
    version: '2.1.0',
    date: '2026-11-27',
    notes: [
      'Nagranie z kamery jest zawsze poziome',
      'Czytelniejsza, bardziej zwarta Konfiguracja z nowymi listami wyboru',
      'Pętla nagrań: 1, 5, 10, 15 lub 25 poprzednich nagrań',
      'Opis wykrywania uderzenia pod przyciskiem „i”',
      'Przyciski na dole ekranu nie chowają się już za belką telefonu',
    ],
  };

  if (typeof module !== 'undefined') module.exports = release;
  else root.RELEASE = release;
})(this);
