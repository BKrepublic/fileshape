# Stage 19 review — Stage 17 -> Stage 19

Review date: 2026-09-12

Reviewed range:

```text
base: 78f0728c515324c22c286ed41327426772f17eac
implementation: 254b001aa6903ab18056b271d0b31d8c5154d2ca
hardening ancestor: f92ba16d7ccbcb48f6f89a6f7bc528a5fe3c106c
```

The original independent review found seven production-safety/acceptance gaps. All blockers were addressed before final private acceptance.

## Resolution status

### R1 — non-uniform image scaling

**Resolved.** The supported EPUB image subset now rejects transforms whose displayed aspect ratio cannot be reproduced safely from the decoded resource. Non-uniform scaling is fail-closed rather than silently normalized to intrinsic PNG aspect ratio.

### R2 — external PDF graphics-state compositing

**Resolved for the supported subset.** Production image acceptance now inspects the pinned PDF.js operator-list graphics state at image paint time and requires supported default compositing. Non-default fill alpha, blend mode, soft mask, transfer map, unsupported transparency-group state, or unknown compositing evidence fail closed.

### R3 — overlapping/layered images

**Resolved by fail-closed policy.** Accepted image display bounds on the same page may not overlap. Layered/composited images require a future explicit composition model and are not flattened heuristically.

### R4 — model geometry/clip cross-check

**Resolved.** Typed model validation cross-checks `displayTransform`, transform-derived bounds, `displayBounds`, `clipStatus`, `clipCoverage`, and `clipRect`, including corruption fixtures.

### R5 — production limits after PNG construction

**Resolved for the pinned decoded-resource path.** Width/height/pixel and available decoded-byte evidence are preflighted before PNG construction/copying. Final document-wide decoded/PNG/resource/occurrence budgets remain enforced after extraction as a second boundary.

### R6 — full-corpus image package accounting

**Resolved.** `verify:epub` cross-checks XHTML image occurrence count, unique PNG archive resources, OPF image manifest items, and XHTML -> OPF -> ZIP target consistency.

### R7 — interpolation evidence transported but not rendered

**Resolved conservatively.** `interpolate=true` currently fails closed at EPUB rendering rather than being ignored. The production image-model verifier reports interpolated occurrence count. The accepted private corpus has `INTERPOLATED_IMAGE_OCCURRENCES=0`.

## Final acceptance evidence

Private full-corpus acceptance on 2026-09-12:

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

Image-model, ruby, and Stage 2 full-corpus regressions also passed in the same acceptance sequence. Public CI passed typecheck/unit tests and real EPUBCheck integration on the hardening implementation.

## Accepted limitations

The converter still does not claim generic reproduction for cropped/complex clips, arbitrary transparency/compositing, layered images, unsupported masks/schemas, or interpolated image rendering. These remain explicit fail-closed boundaries.

No current verifier was weakened, and no private source/PDF/image/report was committed.

Stage 19 ordinary image preservation is **accepted**. The next image-related checkpoint is explicit/source-backed cover selection; cover inference from page, dimensions, position, filename, appearance, or content remains prohibited.
