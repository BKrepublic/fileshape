# Stage 24 unresolved ruby detail evidence

Stage 24 is the final read-only Task 4B evidence checkpoint after accepted Stages 21–23. It does not change production ruby association rules.

## Accepted private-corpus result

The complete 9-PDF / 5,141-page corpus completed successfully at `9ecfc83e5e34534ca6f695d642808abfbe0fd0b6`.

```text
RUBY_CANDIDATES=23097
EXACT_CANDIDATES=16710
UNRESOLVED_CANDIDATES=6387
REPLAY_MISMATCHES=0
UNRESOLVED_REASON_STAGE_COUNTS={"no-base|no-eligible-line":3800,"ambiguous-base|boundary-uncertainty":541,"no-base|no-glyph-selected":1204,"noncontiguous-base|noncontiguous-selection":792,"ambiguous-base|annotation-overhang":28,"ambiguous-base|noncontiguous-selection":6,"missing-glyph-geometry|missing-annotation-geometry":14,"ambiguous-base|line-glyph-unmapped":2}
```

### `noncontiguous-base` 792

Every candidate is explained by real source/geometry discontinuity rather than a bounded threshold defect:

```text
NONCONTIGUOUS_FAILURE_COUNTS={"same-item-source-gap":652,"same-item-source-gap+wide-gap":52,"wide-gap":88}
NONCONTIGUOUS_MAX_POSITIVE_GAP_BUCKETS={">0.05-0.25":386,">0.25-0.50":318,">0.50-1.00":86,">1.00":2}
NONCONTIGUOUS_MIN_GAP_BUCKETS={">=0":790,"-0.05-<0":2}
```

`same-item-source-gap` means selected glyphs are not contiguous in the original source item. `wide-gap` means physical separation exceeds the production continuity limit. Missing source transitions are zero for all 792. These are not candidates for automatic joining.

Exact controls separate from this population: 13,732 exact candidates have no positive internal gap, 2,970 are at or below 0.05 body-size, and only 8 exceed 0.05. Physical gap alone therefore cannot replace the source-continuity requirement.

### `ambiguous-base` 577

The dominant 541 cases are boundary uncertainty at or inside the existing 1% margin:

```text
AMBIGUOUS_BOUNDARY_DISTANCE_BUCKETS={"<=0.0025":485,">0.0025-0.005":6,">0.005-0.010":50}
EXACT_NEAREST_BOUNDARY_BUCKETS={">0.020":16676,">0.010-0.020":34}
```

There is a clean observed separation: all 541 boundary-uncertain cases are at `<=0.010`, while all 16,710 exact controls are `>0.010`. Relaxing the boundary rule would erase a currently clean safety margin rather than fix an observed defect.

The remaining ambiguous cases are also structurally explained:

```text
annotation-overhang=28
AMBIGUOUS_OVERHANG_BUCKETS={">0.50-0.75":18,">0.75-1.00":8,">1.00":2}
noncontiguous-selection=6
line-glyph-unmapped=2
```

Overhang exceeds the existing half-body-size allowance. The six noncontiguous ambiguous cases have real gap/backtrack/source-discontinuity evidence. The two unmapped-line cases have no source-backed basis for guessed glyph widths.

## Decision

Task 4 closes with **no production ruby-rule change** for the current evidence set.

- Keep all 5,004 `no-base` unresolved. Stage 23 showed 3,800 have no eligible body line and the remaining 1,204 select zero glyphs; 1,130 only partially overlap a glyph cell at 50% or less.
- Keep all 792 `noncontiguous-base` unresolved because source or physical continuity is genuinely broken.
- Keep all 577 `ambiguous-base` unresolved because the populations are boundary-ambiguous, overhanging, noncontiguous, or unmapped and no independent source evidence resolves ownership.
- Keep the 14 `missing-glyph-geometry` unresolved; guessed widths are forbidden.

The unresolved-content preservation policy is therefore the accepted behavior, not a temporary failure state. The goal is not to force 6,387 to zero.

## Task 4 acceptance

Task 4A classified all 23,097 candidates with stable source-based identities and zero source-integrity issues. Stages 22–24 replayed geometry and glyph-selection logic read-only with zero production/replay mismatches. No generic production defect that cleanly separates from exact controls was found, so changing `ruby-spans.ts` would reduce safety rather than improve correctness.

Task 5 may proceed using the unchanged production baseline: exact ruby remains exact, unresolved annotation source remains preserved as page notes by default, and strict mode may reject unresolved ruby explicitly.
