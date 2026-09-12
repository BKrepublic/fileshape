# Local verification policy

GitHub Actions is intentionally disabled for this repository.

## Hard rule

- Do **not** add, restore, enable, trigger, re-run, or depend on GitHub Actions workflows.
- `.github/workflows/` is intentionally absent.
- Do **not** use hosted CI status as acceptance evidence.
- Verification is performed locally only, when explicitly needed.
- Re-enabling GitHub Actions requires an explicit user instruction that specifically revokes this rule.

## Local verification

Playwright browser binaries are local prerequisites and are not downloaded implicitly by verification commands. After installing/updating dependencies, install the pinned Chromium once with:

```sh
npm run setup:browser
```

The normal public verification sequence is:

```sh
npm test
npm run verify:runtime-deps
npm run verify:browser
npm run setup:epubcheck
npm run verify:epubcheck
git diff --check
```

If `verify:browser` reports a missing Playwright executable, run `npm run setup:browser` locally and retry. Do not replace that prerequisite with hosted CI.

Private-corpus checks remain local-only and must never commit private PDFs, generated private EPUBs, or local reports.

This policy exists to prevent accidental use of billable hosted compute. A future agent must preserve it unless the user explicitly changes the policy.
