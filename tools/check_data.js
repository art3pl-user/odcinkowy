#!/usr/bin/env node
// Sprawdza pliki bazy odcinków przed publikacją:  node tools/check_data.js
const fs = require('fs');
const path = require('path');
const { normalize } = require('../sections.js');

const ids = new Set();
let errors = 0;
for (const name of ['odcinki-wlasne.json', 'odcinki-osm.json']) {
  const file = path.join(__dirname, '..', 'data', name);
  const { sections } = JSON.parse(fs.readFileSync(file, 'utf8'));
  sections.forEach((s, i) => {
    if (!normalize(s)) {
      console.error(`${name}, wpis ${i + 1}: błędny (id, współrzędne lub zbyt bliskie punkty)`);
      errors++;
    } else if (ids.has(s.id)) {
      console.error(`${name}, wpis ${i + 1}: powtórzone id ${s.id}`);
      errors++;
    }
    ids.add(s && s.id);
  });
  console.log(`${name}: ${sections.length}`);
}
process.exitCode = errors ? 1 : 0;
