import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  AppError,
  IntentionStatus,
  type Actor,
  type IntentionInput
} from './types.js';
import { approveTransition, formatApplicationNo, returnTransition } from './workflow.js';

interface IntentionRow extends RowDataPacket {
  id: string;
  application_no: string;
  applicant_user_id: string | null;
  applicant_name: string | null;
  investment_entity_id: string | null;
  investment_entity_name: string | null;
  application_date: string | null;
  project_name: string | null;
  investment_method: string | null;
  is_major_project: number | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  project_leader_user_id: string | null;
  project_leader_name: string | null;
  contact_phone: string | null;
  project_location: string | null;
  project_summary: string | null;
  main_content: string | null;
  target_company_id: string | null;
  target_company_name: string | null;
  main_business: string | null;
  investment_direction: string | null;
  domestic_overseas: string | null;
  currency_code: string | null;
  exchange_rate: string | null;
  planned_shareholding_ratio: string | null;
  project_total_investment: string | null;
  planned_investment: string | null;
  expected_return_rate: string | null;
  status: string;
  current_stage: number;
  version: number;
  created_at: string;
  updated_at: string;
}

function nullable(value: unknown): string | number | null {
  return value === '' || value === undefined ? null : value as string | number | null;
}

function toDto(row: IntentionRow) {
  return {
    id: row.id,
    applicationNo: row.application_no,
    applicantUserId: row.applicant_user_id,
    applicantName: row.applicant_name,
    investmentEntityId: row.investment_entity_id,
    investmentEntityName: row.investment_entity_name,
    applicationDate: row.application_date,
    projectName: row.project_name,
    investmentMethod: row.investment_method,
    majorProject: row.is_major_project === null ? null : Boolean(row.is_major_project),
    plannedStartDate: row.planned_start_date,
    plannedEndDate: row.planned_end_date,
    projectLeaderUserId: row.project_leader_user_id,
    projectLeaderName: row.project_leader_name,
    contactPhone: row.contact_phone,
    projectLocation: row.project_location,
    projectSummary: row.project_summary,
    mainContent: row.main_content,
    targetCompanyId: row.target_company_id,
    targetCompanyName: row.target_company_name,
    mainBusiness: row.main_business,
    investmentDirection: row.investment_direction,
    domesticOverseas: row.domestic_overseas,
    currencyCode: row.currency_code,
    exchangeRate: row.exchange_rate,
    plannedShareholdingRatio: row.planned_shareholding_ratio,
    projectTotalInvestment: row.project_total_investment,
    plannedInvestment: row.planned_investment,
    expectedReturnRate: row.expected_return_rate,
    status: row.status,
    currentStage: row.current_stage,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class IntentionService {
  constructor(private readonly pool: Pool) {}

  async list() {
    const [rows] = await this.pool.query<IntentionRow[]>(
      'SELECT * FROM tz_investment_intention ORDER BY created_at DESC LIMIT 100'
    );
    return rows.map(toDto);
  }

  async get(id: string) {
    const [rows] = await this.pool.query<IntentionRow[]>(
      'SELECT * FROM tz_investment_intention WHERE id = ?',
      [id]
    );
    if (!rows[0]) throw new AppError('投资意向不存在', 404, 'NOT_FOUND');

    const [history] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, action, from_stage AS fromStage, to_stage AS toStage,
              operator_id AS operatorId, operator_name AS operatorName,
              operator_role AS operatorRole, comment, created_at AS createdAt
         FROM tz_investment_workflow_history
        WHERE intention_id = ? ORDER BY id ASC`,
      [id]
    );
    const [attachments] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, attachment_category AS category, original_name AS originalName,
              mime_type AS mimeType, file_size AS fileSize, uploaded_at AS uploadedAt
         FROM tz_business_attachment
        WHERE business_type = 'INVESTMENT_INTENTION' AND business_id = ?
        ORDER BY uploaded_at ASC`,
      [id]
    );

    return { ...toDto(rows[0]), history, attachments };
  }

  async create(input: IntentionInput, actor: Actor) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const now = new Date();
      const applicationNo = await this.nextApplicationNo(connection, now);
      const id = randomUUID();
      const values = this.inputValues(input, actor);

      await connection.execute(
        `INSERT INTO tz_investment_intention (
          id, application_no, applicant_user_id, applicant_name,
          investment_entity_id, investment_entity_name, application_date,
          project_name, investment_method, is_major_project,
          planned_start_date, planned_end_date,
          project_leader_user_id, project_leader_name, contact_phone,
          project_location, project_summary, main_content,
          target_company_id, target_company_name, main_business,
          investment_direction, domestic_overseas, currency_code, exchange_rate,
          planned_shareholding_ratio, project_total_investment, planned_investment,
          expected_return_rate, status, current_stage, created_by, updated_by
        ) VALUES (${Array(33).fill('?').join(', ')})`,
        [
          id, applicationNo, ...values,
          IntentionStatus.PendingSend, 0, actor.id, actor.id
        ]
      );
      await connection.commit();
      return this.get(id);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async update(id: string, input: IntentionInput, actor: Actor) {
    const current = await this.getRow(id);
    if (current.status !== IntentionStatus.PendingSend && current.status !== IntentionStatus.Returned) {
      throw new AppError('当前状态不允许修改', 409, 'INVALID_STATUS');
    }
    const values = this.inputValues(input, actor);
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE tz_investment_intention SET
        applicant_user_id = ?, applicant_name = ?,
        investment_entity_id = ?, investment_entity_name = ?, application_date = ?,
        project_name = ?, investment_method = ?, is_major_project = ?,
        planned_start_date = ?, planned_end_date = ?,
        project_leader_user_id = ?, project_leader_name = ?, contact_phone = ?,
        project_location = ?, project_summary = ?, main_content = ?,
        target_company_id = ?, target_company_name = ?, main_business = ?,
        investment_direction = ?, domestic_overseas = ?, currency_code = ?, exchange_rate = ?,
        planned_shareholding_ratio = ?, project_total_investment = ?, planned_investment = ?,
        expected_return_rate = ?, version = version + 1, updated_by = ?
       WHERE id = ? AND version = ?`,
      [...values, actor.id, id, current.version]
    );
    if (!result.affectedRows) throw new AppError('数据已被其他用户修改，请刷新后重试', 409, 'VERSION_CONFLICT');
    return this.get(id);
  }

  async submit(id: string, actor: Actor) {
    const current = await this.getRow(id);
    if (current.status !== IntentionStatus.PendingSend && current.status !== IntentionStatus.Returned) {
      throw new AppError('当前状态不允许发送', 409, 'INVALID_STATUS');
    }
    await this.transition(id, current, 'SUBMIT', IntentionStatus.InReview, 1, actor, null);
    return this.get(id);
  }

  async approve(id: string, actor: Actor, comment: string | null) {
    const current = await this.getRow(id);
    if (current.status !== IntentionStatus.InReview) {
      throw new AppError('当前状态不允许审核', 409, 'INVALID_STATUS');
    }
    const next = approveTransition(current.current_stage, actor.role);
    await this.transition(id, current, 'APPROVE', next.status, next.nextStage, actor, comment);
    return this.get(id);
  }

  async returnToInitiator(id: string, actor: Actor, comment: string | null) {
    const current = await this.getRow(id);
    if (current.status !== IntentionStatus.InReview) {
      throw new AppError('当前状态不允许退回', 409, 'INVALID_STATUS');
    }
    const next = returnTransition(current.current_stage, actor.role);
    await this.transition(id, current, 'RETURN', next.status, next.nextStage, actor, comment);
    return this.get(id);
  }

  private inputValues(input: IntentionInput, actor: Actor): Array<string | number | null> {
    return [
      nullable(input.applicantUserId ?? actor.id),
      nullable(input.applicantName ?? actor.name),
      nullable(input.investmentEntityId),
      nullable(input.investmentEntityName),
      nullable(input.applicationDate),
      nullable(input.projectName),
      nullable(input.investmentMethod ?? 'EQUITY'),
      input.majorProject === null || input.majorProject === undefined ? null : Number(input.majorProject),
      nullable(input.plannedStartDate),
      nullable(input.plannedEndDate),
      nullable(input.projectLeaderUserId),
      nullable(input.projectLeaderName),
      nullable(input.contactPhone),
      nullable(input.projectLocation),
      nullable(input.projectSummary),
      nullable(input.mainContent),
      nullable(input.targetCompanyId),
      nullable(input.targetCompanyName),
      nullable(input.mainBusiness),
      nullable(input.investmentDirection),
      nullable(input.domesticOverseas),
      nullable(input.currencyCode),
      nullable(input.exchangeRate),
      nullable(input.plannedShareholdingRatio),
      nullable(input.projectTotalInvestment),
      nullable(input.plannedInvestment),
      nullable(input.expectedReturnRate)
    ];
  }

  private async getRow(id: string): Promise<IntentionRow> {
    const [rows] = await this.pool.query<IntentionRow[]>(
      'SELECT * FROM tz_investment_intention WHERE id = ?',
      [id]
    );
    if (!rows[0]) throw new AppError('投资意向不存在', 404, 'NOT_FOUND');
    return rows[0];
  }

  private async nextApplicationNo(connection: PoolConnection, now: Date): Promise<string> {
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await connection.execute(
      `INSERT INTO tz_monthly_sequence (period, current_value)
       VALUES (?, 1)
       ON DUPLICATE KEY UPDATE current_value = current_value + 1`,
      [period]
    );
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT current_value FROM tz_monthly_sequence WHERE period = ? FOR UPDATE',
      [period]
    );
    return formatApplicationNo(now, Number(rows[0].current_value));
  }

  private async transition(
    id: string,
    current: IntentionRow,
    action: string,
    status: string,
    nextStage: number,
    actor: Actor,
    comment: string | null
  ): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE tz_investment_intention
            SET status = ?, current_stage = ?, version = version + 1, updated_by = ?
          WHERE id = ? AND version = ?`,
        [status, nextStage, actor.id, id, current.version]
      );
      if (!result.affectedRows) {
        throw new AppError('数据已被其他用户处理，请刷新后重试', 409, 'VERSION_CONFLICT');
      }
      await connection.execute(
        `INSERT INTO tz_investment_workflow_history (
          intention_id, action, from_stage, to_stage,
          operator_id, operator_name, operator_role, comment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, action, current.current_stage, nextStage, actor.id, actor.name, actor.role, nullable(comment)]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
