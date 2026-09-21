import { getDb, toPublicPos } from '../db/index.js';
import { testSqlConnection } from '../services/mssql.service.js';
// @ts-ignore
import findLocalDevices from 'local-devices';
export async function posRoutes(app) {
    app.get('/api/pos/discover', async () => {
        try {
            const devices = await findLocalDevices();
            return devices;
        }
        catch (err) {
            return { error: 'Failed to discover devices' };
        }
    });
    app.get('/api/pos', async () => {
        const rows = getDb().prepare('SELECT * FROM pos_machines ORDER BY name').all();
        return rows.map((row) => toPublicPos(row));
    });
    app.get('/api/pos/:id', async (req, reply) => {
        const row = getDb().prepare('SELECT * FROM pos_machines WHERE id = ?').get(Number(req.params.id));
        if (!row)
            return reply.status(404).send({ error: 'POS machine not found' });
        return toPublicPos(row);
    });
    const PASSWORDS_TO_TRY = ['jbs2014', 'Kx1716@2022!', 'msdb123', 'Corei7@2022!', 'Corei5@2021!'];
    app.post('/api/pos', async (req, reply) => {
        const deviceName = (req.body.device_name ?? req.body.name ?? '').trim();
        const explicitPassword = req.body.password?.trim();
        if (!deviceName) {
            return reply.status(400).send({ error: 'Device Name is required' });
        }
        const posToTest = {
            id: 0,
            name: deviceName,
            host: deviceName,
            database_name: 'POS_SOLUTION',
            username: 'sa',
            password: '',
            is_active: 0,
            created_at: new Date().toISOString()
        };
        let workingPassword = null;
        let testResult = null;
        const passwordsToTry = explicitPassword ? [explicitPassword] : PASSWORDS_TO_TRY;
        for (const pwd of passwordsToTry) {
            posToTest.password = pwd;
            const res = await testSqlConnection(posToTest);
            if (res.success) {
                workingPassword = pwd;
                testResult = res;
                break;
            }
            testResult = res;
        }
        if (!workingPassword) {
            return reply.status(401).send({ error: 'Auto-connect failed. Please enter password manually.', testResult });
        }
        try {
            const result = getDb()
                .prepare(`
          INSERT INTO pos_machines (name, host, database_name, username, password, is_active)
          VALUES (?, ?, ?, ?, ?, 1)
        `)
                .run(posToTest.name, posToTest.host, posToTest.database_name, posToTest.username, posToTest.password);
            const posId = Number(result.lastInsertRowid);
            const row = getDb().prepare('SELECT * FROM pos_machines WHERE id = ?').get(posId);
            const publicPos = toPublicPos(row);
            return reply.status(201).send({
                ...publicPos,
                connection_test: testResult,
            });
        }
        catch (err) {
            if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
                return reply.status(409).send({ error: `POS machine "${deviceName}" already exists` });
            }
            throw err;
        }
    });
    app.put('/api/pos/:id', async (req, reply) => {
        const id = Number(req.params.id);
        const existing = getDb().prepare('SELECT * FROM pos_machines WHERE id = ?').get(id);
        if (!existing)
            return reply.status(404).send({ error: 'POS machine not found' });
        const deviceName = (req.body.device_name ?? req.body.name ?? existing.name).trim();
        if (!deviceName) {
            return reply.status(400).send({ error: 'Device Name is required' });
        }
        const explicitPassword = req.body.password?.trim();
        const posToTest = {
            ...existing,
            name: deviceName,
            host: deviceName,
        };
        let workingPassword = null;
        let testResult = null;
        // If they explicitly supplied a password, try only that. 
        // Otherwise if it's just a rename, try the existing password.
        // If we want it to auto-discover on edit too if the existing fails, we could, but let's try existing first.
        const passwordsToTry = explicitPassword ? [explicitPassword] : [existing.password, ...PASSWORDS_TO_TRY.filter(p => p !== existing.password)];
        for (const pwd of passwordsToTry) {
            posToTest.password = pwd;
            const res = await testSqlConnection(posToTest);
            if (res.success) {
                workingPassword = pwd;
                testResult = res;
                break;
            }
            testResult = res;
        }
        if (!workingPassword) {
            return reply.status(401).send({ error: 'Auto-connect failed. Please enter password manually.', testResult });
        }
        getDb()
            .prepare(`
        UPDATE pos_machines
        SET name = ?, host = ?, database_name = ?, username = ?, password = ?, is_active = 1
        WHERE id = ?
      `)
            .run(posToTest.name, posToTest.host, posToTest.database_name, posToTest.username, posToTest.password, id);
        const row = getDb().prepare('SELECT * FROM pos_machines WHERE id = ?').get(id);
        return toPublicPos(row);
    });
    app.delete('/api/pos/:id', async (req, reply) => {
        const id = Number(req.params.id);
        const existing = getDb().prepare('SELECT id FROM pos_machines WHERE id = ?').get(id);
        if (!existing)
            return reply.status(404).send({ error: 'POS machine not found' });
        // Remove related deploy results first (FK constraint)
        getDb().prepare('DELETE FROM deploy_results WHERE pos_id = ?').run(id);
        getDb().prepare('DELETE FROM pos_machines WHERE id = ?').run(id);
        return { success: true };
    });
    app.post('/api/pos/:id/test', async (req, reply) => {
        const pos = getDb().prepare('SELECT * FROM pos_machines WHERE id = ?').get(Number(req.params.id));
        if (!pos)
            return reply.status(404).send({ error: 'POS machine not found' });
        const result = await testSqlConnection(pos);
        // Update is_active based on test result
        getDb()
            .prepare('UPDATE pos_machines SET is_active = ? WHERE id = ?')
            .run(result.success ? 1 : 0, pos.id);
        return result;
    });
}
