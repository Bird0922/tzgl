import type {
  Actor,
  ApprovalPolicy,
  GroupDecisionApplicationDetail,
  GroupDecisionApplicationForm,
  IntentionDetail,
  IntentionForm
} from './types';

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:3000/api/v1';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  code?: string;
  message?: string;
}

async function request<T>(
  path: string,
  actor: Actor,
  init: RequestInit = {}
): Promise<T> {
  const isFormData = init.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'content-type': 'application/json' }),
      'x-user-id': actor.id,
      'x-user-name': encodeURIComponent(actor.name),
      'x-user-role': actor.role,
      ...(actor.unitId ? { 'x-user-unit-id': actor.unitId } : {}),
      ...(actor.unitName ? { 'x-user-unit-name': encodeURIComponent(actor.unitName) } : {}),
      ...(actor.departmentId ? { 'x-user-department-id': actor.departmentId } : {}),
      ...(actor.departmentName
        ? { 'x-user-department-name': encodeURIComponent(actor.departmentName) }
        : {}),
      ...init.headers
    }
  });
  const result = await response.json() as ApiResponse<T>;
  if (!response.ok || !result.success) {
    throw new Error(result.message ?? '请求处理失败');
  }
  return result.data;
}

export function createIntention(payload: object, actor: Actor) {
  return request<IntentionDetail>('/investment-intentions', actor, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function getGlobalApprovalPolicy(actor: Actor) {
  return request<ApprovalPolicy>('/approval-policy', actor);
}

export function createGroupDecisionApplication(payload: object, actor: Actor) {
  return request<GroupDecisionApplicationDetail>('/group-decision-applications', actor, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function updateGroupDecisionApplication(id: string, payload: object, actor: Actor) {
  return request<GroupDecisionApplicationDetail>(`/group-decision-applications/${id}`, actor, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export function submitGroupDecisionApplication(id: string, actor: Actor) {
  return request<GroupDecisionApplicationDetail>(
    `/group-decision-applications/${id}/submit`,
    actor,
    { method: 'POST', body: '{}' }
  );
}

export function approveGroupDecisionApplication(
  id: string,
  comment: string,
  actor: Actor
) {
  return request<GroupDecisionApplicationDetail>(
    `/group-decision-applications/${id}/approve`,
    actor,
    { method: 'POST', body: JSON.stringify({ comment: comment || null }) }
  );
}

export function returnGroupDecisionApplication(
  id: string,
  comment: string,
  actor: Actor
) {
  return request<GroupDecisionApplicationDetail>(
    `/group-decision-applications/${id}/return`,
    actor,
    { method: 'POST', body: JSON.stringify({ comment: comment || null }) }
  );
}

export function groupDecisionPayloadFromForm(form: GroupDecisionApplicationForm) {
  return {
    applicationDate: form.applicationDate || null,
    applicationYear: form.applicationYear || null,
    projectName: form.projectName || null,
    projectCode: form.projectCode || null,
    projectLeaderUserId: form.projectLeaderUserId || null,
    projectLeaderName: form.projectLeaderName || null,
    plannedStartDate: form.plannedStartDate || null,
    plannedEndDate: form.plannedEndDate || null,
    investmentEntityId: form.investmentEntityId || null,
    investmentEntityName: form.investmentEntityName || null,
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

export function updateIntention(id: string, payload: object, actor: Actor) {
  return request<IntentionDetail>(`/investment-intentions/${id}`, actor, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export function submitIntention(id: string, actor: Actor) {
  return request<IntentionDetail>(`/investment-intentions/${id}/submit`, actor, {
    method: 'POST',
    body: '{}'
  });
}

export function approveIntention(id: string, comment: string, actor: Actor) {
  return request<IntentionDetail>(`/investment-intentions/${id}/approve`, actor, {
    method: 'POST',
    body: JSON.stringify({ comment: comment || null })
  });
}

export function returnIntention(id: string, comment: string, actor: Actor) {
  return request<IntentionDetail>(`/investment-intentions/${id}/return`, actor, {
    method: 'POST',
    body: JSON.stringify({ comment: comment || null })
  });
}

export async function uploadFiles(id: string, files: File[], actor: Actor) {
  for (const file of files) {
    const body = new FormData();
    body.append('file', file);
    await request<Array<{ id: string }>>(
      `/investment-intentions/${id}/attachments`,
      actor,
      { method: 'POST', body }
    );
  }
}

export function payloadFromForm(form: IntentionForm) {
  return {
    applicantUserId: 'user-admin',
    applicantName: '综合管理员',
    investmentEntityId: 'org-yuanwang',
    investmentEntityName: '远望实业集团有限公司',
    applicationDate: form.applicationDate || null,
    projectName: form.projectName || null,
    investmentMethod: form.investmentMethod || null,
    majorProject: form.majorProject === '' ? null : form.majorProject === 'yes',
    plannedStartDate: form.plannedStartDate || null,
    plannedEndDate: form.plannedEndDate || null,
    projectLeaderUserId: form.projectLeaderUserId || null,
    projectLeaderName: form.projectLeaderName || null,
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
