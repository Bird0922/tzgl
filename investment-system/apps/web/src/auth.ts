import { reactive } from 'vue';
import { apiRequest, setCsrfToken } from './api';
import type { AuthUser } from './types';

interface AuthPayload { user: AuthUser; csrfToken: string }

export const authState = reactive<{
  initialized: boolean | null;
  ready: boolean;
  user: AuthUser | null;
}>({ initialized: null, ready: false, user: null });

function apply(payload: AuthPayload | null) {
  authState.user = payload?.user ?? null;
  setCsrfToken(payload?.csrfToken ?? '');
  authState.ready = true;
}

export async function loadSetupStatus() {
  const result = await apiRequest<{ initialized: boolean }>('/setup/status');
  authState.initialized = result.initialized;
  return result.initialized;
}

export async function loadSession() {
  try {
    apply(await apiRequest<AuthPayload>('/auth/me'));
  } catch {
    apply(null);
  }
}

export async function initializeSystem(input: { employeeNo: string; username: string; displayName: string; password: string }) {
  const payload = await apiRequest<AuthPayload>('/setup/initialize', { method: 'POST', body: JSON.stringify(input) });
  authState.initialized = true;
  apply(payload);
}

export async function login(username: string, password: string) {
  apply(await apiRequest<AuthPayload>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }));
}

export async function logout() {
  await apiRequest<null>('/auth/logout', { method: 'POST', body: '{}' });
  apply(null);
}

export async function changePassword(currentPassword: string, newPassword: string) {
  await apiRequest<null>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
  apply(null);
}

export function hasPermission(permission: string) {
  return Boolean(authState.user?.permissions.includes(permission));
}
