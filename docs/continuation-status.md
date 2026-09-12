# FileShape continuation status

Updated 2026-09-12 during Stage 25 CLI final acceptance.

## Current GitHub baseline

Stages 19–20 image preservation / explicit cover are accepted and merged. Stages 21–24 complete Task 4 ruby refinement evidence. Production ruby association rules were not changed because the full-corpus evidence did not expose a safe generic improvement.

Stage 25 now hardens the user-facing CLI and adds a reproducible real-CLI private acceptance verifier. Public CI must be green and the private final acceptance must pass before the CLI checkpoint is called complete.

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

```text
RUBY_CANDIDATES=23097
EXACT_CANDIDATES=16710
UNRESOLVED_CANDIDATES=6387
UNRESOLVED_REASON_COUNTS={"no-base":5004,"ambiguous-base":577,"noncontiguous-base":792,"missing-glyph-geometry":14}
SOURCE_INTEGRITY_ISSUES=0
UNKNOWN_REASON_COUNT=0
REPLAY_MISMATCHES=0
```

Stage 23 showed all 1,204 coarse-gate-eligible `no-base` candidates select zero glyphs and zero choices; 1,130 only partially overlap a glyph cell by 50% or less. Stage 24 showed all 792 `noncontiguous-base` cases have real source or physical discontinuity, while all 541 boundary-uncertain cases are at or inside the existing 1% margin and all exact controls are outside it. The remaining ambiguous cases are overhang, noncontiguous, or unmapped glyph lines.

**Conclusion:** Task 4 is accepted with no production ruby-rule change. The 6,387 unresolved candidates remain explicitly preserved by policy; reducing that number is not itself a quality goal.

## Stage 25 changes under acceptance

- complete CLI usage/help surface for all implemented options;
- reject output path equal to the source PDF path before any read/write;
- retain atomic successful output replacement and failure preservation of an existing output;
- public parser/safety contract tests;
- `npm run verify:cli` private real-command verifier for deterministic fixed-metadata output, strict unresolved-ruby rejection, invalid-option handling, help, documented options, and failure preservation;
- refreshed user-facing README with defaults, safety behavior, options, limitations, and verification commands.

No PDF extraction, ruby association, image placement, navigation, or EPUB serialization rule is intentionally changed in Stage 25.

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

1. Run Stage 25 public CI and fix any real regression without weakening tests.
2. Run private `verify:cli`, ruby, Stage 2, full EPUB+EPUBCheck, and cover acceptance on the same Stage 25 branch.
3. Record the final CLI acceptance SHA and measurements. Manual Thorium/calibre checks remain explicitly separate if not performed.
4. Browser/Android work begins only after the CLI acceptance scope is recorded.
