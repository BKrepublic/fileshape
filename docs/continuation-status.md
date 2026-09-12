# FileShape continuation status

Updated 2026-09-12 after Stage 22 private-corpus ruby near-miss acceptance.

## Current GitHub baseline

Stages 19–20 image preservation / explicit cover are accepted and merged. Stage 21 Task 4A ruby inventory is accepted and merged to `main` through PR #13. Stage 22 Task 4B near-miss geometry evidence is accepted on `stage22-ruby-near-miss-evidence`; merge this evidence checkpoint before any production ruby-rule change.

The 9 private corpus PDFs are not committed; their full-corpus checks remain local-only.

## Proven production baseline

The hardened production PDF -> EPUB path has passed the complete private corpus with images enabled:

```text
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Total EPUB bytes: 17959256
Outline entries: 250/250; outline PDFs: 6/6; unresolved 0
Image occurrences: 4/4
Unique PNG content resources: 1/1
Interpolated image occurrences: 0
XHTML/OPF/ZIP image references: consistent
EPUBCheck 5.3.0: 9/9 passed with 0 errors / 0 warnings
```

Known parser/model regression baseline remains:

```text
ruby: 33 pages; mapped runs 880/880; exact candidates 373;
      unresolved retained 2; representative exact pairs 11/11
semantic samples: 7/7
Stage 2: 9/9 PDFs; 5141 pages; semantic output 5141/5141;
         font-pair semantic match 223/223
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

Stage 22 measured coarse geometry near misses. Exact controls all pass the coarse gate model:

```text
EXACT_ACTUAL_BASE_ELIGIBILITY={"all-actual-base-eligible":16710}
```

For `no-base`, most candidates are far outside supported geometry. 3,662 have the nearest body entry at least two body widths away on the side axis. A residual 1,204 candidates pass every coarse entry-level gate but still end as `no-base`.

**Conclusion:** do not widen production thresholds. The 1,204 residual failures occur after coarse entry filtering, so the next read-only checkpoint must replay glyph-cell selection, annotation coverage, source continuity and line/choice construction. `ambiguous-base` 577 and `noncontiguous-base` 792 are controls for that replay. No production ruby rule changed in Stages 21–22.

## Other accepted/held scope

- Stage 13a body heading mapping remains on hold: all 250 outline entries are page-level only. Page-level navigation is accepted fallback.
- Stage 14 reading-system implementation exists; manual real-reader acceptance remains.
- Stages 15–20 image preservation and explicit source-backed cover are accepted. No automatic cover inference.
- Complete private corpus has zero marked-content occurrences; do not invent special-tag rules for this corpus.

## Current pipeline

```text
PDF
  -> PDF.js extraction + exact source/glyph provenance
  -> writing-orientation resolution
  -> physical layout
  -> semantic blocks
  -> exact/unresolved ruby association
  -> typed FileShape Document Model + outline navigation + image placement
  -> unresolved-content policy
  -> ordered text/image EPUB XHTML + CSS
  -> OPF / nav / image resources / optional explicit cover marker / ZIP
  -> .epub
```

User-facing CLI:

```text
npm run convert:epub -- input.pdf [output.epub]
```

Relevant options include unresolved-ruby policy, page progression, `--ruby on|off`, and `--cover-occurrence PAGE:OPERATOR:OCCURRENCE`.

## Important invariants

- no website, filename, URL, Creator/Producer, generator, font-name, N-code, character appearance, title or language-specific parser heuristics;
- decisions come from PDF structure, geometry, ordering and provenance;
- preserve original `TextItem.str` and source ownership;
- never split ligatures/supplementary Unicode by guessed widths;
- unresolved ruby stays explicit unless a generic source-backed rule proves a unique base;
- do not weaken verifiers or rewrite expectations merely to obtain green results;
- do not commit private PDFs, images, text excerpts, generated private EPUBs or local reports.

## Next work

1. **Task 4B glyph-selection evidence**: replay production post-gate selection read-only and classify the 1,204 coarse-eligible `no-base` candidates by exact later failure. The diagnostic must reproduce current production status/reason for all 23,097 candidates.
2. Only if that evidence exposes a generic structural defect should `ruby-spans.ts` change. Add positive + adversarial negative fixtures first, then compare stable candidate IDs before/after over the full private corpus.
3. Task 2 real-reader acceptance remains manual/environment-dependent.
4. Task 5 CLI final acceptance follows accepted Task 4 scope and real-reader conclusions.
5. Browser/Android follows CLI acceptance.
