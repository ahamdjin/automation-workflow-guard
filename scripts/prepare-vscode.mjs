import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionRoot = path.join(root, 'vscode');
const dist = path.join(extensionRoot, 'dist');

await mkdir(dist, { recursive: true });

const guard = await readFile(path.join(root, 'src/guard.js'), 'utf8');
await writeFile(path.join(dist, 'guard.mjs'), guard, 'utf8');

const adapter = await readFile(path.join(extensionRoot, 'scan-document.mjs'), 'utf8');
const sourceImport = "from '../src/guard.js'";
if (!adapter.includes(sourceImport)) throw new Error('Cannot locate scanner import to bundle');
await writeFile(
  path.join(dist, 'scan-document.mjs'),
  adapter.replace(sourceImport, "from './guard.mjs'"),
  'utf8',
);

await copyFile(path.join(root, 'LICENSE'), path.join(extensionRoot, 'LICENSE'));
console.log('VS Code packaging files prepared from the current Automation Workflow Guard scanner.');
