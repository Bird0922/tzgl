import { describe, expect, it } from 'vitest';
import { objectBody, optionalId, pagination, requiredId, statusValue, stringArray } from './validation.js';

describe('request validation', () => {
  it('rejects malformed ids and status values', () => {
    expect(() => requiredId('../etc/passwd', 'ID')).toThrowError('ID格式无效');
    expect(optionalId('', 'ID')).toBeNull();
    expect(() => statusValue('DELETED')).toThrowError('状态值无效');
  });

  it('bounds pagination and removes duplicate string values', () => {
    expect(pagination({ page: '2', pageSize: '500' })).toEqual({ page: 2, pageSize: 100, offset: 100 });
    expect(stringArray(['role-a', 'role-a', 'role-b'], '角色')).toEqual(['role-a', 'role-b']);
  });

  it('only accepts object request bodies', () => {
    expect(objectBody({ value: 1 })).toEqual({ value: 1 });
    expect(() => objectBody(['value'])).toThrowError('请求数据格式无效');
  });
});
