# FileShape continuation status

Updated 2026-09-12 after final Stage 19 private-corpus acceptance.

## Current baseline

Stage 18/19 production image integration is complete and accepted on `codex-next-20260912`. PR #11 is the integration PR to `main`; after it is merged, new work should start from the latest `main`, not from the old Stage 19 feature branch.

The 9 private corpus PDFs are not committed. Private full-corpus checks therefore remain local-only.

## Accepted end-to-end baseline

The hardened production PDF -> EPUB path has now passed the complete private corpus with images enabled:

```text
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Total EPUB bytes: 17959256
Outline entries: 250/250; outline PDFs: 6/6; unresolved outline entries: 0
Image occurrences: 4/4
Unique PNG content resources: 1/1
XHTML/OPF/ZIP image references: consistent
Interpolated image occurrences: 0
EPUBCheck 5.3.0: 9/9 passed (0 errors, 0 warnings)
```

The same acceptance checkpoint passed the production image-model verifier, ruby regression, and Stage 2 full-corpus regression.

## Accepted checkpoints

### Navigation / headings

Stage 13a analyzed all 250 outline entries in six PDFs without title/body string matching. Results were `page-only: 250`, with zero source-backed body anchors. Body heading/section inference remains on hold; Stage 12a page-level outline navigation is the accepted fallback. Do not add nearest-text, outline-depth, title matching, filename, font-name, or appearance heuristics to manufacture headings.

### Reading-system resources

Stage 14 added deterministic packaged CSS, vertical/horizontal writing rules, ruby/note styling, explicit page progression direction, and a reading-system fixture. Standards validation is passing. Manual real-reader acceptance remains a separate pending item.

### Ruby

Exact ruby is source-backed and supports conversion-time `--ruby on|off`; `off` removes only exact annotation markup and preserves base text/provenance. Unresolved candidates remain separate and are not silently discarded. Current private full-corpus unresolved count is 6387.

### Images

Stages 15-17 established the private-corpus evidence:

```text
9 PDFs / 5141 pages
4 image occurrences
4 decoded resources across source PDFs
1 unique PNG content resource
all observed resources: 800x600 RGB24
all clips: exact-rect / contains-image
marked-content occurrences: 0
```

Stages 18-19 then added the production model and EPUB integration. The independent review hardening now rejects unsupported non-uniform scaling, non-default compositing, layered overlap, inconsistent transform/bounds/clip evidence, hostile resource sizes before PNG construction where possible, and interpolated-image rendering that cannot be reproduced safely. Full EPUB verification now cross-checks XHTML occurrences, OPF image manifest items, PNG ZIP resources, and references.

Stage 19 is **accepted**. See `docs/stage19-production-image-integration.md` and `docs/stage19-review.md`.

## Current pipeline

```text
PDF
  -> PDF.js extraction + exact source/glyph/image provenance
  -> writing-orientation resolution
  -> physical layout
  -> semantic blocks
  -> exact/unresolved ruby association
  -> typed FileShape Document Model + explicit outline navigation
  -> production image validation + geometry-backed placement
  -> unresolved-content policy
  -> ordered text/image EPUB XHTML + packaged CSS
  -> OPF / nav / image resources / container / ZIP
  -> .epub
```

User-facing CLI:

```text
npm run convert:epub -- input.pdf [output.epub]
```

Existing options include unresolved-ruby policy, `--ruby on|off`, and explicit page progression direction.

## Important invariants

- no website, filename, URL, Creator/Producer, generator, font-name, N-code, or character-appearance special cases;
- parser/model decisions must come from PDF structure, geometry, ordering, and provenance;
- preserve source text and source ownership;
- do not split ligatures or supplementary Unicode using guessed widths;
- uncertain ruby, headings, image effects, and cover choice remain explicit or fail closed;
- do not weaken verifiers to obtain green results;
- do not commit private PDFs, extracted private images, generated private EPUBs, body-text excerpts, or local reports.

## Remaining CLI roadmap

The canonical roadmap is `docs/remaining-work/README.md`.

Current order:

1. **Task 3 explicit cover policy**: ordinary image preservation is accepted. Add only explicit or genuinely source-backed cover selection. Do not infer a cover from page number, dimensions, position, appearance, or content. Preserve the original body occurrence.
2. **Task 2 real-reader acceptance**: manually validate the Stage 14/19 output in the selected desktop reading systems, including vertical text, ruby, unresolved notes, and images.
3. **Task 4 unresolved-ruby refinement**: investigate/improve the remaining 6387 unresolved annotations without deleting uncertain evidence.
4. **Task 5 CLI final acceptance**: integrate the accepted scope, freeze CLI behavior and known limits, and rerun the complete validation matrix.
5. Browser/Android follows CLI acceptance and is not part of the CLI completion condition.

Task 1 body heading/section mapping stays on hold until genuinely new PDF-native evidence exists.

## Regression commands

During development:

```text
npm test
```

For XHTML/EPUB package changes:

```text
npm test
npm run verify:epubcheck
```

For parser/model/source-ownership changes, also run:

```text
npm run verify:ruby
npm run verify:stage2
npm run verify:image-model -- local-samples --expect-pdf-count 9 --expect-page-count 5141 --expect-image-occurrence-count 4 --expect-unique-content-resource-count 1 --expect-interpolated-image-occurrence-count 0
```

Private final acceptance uses a fresh report directory:

```text
npm run verify:epub -- --epubcheck --report-dir <NEW_LOCAL_REPORT_DIR>
```
