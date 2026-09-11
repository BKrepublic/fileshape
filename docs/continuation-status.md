# FileShape continuation status

Updated after Stage 11 EPUBCheck integration and full-corpus standards verification on 2026-09-11.

## Verified baseline

Code baseline verified locally:

```text
fe60d30d190926693bd1488138934fc3423dd00a
```

Full production-path verification result:

```text
FILESHAPE EPUB FULL CORPUS RESULT: PASS
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Total EPUB bytes: 16623404
All corpus PDFs completed end-to-end PDF -> EPUB conversion.
VERIFY_EPUB_EXIT=0
```

The 9 PDFs in `local-samples/` are intentionally not committed to GitHub. Hosted CI therefore runs typecheck/unit/E2E fixture tests; the full local corpus is verified with `npm run verify:epub`.

## Stage 11 completed: EPUBCheck integration

Continued from GitHub `main` at `f2ebdbb531916586ca8edf8818a64bd8d3352d2c`. The Stage 11 changes add validation tooling, tests, CI configuration, and documentation; production extraction, model, content policy, XHTML, and packaging code are unchanged.

The official EPUBCheck **5.3.0** distribution is pinned by version and ZIP SHA-256. Setup is explicit (`npm run setup:epubcheck`); conversion never downloads or requires Java. The new `npm run verify:epubcheck` command runs real-validator fixture tests in CI, including an intentionally invalid EPUB that must fail.

Locally verified for this continuation:

```text
npm test: PASS (typecheck + 115 tests; no skipped tests)
npm run verify:epubcheck: PASS (3 real-validator integration tests; no skipped tests)
npm run verify:epub -- --epubcheck --report-dir local-reports/epubcheck-stage11: PASS
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Total EPUB bytes: 16623404
EPUBCheck 5.3.0: 9/9 passed (0 fatal errors, 0 errors, 0 warnings)
VERIFY_EPUB_EXIT=0
```

No standards violations were found in the valid fixtures or full corpus, so no production-output fixes were needed. Page count, unresolved-annotation count and total byte count match the historical baseline; this is not a byte-for-byte comparison to retained historical EPUB files. PDF.js emitted `TT: undefined function: 3` diagnostics during extraction of four corpus PDFs; these are distinct from the zero EPUBCheck warnings.

The full JSON reports and summary are local-only under `local-reports/epubcheck-stage11/`. Generated temporary EPUBs were removed. Missing Java/JAR, incorrect options, and attempts to reuse a report directory fail before corpus conversion. Stage 11 was published as `cbe7518764eda5613e849a0fd4375d62c204bd84` using the configured noreply email; exact remote SHA equality was verified. [GitHub Actions](https://github.com/BKrepublic/fileshape/actions/runs/34614178141) passed for that commit. The staged ruby/semantic/Stage 2 figures below remain historical; the parser/model were not changed or separately rerun in Stage 11.

The [Stage 11 review](stage11-review.md) found no blocking issues. The next bounded increment is Stage 12a: explicit PDF outlines to typed navigation and hierarchical EPUB nav. A read-only inventory found 250 outline entries in six PDFs; three have none.

See [Stage 11](stage11-epubcheck.md) for setup, report lifecycle, acceptance rules, and standards references.

## Current pipeline

```text
PDF
  -> PDF.js extraction + exact source/glyph provenance
  -> writing-orientation resolution
  -> physical layout
  -> semantic blocks
  -> exact/unresolved ruby association
  -> typed FileShape Document Model
  -> unresolved-content policy
  -> EPUB XHTML
  -> OPF / nav / container / ZIP package
  -> .epub
```

The user-facing CLI is:

```text
npm run convert:epub -- input.pdf [output.epub]
```

Unresolved ruby candidates are not guessed. The CLI defaults to preserving their annotation text as page-end notes. Library serialization keeps strict/error behavior available.

## Important invariants

Do not introduce behavior keyed to website, filename, URL, PDF Creator/Producer, generator name, font name, N-code, or particular character appearance. Parser decisions must come from PDF structure, geometry, ordering and provenance.

Do not loosen existing verifiers or change expected values merely to obtain green tests. Preserve original `TextItem.str` and source references as source truth. Never split ligatures or supplementary Unicode by guessed character/glyph widths. Uncertain ruby must remain explicit and source-backed.

## Regression commands

During development:

```text
npm test
```

Before merging parser/model changes, also run the relevant staged verifiers. For final local corpus validation:

```text
npm run verify:ruby
npm run verify:semantic
npm run verify:stage2
npm run verify:epub -- --epubcheck
```

Install the pinned validator with `npm run setup:epubcheck` first (Java 17 and `unzip` required). Use `npm run verify:epubcheck` for the public synthetic-fixture standards checks. Plain `npm run verify:epub` remains available for conversion/archive checks without Java.

Known verified historical figures before the final EPUB pass:

- ruby corpus: 33 pages, 880/880 mapped text runs, 373 exact candidates, 2 unresolved retained, representative exact pairs 11/11;
- semantic samples: 7/7;
- Stage 2 corpus: 9/9 PDFs, 5,141 pages, 5,141/5,141 text pages with semantic output, 223/223 font-pair semantic match.

## Next work

The core PDF-to-EPUB path is now proven over the complete local corpus. Continue from product-quality EPUB output rather than adding new parser heuristics without evidence.

High-value next areas are:

1. chapter/heading/section structure in the typed model and nav instead of page-only navigation;
2. CSS/resources and reading-system compatibility, especially vertical Japanese text and ruby;
3. cover/image extraction and packaging;
4. content-policy refinement for the 6,387 unresolved annotations, using geometry/provenance evidence rather than source-specific rules;
5. browser/Android adapter only after the conversion core remains deterministic and testable.

For any parser change, compare against this verified baseline and rerun the local corpus. Do not treat the high unresolved-annotation count as permission to guess ruby relationships.
