'use strict';
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const { login, requireAuth, verifyToken } = require('./auth');
const seedData = require('./data.json');
const { makeAuthorization } = require('./authz');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

// Keep Exercise 1 room broadcasting and Exercise 2 in-memory history.
const rooms = new Map();  // roomName -> Set of currently joined WebSocket clients
const allowedRooms = new Set(seedData.rooms || ['general', 'dev']);
const membership = new Map([...allowedRooms].map(name => [name, new Set()]));
for (const user of seedData.users || []) {
  for (const roomName of user.rooms || []) {
    if (!membership.has(roomName)) membership.set(roomName, new Set());
    membership.get(roomName).add(user.username);
  }
}
const { can } = makeAuthorization(membership);
const history = [];
let nextMessageId = 1;

// Exercise 2: deprecation headers on every v1 response.
app.use('/api/v1', (req, res, next) => {
  res.set('Deprecation', 'true');
  res.set('Sunset', 'Wed, 30 Jun 2027 00:00:00 GMT');
  res.set('Link', '</api/v2/rooms>; rel="successor-version"');
  next();
});

// Exercise 3: login is public, other API routes need JWTs.
app.post('/api/v1/login', login);
app.get('/api/v1/rooms', requireAuth, (req, res) => {
  res.json([...allowedRooms].map(name => ({ name })));
});
app.get('/api/v1/rooms/:room/messages', requireAuth, (req, res) => {
  if (!allowedRooms.has(req.params.room)) return res.status(404).json({ error: 'Room not found' });
  res.json(history.filter(m => m.room === req.params.room).map(m => ({ from: m.from, text: m.text })));
});
app.get('/api/v2/rooms', requireAuth, (req, res) => {
  res.json([...allowedRooms].map(name => ({ name })));
});
app.get('/api/v2/rooms/:room/messages', requireAuth, (req, res) => {
  if (!allowedRooms.has(req.params.room)) return res.status(404).json({ error: 'Room not found' });
  const requested = Number(req.query.limit ?? 20);
  if (!Number.isInteger(requested) || requested < 1 || requested > 100) {
    return res.status(400).json({ error: 'limit must be an integer from 1 to 100' });
  }
  const roomMessages = history.filter(m => m.room === req.params.room);
  const items = roomMessages.slice(0, requested).map(m => ({
    from: { username: m.from, role: m.role }, text: m.text
  }));
  const nextCursor = roomMessages.length > requested ? roomMessages[requested].id : null;
  res.json({ items, nextCursor });
});

// Exercise 4, Procedure 2: room creation is admin-only.
app.post('/api/v1/rooms', requireAuth, (req, res) => {
  if (!can(req.user, 'create')) return res.status(403).json({ error: 'Forbidden' });
  const name = req.body?.name;
  if (typeof name !== 'string' || !/^[a-z0-9_-]{1,32}$/.test(name)) {
    return res.status(400).json({ error: 'Valid room name required' });
  }
  if (allowedRooms.has(name)) return res.status(409).json({ error: 'Room already exists' });
  allowedRooms.add(name);
  membership.set(name, new Set());
  return res.status(201).json({ name });
});

// Exercise 4, Procedure 4: members can delete own messages, admins any.
app.delete('/api/v1/messages/:id', requireAuth, (req, res) => {
  const index = history.findIndex(m => m.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Message not found' });
  if (!can(req.user, 'delete', history[index].room, { owner: history[index].from })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  history.splice(index, 1);
  return res.status(200).json({ deleted: req.params.id });
});

// Socket helper functions reused by the admin room-removal action.
function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function error(ws, code, detail) { send(ws, { type: 'error', code, detail }); }
function leave(ws, room) {
  const clients = rooms.get(room);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) rooms.delete(room);
  }
  ws.joined.delete(room);
}

// Exercise 4, Procedure 5: immediately remove an existing room subscription.
app.post('/api/v1/rooms/:room/remove', requireAuth, (req, res) => {
  if (!can(req.user, 'remove', req.params.room)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const room = req.params.room;
  const username = req.body?.username;
  if (!allowedRooms.has(room)) return res.status(404).json({ error: 'Room not found' });
  if (typeof username !== 'string' || !username) {
    return res.status(400).json({ error: 'username is required' });
  }
  if (!membership.get(room)?.has(username)) {
    return res.status(404).json({ error: 'User is not a room member' });
  }
  membership.get(room).delete(username);
  for (const ws of [...(rooms.get(room) || [])]) {
    if (ws.user.sub === username) {
      leave(ws, room); // Do NOT close the WebSocket connection.
      error(ws, 'REMOVED_FROM_ROOM', `Removed from ${room}`);
    }
  }
  return res.status(200).json({ room, removed: username });
});

function handleMessage(ws, raw) {
  if (Buffer.byteLength(raw) > 4096) return error(ws, 'TOO_LARGE', 'message exceeds 4 KB');
  let msg;
  try { msg = JSON.parse(raw.toString('utf8')); }
  catch { return error(ws, 'BAD_FORMAT', 'invalid JSON'); }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return error(ws, 'BAD_FORMAT', 'JSON object required');
  if (typeof msg.type !== 'string') return error(ws, 'BAD_FORMAT', 'type is required');
  if (!['join', 'leave', 'message'].includes(msg.type)) return error(ws, 'UNKNOWN_TYPE', 'unknown message type');
  if (typeof msg.room !== 'string' || !allowedRooms.has(msg.room)) return error(ws, 'BAD_FORMAT', 'unknown or missing room');
  if (msg.type === 'join') {
    if (!can(ws.user, 'join', msg.room)) return error(ws, 'FORBIDDEN', 'not allowed to join this room');
    if (!rooms.has(msg.room)) rooms.set(msg.room, new Set());
    rooms.get(msg.room).add(ws);
    ws.joined.add(msg.room);
    return send(ws, { type: 'joined', room: msg.room });
  }
  if (msg.type === 'leave') {
    leave(ws, msg.room);
    return send(ws, { type: 'left', room: msg.room });
  }
  // Exercise 4: check permission on every message, not only at join.
  if (!can(ws.user, 'send', msg.room)) return error(ws, 'FORBIDDEN', 'not allowed to send in this room');
  if (!ws.joined.has(msg.room)) return error(ws, 'NOT_IN_ROOM', 'join room before sending');
  if (typeof msg.text !== 'string') return error(ws, 'BAD_FORMAT', 'text must be a string');
  if (msg.text.length > 500) return error(ws, 'TEXT_TOO_LONG', 'text exceeds 500 characters');
  const messageId = `msg_${nextMessageId++}`;
  const outgoing = {
    type: 'message', id: messageId, room: msg.room, from: ws.user.sub,
    text: msg.text, ts: new Date().toISOString()
  };
  history.push({
    id: messageId, room: msg.room,
    from: ws.user.sub, role: ws.user.role, text: msg.text
  });
  for (const client of rooms.get(msg.room) || []) send(client, outgoing);
}

// Exercise 3: retain Origin and JWT checks for WebSocket upgrades.

server.on('upgrade', (req, socket, head) => {
  let url;

  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }

  if (url.pathname !== '/ws') {
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
    return;
  }

  // Exercise 3: Origin validation
  if (req.headers.origin !== 'http://localhost:8080') {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }

  // Exercise 3: JWT validation before WebSocket upgrade
  let user;

  try {
    const token = url.searchParams.get('token');
    user = verifyToken(token);
  } catch (err) {
    console.error(
      `${new Date().toISOString()} WebSocket authentication rejected: ${err.name}`
    );

    socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return;
  }

  // Upgrade only after successful authentication
  wss.handleUpgrade(req, socket, head, ws => {
    ws.user = user;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', socket => {
  socket.clientId = socket.user.sub;
  socket.joined = new Set();
  socket.isAlive = true;
  console.log(`${new Date().toISOString()} connected: ${socket.clientId}`);
  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('message', raw => handleMessage(socket, raw));
  socket.on('error', err => console.error(`${new Date().toISOString()} socket error: ${err.message}`));
  socket.on('close', code => {
    for (const room of [...socket.joined]) leave(socket, room);
    console.log(`${new Date().toISOString()} disconnected: ${socket.clientId} code=${code}`);
  });
});
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      console.log(`${new Date().toISOString()} heartbeat terminate: ${ws.clientId}`);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
server.listen(3000, '0.0.0.0', () => {
  console.log('ChatLab Exercise 4 running on internal port 3000');
});
