# Stage 3 review and first ruby association pass

Started after Stage 2's full corpus PASS and commit `97bb12c`.

## Review findings

- `pdf-inspector.ts` retains all text items, including small-font annotations,
  with coordinates. It currently exposes text-run dimensions rather than
  individual glyph advances for multi-character runs.
- `text-flow.ts` and `physical-layout.ts` exclude small text independently;
  raw extraction survives, but physical units contain concatenated text without
  source item/character references.
- `semantic-blocks.ts` retains physical unit indexes, but has only plain-text
  blocks. A typed inline/ruby Document Model and EPUB serialization are still
  future work; the current repository is a parser/diagnostic foundation.
- Image paint counts exist; extracted image assets, headings and emphasis
  associations do not yet exist.

Ruby association is the next target because extraction already preserves the
needed small-text candidates. Exact base character selection first needs glyph
advances and provenance through physical units and semantic joins.

## Implemented initial scope

`associateRubyCandidates` produces a separate, non-mutating candidate list:

- Small visible text below 0.75 of the body font size is retained as a candidate.
- A nearby base must have a size ratio from 0.35 up to (but not including) 0.75,
  with the candidate on its right for vertical text or above for horizontal text.
- Cross-axis origin separation must be 0.45 to 1.35 base font sizes; at least
  60% of the annotation's inline extent must overlap the base, with overhang
  limited to half a base font size.
- Exactly one qualifying base run produces an association. Multiple bases,
  missing proximity or unknown orientation produce an explicit unresolved reason.
- Results reference original extraction indexes and the annotation's inline
  interval. They do not assert exact base character offsets or prove ruby semantics.

No filename, site, metadata, character identity, font identity or glyph appearance
selects parser behavior. The original page and Stage 2 output are not mutated.

## Validation

- `npm test`: typecheck and 40/40 tests PASS (9 new ruby tests).
- Positive vertical/horizontal cases, wrong-side/distant candidates, ambiguity,
  missing inline overlap, unknown orientation, invalid sizes, source preservation,
  and scale/translation independence are covered.
- `npm run diagnose:ruby -- local-samples/N5221GF.pdf 4`: all 11 small-text
  candidates link to the expected containing body runs. Source coordinates and
  the rendered page were inspected. This is run-level validation, not exact
  character-span or all-corpus ruby certification.

The CLI accepts any PDF and an optional page number for diagnostics only.

## Next implementation boundary

1. Retain glyph advances and stable item/character references without guessing
   proportional-font character widths by dividing the text-run extent.
2. Associate grouped ruby with exact contiguous base spans, including bases
   split across extraction items. Preserve ambiguous candidates and original text.
3. Carry these spans through physical units and semantic joins into a typed
   inline Document Model, then emit EPUB3 ruby elements.
4. Add rotated-page, proportional-font, dense adjacent-column, overhang and
   non-ruby-small-text fixtures before enabling automatic ruby output.

This first pass supports a unique containing run only; glyph-level ranges,
other-side ruby, mixed orientations and semantic distinction from notes/emphasis
remain unimplemented. Existing semantic text intentionally remains the Stage 2
baseline until the typed representation and its tests are ready.
