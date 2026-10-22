# PostgreSQL setup

The server uses PostgreSQL and reads its connection string from `DATABASE_URL`.
Create a hosted PostgreSQL database with your preferred provider, then add its
connection string as a secret environment variable in the app host. Never commit
the connection string or share it in chat.

For a one-time migration from the existing SQLite database, set `DATABASE_URL`
in PowerShell and run the importer from the project root:

```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
npm run migrate:sqlite
```

The importer copies users, sessions, pending signups, conversations, hidden
conversations, and private messages. It refuses to write if any of those tables
in PostgreSQL already contain data. The original `chat.db` is left untouched;
keep it as a backup until the migrated app has been checked.

Configure the same `DATABASE_URL` secret on the server where the app runs.
Starting the app creates or updates its PostgreSQL schema automatically:

```powershell
npm start
```

Do not expose the database connection string to browser code. The app connects
to PostgreSQL only from `server.js`.
