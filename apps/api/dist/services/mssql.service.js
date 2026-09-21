import net from 'net';
import sql from 'mssql';
function poolConfig(pos, database) {
    return {
        server: pos.host,
        database: database ?? pos.database_name,
        user: pos.username,
        password: pos.password,
        options: {
            encrypt: false,
            trustServerCertificate: true,
            connectTimeout: 15000,
            requestTimeout: 60000,
        },
    };
}
async function withPool(pos, database, fn) {
    const pool = await sql.connect(poolConfig(pos, database));
    try {
        return await fn(pool);
    }
    finally {
        await pool.close();
    }
}
export async function testTcpConnection(host, port = 1433, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            socket.destroy();
            resolve(result);
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
        socket.connect(port, host);
    });
}
export async function testSqlConnection(pos) {
    const start = Date.now();
    const tcpOk = await testTcpConnection(pos.host);
    if (!tcpOk) {
        return {
            success: false,
            message: `Cannot reach ${pos.host}:1433 — check network or firewall`,
        };
    }
    try {
        await withPool(pos, pos.database_name, async (pool) => {
            await pool.request().query('SELECT 1 AS ok');
        });
        return {
            success: true,
            message: `Connected to ${pos.name} (${pos.host})`,
            latencyMs: Date.now() - start,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown connection error';
        return {
            success: false,
            message: `TCP OK but SQL login failed: ${message}`,
            latencyMs: Date.now() - start,
        };
    }
}
export async function listDatabases(pos) {
    return withPool(pos, 'master', async (pool) => {
        const result = await pool.request().query(`
      SELECT name
      FROM sys.databases
      WHERE state_desc = 'ONLINE'
        AND name NOT IN ('tempdb')
      ORDER BY name
    `);
        return result.recordset.map((row) => row.name);
    });
}
export async function listTables(pos, database) {
    return withPool(pos, database, async (pool) => {
        const result = await pool.request().query(`
      SELECT TABLE_NAME AS name
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = 'dbo'
      ORDER BY TABLE_NAME
    `);
        return result.recordset.map((row) => row.name);
    });
}
export async function getTableSchema(pos, database, tableName) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
        throw new Error(`Invalid table name: ${tableName}`);
    }
    return withPool(pos, database, async (pool) => {
        const result = await pool
            .request()
            .input('tableName', sql.NVarChar, tableName)
            .query(`
        SELECT
          c.name AS column_name,
          t.name AS data_type,
          c.max_length,
          c.precision,
          c.scale,
          c.is_nullable,
          c.is_identity,
          CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
          c.column_id AS ordinal_position,
          OBJECT_DEFINITION(c.default_object_id) AS column_default
        FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        INNER JOIN sys.tables tab ON c.object_id = tab.object_id
        INNER JOIN sys.schemas s ON tab.schema_id = s.schema_id
        LEFT JOIN (
          SELECT ic.object_id, ic.column_id
          FROM sys.index_columns ic
          INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
          WHERE i.is_primary_key = 1
        ) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
        WHERE tab.name = @tableName AND s.name = 'dbo'
        ORDER BY c.column_id
      `);
        if (result.recordset.length === 0) {
            throw new Error(`Table "${tableName}" not found in database "${database}"`);
        }
        return result.recordset.map((row) => ({
            column_name: String(row.column_name),
            data_type: String(row.data_type).toLowerCase(),
            max_length: row.max_length != null ? Number(row.max_length) : null,
            precision: row.precision != null ? Number(row.precision) : null,
            scale: row.scale != null ? Number(row.scale) : null,
            is_nullable: Boolean(row.is_nullable),
            is_identity: Boolean(row.is_identity),
            is_primary_key: Boolean(row.is_primary_key),
            column_default: row.column_default != null ? String(row.column_default) : null,
            ordinal_position: Number(row.ordinal_position),
        }));
    });
}
export async function executeSql(pos, sqlText) {
    return withPool(pos, pos.database_name, async (pool) => {
        const result = await pool.request().query(sqlText);
        const rowsAffected = result.rowsAffected.reduce((a, b) => a + b, 0);
        return { rowsAffected };
    });
}
export async function querySql(pos, sqlText) {
    return withPool(pos, pos.database_name, async (pool) => {
        const result = await pool.request().query(sqlText);
        return result.recordset;
    });
}
