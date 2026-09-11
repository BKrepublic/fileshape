# Stage 7: end-to-end PDF to EPUB CLI

Baseline: Stage 6 complete EPUB archive serializer on `main`.

Stage 7 connects the existing parser stages into one executable path from a local PDF file to a `.epub` file. It does not add new parser heuristics.

## Pipeline

```text
PDF file
  -> inspectPdf(includeGlyphs: true)
  -> reconstructPageFlow
  -> resolveDocumentOrientations
  -> reconstructPhysicalLayout
  -> buildSemanticBlocks
  -> associateRubySpans
  -> buildFileShapeDocument + invariants
  -> serializeEpubPackage
  -> write .epub
```

`buildDocumentFromInspection` is the reusable boundary between PDF inspection and the typed Document Model. The CLI uses that function rather than duplicating parser logic.

## Fail-closed behavior

A text-bearing page whose writing orientation remains unresolved after document-context resolution aborts conversion. Likewise, a page with primary text but no semantic blocks aborts conversion. This prevents a successful-looking EPUB that silently omits source text.

Stage 5/6 rules still apply: unresolved ruby and unmapped exact ruby are not guessed or discarded by the EPUB renderer.

## Source identity

The file converter computes SHA-256 over the source PDF bytes and uses:

```text
urn:sha256:<64 lowercase hex digits>
```

as the default document/publication identifier. Source identity therefore does not depend on filename or filesystem path.

## CLI

```text
npm run convert:epub -- input.pdf [output.epub]
```

Optional metadata:

```text
--title TITLE
--creator NAME
--language ja
--identifier IDENTIFIER
--modified 2026-09-11T12:34:56Z
--title-prefix PREFIX
```

When output is omitted, `input.pdf` becomes `input.epub` in the same directory. When title is omitted, the input basename without `.pdf` is used as display metadata only; it does not affect parser behavior.

## Tests

`test/pdf-to-epub.test.ts` includes a real minimal PDF and checks the complete file path through PDF.js, provenance-aware document construction, EPUB packaging, and filesystem output. It also checks document-context orientation recovery and fail-closed unresolved orientation.

Hosted CI always runs typecheck and the full unit/E2E suite. The large PDF regression corpora under `local-samples/` are intentionally not committed, so `verify:ruby`, `verify:semantic`, and `verify:stage2` run in CI only when that directory is available. They remain required for local corpus validation before parser-stage changes are finalized.

## Next boundary

The CLI now proves that FileShape can produce an EPUB file from a PDF without bypassing the typed model. Remaining product-level work includes content policy for unresolved candidates, chapter/heading structure, CSS/resources, cover/images, EPUBCheck validation, and browser/Android adapters.
