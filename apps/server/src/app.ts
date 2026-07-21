import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { config } from './config.js';
import { IntentionService } from './intention-service.js';
import { AppError, type Actor, type IntentionInput, type UserRole } from './types.js';

function actorFrom(request: FastifyRequest): Actor {
  const role = String(request.headers['x-user-role'] ?? 'initiator') as UserRole;
  if (!['initiator', 'department_head', 'division_leader'].includes(role)) {
    throw new AppError('用户角色无效', 400, 'INVALID_ROLE');
  }
  return {
    id: String(request.headers['x-user-id'] ?? 'user-admin'),
    name: decodeURIComponent(String(request.headers['x-user-name'] ?? '综合管理员')),
    role
  };
}

export async function buildApp(pool: Pool) {
  const app = Fastify({ logger: true });
  const service = new IntentionService(pool);

  await app.register(cors, {
    origin: config.webOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-User-Id', 'X-User-Name', 'X-User-Role']
  });
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

  app.get('/api/v1/health', async () => ({ success: true, data: { status: 'ok' } }));

  app.get('/api/v1/investment-intentions', async () => ({ success: true, data: await service.list() }));

  app.get<{ Params: { id: string } }>('/api/v1/investment-intentions/:id', async request => ({
    success: true,
    data: await service.get(request.params.id)
  }));

  app.post<{ Body: IntentionInput }>('/api/v1/investment-intentions', async (request, reply) => {
    const data = await service.create(request.body ?? {}, actorFrom(request));
    return reply.status(201).send({ success: true, data });
  });

  app.put<{ Params: { id: string }; Body: IntentionInput }>(
    '/api/v1/investment-intentions/:id',
    async request => ({
      success: true,
      data: await service.update(request.params.id, request.body ?? {}, actorFrom(request))
    })
  );

  app.post<{ Params: { id: string } }>('/api/v1/investment-intentions/:id/submit', async request => ({
    success: true,
    data: await service.submit(request.params.id, actorFrom(request))
  }));

  app.post<{ Params: { id: string }; Body: { comment?: string | null } }>(
    '/api/v1/investment-intentions/:id/approve',
    async request => ({
      success: true,
      data: await service.approve(request.params.id, actorFrom(request), request.body?.comment ?? null)
    })
  );

  app.post<{ Params: { id: string }; Body: { comment?: string | null } }>(
    '/api/v1/investment-intentions/:id/return',
    async request => ({
      success: true,
      data: await service.returnToInitiator(
        request.params.id,
        actorFrom(request),
        request.body?.comment ?? null
      )
    })
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/investment-intentions/:id/attachments',
    async (request, reply) => {
      await service.get(request.params.id);
      const uploaded = [];
      for await (const part of request.files()) {
        const id = randomUUID();
        const extension = path.extname(part.filename);
        const storedName = `${id}${extension}`;
        const relativePath = path.join('investment-intention', request.params.id, storedName);
        const absolutePath = path.join(config.uploadDir, relativePath);
        await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true });
        await pipeline(part.file, fs.createWriteStream(absolutePath));
        const stat = await fsPromises.stat(absolutePath);
        await pool.execute(
          `INSERT INTO tz_business_attachment (
            id, business_type, business_id, attachment_category,
            original_name, stored_name, mime_type, file_size, relative_path, uploaded_by
          ) VALUES (?, 'INVESTMENT_INTENTION', ?, 'RESEARCH_REPORT', ?, ?, ?, ?, ?, ?)`,
          [
            id, request.params.id, part.filename, storedName,
            part.mimetype, stat.size, relativePath, actorFrom(request).id
          ]
        );
        uploaded.push({ id, originalName: part.filename, fileSize: stat.size });
      }
      return reply.status(201).send({ success: true, data: uploaded });
    }
  );

  app.get<{ Params: { id: string } }>('/api/v1/attachments/:id/download', async (request, reply) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM tz_business_attachment WHERE id = ?',
      [request.params.id]
    );
    const file = rows[0];
    if (!file) throw new AppError('附件不存在', 404, 'NOT_FOUND');
    const absolutePath = path.join(config.uploadDir, file.relative_path);
    reply.header('content-type', file.mime_type ?? 'application/octet-stream');
    reply.header(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`
    );
    return reply.send(fs.createReadStream(absolutePath));
  });

  app.addHook('onClose', async () => pool.end());
  return app;
}
