# Stage 13a: outline destination → source evidence

This checkpoint implements Task 1A from `docs/remaining-work/01-headings-and-sections.md`. It is an evidence tool only. It does **not** add body heading roles, section boundaries, XHTML headings, or precise EPUB anchors.

## Command

```text
npm run inspect:outline-evidence -- PDF_OR_DIRECTORY --output NEW_FILE [--expect-outline-count N]
```

For the current private regression corpus use `--expect-outline-count 250`. Output files must remain local-only; `--output` uses exclusive creation and refuses to overwrite an existing report.

## Privacy and source contract

The JSON report never emits PDF filenames, outline titles, body text, URLs, or named-destination strings. Each PDF is identified by SHA-256 and a shortened anonymous ID. Outline titles and named-destination names are represented only by SHA-256 plus length so duplicate controls can be detected without publishing source strings.

Explicit destination arrays are retained structurally (page references, destination mode, numeric coordinates). Named destinations are resolved through PDF.js, and the resolved destination array is recorded separately. No destination name is treated as coordinate evidence.

## Coordinate contract

Destination coordinates remain PDF coordinates until they are transformed by the target page's PDF.js `PageViewport`. The report records page rotation, `UserUnit`, page view, viewport transform and display-space destination geometry.

Supported explicit destination forms:

- `XYZ`: point when both coordinates are explicit, otherwise a page-spanning line for the explicit axis, otherwise page-only;
- `FitH` / `FitBH`: transformed horizontal-PDF-coordinate line when `top` is explicit;
- `FitV` / `FitBV`: transformed vertical-PDF-coordinate line when `left` is explicit;
- `FitR`: transformed rectangle;
- `Fit` / `FitB`: page-only.

Unknown or malformed destination forms are retained as `unmappable`. No nearest-text search is performed.

## Source evidence classes

Each resolved outline entry receives one of four evidence classes:

- `unique-position`: the transformed destination geometry intersects exactly one existing physical text unit;
- `ambiguous-position`: it intersects more than one physical unit;
- `page-only`: the PDF destination resolves to a page but does not establish one source unit (page destination, no intersection, unresolved writing orientation, empty layout, or no visible text);
- `unmappable`: destination/page resolution itself is invalid, external, absent, or unsupported.

`unique-position` means only that a PDF destination has one geometrically intersected physical unit. **It is not evidence that the unit is a heading or that a chapter starts there.** A heading/section rule may be designed only after the full 250-entry corpus evidence is reviewed.

The intersection test uses the measured display geometry already attached to source TextItems. Candidate records contain `SourceTextRef[]`, TextItem indexes, glyph source refs and display bounds. It does not substring-match outline titles, split ligatures, divide run widths, or inspect character appearance.

## Relationship controls

The report also records, without text:

- how many outline entries resolve to the same page;
- exact duplicate resolved destinations;
- duplicate title hashes (same title at different locations is observable without using the title for mapping);
- parent/child entries resolving to the same page;
- non-monotonic target-page order in outline traversal.

These controls are evidence for ambiguity analysis, not tie-breakers.

## Automated controls

`test/outline-source-evidence.test.ts` covers:

- viewport-based coordinate conversion rather than assuming PDF/display axes;
- exact source-range transport across a ligature plus supplementary Unicode;
- ambiguous multi-unit intersections without nearest-unit guessing;
- a real PDF fixture with 0/90/180/270 page rotations and duplicate destinations/titles;
- aggregate accounting of evidence classes and relationship flags.

## Private corpus result

The unchanged 9-PDF private corpus was scanned at code baseline `e237f63b78be5fa964c8bddcce417a8b341f1edb`. All 250 outline entries were accounted for:

```text
OUTLINE_ENTRIES=250
CLASS_COUNTS={"unique-position":0,"ambiguous-position":0,"page-only":250,"unmappable":0}
DESTINATION_KIND_COUNTS={"XYZ":172,"Fit":78}
REASON_COUNTS={"no-source-intersection":172,"page-destination":78}
RELATIONSHIP_COUNTS={"entriesSharingPage":24,"entriesSharingResolvedDestination":0,"entriesSharingTitleHash":0,"parentSamePage":12,"nonMonotonic":0}
```

All 78 `Fit` destinations are page-level by definition. The 172 `XYZ` entries resolve to a page/display point, but none intersects a physical source unit under the conservative geometry contract. There are therefore **zero source-backed body anchors** in this corpus from outline destinations.

This result does not justify nearest-text selection, title/body string matching, or using outline depth as an inferred heading level. Task 1B/1C remains on hold because the required source-boundary evidence is absent. Existing Stage 12a page-level navigation remains the accepted fallback.

Task 2 resource/display work may proceed against the current body output as explicitly allowed by the remaining-work runbook. Task 1 should be revisited only if a new PDF-native evidence source establishes body boundaries without guessed text matching.
