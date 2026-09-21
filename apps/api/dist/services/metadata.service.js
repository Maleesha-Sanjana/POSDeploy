import { getDb } from '../db/index.js';
import { getTableSchema, listDatabases, listTables } from './mssql.service.js';
function getPosMachine(posId) {
    if (posId) {
        const pos = getDb()
            .prepare('SELECT * FROM pos_machines WHERE id = ?')
            .get(posId);
        if (!pos)
            throw new Error('POS machine not found');
        return pos;
    }
    const pos = getDb()
        .prepare('SELECT * FROM pos_machines ORDER BY name LIMIT 1')
        .get();
    if (!pos) {
        throw new Error('No POS machine found. Add a POS machine first.');
    }
    return pos;
}
export async function fetchDatabasesFromPos(posId) {
    const pos = getPosMachine(posId);
    const databases = await listDatabases(pos);
    return { pos_id: pos.id, pos_name: pos.name, databases };
}
export async function fetchTablesFromPos(database, posId) {
    const pos = getPosMachine(posId);
    const tables = await listTables(pos, database);
    return { pos_id: pos.id, pos_name: pos.name, database, tables };
}
export async function fetchTableSchemaFromPos(database, tableName, posId) {
    const pos = getPosMachine(posId);
    const columns = await getTableSchema(pos, database, tableName);
    return {
        pos_id: pos.id,
        pos_name: pos.name,
        database,
        table_name: tableName,
        columns,
    };
}
