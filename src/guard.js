import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TEXT_EXTENSIONS = new Set([
  '.json', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.md', '.txt', '.yml', '.yaml', '.env', '.toml', '.ini', '.cfg', '.conf', '.properties', '.sh', '.bash', '.zsh', '.py', '.rb', '.php', '.go', '.java', '.kt', '.cs', '.xml', '.html', '.css', '.sql', '.graphql', '.gql',
]);

const SECRET_RULES = [
  { id: 'AWG003', name: 'GitHub personal access token', regex: /\bghp_[A-Za-z0-9]{30,}\b/g },
  { id: 'AWG003', name: 'GitHub fine-grained token', regex: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/g },
  { id: 'AWG003', name: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { id: 'AWG003', name: 'OpenAI-style API key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'AWG003', name: 'AWS access key ID', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: 'AWG003', name: 'Private key material', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

function normalizeSlashes(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function globToRegex(glob) {
  const normalized = normalizeSlashes(glob.trim());
  let out = '^';
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (ch === '*') {
      if (normalized[i + 1] === '*') {
        const followedBySlash = normalized[i + 2] === '/';
        out += followedBySlash ? '(?:.*/)?' : '.*';
        i += followedBySlash ? 2 : 1;
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += escapeRegex(ch);
    }
  }
  out += '$';
  return new RegExp(out);
}

export function parseExcludePatterns(value = '') {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({ raw: item, regex: globToRegex(item) }));
}

export function isExcluded(relativePath, patterns) {
  const normalized = normalizeSlashes(relativePath);
  return patterns.some(({ regex }) => regex.test(normalized));
}

function envLike(relativePath) {
  const base = path.posix.basename(normalizeSlashes(relativePath)).toLowerCase();
  if (base === '.env.example' || base === '.env.sample' || base === '.env.template') return false;
  return base === '.env' || base.startsWith('.env.') || base.endsWith('.env');
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split('\n').length;
}

function finding({ id, severity, file, line = 1, title, message, category }) {
  return { id, severity, file: normalizeSlashes(file), line, title, message, category };
}

export function scanSecrets(relativePath, text) {
  const findings = [];
  if (envLike(relativePath)) {
    findings.push(finding({
      id: 'AWG001',
      severity: 'error',
      file: relativePath,
      title: 'Tracked environment file',
      message: 'A non-example environment file is tracked. Move secrets to repository/environment secrets and keep only a sanitized example file in git.',
      category: 'secrets',
    }));
  }

  for (const rule of SECRET_RULES) {
    rule.regex.lastIndex = 0;
    for (const match of text.matchAll(rule.regex)) {
      const around = text.slice(Math.max(0, match.index - 80), Math.min(text.length, match.index + match[0].length + 80)).toLowerCase();
      if (/example|placeholder|fake|dummy|redacted/.test(around)) continue;
      findings.push(finding({
        id: rule.id,
        severity: 'error',
        file: relativePath,
        line: lineNumberForIndex(text, match.index),
        title: `Possible exposed ${rule.name}`,
        message: `High-confidence ${rule.name} format found in a tracked file. Rotate the credential if it is real, remove it from git history where appropriate, and use a secret store instead.`,
        category: 'secrets',
      }));
    }
  }
  return findings;
}

function nodeMap(workflow) {
  return new Map((workflow.nodes || []).map((node) => [node.name, node]));
}

export function looksLikeN8n(value) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.nodes) && value.connections && typeof value.connections === 'object');
}

export function scanN8n(relativePath, workflow) {
  if (!looksLikeN8n(workflow)) return [];
  const findings = [];
  const nodes = workflow.nodes || [];
  const names = new Set();
  const ids = new Set();

  for (const node of nodes) {
    if (!node?.name) {
      findings.push(finding({ id: 'AWG101', severity: 'error', file: relativePath, title: 'n8n node is missing a name', message: 'Every n8n node should have a stable, descriptive name.', category: 'n8n' }));
    } else if (names.has(node.name)) {
      findings.push(finding({ id: 'AWG102', severity: 'error', file: relativePath, title: 'Duplicate n8n node name', message: `Node name "${node.name}" appears more than once. Duplicate names make connections and debugging ambiguous.`, category: 'n8n' }));
    } else {
      names.add(node.name);
    }

    if (node?.id) {
      if (ids.has(node.id)) findings.push(finding({ id: 'AWG103', severity: 'error', file: relativePath, title: 'Duplicate n8n node id', message: `Node id "${node.id}" appears more than once.`, category: 'n8n' }));
      ids.add(node.id);
    }
  }

  const map = nodeMap(workflow);
  for (const [source, branches] of Object.entries(workflow.connections || {})) {
    if (!map.has(source)) {
      findings.push(finding({ id: 'AWG104', severity: 'error', file: relativePath, title: 'Broken n8n connection source', message: `Connection source "${source}" does not match any node name.`, category: 'n8n' }));
    }
    for (const branchGroup of Object.values(branches || {})) {
      for (const branch of Array.isArray(branchGroup) ? branchGroup : []) {
        for (const target of Array.isArray(branch) ? branch : []) {
          if (target?.node && !map.has(target.node)) {
            findings.push(finding({ id: 'AWG105', severity: 'error', file: relativePath, title: 'Broken n8n connection target', message: `Connection target "${target.node}" does not match any node name.`, category: 'n8n' }));
          }
        }
      }
    }
  }

  const webhookNodes = nodes.filter((node) => String(node?.type || '').includes('webhook'));
  for (const node of webhookNodes) {
    if (!node?.parameters?.path) {
      findings.push(finding({ id: 'AWG106', severity: 'error', file: relativePath, title: 'Webhook node has no path', message: `Webhook node "${node.name || '(unnamed)'}" has no explicit path.`, category: 'n8n' }));
    }
  }

  const paths = new Map();
  for (const node of webhookNodes) {
    const webhookPath = node?.parameters?.path;
    if (!webhookPath) continue;
    if (paths.has(webhookPath)) {
      findings.push(finding({ id: 'AWG107', severity: 'error', file: relativePath, title: 'Duplicate webhook path', message: `Webhook path "${webhookPath}" is used by both "${paths.get(webhookPath)}" and "${node.name}".`, category: 'n8n' }));
    } else {
      paths.set(webhookPath, node.name);
    }
  }

  const respondNodes = nodes.filter((node) => String(node?.type || '').includes('respondToWebhook'));
  if (respondNodes.length) {
    for (const node of webhookNodes) {
      if (node?.parameters?.responseMode !== 'responseNode') {
        findings.push(finding({ id: 'AWG108', severity: 'warning', file: relativePath, title: 'Webhook response mode mismatch', message: `Workflow contains a Respond to Webhook node, but webhook "${node.name}" is not configured with responseMode=responseNode.`, category: 'n8n' }));
      }
    }
    for (const node of respondNodes) {
      if (node?.parameters?.options?.responseCode === undefined && node?.parameters?.responseCode === undefined) {
        findings.push(finding({ id: 'AWG109', severity: 'warning', file: relativePath, title: 'Implicit webhook response status', message: `Respond to Webhook node "${node.name}" does not set an explicit response code. Explicit codes make API behavior easier to reason about and test.`, category: 'n8n' }));
      }
    }
  }

  if (workflow.active === true) {
    findings.push(finding({ id: 'AWG110', severity: 'warning', file: relativePath, title: 'Active n8n workflow export', message: 'The exported workflow is marked active. Public/reusable workflow exports are safer when inactive by default.', category: 'n8n' }));
  }

  if (workflow.settings?.executionOrder && workflow.settings.executionOrder !== 'v1') {
    findings.push(finding({ id: 'AWG111', severity: 'warning', file: relativePath, title: 'Legacy n8n execution order', message: `Workflow executionOrder is "${workflow.settings.executionOrder}" instead of "v1". Review whether this is intentional.`, category: 'n8n' }));
  }

  return findings;
}

export function looksLikeOpenApi(value) {
  return Boolean(value && typeof value === 'object' && typeof value.openapi === 'string' && value.paths && typeof value.paths === 'object');
}

export function scanOpenApi(relativePath, spec) {
  if (!looksLikeOpenApi(spec)) return [];
  const findings = [];
  if (!String(spec.openapi).startsWith('3.')) {
    findings.push(finding({ id: 'AWG201', severity: 'error', file: relativePath, title: 'Unsupported OpenAPI version', message: `Expected OpenAPI 3.x, found "${spec.openapi}".`, category: 'openapi' }));
  }

  if (!Array.isArray(spec.servers) || spec.servers.length === 0) {
    findings.push(finding({ id: 'AWG202', severity: 'warning', file: relativePath, title: 'OpenAPI server missing', message: 'Define at least one HTTPS server so tool/action consumers know where the API lives.', category: 'openapi' }));
  } else {
    for (const server of spec.servers) {
      const url = server?.url;
      if (typeof url !== 'string') continue;
      if (!url.startsWith('https://')) {
        findings.push(finding({ id: 'AWG203', severity: 'error', file: relativePath, title: 'Non-HTTPS OpenAPI server', message: `Server URL "${url}" is not HTTPS. Public GPT/tool actions should use HTTPS.`, category: 'openapi' }));
      }
      if (/https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)/i.test(url)) {
        findings.push(finding({ id: 'AWG204', severity: 'error', file: relativePath, title: 'Localhost OpenAPI server', message: `Server URL "${url}" points to localhost and cannot serve a deployed action.`, category: 'openapi' }));
      }
    }
  }

  const ids = new Set();
  let operationCount = 0;
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
  for (const [route, item] of Object.entries(spec.paths || {})) {
    if (!item || typeof item !== 'object') continue;
    for (const [method, operation] of Object.entries(item)) {
      const lower = method.toLowerCase();
      if (!methods.has(lower) || !operation || typeof operation !== 'object') continue;
      operationCount += 1;
      const label = `${lower.toUpperCase()} ${route}`;
      if (!operation.operationId) {
        findings.push(finding({ id: 'AWG205', severity: 'error', file: relativePath, title: 'OpenAPI operationId missing', message: `${label} has no operationId. Stable operation IDs make model tool selection and observability much more reliable.`, category: 'openapi' }));
      } else if (ids.has(operation.operationId)) {
        findings.push(finding({ id: 'AWG206', severity: 'error', file: relativePath, title: 'Duplicate OpenAPI operationId', message: `operationId "${operation.operationId}" is used more than once.`, category: 'openapi' }));
      } else {
        ids.add(operation.operationId);
      }

      if (!operation.summary && !operation.description) {
        findings.push(finding({ id: 'AWG207', severity: 'warning', file: relativePath, title: 'OpenAPI operation lacks guidance', message: `${label} should have a concise summary or description explaining when the tool should be called.`, category: 'openapi' }));
      }

      const effectiveSecurity = operation.security ?? spec.security;
      if (['post', 'put', 'patch', 'delete'].includes(lower) && (effectiveSecurity === undefined || (Array.isArray(effectiveSecurity) && effectiveSecurity.length === 0))) {
        findings.push(finding({ id: 'AWG208', severity: 'warning', file: relativePath, title: 'State-changing operation has no security requirement', message: `${label} has no OpenAPI security requirement. Confirm anonymous mutation is intentional.`, category: 'openapi' }));
      }

      const responses = operation.responses;
      if (!responses || typeof responses !== 'object' || !Object.keys(responses).some((code) => /^2\d\d$/.test(String(code)))) {
        findings.push(finding({ id: 'AWG209', severity: 'warning', file: relativePath, title: 'Success response is undocumented', message: `${label} has no documented 2xx response.`, category: 'openapi' }));
      }
    }
  }

  if (operationCount > 30) {
    findings.push(finding({ id: 'AWG210', severity: 'warning', file: relativePath, title: 'Large action surface', message: `Schema exposes ${operationCount} operations. A smaller action surface is usually easier for models and humans to select correctly.`, category: 'openapi' }));
  }

  return findings;
}

function listTrackedFiles(root, scanPath) {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  const normalizedScan = normalizeSlashes(scanPath === '.' ? '' : scanPath).replace(/\/$/, '');
  return output
    .split('\0')
    .filter(Boolean)
    .map(file => normalizeSlashes(file))
    .filter((file) => !normalizedScan || file === normalizedScan || file.startsWith(`${normalizedScan}/`));
}

function readableTextFile(file) {
  const base = path.basename(file);
  if (base.startsWith('.env')) return true;
  return TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()) || ['Dockerfile', 'Makefile'].includes(base);
}

export function summarize(findings) {
  return findings.reduce((acc, item) => {
    acc.total += 1;
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    acc.categories[item.category] = (acc.categories[item.category] || 0) + 1;
    return acc;
  }, { total: 0, error: 0, warning: 0, categories: {} });
}

export function scanRepository({ root = process.cwd(), scanPath = '.', excludes = '', scanSecrets: doSecrets = true, scanN8n: doN8n = true, scanOpenApi: doOpenApi = true } = {}) {
  const patterns = parseExcludePatterns(excludes);
  const files = listTrackedFiles(root, scanPath).filter((file) => !isExcluded(file, patterns));
  const findings = [];

  for (const relativePath of files) {
    if (!readableTextFile(relativePath)) continue;
    const absolutePath = path.join(root, relativePath);
    let text;
    try {
      text = fs.readFileSync(absolutePath, 'utf8');
    } catch {
      continue;
    }

    if (doSecrets) findings.push(...scanSecrets(relativePath, text));

    if ((doN8n || doOpenApi) && path.extname(relativePath).toLowerCase() === '.json') {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        continue;
      }
      if (doN8n) findings.push(...scanN8n(relativePath, parsed));
      if (doOpenApi) findings.push(...scanOpenApi(relativePath, parsed));
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.id.localeCompare(b.id));
  return { files, findings, summary: summarize(findings) };
}

export function shouldFail(summary, threshold = 'error') {
  const normalized = String(threshold).toLowerCase();
  if (normalized === 'none') return false;
  if (normalized === 'warning') return summary.error > 0 || summary.warning > 0;
  return summary.error > 0;
}
