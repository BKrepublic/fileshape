# FileShape continuation status

Updated after the full end-to-end EPUB corpus verification on 2026-09-11.

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
npm run verify:epub
```

Known verified historical figures before the final EPUB pass:

- ruby corpus: 33 pages, 880/880 mapped text runs, 373 exact candidates, 2 unresolved retained, representative exact pairs 11/11;
- semantic samples: 7/7;
- Stage 2 corpus: 9/9 PDFs, 5,141 pages, 5,141/5,141 text pages with semantic output, 223/223 font-pair semantic match.

## Next work

The core PDF-to-EPUB path is now proven over the complete local corpus. Continue from product-quality EPUB output rather than adding new parser heuristics without evidence.

High-value next areas are:

1. EPUBCheck integration and fixing any standards violations it exposes;
2. chapter/heading/section structure in the typed model and nav instead of page-only navigation;
3. CSS/resources and reading-system compatibility, especially vertical Japanese text and ruby;
4. cover/image extraction and packaging;
5. content-policy refinement for the 6,387 unresolved annotations, using geometry/provenance evidence rather than source-specific rules;
6. browser/Android adapter only after the conversion core remains deterministic and testable.

For any parser change, compare against this verified baseline and rerun the local corpus. Do not treat the high unresolved-annotation count as permission to guess ruby relationships.
