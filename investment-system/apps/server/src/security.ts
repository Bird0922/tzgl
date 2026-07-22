import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { AppError } from './types.js';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { cost: number; blockSize: number; parallelization: number; maxmem: number }
) => Promise<Buffer>;

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;

export function validatePassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new AppError('密码长度必须为12至128位', 400, 'WEAK_PASSWORD');
  }
  const categories = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)]
    .filter(Boolean).length;
  if (categories < 3) {
    throw new AppError('密码必须包含大小写字母、数字、特殊字符中的至少三类', 400, 'WEAK_PASSWORD');
  }
  return password;
}

export async function hashPassword(password: unknown): Promise<string> {
  const valid = validatePassword(password);
  const salt = randomBytes(16);
  const derived = await scryptAsync(valid, salt, SCRYPT_KEY_LENGTH, {
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024
  });
  return [
    'scrypt', SCRYPT_COST, SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELIZATION,
    salt.toString('base64url'), derived.toString('base64url')
  ].join('$');
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, costValue, blockSizeValue, parallelValue, saltValue, hashValue] = encoded.split('$');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, 'base64url');
  if (!expected.length) return false;
  try {
    const derived = await scryptAsync(password, Buffer.from(saltValue, 'base64url'), expected.length, {
      cost: Number(costValue),
      blockSize: Number(blockSizeValue),
      parallelization: Number(parallelValue),
      maxmem: 64 * 1024 * 1024
    });
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export async function consumeDummyPasswordCheck(password: string): Promise<void> {
  await scryptAsync(password, Buffer.from('ltc-dummy-auth-salt'), SCRYPT_KEY_LENGTH, {
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024
  });
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function equalToken(value: string, expectedValue: string): boolean {
  const actual = Buffer.from(value);
  const expected = Buffer.from(expectedValue);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function normalizeUsername(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}
