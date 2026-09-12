# Stage 20 explicit cover policy

Stage 20 adds an explicit cover designation without introducing cover inference.

## Contract

- default conversion has no cover designation;
- CLI selector: `--cover-occurrence PAGE:OPERATOR:OCCURRENCE`;
- page must be a positive safe integer; operator and occurrence indexes must be non-negative safe integers;
- selector resolves only against exact `DocumentImageOccurrence` provenance;
- zero matches fail; multiple matches fail; missing resource fails;
- resolved resource is passed to the EPUB package as `coverImageResourceId`;
- OPF adds `properties="cover-image"` only to that existing image manifest item;
- no synthetic cover XHTML/spine item is added;
- original body occurrence remains unchanged and visible in its original position;
- shared content resource stays deduplicated even when one of several occurrences selected it as cover;
- page number, dimensions, position, filename, appearance, OCR/content, Creator/Producer, or other heuristics are never used to choose a cover.

## Failure boundary

Cover parsing/resolution/package validation occurs before the final output replacement. Invalid or stale selectors therefore fail the conversion without intentionally replacing the existing output path.

## Public validation

Focused tests cover:

- exact selector parsing and malformed values;
- exact occurrence resolution;
- missing and ambiguous provenance;
- no inferred cover by default;
- one OPF `cover-image` marker for a selected shared resource;
- preservation of all body occurrences;
- package rejection of a missing cover resource;
- real EPUBCheck validation of an explicitly selected production image occurrence;
- archive-level cover marker accounting through the same image-package validator used by full-corpus verification.

`verify:cover` is a local/private smoke verifier. It scans the unchanged private corpus only to obtain one exact existing image occurrence, then performs both default and explicit-cover conversions of that same PDF. This is test selection only; production conversion never auto-selects a cover. The verifier exposes only aggregate results and deletes generated EPUBs after the check.

Required public commands:

```text
npm test
npm run verify:epubcheck
```

## Private acceptance

The fresh default full-corpus regression passed on 2026-09-12:

```text
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Total EPUB bytes: 17959256
Outline entries: 250/250; outline PDFs: 6/6; unresolved outline entries: 0
Image occurrences: 4/4; unique PNG content resources: 1/1; XHTML/OPF/ZIP references: consistent
EPUBCheck 5.3.0: 9/9 passed (0 errors, 0 warnings)
```

This confirms that merely adding the explicit-cover option does not alter default output behavior or the accepted Stage 19 image contract.

The private explicit-cover smoke also passed:

```text
COVER_SMOKE=PASS
PDFS=9
BODY_IMAGE_OCCURRENCES=1
PNG_RESOURCES=1
COVER_MARKERS=1
BODY_OCCURRENCES_PRESERVED=yes
PNG_RESOURCES_UNCHANGED=yes
EPUBCheck 5.3.0: pass (0 errors, 0 warnings)
```

The smoke selected one exact existing image occurrence only for test execution. It confirmed that the explicit cover marker is unique, no extra PNG resource is created, the original body occurrence is preserved, and the resulting EPUB remains standards-clean.

## Acceptance

**Stage 20 is accepted.** Explicit cover selection is source/user-backed only; automatic cover inference remains intentionally absent. Future source-native cover metadata may be added if trustworthy evidence becomes available, but it must not weaken this explicit/fail-closed contract.

Private image/PDF/EPUB/report data are not committed.
