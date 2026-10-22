const path = require('path');
const Database = require('better-sqlite3');
const { pool, initializeDatabase } = require('../database');

const sourcePath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'chat.db'));
const sqlite = new Database(sourcePath, { readonly: true });
const tableNames = [
  'users',
  'sessions',
  'pending_signups',
  'conversations',
  'hidden_conversations',
  'private_messages'
];

function hasTable(name) {
  return Boolean(sqlite.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(name));
}

function readRows(table) {
  return hasTable(table) ? sqlite.prepare(`SELECT * FROM ${table}`).all() : [];
}

async function requireEmptyDestination() {
  const counts = await Promise.all(tableNames.map(async (table) => {
    const result = await pool.query(`SELECT COUNT(*)::integer AS count FROM ${table}`);
    return [table, result.rows[0].count];
  }));
  const populated = counts.filter(([, count]) => count > 0);
  if (populated.length > 0) {
    throw new Error(
      `PostgreSQL already contains data (${populated.map(([table, count]) => `${table}: ${count}`).join(', ')}). No rows were changed.`
    );
  }
}

async function insertRows(client, table, columns, rows, valuesForRow = (row) => columns.map((column) => row[column])) {
  if (rows.length === 0) return;
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const statement = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  for (const row of rows) {
    await client.query(statement, valuesForRow(row));
  }
}

async function migrate() {
  await initializeDatabase();
  await requireEmptyDestination();

  const rows = Object.fromEntries(tableNames.map((table) => [table, readRows(table)]));
  const userColumns = hasTable('users')
    ? new Set(sqlite.prepare('PRAGMA table_info(users)').all().map((column) => column.name))
    : new Set();
  const users = rows.users.map((user) => ({
    ...user,
    display_name: userColumns.has('display_name') ? user.display_name : user.username,
    message_color: userColumns.has('message_color') ? user.message_color : '#2B2B2B',
    recovery_hash: userColumns.has('recovery_hash') ? user.recovery_hash : null
  }));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await insertRows(client, 'users', [
      'id', 'username', 'password_hash', 'created_at',
      'display_name', 'message_color', 'recovery_hash'
    ], users, (user) => [
      user.id,
      user.username.toLowerCase(),
      user.password_hash,
      user.created_at,
      user.display_name || user.username,
      user.message_color || '#2B2B2B',
      user.recovery_hash || null
    ]);
    await insertRows(client, 'sessions', [
      'token_hash', 'user_id', 'expires_at'
    ], rows.sessions);
    await insertRows(client, 'pending_signups', [
      'ticket_hash', 'username', 'display_name', 'password_hash',
      'recovery_hash', 'challenge_json', 'expires_at'
    ], rows.pending_signups, (signup) => [
      signup.ticket_hash,
      signup.username.toLowerCase(),
      signup.display_name,
      signup.password_hash,
      signup.recovery_hash,
      JSON.stringify(JSON.parse(signup.challenge_json)),
      signup.expires_at
    ]);
    await insertRows(client, 'conversations', [
      'id', 'user_low', 'user_high', 'created_at'
    ], rows.conversations);
    await insertRows(client, 'hidden_conversations', [
      'conversation_id', 'user_id'
    ], rows.hidden_conversations);
    await insertRows(client, 'private_messages', [
      'id', 'conversation_id', 'sender_id', 'text', 'created_at'
    ], rows.private_messages);

    for (const table of ['users', 'conversations', 'private_messages']) {
      await client.query(`
        SELECT setval(
          pg_get_serial_sequence('${table}', 'id'),
          COALESCE(MAX(id), 1),
          COUNT(*) > 0
        )
        FROM ${table}
      `);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  console.log(`SQLite data migrated from ${sourcePath}:`);
  for (const table of tableNames) {
    console.log(`  ${table}: ${rows[table].length}`);
  }
}

migrate()
  .catch((error) => {
    console.error('SQLite-to-PostgreSQL migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    sqlite.close();
    await pool.end();
  });
