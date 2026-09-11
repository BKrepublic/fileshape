# FileShape

FileShape is a provenance-preserving PDF conversion pipeline focused on reconstructing readable document structure and producing EPUB without source-specific hacks.

## Current status

The complete local regression corpus now passes end to end through the production PDF -> EPUB path.

```text
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Total EPUB bytes: 16623404
```

The verified code baseline for that full-corpus run is:

```text
fe60d30d190926693bd1488138934fc3423dd00a
```

See `docs/continuation-status.md` for the current handoff state, invariants and next work.

## Pipeline

```text
PDF extraction
  -> source/glyph provenance
  -> orientation + physical layout
  -> semantic blocks
  -> exact/unresolved ruby association
  -> typed FileShape Document Model
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

Run the final local 9-PDF / 5,141-page PDF-to-EPUB corpus verification:

```sh
npm run verify:epub
```

`verify:epub` requires the uncommitted `local-samples/` corpus and therefore cannot run on the public GitHub Actions runner.

## Design rules

Parser behavior must not depend on website, filename, URL, PDF metadata/generator, font name, N-code, or particular character appearance. Decisions come from PDF structure, geometry, reading order and provenance.

Do not weaken verifiers to make a change pass. Do not replace uncertain evidence with guessed text relationships. Preserve whitespace/source evidence during parsing and make presentation cleanup a later policy/rendering concern.
