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
- real EPUBCheck validation of an explicitly selected production image occurrence.

Required commands:

```text
npm test
npm run verify:epubcheck
```

## Private acceptance still required

Because this changes package/CLI behavior, Stage 20 is not accepted until a fresh private-corpus default full regression passes and one existing private image occurrence is selected explicitly for a cover smoke test. The default run must preserve the Stage 19 aggregate: 9 EPUBs, 5,141 pages, 6,387 unresolved annotations, 250/250 outline entries, 4 image occurrences, 1 unique PNG content resource, consistent XHTML/OPF/ZIP references, and EPUBCheck 9/9 clean.

The cover smoke test must verify only privacy-safe aggregate facts: selector resolves, exactly one OPF image item has `cover-image`, no extra PNG is created, the selected body occurrence remains present, and EPUBCheck is clean. Private image/PDF/EPUB/report data must not be committed.
