import type { FastifyInstance } from 'fastify';
import {
  fetchDatabasesFromPos,
  fetchTableSchemaFromPos,
  fetchTablesFromPos,
} from '../services/metadata.service.js';

export async function metadataRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { pos_id?: string } }>('/api/metadata/databases', async (req, reply) => {
    try {
      const posId = req.query.pos_id ? Number(req.query.pos_id) : undefined;
      return await fetchDatabasesFromPos(posId);
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : 'Failed to load databases',
      });
    }
  });

  app.get<{ Querystring: { database: string; pos_id?: string } }>(
    '/api/metadata/tables',
    async (req, reply) => {
      const { database, pos_id } = req.query;
      if (!database?.trim()) {
        return reply.status(400).send({ error: 'database is required' });
      }

      try {
        const posId = pos_id ? Number(pos_id) : undefined;
        return await fetchTablesFromPos(database.trim(), posId);
      } catch (err) {
        return reply.status(400).send({
          error: err instanceof Error ? err.message : 'Failed to load tables',
        });
      }
    }
  );

  app.get<{ Querystring: { database: string; table: string; pos_id?: string } }>(
    '/api/metadata/table-schema',
    async (req, reply) => {
      const { database, table, pos_id } = req.query;
      if (!database?.trim() || !table?.trim()) {
        return reply.status(400).send({ error: 'database and table are required' });
      }

      try {
        const posId = pos_id ? Number(pos_id) : undefined;
        return await fetchTableSchemaFromPos(database.trim(), table.trim(), posId);
      } catch (err) {
        return reply.status(400).send({
          error: err instanceof Error ? err.message : 'Failed to load table schema',
        });
      }
    }
  );
}
