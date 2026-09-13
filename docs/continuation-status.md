# FileShape continuation status

Updated 2026-09-13 after Stage 29 browser runtime and private parity acceptance.

## Current GitHub baseline

Stages 19–20 image preservation / explicit cover are accepted. Stages 21–24 complete Task 4 ruby refinement evidence. Stage 25 completes Task 5 automated CLI acceptance and is merged to `main`.

Accepted Stage 25 merge commit:

```text
3f5a3754c6ec084a359ac9967c99e60a7f145e90
```

The 9 private corpus PDFs are not committed; their full-corpus checks remain local-only.

Stage 26 is the first accepted Task 6A checkpoint. It adds byte-input inspection/conversion seams, makes the PDF.js resource configuration explicit, and changes the Node CLI adapter to read the source once. PR #19 was merged as `fca44cf7e4fee433951801cbb243668af671cd52`.

Stage 27 physically separates the inspection model, byte inspection core, byte conversion core, and Node adapters. A deterministic TypeScript-scanned dependency artifact records direct/transitive Node imports, PDF.js, the Node resource provider, unreachable Java validation tooling, and missing browser contracts. PR #20 was merged as `d2329fd35b2b4960d052dbb6d42be3c10e428e40`.

Stage 28 establishes the accepted browser/PWA foundation. PR #21 was squash-merged as:

```text
b5100164d95d623c7c8631e6ff265686f10320a3
```

Stage 28 provides a framework-free mobile-first static PWA shell, same-origin/offline service worker, explicit browser conversion message contract, pinned Vite/Playwright verification, and a real PDF.js module-worker probe. Browser conversion remained deliberately disabled at that checkpoint; Stage 28 itself did not claim CLI/browser parity.

A documentation-only Stage 28 acceptance record follows the merge commit. Stage
29 is accepted on PR #22 implementation head
`2e68168f17f44f4b11396c341028df5217fb79db`; its final documentation and merge
remain the current repository operation. Any continuation must use the latest
remote state and must not reset to an earlier implementation SHA.

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

## Browser checkpoint accepted result

Stage 29 public local acceptance on implementation head
`2e68168f17f44f4b11396c341028df5217fb79db`:

```text
npm test                         PASS (217/217)
npm run verify:runtime-deps      PASS
npm run verify:browser           PASS (2/2)
npm run verify:epubcheck         PASS (5/5)
git diff --check                 PASS
WASM reproducible rebuild        PASS
WASM SHA-256                     90bc26f8c73322492510a9438e04d41c5ab7badcf76d0ae1e70d1aae4d9176f1
```

Private local browser acceptance on the same implementation:

```text
PRIVATE_BROWSER_ACCEPTANCE=PASS
PRIVATE_BROWSER_PDFS=9
PRIVATE_BROWSER_PAGES=5141
PRIVATE_BROWSER_UNRESOLVED=6387
PRIVATE_BROWSER_BYTE_IDENTICAL=yes
elapsed=2.9m
```

`verify:browser` covers a production Vite build, deterministic static PWA
checks, a real PDF.js worker, the real FileShape conversion core, exact public
text/image EPUB equality, application-base PDF.js resources, same-origin
requests, and online-to-offline conversion using system Chrome. The private
harness extends that proof to all nine corpus PDFs and records per-PDF elapsed
time and Linux Chromium RSS in a gitignored report.

GitHub Actions are disabled by project policy and were not used as Stage 29
evidence.

## Accepted / held scope

- Stage 13a body heading mapping remains on hold; page-level navigation is the accepted fallback for this corpus because no source-backed body anchors were found.
- Stages 15–20 image preservation and explicit source-backed cover are accepted. No automatic cover inference.
- Complete private corpus has zero marked-content occurrences.
- The automated CLI checkpoint is accepted and merged.
- Manual Thorium/calibre reading-system validation remains **not yet performed**. EPUBCheck green is not a substitute for real-reader validation.
- Browser/PWA delivery now has accepted end-to-end EPUB conversion, result
  download, offline operation, and exact 9-PDF browser/Node corpus parity.
  Stage 29 does not make a universal supported-size claim, and Android/device
  acceptance remains open.

## Important invariants

- no website, filename, URL, Creator/Producer, generator, font-name, N-code, character appearance, title or language-specific parser heuristics;
- decisions come from PDF structure, geometry, ordering and provenance;
- preserve original `TextItem.str` and source ownership;
- never split ligatures/supplementary Unicode by guessed widths;
- unresolved ruby stays explicit unless a generic source-backed rule proves a unique base;
- do not weaken verifiers or rewrite expectations merely to obtain green results;
- do not commit private PDFs, images, text excerpts, generated private EPUBs or local reports;
- browser work must remain local-only unless a separate architecture change is explicitly accepted; do not silently add a PDF upload backend.

## Next work

1. Finish the PR #22 documentation/review checkpoint and merge Stage 29 without
   enabling GitHub Actions.
2. Keep manual Thorium/calibre reading-system acceptance marked unperformed
   until it is actually completed.
3. Review the recorded Stage 29 elapsed/RSS evidence before making any browser
   maximum-input or support claim. Add target-device measurements rather than
   inventing an upload-style limit for this local app.
4. Start Android architecture evaluation from the accepted browser/core path:
   compare installed PWA, WebView wrapper, and native adapter constraints before
   selecting a framework or packaging route.
5. Validate Android file selection/save, lifecycle, cancellation, memory, and
   output equality on a real device before claiming device acceptance.
6. Do not reopen Task 4 or widen ruby thresholds without new generic
   source-backed evidence.
