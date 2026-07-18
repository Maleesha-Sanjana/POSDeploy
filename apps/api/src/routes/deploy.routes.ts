import type { FastifyInstance } from 'fastify';
import {
  getDashboardStats,
  getDeployJob,
  listDeployJobs,
  startDeployJob,
  waitForJob,
} from '../services/deploy.service.js';
import type { DeployRequest } from '../types.js';

export async function deployRoutes(app: FastifyInstance) {
  app.get('/api/dashboard', async () => {
    return getDashboardStats();
  });

  app.get('/api/deploy', async () => {
    return listDeployJobs();
  });

  app.get<{ Params: { jobId: string } }>('/api/deploy/:jobId', async (req, reply) => {
    const job = getDeployJob(req.params.jobId);
    if (!job) return reply.status(404).send({ error: 'Deploy job not found' });
    return job;
  });

  app.post<{ Body: DeployRequest }>('/api/deploy', async (req, reply) => {
    const { script_id, pos_ids, triggered_by } = req.body;

    if (!script_id) {
      return reply.status(400).send({ error: 'script_id is required' });
    }

    if (!pos_ids || (pos_ids !== 'all' && (!Array.isArray(pos_ids) || pos_ids.length === 0))) {
      return reply.status(400).send({ error: 'pos_ids must be "all" or a non-empty array' });
    }

    try {
      const concurrency = Number(process.env.DEPLOY_CONCURRENCY ?? 3);
      const jobId = startDeployJob({ script_id, pos_ids, triggered_by }, concurrency);
      return reply.status(202).send({ jobId, message: 'Deploy started' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deploy failed to start';
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{ Params: { jobId: string } }>('/api/deploy/:jobId/wait', async (req, reply) => {
    const job = getDeployJob(req.params.jobId);
    if (!job) return reply.status(404).send({ error: 'Deploy job not found' });

    await waitForJob(req.params.jobId);
    return getDeployJob(req.params.jobId);
  });
}
