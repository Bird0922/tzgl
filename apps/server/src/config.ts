import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));
dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

export const config = {
  projectRoot,
  serverPort: Number(process.env.SERVER_PORT ?? 3000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://127.0.0.1:5173',
  uploadDir: path.resolve(projectRoot, process.env.UPLOAD_DIR ?? './uploads'),
  database: {
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT ?? 3306),
    database: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    charset: process.env.DB_CHARSET ?? 'utf8mb4'
  }
};

