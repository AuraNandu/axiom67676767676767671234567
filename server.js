const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Simple health check for Fly.io
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

// In-memory store (resets when server restarts)
const users = {};          // username -> { password, socketId }
const friends = {};        // username -> Set of friend usernames
const messages = {};       // "user1::user2" -> array of {from, text, time}

function chatKey(a, b) {
  return [a, b].sort().join('::');
}

function hash(pw) {
  return Buffer.from(pw).toString('base64').slice(0, 32);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('register', ({ username, password }, cb) => {
    username = (username || '').trim();
    if (!username || username.length < 3) return cb({ ok: false, error: 'Username too short' });
    if (!password || password.length < 4) return cb({ ok: false, error: 'Password too short' });
    if (users[username]) return cb({ ok: false, error: 'Username taken' });

    users[username] = { password: hash(password), socketId: null };
    friends[username] = new Set();
    cb({ ok: true });
  });

  socket.on('login', ({ username, password }, cb) => {
    username = (username || '').trim();
    const u = users[username];
    if (!u || u.password !== hash(password)) {
      return cb({ ok: false, error: 'Invalid username or password' });
    }
    // Kick previous session if any
    if (u.socketId && u.socketId !== socket.id) {
      io.to(u.socketId).emit('kicked');
    }
    u.socketId = socket.id;
    socket.username = username;
    socket.join(username);

    const friendList = Array.from(friends[username] || []);
    cb({ ok: true, username, friends: friendList });

    // Notify friends this user is online
    friendList.forEach(f => {
      if (users[f]?.socketId) {
        io.to(users[f].socketId).emit('friend-online', username);
      }
    });
  });

  socket.on('add-friend', (friendName, cb) => {
    const me = socket.username;
    if (!me) return cb({ ok: false, error: 'Not logged in' });
    friendName = (friendName || '').trim();
    if (!users[friendName]) return cb({ ok: false, error: 'User not found' });
    if (friendName === me) return cb({ ok: false, error: 'Cannot add yourself' });
    if (friends[me].has(friendName)) return cb({ ok: false, error: 'Already friends' });

    friends[me].add(friendName);
    friends[friendName].add(me);

    cb({ ok: true, friends: Array.from(friends[me]) });

    // Notify the other person if online
    if (users[friendName]?.socketId) {
      io.to(users[friendName].socketId).emit('friend-added', me);
    }
  });

  socket.on('get-messages', (friend, cb) => {
    const me = socket.username;
    if (!me) return;
    const key = chatKey(me, friend);
    cb(messages[key] || []);
  });

  socket.on('send-message', ({ to, text }) => {
    const me = socket.username;
    if (!me || !text || !to) return;
    if (!friends[me]?.has(to)) return;

    const key = chatKey(me, to);
    if (!messages[key]) messages[key] = [];
    const msg = { from: me, text: String(text).slice(0, 500), time: Date.now() };
    messages[key].push(msg);

    // Send to both
    io.to(me).emit('new-message', { with: to, msg });
    if (users[to]?.socketId) {
      io.to(to).emit('new-message', { with: me, msg });
    }
  });

  // ---- WebRTC signaling ----
  socket.on('call-request', ({ to, type }) => {
    const me = socket.username;
    if (!me || !to || !users[to]?.socketId) return;
    io.to(users[to].socketId).emit('incoming-call', { from: me, type });
  });

  socket.on('call-accept', ({ to }) => {
    const me = socket.username;
    if (!me || !to || !users[to]?.socketId) return;
    io.to(users[to].socketId).emit('call-accepted', { from: me });
  });

  socket.on('call-reject', ({ to }) => {
    const me = socket.username;
    if (!me || !to || !users[to]?.socketId) return;
    io.to(users[to].socketId).emit('call-rejected', { from: me });
  });

  socket.on('webrtc-offer', ({ to, offer }) => {
    const me = socket.username;
    if (!me || !to || !users[to]?.socketId) return;
    io.to(users[to].socketId).emit('webrtc-offer', { from: me, offer });
  });

  socket.on('webrtc-answer', ({ to, answer }) => {
    const me = socket.username;
    if (!me || !to || !users[to]?.socketId) return;
    io.to(users[to].socketId).emit('webrtc-answer', { from: me, answer });
  });

  socket.on('webrtc-ice', ({ to, candidate }) => {
    const me = socket.username;
    if (!me || !to || !users[to]?.socketId) return;
    io.to(users[to].socketId).emit('webrtc-ice', { from: me, candidate });
  });

  socket.on('call-end', ({ to }) => {
    const me = socket.username;
    if (!me || !to || !users[to]?.socketId) return;
    io.to(users[to].socketId).emit('call-ended', { from: me });
  });

  socket.on('disconnect', () => {
    const me = socket.username;
    if (me && users[me]) {
      users[me].socketId = null;
      // Notify friends offline
      (friends[me] || []).forEach(f => {
        if (users[f]?.socketId) {
          io.to(users[f].socketId).emit('friend-offline', me);
        }
      });
    }
    console.log('Disconnected:', me || socket.id);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Axiom live server running on port ${PORT}`);
});
