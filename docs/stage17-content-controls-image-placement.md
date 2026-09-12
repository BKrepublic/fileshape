# Stage 17: content controls and image placement evidence

This checkpoint follows the private Stage 16 corpus resource inventory and keeps the EPUB path conservative.

## Stage 16 corpus result

The 9-PDF / 5,141-page corpus contains four image paint occurrences. All four are 800x600 RGB24 XObjects, all four decode successfully, and all four produce the same deterministic PNG content hash. The four occurrences remain distinct even though the underlying content resource can be stored once. No mask, Form-contained image or unsupported image schema occurs in this corpus checkpoint.

All four occurrences have an explicit PDF clip active. Therefore resource extraction alone is still not enough to emit the images into EPUB. Stage 17 extends the pinned operator replay to classify exact rectangular clips separately from complex/unknown clips and to report whether an exact clip actually crops the transformed image unit square.

## Ruby display control

Exact ruby remains source-backed in `FileShapeDocument`. EPUB serialization now accepts `rubyMode: "on" | "off"`, defaulting to `on`.

- `on`: render exact spans as XHTML `<ruby><rt>`.
- `off`: render only the exact source-backed base text. The document model and source provenance are not mutated.
- unresolved ruby candidates are deliberately independent. `rubyMode: "off"` does not silently delete uncertain annotation text. They still follow `unresolvedRubyPolicy`.

The CLI exposes this as `--ruby on|off`.

## Unsupported or reader-specific effects

FileShape uses a safe-normalization rule rather than deleting unknown content by tag name:

1. EPUB/XHTML/CSS semantics that are broadly supported may be mapped directly.
2. A presentation-only wrapper that cannot be represented may be unwrapped while retaining its child text/image content and source order.
3. Content-bearing, replacement, hidden, interactive, or otherwise ambiguous effects must not be silently deleted. Preserve an unambiguous fallback when available; otherwise retain an explicit unresolved diagnostic or fail closed.
4. Scripted or proprietary reader-specific behavior is not emitted by default.

No generic "unknown tag = delete subtree" rule is permitted. A future tagged/marked-content effect adapter must inventory observed roles/tags before adding conversion rules.

## Image clip evidence

`src/pdf-image-adapter.ts` now tracks explicit clipping through the pinned PDF.js operator list. Only a pure rectangle path whose transformed edges remain axis-aligned is classified as `exact-rect`. Multiple exact rectangular clips are intersected. Any other path becomes `complex-or-unknown`.

Each image paint records:

- transformed image bounds;
- clip status and exact clip rectangle when proven;
- `none`, `contains-image`, `crops-image`, or `unknown` coverage.

`contains-image` means the explicit exact clip does not alter the visible image. It is the only Stage 17 clip result that can advance to ordinary reflowable EPUB image placement without cropping. `crops-image` requires deterministic pixel cropping first. `unknown` remains blocked until the clip can be reproduced or an explicit policy is chosen.

## Final private corpus result — 2026-09-12

The complete unchanged private corpus was scanned after Stage 17 merged to `main` at:

```text
de07e5c2beda42ad8f2da296a36e637491589016
```

Image clip inventory:

```text
PDFS=9
PAGES=5141
IMAGE_PAINTS=4
CLIP_STATUS_COUNTS={"exact-rect":4}
CLIP_COVERAGE_COUNTS={"contains-image":4}
IMAGE_ISSUES=0
```

For all four occurrences, `clipRect` matches/contains `displayBounds`. No occurrence is actually cropped. Combined with Stage 16, the current corpus therefore has four distinct image occurrences backed by one identical deterministic PNG content resource, and all four may proceed to ordinary EPUB image placement without pixel cropping.

Marked-content inventory over the same 5,141 pages:

```text
MARKED_OCCURRENCES=0
TAG_COUNTS={}
WRAPPER_TAG_COUNTS={}
POINT_TAG_COUNTS={}
MAX_MARKED_DEPTH=0
MARKED_ISSUES=0
```

The private corpus therefore contains no observed PDF marked-content tag that needs a special-effect mapping. The generic safe-normalization policy remains part of FileShape's input contract for future PDFs, but no corpus-specific special-tag rule should be invented.

## Stage 17 conclusion

Stage 17 evidence gathering is complete for the current private corpus. The next checkpoint is **production image integration** under `docs/remaining-work/03-images-and-cover.md`:

- add typed image resource/occurrence representation;
- keep resource deduplication separate from occurrence provenance;
- package the deterministic PNG resource in EPUB;
- place the four occurrences from source/geometry evidence;
- retain fail-closed handling for cropped/complex/unknown clips and unsupported image schemas through synthetic fixtures;
- do not infer a cover from appearance.

See `docs/codex-handoff-20260912.md` for the next-session entry point.
