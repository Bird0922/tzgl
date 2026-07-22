CREATE TABLE IF NOT EXISTS tz_system_setting (
  setting_key VARCHAR(100) NOT NULL COMMENT '系统配置键名',
  setting_value VARCHAR(1000) NOT NULL COMMENT '系统配置值',
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '配置最后更新时间',
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='系统运行配置表';

CREATE TABLE IF NOT EXISTS tz_org_unit (
  id CHAR(36) NOT NULL COMMENT '单位主键ID',
  parent_id CHAR(36) NULL COMMENT '上级单位主键ID，空值表示根单位',
  unit_code VARCHAR(64) NOT NULL COMMENT '单位编码，全局唯一',
  unit_name VARCHAR(200) NOT NULL COMMENT '单位名称',
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' COMMENT '单位状态，ACTIVE启用、DISABLED停用',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '同级单位显示顺序，数值越小越靠前',
  version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '数据乐观锁版本号',
  created_by CHAR(36) NULL COMMENT '创建人用户ID',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_by CHAR(36) NULL COMMENT '最后更新人用户ID',
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '最后更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tz_org_unit_code (unit_code),
  KEY idx_tz_org_unit_parent (parent_id, sort_order),
  KEY idx_tz_org_unit_status (status),
  CONSTRAINT fk_tz_org_unit_parent FOREIGN KEY (parent_id) REFERENCES tz_org_unit (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='组织单位表';

CREATE TABLE IF NOT EXISTS tz_org_department (
  id CHAR(36) NOT NULL COMMENT '部门主键ID',
  unit_id CHAR(36) NOT NULL COMMENT '所属单位主键ID',
  department_code VARCHAR(64) NOT NULL COMMENT '部门编码，在所属单位内唯一',
  department_name VARCHAR(200) NOT NULL COMMENT '部门名称',
  department_head_user_id CHAR(36) NULL COMMENT '部门负责人用户ID，用于部门负责人审批节点',
  supervising_leader_user_id CHAR(36) NULL COMMENT '分管领导用户ID，用于分管领导审批节点',
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' COMMENT '部门状态，ACTIVE启用、DISABLED停用',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '单位内部门显示顺序，数值越小越靠前',
  version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '数据乐观锁版本号',
  created_by CHAR(36) NULL COMMENT '创建人用户ID',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_by CHAR(36) NULL COMMENT '最后更新人用户ID',
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '最后更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tz_org_department_unit_code (unit_id, department_code),
  KEY idx_tz_org_department_unit (unit_id, sort_order),
  KEY idx_tz_org_department_status (status),
  KEY idx_tz_org_department_head (department_head_user_id),
  KEY idx_tz_org_department_leader (supervising_leader_user_id),
  CONSTRAINT fk_tz_org_department_unit FOREIGN KEY (unit_id) REFERENCES tz_org_unit (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='组织部门表';

CREATE TABLE IF NOT EXISTS tz_org_position (
  id CHAR(36) NOT NULL COMMENT '岗位主键ID',
  department_id CHAR(36) NOT NULL COMMENT '所属部门主键ID',
  position_code VARCHAR(64) NOT NULL COMMENT '岗位编码，在所属部门内唯一',
  position_name VARCHAR(200) NOT NULL COMMENT '岗位名称',
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' COMMENT '岗位状态，ACTIVE启用、DISABLED停用',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '部门内岗位显示顺序，数值越小越靠前',
  version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '数据乐观锁版本号',
  created_by CHAR(36) NULL COMMENT '创建人用户ID',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_by CHAR(36) NULL COMMENT '最后更新人用户ID',
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '最后更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tz_org_position_department_code (department_id, position_code),
  KEY idx_tz_org_position_department (department_id, sort_order),
  KEY idx_tz_org_position_status (status),
  CONSTRAINT fk_tz_org_position_department FOREIGN KEY (department_id) REFERENCES tz_org_department (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='组织岗位表';

CREATE TABLE IF NOT EXISTS tz_sys_permission (
  permission_code VARCHAR(128) NOT NULL COMMENT '权限编码，采用资源与操作组合的固定编码',
  permission_name VARCHAR(200) NOT NULL COMMENT '权限名称',
  permission_group VARCHAR(100) NOT NULL COMMENT '权限所属功能分组',
  description VARCHAR(500) NULL COMMENT '权限用途说明',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '权限登记时间',
  PRIMARY KEY (permission_code),
  KEY idx_tz_sys_permission_group (permission_group, permission_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='系统固定权限点表';

CREATE TABLE IF NOT EXISTS tz_sys_role (
  id CHAR(36) NOT NULL COMMENT '角色主键ID',
  role_code VARCHAR(64) NOT NULL COMMENT '角色编码，全局唯一',
  role_name VARCHAR(200) NOT NULL COMMENT '角色名称',
  description VARCHAR(500) NULL COMMENT '角色用途说明',
  is_system TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否系统内置角色，1是0否',
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' COMMENT '角色状态，ACTIVE启用、DISABLED停用',
  version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '数据乐观锁版本号',
  created_by CHAR(36) NULL COMMENT '创建人用户ID',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_by CHAR(36) NULL COMMENT '最后更新人用户ID',
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '最后更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tz_sys_role_code (role_code),
  KEY idx_tz_sys_role_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='系统角色表';

CREATE TABLE IF NOT EXISTS tz_sys_user (
  id CHAR(36) NOT NULL COMMENT '人员及登录用户主键ID',
  employee_no VARCHAR(64) NOT NULL COMMENT '人员编号，全局唯一',
  username VARCHAR(100) NOT NULL COMMENT '登录名，全局唯一且不区分大小写',
  password_hash VARCHAR(255) NOT NULL COMMENT '使用scrypt生成的加盐密码哈希，不保存明文密码',
  display_name VARCHAR(100) NOT NULL COMMENT '人员姓名',
  mobile VARCHAR(32) NULL COMMENT '手机号码',
  email VARCHAR(200) NULL COMMENT '电子邮箱地址',
  department_id CHAR(36) NULL COMMENT '所属部门主键ID，首次初始化管理员可暂时为空',
  position_id CHAR(36) NULL COMMENT '所属岗位主键ID，首次初始化管理员可暂时为空',
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' COMMENT '人员账号状态，ACTIVE启用、DISABLED停用',
  must_change_password TINYINT(1) NOT NULL DEFAULT 1 COMMENT '下次登录是否必须修改密码，1是0否',
  failed_login_count TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当前连续登录失败次数',
  locked_until TIMESTAMP(3) NULL COMMENT '账号锁定截止时间，空值表示未锁定',
  last_login_at TIMESTAMP(3) NULL COMMENT '最近一次成功登录时间',
  version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '数据乐观锁版本号',
  created_by CHAR(36) NULL COMMENT '创建人用户ID',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_by CHAR(36) NULL COMMENT '最后更新人用户ID',
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '最后更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tz_sys_user_employee_no (employee_no),
  UNIQUE KEY uk_tz_sys_user_username (username),
  KEY idx_tz_sys_user_department (department_id),
  KEY idx_tz_sys_user_position (position_id),
  KEY idx_tz_sys_user_status (status),
  CONSTRAINT fk_tz_sys_user_department FOREIGN KEY (department_id) REFERENCES tz_org_department (id) ON DELETE RESTRICT,
  CONSTRAINT fk_tz_sys_user_position FOREIGN KEY (position_id) REFERENCES tz_org_position (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='系统人员及登录账号表';

CREATE TABLE IF NOT EXISTS tz_sys_user_role (
  user_id CHAR(36) NOT NULL COMMENT '用户主键ID',
  role_id CHAR(36) NOT NULL COMMENT '角色主键ID',
  created_by CHAR(36) NULL COMMENT '分配角色的操作人用户ID',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '角色分配时间',
  PRIMARY KEY (user_id, role_id),
  KEY idx_tz_sys_user_role_role (role_id, user_id),
  CONSTRAINT fk_tz_sys_user_role_user FOREIGN KEY (user_id) REFERENCES tz_sys_user (id) ON DELETE CASCADE,
  CONSTRAINT fk_tz_sys_user_role_role FOREIGN KEY (role_id) REFERENCES tz_sys_role (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='用户角色关联表';

CREATE TABLE IF NOT EXISTS tz_sys_role_permission (
  role_id CHAR(36) NOT NULL COMMENT '角色主键ID',
  permission_code VARCHAR(128) NOT NULL COMMENT '权限编码',
  created_by CHAR(36) NULL COMMENT '分配权限的操作人用户ID',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '权限分配时间',
  PRIMARY KEY (role_id, permission_code),
  KEY idx_tz_sys_role_permission_code (permission_code, role_id),
  CONSTRAINT fk_tz_sys_role_permission_role FOREIGN KEY (role_id) REFERENCES tz_sys_role (id) ON DELETE CASCADE,
  CONSTRAINT fk_tz_sys_role_permission_permission FOREIGN KEY (permission_code) REFERENCES tz_sys_permission (permission_code) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='角色权限关联表';

CREATE TABLE IF NOT EXISTS tz_sys_session (
  id CHAR(36) NOT NULL COMMENT '登录会话主键ID',
  user_id CHAR(36) NOT NULL COMMENT '登录用户主键ID',
  token_hash CHAR(64) NOT NULL COMMENT '会话令牌SHA-256哈希值，不保存令牌原文',
  csrf_token_hash CHAR(64) NOT NULL COMMENT 'CSRF令牌SHA-256哈希值，不保存令牌原文',
  ip_address VARCHAR(64) NULL COMMENT '创建会话时的客户端IP地址',
  user_agent VARCHAR(500) NULL COMMENT '创建会话时的客户端浏览器标识',
  last_seen_at TIMESTAMP(3) NOT NULL COMMENT '会话最近访问时间',
  idle_expires_at TIMESTAMP(3) NOT NULL COMMENT '会话空闲过期时间',
  absolute_expires_at TIMESTAMP(3) NOT NULL COMMENT '会话绝对过期时间',
  revoked_at TIMESTAMP(3) NULL COMMENT '会话撤销时间，空值表示未撤销',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '会话创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tz_sys_session_token (token_hash),
  KEY idx_tz_sys_session_user (user_id, revoked_at),
  KEY idx_tz_sys_session_expiry (idle_expires_at, absolute_expires_at),
  CONSTRAINT fk_tz_sys_session_user FOREIGN KEY (user_id) REFERENCES tz_sys_user (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='用户登录会话表';

CREATE TABLE IF NOT EXISTS tz_auth_login_attempt (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '登录尝试记录主键ID',
  username VARCHAR(100) NOT NULL COMMENT '登录时提交的规范化登录名',
  ip_address VARCHAR(64) NOT NULL COMMENT '登录请求客户端IP地址',
  is_success TINYINT(1) NOT NULL COMMENT '登录是否成功，1成功0失败',
  attempted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '登录尝试时间',
  PRIMARY KEY (id),
  KEY idx_tz_auth_login_attempt_limit (username, ip_address, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='登录尝试与频率限制记录表';

CREATE TABLE IF NOT EXISTS tz_sys_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '安全审计日志主键ID',
  actor_user_id CHAR(36) NULL COMMENT '操作人用户ID，未登录操作为空',
  action VARCHAR(100) NOT NULL COMMENT '审计操作编码，如LOGIN、CREATE、UPDATE、DELETE',
  resource_type VARCHAR(100) NOT NULL COMMENT '操作资源类型，如USER、ROLE、UNIT',
  resource_id VARCHAR(100) NULL COMMENT '被操作资源主键或业务标识',
  result VARCHAR(16) NOT NULL COMMENT '操作结果，SUCCESS成功、FAILURE失败',
  ip_address VARCHAR(64) NULL COMMENT '操作客户端IP地址',
  detail_json JSON NULL COMMENT '脱敏后的操作摘要JSON，不得保存密码和令牌',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '审计记录时间',
  PRIMARY KEY (id),
  KEY idx_tz_sys_audit_actor (actor_user_id, created_at),
  KEY idx_tz_sys_audit_resource (resource_type, resource_id, created_at),
  KEY idx_tz_sys_audit_action (action, created_at),
  CONSTRAINT fk_tz_sys_audit_actor FOREIGN KEY (actor_user_id) REFERENCES tz_sys_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='系统安全审计日志表';

INSERT INTO tz_system_setting (setting_key, setting_value)
VALUES ('SETUP_INITIALIZED', '0')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);

INSERT INTO tz_sys_permission (permission_code, permission_name, permission_group, description) VALUES
  ('admin.access', '访问后台管理', '后台管理', '允许访问后台管理模块'),
  ('admin.unit.read', '查看单位', '单位管理', '允许查看单位数据'),
  ('admin.unit.manage', '维护单位', '单位管理', '允许创建、编辑、启停和删除单位'),
  ('admin.department.read', '查看部门', '部门管理', '允许查看部门数据'),
  ('admin.department.manage', '维护部门', '部门管理', '允许创建、编辑、启停和删除部门'),
  ('admin.position.read', '查看岗位', '岗位管理', '允许查看岗位数据'),
  ('admin.position.manage', '维护岗位', '岗位管理', '允许创建、编辑、启停和删除岗位'),
  ('admin.role.read', '查看角色', '角色管理', '允许查看角色及权限数据'),
  ('admin.role.manage', '维护角色', '角色管理', '允许创建、编辑、授权、启停和删除角色'),
  ('admin.user.read', '查看人员', '人员管理', '允许查看人员账号数据'),
  ('admin.user.manage', '维护人员', '人员管理', '允许创建、编辑、授权、启停、删除人员及重置密码'),
  ('investment.intention.read', '查看本人投资意向', '投资意向', '允许查看本人发起或待本人审批的投资意向'),
  ('investment.intention.read_all', '查看全部投资意向', '投资意向', '允许查看全部投资意向'),
  ('investment.intention.create', '创建投资意向', '投资意向', '允许创建投资意向'),
  ('investment.intention.update', '编辑投资意向', '投资意向', '允许编辑本人待发或退回的投资意向'),
  ('investment.intention.submit', '提交投资意向', '投资意向', '允许提交本人投资意向'),
  ('investment.intention.approve_department', '部门负责人审批', '投资意向', '允许作为指定部门负责人审批投资意向'),
  ('investment.intention.approve_supervising', '分管领导审批', '投资意向', '允许作为指定分管领导审批投资意向'),
  ('investment.attachment.read', '查看投资附件', '投资附件', '允许下载有权查看的投资意向附件'),
  ('investment.attachment.manage', '维护投资附件', '投资附件', '允许为本人可编辑的投资意向上传附件')
ON DUPLICATE KEY UPDATE
  permission_name = VALUES(permission_name),
  permission_group = VALUES(permission_group),
  description = VALUES(description);

INSERT INTO tz_sys_role (
  id, role_code, role_name, description, is_system, status, version
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'SYSTEM_ADMIN',
  '系统管理员',
  '系统内置最高权限角色，不允许删除或停用',
  1,
  'ACTIVE',
  1
)
ON DUPLICATE KEY UPDATE
  role_name = VALUES(role_name),
  description = VALUES(description),
  is_system = 1,
  status = 'ACTIVE';

INSERT INTO tz_sys_role_permission (role_id, permission_code)
SELECT '00000000-0000-0000-0000-000000000001', permission_code
FROM tz_sys_permission
ON DUPLICATE KEY UPDATE permission_code = VALUES(permission_code);
