# Automation Workflow Guard

A dependency-light GitHub Action that catches common automation mistakes before they reach production.

It statically checks **n8n workflow exports**, **OpenAPI/GPT action schemas**, **tracked environment files**, and several **high-confidence secret formats**. Findings appear as native GitHub annotations, in the job summary, and optionally in a JSON report.

No API key. No hosted service. No code leaves the GitHub runner.

## Quick start

```yaml
name: Automation guard

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: ahamdjin/automation-workflow-guard@v1
        with:
          path: .
          fail-on: error
```

The default policy blocks on **errors** while still annotating **warnings**.

## What it catches

### n8n workflow exports

- duplicate node names and IDs;
- connections pointing to missing nodes;
- webhook nodes without explicit paths;
- duplicate webhook paths inside a workflow;
- `Respond to Webhook` / webhook response-mode mismatches;
- implicit response status codes;
- active public/reusable exports;
- legacy execution-order settings.

### OpenAPI / GPT action schemas

For JSON OpenAPI 3.x documents:

- non-HTTPS or localhost servers;
- missing or duplicate `operationId` values;
- operations without useful summaries/descriptions;
- state-changing operations without an OpenAPI security requirement;
- operations without documented 2xx responses;
- unusually broad action surfaces.

This is especially useful for schemas used by GPT Actions, function/tool gateways, or automation APIs.

### Secret and repository hygiene

- tracked `.env` / `.env.production` / `.env.local` style files while allowing `.env.example`, `.env.sample`, and `.env.template`;
- high-confidence GitHub token formats;
- Slack token formats;
- OpenAI-style `sk-...` keys;
- AWS access key IDs;
- private-key headers.

Obvious `example`, `placeholder`, `fake`, `dummy`, and `redacted` contexts are ignored to reduce documentation noise.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `path` | `.` | Repository-relative path to scan. |
| `fail-on` | `error` | `error`, `warning`, or `none`. |
| `report` | `automation-workflow-guard-report.json` | JSON report path. Empty disables report output. |
| `exclude` | `node_modules/**,dist/**,coverage/**,.git/**` | Comma/newline separated glob-like exclusions. |
| `scan-secrets` | `true` | Enable tracked env + secret checks. |
| `scan-n8n` | `true` | Enable n8n JSON checks. |
| `scan-openapi` | `true` | Enable OpenAPI JSON checks. |

## Outputs

- `findings` — total findings;
- `errors` — error findings;
- `warnings` — warning findings;
- `scanned-files` — tracked files considered;
- `report-path` — configured JSON report path.

Example:

```yaml
- id: guard
  uses: ahamdjin/automation-workflow-guard@v1
  with:
    fail-on: warning

- run: echo "${{ steps.guard.outputs.errors }} errors"
```

## JSON report

The Action writes an inspectable report by default:

```json
{
  "files": ["n8n/intake/workflow.json"],
  "findings": [
    {
      "id": "AWG106",
      "severity": "error",
      "file": "n8n/intake/workflow.json",
      "line": 1,
      "title": "Webhook node has no path",
      "category": "n8n"
    }
  ],
  "summary": {
    "total": 1,
    "error": 1,
    "warning": 0
  }
}
```

The report format is intentionally simple so another workflow, PR bot, or agent can consume it.

## Local CLI

The same scanner can run without GitHub Actions:

```bash
node bin/guard.js . --fail-on error --report guard-report.json
```

Disable individual scanners when you only want one layer:

```bash
node bin/guard.js . --no-secrets --no-openapi
```

## Philosophy

Automation repositories often mix API schemas, low-code workflow exports, webhook configuration, and credentials. A normal linter usually understands only one of those surfaces.

Automation Workflow Guard focuses on small deterministic checks that are cheap enough to run on every pull request. It does **not** call an LLM and does not claim to prove a workflow is secure. It is an early CI guardrail, not a replacement for secret scanning, code review, platform permissions, or production testing.

See [docs/rules.md](docs/rules.md) for the current rule catalog and limitations.

## Development

Requires Node.js 22+ for development; GitHub executes the Action on Node.js 24.

```bash
npm run validate
```

The test suite uses Node's built-in test runner and has no runtime dependencies.

## Maintainer

Built and maintained by [Ahmad Yar](https://www.ahmadyar.co/) — AI automation, workflow architecture, integrations, and backend systems.

For bugs and reusable rule ideas, use GitHub Issues. For production automation architecture or implementation work, the maintainer's portfolio has project context and contact details.

## License

Apache License 2.0. See [LICENSE](LICENSE).
