import fs from 'node:fs';
import path from 'node:path';
import { scanRepository, shouldFail } from './guard.js';

function input(name, fallback = '') {
  const value = process.env[`INPUT_${name.toUpperCase()}`];
  return value === undefined || value === '' ? fallback : value;
}

function boolInput(name, fallback = true) {
  const value = input(name, String(fallback)).toLowerCase();
  return !['false', '0', 'no', 'off'].includes(value);
}

function command(name, payload) {
  process.stdout.write(`::${name}::${String(payload).replaceAll('\r', '%0D').replaceAll('\n', '%0A')}\n`);
}

function setOutput(name, value) {
  const target = process.env.GITHUB_OUTPUT;
  if (target) {
    fs.appendFileSync(target, `${name}=${String(value).replaceAll('\n', '%0A')}\n`, 'utf8');
  } else {
    process.stdout.write(`OUTPUT ${name}=${value}\n`);
  }
}

function annotation(item) {
  const commandName = item.severity === 'error' ? 'error' : 'warning';
  const file = item.file.replaceAll(',', '%2C').replaceAll(':', '%3A');
  const title = `${item.id}: ${item.title}`.replaceAll(',', '%2C').replaceAll(':', '%3A');
  process.stdout.write(`::${commandName} file=${file},line=${item.line},title=${title}::${item.message.replaceAll('\r', '%0D').replaceAll('\n', '%0A')}\n`);
}

function writeSummary(result) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (!target) return;
  const lines = [
    '## Automation Workflow Guard',
    '',
    `- Scanned tracked files: **${result.files.length}**`,
    `- Errors: **${result.summary.error}**`,
    `- Warnings: **${result.summary.warning}**`,
    '',
  ];
  if (result.findings.length) {
    lines.push('| Severity | Rule | File | Finding |', '| --- | --- | --- | --- |');
    for (const item of result.findings.slice(0, 50)) {
      lines.push(`| ${item.severity} | ${item.id} | \`${item.file}:${item.line}\` | ${item.title.replaceAll('|', '\\|')} |`);
    }
    if (result.findings.length > 50) lines.push('', `Showing first 50 of ${result.findings.length} findings.`);
  } else {
    lines.push('No findings.');
  }
  fs.appendFileSync(target, `${lines.join('\n')}\n`, 'utf8');
}

try {
  const root = process.env.GITHUB_WORKSPACE || process.cwd();
  const reportInput = input('REPORT', 'automation-workflow-guard-report.json').trim();
  const result = scanRepository({
    root,
    scanPath: input('PATH', '.'),
    excludes: input('EXCLUDE', 'node_modules/**,dist/**,coverage/**,.git/**'),
    scanSecrets: boolInput('SCAN-SECRETS', true),
    scanN8n: boolInput('SCAN-N8N', true),
    scanOpenApi: boolInput('SCAN-OPENAPI', true),
  });

  for (const item of result.findings) annotation(item);

  let reportPath = '';
  if (reportInput) {
    reportPath = path.resolve(root, reportInput);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2)}\n`, 'utf8');
  }

  writeSummary(result);
  setOutput('findings', result.summary.total);
  setOutput('errors', result.summary.error);
  setOutput('warnings', result.summary.warning);
  setOutput('scanned-files', result.files.length);
  setOutput('report-path', reportInput || '');

  const threshold = input('FAIL-ON', 'error').toLowerCase();
  if (!['error', 'warning', 'none'].includes(threshold)) {
    command('error', `Invalid fail-on value "${threshold}". Use error, warning, or none.`);
    process.exitCode = 2;
  } else if (shouldFail(result.summary, threshold)) {
    command('error', `Automation Workflow Guard found ${result.summary.error} error(s) and ${result.summary.warning} warning(s).`);
    process.exitCode = 1;
  } else {
    command('notice', `Automation Workflow Guard passed with ${result.summary.error} error(s) and ${result.summary.warning} warning(s).`);
  }
} catch (error) {
  command('error', error?.stack || error?.message || String(error));
  process.exitCode = 2;
}
