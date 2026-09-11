# FileShape

FileShape is a provenance-preserving PDF conversion pipeline focused on reconstructing readable document structure and producing EPUB without source-specific hacks.

## Current status

The complete local regression corpus now passes end to end through the production PDF -> EPUB path.

```text
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Total EPUB bytes: 16639748
Outline entries: 250 in 6 PDFs; unresolved outline entries: 0
```

Stage 12a adds hierarchical navigation from explicit PDF outlines, retaining page navigation when none are usable. All nine generated EPUBs pass official EPUBCheck 5.3.0 with zero fatal errors, errors and warnings. Typecheck, 124 automated tests, four real-validator integration tests, and the staged ruby/semantic/full-corpus regressions pass locally.

See [continuation status](docs/continuation-status.md) for current evidence, historical baselines, invariants and next work; [Stage 12a](docs/stage12a-outline-navigation.md) for navigation behavior; and [Stage 11](docs/stage11-epubcheck.md) for validator setup.

The subsequent Stage 12b diagnostic increment passes 126 automated tests. Its complete 5,141-page scan found no heading tags exposed by PDF.js in this corpus; body heading/section mapping remains open. See [the evidence assessment](docs/stage12b-structure-evidence.md).

The [remaining-work runbook (Japanese)](docs/remaining-work/README.md) gives ordered implementation instructions for headings/sections, reading-system compatibility, images/cover, ruby refinement, final CLI acceptance, and the subsequent browser/Android adapters. Each task includes evidence gathering, code entry points, validation, completion conditions, review and publication steps. These are planned tasks, not completed features.

## Pipeline

```text
PDF extraction
  -> source/glyph provenance
  -> orientation + physical layout
  -> semantic blocks
  -> exact/unresolved ruby association
  -> typed FileShape Document Model + explicit outline navigation
  -> content policy
  -> EPUB XHTML
  -> EPUB package
```

Original PDF text items and source ranges remain source truth throughout the pipeline. Ruby association is geometry/provenance based; unresolved candidates are never silently guessed or discarded.

## Commands

Install dependencies:

```sh
npm ci
```

Run typecheck and automated tests:

```sh
npm test
```

Convert a PDF:

```sh
npm run convert:epub -- input.pdf [output.epub]
```

Run staged regression verification:

```sh
npm run verify:ruby
npm run verify:semantic
npm run verify:stage2
```

Inspect explicit PDF structure/heading tags without changing conversion output:

```sh
npm run inspect:structure -- input.pdf
npm run inspect:structure -- local-samples --output local-reports/structure-NEW.json
```

The output parent directory must already exist; an existing output file is never overwritten. A successful inventory reports completed reads, including zero available tags, rather than certifying heading inference.

Run the final local 9-PDF / 5,141-page PDF-to-EPUB corpus verification:

```sh
npm run verify:epub
```

`verify:epub` requires the uncommitted `local-samples/` corpus and therefore cannot run on the public GitHub Actions runner.

Install the pinned official EPUBCheck validator (requires Java 17 and `unzip`), then run the standards fixture tests:

```sh
npm run setup:epubcheck
npm run verify:epubcheck
```

Validate all nine locally converted EPUBs with EPUBCheck, failing on errors or warnings:

```sh
npm run verify:epub -- --epubcheck
```

See [Stage 11](docs/stage11-epubcheck.md) for JSON reports, offline installations, CI coverage, and failure conditions.

## Design rules

Parser behavior must not depend on website, filename, URL, PDF metadata/generator, font name, N-code, or particular character appearance. Decisions come from PDF structure, geometry, reading order and provenance.

Do not weaken verifiers to make a change pass. Do not replace uncertain evidence with guessed text relationships. Preserve whitespace/source evidence during parsing and make presentation cleanup a later policy/rendering concern.
