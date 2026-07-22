export const DocumentStatus = {
  PendingSend: 'PENDING_SEND',
  InReview: 'IN_REVIEW',
  Approved: 'APPROVED',
  Returned: 'RETURNED'
} as const;

export const IntentionStatus = DocumentStatus;

export type IntentionStatusValue = typeof IntentionStatus[keyof typeof IntentionStatus];

export type UserRole = 'initiator' | 'department_head' | 'division_leader';

export interface GroupDecisionApplicationInput {
  version?: number;
  applicationDate?: string | null;
  applicationYear?: string | number | null;
  projectName?: string | null;
  projectCode?: string | null;
  projectLeaderUserId?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  investmentEntityId?: string | null;
  investmentDirection?: string | null;
  domesticOverseas?: string | null;
  investmentMethod?: string | null;
  majorProject?: boolean | null;
  currencyCode?: string | null;
  projectTotalInvestment?: string | number | null;
  plannedInvestment?: string | number | null;
  expectedReturnRate?: string | number | null;
  fundingCompanyOwned?: string | number | null;
  fundingGroupRequested?: string | number | null;
  fundingSpecialBond?: string | number | null;
  fundingGovernment?: string | number | null;
  fundingLoan?: string | number | null;
  fundingOther?: string | number | null;
  annualPlannedInvestment?: string | number | null;
}

export type EntityStatus = 'ACTIVE' | 'DISABLED';

export interface AuthUser {
  id: string;
  employeeNo: string;
  username: string;
  name: string;
  departmentId: string | null;
  positionId: string | null;
  mustChangePassword: boolean;
  permissions: string[];
}

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
  csrfTokenHash: string;
}

export interface IntentionInput {
  version?: number;
  applicantUserId?: string | null;
  applicantName?: string | null;
  investmentEntityId?: string | null;
  investmentEntityName?: string | null;
  applicationDate?: string | null;
  projectName?: string | null;
  investmentMethod?: string | null;
  majorProject?: boolean | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  projectLeaderUserId?: string | null;
  projectLeaderName?: string | null;
  contactPhone?: string | null;
  projectLocation?: string | null;
  projectSummary?: string | null;
  mainContent?: string | null;
  targetCompanyId?: string | null;
  targetCompanyName?: string | null;
  mainBusiness?: string | null;
  investmentDirection?: string | null;
  domesticOverseas?: string | null;
  currencyCode?: string | null;
  exchangeRate?: string | number | null;
  plannedShareholdingRatio?: string | number | null;
  projectTotalInvestment?: string | number | null;
  plannedInvestment?: string | number | null;
  expectedReturnRate?: string | number | null;
}

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = 'BAD_REQUEST'
  ) {
    super(message);
  }
}
