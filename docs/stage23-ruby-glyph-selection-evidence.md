# Stage 23 ruby glyph-selection evidence

Stage 23 is a read-only Task 4B checkpoint. It follows accepted Stage 22 evidence and does not change production ruby association rules.

## Why

Stage 22 found 5,004 `no-base` candidates. Most are geometrically far from any plausible body entry, so blanket threshold widening was rejected. However, 1,204 `no-base` candidates have at least one body entry that passes every coarse production entry gate.

Those 1,204 failures must occur later, inside glyph-cell selection / annotation coverage / source-contiguity / choice construction. Stage 23 replays that exact post-gate logic and records where it stops.

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

## Evidence

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

## Decision rule

Stage 23 still does not promote ruby.

A production change is allowed only if the full-corpus distribution exposes a generic structural defect that can be represented by a positive fixture and adversarial negative fixtures. If the 1,204 coarse-eligible `no-base` cases merely sit in whitespace / between glyph cells / at <=50% glyph overlap, leaving them unresolved is correct.

If a bounded defect exists, the next checkpoint changes one rule only and compares stable candidate ids before/after across the full private corpus.
