UPDATE tz_group_decision_application
SET version = 1
WHERE version = 0;

ALTER TABLE tz_group_decision_application
  MODIFY COLUMN applicant_user_id CHAR(36) NOT NULL COMMENT '申请人用户ID，对应当前登录经办人账号',
  MODIFY COLUMN applicant_unit_id CHAR(36) NULL COMMENT '申请单位组织ID，由申请人所属部门的单位带出',
  MODIFY COLUMN applicant_department_id CHAR(36) NULL COMMENT '申请部门组织ID，由申请人当前所属部门带出',
  MODIFY COLUMN project_leader_user_id CHAR(36) NULL COMMENT '项目负责人用户ID，从启用人员目录选择',
  MODIFY COLUMN investment_entity_id CHAR(36) NULL COMMENT '投资主体组织ID，从启用单位目录选择',
  MODIFY COLUMN version BIGINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '乐观锁版本号，每次修改或流转递增',
  MODIFY COLUMN created_by CHAR(36) NOT NULL COMMENT '创建人用户ID',
  MODIFY COLUMN updated_by CHAR(36) NOT NULL COMMENT '最后更新人用户ID',
  ADD COLUMN department_head_approver_id CHAR(36) NULL COMMENT '提交时固化的经办部门负责人审批人用户ID' AFTER current_stage,
  ADD COLUMN supervising_leader_approver_id CHAR(36) NULL COMMENT '提交时固化的经办部门分管领导审批人用户ID' AFTER department_head_approver_id,
  ADD COLUMN current_approver_user_id CHAR(36) NULL COMMENT '当前待办审批人用户ID，审批完成或退回时为空' AFTER supervising_leader_approver_id,
  ADD KEY idx_tz_group_decision_current_approver (current_approver_user_id, status),
  ADD KEY idx_tz_group_decision_applicant_department (applicant_department_id),
  ADD CONSTRAINT fk_tz_group_decision_applicant
    FOREIGN KEY (applicant_user_id) REFERENCES tz_sys_user (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tz_group_decision_applicant_unit
    FOREIGN KEY (applicant_unit_id) REFERENCES tz_org_unit (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tz_group_decision_applicant_department
    FOREIGN KEY (applicant_department_id) REFERENCES tz_org_department (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tz_group_decision_project_leader
    FOREIGN KEY (project_leader_user_id) REFERENCES tz_sys_user (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tz_group_decision_investment_entity
    FOREIGN KEY (investment_entity_id) REFERENCES tz_org_unit (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tz_group_decision_department_approver
    FOREIGN KEY (department_head_approver_id) REFERENCES tz_sys_user (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tz_group_decision_supervising_approver
    FOREIGN KEY (supervising_leader_approver_id) REFERENCES tz_sys_user (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tz_group_decision_current_approver
    FOREIGN KEY (current_approver_user_id) REFERENCES tz_sys_user (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tz_group_decision_created_by
    FOREIGN KEY (created_by) REFERENCES tz_sys_user (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_tz_group_decision_updated_by
    FOREIGN KEY (updated_by) REFERENCES tz_sys_user (id) ON DELETE RESTRICT;

INSERT INTO tz_sys_permission (permission_code, permission_name, permission_group, description) VALUES
  ('investment.group_decision.read', '查看本人集团决策申请', '集团决策申请', '允许查看本人发起、本人待办或本人曾参与审批的集团决策申请'),
  ('investment.group_decision.read_all', '查看全部集团决策申请', '集团决策申请', '允许查看全部集团决策申请'),
  ('investment.group_decision.create', '创建集团决策申请', '集团决策申请', '允许创建集团决策申请'),
  ('investment.group_decision.update', '编辑集团决策申请', '集团决策申请', '允许编辑本人待发或退回的集团决策申请'),
  ('investment.group_decision.submit', '提交集团决策申请', '集团决策申请', '允许提交本人集团决策申请'),
  ('investment.group_decision.approve_department', '经办部门负责人审批集团决策申请', '集团决策申请', '允许作为提交时固化的经办部门负责人审批集团决策申请'),
  ('investment.group_decision.approve_supervising', '经办部门分管领导审批集团决策申请', '集团决策申请', '允许作为提交时固化的经办部门分管领导审批集团决策申请')
ON DUPLICATE KEY UPDATE
  permission_name = VALUES(permission_name),
  permission_group = VALUES(permission_group),
  description = VALUES(description);

INSERT INTO tz_sys_role_permission (role_id, permission_code)
SELECT '00000000-0000-0000-0000-000000000001', permission_code
FROM tz_sys_permission
WHERE permission_code LIKE 'investment.group_decision.%'
ON DUPLICATE KEY UPDATE permission_code = VALUES(permission_code);
