# Stage 11: EPUBCheck standards validation

Stage 11 adds the official W3C EPUBCheck validator to the packaged-output regression path. It uses EPUBCheck **5.3.0**, pinned to the official release ZIP's SHA-256:

```text
6c07e68584b2e2ce2f89fe06e1246dfead3eb36b46b340e7d93524f29dcff6c5
```

Sources: [official release](https://github.com/w3c/epubcheck/releases/tag/v5.3.0), [release asset metadata](https://api.github.com/repos/w3c/epubcheck/releases/tags/v5.3.0), [CLI reference](https://www.w3.org/publishing/epubcheck/docs/cli/).

## Setup

After `npm ci`, with Java 17 and `unzip` available:

```sh
npm run setup:epubcheck
```

This explicit setup command downloads the official ZIP, verifies its hash before extraction, checks that Java can launch the JAR, and installs the distribution in the ignored `.cache/epubcheck/epubcheck-5.3.0/` directory. The JAR and its `lib/` dependencies stay together. Download/extraction temporary files are removed on success or failure; an existing installation is not replaced.

Alternatively, set `EPUBCHECK_JAR` to an already unpacked **5.3.0** JAR, keeping its `lib/` directory alongside it. Validation never downloads software. PDF conversion and `npm test` do not require Java or EPUBCheck.

## Fixture verification and CI

```sh
npm run verify:epubcheck
```

The explicit integration command requires the real Java validator and never skips when it is unavailable. It covers:

- valid packaged XHTML with horizontal/vertical text, exact ruby, supplementary Unicode, XML escaping, source whitespace, unresolved page notes, and a blank page;
- a deliberately invalid language tag, which must produce a nonzero process exit and standards errors;
- a synthetic real PDF converted through the production PDF.js-to-EPUB path and then validated as a complete archive.

GitHub Actions installs Java 17 and the pinned validator, then runs this command in addition to `npm test`. The private corpus is not needed for these fixture checks. Ordinary unit tests separately verify that process errors, warnings, incomplete reports, version mismatch, or missing prerequisites cannot be reported as a pass.

## Full local corpus verification

```sh
npm run verify:epub -- --epubcheck
```

This retains all Stage 10 archive checks and its exact 9-PDF / 5,141-page contract, then runs EPUBCheck against every generated EPUB before deleting temporary output. It requires all nine standards checks to pass. Without `--epubcheck`, the original conversion/archive verification still runs without Java.

To retain the full JSON reports and a per-book summary:

```sh
mkdir -p local-reports
npm run verify:epub -- --epubcheck --report-dir local-reports/epubcheck-stage11
```

The report directory must be new and its parent must exist. Existing reports are never overwritten or accepted as current evidence. Numbered `*.epubcheck.json` files map to the ordered entries in `summary.json`. On a failed run, inspect the summary and reports and stop before claiming standards compliance.

Reports remain local and ignored by Git. They may include publication names and validator excerpts. Keep them while reviewing the corresponding run; remove that run directory after review unless ongoing retention is wanted. Generated fixture PDFs/EPUBs and full-corpus EPUBs are temporary and are automatically removed, including on validation failure. The installed validator is a reusable development dependency, not an output archive.

## Acceptance rule

Each invocation uses `--failonwarnings` with the default standards profile and an English JSON report. A pass requires all of:

- an available JAR reporting exactly version 5.3.0;
- a completed process with exit code 0;
- a readable, complete JSON report for the current invocation;
- zero fatal errors, errors, and warnings in that report.

Java launch failures, timeouts, malformed reports, and unexpected nonzero exits fail the run. Severity levels are not customized or suppressed. Informational usage messages remain visible in the report but do not fail validation.

EPUBCheck validates standards conformance. Visual reading-system compatibility, chapter navigation, covers, and interpretation of unresolved annotations still need their own subsequent work.

## Verified result (2026-09-11)

Local execution passed typecheck and all 115 automated tests, all three real-validator integration tests, and the full nine-PDF conversion/standards run:

```text
FILESHAPE EPUB FULL CORPUS RESULT: PASS
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Total EPUB bytes: 16623404
EPUBCheck 5.3.0: 9/9 passed (0 errors, 0 warnings)
```

No production serializer/parser fixes were needed. The page, annotation and total byte counts equal the Stage 10 baseline. This run's JSON evidence is in the ignored `local-reports/epubcheck-stage11/` directory. Stage 11 was published as `cbe7518764eda5613e849a0fd4375d62c204bd84`, and [GitHub-hosted CI passed](https://github.com/BKrepublic/fileshape/actions/runs/34614178141). See the [stage review](stage11-review.md).
