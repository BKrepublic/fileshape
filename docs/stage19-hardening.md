# Stage 19 hardening

Stage 19 production image integration was hardened after an independent review found generic safety gaps that did not appear in the original private corpus.

## Implemented hardening

- reject non-uniform image scaling that would change rendered aspect ratio;
- inspect PDF graphics-state compositing at image paint time and reject non-default alpha/blend/soft-mask/transfer/transparency state;
- reject overlapping/layered image occurrences rather than flattening them heuristically;
- cross-check typed-model display transform, derived bounds, clip rectangle, and clip coverage;
- preflight raw decoded image dimensions/pixels/decoded bytes before PNG construction where the pinned PDF.js resource shape exposes them;
- keep document-wide production resource/occurrence/decoded/PNG limits at the final boundary as a second check;
- fail closed for interpolated image occurrences until reader-equivalent rendering is supported;
- report interpolated occurrence count in the production image-model verifier;
- extend full EPUB verification to cross-check XHTML image occurrences, OPF image items, PNG ZIP resources, and all relative references.

Public focused tests cover the positive/default path and the new rejection boundaries. Old inconsistent synthetic fixture transforms were corrected rather than weakening the production invariant.

## Final private acceptance

Accepted on 2026-09-12 with hardening included:

```text
HEAD=03f1d7342019216dc648380b7d7eb6dc9a02cd56
IMAGE_MODEL_EXIT=0
RUBY_EXIT=0
STAGE2_EXIT=0
VERIFY_EPUB_EXIT=0

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

No verifier expectations were weakened to reach this result. Private PDFs, extracted images, generated EPUBs, and local reports remain outside Git.

Stage 19 hardening is **accepted**. The next image checkpoint is explicit/source-backed cover selection.
