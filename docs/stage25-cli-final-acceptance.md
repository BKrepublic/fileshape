# Stage 25 CLI final acceptance

Stage 25 is Task 5. It freezes the accepted CLI scope, tests the real command path, refreshes user documentation, and performs one final integrated private-corpus acceptance before the CLI checkpoint can be called complete.

## Production changes in this checkpoint

The converter behavior is intentionally narrow:

- reject `inputPath === outputPath` before reading or writing anything;
- expose one complete CLI usage string containing every implemented value-taking option;
- support `--help` / `-h` without requiring an input file;
- keep existing atomic output replacement: package to a sibling temporary file, then rename only after successful generation;
- export argument parsing for public contract tests.

No PDF parsing, ruby association, image placement, navigation, or EPUB serialization rule is changed here.

## Public checks

`test/pdf-to-epub-cli.test.ts` covers:

- all documented CLI options;
- unknown/missing/invalid option handling;
- usage completeness;
- refusal to use the PDF source path as the output path.

The normal GitHub CI also continues to run typecheck, all public tests, pinned EPUBCheck setup, and real EPUB standards integration.

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

## Full acceptance still required

Stage 25 is not accepted from public CI alone. Before merge, run on the same branch:

1. `npm run verify:cli` as above;
2. `npm run verify:ruby`;
3. `npm run verify:stage2`;
4. `npm run verify:epub -- --epubcheck --report-dir <NEW_DIR>`;
5. `npm run verify:cover` if the accepted Stage 20 cover contract has not been re-run on the same final code.

Expected inherited corpus invariants remain 9 PDFs, 5,141 pages, 6,387 unresolved annotations preserved by default, 250/250 outline entries, 4 image occurrences, 1 unique PNG content resource, and EPUBCheck 5.3.0 clean for all nine EPUBs.

Manual Thorium/calibre reading-system validation remains explicitly separate. It must not be converted into an automated PASS claim merely because EPUBCheck is green.
