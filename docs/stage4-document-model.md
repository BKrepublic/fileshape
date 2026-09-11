# Stage 4: typed FileShape Document Model

Baseline: `2fff0b2a59476c773593b73c939e7163f7b8cc29` (Stage 3 exact ruby/source provenance).
This stage introduces an output-format-independent typed model. It does **not** implement EPUB/HTML serialization.

## Boundary

```text
PDF extraction
    ↓
physical layout
    ↓
semantic blocks
    ↓
exact ruby/source provenance
    ↓
FileShapeDocument        ← this stage
    ↓
content policy/filter
    ↓
EPUB/HTML/etc renderer   ← later stage
```

The model never stores EPUB-oriented HTML as its structural representation.

## Source identity and source store

`FileShapeDocument.id` owns all `SourceTextRef` values in the model. The same ID is repeated by `DocumentSourceStore.documentId` and validated as an invariant.

The source store copies every unmodified `InspectTextItem.text` (`PDF.js TextItem.str`) in item-index order for every page. `SourceTextRef` therefore continues to mean a half-open UTF-16 slice of exactly that source item. The store does not reconstruct or normalize text, and semantic strings are not treated as the source of truth.

`resolveSourceTextRef` and `resolveSourceRanges` validate page/item/range boundaries before slicing. Supplementary Unicode therefore retains UTF-16 offsets, and a ligature range is not subdivided by character or glyph count.

The store is deliberately narrow: existing extraction geometry/glyph data remains owned by the inspection/Stage 3 structures instead of being copied into a second competing source representation.

## Typed structure

The minimum model is:

- `FileShapeDocument`
  - document identity and source store
  - ordered `DocumentPage[]`
- `DocumentPage`
  - source page number, page rotation and resolved writing orientation
  - ordered `DocumentTextBlock[]`
  - unresolved ruby candidates and fail-closed unmapped exact spans
- `DocumentTextBlock`
  - current semantic block identity/unit indexes
  - existing Stage 2 `semanticText`
  - complete source coverage for the block
  - typed inline nodes
- `InlineNode`
  - `TextInlineNode`
  - `RubyInlineNode`

Only the current `text` block kind is implemented. The discriminated unions establish the extension boundary for later heading/paragraph/emphasis/note/image work without pre-implementing those features.

## Inline provenance

Ordinary text inline nodes retain `SourceTextRef[]`. Their `text` value is resolved from those source ranges and is therefore independently checkable against the original TextItems. The semantic block also retains the existing Stage 2 `semanticText` as a derived semantic view; source text and semantic text are intentionally not collapsed into one truth because Stage 2 may trim physical-view whitespace while provenance keeps full original item ranges.

Inline splitting is driven only by source ranges. It does not locate ruby by searching a reconstructed string, dividing a run by character count, or estimating per-character width.

## Exact ruby mapping

Every `RubySpan` with `status === "exact"` is assigned to exactly one semantic block only when its complete `baseSourceRanges` are covered by that block's source ranges. Block ranges are then split at exact ruby base boundaries.

A ruby inline node retains:

```text
RubyInlineNode
 ├─ base
 │   ├─ text (resolved from sourceRanges)
 │   ├─ sourceRanges
 │   └─ glyphRefs
 └─ annotation
     ├─ text (resolved from sourceRanges)
     ├─ sourceRanges
     └─ glyphRefs
```

Base and annotation ranges may span multiple TextItems. A base may also cross a semantic physical-wrap join because semantic blocks already retain the ordered source ranges from every joined unit. Ligatures remain indivisible because Stage 4 consumes the exact Stage 3 ranges rather than inventing smaller boundaries.

If an exact span cannot be assigned to exactly one semantic block, it is retained in `unmappedExactRuby` rather than guessed or discarded. Document validation treats this as an error, keeping automatic rendering fail-closed.

## Unresolved ruby

All Stage 3 `status === "unresolved"` candidates are copied to `DocumentPage.unresolvedRuby` with:

- reason;
- annotation source ranges;
- any base source ranges;
- annotation/base glyph references;
- alternatives.

Thus unrelated small text, ambiguous choices, missing glyph geometry and conflicting annotations remain recoverable for later policy or parser improvements. Annotation text is never removed merely because ruby status is unresolved.

## Invariants

`validateDocumentModel` / `assertDocumentModel` check the model without changing parser behavior:

- document/source-store identity agrees;
- source pages and source item indexes are addressable;
- every source range is a valid half-open UTF-16 range;
- ordinary inline text equals the source text resolved from its ranges;
- ruby base/annotation text equals its source ranges;
- inline base/text ownership has no overlap;
- inline base/text ownership exactly covers the semantic block's source ranges;
- unresolved candidates remain unresolved;
- unmapped exact spans are reported as invalid rather than silently rendered.

Ruby annotation ranges are intentionally outside normal block ownership: annotations are source evidence attached to a ruby node, not duplicated body text.

## Parser principles

No source website, filename, URL, metadata, N-code, generator name, font name or character appearance controls Document Model behavior. Stage 4 consumes only existing structural results and source/glyph references. It never changes extracted Unicode based on glyph appearance.

## Tests

`test/document-model.test.ts` covers:

1. plain source-backed text;
2. one exact ruby;
3. base across multiple TextItems;
4. annotation across multiple TextItems;
5. source ranges across a semantic join;
6. ligature source ownership without subdivision;
7. supplementary Unicode / UTF-16 offsets;
8. unresolved ruby retention;
9. ambiguous alternatives retention;
10. non-ruby small text retention;
11. whitespace/source range preservation despite a trimmed semantic view;
12. vertical/rotated provenance transport;
13. invariant detection of overlapping inline ownership.

## Next boundary

After this model passes the repository's full regression suite, EPUB serialization can consume typed nodes without changing parser decisions. The renderer should map ruby nodes to EPUB3 ruby markup and separately decide writing mode, paragraph/heading presentation, whitespace policy, content filters, navigation and package metadata. Those concerns do not belong in this stage.
