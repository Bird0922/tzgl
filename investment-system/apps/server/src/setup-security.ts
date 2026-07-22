import type { FastifyRequest } from 'fastify';

function loopback(value: string | undefined): boolean {
  return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';
}

export function isDirectLoopbackSetupRequest(request: FastifyRequest): boolean {
  const forwardedHeaders = [
    'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip'
  ];
  if (forwardedHeaders.some(header => request.headers[header] !== undefined)) return false;
  if (!loopback(request.raw.socket.remoteAddress)) return false;
  let host: string;
  try {
    host = new URL(`http://${String(request.headers.host ?? '')}`).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) return false;
  const origin = request.headers.origin;
  if (typeof origin === 'string') {
    try {
      const originHost = new URL(origin).hostname.replace(/^\[|\]$/g, '');
      if (!['localhost', '127.0.0.1', '::1'].includes(originHost)) return false;
    } catch {
      return false;
    }
  }
  return true;
}
