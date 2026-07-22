import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { isDirectLoopbackSetupRequest } from './setup-security.js';

function request(remoteAddress: string, headers: Record<string, string> = {}) {
  return {
    headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:5173', ...headers },
    raw: { socket: { remoteAddress } }
  } as unknown as FastifyRequest;
}

describe('local-only setup protection', () => {
  it('accepts a direct loopback request', () => {
    expect(isDirectLoopbackSetupRequest(request('127.0.0.1'))).toBe(true);
    expect(isDirectLoopbackSetupRequest(request('::1', { host: '[::1]:3000', origin: 'http://[::1]:5173' }))).toBe(true);
  });

  it('rejects remote and proxy-forwarded requests', () => {
    expect(isDirectLoopbackSetupRequest(request('192.0.2.10'))).toBe(false);
    expect(isDirectLoopbackSetupRequest(request('127.0.0.1', { 'x-forwarded-for': '192.0.2.10' }))).toBe(false);
    expect(isDirectLoopbackSetupRequest(request('127.0.0.1', { host: 'investment.example.com' }))).toBe(false);
  });
});
