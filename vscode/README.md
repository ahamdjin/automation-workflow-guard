# Automation Workflow Guard for VS Code

**[Install from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=AhmadYar.automation-workflow-guard)** · Publisher: `AhmadYar` · Version: `0.1.0`

**Catch n8n workflow and OpenAPI mistakes while you edit.** A free, local-only extension by [Ahmad Yar](https://www.ahmadyar.co/), built on the same open-source rule engine as the [Automation Workflow Guard GitHub Action](https://github.com/ahamdjin/automation-workflow-guard).

The extension checks the current file and optionally scans a workspace. Findings show up as rule-coded VS Code diagnostics in the **Problems** panel. No account, API key, LLM, or hosted service is required.

## Features

- **n8n JSON:** duplicate node names or IDs, missing webhook paths, broken connections, active exports, response mismatch warnings.
- **OpenAPI JSON:** non-HTTPS or localhost servers, missing or duplicate operation IDs, undocumented success responses, missing security requirements.
- **Secrets hygiene:** recognizable token formats and environment-like files; never uploads file content.
- **Inline feedback:** scans when files are opened/saved and debounces changes; also provides **Scan Current File** and **Scan Workspace** commands.
- **Shared rule IDs:** diagnostics use `AWG...` codes so you can cross-reference [the rule catalog](https://github.com/ahamdjin/automation-workflow-guard/blob/main/docs/rules.md).

## Use

1. Open an n8n workflow export (`.json`) or an OpenAPI 3.x JSON file.
2. Open **View → Problems** to see findings. The extension also checks common text files for recognizable credential formats.
3. Open the Command Palette (`Ctrl/Cmd+Shift+P`) and run **Automation Workflow Guard: Scan Current File** or **Automation Workflow Guard: Scan Workspace**.

### Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `automationWorkflowGuard.scanOnChange` | `true` | Debounced scans while editing (saved files always scan) |
| `automationWorkflowGuard.scanSecrets` | `true` | Pattern-based credential warnings |
| `automationWorkflowGuard.scanN8n` | `true` | n8n JSON export checks |
| `automationWorkflowGuard.scanOpenApi` | `true` | OpenAPI JSON checks |
| `automationWorkflowGuard.maxWorkspaceFiles` | `300` | Bound on files enumerated during a manual workspace scan |

## Design and limitations

The extension only reads local editor/workspace files; it performs **no HTTP calls or telemetry**. A scan does not execute a workflow or change any file. Each file is bounded to **512 KiB**; manual workspace scans examine at most 300 files by default (configurable). Common build/dependency directories are excluded.

- JSON formats only for n8n and OpenAPI: YAML OpenAPI isn't parsed as a schema (although text secret heuristics still run).
- Secret checks are **high-confidence patterns, not comprehensive detection**. A clean report does not prove security.
- Environment-style files produce a **warning**, not a claim that the file is tracked in Git. Only the GitHub Action can make the latter determination.
- Some structural findings refer to the document's first line because the underlying semantic scanner reports a rule-level location, not a token range.
- `Scan Workspace` uses the VS Code file enumerator and may not reach every file in a very large workspace. See the notification for skipped and bounded scans.
- It does not connect to n8n, Dify, automation accounts, or any user's private APIs.

## Alternative: install a local test build (.vsix)

Use **Extensions → ⋯ → Install from VSIX…** and select the `.vsix` file from the [CI workflow artifacts](https://github.com/ahamdjin/automation-workflow-guard/actions/workflows/test.yml), or create it locally using the instructions below.

## Build from source

Requires Node.js 22+ for the packaging tool.

```bash
git clone https://github.com/ahamdjin/automation-workflow-guard.git
cd automation-workflow-guard
npm run validate
npm run prepare:vscode
cd vscode
npx --yes @vscode/vsce@4.0.0 package --no-dependencies
```

The source code under `src/guard.js` is automatically copied into the distributable at build time. It is not maintained twice. `vscode:prepublish` prepares the code whenever the extension is packaged. To debug, open the repo in VS Code and use **Extension Development Host** with `vscode/` as the extension root, or install the generated VSIX.

## Support

[Report an issue](https://github.com/ahamdjin/automation-workflow-guard/issues) · [Full source and rule catalog](https://github.com/ahamdjin/automation-workflow-guard) · [Ahmad Yar portfolio](https://www.ahmadyar.co/work/open-source)

Apache-2.0 licensed. This is a preventive editor check, **not** a substitute for reviews, tests, production monitoring, or a professional security audit.
