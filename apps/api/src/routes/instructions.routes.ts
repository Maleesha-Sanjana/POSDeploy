import type { FastifyInstance } from 'fastify';
import { deploySqlText } from '../services/deploy.service.js';
import { parseBossInstructions } from '../services/instruction-parser.service.js';
import { fetchTableSchemaFromPos } from '../services/metadata.service.js';

const DEFAULT_DATABASE_NAME = 'POS_SOLUTION';
async function resolveSchema(tableName: string, database: string, posId?: number) {
  const schema = await fetchTableSchemaFromPos(database, tableName, posId);
  return schema.columns;
}

export async function instructionsRoutes(app: FastifyInstance) {
  app.post<{
    Body: { text: string; table_name: string; database?: string; pos_id?: number };
  }>('/api/instructions/parse', async (req, reply) => {
    const { text, table_name, database, pos_id } = req.body;

    if (!text?.trim()) {
      return reply.status(400).send({ error: 'Paste data rows first' });
    }

    if (!table_name?.trim()) {
      return reply.status(400).send({ error: 'Select a table first' });
    }

    const dbName = database?.trim() || DEFAULT_DATABASE_NAME;

    try {
      let schema_columns;
      try {
        schema_columns = await resolveSchema(table_name.trim(), dbName, pos_id);
      } catch (err) {
        // Soft fail if POS machine isn't connected or valid, just fallback to manual mapping
        console.warn('Failed to load table schema from POS:', err);
      }

      return parseBossInstructions(text, { table_name: table_name.trim(), schema_columns });
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : 'Failed to parse data',
      });
    }
  });

  app.post<{
    Body: {
      text: string;
      table_name: string;
      database?: string;
      pos_id?: number;
      pos_ids: number[] | 'all';
      deploy?: boolean;
    };
  }>('/api/instructions/deploy', async (req, reply) => {
    const { text, table_name, database, pos_id, pos_ids, deploy = true } = req.body;

    if (!text?.trim()) {
      return reply.status(400).send({ error: 'Paste data rows first' });
    }

    if (!table_name?.trim()) {
      return reply.status(400).send({ error: 'Select a table first' });
    }


    if (deploy && (!pos_ids || (pos_ids !== 'all' && pos_ids.length === 0))) {
      return reply.status(400).send({ error: 'Select at least one POS machine' });
    }

    const dbName = database?.trim() || DEFAULT_DATABASE_NAME;

    try {
      const schema_columns = await resolveSchema(table_name.trim(), dbName, pos_id);
      const result = parseBossInstructions(text, {
        table_name: table_name.trim(),
        schema_columns,
      });

      if (!deploy) {
        return reply.status(200).send(result);
      }

      const concurrency = Number(process.env.DEPLOY_CONCURRENCY ?? 3);
      const { jobId, scriptId } = deploySqlText({
        name: `insert_${result.parsed.table_name}`,
        description: result.parsed.description,
        sql_text: result.sql,
        pos_ids,
        concurrency,
      });

      return reply.status(202).send({
        ...result,
        jobId,
        scriptId,
        message: `Deploying ${result.parsed.row_count} row(s) to ${result.parsed.table_name} on selected POS`,
      });
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : 'Deploy failed to start',
      });
    }
  });
}
