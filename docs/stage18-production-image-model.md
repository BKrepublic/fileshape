# Stage 18: production image model boundary

Stage 18 begins Task 3 production image integration without claiming EPUB image preservation yet. It moves the accepted Stage 15–17 XObject evidence into a typed inspection and `FileShapeDocument` boundary. The checkpoint starts from `78f0728c515324c22c286ed41327426772f17eac`.

## Implemented contract

- `inspectPdf(..., { includeImages: true })` reuses the pinned image operator replay and decoded PNG adapter.
- PNG bytes are identified by their full SHA-256 content hash and deduplicated as resources across one source PDF.
- Each paint remains a separate occurrence with source page, operator index, repeat occurrence index, display transform/bounds, Form depth, interpolation evidence and clip evidence.
- Raw PDF.js object names do not enter `FileShapeDocument` or public verification output.
- `FileShapeDocument.imageResources` and each page's `imageOccurrences` are cloned from inspection data and validated for resource identity, byte hash, dimensions, source order, unique occurrence provenance, geometry and accepted clip state.
- Same PNG bytes with different interpolation evidence remain one resource and multiple occurrences; interpolation belongs to the occurrence side of the boundary.

The accepted production subset in this checkpoint is decoded XObject or XObject-repeat paints with either no clip or an exact rectangular clip that contains the complete transformed image. Inline images, masks, cropped images, complex/unknown clips, unsupported operator schemas and undecodable resources fail closed before reaching the document model.

## Verification

`test/pdf-production-images.test.ts` covers a real PDF with a reused XObject and a Form-contained occurrence. It proves one content resource remains three occurrences, verifies defensive cloning, and corrupts resource bytes, references, occurrence identity and clip state to prove model validation catches them. Synthetic controls prove inline, cropped, complex and missing resources fail closed. A separate control proves content dedupe does not erase differing per-occurrence interpolation evidence.

The private corpus command for this boundary is:

```sh
npm run verify:image-model -- local-samples \
  --expect-pdf-count 9 \
  --expect-page-count 5141 \
  --expect-image-occurrence-count 4 \
  --expect-unique-content-resource-count 1
```

It emits aggregate counts only. It does not write PDFs, images, source text, filenames or local reports.

The 2026-09-12 private run exited 0 with:

```text
PDFS=9
PAGES=5141
MODEL_IMAGE_RESOURCES=4
IMAGE_OCCURRENCES=4
UNIQUE_CONTENT_RESOURCES=1
```

The complete checkpoint validation also passed:

```text
npm test: 154/154
ruby: 33 pages; mapped runs 880/880; exact candidates 373;
      unresolved retained 2; representative exact pairs 11/11
Stage 2: 9/9 PDFs; 5141/5141 pages; semantic 5141/5141;
         font-pair semantic match 223/223
real EPUBCheck integration: 4/4
full EPUB regression: 9/9 PDFs; 9/9 EPUBs; 5141/5141 pages;
  unresolved annotations preserved 6387; outline entries 250/250;
  EPUBCheck 5.3.0 9/9 with 0 errors and 0 warnings
```

The full regression produced 17,351,198 EPUB bytes. This is a comparison measurement, not a byte-for-byte contract. The verifier read back the new report directory before reporting success; the temporary report and generated EPUBs were not added to Git.

## Explicit non-claims and next checkpoint

The production converter does not request `includeImages` yet, and XHTML/OPF/ZIP serialization does not consume these resources or occurrences. This prevents the intermediate checkpoint from silently claiming that images are preserved while still omitting them from EPUB.

The next checkpoint must derive a unique source/geometry-backed position for every accepted occurrence, render the resulting ordered page content, add deterministic PNG archive paths and OPF manifest entries, then enable image extraction in the production converter as one atomic behavior change. Cover selection remains a later explicit-policy checkpoint.
