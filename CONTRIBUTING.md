# Contributing

Contributions should improve a real automation failure mode without turning the scanner into a noisy keyword matcher.

A new rule should include:

1. a stable rule ID;
2. a clear error or warning severity;
3. an actionable message;
4. at least one safe test case;
5. at least one failing test case;
6. documentation in `docs/rules.md`;
7. no real secrets or customer data in fixtures.

Run before opening a pull request:

```bash
npm run validate
```

The project intentionally has no runtime dependencies. Add one only when the maintenance and supply-chain cost is clearly justified.
