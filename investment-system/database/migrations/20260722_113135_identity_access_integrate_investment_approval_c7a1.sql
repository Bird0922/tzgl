ALTER TABLE tz_investment_intention
  ADD COLUMN applicant_department_id CHAR(36) NULL COMMENT '申请人提交时所属部门主键ID' AFTER applicant_name,
  ADD COLUMN department_head_approver_id CHAR(36) NULL COMMENT '提交时固化的部门负责人审批人用户ID' AFTER current_stage,
  ADD COLUMN supervising_leader_approver_id CHAR(36) NULL COMMENT '提交时固化的分管领导审批人用户ID' AFTER department_head_approver_id,
  ADD COLUMN current_approver_user_id CHAR(36) NULL COMMENT '当前待办审批人用户ID，审批完成或退回时为空' AFTER supervising_leader_approver_id,
  ADD KEY idx_tz_investment_intention_applicant_department (applicant_department_id),
  ADD KEY idx_tz_investment_intention_current_approver (current_approver_user_id, status),
  ADD CONSTRAINT fk_tz_investment_intention_applicant_department
    FOREIGN KEY (applicant_department_id) REFERENCES tz_org_department (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tz_investment_intention_department_approver
    FOREIGN KEY (department_head_approver_id) REFERENCES tz_sys_user (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tz_investment_intention_supervising_approver
    FOREIGN KEY (supervising_leader_approver_id) REFERENCES tz_sys_user (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tz_investment_intention_current_approver
    FOREIGN KEY (current_approver_user_id) REFERENCES tz_sys_user (id) ON DELETE RESTRICT;
