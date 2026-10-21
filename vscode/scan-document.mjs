import path from 'node:path';
import {
  scanN8n,
  scanOpenApi,
  scanSecrets,
  looksLikeN8n,
  looksLikeOpenApi,
} from '../src/guard.js';

export const MAX_DOCUMENT_BYTES = 512 * 1024;
export const DEFAULT_MAX_WORKSPACE_FILES = 300;

const TEXT_EXTENSIONS = new Set([
  '.json', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.md', '.txt',
  '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.properties',
  '.py', '.rb', '.php', '.go', '.java', '.kt', '.cs', '.xml',
  '.html', '.css', '.sql', '.graphql', '.gql', '.sh', '.bash', '.zsh',
]);

export function shouldScanFile(fileName) {
  const base = path.basename(fileName).toLowerCase();
  if (base === '.env' || base.startsWith('.env.') || base.endsWith('.env')) return true;
  if (base === 'dockerfile' || base === 'makefile') return true;
  return TEXT_EXTENSIONS.has(path.extname(base));
}

export function scanText({ fileName, text, scanSecrets: secrets = true, scanN8n: n8n = true, scanOpenApi: openapi = true }) {
  if (typeof fileName !== 'string' || typeof text !== 'string' || !shouldScanFile(fileName)) return [];
  if (Buffer.byteLength(text, 'utf8') > MAX_DOCUMENT_BYTES) return [];

  const findings = [];
  if (secrets) {
    for (const item of scanSecrets(fileName, text)) {
      if (item.id === 'AWG001') {
        // Unlike the GitHub Action, a VS Code editor cannot assert a file is tracked.
        findings.push({
          ...item,
          severity: 'warning',
          title: 'Potential environment file',
          message: 'This environment-style file may contain credentials. Verify it is excluded from version control; the editor cannot tell whether it is tracked.',
        });
      } else {
        findings.push(item);
      }
    }
  }

  if (path.extname(fileName).toLowerCase() === '.json' && (n8n || openapi)) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // VS Code already provides JSON syntax diagnostics; only inspect valid schemas.
      return findings;
    }
    if (n8n && looksLikeN8n(data)) findings.push(...scanN8n(fileName, data));
    if (openapi && looksLikeOpenApi(data)) findings.push(...scanOpenApi(fileName, data));
  }

  return findings.sort((a, b) => a.line - b.line || a.id.localeCompare(b.id));
}
