# Stage 10: full-corpus EPUB verification

Stage 10 extends the existing 9-PDF / 5,141-page local regression corpus through the complete PDF-to-EPUB path. It does not add parser heuristics or alter the document model.

## Command

```text
npm run verify:epub
```

The verifier requires the existing uncommitted `local-samples/` corpus and therefore runs locally rather than on the hosted GitHub runner.

## Coverage

For each of the 9 PDFs, the verifier:

1. runs the production `convertPdfToEpub` path;
2. exercises PDF.js extraction, glyph/source provenance, orientation resolution, physical layout, semantic blocks, ruby association, typed document construction, unresolved-annotation content policy, XHTML serialization and EPUB packaging;
3. writes the generated EPUB to a temporary directory;
4. confirms reported and actual byte lengths agree;
5. confirms the first ZIP entry is `mimetype`, stored without compression, with exact `application/epub+zip` bytes;
6. confirms the archive references `META-INF/container.xml`, `OEBPS/package.opf`, `OEBPS/nav.xhtml`, and the first/last generated XHTML pages;
7. deletes temporary EPUB output after verification.

The corpus contract remains exactly 9 PDFs and 5,141 pages. A missing conversion, page-count change, malformed archive, conversion exception, or unexpected corpus count fails the verifier.

## Unresolved annotations

The user-facing converter uses `preserve-as-page-note` by default. The verifier reports the total number of unresolved annotations preserved across the corpus. It never converts those candidates into guessed ruby and never discards their source text.

## Verified result

The full corpus was run successfully on code baseline:

```text
fe60d30d190926693bd1488138934fc3423dd00a
```

Result:

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

This verifier is the end-to-end complement to `verify:ruby`, `verify:semantic`, and `verify:stage2`; those remain useful for locating regressions at their earlier stage boundaries.
