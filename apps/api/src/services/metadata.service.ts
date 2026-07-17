import { getDb } from '../db/index.js';
import { getTableSchema, listDatabases, listTables } from './mssql.service.js';
import { isPosPasswordConfigured } from './settings.service.js';
import type { PosMachine } from '../types.js';

function getPosMachine(posId?: number): PosMachine {
  if (!isPosPasswordConfigured()) {
    throw new Error('POS password is not set. Go to POS Password Setting first.');
  }

  if (posId) {
    const pos = getDb()
      .prepare('SELECT * FROM pos_machines WHERE id = ?')
      .get(posId) as PosMachine | undefined;
    if (!pos) throw new Error('POS machine not found');
    return pos;
  }

  const pos = getDb()
    .prepare('SELECT * FROM pos_machines ORDER BY name LIMIT 1')
    .get() as PosMachine | undefined;

  if (!pos) {
    throw new Error('No POS machine found. Add a POS machine first.');
  }

  return pos;
}

export async function fetchDatabasesFromPos(posId?: number) {
  const pos = getPosMachine(posId);
  const databases = await listDatabases(pos);
  return { pos_id: pos.id, pos_name: pos.name, databases };
}

export async function fetchTablesFromPos(database: string, posId?: number) {
  const pos = getPosMachine(posId);
  const tables = await listTables(pos, database);
  return { pos_id: pos.id, pos_name: pos.name, database, tables };
}

export async function fetchTableSchemaFromPos(
  database: string,
  tableName: string,
  posId?: number
) {
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
