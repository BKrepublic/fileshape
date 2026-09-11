# Stage 16: decoded PDF image resources

This checkpoint advances Task 3B from `docs/remaining-work/03-images-and-cover.md` without yet claiming image placement or EPUB image support.

## Stage 15 corpus evidence

The unchanged private 9-PDF / 5,141-page corpus contained only four image paint occurrences. All four were `paintImageXObject`, all four had resource references, no Form-contained image occurred in the corpus, and the Stage 15 operator schema classified all four as supported. All four paint occurrences had clipping state active, so extracting bytes is not by itself evidence that a full uncropped image can be emitted into EPUB.

The first Stage 15 report exposed `sha256:e3b0c44298fc1c14` as a PDF ID. That was not the source file hash: PDF.js can transfer/detach the supplied `Uint8Array`, and the inventory hashed it after `getDocument`. Stage 16 captures byte length and SHA-256 before handing the buffer to PDF.js. Existing content/source handling was unaffected; this bug was limited to the anonymous inventory identity.

## Resource extraction contract

`src/pdf-image-resource-adapter.ts` isolates the pinned PDF.js 6.3.289 image-object schema. It accepts only decoded image objects with explicit positive width/height, a known `ImageKind`, and a byte length matching the declared dimensions.

Supported decoded pixel formats are:

- PDF.js `GRAYSCALE_1BPP` (kind 1);
- `RGB_24BPP` (kind 2);
- `RGBA_32BPP` (kind 3).

No pixel format is inferred from byte length. Bitmap-only objects, missing data, unknown kinds, malformed dimensions and byte-length mismatches remain explicit unsupported results.

Decoded pixels are packaged as deterministic PNG bytes. This is a display-preserving conversion of PDF.js-decoded pixel data, not a claim that the original PDF stream was PNG. Resource identity for future EPUB packaging is the SHA-256 of those deterministic PNG bytes; PDF.js object names remain provenance only and are never used as ZIP paths.

## Resource inventory

Run locally:

```text
npm run inspect:image-resources -- local-samples --output NEW_REPORT.json --expect-pdf-count 9 --expect-page-count 5141
```

The report does not publish filenames or raw PDF.js resource IDs. It records anonymous source-PDF IDs, hashed resource references, decoded dimensions/pixel kind/byte counts, PNG content hashes, distinct paint occurrences and placement transforms.

The required corpus checkpoint before model/EPUB integration is:

1. all four Stage 15 XObject paint occurrences are accounted for;
2. every referenced XObject either yields a validated decoded resource or an explicit failure reason;
3. no resource is silently dropped because multiple occurrences share bytes;
4. content-hash deduplication is distinguished from occurrence deduplication;
5. maximum observed pixels and decoded/output byte sizes are recorded before resource limits are chosen;
6. clipping remains a separate placement concern. `clipObserved=true` is not treated as proof that cropping is harmless.

## Not yet implemented

- image nodes in `FileShapeDocument`;
- text/image reading-order placement;
- clip geometry reproduction;
- EPUB manifest/image references;
- automatic or explicit cover selection.

Those belong to the next Task 3B/3C checkpoint after the private corpus resource report is reviewed. The current EPUB path must continue preserving 9/9 books and 5,141/5,141 source pages without pretending the four images have already been preserved.
