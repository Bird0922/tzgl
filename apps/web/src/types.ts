export type UserRole = 'initiator' | 'department_head' | 'division_leader';

export interface Actor {
  id: string;
  name: string;
  role: UserRole;
}

export interface Attachment {
  id: string;
  category: string;
  originalName: string;
  mimeType: string | null;
  fileSize: number;
  uploadedAt: string;
}

export interface WorkflowHistory {
  id: number;
  action: 'SUBMIT' | 'APPROVE' | 'RETURN';
  fromStage: number;
  toStage: number;
  operatorId: string;
  operatorName: string;
  operatorRole: UserRole;
  comment: string | null;
  createdAt: string;
}

export interface IntentionDetail {
  id: string;
  applicationNo: string;
  applicantUserId: string | null;
  applicantName: string | null;
  investmentEntityId: string | null;
  investmentEntityName: string | null;
  applicationDate: string | null;
  projectName: string | null;
  investmentMethod: string | null;
  majorProject: boolean | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  projectLeaderUserId: string | null;
  projectLeaderName: string | null;
  contactPhone: string | null;
  projectLocation: string | null;
  projectSummary: string | null;
  mainContent: string | null;
  targetCompanyId: string | null;
  targetCompanyName: string | null;
  mainBusiness: string | null;
  investmentDirection: string | null;
  domesticOverseas: string | null;
  currencyCode: string | null;
  exchangeRate: string | null;
  plannedShareholdingRatio: string | null;
  projectTotalInvestment: string | null;
  plannedInvestment: string | null;
  expectedReturnRate: string | null;
  status: 'PENDING_SEND' | 'IN_REVIEW' | 'APPROVED' | 'RETURNED';
  currentStage: number;
  version: number;
  history: WorkflowHistory[];
  attachments: Attachment[];
}

export interface IntentionForm {
  applicationDate: string;
  projectName: string;
  investmentMethod: string;
  majorProject: '' | 'yes' | 'no';
  plannedStartDate: string;
  plannedEndDate: string;
  projectLeaderUserId: string;
  projectLeaderName: string;
  contactPhone: string;
  projectLocation: string;
  projectSummary: string;
  mainContent: string;
  targetCompanyId: string;
  targetCompanyName: string;
  mainBusiness: string;
  investmentDirection: string;
  domesticOverseas: string;
  currencyCode: string;
  exchangeRate: string;
  plannedShareholdingRatio: string;
  projectTotalInvestment: string;
  plannedInvestment: string;
  expectedReturnRate: string;
}

