CREATE TABLE IF NOT EXISTS tz_monthly_sequence (
  period CHAR(7) NOT NULL COMMENT 'YYYY-MM',
  current_value INT UNSIGNED NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS tz_investment_intention (
  id CHAR(36) NOT NULL,
  application_no VARCHAR(32) NOT NULL,
  applicant_user_id VARCHAR(64) NULL,
  applicant_name VARCHAR(100) NULL,
  investment_entity_id VARCHAR(64) NULL,
  investment_entity_name VARCHAR(200) NULL,
  application_date DATE NULL,
  project_name VARCHAR(300) NULL,
  investment_method VARCHAR(32) NULL,
  is_major_project TINYINT(1) NULL,
  planned_start_date DATE NULL,
  planned_end_date DATE NULL,
  project_leader_user_id VARCHAR(64) NULL,
  project_leader_name VARCHAR(100) NULL,
  contact_phone VARCHAR(50) NULL,
  project_location VARCHAR(500) NULL,
  project_summary TEXT NULL,
  main_content TEXT NULL,
  target_company_id VARCHAR(64) NULL,
  target_company_name VARCHAR(300) NULL,
  main_business VARCHAR(1000) NULL,
  investment_direction VARCHAR(64) NULL,
  domestic_overseas VARCHAR(32) NULL,
  currency_code VARCHAR(16) NULL,
  exchange_rate DECIMAL(18, 6) NULL,
  planned_shareholding_ratio DECIMAL(9, 4) NULL,
  project_total_investment DECIMAL(20, 2) NULL,
  planned_investment DECIMAL(20, 2) NULL,
  expected_return_rate DECIMAL(9, 4) NULL,
  status VARCHAR(32) NOT NULL,
  current_stage TINYINT UNSIGNED NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(64) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_tz_investment_intention_no (application_no),
  KEY idx_tz_investment_intention_status (status, current_stage),
  KEY idx_tz_investment_intention_project (project_name),
  KEY idx_tz_investment_intention_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS tz_investment_workflow_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  intention_id CHAR(36) NOT NULL,
  action VARCHAR(32) NOT NULL,
  from_stage TINYINT UNSIGNED NOT NULL,
  to_stage TINYINT UNSIGNED NOT NULL,
  operator_id VARCHAR(64) NULL,
  operator_name VARCHAR(100) NULL,
  operator_role VARCHAR(64) NULL,
  comment VARCHAR(2000) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_tz_workflow_history_intention (intention_id, created_at),
  CONSTRAINT fk_tz_workflow_history_intention
    FOREIGN KEY (intention_id) REFERENCES tz_investment_intention (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS tz_business_attachment (
  id CHAR(36) NOT NULL,
  business_type VARCHAR(64) NOT NULL,
  business_id CHAR(36) NOT NULL,
  attachment_category VARCHAR(64) NOT NULL,
  original_name VARCHAR(500) NOT NULL,
  stored_name VARCHAR(200) NOT NULL,
  mime_type VARCHAR(200) NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  relative_path VARCHAR(1000) NOT NULL,
  uploaded_by VARCHAR(64) NULL,
  uploaded_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_tz_attachment_business (business_type, business_id),
  CONSTRAINT fk_tz_attachment_intention
    FOREIGN KEY (business_id) REFERENCES tz_investment_intention (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

