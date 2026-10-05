# Rule catalog

Automation Workflow Guard deliberately starts with rules that are deterministic and easy to explain.

| Rule | Severity | Area | Meaning |
| --- | --- | --- | --- |
| AWG001 | error | secrets | Non-example `.env*` file is tracked. |
| AWG003 | error | secrets | High-confidence secret/token/private-key pattern found. |
| AWG101 | error | n8n | Node is missing a stable name. |
| AWG102 | error | n8n | Duplicate node name. |
| AWG103 | error | n8n | Duplicate node ID. |
| AWG104 | error | n8n | Connection source points to a missing node. |
| AWG105 | error | n8n | Connection target points to a missing node. |
| AWG106 | error | n8n | Webhook node has no explicit path. |
| AWG107 | error | n8n | Duplicate webhook path in one workflow. |
| AWG108 | warning | n8n | Respond-to-webhook node exists but webhook is not in `responseNode` mode. |
| AWG109 | warning | n8n | Respond-to-webhook status code is implicit. |
| AWG110 | warning | n8n | Exported reusable workflow is marked active. |
| AWG111 | warning | n8n | Non-`v1` execution order is explicitly configured. |
| AWG201 | error | OpenAPI | OpenAPI document is not 3.x. |
| AWG202 | warning | OpenAPI | No server is defined. |
| AWG203 | error | OpenAPI | Server URL is not HTTPS. |
| AWG204 | error | OpenAPI | Server points to localhost. |
| AWG205 | error | OpenAPI | Operation has no `operationId`. |
| AWG206 | error | OpenAPI | Duplicate `operationId`. |
| AWG207 | warning | OpenAPI | Operation has no summary/description. |
| AWG208 | warning | OpenAPI | State-changing operation declares no security requirement. |
| AWG209 | warning | OpenAPI | Operation has no documented 2xx response. |
| AWG210 | warning | OpenAPI | Schema exposes more than 30 operations. |

## Severity model

**Errors** represent structural defects, deployability problems, or high-confidence sensitive-data mistakes that are reasonable to block by default.

**Warnings** represent practices that need human review because there are valid exceptions.

Set `fail-on: warning` for a strict repository, `fail-on: error` for the default balanced mode, or `fail-on: none` during adoption.

## Current limitations

- OpenAPI semantic checks currently parse JSON documents. YAML files still receive secret scanning but not OpenAPI structure checks.
- Secret detection is intentionally narrow. Use GitHub secret scanning or another dedicated secret scanner for comprehensive coverage.
- n8n validation is static. It cannot prove that a workflow imports or executes successfully in a live n8n instance.
- A declared OpenAPI security requirement does not prove the backend implements authentication correctly.
- The scanner does not execute arbitrary workflow/code content.

The project favors low false-positive deterministic checks over pretending static rules can fully validate production automation.
