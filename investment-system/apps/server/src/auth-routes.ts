import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthService, SESSION_COOKIE_NAME } from './auth-service.js';
import { config } from './config.js';
import { normalizeUsername } from './security.js';
import { isDirectLoopbackSetupRequest } from './setup-security.js';
import { AppError } from './types.js';
import { objectBody, passwordText, requiredText } from './validation.js';

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.production,
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60
  });
}

function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: config.production,
    sameSite: 'lax',
    path: '/'
  });
}

export async function registerAuthRoutes(app: FastifyInstance, auth: AuthService) {
  app.get('/api/v1/setup/status', async () => ({ success: true, data: await auth.setupStatus() }));

  app.post('/api/v1/setup/initialize', async (request, reply) => {
    if (!isDirectLoopbackSetupRequest(request)) {
      throw new AppError('初始化仅允许从服务器本机直接访问', 403, 'LOCAL_SETUP_ONLY');
    }
    const body = objectBody(request.body);
    const result = await auth.initialize({
      employeeNo: requiredText(body.employeeNo, '人员编号', 64, /^[A-Za-z0-9._-]+$/),
      username: normalizeUsername(requiredText(body.username, '登录名', 100, /^[A-Za-z0-9._-]+$/)),
      displayName: requiredText(body.displayName, '姓名', 100),
      password: passwordText(body.password)
    }, request);
    setSessionCookie(reply, result.sessionToken);
    return reply.status(201).send({
      success: true,
      data: { user: result.user, csrfToken: result.csrfToken }
    });
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const body = objectBody(request.body);
    const result = await auth.login(
      requiredText(body.username, '登录名', 100, /^[A-Za-z0-9._-]+$/),
      passwordText(body.password),
      request
    );
    setSessionCookie(reply, result.sessionToken);
    return { success: true, data: { user: result.user, csrfToken: result.csrfToken } };
  });

  app.get('/api/v1/auth/me', async request => {
    const context = await auth.authenticate(request, { allowPasswordChange: true });
    return { success: true, data: { user: context.user, csrfToken: context.csrfTokenHash } };
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const context = await auth.authenticate(request, { csrf: true, allowPasswordChange: true });
    await auth.logout(context, request);
    clearSessionCookie(reply);
    return { success: true, data: null };
  });

  app.post('/api/v1/auth/change-password', async (request, reply) => {
    const context = await auth.authenticate(request, { csrf: true, allowPasswordChange: true });
    const body = objectBody(request.body);
    await auth.changePassword(
      context,
      passwordText(body.currentPassword, '当前密码'),
      passwordText(body.newPassword, '新密码'),
      request
    );
    clearSessionCookie(reply);
    return { success: true, data: null };
  });
}
