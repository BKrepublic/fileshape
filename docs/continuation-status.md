# FileShape continuation status

Updated 2026-09-12 after Stage 23 private-corpus glyph-selection acceptance.

## Current GitHub baseline

Stages 19–20 image preservation / explicit cover are accepted and merged. Stage 21 Task 4A ruby inventory and Stage 22 coarse geometry evidence are accepted and merged. Stage 23 post-gate glyph-selection replay is accepted on `stage23-ruby-glyph-selection-evidence`; merge this checkpoint before any production ruby-rule change.

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

## Ruby evidence checkpoints

Stage 21 classified all 23,097 current candidates without changing production rules:

```text
EXACT_CANDIDATES=16710
UNRESOLVED_CANDIDATES=6387
UNRESOLVED_REASON_COUNTS={"no-base":5004,"ambiguous-base":577,"noncontiguous-base":792,"missing-glyph-geometry":14}
SOURCE_INTEGRITY_ISSUES=0
UNKNOWN_REASON_COUNT=0
```

Stage 22 measured coarse geometry near misses. Exact controls all pass the coarse gate model. For `no-base`, 3,662 nearest body entries are at least two body widths away on the side axis. A residual 1,204 pass every coarse entry-level gate.

Stage 23 exactly replayed production post-gate line/glyph selection for all 23,097 candidates and returned:

```text
REPLAY_MISMATCHES=0
NO_BASE_STAGE_COUNTS={"no-eligible-line":3800,"no-glyph-selected":1204}
NO_BASE_ELIGIBLE_LINE_COUNT=1204
NO_BASE_NO_SELECTION_RELATION_COUNTS={"not-applicable":3800,"partial-overlap-at-most-half":1130,"after-all-glyphs":28,"before-all-glyphs":12,"between-glyphs":34}
NO_BASE_MAX_OVERLAP_BUCKETS={"0":74,"none":3800,">0.25-0.50":1126,">0.10-0.25":4}
```

All 1,204 coarse-gate-eligible `no-base` candidates select zero base glyphs and form zero choices. 1,130 merely overlap a glyph cell by at most 50%; the rest fall before, after, or between glyph cells. **Conclusion: do not relax no-base thresholds or the >50% glyph-overlap rule.** The current 5,004 `no-base` cases remain intentionally unresolved.

The remaining evidence targets are `noncontiguous-base` 792 and `ambiguous-base` 577. Stage 23 stage counts are:

```text
boundary-uncertainty=541
noncontiguous-selection=798
annotation-overhang=28
line-glyph-unmapped=2
missing-annotation-geometry=14
```

These must be decomposed structurally before any production change. No production ruby rule changed in Stages 21–23.

## Other accepted/held scope

- Stage 13a body heading mapping remains on hold; page-level navigation is accepted fallback.
- Stage 14 reading-system implementation exists; manual real-reader acceptance remains.
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

1. **Task 4B unresolved post-selection evidence**: classify `noncontiguous-base` and `ambiguous-base` by normalized internal glyph gap, source continuity, boundary margin and overhang magnitude. Keep it read-only first.
2. Only if a generic structural defect cleanly separates from existing exact candidates should `ruby-spans.ts` change. Add positive + adversarial negative fixtures first, then compare stable candidate IDs before/after over the full private corpus.
3. Task 2 real-reader acceptance remains manual/environment-dependent.
4. Task 5 CLI final acceptance follows accepted Task 4 scope and real-reader conclusions.
5. Browser/Android follows CLI acceptance.
