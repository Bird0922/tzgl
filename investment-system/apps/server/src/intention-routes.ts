import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { fileTypeStream } from 'file-type';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { AuthService } from './auth-service.js';
import { config } from './config.js';
import { IntentionService } from './intention-service.js';
import { AppError, type IntentionInput } from './types.js';
import { objectBody, optionalId, optionalText, pagination, positiveInteger, requiredId } from './validation.js';

const FILE_TYPES: Record<string, { extensions: string[]; mime: string }> = {
  pdf: { extensions: ['.pdf'], mime: 'application/pdf' },
  docx: { extensions: ['.docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { extensions: ['.xlsx'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pptx: { extensions: ['.pptx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  png: { extensions: ['.png'], mime: 'image/png' },
  jpg: { extensions: ['.jpg', '.jpeg'], mime: 'image/jpeg' }
};

function optionalDate(value: unknown, label: string): string | null {
  const date = optionalText(value, label, 10, /^\d{4}-\d{2}-\d{2}$/);
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new AppError(`${label}格式无效`, 400, 'VALIDATION_ERROR');
  }
  return date;
}

function optionalDecimal(value: unknown, label: string, maxIntegerDigits: number, decimalDigits: number): string | number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw new AppError(`${label}格式无效`, 400, 'VALIDATION_ERROR');
  const text = String(value);
  const pattern = new RegExp(`^-?\\d{1,${maxIntegerDigits}}(?:\\.\\d{1,${decimalDigits}})?$`);
  if (!pattern.test(text)) throw new AppError(`${label}格式无效`, 400, 'VALIDATION_ERROR');
  return text;
}

function parseInput(value: unknown, requireVersion: boolean): IntentionInput {
  const body = objectBody(value);
  const majorProject = body.majorProject;
  if (majorProject !== undefined && majorProject !== null && typeof majorProject !== 'boolean') {
    throw new AppError('重大项目格式无效', 400, 'VALIDATION_ERROR');
  }
  return {
    version: requireVersion ? positiveInteger(body.version, '版本号') : undefined,
    investmentEntityId: optionalId(body.investmentEntityId, '投资主体'),
    applicationDate: optionalDate(body.applicationDate, '申请日期'),
    projectName: optionalText(body.projectName, '项目名称', 300),
    investmentMethod: optionalText(body.investmentMethod, '投资方式', 32, /^[A-Z_]+$/),
    majorProject: majorProject as boolean | null | undefined,
    plannedStartDate: optionalDate(body.plannedStartDate, '计划开始日期'),
    plannedEndDate: optionalDate(body.plannedEndDate, '计划结束日期'),
    projectLeaderUserId: optionalId(body.projectLeaderUserId, '项目负责人'),
    contactPhone: optionalText(body.contactPhone, '联系电话', 50, /^[0-9+() -]+$/),
    projectLocation: optionalText(body.projectLocation, '项目地点', 500),
    projectSummary: optionalText(body.projectSummary, '项目概述', 65_535),
    mainContent: optionalText(body.mainContent, '主要内容', 65_535),
    targetCompanyId: optionalText(body.targetCompanyId, '标的企业ID', 64),
    targetCompanyName: optionalText(body.targetCompanyName, '标的企业名称', 300),
    mainBusiness: optionalText(body.mainBusiness, '主营业务', 1000),
    investmentDirection: optionalText(body.investmentDirection, '投资方向', 64),
    domesticOverseas: optionalText(body.domesticOverseas, '境内外', 32, /^(DOMESTIC|OVERSEAS)$/),
    currencyCode: optionalText(body.currencyCode, '投资币种', 16, /^[A-Z]{3,8}$/),
    exchangeRate: optionalDecimal(body.exchangeRate, '投资汇率', 12, 6),
    plannedShareholdingRatio: optionalDecimal(body.plannedShareholdingRatio, '计划占股比例', 5, 4),
    projectTotalInvestment: optionalDecimal(body.projectTotalInvestment, '项目总投资额', 18, 2),
    plannedInvestment: optionalDecimal(body.plannedInvestment, '计划投资额', 18, 2),
    expectedReturnRate: optionalDecimal(body.expectedReturnRate, '预计收益率', 5, 4)
  };
}

function canReadAll(permissions: string[]): boolean {
  return permissions.includes('investment.intention.read_all');
}

function safeUploadPath(relativePath: string): string {
  const root = path.resolve(config.uploadDir);
  const absolute = path.resolve(root, relativePath);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new AppError('附件路径无效', 400, 'INVALID_FILE_PATH');
  }
  return absolute;
}

export async function registerIntentionRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: AuthService,
  service: IntentionService
) {
  app.get('/api/v1/investment-intentions', async request => {
    const context = await auth.authenticate(request);
    auth.requireAnyPermission(context, ['investment.intention.read', 'investment.intention.read_all']);
    const query = objectBody(request.query ?? {});
    const mode = query.mode ?? 'mine';
    if (mode !== 'mine' && mode !== 'todo' && mode !== 'all') {
      throw new AppError('列表类型无效', 400, 'VALIDATION_ERROR');
    }
    return {
      success: true,
      data: await service.list(context.user, canReadAll(context.user.permissions), mode, pagination(query))
    };
  });

  app.get<{ Params: { id: string } }>('/api/v1/investment-intentions/:id', async request => {
    const context = await auth.authenticate(request);
    auth.requireAnyPermission(context, ['investment.intention.read', 'investment.intention.read_all']);
    return { success: true, data: await service.get(
      requiredId(request.params.id, '投资意向ID'), context.user, canReadAll(context.user.permissions)
    ) };
  });

  app.post('/api/v1/investment-intentions', async (request, reply) => {
    const context = await auth.authenticate(request, { csrf: true });
    auth.requirePermission(context, 'investment.intention.create');
    const data = await service.create(parseInput(request.body, false), context.user);
    await auth.audit(context.user.id, 'CREATE', 'INVESTMENT_INTENTION', data.id, 'SUCCESS', request, null);
    return reply.status(201).send({ success: true, data });
  });

  app.put<{ Params: { id: string } }>('/api/v1/investment-intentions/:id', async request => {
    const context = await auth.authenticate(request, { csrf: true });
    auth.requirePermission(context, 'investment.intention.update');
    const id = requiredId(request.params.id, '投资意向ID');
    const data = await service.update(id, parseInput(request.body, true), context.user);
    await auth.audit(context.user.id, 'UPDATE', 'INVESTMENT_INTENTION', id, 'SUCCESS', request, null);
    return { success: true, data };
  });

  app.post<{ Params: { id: string } }>('/api/v1/investment-intentions/:id/submit', async request => {
    const context = await auth.authenticate(request, { csrf: true });
    auth.requirePermission(context, 'investment.intention.submit');
    const id = requiredId(request.params.id, '投资意向ID');
    const data = await service.submit(id, context.user);
    await auth.audit(context.user.id, 'SUBMIT', 'INVESTMENT_INTENTION', id, 'SUCCESS', request, null);
    return { success: true, data };
  });

  app.post<{ Params: { id: string } }>('/api/v1/investment-intentions/:id/approve', async request => {
    const context = await auth.authenticate(request, { csrf: true });
    auth.requireAnyPermission(context, [
      'investment.intention.approve_department', 'investment.intention.approve_supervising'
    ]);
    const body = objectBody(request.body ?? {});
    const id = requiredId(request.params.id, '投资意向ID');
    const data = await service.approve(id, context.user, optionalText(body.comment, '审批意见', 2000));
    await auth.audit(context.user.id, 'APPROVE', 'INVESTMENT_INTENTION', id, 'SUCCESS', request, null);
    return { success: true, data };
  });

  app.post<{ Params: { id: string } }>('/api/v1/investment-intentions/:id/return', async request => {
    const context = await auth.authenticate(request, { csrf: true });
    auth.requireAnyPermission(context, [
      'investment.intention.approve_department', 'investment.intention.approve_supervising'
    ]);
    const body = objectBody(request.body ?? {});
    const id = requiredId(request.params.id, '投资意向ID');
    const data = await service.returnToInitiator(id, context.user, optionalText(body.comment, '审批意见', 2000));
    await auth.audit(context.user.id, 'RETURN', 'INVESTMENT_INTENTION', id, 'SUCCESS', request, null);
    return { success: true, data };
  });

  app.post<{ Params: { id: string } }>('/api/v1/investment-intentions/:id/attachments', async (request, reply) => {
    const context = await auth.authenticate(request, { csrf: true });
    auth.requirePermission(context, 'investment.attachment.manage');
    const businessId = requiredId(request.params.id, '投资意向ID');
    await service.assertCanEdit(businessId, context.user);
    const [attachmentCounts] = await pool.query<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) AS total FROM tz_business_attachment
        WHERE business_type = 'INVESTMENT_INTENTION' AND business_id = ?`,
      [businessId]
    );
    const existingCount = Number(attachmentCounts[0]?.total ?? 0);
    if (existingCount >= 10) {
      throw new AppError('每份投资意向最多上传10个附件', 409, 'ATTACHMENT_LIMIT_EXCEEDED');
    }
    const uploaded = [];
    for await (const part of request.files()) {
      if (existingCount + uploaded.length >= 10) {
        part.file.resume();
        throw new AppError('每份投资意向最多上传10个附件', 409, 'ATTACHMENT_LIMIT_EXCEEDED');
      }
      const originalName = part.filename;
      if (!originalName || path.basename(originalName) !== originalName || originalName.length > 500 || /[\u0000-\u001f]/.test(originalName)) {
        throw new AppError('附件文件名无效', 400, 'INVALID_FILE_NAME');
      }
      const extension = path.extname(originalName).toLowerCase();
      const detectedStream = await fileTypeStream(Readable.toWeb(part.file));
      const detected = detectedStream.fileType;
      const policy = detected ? FILE_TYPES[detected.ext] : undefined;
      if (!detected || !policy || !policy.extensions.includes(extension) || policy.mime !== detected.mime) {
        await detectedStream.cancel();
        throw new AppError('附件实际类型不在允许范围内', 400, 'INVALID_FILE_TYPE');
      }
      const id = randomUUID();
      const storedName = `${id}${extension}`;
      const relativePath = path.posix.join('investment-intention', businessId, storedName);
      const absolutePath = safeUploadPath(relativePath);
      await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true });
      try {
        const nodeStream = Readable.fromWeb(detectedStream as Parameters<typeof Readable.fromWeb>[0]);
        await pipeline(nodeStream, fs.createWriteStream(absolutePath, { flags: 'wx' }));
        const stat = await fsPromises.stat(absolutePath);
        await pool.execute(
          `INSERT INTO tz_business_attachment (
            id, business_type, business_id, attachment_category,
            original_name, stored_name, mime_type, file_size, relative_path, uploaded_by
          ) VALUES (?, 'INVESTMENT_INTENTION', ?, 'RESEARCH_REPORT', ?, ?, ?, ?, ?, ?)`,
          [id, businessId, originalName, storedName, detected.mime, stat.size, relativePath, context.user.id]
        );
        uploaded.push({ id, originalName, fileSize: stat.size });
      } catch (error) {
        await fsPromises.rm(absolutePath, { force: true });
        throw error;
      }
    }
    if (!uploaded.length) throw new AppError('请选择要上传的附件', 400, 'ATTACHMENT_REQUIRED');
    await auth.audit(context.user.id, 'UPLOAD_ATTACHMENT', 'INVESTMENT_INTENTION', businessId, 'SUCCESS', request, { count: uploaded.length });
    return reply.status(201).send({ success: true, data: uploaded });
  });

  app.get<{ Params: { id: string } }>('/api/v1/attachments/:id/download', async (request, reply) => {
    const context = await auth.authenticate(request);
    auth.requirePermission(context, 'investment.attachment.read');
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM tz_business_attachment
        WHERE id = ? AND business_type = 'INVESTMENT_INTENTION'`,
      [requiredId(request.params.id, '附件ID')]
    );
    const file = rows[0];
    if (!file) throw new AppError('附件不存在', 404, 'NOT_FOUND');
    await service.assertCanView(file.business_id, context.user, canReadAll(context.user.permissions));
    const absolutePath = safeUploadPath(file.relative_path);
    try {
      await fsPromises.access(absolutePath);
    } catch {
      throw new AppError('附件文件不存在', 404, 'FILE_NOT_FOUND');
    }
    reply.header('content-type', file.mime_type ?? 'application/octet-stream');
    reply.header('content-disposition', `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
    return reply.send(fs.createReadStream(absolutePath));
  });
}
