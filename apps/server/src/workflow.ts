import { AppError, IntentionStatus, type UserRole } from './types.js';

export function formatApplicationNo(date: Date, sequence: number): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `TZ-${year}-${month}-${String(sequence).padStart(4, '0')}`;
}

export function requiredReviewerRole(stage: number): UserRole {
  if (stage === 1) return 'department_head';
  if (stage === 2) return 'division_leader';
  throw new AppError('当前节点不是审核节点', 409, 'INVALID_WORKFLOW_STAGE');
}

export function approveTransition(stage: number, role: UserRole): {
  status: string;
  nextStage: number;
} {
  const expectedRole = requiredReviewerRole(stage);
  if (role !== expectedRole) {
    throw new AppError('当前用户无权审核此节点', 403, 'FORBIDDEN');
  }

  if (stage === 1) return { status: IntentionStatus.InReview, nextStage: 2 };
  return { status: IntentionStatus.Approved, nextStage: 3 };
}

export function returnTransition(stage: number, role: UserRole): {
  status: string;
  nextStage: number;
} {
  const expectedRole = requiredReviewerRole(stage);
  if (role !== expectedRole) {
    throw new AppError('当前用户无权退回此节点', 403, 'FORBIDDEN');
  }
  return { status: IntentionStatus.Returned, nextStage: 0 };
}

