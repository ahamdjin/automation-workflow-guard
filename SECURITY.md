# Security policy

## Reporting a vulnerability

Please do not post real credentials, customer data, private webhook URLs, or exploit details in a public issue.

For ordinary false positives, parsing bugs, and rule-quality issues, open a GitHub Issue using sanitized examples.

For a vulnerability that could expose users of the Action, use GitHub's private vulnerability reporting feature when it is available for this repository.

## Scope

The Action performs local static inspection of tracked repository files. It does not send repository contents to an external service and does not require credentials.

The secret scanner is a guardrail, not a guarantee. Keep GitHub secret scanning, least-privilege workflow permissions, code review, and credential rotation practices in place.
