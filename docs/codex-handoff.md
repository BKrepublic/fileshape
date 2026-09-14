# Codex continuation handoff

This file is the concise continuation point for autonomous FileShape work. Read this together with `docs/genericity-heuristic-audit.md` and `docs/local-verification-policy.md` before changing code.

## Repository / branch

- Repository: `BKrepublic/fileshape`
- Local workdir: `/data/experiment/fileshape`
- Working branch: `fix/generic-corpus-reflow`
- Last locally verified code checkpoint: `813d7dbd986093f0738c317138f4d0e12a1f78a4`
- At that checkpoint:
  - focused continuation / semantic-block / logical-XHTML tests: `25/25 PASS`
  - unit suite: `356/356 PASS`
  - semantic verification: PASS
  - production code unchanged throughout the spacing, serialization-budget, heading-dominance and continuation-edge coverage work
- The worktree was clean at `813d7db...`; the branch was seven local commits ahead of origin before this documentation update.

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
- spacing scale/provenance/minimum-gap/paragraph-threshold boundary coverage
- heading-family support/share/margin/ratio evidence
- heading-family exact `3x` dominance and body-page-padding coverage
- ruby geometry perturbation coverage
- attached-run/orientation threshold and perturbation coverage
- layout-clustering scale/translation/boundary/metamorphic coverage
- logical XHTML soft/hard size-budget, continuation, standalone-page and navigation-anchor coverage
- shared continuation-edge exact-boundary, consumer-agreement and text-independence coverage

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

### Completed evidence-first checkpoints

- Spacing evidence: scale and translation invariance, all sparse provenance states, strict minimum-gap filtering, exact paragraph-threshold branches and consumer comparison semantics; checkpoint `ee270030ca1f668f9a5b1403eb8a7f4d77e307ab`.
- Logical XHTML grouping: soft/hard exact boundaries, small synthetic size perturbations, continuation interaction, pagination-independent redistribution, standalone blank/image-only pages and NAV/NCX/source anchors; checkpoint `c2b42a8747573e4619f71050339b257057b72dd8`.
- Heading-family dominance: inclusive `3x`, nearest integer below, retained competition evidence and unrelated body-page padding; checkpoint `f01268faa41d6da2d49b4f5218ad2d01ae34e7c7`.
- Shared continuation edge: inclusive `0.78`/`0.5`/`0.32`, independent outside perturbations, semantic/XHTML consumer agreement and text-independence; checkpoint `813d7dbd986093f0738c317138f4d0e12a1f78a4`.

### Next evidence-first target

Inspect margin recurrence without changing its current gates first. Lock the conjunction of at least two supporting pages and at least 20% of text-bearing pages, exact normalized clustering bucket boundaries, and invariance to unrelated body-page insertion. Preserve isolated one-off content and shared flow/physical-layout decisions. Do not calibrate against the nine diagnostic PDFs.

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
