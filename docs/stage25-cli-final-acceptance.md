# Stage 25 CLI final acceptance

Stage 25 is Task 5. It freezes the accepted CLI scope, tests the real command path, refreshes user documentation, and performs one final integrated private-corpus acceptance before the CLI checkpoint can be called complete.

## Accepted result

Stage 25 private acceptance passed on branch HEAD:

```text
fcc4dff39e5ce6e1c10e5cf2568be8afbe6fafbd
```

Real CLI verifier:

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

Integrated inherited checks also passed on the same HEAD:

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

Explicit cover smoke on the same HEAD also passed:

```text
COVER_SMOKE=PASS
BODY_IMAGE_OCCURRENCES=1
PNG_RESOURCES=1
COVER_MARKERS=1
BODY_OCCURRENCES_PRESERVED=yes
PNG_RESOURCES_UNCHANGED=yes
EPUBCheck 5.3.0: pass (0 errors, 0 warnings)
```

The private reports remain local-only:

```text
local-reports/stage25-cli-20260912-165713.json
local-reports/stage25-epub-20260912-165713
```

## Production changes in this checkpoint

The converter behavior is intentionally narrow:

- reject `inputPath === outputPath` before reading or writing anything;
- expose one complete CLI usage string containing every implemented value-taking option;
- support `--help` / `-h` without requiring an input file;
- keep existing atomic output replacement: package to a sibling temporary file, then rename only after successful generation;
- export argument parsing for public contract tests.

No PDF parsing, ruby association, image placement, navigation, or EPUB serialization rule changed in Stage 25.

## Public checks

`test/pdf-to-epub-cli.test.ts` covers:

- all documented CLI options;
- unknown/missing/invalid option handling;
- usage completeness;
- refusal to use the PDF source path as the output path.

GitHub CI on the Stage 25 branch is green for typecheck/unit tests, pinned EPUBCheck setup, real EPUB standards integration, and the hosted local-corpus step.

## Private real-CLI verifier

```text
npm run verify:cli -- local-samples \
  --report local-reports/<NEW_FILE>.json \
  --expect-pdf-count 9
```

The verifier selects a corpus PDF with unresolved ruby without writing its filename or source text to the report, then drives the actual `src/pdf-to-epub.ts` CLI through the local `tsx` executable.

It requires all of the following:

- default conversion succeeds;
- two conversions with fixed `--modified` are byte-identical;
- `--unresolved-ruby error` fails for a document known to contain unresolved ruby and leaves no new output;
- a strict-mode failure does not alter an already-existing output file;
- an unknown option fails and leaves no output;
- missing input fails with usage text;
- `--help` succeeds;
- the documented metadata/ruby/page-progression option surface succeeds through the real CLI.

Scratch EPUBs are removed after the verifier. The JSON report is local-only and privacy-safe.

## Acceptance conclusion

The automated CLI checkpoint is accepted. The following remain intentionally outside that claim:

- manual Thorium/calibre reading-system validation;
- OCR;
- automatic cover inference;
- arbitrary-PDF universal support;
- browser/Android adapters.

Manual Thorium/calibre validation remains explicitly separate. EPUBCheck success must not be rewritten as a manual reader PASS.
