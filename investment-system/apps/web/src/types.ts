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
  operatorRole: string;
  comment: string | null;
  createdAt: string;
}

export interface IntentionDetail {
  id: string;
  applicationNo: string;
  applicantUserId: string | null;
  applicantName: string | null;
  applicantDepartmentId: string | null;
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
  departmentHeadApproverId: string | null;
  supervisingLeaderApproverId: string | null;
  currentApproverUserId: string | null;
  version: number;
  history?: WorkflowHistory[];
  attachments?: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export interface IntentionForm {
  applicationDate: string;
  projectName: string;
  investmentEntityId: string;
  investmentMethod: string;
  majorProject: '' | 'yes' | 'no';
  plannedStartDate: string;
  plannedEndDate: string;
  projectLeaderUserId: string;
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

export interface UnitItem {
  id: string; parentId: string | null; code: string; name: string;
  status: EntityStatus; sortOrder: number; version: number;
}

export interface DepartmentItem {
  id: string; unitId: string; unitName: string; code: string; name: string;
  departmentHeadUserId: string | null; departmentHeadName: string | null;
  supervisingLeaderUserId: string | null; supervisingLeaderName: string | null;
  status: EntityStatus; sortOrder: number; version: number;
}

export interface PositionItem {
  id: string; unitId: string; unitName: string; departmentId: string; departmentName: string;
  code: string; name: string; status: EntityStatus; sortOrder: number; version: number;
}

export interface RoleItem {
  id: string; code: string; name: string; description: string | null; isSystem: boolean;
  status: EntityStatus; version: number; permissionCodes: string[];
}

export interface UserItem {
  id: string; employeeNo: string; username: string; displayName: string;
  mobile: string | null; email: string | null; unitId: string | null; unitName: string | null;
  departmentId: string | null; departmentName: string | null;
  positionId: string | null; positionName: string | null;
  status: EntityStatus; mustChangePassword: boolean; version: number; roleIds: string[];
  roles: Array<{ id: string; code: string; name: string }>;
}

export interface DirectoryUser {
  id: string; employeeNo: string; name: string; unitId: string; unitName: string;
  departmentId: string; departmentName: string; positionId: string; positionName: string;
}

export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }
