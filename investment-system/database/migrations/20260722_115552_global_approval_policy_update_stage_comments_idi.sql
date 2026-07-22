ALTER TABLE tz_investment_intention
  MODIFY COLUMN current_stage TINYINT UNSIGNED NOT NULL DEFAULT 0
    COMMENT '当前审批节点，0经办人、1经办部门负责人、2经办部门分管领导、3审批完成';

ALTER TABLE tz_investment_workflow_history
  MODIFY COLUMN operator_role VARCHAR(64) NULL
    COMMENT '办理人角色，initiator经办人、department_head经办部门负责人、division_leader经办部门分管领导';
