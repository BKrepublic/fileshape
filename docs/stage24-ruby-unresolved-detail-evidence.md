# Stage 24 unresolved ruby detail evidence

Stage 24 is a read-only Task 4B checkpoint after accepted Stage 23 glyph-selection evidence. It does not change production ruby association rules.

## Why

Stages 22–23 closed the `no-base` question for the current corpus: 5,004 candidates remain intentionally unresolved because either no body line satisfies production geometry or no glyph cell is selected. The remaining evidence target is the 792 `noncontiguous-base` and 577 `ambiguous-base` candidates.

Stage 24 replays the production post-gate selection logic again, but records the normalized quantities that caused those outcomes:

- selected-glyph internal gap relative to body line size;
- backward overlap beyond the current -0.05 line-size limit;
- same-text-item source discontinuity;
- missing source refs and cross-item transitions;
- nearest selected-glyph center to annotation boundary;
- annotation start/end overhang relative to line size;
- production reason/stage cross-tab.

The replay must still match production status/reason for every candidate. The report is local-only and contains no private source text or filenames.

## Command

```text
npm run inspect:ruby-unresolved-detail -- local-samples \
  --output local-reports/<NEW_FILE>.json \
  --expect-pdf-count 9 \
  --expect-page-count 5141 \
  --expect-unresolved-count 6387
```

## Decision rule

Do not change thresholds merely because unresolved cases cluster just outside them.

A production change is allowed only when a generic structural defect can be shown to separate from existing exact candidates and can be represented by positive plus adversarial-negative fixtures. In particular:

- `noncontiguous-base` caused by large physical gaps, backward overlap, missing source ownership, or real source discontinuity remains unresolved;
- `boundary-uncertainty` at or inside the existing 1% boundary margin remains ambiguous unless independent source evidence resolves ownership;
- `annotation-overhang` beyond half a body-size remains unresolved unless a generic source-backed reason proves the selected base is incomplete;
- unmapped or missing glyph geometry is not repaired by guessed widths.

If Stage 24 shows that these populations are genuine ambiguity rather than a bounded implementation defect, Task 4 may close with no production ruby-rule change and the existing unresolved-content preservation policy.
