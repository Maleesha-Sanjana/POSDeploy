import type { FastifyInstance } from 'fastify';
import { getDb, toPublicPos } from '../db/index.js';
import { getPosCredentials, requirePosCredentials } from '../services/settings.service.js';
import { testSqlConnection } from '../services/mssql.service.js';
import type { PosMachine } from '../types.js';

export async function posRoutes(app: FastifyInstance) {
  app.get('/api/pos', async () => {
    const rows = getDb().prepare('SELECT * FROM pos_machines ORDER BY name').all();
    return rows.map((row) => toPublicPos(row as Record<string, unknown>));
  });

  app.get('/api/pos/can-add', async () => {
    const creds = getPosCredentials();
    const ready = Boolean(creds?.database_name && creds?.username && creds?.password);
    return { ready };
  });

  app.get<{ Params: { id: string } }>('/api/pos/:id', async (req, reply) => {
    const row = getDb().prepare('SELECT * FROM pos_machines WHERE id = ?').get(Number(req.params.id));
    if (!row) return reply.status(404).send({ error: 'POS machine not found' });
    return toPublicPos(row as Record<string, unknown>);
  });

  app.post<{ Body: { device_name?: string; name?: string } }>('/api/pos', async (req, reply) => {
    const deviceName = (req.body.device_name ?? req.body.name ?? '').trim();

    if (!deviceName) {
      return reply.status(400).send({ error: 'Device Name is required' });
    }

    let sqlConfig;
    try {
      sqlConfig = requirePosCredentials();
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'SQL config missing' });
    }

    // Insert with is_active = 0 first, then test connection to decide
    try {
      const result = getDb()
        .prepare(`
          INSERT INTO pos_machines (name, host, database_name, username, password, is_active)
          VALUES (?, ?, ?, ?, ?, 0)
        `)
        .run(
          deviceName,
          deviceName,
          sqlConfig.database_name,
          sqlConfig.username,
          sqlConfig.password
        );

      const posId = Number(result.lastInsertRowid);
      const pos = getDb().prepare('SELECT * FROM pos_machines WHERE id = ?').get(posId) as PosMachine;

      // Auto-test the connection
      const testResult = await testSqlConnection(pos);
      const isActive = testResult.success ? 1 : 0;

      getDb()
        .prepare('UPDATE pos_machines SET is_active = ? WHERE id = ?')
        .run(isActive, posId);

      const row = getDb().prepare('SELECT * FROM pos_machines WHERE id = ?').get(posId);
      const publicPos = toPublicPos(row as Record<string, unknown>);

      return reply.status(201).send({
        ...publicPos,
        connection_test: testResult,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        return reply.status(409).send({ error: `POS machine "${deviceName}" already exists` });
      }
      throw err;
    }
  });

  app.put<{
    Params: { id: string };
    Body: { device_name?: string; name?: string; is_active?: boolean };
  }>('/api/pos/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const existing = getDb().prepare('SELECT * FROM pos_machines WHERE id = ?').get(id) as PosMachine | undefined;

    if (!existing) return reply.status(404).send({ error: 'POS machine not found' });

    const deviceName = (req.body.device_name ?? req.body.name ?? existing.name).trim();
    if (!deviceName) {
      return reply.status(400).send({ error: 'Device Name is required' });
    }

    let sqlConfig;
    try {
      sqlConfig = requirePosCredentials();
    } catch {
      sqlConfig = {
        database_name: existing.database_name,
        username: existing.username,
        password: existing.password,
        updated_at: null,
      };
    }

    getDb()
      .prepare(`
        UPDATE pos_machines
        SET name = ?, host = ?, database_name = ?, username = ?, password = ?
        WHERE id = ?
      `)
      .run(
        deviceName,
        deviceName,
        sqlConfig.database_name,
        sqlConfig.username,
        sqlConfig.password || existing.password,
        id
      );

    // Re-test connection after edit
    const pos = getDb().prepare('SELECT * FROM pos_machines WHERE id = ?').get(id) as PosMachine;
    const testResult = await testSqlConnection(pos);
    const isActive = testResult.success ? 1 : 0;

    getDb()
      .prepare('UPDATE pos_machines SET is_active = ? WHERE id = ?')
      .run(isActive, id);

    const row = getDb().prepare('SELECT * FROM pos_machines WHERE id = ?').get(id);
    return toPublicPos(row as Record<string, unknown>);
  });

  app.delete<{ Params: { id: string } }>('/api/pos/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const result = getDb().prepare('DELETE FROM pos_machines WHERE id = ?').run(id);
    if (result.changes === 0) return reply.status(404).send({ error: 'POS machine not found' });
    return { success: true };
  });

  app.post<{ Params: { id: string } }>('/api/pos/:id/test', async (req, reply) => {
    const pos = getDb().prepare('SELECT * FROM pos_machines WHERE id = ?').get(Number(req.params.id)) as
      | PosMachine
      | undefined;

    if (!pos) return reply.status(404).send({ error: 'POS machine not found' });

    const result = await testSqlConnection(pos);

    // Update is_active based on test result
    getDb()
      .prepare('UPDATE pos_machines SET is_active = ? WHERE id = ?')
      .run(result.success ? 1 : 0, pos.id);

    return result;
  });
}
