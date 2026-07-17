import { getDb } from '../db/index.js';
const SETTINGS_KEY = 'pos_credentials';
export const DEFAULT_DATABASE_NAME = 'POS_SOLUTION';
function envFallback() {
    return {
        database_name: process.env.MSSQL_DATABASE?.trim() || DEFAULT_DATABASE_NAME,
        username: process.env.MSSQL_USER?.trim() || 'sa',
        password: process.env.MSSQL_PASSWORD ?? '',
    };
}
export function getPosCredentials() {
    const row = getDb()
        .prepare('SELECT value FROM app_settings WHERE key = ?')
        .get(SETTINGS_KEY);
    if (!row) {
        const env = envFallback();
        if (env.database_name && env.username) {
            return {
                database_name: env.database_name,
                username: env.username,
                password: env.password ?? '',
                updated_at: null,
            };
        }
        return null;
    }
    const parsed = JSON.parse(row.value);
    return parsed;
}
export function getPosCredentialsPublic() {
    const creds = getPosCredentials();
    if (!creds) {
        const env = envFallback();
        return {
            database_name: env.database_name || DEFAULT_DATABASE_NAME,
            username: env.username || 'sa',
            has_password: Boolean(env.password),
            updated_at: null,
        };
    }
    return {
        database_name: creds.database_name,
        username: creds.username,
        has_password: Boolean(creds.password),
        updated_at: creds.updated_at,
    };
}
export function savePosCredentials(input) {
    const database_name = input.database_name.trim() || DEFAULT_DATABASE_NAME;
    const username = input.username.trim() || 'sa';
    const password = input.password;
    if (!database_name) {
        throw new Error('Database name is required');
    }
    if (!username) {
        throw new Error('Username is required');
    }
    if (!password.trim()) {
        throw new Error('POS password is required');
    }
    const payload = {
        database_name,
        username,
        password,
        updated_at: new Date().toISOString(),
    };
    getDb()
        .prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `)
        .run(SETTINGS_KEY, JSON.stringify(payload));
    // Sync credentials to all registered POS machines
    getDb()
        .prepare(`
      UPDATE pos_machines
      SET database_name = ?, username = ?, password = ?
    `)
        .run(database_name, username, password);
    return getPosCredentialsPublic();
}
export function requirePosCredentials() {
    const creds = getPosCredentials();
    if (!creds?.database_name || !creds?.username) {
        throw new Error('POS SQL credentials are not configured. Set them in POS Password Setting first.');
    }
    if (!creds.password) {
        throw new Error('POS password is not set. Go to POS Password Setting and save the password first.');
    }
    return creds;
}
