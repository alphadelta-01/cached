const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const { promisify } = require('util');
const { pool, initializeDatabase } = require('./database');

const scrypt = promisify(crypto.scrypt);
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;
const PENDING_SIGNUP_DURATION = 15 * 60 * 1000;
const RECOVERY_WORD_COUNT = 24;
const COOKIE_NAME = 'chat_session';
const DEFAULT_MESSAGE_COLOR = '#2B2B2B';

const bip39Promise = Promise.all([
  import('@scure/bip39'),
  import('@scure/bip39/wordlists/english.js')
]).then(([bip39, { wordlist }]) => ({ ...bip39, wordlist }));

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(secret, salt, 64);
  return Buffer.concat([salt, derivedKey]).toString('hex');
}

async function verifySecret(secret, storedHash) {
  const stored = Buffer.from(storedHash, 'hex');
  if (stored.length !== 80) return false;
  const salt = stored.subarray(0, 16);
  const expected = stored.subarray(16);
  const actual = await scrypt(secret, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function normalizeMnemonic(value) {
  return typeof value === 'string'
    ? value.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ')
    : '';
}

function getCookie(request, name) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(cookie.slice(separator + 1).trim());
  }
  return null;
}

async function getUserFromToken(token) {
  if (!token) return null;
  const result = await pool.query(`
    SELECT users.id, users.username, users.display_name, users.message_color
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = $1 AND sessions.expires_at > $2
  `, [hashToken(token), Date.now()]);
  return result.rows[0] || null;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    messageColor: user.message_color
  };
}

function setSessionCookie(response, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DURATION / 1000}${secure}`
  );
}

function clearSessionCookie(response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
  );
}

async function createSession(userId, response) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_DURATION;
  await pool.query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), userId, expiresAt]
  );
  setSessionCookie(response, token);
}

async function requireUser(request, response, next) {
  const user = await getUserFromToken(getCookie(request, COOKIE_NAME));
  if (!user) {
    response.status(401).json({ error: 'Please log in.' });
    return;
  }
  request.user = user;
  next();
}

function validUsername(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_]{3,24}$/.test(value);
}

function validColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function parseConversationId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function isConversationVisibleToUser(conversationId, userId) {
  const result = await pool.query(`
    SELECT 1 FROM conversations c
    LEFT JOIN hidden_conversations hidden
      ON hidden.conversation_id = c.id AND hidden.user_id = $1
    WHERE c.id = $2 AND (c.user_low = $1 OR c.user_high = $1)
      AND hidden.user_id IS NULL
  `, [userId, conversationId]);
  return result.rowCount > 0;
}

function formatMessage(message) {
  return {
    id: message.id,
    text: message.text,
    senderId: message.sender_id,
    senderDisplayName: message.display_name,
    messageColor: message.message_color,
    createdAt: message.created_at
  };
}

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server);

app.get('/api/session', requireUser, (request, response) => {
  response.json({ user: publicUser(request.user) });
});

app.post('/api/register/prepare', async (request, response) => {
  const { username: rawUsername, password, displayName: rawDisplayName } = request.body || {};
  const username = typeof rawUsername === 'string' ? rawUsername.trim().toLowerCase() : '';
  const displayName = typeof rawDisplayName === 'string'
    ? rawDisplayName.trim()
    : username;
  if (
    !validUsername(username) ||
    !displayName ||
    displayName.length > 100 ||
    typeof password !== 'string' ||
    password.length < 8 ||
    password.length > 128
  ) {
    response.status(400).json({
      error: 'Username must be 3–24 characters and can contain letters, numbers, and _. Display name must be 1–100 characters. Password must be 8–128 characters.'
    });
    return;
  }

  const existingUser = await pool.query(
    'SELECT 1 FROM users WHERE username = $1',
    [username]
  );
  if (existingUser.rowCount > 0) {
    response.status(409).json({ error: 'That username is already taken.' });
    return;
  }

  try {
    await pool.query('DELETE FROM pending_signups WHERE expires_at <= $1', [Date.now()]);
    await pool.query('DELETE FROM pending_signups WHERE username = $1', [username]);

    const { generateMnemonic, wordlist } = await bip39Promise;
    const phrase = generateMnemonic(wordlist, 256);
    const words = phrase.split(' ');
    const positions = [];
    while (positions.length < 3) {
      const position = crypto.randomInt(1, RECOVERY_WORD_COUNT + 1);
      if (!positions.includes(position)) positions.push(position);
    }
    positions.sort((left, right) => left - right);
    const challenge = positions.map((position) => ({
      position,
      word: words[position - 1]
    }));
    const ticket = crypto.randomBytes(32).toString('hex');
    const [passwordHash, recoveryHash] = await Promise.all([
      hashSecret(password),
      hashSecret(phrase)
    ]);
    const challengeJson = JSON.stringify(challenge);

    await pool.query(`
      INSERT INTO pending_signups (
        ticket_hash, username, display_name, password_hash, recovery_hash,
        challenge_json, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    `, [
      hashToken(ticket),
      username,
      displayName,
      passwordHash,
      recoveryHash,
      challengeJson,
      Date.now() + PENDING_SIGNUP_DURATION
    ]);
    response.status(201).json({
      ticket,
      phrase,
      challengePositions: positions
    });
  } catch (error) {
    if (error.code === '23505') {
      response.status(409).json({ error: 'That username is already taken.' });
      return;
    }
    throw error;
  }
});

app.post('/api/register/complete', async (request, response) => {
  const { ticket, answers } = request.body || {};
  if (
    typeof ticket !== 'string' ||
    !/^[0-9a-f]{64}$/.test(ticket) ||
    !Array.isArray(answers) ||
    answers.length !== 3
  ) {
    response.status(400).json({ error: 'Registration confirmation is invalid or expired.' });
    return;
  }

  const pendingResult = await pool.query(`
    SELECT username, display_name, password_hash, recovery_hash, challenge_json
    FROM pending_signups WHERE ticket_hash = $1 AND expires_at > $2
  `, [hashToken(ticket), Date.now()]);
  const pending = pendingResult.rows[0];
  if (!pending) {
    response.status(400).json({ error: 'Registration confirmation is invalid or expired. Please start again.' });
    return;
  }

  const challenge = pending.challenge_json;
  const confirmed = challenge.every((item, index) => {
    const answer = answers[index];
    return answer &&
      answer.position === item.position &&
      typeof answer.word === 'string' &&
      answer.word.trim().toLowerCase() === item.word;
  });
  if (!confirmed) {
    response.status(400).json({ error: 'Those words do not match. Check your recovery phrase.' });
    return;
  }

  try {
    const client = await pool.connect();
    let userId;
    try {
      await client.query('BEGIN');
      const result = await client.query(`
        INSERT INTO users (
          username, display_name, message_color, password_hash, recovery_hash
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [
        pending.username,
        pending.display_name,
        DEFAULT_MESSAGE_COLOR,
        pending.password_hash,
        pending.recovery_hash
      ]);
      userId = result.rows[0].id;
      await client.query('DELETE FROM pending_signups WHERE ticket_hash = $1', [hashToken(ticket)]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await createSession(userId, response);
    const userResult = await pool.query(
      'SELECT id, username, display_name, message_color FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];
    response.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === '23505') {
      response.status(409).json({ error: 'That username is already taken.' });
      return;
    }
    throw error;
  }
});

app.post('/api/recover', async (request, response) => {
  const { username: rawUsername, phrase: rawPhrase, password } = request.body || {};
  const username = typeof rawUsername === 'string' ? rawUsername.trim().toLowerCase() : '';
  const phrase = normalizeMnemonic(rawPhrase);
  if (!validUsername(username) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    response.status(400).json({ error: 'Enter a valid username and a new password of 8–128 characters.' });
    return;
  }

  const { validateMnemonic, wordlist } = await bip39Promise;
  if (phrase.split(' ').length !== RECOVERY_WORD_COUNT || !validateMnemonic(phrase, wordlist)) {
    response.status(400).json({ error: 'The username or recovery phrase is incorrect.' });
    return;
  }

  const userResult = await pool.query(`
    SELECT id, username, display_name, message_color, recovery_hash
    FROM users WHERE username = $1
  `, [username]);
  const user = userResult.rows[0];
  if (!user || !user.recovery_hash || !await verifySecret(phrase, user.recovery_hash)) {
    response.status(400).json({ error: 'The username or recovery phrase is incorrect.' });
    return;
  }

  const passwordHash = await hashSecret(password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);
    await client.query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await createSession(user.id, response);
  response.json({ user: publicUser(user) });
});

app.post('/api/login', async (request, response) => {
  const { username: rawUsername, password } = request.body || {};
  if (typeof rawUsername !== 'string' || typeof password !== 'string') {
    response.status(400).json({ error: 'Enter a username and password.' });
    return;
  }

  const userResult = await pool.query(`
    SELECT id, username, display_name, message_color, password_hash
    FROM users WHERE username = $1
  `, [rawUsername.trim().toLowerCase()]);
  const user = userResult.rows[0];
  if (!user) {
    response.status(401).json({ error: 'Incorrect username or password.' });
    return;
  }

  const storedHash = Buffer.from(user.password_hash, 'hex');
  const salt = storedHash.subarray(0, 16);
  const expectedHash = storedHash.subarray(16);
  const actualHash = await scrypt(password, salt, expectedHash.length);
  if (!crypto.timingSafeEqual(actualHash, expectedHash)) {
    response.status(401).json({ error: 'Incorrect username or password.' });
    return;
  }

  await createSession(user.id, response);
  response.json({ user: publicUser(user) });
});

app.post('/api/logout', async (request, response) => {
  const token = getCookie(request, COOKIE_NAME);
  if (token) {
    const tokenHash = hashToken(token);
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    io.in(`session:${tokenHash}`).disconnectSockets(true);
  }
  clearSessionCookie(response);
  response.json({ success: true });
});

app.put('/api/profile', requireUser, async (request, response) => {
  const { username: rawUsername, displayName, messageColor } = request.body || {};
  const username = typeof rawUsername === 'string' ? rawUsername.trim().toLowerCase() : '';
  const normalizedDisplayName = typeof displayName === 'string' ? displayName.trim() : '';
  if (!validUsername(username)) {
    response.status(400).json({
      error: 'Username must be 3–24 characters and can contain letters, numbers, and _.'
    });
    return;
  }
  if (!normalizedDisplayName || normalizedDisplayName.length > 100) {
    response.status(400).json({ error: 'Display name must be 1–100 characters.' });
    return;
  }
  if (!validColor(messageColor)) {
    response.status(400).json({ error: 'Invalid color format. Use #RRGGBB.' });
    return;
  }

  try {
    await pool.query(`
      UPDATE users SET username = $1, display_name = $2, message_color = $3 WHERE id = $4
    `, [username, normalizedDisplayName, messageColor.toUpperCase(), request.user.id]);
    const userResult = await pool.query(`
      SELECT id, username, display_name, message_color FROM users WHERE id = $1
    `, [request.user.id]);
    const user = userResult.rows[0];
    response.json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === '23505') {
      response.status(409).json({ error: 'That username is already taken.' });
      return;
    }
    throw error;
  }
});

app.get('/api/users/search', requireUser, async (request, response) => {
  const query = typeof request.query.q === 'string' ? request.query.q.trim() : '';
  if (!query || query.length > 100) {
    response.status(400).json({ error: 'Search query must be 1–100 characters.' });
    return;
  }

  const parsedId = /^\d+$/.test(query) ? Number(query) : null;
  const numericId = Number.isInteger(parsedId) && parsedId <= 2147483647
    ? parsedId
    : null;
  const usersResult = await pool.query(`
    SELECT id, username, display_name, message_color
    FROM users
    WHERE id != $1
      AND (
        ($2::integer IS NOT NULL AND id = $2)
        OR username ILIKE $3
        OR display_name ILIKE $3
      )
    ORDER BY CASE WHEN username = $4 THEN 0 ELSE 1 END, username
    LIMIT 30
  `, [
    request.user.id,
    numericId,
    `%${query}%`,
    query.toLowerCase()
  ]);
  const users = usersResult.rows;
  response.json({ users: users.map(publicUser) });
});

app.get('/api/conversations', requireUser, async (request, response) => {
  const rowsResult = await pool.query(`
    SELECT
      c.id,
      other.id AS other_id,
      other.username AS other_username,
      other.display_name AS other_display_name,
      other.message_color AS other_message_color,
      last_message.text AS last_text,
      last_message.created_at AS last_created_at,
      last_message.id AS last_message_id,
      last_message.sender_id AS last_sender_id
    FROM conversations c
    LEFT JOIN hidden_conversations hidden
      ON hidden.conversation_id = c.id AND hidden.user_id = $1
    JOIN users other ON other.id = CASE
      WHEN c.user_low = $1 THEN c.user_high ELSE c.user_low
    END
    LEFT JOIN LATERAL (
      SELECT text, created_at, id, sender_id
      FROM private_messages
      WHERE conversation_id = c.id
      ORDER BY id DESC
      LIMIT 1
    ) last_message ON TRUE
    WHERE (c.user_low = $1 OR c.user_high = $1) AND hidden.user_id IS NULL
    ORDER BY COALESCE(last_message.created_at, c.created_at) DESC,
      COALESCE(last_message.id, c.id) DESC
  `, [request.user.id]);
  const rows = rowsResult.rows;

  response.json({
    conversations: rows.map((row) => ({
      id: row.id,
      otherUser: {
        id: row.other_id,
        username: row.other_username,
        displayName: row.other_display_name,
        messageColor: row.other_message_color
      },
      lastMessage: row.last_text === null ? null : {
        text: row.last_text,
        createdAt: row.last_created_at,
        senderId: row.last_sender_id
      }
    }))
  });
});

app.post('/api/conversations', requireUser, async (request, response) => {
  const userId = Number(request.body && request.body.userId);
  if (!Number.isSafeInteger(userId) || userId < 1) {
    response.status(400).json({ error: 'Could not identify the user.' });
    return;
  }
  if (userId === request.user.id) {
    response.status(400).json({ error: 'You cannot start a chat with yourself.' });
    return;
  }

  const otherUser = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
  if (otherUser.rowCount === 0) {
    response.status(404).json({ error: 'User not found.' });
    return;
  }

  const userLow = Math.min(request.user.id, userId);
  const userHigh = Math.max(request.user.id, userId);
  await pool.query(`
    INSERT INTO conversations (user_low, user_high) VALUES ($1, $2)
    ON CONFLICT (user_low, user_high) DO NOTHING
  `, [userLow, userHigh]);
  const conversationResult = await pool.query(`
    SELECT id FROM conversations WHERE user_low = $1 AND user_high = $2
  `, [userLow, userHigh]);
  const conversation = conversationResult.rows[0];
  const restored = await pool.query(`
    DELETE FROM hidden_conversations WHERE conversation_id = $1 AND user_id = $2
  `, [conversation.id, request.user.id]);
  if (restored.rowCount > 0) {
    io.to(`user:${request.user.id}`).emit('conversation:restored', {
      conversationId: conversation.id
    });
  }
  response.json({ conversationId: conversation.id });
});

app.delete('/api/conversations/:id', requireUser, async (request, response) => {
  const conversationId = parseConversationId(request.params.id);
  if (!conversationId) {
    response.status(404).json({ error: 'Chat not found.' });
    return;
  }

  const scope = request.body && request.body.scope;
  if (scope !== 'self' && scope !== 'everyone') {
    response.status(400).json({ error: 'Choose who to delete this chat for.' });
    return;
  }

  const conversationResult = await pool.query(`
    SELECT user_low, user_high FROM conversations WHERE id = $1
  `, [conversationId]);
  const conversation = conversationResult.rows[0];
  if (
    !conversation ||
    (conversation.user_low !== request.user.id && conversation.user_high !== request.user.id)
  ) {
    response.status(404).json({ error: 'Chat not found.' });
    return;
  }

  if (scope === 'self') {
    await pool.query(`
      INSERT INTO hidden_conversations (conversation_id, user_id) VALUES ($1, $2)
      ON CONFLICT (conversation_id, user_id) DO NOTHING
    `, [conversationId, request.user.id]);
    io.in(`user:${request.user.id}`).socketsLeave(`conversation:${conversationId}`);
    io.to(`user:${request.user.id}`).emit('conversation:hidden', { conversationId });
    response.json({ success: true });
    return;
  }

  await pool.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
  const event = { conversationId };
  io.to(`user:${conversation.user_low}`).emit('conversation:deleted', event);
  io.to(`user:${conversation.user_high}`).emit('conversation:deleted', event);
  response.json({ success: true });
});

app.get('/api/conversations/:id/messages', requireUser, async (request, response) => {
  const conversationId = parseConversationId(request.params.id);
  if (!conversationId || !await isConversationVisibleToUser(conversationId, request.user.id)) {
    response.status(404).json({ error: 'Chat not found.' });
    return;
  }

  const messagesResult = await pool.query(`
    SELECT message.id, message.text, message.sender_id, message.created_at,
      users.display_name, users.message_color
    FROM (
      SELECT * FROM private_messages
      WHERE conversation_id = $1
      ORDER BY id DESC LIMIT 200
    ) message
    JOIN users ON users.id = message.sender_id
    ORDER BY message.id
  `, [conversationId]);
  const messages = messagesResult.rows;
  response.json({ messages: messages.map(formatMessage) });
});

app.post('/api/conversations/:id/messages', requireUser, async (request, response) => {
  const conversationId = parseConversationId(request.params.id);
  if (!conversationId || !await isConversationVisibleToUser(conversationId, request.user.id)) {
    response.status(404).json({ error: 'Chat not found.' });
    return;
  }

  const text = typeof request.body.text === 'string' ? request.body.text.trim() : '';
  if (!text || text.length > 4000) {
    response.status(400).json({ error: 'Message must be 1–4,000 characters.' });
    return;
  }

  const insertResult = await pool.query(`
    INSERT INTO private_messages (conversation_id, sender_id, text)
    VALUES ($1, $2, $3)
    RETURNING id
  `, [conversationId, request.user.id, text]);
  const messageResult = await pool.query(`
    SELECT private_messages.id, private_messages.text, private_messages.sender_id,
      private_messages.created_at, users.display_name, users.message_color
    FROM private_messages
    JOIN users ON users.id = private_messages.sender_id
    WHERE private_messages.id = $1
  `, [insertResult.rows[0].id]);
  const message = messageResult.rows[0];
  const formatted = formatMessage(message);
  const restored = await pool.query(`
    DELETE FROM hidden_conversations WHERE conversation_id = $1
  `, [conversationId]);
  if (restored.rowCount > 0) {
    const conversationResult = await pool.query(`
      SELECT user_low, user_high FROM conversations WHERE id = $1
    `, [conversationId]);
    const conversation = conversationResult.rows[0];
    const event = { conversationId };
    io.to(`user:${conversation.user_low}`).emit('conversation:restored', event);
    io.to(`user:${conversation.user_high}`).emit('conversation:restored', event);
  }
  io.to(`conversation:${conversationId}`).emit('conversation:message', {
    conversationId,
    message: formatted
  });
  response.status(201).json({ message: formatted });
});

app.use((error, request, response, next) => {
  console.error(error);
  if (response.headersSent) {
    next(error);
    return;
  }
  response.status(500).json({ error: 'Server error. Please try again.' });
});

io.use((socket, next) => {
  const authenticate = async () => {
    const token = getCookie(socket.request, COOKIE_NAME);
    const user = await getUserFromToken(token);
    if (!user) {
      next(new Error('Please log in.'));
      return;
    }
    socket.data.user = user;
    socket.data.sessionTokenHash = hashToken(token);
    next();
  };
  authenticate().catch(next);
});

io.on('connection', (socket) => {
  socket.join(`session:${socket.data.sessionTokenHash}`);
  socket.join(`user:${socket.data.user.id}`);

  socket.on('conversation:join', (rawId, acknowledge = () => {}) => {
    const conversationId = parseConversationId(rawId);
    if (!conversationId || !isConversationVisibleToUser(conversationId, socket.data.user.id)) {
      acknowledge({ error: 'Chat not found.' });
      return;
    }
    socket.join(`conversation:${conversationId}`);
    acknowledge({ success: true });
  });

  socket.on('conversation:leave', (rawId) => {
    const conversationId = parseConversationId(rawId);
    if (conversationId) socket.leave(`conversation:${conversationId}`);
  });
});

const PORT = process.env.PORT || 3000;
initializeDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch(async (error) => {
    console.error('Could not initialize PostgreSQL:', error);
    await pool.end();
    process.exitCode = 1;
  });
