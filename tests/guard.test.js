import test from 'node:test';
import assert from 'node:assert/strict';
import { globToRegex, parseExcludePatterns, isExcluded, scanSecrets, scanN8n, scanOpenApi, looksLikeN8n, looksLikeOpenApi, shouldFail, summarize } from '../src/guard.js';

test('glob patterns handle recursive directories', () => {
  assert.equal(globToRegex('dist/**').test('dist/index.js'), true);
  assert.equal(globToRegex('**/*.min.js').test('assets/app.min.js'), true);
  assert.equal(globToRegex('src/*.js').test('src/deep/app.js'), false);
});

test('exclude parsing supports comma and newline separators', () => {
  const patterns = parseExcludePatterns('dist/**,coverage/**\nfixtures/**');
  assert.equal(isExcluded('dist/index.js', patterns), true);
  assert.equal(isExcluded('src/index.js', patterns), false);
});

test('tracked env files are errors but examples are allowed', () => {
  assert.equal(scanSecrets('.env', 'NAME=value').some((x) => x.id === 'AWG001'), true);
  assert.equal(scanSecrets('.env.example', 'NAME=value').some((x) => x.id === 'AWG001'), false);
});

test('placeholder-looking token examples are ignored', () => {
  const fake = 'placeholder sk-abcdefghijklmnopqrstuvwxyz1234567890';
  assert.equal(scanSecrets('README.md', fake).length, 0);
});

test('private key material is flagged', () => {
  const findings = scanSecrets('server.pem', '-----BEGIN PRIVATE KEY-----\nabc');
  assert.equal(findings[0].id, 'AWG003');
});

test('n8n workflow recognition requires nodes and connections', () => {
  assert.equal(looksLikeN8n({ nodes: [], connections: {} }), true);
  assert.equal(looksLikeN8n({ nodes: [] }), false);
});

test('safe n8n workflow has no findings', () => {
  const workflow = {
    active: false,
    settings: { executionOrder: 'v1' },
    nodes: [
      { id: '1', name: 'Hook', type: 'n8n-nodes-base.webhook', parameters: { path: 'hook', responseMode: 'responseNode' } },
      { id: '2', name: 'Reply', type: 'n8n-nodes-base.respondToWebhook', parameters: { options: { responseCode: 200 } } },
    ],
    connections: { Hook: { main: [[{ node: 'Reply', type: 'main', index: 0 }]] } },
  };
  assert.deepEqual(scanN8n('workflow.json', workflow), []);
});

test('n8n broken connections and webhook config are caught', () => {
  const workflow = {
    active: true,
    nodes: [{ id: '1', name: 'Hook', type: 'n8n-nodes-base.webhook', parameters: {} }],
    connections: { Ghost: { main: [[{ node: 'Missing', type: 'main', index: 0 }]] } },
  };
  const ids = scanN8n('workflow.json', workflow).map((x) => x.id);
  assert.ok(ids.includes('AWG104'));
  assert.ok(ids.includes('AWG105'));
  assert.ok(ids.includes('AWG106'));
  assert.ok(ids.includes('AWG110'));
});

test('OpenAPI recognition requires openapi and paths', () => {
  assert.equal(looksLikeOpenApi({ openapi: '3.1.0', paths: {} }), true);
  assert.equal(looksLikeOpenApi({ swagger: '2.0', paths: {} }), false);
});

test('safe OpenAPI schema has no findings', () => {
  const spec = {
    openapi: '3.1.0',
    servers: [{ url: 'https://api.example.com' }],
    paths: { '/x': { get: { operationId: 'getX', summary: 'Get X', responses: { 200: { description: 'ok' } } } } },
  };
  assert.deepEqual(scanOpenApi('openapi.json', spec), []);
});

test('OpenAPI mutation without operation ID/security/success is reported', () => {
  const spec = {
    openapi: '3.1.0',
    servers: [{ url: 'http://localhost:3000' }],
    paths: { '/x': { post: { responses: { 400: { description: 'bad' } } } } },
  };
  const ids = scanOpenApi('openapi.json', spec).map((x) => x.id);
  for (const id of ['AWG203', 'AWG204', 'AWG205', 'AWG207', 'AWG208', 'AWG209']) assert.ok(ids.includes(id));
});

test('summaries and fail thresholds behave predictably', () => {
  const summary = summarize([{ severity: 'warning', category: 'x' }, { severity: 'error', category: 'x' }]);
  assert.equal(summary.total, 2);
  assert.equal(shouldFail(summary, 'error'), true);
  assert.equal(shouldFail({ error: 0, warning: 1 }, 'error'), false);
  assert.equal(shouldFail({ error: 0, warning: 1 }, 'warning'), true);
  assert.equal(shouldFail(summary, 'none'), false);
});
