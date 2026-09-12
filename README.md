# FileShape

FileShape is a provenance-preserving PDF-to-EPUB conversion pipeline. It reconstructs readable document structure from PDF geometry and source ranges without filename, site, font-name, title, or character-specific hacks.

## Current status

The accepted private regression corpus passes end to end through the production PDF -> EPUB path:

```text
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Total EPUB bytes: 17959256
Outline entries: 250/250 in 6 PDFs; unresolved outline entries: 0
Image occurrences: 4/4
Unique PNG content resources: 1/1
XHTML/OPF/ZIP image references: consistent
EPUBCheck 5.3.0: 9/9 passed (0 errors, 0 warnings)
```

Stages 15–20 add production image preservation and explicit source-backed cover designation. Stages 21–24 audited all 23,097 ruby candidates; 16,710 are exact and 6,387 remain intentionally unresolved because no generic source-backed rule can safely promote them. The default EPUB preserves those unresolved annotations as page notes.

Stage 25 automated CLI acceptance also passes: fixed-metadata output is byte-deterministic, strict unresolved-ruby mode rejects as designed, failed conversions preserve an existing output, invalid/missing CLI input is rejected, help works, and the documented option surface succeeds through the real CLI. Manual Thorium/calibre validation remains a separate unperformed item and is not implied by EPUBCheck success.

Stage 26 starts Task 6A with byte-input inspection and conversion APIs. The Node CLI now reads the PDF once and delegates to the same byte conversion path; fixed-metadata public fixtures produce byte-identical EPUB output through both entry points. Browser runtime dependencies, workers, progress/cancellation, UI, and Android packaging remain later checkpoints.

Stage 27 places those byte paths in explicit inspection/conversion core modules and commits a reproducible runtime dependency inventory. The inventory currently reports Node SHA-256 and zlib as conversion blockers and confirms that Java/EPUBCheck tooling is outside the conversion graph; the modules are not yet browser-ready.

See [continuation status](docs/continuation-status.md) for the current evidence and [the remaining-work runbook](docs/remaining-work/README.md) for ordered acceptance work.

## Pipeline

```text
PDF extraction
  -> source/glyph provenance
  -> orientation + physical layout
  -> semantic blocks
  -> exact/unresolved ruby association
  -> typed FileShape Document Model + explicit outline navigation
  -> image resources + source-backed image placement
  -> content policy
  -> EPUB XHTML/CSS
  -> OPF/nav/container/ZIP
  -> .epub
```

Original PDF text items and source ranges remain source truth throughout the pipeline. Ambiguous relationships are kept explicit instead of being guessed.

## Install

Requires Node.js 22 for the supported development/test path.

```sh
npm ci
```

Java 17 and `unzip` are only required when installing/running the pinned official EPUBCheck validator.

## Convert a PDF

Basic conversion:

```sh
npm run convert:epub -- input.pdf [output.epub]
```

Show CLI usage:

```sh
npm run convert:epub -- --help
```

Implemented options:

```text
--title TITLE
--creator NAME
--language TAG
--identifier ID
--modified YYYY-MM-DDTHH:MM:SSZ
--title-prefix PREFIX
--ruby on|off
--unresolved-ruby error|preserve-as-page-note
--page-progression-direction ltr|rtl
--cover-occurrence PAGE:OPERATOR:OCCURRENCE
```

Defaults and safety behavior:

- `--ruby on` is the effective default. `--ruby off` removes rendered `<rt>` readings from exact ruby while preserving the parent text; it does not delete unresolved source information.
- unresolved ruby defaults to `preserve-as-page-note`. `--unresolved-ruby error` is strict mode and fails instead of serializing a document that still contains unresolved ruby.
- page progression is not inferred. Omit the option to leave it to the reading system, or explicitly choose `ltr` / `rtl`.
- cover designation is never guessed. `--cover-occurrence` must name an existing source image occurrence by exact page/operator/occurrence provenance.
- if `output.epub` is omitted, FileShape writes `<input-basename>.epub` next to the PDF.
- the input PDF path itself is never accepted as the output path.
- EPUB generation is completed into a temporary file first and then renamed into place. A conversion failure does not replace an existing output file; a successful conversion may replace the requested existing EPUB path atomically on supported local filesystems.
- `--modified` should be fixed when byte-for-byte reproducibility is required. Without it, EPUB metadata uses the current UTC second.

Example with explicit metadata and strict unresolved-ruby handling:

```sh
npm run convert:epub -- book.pdf book.epub \
  --title 'Book title' \
  --language ja \
  --modified '2026-09-12T00:00:00Z' \
  --unresolved-ruby error
```

## Verification

Run typecheck and all public unit tests:

```sh
npm test
```

Run staged regression verification:

```sh
npm run verify:ruby
npm run verify:semantic
npm run verify:stage2
```

Install the pinned official EPUBCheck validator, then run the real-validator integration tests:

```sh
npm run setup:epubcheck
npm run verify:epubcheck
```

The private corpus is intentionally not committed. When `local-samples/` is available, run the complete PDF-to-EPUB regression with official EPUBCheck:

```sh
npm run verify:epub -- --epubcheck
```

The real-CLI acceptance verifier checks fixed-metadata determinism, default conversion, strict unresolved-ruby rejection, failure preservation of an existing output, invalid-option handling, help output, and the documented option surface without writing private source text into its report:

```sh
mkdir -p local-reports
npm run verify:cli -- local-samples \
  --report local-reports/cli-acceptance-NEW.json \
  --expect-pdf-count 9
```

Image/cover-specific private acceptance remains separately reproducible with:

```sh
npm run verify:image-model -- local-samples --expect-pdf-count 9 --expect-page-count 5141
npm run verify:cover
```

## Known scope and limits

- FileShape does not perform OCR. Scanned/image-only PDFs need a separate OCR path unless their meaningful content can be preserved as supported images.
- unsupported or ambiguous image transforms, clipping, compositing, interpolation, or placement fail closed rather than being silently dropped.
- body headings/sections are not invented from typography. For the accepted corpus, explicit PDF outline navigation is used where source-backed; otherwise page navigation is retained.
- automatic cover inference is intentionally not implemented.
- unresolved ruby is preserved, not guessed. The accepted corpus currently contains 6,387 unresolved annotations.
- EPUBCheck success is automated. Manual real-reader validation in Thorium/calibre remains a separate environment-dependent acceptance item and must not be reported as complete until actually performed.
- browser/Android adapters are downstream work and are not part of the automated CLI checkpoint.

## Design rules

Parser behavior must not depend on website, filename, URL, PDF metadata/generator, font name, N-code, title, language-specific text heuristics, or particular character appearance. Decisions come from PDF structure, geometry, ordering, and provenance.

Do not weaken verifiers to make a change pass. Do not replace uncertain evidence with guessed text relationships. Preserve source ownership and fail closed when a relationship cannot be proved.
