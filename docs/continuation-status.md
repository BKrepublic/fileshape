# FileShape continuation status

Updated 2026-09-12 after Stage 27 Task 6A acceptance and merge.

## Current GitHub baseline

Stages 19–20 image preservation / explicit cover are accepted. Stages 21–24 complete Task 4 ruby refinement evidence. Stage 25 completes Task 5 automated CLI acceptance and is merged to `main`.

Accepted Stage 25 merge commit:

```text
3f5a3754c6ec084a359ac9967c99e60a7f145e90
```

The `main` push CI for that merge commit completed successfully. Later documentation-only commits may advance `main`; any continuation should start from the latest `main`, not reset to the Stage 25 branch SHA.

The 9 private corpus PDFs are not committed; their full-corpus checks remain local-only.

Stage 26 is the first accepted Task 6A checkpoint. It adds byte-input inspection/conversion seams, makes the PDF.js resource configuration explicit, and changes the Node CLI adapter to read the source once. PR #19 was merged as `fca44cf7e4fee433951801cbb243668af671cd52`; its PR CI and the merge commit's `main` push CI both passed.

Stage 27 physically separates the inspection model, byte inspection core, byte conversion core, and Node adapters. A deterministic TypeScript-scanned dependency artifact now records direct/transitive Node imports, PDF.js, the Node resource provider, unreachable Java validation tooling, and missing browser contracts. PR #20 was merged as `d2329fd35b2b4960d052dbb6d42be3c10e428e40`; its PR CI and the merge commit's `main` push CI both passed.

## Accepted CLI checkpoint

Stage 25 private acceptance passed on the final implementation branch HEAD:

```text
fcc4dff39e5ce6e1c10e5cf2568be8afbe6fafbd
```

Real CLI acceptance:

```text
CLI_ACCEPTANCE=PASS
PDFS=9
SELECTED_PDF_ID=sha256:c498e2c0069aabd2
SELECTED_PAGES=46
SELECTED_UNRESOLVED=3
DEFAULT_BYTES=128957
DETERMINISTIC_BYTES=yes
STRICT_REJECTED=yes
FAILED_OUTPUT_PRESERVED=yes
INVALID_OPTION_REJECTED=yes
MISSING_INPUT_REJECTED=yes
HELP_SUCCEEDED=yes
DOCUMENTED_OPTIONS_SUCCEEDED=yes
ELAPSED_MS=25509
```

Integrated corpus acceptance on the same HEAD:

```text
RUBY_EXIT=0
STAGE2_EXIT=0
COVER_EXIT=0
VERIFY_EPUB_EXIT=0
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Total EPUB bytes: 17959256
Outline entries: 250/250; outline PDFs: 6/6; unresolved outline entries: 0
Image occurrences: 4/4; unique PNG content resources: 1/1; XHTML/OPF/ZIP references: consistent
EPUBCheck 5.3.0: 9/9 passed (0 errors, 0 warnings)
```

Cover smoke also passed on the same code:

```text
COVER_SMOKE=PASS
BODY_IMAGE_OCCURRENCES=1
PNG_RESOURCES=1
COVER_MARKERS=1
BODY_OCCURRENCES_PRESERVED=yes
PNG_RESOURCES_UNCHANGED=yes
EPUBCheck 5.3.0: pass (0 errors, 0 warnings)
```

Stage 25 also verifies that the real CLI refuses the source PDF as its output path, preserves an existing output on failure, rejects bad/missing options, supports help, and produces byte-identical output when `--modified` is fixed.

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

Stages 22–24 found no generic source-backed production rule that could safely promote those unresolved candidates. Task 4 therefore closed with no production ruby-rule change. The 6,387 unresolved candidates remain explicitly preserved by policy; reducing that number is not itself a quality goal.

## Accepted / held scope

- Stage 13a body heading mapping remains on hold; page-level navigation is the accepted fallback for this corpus because no source-backed body anchors were found.
- Stages 15–20 image preservation and explicit source-backed cover are accepted. No automatic cover inference.
- Complete private corpus has zero marked-content occurrences.
- The automated CLI checkpoint is accepted and merged.
- Manual Thorium/calibre reading-system validation remains **not yet performed**. EPUBCheck green is not a substitute for real-reader validation.
- Browser/Android work has reached the Task 6A runtime module boundary. No browser or Android adapter, UI, worker, or device acceptance exists yet.

## Important invariants

- no website, filename, URL, Creator/Producer, generator, font-name, N-code, character appearance, title or language-specific parser heuristics;
- decisions come from PDF structure, geometry, ordering and provenance;
- preserve original `TextItem.str` and source ownership;
- never split ligatures/supplementary Unicode by guessed widths;
- unresolved ruby stays explicit unless a generic source-backed rule proves a unique base;
- do not weaken verifiers or rewrite expectations merely to obtain green results;
- do not commit private PDFs, images, text excerpts, generated private EPUBs or local reports.

## Next work

1. Start the next bounded Task 6 checkpoint from the latest `main`; do not reset to the Stage 27 implementation or merge SHA.
2. Manual reading-system acceptance is the only open CLI-adjacent validation: Thorium and calibre should be checked explicitly on representative vertical/horizontal/ruby/note/image/navigation cases. If unavailable, keep the status as unperformed rather than inventing a pass.
3. Use `docs/stage27-runtime-dependency-inventory.json` to design and measure browser-capable SHA-256, zlib/PNG, and PDF.js runtime/resource strategies. Progress, cancellation, diagnostics, file-size/memory policy, download/save, and cleanup also remain explicit missing contracts. Do not start a large UI before those contracts and a browser fixture are reviewed.
4. Do not reopen Task 4 or widen ruby thresholds without new generic source-backed evidence.
