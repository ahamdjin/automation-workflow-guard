'use strict';

const vscode = require('vscode');

const COLLECTION_NAME = 'Automation Workflow Guard';
const DEBOUNCE_MS = 450;
const MAX_DIAGNOSTICS_PER_FILE = 150;
const SCAN_EXCLUDE = '**/{node_modules,dist,build,coverage,.git,.next,.venv,venv,vendor}/**';

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection(COLLECTION_NAME);
  const pending = new Map();
  // The extension package bundles the audited source scanner; nothing is fetched at runtime.
  const scannerPromise = import('./dist/scan-document.mjs');

  context.subscriptions.push(diagnostics, {
    dispose() {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    },
  });

  function settings(uri) {
    const config = vscode.workspace.getConfiguration('automationWorkflowGuard', uri);
    return {
      scanOnChange: config.get('scanOnChange', true),
      scanSecrets: config.get('scanSecrets', true),
      scanN8n: config.get('scanN8n', true),
      scanOpenApi: config.get('scanOpenApi', true),
      maxWorkspaceFiles: config.get('maxWorkspaceFiles', 300),
    };
  }

  function cancelScheduled(uri) {
    const key = uri.toString();
    const timer = pending.get(key);
    if (timer) clearTimeout(timer);
    pending.delete(key);
  }

  function asDiagnostics(findings, text) {
    const maxLine = Math.max(0, text.split('\n').length - 1);
    return findings.slice(0, MAX_DIAGNOSTICS_PER_FILE).map((item) => {
      const line = Math.max(0, Math.min(maxLine, (Number(item.line) || 1) - 1));
      const row = text.split('\n')[line] || '';
      const end = Math.max(1, Math.min(100, row.length));
      const range = new vscode.Range(line, 0, line, end);
      const severity = item.severity === 'error'
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning;
      const diagnostic = new vscode.Diagnostic(range, item.title + ': ' + item.message, severity);
      diagnostic.source = COLLECTION_NAME;
      diagnostic.code = item.id;
      return diagnostic;
    });
  }

  async function inspect(uri, text, options) {
    const { scanText, shouldScanFile } = await scannerPromise;
    if (uri.scheme !== 'file' || !shouldScanFile(uri.fsPath)) {
      diagnostics.delete(uri);
      return [];
    }
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    const findings = scanText({ fileName: relativePath, text, ...options });
    diagnostics.set(uri, asDiagnostics(findings, text));
    return findings;
  }

  async function scanDocument(document) {
    if (document.uri.scheme !== 'file') return [];
    const originalVersion = document.version;
    const { scanSecrets, scanN8n, scanOpenApi } = settings(document.uri);
    try {
      const { scanText, shouldScanFile } = await scannerPromise;
      if (!shouldScanFile(document.uri.fsPath)) {
        diagnostics.delete(document.uri);
        return [];
      }
      const contents = document.getText();
      const findings = scanText({
        fileName: vscode.workspace.asRelativePath(document.uri, false),
        text: contents,
        scanSecrets, scanN8n, scanOpenApi,
      });
      if (document.version === originalVersion) {
        diagnostics.set(document.uri, asDiagnostics(findings, contents));
      }
      return findings;
    } catch (error) {
      vscode.window.showWarningMessage('Automation Workflow Guard could not scan this file: ' + error.message);
      return [];
    }
  }

  function schedule(document) {
    if (document.uri.scheme !== 'file') return;
    cancelScheduled(document.uri);
    if (!settings(document.uri).scanOnChange) return;
    const key = document.uri.toString();
    pending.set(key, setTimeout(() => {
      pending.delete(key);
      void scanDocument(document);
    }, DEBOUNCE_MS));
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(({ document }) => schedule(document)),
    vscode.workspace.onDidSaveTextDocument((document) => {
      cancelScheduled(document.uri);
      void scanDocument(document);
    }),
    vscode.workspace.onDidOpenTextDocument((document) => void scanDocument(document)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      cancelScheduled(document.uri);
      diagnostics.delete(document.uri);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('automationWorkflowGuard')) return;
      diagnostics.clear();
      for (const document of vscode.workspace.textDocuments) void scanDocument(document);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('automationWorkflowGuard.scanCurrentFile', async () => {
      const document = vscode.window.activeTextEditor?.document;
      if (!document) {
        vscode.window.showInformationMessage('Open a file to scan it.');
        return;
      }
      const results = await scanDocument(document);
      vscode.window.showInformationMessage(
        'Automation Workflow Guard: ' + results.length + ' finding(s) in current file.',
      );
    }),
    vscode.commands.registerCommand('automationWorkflowGuard.scanWorkspace', async () => {
      if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showInformationMessage('Open a folder or workspace to scan.');
        return;
      }
      const { shouldScanFile, MAX_DOCUMENT_BYTES } = await scannerPromise;
      const max = Math.min(2000, Math.max(25, Number(settings().maxWorkspaceFiles) || 300));
      const uris = await vscode.workspace.findFiles('**/*', SCAN_EXCLUDE, max + 1);
      const limitReached = uris.length > max;
      let scanned = 0;
      let findings = 0;
      let skipped = 0;
      diagnostics.clear();

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Automation Workflow Guard: scanning workspace',
        cancellable: true,
      }, async (progress, token) => {
        for (const uri of uris.slice(0, max)) {
          if (token.isCancellationRequested) break;
          if (uri.scheme !== 'file' || !shouldScanFile(uri.fsPath)) continue;
          try {
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.size > MAX_DOCUMENT_BYTES) { skipped += 1; continue; }
            const open = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
            const text = open
              ? open.getText()
              : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            const config = settings(uri);
            const found = await inspect(uri, text, config);
            findings += found.length;
            scanned += 1;
            if (scanned % 25 === 0) progress.report({ message: scanned + ' files scanned' });
          } catch {
            skipped += 1;
          }
        }
      });
      const suffix = limitReached ? ' File limit reached: narrow your workspace or increase the configured limit.' : '';
      vscode.window.showInformationMessage(
        'Automation Workflow Guard: ' + findings + ' finding(s) in ' + scanned +
        ' file(s); ' + skipped + ' skipped.' + suffix,
      );
    }),
  );

  for (const document of vscode.workspace.textDocuments) {
    void scanDocument(document);
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
