import net from 'net';
import sql from 'mssql';
import type { ConnectionTestResult, PosMachine } from '../types.js';

export async function testTcpConnection(host: string, port = 1433, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
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

export async function testSqlConnection(pos: PosMachine): Promise<ConnectionTestResult> {
  const start = Date.now();

  const tcpOk = await testTcpConnection(pos.host);
  if (!tcpOk) {
    return {
      success: false,
      message: `Cannot reach ${pos.host}:1433 — check network or firewall`,
    };
  }

  try {
    const pool = await sql.connect({
      server: pos.host,
      database: pos.database_name,
      user: pos.username,
      password: pos.password,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 10000,
        requestTimeout: 10000,
      },
    });

    await pool.request().query('SELECT 1 AS ok');
    await pool.close();

    return {
      success: true,
      message: `Connected to ${pos.name} (${pos.host})`,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown connection error';
    return {
      success: false,
      message: `TCP OK but SQL login failed: ${message}`,
      latencyMs: Date.now() - start,
    };
  }
}

export async function executeSql(pos: PosMachine, sqlText: string): Promise<{ rowsAffected: number }> {
  const pool = await sql.connect({
    server: pos.host,
    database: pos.database_name,
    user: pos.username,
    password: pos.password,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 15000,
      requestTimeout: 120000,
    },
  });

  try {
    const result = await pool.request().query(sqlText);
    const rowsAffected = result.rowsAffected.reduce((a: number, b: number) => a + b, 0);
    return { rowsAffected };
  } finally {
    await pool.close();
  }
}
