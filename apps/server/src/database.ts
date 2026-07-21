import fs from 'node:fs/promises';
import path from 'node:path';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { config } from './config.js';

export function createPool(): Pool {
  return mysql.createPool({
    ...config.database,
    connectionLimit: 10,
    multipleStatements: true,
    decimalNumbers: false,
    dateStrings: true
  });
}

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tz_schema_migration (
      file_name VARCHAR(255) NOT NULL COMMENT '已执行的数据库迁移文件名',
      applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '迁移执行时间',
      PRIMARY KEY (file_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      COMMENT='数据库迁移执行记录表'
  `);
  const migrationsDir = path.join(config.projectRoot, 'database', 'migrations');
  const files = (await fs.readdir(migrationsDir))
    .filter(file => file.endsWith('.sql'))
    .sort();

  const [appliedRows] = await pool.query<Array<RowDataPacket & { file_name: string }>>(
    'SELECT file_name FROM tz_schema_migration'
  );
  const applied = new Set(appliedRows.map(row => row.file_name));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    await pool.execute('INSERT INTO tz_schema_migration (file_name) VALUES (?)', [file]);
  }
}
