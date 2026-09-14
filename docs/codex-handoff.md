# Codex continuation handoff

This file is the concise continuation point for autonomous FileShape work. Read this together with `docs/genericity-heuristic-audit.md` and `docs/local-verification-policy.md` before changing code.

## Repository / branch

- Repository: `BKrepublic/fileshape`
- Local workdir: `/data/experiment/fileshape`
- Working branch: `fix/generic-corpus-reflow`
- Last locally verified code checkpoint: `03100035408c9c2a6bf48e16d4ab65e6dd6b92dd`
- At that checkpoint:
  - focused layout-clustering / flow / physical-layout / genericity-metamorphic tests: PASS
  - unit suite: `333/333 PASS`
  - semantic verification: PASS
  - branch/worktree clean and aligned with origin
- Commits after `031000...` at handoff time are documentation-only. The production/test code state remains the locally verified state unless Codex changes it.

Before work, synchronize the local checkout with origin using fish-compatible commands. Do not repeat already-closed engineering stages merely because the documentation commit is newer than the locally verified code checkpoint.

## Absolute policy constraints

- GitHub Actions are absolutely forbidden. Do not add, restore, run, rerun, inspect, query, fetch, or depend on Actions workflows, runs, jobs, logs, artifacts, statuses, or checks.
- Do not use hosted CI or paid compute. Verification is local on the user's machine only.
- `.github/workflows/` is intentionally absent. `docs/local-verification-policy.md` is authoritative.
- Never upload private PDFs, `local-samples`, or `local-reports`.
- Do not relax parser/ruby/image/nav/serialization acceptance rules.
- Never weaken tests or expected output merely to make verification green.
- Shell commands must be fish-compatible. Never include `exit`, `or exit`, `&& exit`, or anything that can terminate the user's interactive shell.
- The local nine-PDF / 5,141-page set is diagnostic regression evidence only, not the product domain. Never tune production inference to filenames, titles, known works, page numbers, sample IDs, or linguistic content from those files.
- Production inference may use only source-observable generic evidence such as geometry/transforms, relative font/style distributions, page dimensions, line/column pitch, whitespace/gap distributions, recurrence, document context, resolved PDF outline destinations, and exact source provenance.
- Ruby exact association stays fail-closed. Do not loosen exact provenance rules to increase apparent coverage.
- Metric-backed orientation decisions remain immutable; document context may resolve only genuinely unknown pages under the existing evidence rules.

## Current architecture already closed

Do not redo these stages unless a new regression proves a real defect:

- exact ruby source/provenance association and hidden unresolved provenance
- geometry-first reading order and vertical glyph tie ordering
- shared orientation evidence and document-context resolution
- attached-run orientation as compact evidence rather than a hard local label
- geometry-only cross-page continuation
- centralized scale-aware margin measurement plus document-level recurrence
- source outline and inferred headings coexist
- multiple headings on one source page survive XHTML/NAV/NCX
- logical XHTML grouping is not one physical PDF page per resource
- mixed-orientation XHTML scoping
- body-font compact evidence plus conservative document prior
- semantic-boundary compact evidence
- heading-family support/share/margin/ratio evidence
- ruby geometry perturbation coverage
- attached-run/orientation threshold and perturbation coverage
- layout-clustering scale/translation/boundary/metamorphic coverage

See `docs/genericity-heuristic-audit.md` for the exact evidence and remaining B/C debt.

## Latest full diagnostic production checkpoint

The latest production-changing full local verification reported:

- 9/9 verification PDFs PASS
- 5,141/5,141 pages PASS
- detected orientation unknown `5 -> 0`
- `knownRepaired=0`
- `bodyFontPrior=0`
- margin candidates `6272`
- recurring margin suppressions `5947`
- isolated one-off margin candidates retained `325`

Do not rerun the full nine-PDF quality set for test-only or documentation-only changes. Run it once when production behavior/output changes materially or a broader regression requires it.

## Immediate engineering target

Continue from the open B/C debt in `docs/genericity-heuristic-audit.md`.

### 1. Spacing evidence first

Inspect `src/spacing-evidence.ts` and all consumers. The current empirical constants include the ordinary-spacing fallback and paragraph-gap multipliers (`1.65`, `1.55`, `1.25`) plus minimum-gap handling.

First add behavior-preserving focused coverage. Do not change constants merely because they look arbitrary.

Required coverage should include, where applicable:

- uniform scale invariance
- translation invariance where coordinates are involved
- sparse evidence provenance (`distribution`, `font-fallback`, `single-observation`, `none`)
- exact inclusive/strict boundary behavior
- small spacing perturbations around current thresholds
- paragraph-gap decisions preserving the same normalized relation under uniform scale
- one observation must never silently become a distribution

If a new test exposes an unexpected boundary, diagnose whether it is a fixture/math artifact or a real production defect before changing production code.

### 2. Then serialization grouping budgets

After spacing evidence is locally green, inspect logical XHTML grouping / estimated serialization-size thresholds. Preserve these invariants:

- grouping is driven by logical/serialization constraints, not physical PDF pagination
- equivalent logical content moved across source-page boundaries should not create arbitrary resource structure changes
- blank/image-only page behavior stays explicit
- existing NAV/NCX/source-page anchor guarantees stay intact

Again, add evidence/boundary/metamorphic coverage before calibrating constants.

## Verification discipline

For evidence/test-only changes, normally run:

1. `npm run typecheck`
2. focused tests for the changed area plus its direct consumers
3. `npm test`
4. `npm run verify:semantic`
5. `git diff --check`
6. `git status --short --branch`

Keep user-facing verification output short on success. Show detailed logs only for failures.

If production behavior changes, additionally run the relevant focused production tests and then the full local nine-PDF quality verification once. Never claim a local PASS that the user has not actually run.

## Working method

Do real repository work, not explanation-only planning. Inspect code, make the smallest generic change justified by source evidence, add invariant/metamorphic tests, commit to `fix/generic-corpus-reflow`, and continue to the next justified debt item after local verification. Keep threshold tuning separate from evidence plumbing and never tune against the diagnostic PDFs.
