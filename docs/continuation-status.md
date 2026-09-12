# FileShape continuation status

Updated 2026-09-12 after Stage 28 browser/PWA foundation acceptance and merge.

## Current GitHub baseline

Stages 19–20 image preservation / explicit cover are accepted. Stages 21–24 complete Task 4 ruby refinement evidence. Stage 25 completes Task 5 automated CLI acceptance and is merged to `main`.

Accepted Stage 25 merge commit:

```text
3f5a3754c6ec084a359ac9967c99e60a7f145e90
```

The 9 private corpus PDFs are not committed; their full-corpus checks remain local-only.

Stage 26 is the first accepted Task 6A checkpoint. It adds byte-input inspection/conversion seams, makes the PDF.js resource configuration explicit, and changes the Node CLI adapter to read the source once. PR #19 was merged as `fca44cf7e4fee433951801cbb243668af671cd52`; its PR CI and merge-commit `main` CI both passed.

Stage 27 physically separates the inspection model, byte inspection core, byte conversion core, and Node adapters. A deterministic TypeScript-scanned dependency artifact records direct/transitive Node imports, PDF.js, the Node resource provider, unreachable Java validation tooling, and missing browser contracts. PR #20 was merged as `d2329fd35b2b4960d052dbb6d42be3c10e428e40`; its PR CI and merge-commit `main` CI both passed.

Stage 28 establishes the accepted browser/PWA foundation. PR #21 was squash-merged as:

```text
b5100164d95d623c7c8631e6ff265686f10320a3
```

Stage 28 provides a framework-free mobile-first static PWA shell, same-origin/offline service worker, explicit browser conversion message contract, pinned Vite/Playwright verification, and a real PDF.js module-worker probe. GitHub Actions PR run #143 and merge-commit `main` run #144 both passed. Browser conversion remains deliberately disabled; Stage 28 does not claim CLI/browser parity.

A documentation-only Stage 28 acceptance record follows the merge commit. Any continuation must start from the latest `main`, not reset to an earlier implementation SHA.

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

Stage 28 public acceptance on PR head `dfacd55017011f95a7f3c6edddb541c4b87d8185` and merge commit `b5100164d95d623c7c8631e6ff265686f10320a3`:

```text
npm test                         PASS (212/212)
npm run verify:runtime-deps      PASS
npm run verify:browser           PASS
npm run verify:epubcheck         PASS (5/5)
git diff --check                 PASS
PR CI #143                       PASS
main CI #144                     PASS
```

`verify:browser` covers a production Vite build, deterministic static PWA checks, a real PDF.js module worker in pinned Chromium, online-to-offline service-worker reload, and local-only network behavior. It does **not** run the FileShape conversion core.

## Accepted / held scope

- Stage 13a body heading mapping remains on hold; page-level navigation is the accepted fallback for this corpus because no source-backed body anchors were found.
- Stages 15–20 image preservation and explicit source-backed cover are accepted. No automatic cover inference.
- Complete private corpus has zero marked-content occurrences.
- The automated CLI checkpoint is accepted and merged.
- Manual Thorium/calibre reading-system validation remains **not yet performed**. EPUBCheck green is not a substitute for real-reader validation.
- Browser/PWA delivery now has an accepted shell, worker/runtime probe, offline behavior, and conversion-message contract. There is still no browser EPUB conversion, result download, browser corpus parity, supported-size claim, or Android/device acceptance.

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

1. Start Stage 29 from the latest `main` after the Stage 28 acceptance documentation commit.
2. Replace/inject the Node-only SHA-256 and PNG deflate seams with environment-neutral interfaces and browser implementations without changing CLI output semantics.
3. Package and configure the PDF.js browser resources actually required by conversion, including CMap/standard-font/WASM handling where the parser requests them. Do not claim full resource coverage from the Stage 28 one-page probe.
4. Connect one deterministic public PDF fixture through the dedicated conversion worker contract to real EPUB bytes, with operational progress, cancel, cleanup, and download only when the core is genuinely reachable in the browser bundle.
5. Compare that public-fixture browser output against the accepted byte API/CLI semantics and run real EPUBCheck in CI. After the public path is stable, run the 9 private corpus PDFs locally before claiming browser parity or input-size support.
6. Measure browser memory/elapsed behavior before choosing a maximum file size. Do not invent an upload-style limit for a local app.
7. Manual Thorium/calibre reading-system acceptance remains the only open CLI-adjacent validation and must stay marked unperformed until actually done.
8. Android remains deferred until the browser conversion path has an end-to-end accepted result.
9. Do not reopen Task 4 or widen ruby thresholds without new generic source-backed evidence.
