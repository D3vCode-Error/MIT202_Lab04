const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'data.json');

function loadUsers() {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  return data.users;
}

async function login(req, res) {
  const { username, password } = req.body || {};

  const users = loadUsers();
  const user = Array.isArray(users)
    ? users.find((u) => u.username === username)
    : users[username];

  if (!user || !user.passwordHash ||
      !(await bcrypt.compare(password || '', user.passwordHash))) {
    return res.status(401).json({
      error: 'Invalid credentials'
    });
  }

  const token = jwt.sign(
    {
      sub: user.username,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '15m',
      issuer: 'chatlab',
      algorithm: 'HS256'
    }
  );

  return res.json({ token });
}

function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';

  try {
    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET,
      {
        algorithms: ['HS256'],
        issuer: 'chatlab'
      }
    );
    next();
  } catch {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }
}

function verifyToken(token) {
  return jwt.verify(
    token,
    process.env.JWT_SECRET,
    {
      algorithms: ['HS256'],
      issuer: 'chatlab'
    }
  );
}

module.exports = {
  login,
  requireAuth,
  verifyToken
};