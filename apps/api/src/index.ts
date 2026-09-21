import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db/index.js';
import { posRoutes } from './routes/pos.routes.js';
import { scriptRoutes } from './routes/scripts.routes.js';
import { deployRoutes } from './routes/deploy.routes.js';
import { schemaRoutes } from './routes/schema.routes.js';
import { instructionsRoutes } from './routes/instructions.routes.js';
import { metadataRoutes } from './routes/metadata.routes.js';
import { debugRoutes } from './routes/debug.routes.js';
import multipart from '@fastify/multipart';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '../data/posdeploy.db');
const WEB_DIST = path.resolve(__dirname, '../../web/dist');

async function main() {
  initDb(DB_PATH);

  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
  });

  await app.register(posRoutes);
  await app.register(scriptRoutes);
  await app.register(deployRoutes);
  await app.register(schemaRoutes);
  await app.register(instructionsRoutes);
  await app.register(metadataRoutes);
  await app.register(debugRoutes);

  await app.register(multipart, {
    limits: {
      fileSize: 1024 * 1024 * 500, // 500MB
    },
  });

  const uploadsDir = path.resolve(__dirname, '../../uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
    decorateReply: false
  });

  app.get('/api/health', async () => ({ status: 'ok', service: 'POSDeploy API' }));

  // Serve React webpage from the same server (production / preview)
  if (fs.existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, {
      root: WEB_DIST,
      prefix: '/',
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html', WEB_DIST);
    });

    console.log(`Serving POSDeploy webpage from ${WEB_DIST}`);
  } else {
    console.log('Web build not found — run "npm run build" to serve the webpage from this server.');
  }

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`POSDeploy running at http://localhost:${PORT}`);
    if (HOST === '0.0.0.0') {
      console.log(`Open from other machines: http://<SERVER-IP>:${PORT}`);
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
