import fsPromises from 'node:fs/promises';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import type { Pool } from 'mysql2/promise';
import { AdminService } from './admin-service.js';
import { registerAdminRoutes } from './admin-routes.js';
import { AuthService } from './auth-service.js';
import { registerAuthRoutes } from './auth-routes.js';
import { config } from './config.js';
import { registerGroupDecisionApplicationRoutes } from './group-decision-application-routes-20260722-153405.js';
import { GroupDecisionApplicationService } from './group-decision-application-service-20260722.js';
import { registerIntentionRoutes } from './intention-routes.js';
import { IntentionService } from './intention-service.js';
import { AppError } from './types.js';

export async function buildApp(pool: Pool) {
  const app = Fastify({ logger: true });
  const auth = new AuthService(pool);
  const service = new IntentionService(pool, auth);
  const admin = new AdminService(pool, auth);
  const groupDecisionService = new GroupDecisionApplicationService(pool, auth);

  await app.register(cors, {
    origin: config.webOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    credentials: true
  });
  await app.register(cookie);
  await app.register(multipart, {
    limits: { files: 10, fileSize: 20 * 1024 * 1024 }
  });
  await fsPromises.mkdir(config.uploadDir, { recursive: true });

  app.setErrorHandler((error, _request, reply) => {
    const known = error instanceof AppError;
    const statusCode = known ? error.statusCode : 500;
    reply.status(statusCode).send({
      success: false,
      data: null,
      code: known ? error.code : 'INTERNAL_ERROR',
      message: known ? error.message : '服务器处理失败'
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      success: false,
      data: null,
      code: 'NOT_FOUND',
      message: '请求的接口不存在'
    });
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    return payload;
  });

  app.get('/api/v1/health', async () => ({ success: true, data: { status: 'ok' } }));
  await registerAuthRoutes(app, auth);
  await registerAdminRoutes(app, auth, admin);
  await registerIntentionRoutes(app, pool, auth, service);
  await registerGroupDecisionApplicationRoutes(app, auth, groupDecisionService);

  app.addHook('onClose', async () => pool.end());
  return app;
}
