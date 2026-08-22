import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import type { CreateScriptInput } from '../types.js';

export async function scriptRoutes(app: FastifyInstance) {
  app.get('/api/scripts', async () => {
    return getDb().prepare('SELECT * FROM scripts ORDER BY created_at DESC').all();
  });

  app.get<{ Params: { id: string } }>('/api/scripts/:id', async (req, reply) => {
    const script = getDb().prepare('SELECT * FROM scripts WHERE id = ?').get(Number(req.params.id));
    if (!script) return reply.status(404).send({ error: 'Script not found' });
    return script;
  });

  app.post<{ Body: CreateScriptInput }>('/api/scripts', async (req, reply) => {
    const { name, description = '', sql_text, script_type = 'data' } = req.body;

    if (!name?.trim() || !sql_text?.trim()) {
      return reply.status(400).send({ error: 'Name and SQL text are required' });
    }

    if (!['schema', 'data'].includes(script_type)) {
      return reply.status(400).send({ error: 'script_type must be schema or data' });
    }

    try {
      const result = getDb()
        .prepare(`
          INSERT INTO scripts (name, description, sql_text, script_type)
          VALUES (?, ?, ?, ?)
        `)
        .run(name.trim(), description.trim(), sql_text.trim(), script_type);

      const script = getDb().prepare('SELECT * FROM scripts WHERE id = ?').get(result.lastInsertRowid);
      return reply.status(201).send(script);
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        return reply.status(409).send({ error: `Script "${name}" already exists` });
      }
      throw err;
    }
  });

  app.put<{ Params: { id: string }; Body: Partial<CreateScriptInput> }>(
    '/api/scripts/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const existing = getDb().prepare('SELECT * FROM scripts WHERE id = ?').get(id);

      if (!existing) return reply.status(404).send({ error: 'Script not found' });

      const { name, description, sql_text, script_type } = req.body;
      const row = existing as { name: string; description: string; sql_text: string; script_type: string };

      getDb()
        .prepare(`
          UPDATE scripts
          SET name = ?, description = ?, sql_text = ?, script_type = ?
          WHERE id = ?
        `)
        .run(
          name?.trim() ?? row.name,
          description?.trim() ?? row.description,
          sql_text?.trim() ?? row.sql_text,
          script_type ?? row.script_type,
          id
        );

      return getDb().prepare('SELECT * FROM scripts WHERE id = ?').get(id);
    }
  );

  app.delete<{ Params: { id: string } }>('/api/scripts/:id', async (req, reply) => {
    const id = Number(req.params.id);
    try {
      const result = getDb().prepare('DELETE FROM scripts WHERE id = ?').run(id);
      if (result.changes === 0) return reply.status(404).send({ error: 'Script not found' });
      return { success: true };
    } catch (err) {
      if (err instanceof Error && err.message.includes('FOREIGN KEY constraint failed')) {
        return reply.status(400).send({ error: 'Cannot delete script because it has deployment history' });
      }
      throw err;
    }
  });
}
