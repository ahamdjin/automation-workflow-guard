#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { scanRepository, shouldFail } from '../src/guard.js';

const args = process.argv.slice(2);
const get = (flag, fallback = '') => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const has = (flag) => args.includes(flag);

if (has('--help') || has('-h')) {
  console.log(`Automation Workflow Guard\n\nUsage:\n  node bin/guard.js [path] [options]\n\nOptions:\n  --fail-on error|warning|none\n  --report <file>\n  --exclude <patterns>\n  --no-secrets\n  --no-n8n\n  --no-openapi\n`);
  process.exit(0);
}

const scanPath = args.find((arg) => !arg.startsWith('-') && !['error', 'warning', 'none'].includes(arg)) || '.';
const result = scanRepository({
  root: process.cwd(),
  scanPath,
  excludes: get('--exclude', 'node_modules/**,dist/**,coverage/**,.git/**'),
  scanSecrets: !has('--no-secrets'),
  scanN8n: !has('--no-n8n'),
  scanOpenApi: !has('--no-openapi'),
});

for (const item of result.findings) {
  console.log(`${item.severity.toUpperCase()} ${item.id} ${item.file}:${item.line} ${item.title} — ${item.message}`);
}
console.log(`\nScanned ${result.files.length} tracked files: ${result.summary.error} error(s), ${result.summary.warning} warning(s).`);

const report = get('--report');
if (report) {
  fs.mkdirSync(path.dirname(path.resolve(report)), { recursive: true });
  fs.writeFileSync(report, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

const threshold = get('--fail-on', 'error');
process.exitCode = shouldFail(result.summary, threshold) ? 1 : 0;
