import { buildApp } from './app.js';
import { config } from './config.js';
import { createPool, runMigrations } from './database.js';

const pool = createPool();
await runMigrations(pool);
const app = await buildApp(pool);

await app.listen({ host: '127.0.0.1', port: config.serverPort });

