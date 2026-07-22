import { AppError, type EntityStatus } from './types.js';

export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('请求数据格式无效', 400, 'VALIDATION_ERROR');
  }
  return value as Record<string, unknown>;
}

export function requiredText(
  value: unknown,
  label: string,
  maxLength: number,
  pattern?: RegExp
): string {
  if (typeof value !== 'string') {
    throw new AppError(`${label}格式无效`, 400, 'VALIDATION_ERROR');
  }
  const result = value.trim();
  if (!result || result.length > maxLength || (pattern && !pattern.test(result))) {
    throw new AppError(`${label}格式无效`, 400, 'VALIDATION_ERROR');
  }
  return result;
}

export function passwordText(value: unknown, label = '密码'): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) {
    throw new AppError(`${label}格式无效`, 400, 'VALIDATION_ERROR');
  }
  return value;
}

export function optionalText(
  value: unknown,
  label: string,
  maxLength: number,
  pattern?: RegExp
): string | null {
  if (value === null || value === undefined || value === '') return null;
  return requiredText(value, label, maxLength, pattern);
}

export function requiredId(value: unknown, label: string): string {
  return requiredText(value, label, 36, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
}

export function optionalId(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  return requiredId(value, label);
}

export function statusValue(value: unknown): EntityStatus {
  if (value !== 'ACTIVE' && value !== 'DISABLED') {
    throw new AppError('状态值无效', 400, 'VALIDATION_ERROR');
  }
  return value;
}

export function nonNegativeInteger(value: unknown, label: string, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new AppError(`${label}必须是非负整数`, 400, 'VALIDATION_ERROR');
  }
  return number;
}

export function positiveInteger(value: unknown, label: string): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new AppError(`${label}必须是正整数`, 400, 'VALIDATION_ERROR');
  }
  return number;
}

export function stringArray(value: unknown, label: string, maxItems = 100): string[] {
  if (!Array.isArray(value) || value.length > maxItems || value.some(item => typeof item !== 'string')) {
    throw new AppError(`${label}格式无效`, 400, 'VALIDATION_ERROR');
  }
  return Array.from(new Set(value.map(item => item.trim()).filter(Boolean)));
}

export function pagination(query: Record<string, unknown>) {
  const page = query.page === undefined ? 1 : positiveInteger(query.page, '页码');
  const requested = query.pageSize === undefined ? 20 : positiveInteger(query.pageSize, '每页数量');
  return { page, pageSize: Math.min(requested, 100), offset: (page - 1) * Math.min(requested, 100) };
}
