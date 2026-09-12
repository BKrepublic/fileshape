# Stage 21 ruby refinement inventory

Stage 21 is Task 4A only. It inventories the complete current ruby candidate set before any association rule changes.

## Purpose

The accepted EPUB path currently preserves 6,387 unresolved annotation candidates as page notes. Stage 21 does **not** attempt to reduce that number. It establishes a reproducible, privacy-safe baseline that can tell us which structural failure groups are worth investigating without guessing from text content.

## Command

```text
npm run inspect:ruby-refinement -- local-samples \
  --output local-reports/<new-file>.json \
  --expect-pdf-count 9 \
  --expect-page-count 5141 \
  --expect-unresolved-count 6387
```

The output path uses exclusive creation and must be local-only.

## Evidence contract

Each PDF is inspected once with glyph extraction enabled. The report stores no source text. It records:

- full input SHA-256 plus a short anonymous PDF id;
- source page and rotation;
- document-resolved writing orientation;
- stable candidate id derived only from PDF id, page and annotation source ranges;
- exact/unresolved status and current reason;
- annotation/base source ranges and glyph-ref counts;
- number of retained base alternatives;
- annotation glyph-mapping/geometry evidence class;
- annotation font-size ratio to the page body font size;
- page glyph-issue count.

Candidate identity deliberately excludes the current status/reason so a later Task 4 rule can compare the same annotation source before and after refinement.

## Private corpus acceptance

Accepted on 2026-09-12 at `f30cdcb4dba9f178be9209600f77afb757922aa3`:

```text
PDFS=9
PAGES=5141
RUBY_CANDIDATES=23097
EXACT_CANDIDATES=16710
UNRESOLVED_CANDIDATES=6387
UNRESOLVED_REASON_COUNTS={"no-base":5004,"ambiguous-base":577,"noncontiguous-base":792,"missing-glyph-geometry":14}
ORIENTATION_COUNTS={"vertical":23079,"horizontal":18}
ROTATION_COUNTS={"0":23045,"90":52}
ANNOTATION_EVIDENCE_COUNTS={"all-exact-with-geometry":23083,"has-unmapped-glyph-mapping":14}
ALTERNATIVE_BUCKET_COUNTS={"0":6197,"1":16900}
PAGE_GLYPH_ISSUE_CANDIDATES=0
SOURCE_INTEGRITY_ISSUES=0
UNKNOWN_REASON_COUNT=0
```

The dominant unresolved feature is `no-base|vertical|rot0|all-exact-with-geometry|alts:0|page-glyph-clean` with 4,960 candidates. That prevalence is evidence for where to investigate, not evidence that the current threshold is wrong or that those candidates are ruby.

Two large PDF pairs show almost identical structural counts, which makes them useful reproducibility controls, but filename/source-specific branching remains forbidden.

## Interpretation

The inventory rules out several tempting but unsupported shortcuts:

- 6,373/6,387 unresolved candidates already have exact annotation glyph geometry, so blindly improving glyph extraction cannot solve the dominant problem;
- only 14 candidates are `missing-glyph-geometry`, all tied to unmapped glyph mapping;
- no page-level glyph issue is implicated in the dominant unresolved groups;
- most unresolved candidates have zero retained base alternative, so simply choosing among alternatives cannot resolve them;
- the 792 `noncontiguous-base` and 577 `ambiguous-base` candidates must remain separate from the 5,004 `no-base` candidates.

Task 4B therefore starts with a **read-only geometric near-miss analysis** around unresolved annotation groups. It must measure why plausible body candidates fail the current side-distance, inline-overlap, continuity, and uniqueness gates before any production threshold changes are considered.

## Non-goals

- no OCR or language meaning is used;
- no filename, font name, character appearance, website or metadata rule is added;
- no unresolved candidate is promoted to exact in Stage 21;
- no thresholds in `ruby-spans.ts` change in this checkpoint;
- no private text, PDF, generated EPUB or local JSON report is committed.

## Public validation

GitHub Actions CI for the accepted Stage 21 head passed typecheck/unit tests and real EPUBCheck integration.

## Status

**Stage 21 / Task 4A is accepted.**

Next checkpoint: geometry-only near-miss diagnostics for unresolved groups, with particular attention to `no-base` while retaining `ambiguous-base`, `noncontiguous-base`, and `missing-glyph-geometry` as separate control populations. Production association rules must not change until that evidence establishes a generic, source-backed improvement with positive and negative fixtures.
