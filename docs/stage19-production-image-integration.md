# Stage 19 production image integration

Stage 19 connects the accepted PDF image subset to the production PDF -> EPUB path. The implementation preserves occurrence provenance separately from deduplicated PNG content resources, derives text/image placement from PDF geometry, writes ordered XHTML image occurrences, registers image resources in OPF, and packages deterministic PNG paths into the EPUB ZIP.

## Production contract

- `DocumentImageOccurrence.placementIndex` is derived only from `PhysicalPageLayout`, semantic block `unitIndexes`, and image display geometry.
- ambiguous placement, unresolved text orientation, unsupported transform, crop/complex clip, unsupported schema, or unsupported compositing fail closed.
- image content is deduplicated by SHA-256 content hash, while every source occurrence remains distinct.
- image resources use `OEBPS/images/<contentHash>.png`; XHTML, OPF manifest, and ZIP entries must agree exactly.
- image-only pages remain distinct from blank pages.
- converter output is replaced only after a complete archive has been produced; failed conversion does not intentionally replace the existing output.
- production resource/occurrence/decoded/PNG limits are centralized and are checked both before expensive PNG construction where possible and again at the document/package boundary.

## Independent review hardening

The Stage 17 -> Stage 19 review identified seven areas. Before acceptance, the implementation was hardened as follows:

- R1: non-uniform image scaling is rejected rather than silently changing aspect ratio.
- R2: image paints are accepted only when PDF graphics-state compositing is proven to be the supported default; non-default alpha, blend, soft-mask, transfer-map, and unsupported transparency state fail closed.
- R3: overlapping/layered accepted image occurrences are rejected until a compositing representation exists.
- R4: model validation cross-checks transform-derived bounds, display bounds, clip rectangle, and clip coverage instead of trusting fields independently.
- R5: per-resource width/height/pixel/decoded-byte preflight limits run before PNG construction/copying when PDF.js exposes the raw decoded resource shape.
- R6: the full EPUB verifier counts and cross-checks XHTML image occurrences, unique PNG ZIP resources, OPF image items, and XHTML -> OPF -> ZIP references.
- R7: interpolation evidence is not silently ignored. Interpolated occurrences currently fail closed at EPUB rendering, and the private corpus verifier reports their aggregate count.

Focused public fixtures cover each fail-closed boundary. The production subset was not widened merely to make the private corpus pass.

## Final private-corpus acceptance

Accepted on 2026-09-12 at implementation/hardening ancestor:

```text
03f1d7342019216dc648380b7d7eb6dc9a02cd56
```

Local private-corpus result:

```text
PDFS=9
PAGES=5141
MODEL_IMAGE_RESOURCES=4
IMAGE_OCCURRENCES=4
UNIQUE_CONTENT_RESOURCES=1
INTERPOLATED_IMAGE_OCCURRENCES=0

FILESHAPE EPUB FULL CORPUS RESULT: PASS
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Total EPUB bytes: 17959256
Outline entries: 250/250; outline PDFs: 6/6; unresolved outline entries: 0
Image occurrences: 4/4; unique PNG content resources: 1/1; XHTML/OPF/ZIP references: consistent
EPUBCheck 5.3.0: 9/9 passed (0 errors, 0 warnings)
All corpus PDFs completed end-to-end PDF -> EPUB conversion.
```

The same acceptance run also passed:

- production image-model verifier;
- ruby regression;
- Stage 2 full-corpus regression;
- hardened 9-PDF generated-EPUB regression with EPUBCheck.

Therefore ordinary production image preservation for the current supported subset is **accepted**.

## Scope not claimed by Stage 19

Stage 19 does not claim support for arbitrary layered/composited PDF graphics, cropped/complex image effects, unsupported masks, or interpolated image reproduction. Those remain fail-closed rather than silently approximated.

Cover selection is intentionally separate. No image is inferred to be a cover from page number, dimensions, position, filename, appearance, or content. The next image checkpoint is an explicit/source-backed cover policy that preserves the original body occurrence.

Private PDFs, extracted images, generated EPUBs, and local reports are not committed.
