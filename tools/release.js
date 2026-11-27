#!/usr/bin/env node
// Przed publikacją:  node tools/release.js
// Tworzy version.json z version.js i sprawdza, czy wydanie jest spójne.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const release = require('../version.js');
const sw = read('sw.js');
const errors = [];

const swVersion = /const VERSION = '([^']+)'/.exec(sw)?.[1];
if (swVersion !== release.version) {
  errors.push(`sw.js ma wersję ${swVersion}, a version.js ${release.version}`);
}
const files = [...sw.split('const FILES = [')[1].split('];')[0].matchAll(/'([^']+)'/g)].map((m) => m[1]);
for (const file of files) {
  if (!fs.existsSync(path.join(root, file))) errors.push('Brak pliku z listy sw.js: ' + file);
}
for (const [, file] of read('index.html').matchAll(/(?:src|href)="([^"#:]+\.(?:js|css))"/g)) {
  if (!files.includes(file)) errors.push('Pliku z index.html nie ma na liście sw.js: ' + file);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify(release, null, 2) + '\n');
console.log(`Wydanie ${release.version}: ${files.length} plików, version.json zapisany.`);
