import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { executeSql } from './mssql.service.js';
import type { DeployJobDetail, DeployRequest, PosMachine } from '../types.js';

const runningJobs = new Map<string, Promise<void>>();

function getPosMachines(ids?: number[]): PosMachine[] {
  const db = getDb();

  if (ids && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    return db
      .prepare(`SELECT * FROM pos_machines WHERE id IN (${placeholders}) AND is_active = 1`)
      .all(...ids) as PosMachine[];
  }

  return db
    .prepare('SELECT * FROM pos_machines WHERE is_active = 1 ORDER BY name')
    .all() as PosMachine[];
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) {
        await fn(item);
      }
    }
  });

  await Promise.all(workers);
}

export function startDeployJob(input: DeployRequest, concurrency = 3): string {
  const db = getDb();

  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(input.script_id) as
    | { id: number; sql_text: string; name: string }
    | undefined;

  if (!script) {
    throw new Error('Script not found');
  }

  const posMachines =
    input.pos_ids === 'all'
      ? getPosMachines()
      : getPosMachines(input.pos_ids);

  if (posMachines.length === 0) {
    throw new Error('No active POS machines selected');
  }

  const jobId = uuidv4();
  const triggeredBy = input.triggered_by ?? 'admin';

  db.prepare(`
    INSERT INTO deploy_jobs (id, script_id, status, triggered_by, pos_count)
    VALUES (?, ?, 'running', ?, ?)
  `).run(jobId, script.id, triggeredBy, posMachines.length);

  const jobPromise = (async () => {
    let hasFailure = false;

    await runWithConcurrency(posMachines, concurrency, async (pos) => {
      const start = Date.now();
      let success = 0;
      let errorMessage: string | null = null;

      try {
        await executeSql(pos, script.sql_text);
        success = 1;
      } catch (err) {
        hasFailure = true;
        errorMessage = err instanceof Error ? err.message : 'Unknown error';
      }

      const durationMs = Date.now() - start;

      getDb()
        .prepare(`
          INSERT INTO deploy_results (job_id, pos_id, success, error_message, duration_ms)
          VALUES (?, ?, ?, ?, ?)
        `)
        .run(jobId, pos.id, success, errorMessage, durationMs);
    });

    getDb()
      .prepare(`
        UPDATE deploy_jobs
        SET status = ?, finished_at = datetime('now')
        WHERE id = ?
      `)
      .run(hasFailure ? 'failed' : 'completed', jobId);
  })();

  runningJobs.set(jobId, jobPromise);
  jobPromise.finally(() => runningJobs.delete(jobId));

  return jobId;
}

/** Save SQL as a script and deploy it to selected POS machines. */
export function deploySqlText(options: {
  name: string;
  description: string;
  sql_text: string;
  pos_ids: number[] | 'all';
  triggered_by?: string;
  concurrency?: number;
}): { jobId: string; scriptId: number } {
  const db = getDb();
  const uniqueName = `${options.name}_${Date.now()}`;

  const result = db
    .prepare(`
      INSERT INTO scripts (name, description, sql_text, script_type)
      VALUES (?, ?, ?, 'schema')
    `)
    .run(uniqueName, options.description, options.sql_text);

  const scriptId = Number(result.lastInsertRowid);
  const jobId = startDeployJob(
    {
      script_id: scriptId,
      pos_ids: options.pos_ids,
      triggered_by: options.triggered_by,
    },
    options.concurrency ?? 3
  );

  return { jobId, scriptId };
}

export async function waitForJob(jobId: string): Promise<void> {
  const promise = runningJobs.get(jobId);
  if (promise) {
    await promise;
  }
}

export function getDeployJob(jobId: string): DeployJobDetail | null {
  const db = getDb();

  const job = db
    .prepare(`
      SELECT j.*, s.name AS script_name
      FROM deploy_jobs j
      JOIN scripts s ON s.id = j.script_id
      WHERE j.id = ?
    `)
    .get(jobId) as DeployJobDetail | undefined;

  if (!job) return null;

  const results = db
    .prepare(`
      SELECT r.*, p.name AS pos_name
      FROM deploy_results r
      JOIN pos_machines p ON p.id = r.pos_id
      WHERE r.job_id = ?
      ORDER BY p.name
    `)
    .all(jobId) as DeployJobDetail['results'];

  return { ...job, results };
}

export function listDeployJobs(limit = 50): DeployJobDetail[] {
  const db = getDb();

  const jobs = db
    .prepare(`
      SELECT j.*, s.name AS script_name
      FROM deploy_jobs j
      JOIN scripts s ON s.id = j.script_id
      ORDER BY j.started_at DESC
      LIMIT ?
    `)
    .all(limit) as DeployJobDetail[];

  return jobs.map((job) => ({
    ...job,
    results: db
      .prepare(`
        SELECT r.*, p.name AS pos_name
        FROM deploy_results r
        JOIN pos_machines p ON p.id = r.pos_id
        WHERE r.job_id = ?
        ORDER BY p.name
      `)
      .all(job.id) as DeployJobDetail['results'],
  }));
}

export function getDashboardStats() {
  const db = getDb();

  const totalPos = (db.prepare('SELECT COUNT(*) AS c FROM pos_machines').get() as { c: number }).c;
  const activePos = (db.prepare('SELECT COUNT(*) AS c FROM pos_machines WHERE is_active = 1').get() as { c: number }).c;
  const totalScripts = (db.prepare('SELECT COUNT(*) AS c FROM scripts').get() as { c: number }).c;
  const totalDeploys = (db.prepare('SELECT COUNT(*) AS c FROM deploy_jobs').get() as { c: number }).c;

  const lastDeploy = db
    .prepare(`
      SELECT j.*, s.name AS script_name
      FROM deploy_jobs j
      JOIN scripts s ON s.id = j.script_id
      ORDER BY j.started_at DESC
      LIMIT 1
    `)
    .get() as DeployJobDetail | undefined;

  return {
    totalPos,
    activePos,
    totalScripts,
    totalDeploys,
    lastDeploy: lastDeploy ?? null,
  };
}
