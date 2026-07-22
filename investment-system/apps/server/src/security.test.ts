import { describe, expect, it } from 'vitest';
import { equalToken, hashPassword, normalizeUsername, randomToken, sha256, validatePassword, verifyPassword } from './security.js';

describe('password security', () => {
  it('rejects short and low-complexity passwords', () => {
    expect(() => validatePassword('Abc123!')).toThrowError('密码长度必须为12至128位');
    expect(() => validatePassword('abcdefghijklmnop')).toThrowError('密码必须包含');
  });

  it('hashes with a random salt and verifies without storing plaintext', async () => {
    const password = 'Strong-Password-2026';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    await expect(verifyPassword(password, first)).resolves.toBe(true);
    await expect(verifyPassword('Wrong-Password-2026', first)).resolves.toBe(false);
  });

  it('normalizes usernames and creates non-reversible token hashes', () => {
    expect(normalizeUsername('  Admin.User  ')).toBe('admin.user');
    const token = randomToken();
    expect(token.length).toBeGreaterThan(32);
    expect(sha256(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(equalToken(token, token)).toBe(true);
    expect(equalToken(token, `${token}x`)).toBe(false);
  });
});
