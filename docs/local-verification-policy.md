# Local verification policy

GitHub Actions is intentionally disabled for this repository.

## Hard rule

- Do **not** add, restore, enable, trigger, re-run, or depend on GitHub Actions workflows.
- `.github/workflows/` is intentionally absent.
- Do **not** use hosted CI status as acceptance evidence.
- Verification is performed locally only, when explicitly needed.
- Re-enabling GitHub Actions requires an explicit user instruction that specifically revokes this rule.

## Local verification

Browser verification may use a locally installed Chromium/Chrome executable through `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. The current accepted development environment uses system Chrome at `/usr/bin/google-chrome-stable`; Playwright-managed Chromium is not required and should not be downloaded merely to run FileShape verification.

For the current environment, run browser verification with:

```sh
env PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome-stable npm run verify:browser
```

The normal public verification sequence is:

```sh
npm test
npm run verify:runtime-deps
env PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome-stable npm run verify:browser
npm run setup:epubcheck
npm run verify:epubcheck
git diff --check
```

If a different local machine has no compatible system Chromium/Chrome, a Playwright-managed browser may be installed locally as an explicit developer choice. Never replace a missing local browser prerequisite with hosted CI.

Private-corpus checks remain local-only and must never commit private PDFs, generated private EPUBs, or local reports. On the current environment, private browser verification also uses the same `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override.

This policy exists to prevent accidental use of billable hosted compute. A future agent must preserve it unless the user explicitly changes the policy.
