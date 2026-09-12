# Stage 23 ruby glyph-selection evidence

Stage 23 is a read-only Task 4B checkpoint. It follows accepted Stage 22 evidence and does not change production ruby association rules.

## Why

Stage 22 found 5,004 `no-base` candidates. Most are geometrically far from any plausible body entry, so blanket threshold widening was rejected. However, 1,204 `no-base` candidates have at least one body entry that passes every coarse production entry gate.

Those 1,204 failures occur later, inside glyph-cell selection / annotation coverage / source-contiguity / choice construction. Stage 23 replays that exact post-gate logic and records where it stops.

## Command

```text
npm run inspect:ruby-glyph-selection -- local-samples \
  --output local-reports/<NEW_FILE>.json \
  --expect-pdf-count 9 \
  --expect-page-count 5141 \
  --expect-unresolved-count 6387 \
  --expect-no-base-eligible-line-count 1204
```

The report is local-only and contains no private source text or filename.

## Accepted private-corpus result

```text
PDFS=9
PAGES=5141
RUBY_CANDIDATES=23097
EXACT_CANDIDATES=16710
UNRESOLVED_CANDIDATES=6387
REPLAY_MISMATCHES=0
SELECTION_STAGE_COUNTS={"unique-choice":16710,"no-eligible-line":3800,"boundary-uncertainty":541,"no-glyph-selected":1204,"noncontiguous-selection":798,"annotation-overhang":28,"missing-annotation-geometry":14,"line-glyph-unmapped":2}
NO_BASE_STAGE_COUNTS={"no-eligible-line":3800,"no-glyph-selected":1204}
NO_BASE_ELIGIBLE_LINE_COUNT=1204
NO_BASE_NO_SELECTION_RELATION_COUNTS={"not-applicable":3800,"partial-overlap-at-most-half":1130,"after-all-glyphs":28,"before-all-glyphs":12,"between-glyphs":34}
NO_BASE_MAX_OVERLAP_BUCKETS={"0":74,"none":3800,">0.25-0.50":1126,">0.10-0.25":4}
```

The replay reproduces current production status/reason for every one of the 23,097 candidates. The 1,204 coarse-gate-eligible `no-base` candidates all fail because **zero glyph cells are selected** and zero choices are formed:

- 1,130 only partially overlap a glyph cell at no more than 50%;
- 34 lie between glyph cells;
- 28 lie after all glyph cells;
- 12 lie before all glyph cells.

There is no private-corpus evidence here for relaxing the >50% glyph-overlap rule or inventing a base from neighboring whitespace. Therefore the current `no-base` behavior is accepted as intentionally conservative for this corpus.

## Evidence recorded

For every current ruby candidate the replay records:

- stable Stage 21 candidate id;
- current production status/reason;
- replayed status/reason;
- whether replay exactly matches production;
- number of eligible body lines;
- number of selected glyphs and retained choices;
- boundary uncertainty, annotation overhang, unmapped body glyph line, and non-contiguity flags;
- for `no-glyph-selected`, whether the annotation lies between glyph cells, outside all cells, or only partially overlaps a glyph cell;
- maximum glyph-cell overlap ratio for no-selection cases.

The command fails if replay disagrees with production for any candidate. This prevents a diagnostic approximation from being mistaken for evidence.

## Decision

Do **not** change production rules for the 5,004 `no-base` candidates based on Stages 22–23.

The next evidence target is the remaining unresolved post-selection populations, especially `noncontiguous-base` (792) and `ambiguous-base` (577). Stage 23 shows 798 `noncontiguous-selection`, 541 `boundary-uncertainty`, 28 `annotation-overhang`, 2 `line-glyph-unmapped`, and 14 `missing-annotation-geometry` stages. A later production change is allowed only if a bounded structural defect is demonstrated with positive and adversarial-negative fixtures plus source-stable full-corpus before/after comparison.
