ALTER TABLE tz_schema_migration
  COMMENT = '数据库迁移执行记录表',
  MODIFY COLUMN file_name VARCHAR(255) NOT NULL COMMENT '已执行的数据库迁移文件名',
  MODIFY COLUMN applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '迁移执行时间';

ALTER TABLE tz_monthly_sequence
  COMMENT = '投资意向单据月度编号序列表',
  MODIFY COLUMN period CHAR(7) NOT NULL COMMENT '编号所属年度月份，格式YYYY-MM',
  MODIFY COLUMN current_value INT UNSIGNED NOT NULL COMMENT '当前月份已分配的最大四位序号',
  MODIFY COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '序号最后更新时间';

ALTER TABLE tz_investment_intention
  COMMENT = '股权投资意向登记主表',
  MODIFY COLUMN id CHAR(36) NOT NULL COMMENT '股权投资意向主键ID',
  MODIFY COLUMN application_no VARCHAR(32) NOT NULL COMMENT '单据编号，格式TZ-年度-月份-4位序号',
  MODIFY COLUMN applicant_user_id VARCHAR(64) NULL COMMENT '申请人用户ID，对应前端申请人',
  MODIFY COLUMN applicant_name VARCHAR(100) NULL COMMENT '申请人姓名，对应前端申请人',
  MODIFY COLUMN investment_entity_id VARCHAR(64) NULL COMMENT '投资主体组织ID',
  MODIFY COLUMN investment_entity_name VARCHAR(200) NULL COMMENT '投资主体名称，对应前端投资主体',
  MODIFY COLUMN application_date DATE NULL COMMENT '申请日期，对应前端申请日期',
  MODIFY COLUMN project_name VARCHAR(300) NULL COMMENT '项目名称，对应前端项目名称',
  MODIFY COLUMN investment_method VARCHAR(32) NULL COMMENT '投资方式编码，对应前端投资方式，当前为EQUITY股权投资',
  MODIFY COLUMN is_major_project TINYINT(1) NULL COMMENT '是否重大项目，对应前端重大项目，1是0否',
  MODIFY COLUMN planned_start_date DATE NULL COMMENT '计划开始日期，对应前端计划开始',
  MODIFY COLUMN planned_end_date DATE NULL COMMENT '计划结束日期，对应前端计划结束',
  MODIFY COLUMN project_leader_user_id VARCHAR(64) NULL COMMENT '项目负责人用户ID',
  MODIFY COLUMN project_leader_name VARCHAR(100) NULL COMMENT '项目负责人姓名，对应前端项目负责人',
  MODIFY COLUMN contact_phone VARCHAR(50) NULL COMMENT '联系电话，对应前端联系电话',
  MODIFY COLUMN project_location VARCHAR(500) NULL COMMENT '项目地点，对应前端项目地点',
  MODIFY COLUMN project_summary TEXT NULL COMMENT '项目概述，对应前端项目概述',
  MODIFY COLUMN main_content TEXT NULL COMMENT '项目主要内容，对应前端主要内容',
  MODIFY COLUMN target_company_id VARCHAR(64) NULL COMMENT '标的企业ID',
  MODIFY COLUMN target_company_name VARCHAR(300) NULL COMMENT '标的企业名称，对应前端标的企业',
  MODIFY COLUMN main_business VARCHAR(1000) NULL COMMENT '标的企业主营业务，对应前端主营业务',
  MODIFY COLUMN investment_direction VARCHAR(64) NULL COMMENT '投资方向编码，对应前端投资方向',
  MODIFY COLUMN domestic_overseas VARCHAR(32) NULL COMMENT '境内外编码，对应前端境内外，DOMESTIC境内OVERSEAS境外',
  MODIFY COLUMN currency_code VARCHAR(16) NULL COMMENT '投资币种编码，对应前端投资币种，如CNY、USD',
  MODIFY COLUMN exchange_rate DECIMAL(18, 6) NULL COMMENT '投资汇率，对应前端投资汇率',
  MODIFY COLUMN planned_shareholding_ratio DECIMAL(9, 4) NULL COMMENT '计划占股比例，对应前端计划占股比，单位百分比',
  MODIFY COLUMN project_total_investment DECIMAL(20, 2) NULL COMMENT '项目总投资额，对应前端项目总投资额，单位元',
  MODIFY COLUMN planned_investment DECIMAL(20, 2) NULL COMMENT '计划投资额，对应前端计划投资额，单位元',
  MODIFY COLUMN expected_return_rate DECIMAL(9, 4) NULL COMMENT '预计收益率，对应前端预计收益率，单位百分比',
  MODIFY COLUMN status VARCHAR(32) NOT NULL COMMENT '业务状态，PENDING_SEND待发、IN_REVIEW审核中、APPROVED已通过、RETURNED已退回',
  MODIFY COLUMN current_stage TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当前审批节点，0业务发起人、1投资部门负责人、2投资部门分管领导、3审批完成',
  MODIFY COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '数据乐观锁版本号，用于防止并发覆盖',
  MODIFY COLUMN created_by VARCHAR(64) NULL COMMENT '创建人用户ID',
  MODIFY COLUMN created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  MODIFY COLUMN updated_by VARCHAR(64) NULL COMMENT '最后更新人用户ID',
  MODIFY COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '最后更新时间';

ALTER TABLE tz_investment_workflow_history
  COMMENT = '股权投资意向审批流转历史表',
  MODIFY COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '审批流转记录主键ID',
  MODIFY COLUMN intention_id CHAR(36) NOT NULL COMMENT '关联的股权投资意向主键ID',
  MODIFY COLUMN action VARCHAR(32) NOT NULL COMMENT '审批操作，SUBMIT发送、APPROVE同意、RETURN退回',
  MODIFY COLUMN from_stage TINYINT UNSIGNED NOT NULL COMMENT '操作前审批节点编号',
  MODIFY COLUMN to_stage TINYINT UNSIGNED NOT NULL COMMENT '操作后审批节点编号',
  MODIFY COLUMN operator_id VARCHAR(64) NULL COMMENT '办理人用户ID',
  MODIFY COLUMN operator_name VARCHAR(100) NULL COMMENT '办理人姓名，对应前端流转记录办理人',
  MODIFY COLUMN operator_role VARCHAR(64) NULL COMMENT '办理人角色，initiator发起人、department_head部门负责人、division_leader分管领导',
  MODIFY COLUMN comment VARCHAR(2000) NULL COMMENT '审批意见，对应前端审批意见',
  MODIFY COLUMN created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '审批操作时间，对应前端流转记录时间';

ALTER TABLE tz_business_attachment
  COMMENT = '业务附件元数据表',
  MODIFY COLUMN id CHAR(36) NOT NULL COMMENT '附件主键ID',
  MODIFY COLUMN business_type VARCHAR(64) NOT NULL COMMENT '关联业务类型，INVESTMENT_INTENTION表示股权投资意向',
  MODIFY COLUMN business_id CHAR(36) NOT NULL COMMENT '关联业务数据主键ID',
  MODIFY COLUMN attachment_category VARCHAR(64) NOT NULL COMMENT '附件分类，RESEARCH_REPORT表示调研报告',
  MODIFY COLUMN original_name VARCHAR(500) NOT NULL COMMENT '用户上传的原始文件名，对应前端附件名称',
  MODIFY COLUMN stored_name VARCHAR(200) NOT NULL COMMENT '服务器保存的唯一文件名',
  MODIFY COLUMN mime_type VARCHAR(200) NULL COMMENT '附件MIME类型',
  MODIFY COLUMN file_size BIGINT UNSIGNED NOT NULL COMMENT '附件大小，单位字节',
  MODIFY COLUMN relative_path VARCHAR(1000) NOT NULL COMMENT '附件在存储目录中的相对路径',
  MODIFY COLUMN uploaded_by VARCHAR(64) NULL COMMENT '附件上传人用户ID',
  MODIFY COLUMN uploaded_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '附件上传时间';

