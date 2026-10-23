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

The schema stores online-presence timestamps and each user's last-seen privacy
setting; existing databases are migrated automatically at startup.

Do not expose the database connection string to browser code. The app connects
to PostgreSQL only from `server.js`.

## Push notifications

The app uses the Web Push protocol. Generate a VAPID key pair once:

```powershell
npx web-push generate-vapid-keys
```

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` as environment
variables on the server. Keep the private key secret; do not put it in browser
code or commit it. For local development, copy `.env.example` to `.env` and
put the generated values there. `.env` is ignored by Git.

The app must be served over HTTPS for remote devices (localhost is allowed for
development). Sign in on each device and enable Message notifications in
Settings. On iPhone, add the site to the Home Screen and open the installed app
before enabling notifications. Notification previews contain the sender name
and message text.
