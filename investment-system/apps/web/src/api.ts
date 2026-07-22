import type {
  GroupDecisionApplicationDetail,
  GroupDecisionApplicationForm,
  IntentionDetail,
  IntentionForm,
  Paged
} from './types';

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:3000/api/v1';
let csrfToken = '';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  code?: string;
  message?: string;
}

export class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) {
    super(message);
  }
}

export function setCsrfToken(value: string) {
  csrfToken = value;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = init.body instanceof FormData;
  const method = (init.method ?? 'GET').toUpperCase();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(isFormData || method === 'GET' ? {} : { 'content-type': 'application/json' }),
      ...(method === 'GET' || !csrfToken ? {} : { 'x-csrf-token': csrfToken }),
      ...init.headers
    }
  });
  const result = await response.json() as ApiResponse<T>;
  if (!response.ok || !result.success) {
    throw new ApiError(result.message ?? '请求处理失败', result.code ?? 'REQUEST_FAILED', response.status);
  }
  return result.data;
}

export function fetchIntentions(mode: 'mine' | 'todo' | 'all', page = 1, pageSize = 20) {
  return apiRequest<Paged<IntentionDetail>>(`/investment-intentions?mode=${mode}&page=${page}&pageSize=${pageSize}`);
}

export function fetchIntention(id: string) {
  return apiRequest<IntentionDetail>(`/investment-intentions/${id}`);
}

export function createIntention(payload: object) {
  return apiRequest<IntentionDetail>('/investment-intentions', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateIntention(id: string, payload: object) {
  return apiRequest<IntentionDetail>(`/investment-intentions/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function submitIntention(id: string) {
  return apiRequest<IntentionDetail>(`/investment-intentions/${id}/submit`, { method: 'POST', body: '{}' });
}

export function approveIntention(id: string, comment: string) {
  return apiRequest<IntentionDetail>(`/investment-intentions/${id}/approve`, { method: 'POST', body: JSON.stringify({ comment: comment || null }) });
}

export function returnIntention(id: string, comment: string) {
  return apiRequest<IntentionDetail>(`/investment-intentions/${id}/return`, { method: 'POST', body: JSON.stringify({ comment: comment || null }) });
}

export async function uploadFiles(id: string, files: File[]) {
  for (const file of files) {
    const body = new FormData();
    body.append('file', file);
    await apiRequest<Array<{ id: string }>>(`/investment-intentions/${id}/attachments`, { method: 'POST', body });
  }
}

export function payloadFromForm(form: IntentionForm, version?: number) {
  return {
    ...(version !== undefined ? { version } : {}),
    investmentEntityId: form.investmentEntityId || null,
    applicationDate: form.applicationDate || null,
    projectName: form.projectName || null,
    investmentMethod: form.investmentMethod || null,
    majorProject: form.majorProject === '' ? null : form.majorProject === 'yes',
    plannedStartDate: form.plannedStartDate || null,
    plannedEndDate: form.plannedEndDate || null,
    projectLeaderUserId: form.projectLeaderUserId || null,
    contactPhone: form.contactPhone || null,
    projectLocation: form.projectLocation || null,
    projectSummary: form.projectSummary || null,
    mainContent: form.mainContent || null,
    targetCompanyId: form.targetCompanyId || null,
    targetCompanyName: form.targetCompanyName || null,
    mainBusiness: form.mainBusiness || null,
    investmentDirection: form.investmentDirection || null,
    domesticOverseas: form.domesticOverseas || null,
    currencyCode: form.currencyCode || null,
    exchangeRate: form.exchangeRate || null,
    plannedShareholdingRatio: form.plannedShareholdingRatio || null,
    projectTotalInvestment: form.projectTotalInvestment || null,
    plannedInvestment: form.plannedInvestment || null,
    expectedReturnRate: form.expectedReturnRate || null
  };
}

export function fetchGroupDecisionApplication(id: string) {
  return apiRequest<GroupDecisionApplicationDetail>(`/group-decision-applications/${id}`);
}

export function createGroupDecisionApplication(payload: object) {
  return apiRequest<GroupDecisionApplicationDetail>('/group-decision-applications', {
    method: 'POST', body: JSON.stringify(payload)
  });
}

export function updateGroupDecisionApplication(id: string, payload: object) {
  return apiRequest<GroupDecisionApplicationDetail>(`/group-decision-applications/${id}`, {
    method: 'PUT', body: JSON.stringify(payload)
  });
}

export function submitGroupDecisionApplication(id: string) {
  return apiRequest<GroupDecisionApplicationDetail>(`/group-decision-applications/${id}/submit`, {
    method: 'POST', body: '{}'
  });
}

export function approveGroupDecisionApplication(id: string, comment: string) {
  return apiRequest<GroupDecisionApplicationDetail>(`/group-decision-applications/${id}/approve`, {
    method: 'POST', body: JSON.stringify({ comment: comment || null })
  });
}

export function returnGroupDecisionApplication(id: string, comment: string) {
  return apiRequest<GroupDecisionApplicationDetail>(`/group-decision-applications/${id}/return`, {
    method: 'POST', body: JSON.stringify({ comment: comment || null })
  });
}

export function groupDecisionPayloadFromForm(form: GroupDecisionApplicationForm, version?: number) {
  return {
    ...(version !== undefined ? { version } : {}),
    applicationDate: form.applicationDate || null,
    applicationYear: form.applicationYear || null,
    projectName: form.projectName || null,
    projectCode: form.projectCode || null,
    projectLeaderUserId: form.projectLeaderUserId || null,
    plannedStartDate: form.plannedStartDate || null,
    plannedEndDate: form.plannedEndDate || null,
    investmentEntityId: form.investmentEntityId || null,
    investmentDirection: form.investmentDirection || null,
    domesticOverseas: form.domesticOverseas || null,
    investmentMethod: form.investmentMethod || null,
    majorProject: form.majorProject === '' ? null : form.majorProject === 'yes',
    currencyCode: form.currencyCode || null,
    projectTotalInvestment: form.projectTotalInvestment || null,
    plannedInvestment: form.plannedInvestment || null,
    expectedReturnRate: form.expectedReturnRate || null,
    fundingCompanyOwned: form.fundingCompanyOwned || null,
    fundingGroupRequested: form.fundingGroupRequested || null,
    fundingSpecialBond: form.fundingSpecialBond || null,
    fundingGovernment: form.fundingGovernment || null,
    fundingLoan: form.fundingLoan || null,
    fundingOther: form.fundingOther || null,
    annualPlannedInvestment: form.annualPlannedInvestment || null
  };
}
