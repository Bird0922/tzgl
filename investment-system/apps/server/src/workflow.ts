import { AppError, DocumentStatus, type UserRole } from './types.js';

export const GLOBAL_APPROVAL_POLICY = {
  id: 'global-document-approval-v1',
  name: '全局单据审批流程',
  scope: 'ALL_DOCUMENTS',
  completedStage: 3,
  stages: [
    { stage: 0, role: 'initiator', name: '经办人', action: 'SUBMIT' },
    { stage: 1, role: 'department_head', name: '经办部门负责人', action: 'APPROVE' },
    { stage: 2, role: 'division_leader', name: '经办部门分管领导', action: 'APPROVE' }
  ]
} as const;

export function formatApplicationNo(date: Date, sequence: number): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `TZ-${year}-${month}-${String(sequence).padStart(4, '0')}`;
}

export function requiredReviewerRole(stage: number): UserRole {
  const approvalStage = GLOBAL_APPROVAL_POLICY.stages.find(
    item => item.stage === stage && item.action === 'APPROVE'
  );
  if (!approvalStage) {
    throw new AppError('当前节点不是审核节点', 409, 'INVALID_WORKFLOW_STAGE');
  }
  return approvalStage.role;
}

export function submitTransition(stage: number, role: UserRole): {
  status: string;
  nextStage: number;
} {
  const submitStage = GLOBAL_APPROVAL_POLICY.stages.find(item => item.action === 'SUBMIT');
  if (!submitStage || stage !== submitStage.stage) {
    throw new AppError('当前节点不允许提交', 409, 'INVALID_WORKFLOW_STAGE');
  }
  if (role !== submitStage.role) {
    throw new AppError('当前用户无权提交此单据', 403, 'FORBIDDEN');
  }
  return { status: DocumentStatus.InReview, nextStage: stage + 1 };
}

export function approveTransition(stage: number, role: UserRole): {
  status: string;
  nextStage: number;
} {
  const expectedRole = requiredReviewerRole(stage);
  if (role !== expectedRole) {
    throw new AppError('当前用户无权审核此节点', 403, 'FORBIDDEN');
  }

  const nextStage = stage + 1;
  return {
    status: nextStage === GLOBAL_APPROVAL_POLICY.completedStage
      ? DocumentStatus.Approved
      : DocumentStatus.InReview,
    nextStage
  };
}

export function returnTransition(stage: number, role: UserRole): {
  status: string;
  nextStage: number;
} {
  const expectedRole = requiredReviewerRole(stage);
  if (role !== expectedRole) {
    throw new AppError('当前用户无权退回此节点', 403, 'FORBIDDEN');
  }
  return { status: DocumentStatus.Returned, nextStage: 0 };
}
