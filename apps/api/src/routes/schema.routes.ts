import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { deploySqlText } from '../services/deploy.service.js';
import {
  generateAddColumnSql,
  generateCreateTableSql,
  validateAddColumnInput,
  validateCreateTableInput,
} from '../services/sql-generator.service.js';
import type {
  AddColumnInput,
  ColumnDefinition,
  CreateTableInput,
  SchemaColumn,
  SchemaTable,
} from '../types.js';

function mapColumnRow(row: SchemaColumn): ColumnDefinition {
  return {
    name: row.column_name,
    data_type: row.data_type,
    length: row.length,
    precision: row.precision,
    scale: row.scale,
    nullable: Boolean(row.nullable),
    default_value: row.default_value,
    is_primary_key: Boolean(row.is_primary_key),
    is_identity: Boolean(row.is_identity),
  };
}

function insertColumn(
  tableName: string,
  schemaTableId: number | null,
  col: ColumnDefinition
): number {
  const result = getDb()
    .prepare(`
      INSERT INTO schema_columns (
        schema_table_id, table_name, column_name, data_type,
        length, precision, scale, nullable, default_value,
        is_primary_key, is_identity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      schemaTableId,
      tableName,
      col.name.trim(),
      col.data_type.toUpperCase(),
      col.length ?? null,
      col.precision ?? null,
      col.scale ?? null,
      col.nullable === false ? 0 : 1,
      col.default_value ?? null,
      col.is_primary_key ? 1 : 0,
      col.is_identity ? 1 : 0
    );

  return Number(result.lastInsertRowid);
}

export async function schemaRoutes(app: FastifyInstance) {
  app.get('/api/schema/tables', async () => {
    const tables = getDb()
      .prepare('SELECT * FROM schema_tables ORDER BY table_name')
      .all() as SchemaTable[];

    return tables.map((table) => {
      const columns = getDb()
        .prepare('SELECT * FROM schema_columns WHERE schema_table_id = ? ORDER BY id')
        .all(table.id) as SchemaColumn[];
      return { ...table, columns };
    });
  });

  app.get('/api/schema/columns', async () => {
    return getDb()
      .prepare('SELECT * FROM schema_columns ORDER BY table_name, id')
      .all();
  });

  app.post<{ Body: CreateTableInput }>('/api/schema/tables', async (req, reply) => {
    const body = req.body;
    const deploy = body.deploy !== false;

    try {
      validateCreateTableInput(body);
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Invalid input' });
    }

    if (deploy && (!body.pos_ids || (body.pos_ids !== 'all' && body.pos_ids.length === 0))) {
      return reply.status(400).send({ error: 'Select at least one POS machine to deploy' });
    }

    const tableName = body.table_name.trim();
    const sql = generateCreateTableSql(tableName, body.columns);

    try {
      const result = getDb()
        .prepare('INSERT INTO schema_tables (table_name, description) VALUES (?, ?)')
        .run(tableName, body.description?.trim() ?? '');

      const schemaTableId = Number(result.lastInsertRowid);

      for (const col of body.columns) {
        insertColumn(tableName, schemaTableId, col);
      }

      const table = getDb().prepare('SELECT * FROM schema_tables WHERE id = ?').get(schemaTableId) as SchemaTable;
      const columns = getDb()
        .prepare('SELECT * FROM schema_columns WHERE schema_table_id = ? ORDER BY id')
        .all(schemaTableId) as SchemaColumn[];

      if (!deploy) {
        return reply.status(201).send({ table: { ...table, columns }, sql, jobId: null });
      }

      const concurrency = Number(process.env.DEPLOY_CONCURRENCY ?? 3);
      const { jobId, scriptId } = deploySqlText({
        name: `create_table_${tableName}`,
        description: `Create table ${tableName}`,
        sql_text: sql,
        pos_ids: body.pos_ids,
        concurrency,
      });

      return reply.status(202).send({
        table: { ...table, columns },
        sql,
        jobId,
        scriptId,
        message: `Creating table ${tableName} on selected POS machines`,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        return reply.status(409).send({ error: `Table "${tableName}" already exists in Schema Builder` });
      }
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Failed to create table' });
    }
  });

  app.post<{ Body: AddColumnInput }>('/api/schema/columns', async (req, reply) => {
    const body = req.body;
    const deploy = body.deploy !== false;

    try {
      validateAddColumnInput(body);
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Invalid input' });
    }

    if (deploy && (!body.pos_ids || (body.pos_ids !== 'all' && body.pos_ids.length === 0))) {
      return reply.status(400).send({ error: 'Select at least one POS machine to deploy' });
    }

    const tableName = body.table_name.trim();
    const sql = generateAddColumnSql(tableName, body.column);

    let schemaTableId = body.schema_table_id ?? null;
    if (!schemaTableId) {
      const existing = getDb()
        .prepare('SELECT id FROM schema_tables WHERE table_name = ?')
        .get(tableName) as { id: number } | undefined;
      schemaTableId = existing?.id ?? null;
    }

    try {
      const columnId = insertColumn(tableName, schemaTableId, body.column);
      const column = getDb().prepare('SELECT * FROM schema_columns WHERE id = ?').get(columnId);

      if (!deploy) {
        return reply.status(201).send({ column, sql, jobId: null });
      }

      const concurrency = Number(process.env.DEPLOY_CONCURRENCY ?? 3);
      const { jobId, scriptId } = deploySqlText({
        name: `add_column_${tableName}_${body.column.name}`,
        description: `Add column ${body.column.name} to ${tableName}`,
        sql_text: sql,
        pos_ids: body.pos_ids,
        concurrency,
      });

      return reply.status(202).send({
        column,
        sql,
        jobId,
        scriptId,
        message: `Adding column ${body.column.name} to ${tableName} on selected POS machines`,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        return reply.status(409).send({
          error: `Column "${body.column.name}" already tracked for table "${tableName}"`,
        });
      }
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Failed to add column' });
    }
  });

  app.post<{
    Body: { table_name: string; columns: ColumnDefinition[]; pos_ids: number[] | 'all' };
  }>('/api/schema/preview', async (req, reply) => {
    const { table_name, columns } = req.body;

    try {
      if (!table_name?.trim()) {
        return reply.status(400).send({ error: 'table_name is required' });
      }

      if (!columns?.length) {
        return reply.status(400).send({ error: 'columns are required' });
      }

      // If first request looks like create table (multiple cols), show create; else add columns
      const sql = generateCreateTableSql(table_name, columns);
      return { sql };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Preview failed' });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/schema/tables/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const result = getDb().prepare('DELETE FROM schema_tables WHERE id = ?').run(id);
    if (result.changes === 0) return reply.status(404).send({ error: 'Schema table not found' });
    return { success: true };
  });

  app.get('/api/schema/datatypes', async () => {
    return [
      { value: 'INT', label: 'INT', needsLength: false },
      { value: 'BIGINT', label: 'BIGINT', needsLength: false },
      { value: 'SMALLINT', label: 'SMALLINT', needsLength: false },
      { value: 'TINYINT', label: 'TINYINT', needsLength: false },
      { value: 'BIT', label: 'BIT (True/False)', needsLength: false },
      { value: 'VARCHAR', label: 'VARCHAR', needsLength: true },
      { value: 'NVARCHAR', label: 'NVARCHAR', needsLength: true },
      { value: 'CHAR', label: 'CHAR', needsLength: true },
      { value: 'NCHAR', label: 'NCHAR', needsLength: true },
      { value: 'DECIMAL', label: 'DECIMAL', needsPrecision: true },
      { value: 'MONEY', label: 'MONEY', needsLength: false },
      { value: 'FLOAT', label: 'FLOAT', needsLength: false },
      { value: 'DATE', label: 'DATE', needsLength: false },
      { value: 'DATETIME', label: 'DATETIME', needsLength: false },
      { value: 'DATETIME2', label: 'DATETIME2', needsLength: false },
      { value: 'UNIQUEIDENTIFIER', label: 'UNIQUEIDENTIFIER', needsLength: false },
      { value: 'TEXT', label: 'TEXT (NVARCHAR MAX)', needsLength: false },
    ];
  });
}
