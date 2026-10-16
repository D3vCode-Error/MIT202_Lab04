
'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const dataPath = path.join(__dirname, 'data.json');
const password = process.env.CHATLAB_SEED_PASSWORD;

if (!password) {
  console.error('CHATLAB_SEED_PASSWORD is required.');
  process.exit(1);
}

if (!fs.existsSync(dataPath)) {
  console.error('data.json not found.');
  process.exit(1);
}

async function main() {
  const data = JSON.parse(
    fs.readFileSync(dataPath, 'utf8')
  );

  const usernames = ['alice', 'bob', 'carol', 'guest1'];

  if (
    !Array.isArray(data.users) ||
    !usernames.every(name =>
      data.users.some(user => user.username === name)
    )
  ) {
    throw new Error(
      'Expected the four users in the data.users array.'
    );
  }

  for (const user of data.users) {
    if (usernames.includes(user.username)) {
      user.passwordHash = await bcrypt.hash(password, 12);
    }
  }

  fs.writeFileSync(
    dataPath,
    JSON.stringify(data, null, 2) + '\n'
  );

  console.log('Password hashes updated for all four users.');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
