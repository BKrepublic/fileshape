# Stage 3: source provenance, display geometry and exact ruby spans

Stage 2 baseline: `97bb12c`; first run-level candidate pass: `d1a6737`.
This stage adds exact source/glyph spans, not EPUB output.

## Coordinate contract

PDF.js TextItem width/height are run magnitudes before PageViewport rotation and
scale, not display-axis bounding-box dimensions. Mixing them directly with
`displayX/displayY` is unsafe, notably for 90/270-degree pages. The extraction
worker computes run extents from text/font/CTM state; PageViewport is applied
separately by the caller. See the [PDF.js API source](https://mozilla.github.io/pdf.js/api/draft/api.js.html)
and the installed pinned `pdf.worker.mjs` implementation of `ensureTextContentItem`.

`display-geometry.ts` reconstructs oriented inline/cross vectors from TextItem
transform and the font's vertical-writing flag, then transforms both endpoints
and the side vector through the viewport. `displayGeometry` contains:

- start/end in display coordinates;
- directed inline and annotation-side unit vectors;
- inline/cross extents and displayWidth/displayHeight of the advance cell.

Glyph geometry uses the same display coordinates. These are advance cells, not
ink-outline bounds. Ruby compares projections along these vectors, so right/above
rotate with the text at 0, 90, 180 and 270 degrees. The font resource's vertical
metric flag is structural writing-mode information, not a font-name heuristic.
Neither character identity nor punctuation appearance selects behavior.

Legacy Stage 2 geometry fields and text reconstruction are retained. The older
run-level candidate API now requires displayGeometry and no longer combines raw
extents with display positions. New consumers should use `associateRubySpans`.

## Provenance

`SourceTextRef = { page, itemIndex, charStart, charEnd }` uses one-based pages,
TextItem-only indexes (including empty/whitespace items), and half-open UTF-16
ranges into the unmodified extracted TextItem.str. The owning document provides
identity; references are scoped to its extraction, not stable across PDF edits or
changes in extraction options. UTF-16 offsets are deliberately distinct from
glyph indexes and Unicode code-point counts.

`SourceGlyphRef = { page, operatorIndex, glyphIndex }` identifies the operator-list
glyph. Each decoded glyph retains original `unicode`, PDF.js-normalized matching
text, measured geometry, and mapped SourceTextRef ranges. A ligature may map to
multiple UTF-16 code units but is never subdivided by estimated character width.

InspectTextItem stores a full source reference. Physical units copy sourceRanges
in reading order; semantic joins concatenate copies of these ranges. These are
source ranges, not reconstructed-text offsets. Full raw item ranges are retained
including whitespace trimmed from the physical text view. Small text excluded
from Stage 2 remains in InspectPage; it is not deleted by association. This
reference model is reusable for heading/emphasis and the upcoming Document Model.

## Glyph acquisition and isolated internal dependency

`getTextContent()` supplies no per-glyph advances. `getOperatorList()` provides
text-show glyph records with actual widths and vertical metrics, including TJ
spacing numbers. `pdfjs-glyph-adapter.ts` alone interprets this internal schema
and reads font metrics via PDFPageProxy.commonObjs. Font IDs resolve resources;
no spelling or font family controls parser selection.

The adapter replays CTM/save/restore, Form XObject transforms, text matrices,
text moves/leading, Tf (including graphics-state Font), character/word spacing,
horizontal scale, text rise, and showText/TJ advances. It applies PageViewport to
all glyph endpoints. It never divides a run extent by its character count.

PDF.js is pinned to **6.3.289** in package/lock files. A runtime version guard and
unsupported-state/schema checks fail closed with glyphIssues; Stage 2 TextItems
remain available. Upgrading PDF.js requires reviewing CanvasGraphics.showText,
worker buildTextContentItem, and the font/glyph schemas, then rerunning real-PDF
and corpus checks. The adapter is the only dependency on internal font/glyph data.

Operator glyphs are mapped back only when normalized Unicode, start position,
inline/cross alignment, reading direction and final run endpoint agree. Generated
whitespace is retained in TextItem.str without inventing a glyph. Non-unique
matches, bidi differences or normalization mismatches remain unmapped/ambiguous.
Unmapped operator glyphs remain in InspectPage.operatorGlyphs on supported pages.

Use `inspectPdf(path, { includeGlyphs: true })` for this richer extraction. It is
opt-in to avoid storing per-glyph objects for multi-thousand-page Stage 2 checks;
provenance and display run geometry are always extracted. `diagnose:ruby` and
`verify:ruby` enable glyph extraction explicitly.

## Exact span association

1. Preserve every visible small-text item as an annotation candidate. Group
   adjacent annotation runs only with matching direction, side, size and close
   inline endpoints. Extraction order is not a grouping rule.
2. Find base runs on geometrically eligible neighboring baselines using relative
   font size, side distance and inline proximity. Compare in the directed display
   coordinate frame, not fixed display X/Y.
3. Select measured base glyph cells whose center is within the annotation interval
   or whose overlap exceeds one half. Edges through glyph centers stay ambiguous.
4. Require a contiguous, non-overlapping glyph sequence with bounded gaps and
   annotation overhang no greater than half a base em. Preserve exact ranges across
   multiple TextItems, and never split a ligature into guessed positions.
5. Require one unique base choice. Retain alternatives for competing baselines;
   unresolved geometry, discontinuities, duplicate text and conflicting annotation
   ownership do not receive a chosen base span.

Results expose `baseSourceRanges`, `annotationSourceRanges`, base/annotation glyph
references, status, reason, and alternative ranges. Original text is never edited.
“Exact” describes source boundaries grounded in measured glyph cells; geometry
alone cannot prove that a nearby small label is linguistically ruby.

## Validation

New coverage includes real PDF.js standard-font advances at all four rotations;
vertical/horizontal ruby at all four rotations; proportional widths; punctuation;
ligatures and supplementary Unicode; base and annotation split across items;
adjacent/ambiguous columns; unrelated small text; bounded/excessive overhang;
center-boundary ambiguity; conflicting annotations; missing/duplicate glyph
mapping; scale/translation; TJ/spacing/HScale/rise/CTM/Form state; unsupported
Type3 rejection; and provenance through physical and semantic joins.

Local results on 2026-09-11:

- `npm test`: PASS, typecheck and 71/71 tests (31 added to the 40-test baseline).
- `npm run verify:ruby`: PASS, 33 pages, 880/880 visible text runs mapped;
  373 exact candidates and 2 unresolved candidates retained. Representative
  page: 11/11 exact base/annotation pairs, including one- and two-character bases.
- `npm run verify:semantic`: PASS, 7/7 checks.
- `npm run verify:stage2`: PASS, 9/9 PDFs, 5,141/5,141 text-bearing pages with
  semantic output, 12 document-context orientations, zero unresolved orientations
  or empty physical/semantic layouts, font-pair semantic equality 223/223 pages.

Fixture identities and expected strings occur only in verification code. Samples
remain ignored. No GitHub Actions are used.

## Limitations and next step

Unsupported Type3/invalid font metrics, negative font sizes, unusual font matrices,
accent records, annotation/transparency containers and unexpected text operators
currently disable glyph replay for that page, with an explicit issue. Skewed
non-orthogonal frames, bidi/reordered mappings, unmapped normalization, zero-width
combining glyphs, other-side ruby, large overhang and competing choices are not
forced into exact spans. Glyph cells are not font ink outlines. The original
text remains the fallback; no equally divided positions are substituted.

The tested exact-span/provenance representation is ready to be carried into a
typed Document Model. Next: retain the document identity and source store, attach
ruby spans to inline nodes across semantic joins, and preserve unresolved
annotations as candidates. EPUB ruby serialization and semantic distinction from
notes/emphasis remain separate future work. Whole-corpus structural PASS is not
manual ruby certification for every page.
