# POSDeploy

Web console to deploy SQL schema and data changes to all POS MSSQL databases at once — from your SERVER, without visiting each POS machine.

## Stack

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS
- **Backend:** Node.js + Fastify + TypeScript
- **Local store:** SQLite (POS list, scripts, deploy logs)
- **Remote DB:** MSSQL via `mssql` package (port 1433)

## Project structure

```
POSDeploy/
├── apps/
│   ├── api/          # Node.js backend (@posdeploy/api)
│   └── web/          # React frontend (@posdeploy/web)
└── package.json      # npm workspaces root
```

## Setup (on your SERVER)

### 1. Install dependencies

```bash
cd POSDeploy
npm install
```

### 2. Configure API

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` if needed:

```
PORT=3001
HOST=0.0.0.0
DB_PATH=./data/posdeploy.db
DEPLOY_CONCURRENCY=3

# Shared SQL login for ALL POS machines (databases are identical)
MSSQL_DATABASE=YourDatabaseName
MSSQL_USER=sa
MSSQL_PASSWORD=YourPassword
```

### 3. Run the webpage

**Option A — one URL (recommended on SERVER):**

```bash
npm run preview
```

Then open in your browser:

**http://localhost:3001**  
(or **http://YOUR-SERVER-IP:3001** from another PC on the network)

This serves both the React webpage and the API on the same port.

**Option B — development mode:**

```bash
npm run dev
```

- **Webpage:** http://localhost:5173 (React + Vite hot reload)
- **API:** http://localhost:3001

### 4. Production (on customer SERVER)

```bash
npm run build
npm start
```

Open **http://SERVER-IP:3001** in Chrome/Edge — that is your POSDeploy webpage.

## Usage workflow

1. **POS Password Setting** — Set shared SQL login: username `sa` (default) and POS password (same on every machine). Also set database name.
2. **POS Machines** — Add each POS by **Device Name** only (`POS1`, `POS2`, …). Use **Test** to verify port 1433 + login.
2. **Schema Builder** — Create custom tables or add columns via the UI (no hand-written SQL required). On submit, POSDeploy generates MSSQL `CREATE TABLE` / `ALTER TABLE` and runs it on selected POS machines using the saved credentials.
3. **Scripts** — Create raw SQL scripts (INSERT, UPDATE, etc.). A sample `gen_usergroup_levels` script is included.
4. **Deploy** — Pick a script, choose all POS or selected ones, click **Deploy Now**. Results show per machine (success/fail).
5. **History** — Review past deploys and errors.

## Example: gen_usergroup insert

The seeded script adds these records (adjust column names to match your table):

| col1 | col2 | col3 | col4    | col5 | col6 | col7 | col8 | col9 |
|------|------|------|---------|------|------|------|------|------|
| 33   | P    | 1    | Level 1 | 015  | 0.00 | 0.00 | 1    | 179  |
| 33   | P    | 2    | Level 2 | 015  | 0.00 | 0.00 | 1    | 180  |
| 33   | P    | 3    | Level 3 | 015  | 0.00 | 0.00 | 1    | 181  |

Edit the script in **Scripts → gen_usergroup_levels → Edit** to match your actual column names.

## Network requirements

- SERVER must reach each POS on **TCP 1433**
- SQL Server on each POS: TCP/IP enabled, SQL Authentication configured
- Firewall on POS: allow inbound 1433 **from SERVER IP only**

## Security notes

- Run POSDeploy only on the SERVER inside the customer network
- Use a dedicated SQL user with minimal permissions (not `sa` if possible)
- POS passwords are stored in local SQLite — restrict file access on the SERVER

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard` | Dashboard stats |
| GET/POST | `/api/pos` | List / add POS machines |
| POST | `/api/pos/:id/test` | Test connection |
| GET/POST | `/api/scripts` | List / create scripts |
| POST | `/api/deploy` | Start deploy job |
| GET | `/api/deploy/:jobId` | Job status + results |
| GET | `/api/deploy` | Deploy history |
