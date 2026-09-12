# Local verification policy

GitHub Actions is intentionally disabled for this repository.

## Hard rule

- Do **not** add, restore, enable, trigger, re-run, or depend on GitHub Actions workflows.
- `.github/workflows/` is intentionally absent.
- Do **not** use hosted CI status as acceptance evidence.
- Verification is performed locally only, when explicitly needed.
- Re-enabling GitHub Actions requires an explicit user instruction that specifically revokes this rule.

## Local verification

The normal public verification sequence is:

```sh
npm test
npm run verify:runtime-deps
npm run verify:browser
npm run setup:epubcheck
npm run verify:epubcheck
git diff --check
```

Private-corpus checks remain local-only and must never commit private PDFs, generated private EPUBs, or local reports.

This policy exists to prevent accidental use of billable hosted compute. A future agent must preserve it unless the user explicitly changes the policy.
