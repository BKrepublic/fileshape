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

## Aggregate reconciliation

The corpus report reconciles:

- candidate / exact / unresolved totals;
- all current reason counts;
- unresolved reason counts;
- orientation and rotation counts;
- annotation geometry/glyph-mapping evidence counts;
- base-alternative buckets `0`, `1`, `2+`;
- structural feature buckets combining reason/orientation/rotation/evidence/alternatives/page glyph issues;
- source-integrity issues;
- unknown reason count.

Every annotation/base/alternative source range is checked against the inspected source text-item boundaries. A source-integrity issue or unknown reason makes the command fail instead of silently dropping that candidate.

## Non-goals

- no OCR or language meaning is used;
- no filename, font name, character appearance, website or metadata rule is added;
- no unresolved candidate is promoted to exact;
- no thresholds in `ruby-spans.ts` change in this checkpoint;
- no private text, PDF, generated EPUB or local JSON report is committed.

## Public validation

Focused tests cover exact, ambiguous, missing-glyph, stable candidate identity, source-range integrity and aggregate reconciliation. Standard repository `npm test` must remain green.

## Private acceptance

Stage 21 is accepted only after the complete private corpus produces:

- 9 PDFs;
- 5,141 pages scanned exactly once each;
- exactly 6,387 unresolved candidates, matching the accepted EPUB preservation count;
- zero source-integrity issues;
- zero unknown reasons;
- a complete reason/feature distribution whose counts reconcile to the candidate totals.

After that evidence is recorded, select the first Task 4B improvement target by prevalence and structural reproducibility. Do not choose a rule merely because it reduces the unresolved count the most.
