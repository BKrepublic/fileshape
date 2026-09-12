# Stage 22 ruby near-miss geometry evidence

Stage 22 is a read-only Task 4B evidence checkpoint. It does **not** change production ruby association rules.

## Accepted private corpus result

Stage 22 ran over all 9 PDFs / 5,141 pages and reconciled the same 23,097 candidates and 6,387 unresolved candidates.

```text
UNRESOLVED_REASON_COUNTS={"no-base":5004,"ambiguous-base":577,"noncontiguous-base":792,"missing-glyph-geometry":14}
EXACT_ACTUAL_BASE_ELIGIBILITY={"all-actual-base-eligible":16710}
```

For the 5,004 `no-base` candidates, 3,662 have the nearest body entry at least two body widths away on the side axis. Large additional groups fail axis and inline proximity. Blanket threshold widening is therefore rejected.

A residual 1,204 `no-base` candidates have a nearest body entry that passes every coarse entry-level gate. Their rejection occurs later in production selection, at glyph-cell overlap / annotation coverage / source-contiguity / line-choice logic.

`ambiguous-base` (577) and `noncontiguous-base` (792) are also coarse-eligible as expected and serve as controls. `missing-glyph-geometry` remains isolated at 14 candidates.

## Decision

**Do not widen any production geometry threshold based on Stage 22.**

The next checkpoint must replay the glyph-selection stage read-only and classify the 1,204 coarse-eligible `no-base` cases by exact later-failure mechanism. The replay must reproduce current production status/reason for all candidates as a consistency control.

## Status

**Accepted.** Public CI and complete private corpus evidence both pass. No production ruby rule changed.
