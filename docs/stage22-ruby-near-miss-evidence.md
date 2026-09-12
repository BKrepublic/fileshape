# Stage 22 ruby near-miss geometry evidence

Stage 22 is a read-only Task 4B evidence checkpoint. It does **not** change production ruby association rules.

## Why this exists

Stage 21 reconciled all 23,097 ruby candidates and showed that 6,387 remain unresolved. The dominant group is 5,004 `no-base` candidates. Before touching `ruby-spans.ts`, Stage 22 measures the nearest body geometry and records which coarse production gate would reject it.

## Command

```text
npm run inspect:ruby-near-miss -- local-samples \
  --output local-reports/<NEW_FILE>.json \
  --expect-pdf-count 9 \
  --expect-page-count 5141 \
  --expect-unresolved-count 6387
```

The report is local-only and contains no source text.

## Measured gates

For each candidate with usable annotation glyph geometry, body text entries are evaluated against the same coarse structural boundaries used by production association logic:

- axis alignment;
- body skew;
- annotation/base cross-size ratio (`0.35 <= ratio < 0.75`);
- signed side distance (`0.45 <= distance/body-size <= 1.35`);
- inline proximity (gap no greater than half a body-size).

The nearest entry is diagnostic evidence only. It is **not** declared to be the linguistic base.

For exact candidates, the tool records whether the already-selected source-backed base entries satisfy these coarse entry-level gates. This is a control population for detecting a broken diagnostic model.

## Accepted private corpus result

Stage 22 ran over all 9 PDFs / 5,141 pages and reconciled the same 23,097 candidates and 6,387 unresolved candidates.

```text
UNRESOLVED_REASON_COUNTS={"no-base":5004,"ambiguous-base":577,"noncontiguous-base":792,"missing-glyph-geometry":14}
EXACT_ACTUAL_BASE_ELIGIBILITY={"all-actual-base-eligible":16710}
```

The exact control is clean: all 16,710 accepted exact candidates have their actual base entries inside the coarse gate model.

For the 5,004 `no-base` candidates:

```text
NO_BASE_NEAREST_GATE_COUNTS:
  eligible                                      1204
  axis-mismatch+side-too-far                    1449
  inline-too-far+side-too-far                   1010
  axis-mismatch+inline-too-far+side-too-far      711
  side-too-far                                   501
  remaining signatures                           129

NO_BASE_CROSS_DISTANCE_BUCKETS:
  0.45-1.35  1207
  >=2.00     3662
  other        135

NO_BASE_INLINE_GAP_BUCKETS:
  overlap       2795
  >0-0.50        394
  >0.50-1.00     725
  >1.00         1090
```

This splits the population decisively. Most `no-base` candidates are not near a single threshold; 3,662 have the nearest coarse body entry at least two body widths away on the side axis, and large groups also fail axis and inline proximity. These are **not** candidates for a blanket threshold widening.

However, 1,204 `no-base` candidates have a nearest body entry that passes every coarse entry-level gate. Their failure must occur later in production selection, at glyph-cell overlap / annotation coverage / source-contiguity / line-choice logic, not at the coarse entry gate.

`ambiguous-base` (577) and `noncontiguous-base` (792) both show a coarse nearest `eligible` entry for every candidate, as expected. `missing-glyph-geometry` remains isolated at 14 candidates with no usable annotation geometry.

## Decision

**Do not widen any production geometry threshold based on Stage 22.** The evidence does not support it.

The next checkpoint must replay the glyph-selection stage read-only and classify the 1,204 coarse-eligible `no-base` cases by the exact later failure: no glyph cell selected, boundary uncertainty, annotation overhang, non-contiguous source, or competing line/choice. The replay must reproduce the current production status/reason for all candidates as a consistency control.

## Privacy / invariants

- no source text or private filename is written to the report;
- no OCR, dictionary, filename, font-name, metadata, or character-specific rule;
- no production thresholds change in Stage 22;
- candidate identity remains source-range based via the accepted Stage 21 inventory contract;
- private reports stay outside Git.

## Status

**Accepted.** Public CI passed and the complete private corpus reconciled with the accepted Stage 21 counts. Stage 22 is evidence only; it makes no claim that any unresolved candidate should be promoted.
