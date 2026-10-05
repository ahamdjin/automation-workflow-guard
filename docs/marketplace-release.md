# Marketplace release process

The repository is structured as one root-level GitHub Action, which is the format GitHub Marketplace expects.

## First release

After `main` is green:

1. Open `action.yml` on GitHub.
2. Use the Marketplace publishing banner to draft a release, or open **Releases → Draft a new release**.
3. Use tag `v1.0.0` and target `main`.
4. Select **Publish this Action to the GitHub Marketplace**.
5. If prompted, accept the GitHub Marketplace Developer Agreement.
6. Suggested primary category: **Utilities**.
7. Suggested secondary category: **Security** (if GitHub offers it in the current category list).
8. Publish the release.

The Marketplace name comes from `action.yml`:

`Automation Workflow Guard by Ahmad Yar`

GitHub requires the Marketplace action name to be unique. If GitHub flags the name at release time, change only the `name` field to a more specific variant and rerun CI before releasing.

## Version aliases

Users generally prefer a stable major tag such as:

```yaml
uses: ahamdjin/automation-workflow-guard@v1
```

Keep `v1` pointed at the latest compatible `v1.x.x` release. Do not move immutable release tags such as `v1.0.0`.
