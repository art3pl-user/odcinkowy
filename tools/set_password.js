#!/usr/bin/env node
// Ustawia hasło strony /zgloszenia/:  node tools/set_password.js
// W repozytorium zapisywany jest tylko skrót (PBKDF2), nigdy samo hasło.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const MIN_LENGTH = 12;
const ITERATIONS = 600000;

if (!process.stdin.isTTY) {
  console.error('Uruchom to polecenie w zwykłym Terminalu — hasło trzeba wpisać z klawiatury.');
  process.exit(1);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    rl._writeToOutput = () => {};   // nie pokazujemy wpisywanych znaków
  });
}

(async () => {
  const password = await ask(`Nowe hasło (min. ${MIN_LENGTH} znaków, nie pojawi się na ekranie): `);
  if (password.length < MIN_LENGTH) {
    console.error('Hasło jest za krótkie. Nic nie zmieniono.');
    process.exit(1);
  }
  if (password !== await ask('Powtórz hasło: ')) {
    console.error('Hasła się różnią. Nic nie zmieniono.');
    process.exit(1);
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  fs.writeFileSync(path.join(__dirname, '..', 'zgloszenia', 'auth.json'), JSON.stringify({
    iterations: ITERATIONS, salt: salt.toString('hex'), hash: hash.toString('hex'),
  }) + '\n');
  console.log('Zapisano zgloszenia/auth.json. Opublikuj ten plik, aby hasło zadziałało na stronie.');
})();
