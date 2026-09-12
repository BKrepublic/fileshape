# FileShape continuation status

Updated 2026-09-12 during Stage 26 Task 6A implementation.

## Current GitHub baseline

Stages 19–20 image preservation / explicit cover are accepted. Stages 21–24 complete Task 4 ruby refinement evidence. Stage 25 completes Task 5 automated CLI acceptance and is merged to `main`.

Accepted Stage 25 merge commit:

```text
3f5a3754c6ec084a359ac9967c99e60a7f145e90
```

The `main` push CI for that merge commit completed successfully. Later documentation-only commits may advance `main`; any continuation should start from the latest `main`, not reset to the Stage 25 branch SHA.

The 9 private corpus PDFs are not committed; their full-corpus checks remain local-only.

Stage 26 is the first bounded Task 6A checkpoint. It adds byte-input inspection/conversion seams, makes the PDF.js resource configuration explicit, and changes the Node CLI adapter to read the source once. Local public verification passed with 202/202 tests and pinned EPUBCheck 5/5 integration tests. GitHub CI and merge remain required before Stage 26 is accepted.

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
- Browser/Android work has started at the Task 6A byte boundary. No browser or Android adapter, UI, worker, or device acceptance exists yet.

## Important invariants

- no website, filename, URL, Creator/Producer, generator, font-name, N-code, character appearance, title or language-specific parser heuristics;
- decisions come from PDF structure, geometry, ordering and provenance;
- preserve original `TextItem.str` and source ownership;
- never split ligatures/supplementary Unicode by guessed widths;
- unresolved ruby stays explicit unless a generic source-backed rule proves a unique base;
- do not weaken verifiers or rewrite expectations merely to obtain green results;
- do not commit private PDFs, images, text excerpts, generated private EPUBs or local reports.

## Next work

1. Complete Stage 26 GitHub CI and merge before building on the new byte boundary.
2. Manual reading-system acceptance is the only open CLI-adjacent validation: Thorium and calibre should be checked explicitly on representative vertical/horizontal/ruby/note/image/navigation cases. If unavailable, keep the status as unperformed rather than inventing a pass.
3. Continue Task 6A by measuring the transitive runtime graph from the byte APIs, then design environment-supplied hashing, PNG compression, PDF.js resource/runtime loading, progress, cancellation, and diagnostics. Do not start a large UI before those contracts and a browser fixture are reviewed.
4. Do not reopen Task 4 or widen ruby thresholds without new generic source-backed evidence.
