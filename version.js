// Numer wydania i lista nowości. Po zmianie: node tools/release.js
(function (root) {
  'use strict';

  const release = {
    version: '2.2.0',
    date: '2026-11-27',
    notes: [
      'W poziomie wybierzesz po prawej: mapę, kamerę albo obie naraz',
      'W poziomie przyciski menu i motywu są obok START/STOP',
      'W pionie podgląd z kamery nie powtarza prędkości i średniej (nagranie nadal je zawiera)',
    ],
  };

  if (typeof module !== 'undefined') module.exports = release;
  else root.RELEASE = release;
})(this);
