require('dotenv').config();

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set to connect to PostgreSQL.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      display_name TEXT NOT NULL DEFAULT '',
      message_color TEXT NOT NULL DEFAULT '#2B2B2B',
      time_precision TEXT NOT NULL DEFAULT 'minute',
      bio TEXT NOT NULL DEFAULT '',
      show_last_seen BOOLEAN NOT NULL DEFAULT TRUE,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      recovery_hash TEXT
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS message_color TEXT NOT NULL DEFAULT '#2B2B2B';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS time_precision TEXT NOT NULL DEFAULT 'minute';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS show_last_seen BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_hash TEXT;
    UPDATE users
    SET username = LOWER(username),
      display_name = COALESCE(NULLIF(display_name, ''), LOWER(username)),
      time_precision = CASE
        WHEN time_precision IN ('minute', 'second') THEN time_precision
        ELSE 'minute'
      END;

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at DOUBLE PRECISION NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pending_signups (
      ticket_hash TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      recovery_hash TEXT NOT NULL,
      challenge_json JSONB NOT NULL,
      expires_at DOUBLE PRECISION NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      user_low INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_high INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (user_low < user_high),
      UNIQUE (user_low, user_high)
    );
    CREATE TABLE IF NOT EXISTS hidden_conversations (
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (conversation_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS conversation_reads (
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read_message_id INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (conversation_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS private_messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reply_to_id INTEGER REFERENCES private_messages(id) ON DELETE SET NULL,
      forwarded_from_id INTEGER REFERENCES private_messages(id) ON DELETE SET NULL,
      forwarded_from_name TEXT NOT NULL DEFAULT ''
    );
    ALTER TABLE private_messages
      ADD COLUMN IF NOT EXISTS reply_to_id INTEGER
      REFERENCES private_messages(id) ON DELETE SET NULL;
    ALTER TABLE private_messages
      ADD COLUMN IF NOT EXISTS forwarded_from_id INTEGER
      REFERENCES private_messages(id) ON DELETE SET NULL;
    ALTER TABLE private_messages
      ADD COLUMN IF NOT EXISTS forwarded_from_name TEXT NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS hidden_messages (
      message_id INTEGER NOT NULL REFERENCES private_messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (message_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS private_messages_conversation_id_id
      ON private_messages (conversation_id, id);
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subscription_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS push_subscriptions_user_id
      ON push_subscriptions (user_id);
  `);
}

module.exports = { pool, initializeDatabase };
