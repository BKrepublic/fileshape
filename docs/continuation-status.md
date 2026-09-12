# FileShape continuation status

Updated 2026-09-12 after Stage 24 private-corpus unresolved-ruby structural acceptance.

## Current GitHub baseline

Stages 19–20 image preservation / explicit cover are accepted and merged. Stages 21–24 complete Task 4 ruby refinement evidence. Production ruby association rules were not changed because the full-corpus evidence did not expose a safe generic improvement.

The 9 private corpus PDFs are not committed; their full-corpus checks remain local-only.

## Proven production baseline

```text
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Total EPUB bytes: 17959256
Outline entries: 250/250
Image occurrences: 4/4
Unique PNG content resources: 1/1
XHTML/OPF/ZIP image references: consistent
EPUBCheck 5.3.0: 9/9 passed (0 errors, 0 warnings)
```

Known parser/model regression baseline:

```text
ruby: 33 pages; mapped runs 880/880; exact candidates 373;
      unresolved retained 2; representative exact pairs 11/11
Stage 2: 9/9 PDFs; 5141 pages; semantic output 5141/5141
```

## Task 4 accepted result

Stage 21 classified all current candidates:

```text
RUBY_CANDIDATES=23097
EXACT_CANDIDATES=16710
UNRESOLVED_CANDIDATES=6387
UNRESOLVED_REASON_COUNTS={"no-base":5004,"ambiguous-base":577,"noncontiguous-base":792,"missing-glyph-geometry":14}
SOURCE_INTEGRITY_ISSUES=0
UNKNOWN_REASON_COUNT=0
```

Stages 22–24 then replayed the geometry and glyph-selection path without changing production rules. Stage 23 showed:

```text
REPLAY_MISMATCHES=0
NO_BASE_STAGE_COUNTS={"no-eligible-line":3800,"no-glyph-selected":1204}
```

All 1,204 coarse-gate-eligible `no-base` candidates select zero glyphs and zero choices; 1,130 only partially overlap a glyph cell by 50% or less.

Stage 24 decomposed the remaining populations:

```text
NONCONTIGUOUS_FAILURE_COUNTS={"same-item-source-gap":652,"same-item-source-gap+wide-gap":52,"wide-gap":88}
AMBIGUOUS_BOUNDARY_DISTANCE_BUCKETS={"<=0.0025":485,">0.0025-0.005":6,">0.005-0.010":50}
AMBIGUOUS_OVERHANG_BUCKETS={">0.50-0.75":18,">0.75-1.00":8,">1.00":2}
EXACT_NEAREST_BOUNDARY_BUCKETS={">0.020":16676,">0.010-0.020":34}
REPLAY_MISMATCHES=0
```

All 792 `noncontiguous-base` cases have real source or physical discontinuity. All 541 boundary-uncertain cases are at or inside the existing 1% margin, while all exact controls are outside it. The other ambiguous cases are overhang, noncontiguous, or unmapped glyph lines. **Conclusion: Task 4 is accepted with no production ruby-rule change.** The 6,387 unresolved candidates remain explicitly preserved by policy; reducing that number is not itself a quality goal.

## Other accepted/held scope

- Stage 13a body heading mapping remains on hold; page-level navigation is the accepted fallback for this corpus because no source-backed body anchors were found.
- Stage 14 reading-system implementation exists; manual real-reader acceptance remains environment-dependent and is not silently marked complete.
- Stages 15–20 image preservation and explicit source-backed cover are accepted. No automatic cover inference.
- Complete private corpus has zero marked-content occurrences.

## Important invariants

- no website, filename, URL, Creator/Producer, generator, font-name, N-code, character appearance, title or language-specific parser heuristics;
- decisions come from PDF structure, geometry, ordering and provenance;
- preserve original `TextItem.str` and source ownership;
- never split ligatures/supplementary Unicode by guessed widths;
- unresolved ruby stays explicit unless a generic source-backed rule proves a unique base;
- do not weaken verifiers or rewrite expectations merely to obtain green results;
- do not commit private PDFs, images, text excerpts, generated private EPUBs or local reports.

## Next work

1. **Task 5 CLI final acceptance**: freeze the accepted CLI scope, test default/strict/options/error paths/determinism, refresh user-facing README and run the integrated private-corpus acceptance.
2. Task 2 manual real-reader checks remain a separate explicit acceptance item; do not fabricate a pass. The automated reader fixture already exists.
3. Browser/Android work begins only after the CLI acceptance scope is recorded.
