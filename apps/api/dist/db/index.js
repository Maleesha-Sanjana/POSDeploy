import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let db;
export function getDb() {
    if (!db) {
        throw new Error('Database not initialized');
    }
    return db;
}
export function initDb(dbPath) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(`
    CREATE TABLE IF NOT EXISTS pos_machines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      host TEXT NOT NULL,
      database_name TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      sql_text TEXT NOT NULL,
      script_type TEXT NOT NULL DEFAULT 'data' CHECK(script_type IN ('schema', 'data')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deploy_jobs (
      id TEXT PRIMARY KEY,
      script_id INTEGER NOT NULL REFERENCES scripts(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      triggered_by TEXT NOT NULL DEFAULT 'admin',
      pos_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS deploy_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES deploy_jobs(id) ON DELETE CASCADE,
      pos_id INTEGER NOT NULL REFERENCES pos_machines(id),
      success INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS schema_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schema_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schema_table_id INTEGER REFERENCES schema_tables(id) ON DELETE CASCADE,
      table_name TEXT NOT NULL,
      column_name TEXT NOT NULL,
      data_type TEXT NOT NULL,
      length INTEGER,
      precision INTEGER,
      scale INTEGER,
      nullable INTEGER NOT NULL DEFAULT 1,
      default_value TEXT,
      is_primary_key INTEGER NOT NULL DEFAULT 0,
      is_identity INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(table_name, column_name)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
    seedDefaultScript(db);
    return db;
}
function seedDefaultScript(db) {
    const existing = db.prepare('SELECT id FROM scripts WHERE name = ?').get('gen_usergroup_levels');
    if (existing)
        return;
    const sql = `-- Insert gen_usergroup level records (safe to re-run)
IF NOT EXISTS (SELECT 1 FROM dbo.gen_usergroup WHERE col3 = 1 AND col9 = 179)
BEGIN
    INSERT INTO dbo.gen_usergroup (col1, col2, col3, col4, col5, col6, col7, col8, col9)
    VALUES
    ('33', 'P', 1, 'Level 1', '015', 0.00, 0.00, 1, 179),
    ('33', 'P', 2, 'Level 2', '015', 0.00, 0.00, 1, 180),
    ('33', 'P', 3, 'Level 3', '015', 0.00, 0.00, 1, 181);
END`;
    db.prepare(`
    INSERT INTO scripts (name, description, sql_text, script_type)
    VALUES (?, ?, ?, ?)
  `).run('gen_usergroup_levels', 'Add Level 1/2/3 records to gen_usergroup table', sql, 'data');
}
export function toPublicPos(row) {
    const { password, ...rest } = row;
    return {
        ...rest,
        has_password: Boolean(password),
    };
}
