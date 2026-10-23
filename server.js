const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const crypto = require('crypto');
const { promisify } = require('util');
const multer = require('multer');
const webPush = require('web-push');
const { pool, initializeDatabase } = require('./database');

const scrypt = promisify(crypto.scrypt);
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;
const PENDING_SIGNUP_DURATION = 15 * 60 * 1000;
const RECOVERY_WORD_COUNT = 24;
const COOKIE_NAME = 'chat_session';
const DEFAULT_MESSAGE_COLOR = '#2B2B2B';
const TENOR_API_KEY = process.env.TENOR_API_KEY;
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE, files: 1 }
});
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com'
];
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const pushEnabled = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (Boolean(VAPID_PUBLIC_KEY) !== Boolean(VAPID_PRIVATE_KEY)) {
  throw new Error('Configure both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable push notifications.');
}
if (pushEnabled) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:notifications@cached.local',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

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
    SELECT users.id, users.username, users.display_name, users.message_color,
      users.time_precision, users.bio, users.show_last_seen, users.last_seen_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = $1 AND sessions.expires_at > $2
  `, [hashToken(token), Date.now()]);
  return result.rows[0] || null;
}

function publicUser(user, includePrivacySettings = false) {
  const result = {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    messageColor: user.message_color,
    timePrecision: user.time_precision || user.timePrecision || 'minute',
    bio: user.bio || ''
  };
  if (includePrivacySettings) result.showLastSeen = user.show_last_seen !== false;
  return result;
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

async function getConversationPeerIds(userId) {
  const result = await pool.query(`
    SELECT CASE WHEN user_low = $1 THEN user_high ELSE user_low END AS peer_id
    FROM conversations
    WHERE user_low = $1 OR user_high = $1
  `, [userId]);
  return result.rows.map((row) => row.peer_id);
}

function emitPresenceToPeers(peerIds, event) {
  for (const peerId of peerIds) {
    io.to(`user:${peerId}`).emit('presence:update', event);
  }
}

async function publishLastSeen(userId) {
  try {
    const result = await pool.query(`
      UPDATE users SET last_seen_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING last_seen_at, show_last_seen
    `, [userId]);
    if (activeUserSockets.has(userId)) return;
    const user = result.rows[0];
    if (!user) return;
    const peerIds = await getConversationPeerIds(userId);
    if (activeUserSockets.has(userId)) return;
    emitPresenceToPeers(peerIds, {
      userId,
      online: false,
      lastSeenAt: user.show_last_seen ? user.last_seen_at : null
    });
  } catch (error) {
    console.error('Could not update user last-seen time:', error);
  }
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

async function markConversationRead(conversationId, userId) {
  await pool.query(`
    INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id)
    SELECT $1, $2, COALESCE(MAX(id), 0)
    FROM private_messages
    WHERE conversation_id = $1
    ON CONFLICT (conversation_id, user_id) DO UPDATE
    SET last_read_message_id = GREATEST(
      conversation_reads.last_read_message_id,
      EXCLUDED.last_read_message_id
    )
  `, [conversationId, userId]);
}

function formatMessage(message) {
  return {
    id: message.id,
    text: message.text,
    attachments: message.attachments || [],
    senderId: message.sender_id,
    senderDisplayName: message.display_name,
    messageColor: message.message_color,
    createdAt: message.created_at,
    forwardedFrom: message.forwarded_from_name || null,
    replyTo: message.reply_to_id
      ? {
        id: message.reply_to_id,
        text: message.reply_to_text,
        senderId: message.reply_to_sender_id,
        senderDisplayName: message.reply_to_display_name
      }
      : null
  };
}

function getUploadedMediaType(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  const header = file.buffer.subarray(0, 16);
  const signatures = {
    '.png': header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    '.jpg': header.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    '.jpeg': header.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    '.gif': ['GIF87a', 'GIF89a'].includes(header.subarray(0, 6).toString()),
    '.webp': header.subarray(0, 4).toString() === 'RIFF'
      && header.subarray(8, 12).toString() === 'WEBP',
    '.avif': header.subarray(4, 8).toString() === 'ftyp'
      && ['avif', 'avis'].includes(header.subarray(8, 12).toString()),
    '.bmp': header.subarray(0, 2).toString() === 'BM',
    '.mp4': header.subarray(4, 8).toString() === 'ftyp',
    '.m4v': header.subarray(4, 8).toString() === 'ftyp',
    '.mov': header.subarray(4, 8).toString() === 'ftyp'
      && header.subarray(8, 10).toString() === 'qt',
    '.webm': header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
    '.ogv': header.subarray(0, 4).toString() === 'OggS',
    '.ogg': header.subarray(0, 4).toString() === 'OggS'
  };
  if (!signatures[extension]) return null;
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp'].includes(extension)) {
    return extension === '.jpg' || extension === '.jpeg'
      ? 'image/jpeg'
      : `image/${extension.slice(1)}`;
  }
  if (extension === '.webm') return 'video/webm';
  if (extension === '.ogv' || extension === '.ogg') return 'video/ogg';
  if (extension === '.mov') return 'video/quicktime';
  return 'video/mp4';
}

function isTrustedTenorGif(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'media.tenor.com'
      && url.pathname.toLowerCase().endsWith('.gif')
      && url.href.length <= 2048;
  } catch {
    return false;
  }
}

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server);
const activeUserSockets = new Map();

app.get('/api/push/config', requireUser, (request, response) => {
  if (!pushEnabled) {
    response.status(503).json({ error: 'Push notifications are not configured on the server.' });
    return;
  }
  response.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.get('/api/tenor/search', requireUser, async (request, response) => {
  if (!TENOR_API_KEY) {
    response.status(503).json({ error: 'Tenor GIF search is not configured on the server.' });
    return;
  }
  const query = typeof request.query.q === 'string' ? request.query.q.trim() : '';
  if (!query || query.length > 80) {
    response.status(400).json({ error: 'GIF search must be 1–80 characters.' });
    return;
  }

  const params = new URLSearchParams({
    key: TENOR_API_KEY,
    client_key: 'cached',
    q: query,
    limit: '20',
    media_filter: 'gif,tinygif'
  });
  let result;
  try {
    const tenorResponse = await fetch(
      `https://tenor.googleapis.com/v2/search?${params}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!tenorResponse.ok) {
      console.error(`Tenor GIF search failed with status ${tenorResponse.status}.`);
      response.status(502).json({ error: 'Tenor GIF search is temporarily unavailable.' });
      return;
    }
    result = await tenorResponse.json();
  } catch (error) {
    console.error('Could not search Tenor GIFs:', error);
    response.status(502).json({ error: 'Could not connect to Tenor. Try again shortly.' });
    return;
  }

  const gifs = (Array.isArray(result.results) ? result.results : [])
    .map((item) => {
      const url = item.media_formats?.gif?.url;
      const preview = item.media_formats?.tinygif?.url || url;
      if (!isTrustedTenorGif(url) || !isTrustedTenorGif(preview)) return null;
      return {
        id: String(item.id),
        title: typeof item.content_description === 'string'
          ? item.content_description.slice(0, 120)
          : 'GIF',
        url,
        preview
      };
    })
    .filter(Boolean);
  response.json({ gifs });
});

app.post(
  '/api/conversations/:id/attachments',
  requireUser,
  attachmentUpload.single('file'),
  async (request, response) => {
    const conversationId = parseConversationId(request.params.id);
    if (!conversationId || !await isConversationVisibleToUser(conversationId, request.user.id)) {
      response.status(404).json({ error: 'Chat not found.' });
      return;
    }
    const file = request.file;
    const mimeType = file && getUploadedMediaType(file);
    if (!file || !mimeType) {
      response.status(400).json({
        error: 'Choose a supported image or video file with a matching file extension.'
      });
      return;
    }

    await pool.query(`
      DELETE FROM message_attachments
      WHERE message_id IS NULL AND created_at < CURRENT_TIMESTAMP - INTERVAL '1 day'
    `);
    const id = crypto.randomUUID();
    const fileName = path.basename(file.originalname).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180);
    const inserted = await pool.query(`
      INSERT INTO message_attachments (
        id, conversation_id, uploader_id, file_name, mime_type, byte_size, data
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, file_name, mime_type, byte_size
    `, [id, conversationId, request.user.id, fileName || 'attachment', mimeType, file.size, file.buffer]);
    const attachment = inserted.rows[0];
    response.status(201).json({
      attachment: {
        id: attachment.id,
        name: attachment.file_name,
        mimeType: attachment.mime_type,
        size: attachment.byte_size,
        url: `/api/attachments/${attachment.id}`
      }
    });
  }
);

app.delete(
  '/api/conversations/:id/attachments/:attachmentId',
  requireUser,
  async (request, response) => {
    const conversationId = parseConversationId(request.params.id);
    const attachmentId = request.params.attachmentId;
    if (
      !conversationId
      || !/^[0-9a-f-]{36}$/i.test(attachmentId)
      || !await isConversationVisibleToUser(conversationId, request.user.id)
    ) {
      response.status(404).json({ error: 'Attachment not found.' });
      return;
    }
    const result = await pool.query(`
      DELETE FROM message_attachments
      WHERE id = $1 AND conversation_id = $2
        AND uploader_id = $3 AND message_id IS NULL
    `, [attachmentId, conversationId, request.user.id]);
    if (result.rowCount === 0) {
      response.status(404).json({ error: 'Attachment not found.' });
      return;
    }
    response.json({ success: true });
  }
);

app.get('/api/attachments/:id', requireUser, async (request, response) => {
  const attachmentId = request.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(attachmentId)) {
    response.status(404).json({ error: 'Attachment not found.' });
    return;
  }
  const result = await pool.query(`
    SELECT attachment.file_name, attachment.mime_type, attachment.data
    FROM message_attachments attachment
    JOIN conversations conversation
      ON conversation.id = attachment.conversation_id
    LEFT JOIN hidden_conversations hidden_conversation
      ON hidden_conversation.conversation_id = conversation.id
      AND hidden_conversation.user_id = $2
    LEFT JOIN hidden_messages hidden_message
      ON hidden_message.message_id = attachment.message_id
      AND hidden_message.user_id = $2
    WHERE attachment.id = $1
      AND (conversation.user_low = $2 OR conversation.user_high = $2)
      AND hidden_conversation.user_id IS NULL
      AND (
        (attachment.message_id IS NULL AND attachment.uploader_id = $2)
        OR (attachment.message_id IS NOT NULL AND hidden_message.message_id IS NULL)
      )
  `, [attachmentId, request.user.id]);
  const attachment = result.rows[0];
  if (!attachment) {
    response.status(404).json({ error: 'Attachment not found.' });
    return;
  }
  response.set({
    'Content-Type': attachment.mime_type,
    'Content-Length': String(attachment.data.length),
    'Content-Disposition': `inline; filename="${attachment.file_name.replace(/["\\]/g, '_')}"`,
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff'
  });
  response.send(attachment.data);
});

app.put('/api/push/subscriptions', requireUser, async (request, response) => {
  if (!pushEnabled) {
    response.status(503).json({ error: 'Push notifications are not configured on the server.' });
    return;
  }

  const subscription = request.body;
  let endpoint;
  try {
    endpoint = new URL(subscription && subscription.endpoint);
  } catch {
    response.status(400).json({ error: 'The push subscription is invalid.' });
    return;
  }
  if (
    endpoint.protocol !== 'https:' ||
    (endpoint.port && endpoint.port !== '443') ||
    endpoint.href.length > 2048 ||
    !PUSH_SERVICE_HOSTS.some((host) => (
      endpoint.hostname === host || endpoint.hostname.endsWith(`.${host}`)
    )) ||
    !subscription.keys ||
    typeof subscription.keys.p256dh !== 'string' ||
    typeof subscription.keys.auth !== 'string'
  ) {
    response.status(400).json({ error: 'The push subscription is invalid.' });
    return;
  }

  await pool.query(`
    INSERT INTO push_subscriptions (endpoint, user_id, subscription_json)
    VALUES ($1, $2, $3::jsonb)
    ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        subscription_json = EXCLUDED.subscription_json,
        created_at = CURRENT_TIMESTAMP
  `, [endpoint.href, request.user.id, JSON.stringify(subscription)]);
  response.status(201).json({ success: true });
});

app.delete('/api/push/subscriptions', requireUser, async (request, response) => {
  const endpoint = request.body && request.body.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length > 2048) {
    response.status(400).json({ error: 'The push subscription is invalid.' });
    return;
  }

  await pool.query(
    'DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2',
    [endpoint, request.user.id]
  );
  response.json({ success: true });
});

async function sendPushNotifications(userId, payload) {
  if (!pushEnabled) return;

  const result = await pool.query(
    'SELECT endpoint, subscription_json FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );
  await Promise.all(result.rows.map(async ({ endpoint, subscription_json: subscription }) => {
    try {
      await webPush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 });
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await pool.query(
          'DELETE FROM push_subscriptions WHERE endpoint = $1',
          [endpoint]
        );
        return;
      }
      console.error('Could not send push notification:', error);
    }
  }));
}

app.get('/api/session', requireUser, (request, response) => {
  response.json({ user: publicUser(request.user, true) });
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
      `SELECT id, username, display_name, message_color, time_precision, bio,
        show_last_seen, last_seen_at FROM users WHERE id = $1`,
      [userId]
    );
    const user = userResult.rows[0];
    response.status(201).json({ user: publicUser(user, true) });
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
    SELECT id, username, display_name, message_color, time_precision, bio,
      show_last_seen, last_seen_at, recovery_hash
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
  response.json({ user: publicUser(user, true) });
});

app.post('/api/login', async (request, response) => {
  const { username: rawUsername, password } = request.body || {};
  if (typeof rawUsername !== 'string' || typeof password !== 'string') {
    response.status(400).json({ error: 'Enter a username and password.' });
    return;
  }

  const userResult = await pool.query(`
    SELECT id, username, display_name, message_color, time_precision, bio,
      show_last_seen, last_seen_at, password_hash
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
  response.json({ user: publicUser(user, true) });
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
  const {
    username: rawUsername,
    displayName,
    messageColor,
    timePrecision,
    bio: rawBio,
    showLastSeen: requestedShowLastSeen
  } = request.body || {};
  const username = typeof rawUsername === 'string' ? rawUsername.trim().toLowerCase() : '';
  const normalizedDisplayName = typeof displayName === 'string' ? displayName.trim() : '';
  const bio = typeof rawBio === 'string' ? rawBio.trim() : '';
  const normalizedTimePrecision = timePrecision === 'second' ? 'second' : 'minute';
  const showLastSeen = typeof requestedShowLastSeen === 'boolean'
    ? requestedShowLastSeen
    : request.user.show_last_seen !== false;
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
  if (bio.length > 500) {
    response.status(400).json({ error: 'Profile description must be 500 characters or fewer.' });
    return;
  }
  if (!validColor(messageColor)) {
    response.status(400).json({ error: 'Invalid color format. Use #RRGGBB.' });
    return;
  }

  try {
    await pool.query(`
      UPDATE users
      SET username = $1, display_name = $2, message_color = $3,
        time_precision = $5, bio = $6, show_last_seen = $7
      WHERE id = $4
    `, [
      username,
      normalizedDisplayName,
      messageColor.toUpperCase(),
      request.user.id,
      normalizedTimePrecision,
      bio,
      showLastSeen
    ]);
    const userResult = await pool.query(`
      SELECT id, username, display_name, message_color, time_precision, bio,
        show_last_seen, last_seen_at FROM users WHERE id = $1
    `, [request.user.id]);
    const user = userResult.rows[0];
    const peerIds = await getConversationPeerIds(user.id);
    emitPresenceToPeers(peerIds, {
      userId: user.id,
      online: activeUserSockets.has(user.id),
      lastSeenAt: user.show_last_seen ? user.last_seen_at : null
    });
    response.json({ user: publicUser(user, true) });
  } catch (error) {
    if (error.code === '23505') {
      response.status(409).json({ error: 'That username is already taken.' });
      return;
    }
    throw error;
  }
});

app.get('/api/users/:id/profile', requireUser, async (request, response) => {
  const userId = parseConversationId(request.params.id);
  if (!userId) {
    response.status(404).json({ error: 'Profile not found.' });
    return;
  }
  const result = await pool.query(`
    SELECT id, username, display_name, bio
    FROM users
    WHERE id = $1
  `, [userId]);
  if (result.rowCount === 0) {
    response.status(404).json({ error: 'Profile not found.' });
    return;
  }
  const profile = result.rows[0];
  response.json({
    profile: {
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name,
      bio: profile.bio || ''
    }
  });
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
    SELECT users.id, users.username, users.display_name, users.message_color,
      users.time_precision, users.bio,
      COALESCE(unread.unread_count, 0)::integer AS unread_count
    FROM users
    LEFT JOIN conversations c
      ON c.user_low = LEAST($1, users.id)
      AND c.user_high = GREATEST($1, users.id)
    LEFT JOIN conversation_reads read_state
      ON read_state.conversation_id = c.id AND read_state.user_id = $1
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS unread_count
      FROM private_messages
      LEFT JOIN hidden_messages hidden
        ON hidden.message_id = private_messages.id AND hidden.user_id = $1
      WHERE conversation_id = c.id
        AND sender_id = users.id
        AND id > COALESCE(read_state.last_read_message_id, 0)
        AND hidden.message_id IS NULL
    ) unread ON TRUE
    WHERE users.id != $1
      AND (
        ($2::integer IS NOT NULL AND users.id = $2)
        OR users.username ILIKE $3
        OR users.display_name ILIKE $3
      )
    ORDER BY CASE WHEN users.username = $4 THEN 0 ELSE 1 END, users.username
    LIMIT 30
  `, [
    request.user.id,
    numericId,
    `%${query}%`,
    query.toLowerCase()
  ]);
  const users = usersResult.rows;
  response.json({
    users: users.map((user) => ({
      ...publicUser(user),
      unreadCount: user.unread_count
    }))
  });
});

app.get('/api/conversations', requireUser, async (request, response) => {
  const rowsResult = await pool.query(`
    SELECT
      c.id,
      other.id AS other_id,
      other.username AS other_username,
      other.display_name AS other_display_name,
      other.message_color AS other_message_color,
      other.time_precision AS other_time_precision,
      other.bio AS other_bio,
      CASE WHEN other.show_last_seen THEN other.last_seen_at ELSE NULL END AS other_last_seen_at,
      last_message.text AS last_text,
      last_message.attachments AS last_attachments,
      last_message.created_at AS last_created_at,
      last_message.id AS last_message_id,
      last_message.sender_id AS last_sender_id,
      COALESCE(unread.unread_count, 0)::integer AS unread_count
    FROM conversations c
    LEFT JOIN hidden_conversations hidden
      ON hidden.conversation_id = c.id AND hidden.user_id = $1
    JOIN users other ON other.id = CASE
      WHEN c.user_low = $1 THEN c.user_high ELSE c.user_low
    END
    LEFT JOIN LATERAL (
      SELECT private_messages.text, private_messages.created_at,
        private_messages.id, private_messages.sender_id,
        (
          SELECT COALESCE(json_agg(json_build_object(
            'id', attachment.id,
            'name', attachment.file_name,
            'mimeType', attachment.mime_type,
            'size', attachment.byte_size,
            'url', COALESCE(attachment.external_url, '/api/attachments/' || attachment.id)
          ) ORDER BY attachment.created_at), '[]'::json)
          FROM message_attachments attachment
          WHERE attachment.message_id = private_messages.id
        ) AS attachments
      FROM private_messages
      LEFT JOIN hidden_messages hidden
        ON hidden.message_id = private_messages.id AND hidden.user_id = $1
      WHERE conversation_id = c.id
        AND hidden.message_id IS NULL
      ORDER BY id DESC
      LIMIT 1
    ) last_message ON TRUE
    LEFT JOIN conversation_reads read_state
      ON read_state.conversation_id = c.id AND read_state.user_id = $1
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS unread_count
      FROM private_messages
      LEFT JOIN hidden_messages hidden
        ON hidden.message_id = private_messages.id AND hidden.user_id = $1
      WHERE conversation_id = c.id
        AND sender_id = CASE
          WHEN c.user_low = $1 THEN c.user_high ELSE c.user_low
        END
        AND id > COALESCE(read_state.last_read_message_id, 0)
        AND hidden.message_id IS NULL
    ) unread ON TRUE
    WHERE (c.user_low = $1 OR c.user_high = $1)
      AND hidden.user_id IS NULL
      AND last_message.id IS NOT NULL
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
        messageColor: row.other_message_color,
        timePrecision: row.other_time_precision || 'minute',
        bio: row.other_bio || '',
        lastSeenAt: row.other_last_seen_at,
        online: activeUserSockets.has(row.other_id)
      },
      unreadCount: row.unread_count,
      lastMessage: row.last_text === null ? null : {
        text: row.last_text,
        attachments: row.last_attachments || [],
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

  const otherUser = await pool.query(`
    SELECT id, username, display_name,
      CASE WHEN show_last_seen THEN last_seen_at ELSE NULL END AS last_seen_at
    FROM users WHERE id = $1
  `, [userId]);
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
  if (activeUserSockets.has(userId)) {
    io.to(`user:${request.user.id}`).emit('presence:update', {
      userId,
      online: true
    });
  }
  if (activeUserSockets.has(request.user.id)) {
    io.to(`user:${userId}`).emit('presence:update', {
      userId: request.user.id,
      online: true
    });
  }
  response.json({
    conversationId: conversation.id,
    otherUser: {
      id: otherUser.rows[0].id,
      username: otherUser.rows[0].username,
      displayName: otherUser.rows[0].display_name,
      lastSeenAt: otherUser.rows[0].last_seen_at,
      online: activeUserSockets.has(userId)
    }
  });
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
      users.display_name, users.message_color,
      reply.id AS reply_to_id, reply.text AS reply_to_text,
      reply.sender_id AS reply_to_sender_id,
      reply_user.display_name AS reply_to_display_name,
      media.attachments,
      message.forwarded_from_name
    FROM (
      SELECT * FROM private_messages
      WHERE conversation_id = $1
      ORDER BY id DESC LIMIT 200
    ) message
    JOIN users ON users.id = message.sender_id
    LEFT JOIN hidden_messages reply_hidden
      ON reply_hidden.message_id = message.reply_to_id AND reply_hidden.user_id = $2
    LEFT JOIN private_messages reply
      ON reply.id = message.reply_to_id AND reply_hidden.message_id IS NULL
    LEFT JOIN users reply_user ON reply_user.id = reply.sender_id
    LEFT JOIN hidden_messages hidden
      ON hidden.message_id = message.id AND hidden.user_id = $2
    LEFT JOIN LATERAL (
      SELECT COALESCE(json_agg(json_build_object(
        'id', attachment.id,
        'name', attachment.file_name,
        'mimeType', attachment.mime_type,
        'size', attachment.byte_size,
        'url', COALESCE(attachment.external_url, '/api/attachments/' || attachment.id)
      ) ORDER BY attachment.created_at), '[]'::json) AS attachments
      FROM message_attachments attachment
      WHERE attachment.message_id = message.id
    ) media ON TRUE
    WHERE hidden.message_id IS NULL
    ORDER BY message.id
  `, [conversationId, request.user.id]);
  const messages = messagesResult.rows;
  await markConversationRead(conversationId, request.user.id);
  response.json({ messages: messages.map(formatMessage) });
});

app.post('/api/conversations/:id/read', requireUser, async (request, response) => {
  const conversationId = parseConversationId(request.params.id);
  if (!conversationId || !await isConversationVisibleToUser(conversationId, request.user.id)) {
    response.status(404).json({ error: 'Chat not found.' });
    return;
  }

  await markConversationRead(conversationId, request.user.id);
  response.json({ success: true });
});

app.post('/api/conversations/:id/messages', requireUser, async (request, response) => {
  const conversationId = parseConversationId(request.params.id);
  if (!conversationId || !await isConversationVisibleToUser(conversationId, request.user.id)) {
    response.status(404).json({ error: 'Chat not found.' });
    return;
  }

  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (
    (body.attachmentIds !== undefined && !Array.isArray(body.attachmentIds))
    || (body.tenorGifs !== undefined && !Array.isArray(body.tenorGifs))
  ) {
    response.status(400).json({ error: 'The attachment list is invalid.' });
    return;
  }
  const visibleText = text.startsWith('\u2063')
    ? text.slice(1)
      .replace(/<br>/gi, '\n')
      .replace(/<\/?(?:strong|em|u|s)>/gi, '')
      .replace(/&(?:amp|lt|gt);/g, 'x')
    : text.replace(/\*\*|__|~~|\*/g, '');
  const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds : [];
  const tenorGifs = Array.isArray(body.tenorGifs) ? body.tenorGifs : [];
  if (
    attachmentIds.length + tenorGifs.length > MAX_ATTACHMENTS_PER_MESSAGE
    || attachmentIds.some((id) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))
    || new Set(attachmentIds).size !== attachmentIds.length
  ) {
    response.status(400).json({ error: 'Choose up to five valid attachments per message.' });
    return;
  }
  if (
    (!visibleText.trim() && attachmentIds.length + tenorGifs.length === 0)
    || text.length > 40000
    || visibleText.length > 4000
  ) {
    response.status(400).json({ error: 'Message must be 1–4,000 visible characters.' });
    return;
  }
  if (tenorGifs.some((gif) => !gif || !isTrustedTenorGif(gif.url))) {
    response.status(400).json({ error: 'One of the selected Tenor GIFs is invalid.' });
    return;
  }
  if (tenorGifs.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    response.status(400).json({ error: 'Choose up to five attachments per message.' });
    return;
  }

  const hasReplyTarget = request.body.replyToId !== undefined
    && request.body.replyToId !== null;
  const replyToId = hasReplyTarget ? parseConversationId(request.body.replyToId) : null;
  if (hasReplyTarget && !replyToId) {
    response.status(400).json({ error: 'The message to reply to is invalid.' });
    return;
  }
  if (replyToId) {
    const replyTarget = await pool.query(`
      SELECT 1 FROM private_messages
      WHERE id = $1 AND conversation_id = $2
    `, [replyToId, conversationId]);
    if (replyTarget.rowCount === 0) {
      response.status(400).json({ error: 'The message to reply to was not found in this chat.' });
      return;
    }
  }

  const client = await pool.connect();
  let messageId;
  try {
    await client.query('BEGIN');
    if (attachmentIds.length > 0) {
      const staged = await client.query(`
        SELECT id FROM message_attachments
        WHERE id = ANY($1::text[]) AND conversation_id = $2
          AND uploader_id = $3 AND message_id IS NULL
        FOR UPDATE
      `, [attachmentIds, conversationId, request.user.id]);
      if (staged.rowCount !== attachmentIds.length) {
        throw new Error('One or more uploaded attachments are no longer available.');
      }
    }
    const insertResult = await client.query(`
      INSERT INTO private_messages (conversation_id, sender_id, text, reply_to_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [conversationId, request.user.id, visibleText.trim() ? text : '', replyToId]);
    messageId = insertResult.rows[0].id;
    if (attachmentIds.length > 0) {
      await client.query(`
        UPDATE message_attachments SET message_id = $1
        WHERE id = ANY($2::text[])
      `, [messageId, attachmentIds]);
    }
    for (const gif of tenorGifs) {
      await client.query(`
        INSERT INTO message_attachments (
          id, conversation_id, message_id, uploader_id, file_name,
          mime_type, byte_size, external_url
        )
        VALUES ($1, $2, $3, $4, 'Tenor GIF', 'image/gif', 0, $5)
      `, [crypto.randomUUID(), conversationId, messageId, request.user.id, gif.url]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.message === 'One or more uploaded attachments are no longer available.') {
      response.status(400).json({ error: error.message });
      return;
    }
    throw error;
  } finally {
    client.release();
  }
  const messageResult = await pool.query(`
    SELECT private_messages.id, private_messages.text, private_messages.sender_id,
      private_messages.created_at, users.display_name, users.message_color,
      reply.id AS reply_to_id, reply.text AS reply_to_text,
      reply.sender_id AS reply_to_sender_id,
      reply_user.display_name AS reply_to_display_name,
      media.attachments,
      private_messages.forwarded_from_name
    FROM private_messages
    JOIN users ON users.id = private_messages.sender_id
    LEFT JOIN private_messages reply ON reply.id = private_messages.reply_to_id
    LEFT JOIN users reply_user ON reply_user.id = reply.sender_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(json_agg(json_build_object(
        'id', attachment.id,
        'name', attachment.file_name,
        'mimeType', attachment.mime_type,
        'size', attachment.byte_size,
        'url', COALESCE(attachment.external_url, '/api/attachments/' || attachment.id)
      ) ORDER BY attachment.created_at), '[]'::json) AS attachments
      FROM message_attachments attachment
      WHERE attachment.message_id = private_messages.id
    ) media ON TRUE
    WHERE private_messages.id = $1
  `, [messageId]);
  const message = messageResult.rows[0];
  const formatted = formatMessage(message);
  const conversationResult = await pool.query(`
    SELECT user_low, user_high FROM conversations WHERE id = $1
  `, [conversationId]);
  const conversation = conversationResult.rows[0];
  const restored = await pool.query(`
    DELETE FROM hidden_conversations WHERE conversation_id = $1
  `, [conversationId]);
  if (restored.rowCount > 0) {
    const event = { conversationId };
    io.to(`user:${conversation.user_low}`).emit('conversation:restored', event);
    io.to(`user:${conversation.user_high}`).emit('conversation:restored', event);
  }
  const messageEvent = {
    conversationId,
    message: formatted
  };
  io.to(`user:${conversation.user_low}`)
    .to(`user:${conversation.user_high}`)
    .emit('conversation:message', messageEvent);
  const recipientId = request.user.id === conversation.user_low
    ? conversation.user_high
    : conversation.user_low;
  const preview = Array.from(formatted.text);
  const notificationBody = preview.length > 160
    ? `${preview.slice(0, 157).join('')}…`
    : formatted.text || 'Sent an attachment';
  sendPushNotifications(recipientId, {
    title: `${formatted.senderDisplayName} sent you a message`,
    body: notificationBody,
    conversationId
  }).catch((error) => {
    console.error('Could not load push subscriptions:', error);
  });
  response.status(201).json({ message: formatted });
});

app.delete('/api/conversations/:id/messages/:messageId', requireUser, async (request, response) => {
  const conversationId = parseConversationId(request.params.id);
  const messageId = parseConversationId(request.params.messageId);
  if (
    !conversationId ||
    !messageId ||
    !await isConversationVisibleToUser(conversationId, request.user.id)
  ) {
    response.status(404).json({ error: 'Message not found.' });
    return;
  }

  const scope = request.body && request.body.scope;
  if (scope !== 'self' && scope !== 'everyone') {
    response.status(400).json({ error: 'Choose who to delete the message for.' });
    return;
  }

  const messageResult = await pool.query(`
    SELECT private_messages.sender_id, conversations.user_low, conversations.user_high
    FROM private_messages
    JOIN conversations ON conversations.id = private_messages.conversation_id
    WHERE private_messages.id = $1 AND private_messages.conversation_id = $2
      AND (conversations.user_low = $3 OR conversations.user_high = $3)
  `, [messageId, conversationId, request.user.id]);
  const message = messageResult.rows[0];
  if (!message) {
    response.status(404).json({ error: 'Message not found.' });
    return;
  }

  if (scope === 'everyone') {
    if (message.sender_id !== request.user.id) {
      response.status(403).json({ error: 'You can delete a message for everyone only if you sent it.' });
      return;
    }
    await pool.query(
      'DELETE FROM private_messages WHERE id = $1 AND conversation_id = $2',
      [messageId, conversationId]
    );
    const event = { conversationId, messageId };
    io.to(`user:${message.user_low}`)
      .to(`user:${message.user_high}`)
      .emit('message:deleted', event);
  } else {
    await pool.query(`
      INSERT INTO hidden_messages (message_id, user_id) VALUES ($1, $2)
      ON CONFLICT (message_id, user_id) DO NOTHING
    `, [messageId, request.user.id]);
    io.to(`user:${request.user.id}`).emit('message:hidden', { conversationId, messageId });
  }
  response.json({ success: true });
});

app.post(
  '/api/conversations/:id/messages/:messageId/forward',
  requireUser,
  async (request, response) => {
    const sourceConversationId = parseConversationId(request.params.id);
    const sourceMessageId = parseConversationId(request.params.messageId);
    const targetConversationId = parseConversationId(request.body.destinationConversationId);
    if (
      !sourceConversationId ||
      !sourceMessageId ||
      !targetConversationId ||
      sourceConversationId === targetConversationId ||
      !await isConversationVisibleToUser(sourceConversationId, request.user.id) ||
      !await isConversationVisibleToUser(targetConversationId, request.user.id)
    ) {
      response.status(404).json({ error: 'Choose a different chat to forward this message to.' });
      return;
    }

    const sourceResult = await pool.query(`
      SELECT private_messages.text, users.display_name
      FROM private_messages
      JOIN users ON users.id = private_messages.sender_id
      LEFT JOIN hidden_messages hidden
        ON hidden.message_id = private_messages.id AND hidden.user_id = $3
      WHERE private_messages.id = $1
        AND private_messages.conversation_id = $2
        AND hidden.message_id IS NULL
    `, [sourceMessageId, sourceConversationId, request.user.id]);
    const sourceMessage = sourceResult.rows[0];
    if (!sourceMessage) {
      response.status(404).json({ error: 'Message not found.' });
      return;
    }

    const sourceAttachments = await pool.query(`
      SELECT file_name, mime_type, byte_size, data, external_url
      FROM message_attachments
      WHERE message_id = $1
      ORDER BY created_at, id
    `, [sourceMessageId]);
    const client = await pool.connect();
    let forwardedMessageId;
    try {
      await client.query('BEGIN');
      const insertResult = await client.query(`
        INSERT INTO private_messages (
          conversation_id, sender_id, text, forwarded_from_id, forwarded_from_name
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [
        targetConversationId,
        request.user.id,
        sourceMessage.text,
        sourceMessageId,
        sourceMessage.display_name
      ]);
      forwardedMessageId = insertResult.rows[0].id;
      for (const attachment of sourceAttachments.rows) {
        await client.query(`
          INSERT INTO message_attachments (
            id, conversation_id, message_id, uploader_id, file_name,
            mime_type, byte_size, data, external_url
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          crypto.randomUUID(),
          targetConversationId,
          forwardedMessageId,
          request.user.id,
          attachment.file_name,
          attachment.mime_type,
          attachment.byte_size,
          attachment.data,
          attachment.external_url
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const forwardedResult = await pool.query(`
      SELECT private_messages.id, private_messages.text, private_messages.sender_id,
        private_messages.created_at, users.display_name, users.message_color,
        reply.id AS reply_to_id, reply.text AS reply_to_text,
        reply.sender_id AS reply_to_sender_id,
        reply_user.display_name AS reply_to_display_name,
        private_messages.forwarded_from_name,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', attachment.id,
            'name', attachment.file_name,
            'mimeType', attachment.mime_type,
            'size', attachment.byte_size,
            'url', COALESCE(attachment.external_url, '/api/attachments/' || attachment.id)
          ) ORDER BY attachment.created_at, attachment.id)
          FROM message_attachments attachment
          WHERE attachment.message_id = private_messages.id
        ), '[]'::json) AS attachments
      FROM private_messages
      JOIN users ON users.id = private_messages.sender_id
      LEFT JOIN private_messages reply ON reply.id = private_messages.reply_to_id
      LEFT JOIN users reply_user ON reply_user.id = reply.sender_id
      WHERE private_messages.id = $1
    `, [forwardedMessageId]);
    const formatted = formatMessage(forwardedResult.rows[0]);
    const targetResult = await pool.query(
      'SELECT user_low, user_high FROM conversations WHERE id = $1',
      [targetConversationId]
    );
    const target = targetResult.rows[0];
    const restored = await pool.query(
      'DELETE FROM hidden_conversations WHERE conversation_id = $1',
      [targetConversationId]
    );
    if (restored.rowCount > 0) {
      const restoredEvent = { conversationId: targetConversationId };
      io.to(`user:${target.user_low}`).emit('conversation:restored', restoredEvent);
      io.to(`user:${target.user_high}`).emit('conversation:restored', restoredEvent);
    }
    io.to(`user:${target.user_low}`)
      .to(`user:${target.user_high}`)
      .emit('conversation:message', {
        conversationId: targetConversationId,
        message: formatted
      });
    response.status(201).json({ message: formatted });
  }
);

app.use((error, request, response, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      response.status(413).json({ error: 'Files must be 25 MB or smaller.' });
      return;
    }
    response.status(400).json({ error: 'Choose one supported image or video file.' });
    return;
  }
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
  const userId = socket.data.user.id;
  socket.data.isPresenceActive = false;
  getConversationPeerIds(userId).then((peerIds) => {
    socket.emit(
      'presence:snapshot',
      peerIds.filter((peerId) => activeUserSockets.has(peerId))
    );
  }).catch((error) => {
    console.error('Could not load conversation presence:', error);
  });

  socket.on('presence:active', (isActive) => {
    const active = isActive === true;
    if (socket.data.isPresenceActive === active) return;

    const sockets = activeUserSockets.get(userId) || new Set();
    socket.data.isPresenceActive = active;
    if (active) {
      const wasOffline = sockets.size === 0;
      sockets.add(socket.id);
      activeUserSockets.set(userId, sockets);
      if (wasOffline) {
        getConversationPeerIds(userId).then((peerIds) => {
          if (activeUserSockets.has(userId)) {
            emitPresenceToPeers(peerIds, { userId, online: true });
          }
        }).catch((error) => {
          console.error('Could not publish user online status:', error);
        });
      }
      return;
    }

    sockets.delete(socket.id);
    if (sockets.size > 0) {
      activeUserSockets.set(userId, sockets);
      return;
    }
    activeUserSockets.delete(userId);
    publishLastSeen(userId);
  });

  socket.on('conversation:join', async (rawId, acknowledge = () => {}) => {
    const conversationId = parseConversationId(rawId);
    try {
      if (!conversationId || !(await isConversationVisibleToUser(conversationId, socket.data.user.id))) {
        acknowledge({ error: 'Chat not found.' });
        return;
      }
      socket.join(`conversation:${conversationId}`);
      acknowledge({ success: true });
    } catch (error) {
      console.error('Could not verify conversation access:', error);
      acknowledge({ error: 'Could not join chat.' });
    }
  });

  socket.on('conversation:leave', (rawId) => {
    const conversationId = parseConversationId(rawId);
    if (conversationId) socket.leave(`conversation:${conversationId}`);
  });

  socket.on('disconnect', () => {
    if (!socket.data.isPresenceActive) return;
    const sockets = activeUserSockets.get(userId);
    if (!sockets) return;
    sockets.delete(socket.id);
    if (sockets.size > 0) return;
    activeUserSockets.delete(userId);
    publishLastSeen(userId);
  });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

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
