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

The next private corpus check must classify all four known image occurrences before adding image nodes/manifest references to production EPUB output.
