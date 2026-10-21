import test from 'node:test';
import assert from 'node:assert/strict';
import { scanText, shouldScanFile, MAX_DOCUMENT_BYTES } from '../vscode/scan-document.mjs';

test('scans recognized n8n exports with original AWG rule IDs', () => {
  const workflow = {
    name: 'Demo webhook',
    nodes: [{ id: 'one', name: 'Webhook', type: 'n8n-nodes-base.webhook', parameters: {} }],
    connections: {},
    active: true,
  };
  const results = scanText({ fileName: 'workflows/new-lead.json', text: JSON.stringify(workflow) });
  assert.ok(results.some((item) => item.id === 'AWG106'));
  assert.ok(results.some((item) => item.id === 'AWG110'));
});

test('does not confuse ordinary JSON with workflow or OpenAPI', () => {
  const results = scanText({ fileName: 'package.json', text: '{"scripts":{"test":"node --test"}}' });
  assert.equal(results.length, 0);
});

test('reports OpenAPI issues without running a network call', () => {
  const spec = { openapi: '3.0.0', servers: [{ url: 'http://localhost:8000' }], paths: { '/events': { post: { responses: { '400': {} } } } } };
  const results = scanText({ fileName: 'openapi.json', text: JSON.stringify(spec) });
  assert.ok(results.some((item) => item.id === 'AWG203'));
  assert.ok(results.some((item) => item.id === 'AWG204'));
  assert.ok(results.some((item) => item.id === 'AWG205'));
});

test('editor cannot falsely assert a local env file is tracked', () => {
  const results = scanText({ fileName: 'server/.env.production', text: 'KEY=fictional' });
  const env = results.find((item) => item.id === 'AWG001');
  assert.equal(env.severity, 'warning');
  assert.match(env.message, /cannot tell whether it is tracked/);
});

test('finds synthetic secret formats but never includes token in finding text', () => {
  const token = ['sk', 'T'.repeat(28)].join('-');
  const findings = scanText({ fileName: 'notes.txt', text: 'credential=' + token });
  assert.ok(findings.some((item) => item.id === 'AWG003'));
  assert.ok(findings.every((item) => !JSON.stringify(item).includes(token)));
});

test('honors disabled scanners and refuses unsupported or oversized files', () => {
  const workflow = JSON.stringify({ nodes: [{ name: 'W', type: 'n8n-nodes-base.webhook', parameters: {} }], connections: {} });
  assert.deepEqual(scanText({ fileName: 'a.json', text: workflow, scanSecrets: false, scanN8n: false, scanOpenApi: false }), []);
  assert.deepEqual(scanText({ fileName: 'diagram.png', text: workflow }), []);
  assert.deepEqual(scanText({ fileName: 'a.json', text: ' '.repeat(MAX_DOCUMENT_BYTES + 1) }), []);
  assert.equal(shouldScanFile('Dockerfile'), true);
  assert.equal(shouldScanFile('photo.jpg'), false);
});

test('ignores invalid JSON because VS Code provides JSON syntax checking', () => {
  assert.deepEqual(scanText({ fileName: 'workflow.json', text: '{"nodes":' }), []);
});
