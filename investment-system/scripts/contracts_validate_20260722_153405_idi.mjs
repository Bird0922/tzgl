import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = path.join(projectRoot, 'contracts', 'openapi.yaml');
const examplesDirectory = path.join(projectRoot, 'contracts', 'examples');
const serverSourceDirectory = path.join(projectRoot, 'apps', 'server', 'src');

function fail(message) {
  throw new Error(`接口契约校验失败：${message}`);
}

const contractSource = await readFile(contractPath, 'utf8');
for (const section of ['openapi:', 'info:', 'servers:', 'paths:', 'components:']) {
  if (!contractSource.includes(`\n${section}`) && !contractSource.startsWith(section)) {
    fail(`openapi.yaml 缺少 ${section}`);
  }
}

const operations = [];
let currentPath = null;
let currentOperation = null;
let inPaths = false;
for (const line of contractSource.split(/\r?\n/)) {
  if (line === 'paths:') {
    inPaths = true;
    continue;
  }
  if (line === 'components:') {
    inPaths = false;
    currentPath = null;
    currentOperation = null;
    continue;
  }
  if (!inPaths) continue;
  const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
  if (pathMatch) {
    currentPath = pathMatch[1];
    currentOperation = null;
    continue;
  }
  const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/);
  if (currentPath && methodMatch) {
    currentOperation = { method: methodMatch[1].toUpperCase(), path: currentPath, fields: new Set() };
    operations.push(currentOperation);
    continue;
  }
  const fieldMatch = line.match(/^      (operationId|summary|x-permissions|responses):/);
  if (currentOperation && fieldMatch) currentOperation.fields.add(fieldMatch[1]);
}

if (!operations.length) fail('未发现任何接口定义');
const operationIds = [];
for (const operation of operations) {
  for (const field of ['operationId', 'summary', 'x-permissions', 'responses']) {
    if (!operation.fields.has(field)) fail(`${operation.method} ${operation.path} 缺少 ${field}`);
  }
  const pathStart = contractSource.indexOf(`  ${operation.path}:`);
  const operationStart = contractSource.indexOf(`    ${operation.method.toLowerCase()}:`, pathStart);
  const operationId = contractSource.slice(operationStart).match(/^      operationId:\s*(\S+)\s*$/m)?.[1];
  if (!operationId) fail(`${operation.method} ${operation.path} 的 operationId 为空`);
  operationIds.push(operationId);
}
const duplicateIds = operationIds.filter((value, index) => operationIds.indexOf(value) !== index);
if (duplicateIds.length) fail(`operationId 重复：${[...new Set(duplicateIds)].join('、')}`);

const sourceFiles = (await readdir(serverSourceDirectory))
  .filter(file => file === 'app.ts' || /-routes(?:-[\w-]+)?\.ts$/.test(file));
const sourceTexts = await Promise.all(
  sourceFiles.map(file => readFile(path.join(serverSourceDirectory, file), 'utf8'))
);
const implementedRoutes = new Set();
const routePattern = /app\.(get|post|put|patch|delete)\s*(?:<[^>]+>)?\s*\(\s*['"]([^'"]+)['"]/g;
for (const source of sourceTexts) {
  for (const match of source.matchAll(routePattern)) {
    implementedRoutes.add(`${match[1].toUpperCase()} ${match[2].replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`);
  }
}
const documentedRoutes = new Set(operations.map(operation => `${operation.method} /api/v1${operation.path}`));
const undocumented = [...implementedRoutes].filter(route => !documentedRoutes.has(route));
const unimplemented = [...documentedRoutes].filter(route => !implementedRoutes.has(route));
if (undocumented.length) fail(`后端存在未记录接口：${undocumented.join('、')}`);
if (unimplemented.length) fail(`契约存在未实现接口：${unimplemented.join('、')}`);

const externalExamplePaths = [...contractSource.matchAll(/externalValue:\s*(\.\/\S+)/g)].map(match => match[1]);
const referencedExamples = new Set();
for (const relativePath of externalExamplePaths) {
  const absolutePath = path.resolve(path.dirname(contractPath), relativePath);
  if (!absolutePath.startsWith(`${examplesDirectory}${path.sep}`)) {
    fail(`示例文件必须位于 contracts/examples：${relativePath}`);
  }
  let source;
  try {
    source = await readFile(absolutePath, 'utf8');
  } catch {
    fail(`无法读取示例文件：${relativePath}`);
  }
  try {
    JSON.parse(source);
  } catch (error) {
    fail(`示例文件不是有效 JSON：${relativePath}（${error.message}）`);
  }
  referencedExamples.add(path.basename(absolutePath));
}
const exampleFiles = (await readdir(examplesDirectory)).filter(file => file.endsWith('.json'));
const unreferenced = exampleFiles.filter(file => !referencedExamples.has(file));
if (unreferenced.length) fail(`存在未被 openapi.yaml 引用的示例：${unreferenced.join('、')}`);

console.log(`接口契约校验通过：${operations.length} 个接口，${exampleFiles.length} 个 JSON 示例，${sourceFiles.length} 个路由源文件一致。`);
