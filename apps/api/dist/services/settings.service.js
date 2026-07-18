import { getDb } from '../db/index.js';
const SETTINGS_KEY = 'pos_credentials';
export const DEFAULT_DATABASE_NAME = 'POS_SOLUTION';
/** Read credentials saved from the UI only (not .env). */
export function getSavedPosCredentials() {
    const row = getDb()
        .prepare('SELECT value FROM app_settings WHERE key = ?')
        .get(SETTINGS_KEY);
    if (!row)
        return null;
    const parsed = JSON.parse(row.value);
    return parsed;
}
/** True only when user saved a password via POS Password Setting. */
export function isPosPasswordConfigured() {
    const creds = getSavedPosCredentials();
    return Boolean(creds?.password?.trim());
}
export function getPosCredentialsPublic() {
    const creds = getSavedPosCredentials();
    return {
        database_name: creds?.database_name || DEFAULT_DATABASE_NAME,
        username: creds?.username || 'sa',
        has_password: isPosPasswordConfigured(),
        updated_at: creds?.updated_at ?? null,
    };
}
export function savePosCredentials(input) {
    const database_name = input.database_name.trim() || DEFAULT_DATABASE_NAME;
    const username = input.username.trim() || 'sa';
    const password = input.password;
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
    getDb()
        .prepare(`
      UPDATE pos_machines
      SET database_name = ?, username = ?, password = ?
    `)
        .run(database_name, username, password);
    return getPosCredentialsPublic();
}
export function requirePosCredentials() {
    if (!isPosPasswordConfigured()) {
        throw new Error('POS password is not set. Go to POS Password Setting and save the password first.');
    }
    const creds = getSavedPosCredentials();
    return creds;
}
