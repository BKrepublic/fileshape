# Stage 2 orientation repair

## Diagnosis

The last unresolved corpus page contains a long vertical text run and a compact
run at its endpoint. After annotation filtering only these two items remain.
The vertical-run ratio is 0.5 and the two baseline directions also split 0.5/0.5.
The previous page is vertical and the following page horizontal, so the existing
document-context resolver correctly refuses to bridge that transition.

The long run measures approximately 12.46 by 91.14 points. The compact run
measures 9.75 by 11.96 points, starts at the long run's inline endpoint, and is
offset across the column by approximately 4.12 points. A rendered source page
confirms that both belong to one vertical column. No document-edge assumption
is needed.

## General rule

Only if the existing page detector returns unknown, consider each reading axis:

- Require a multi-character anchor at least three font sizes long, with an
  inline-to-cross-axis extent ratio greater than 1.5.
- Every other item must be compact (both dimensions at most 1.5 font sizes).
  A competing elongated run rejects the candidate.
- Every compact item must attach to an anchor or an already attached item:
  font-size ratio at least 0.75, cross-axis origin difference at most 0.5 of
  the larger font size, inline endpoint gap at most 0.75 of that size, and
  forward progress along the reading axis.
- Accept only a unique candidate axis. Preserve the raw metrics.

The rule uses item dimensions, positions and font-size ratios, never file
identity, page number, metadata, character identity or glyph appearance.
The document resolver, physical/semantic separation and verifier gates are
unchanged. This is a conservative fallback, not general mixed-layout detection.

## Regression coverage

Eight added tests cover vertical and horizontal attachments through semantic
output, detached elements on either axis, competing long runs, absence of an
anchor, and independence from Unicode content, glyph transform and page number.
Existing tests retain short middle-run inference, transition rejection,
document-edge rejection without evidence, and long-run rejection.

## Validation

Validated locally on 2026-09-11:

- `npm test`: PASS, typecheck and 31/31 tests.
- `npm run verify:semantic`: PASS, 7/7 checks.
- `npm run verify:stage2`: PASS, 9/9 PDFs, 5,141/5,141 text-bearing pages with
  semantic output, 12 pages resolved by document context, zero unresolved
  orientations or empty physical/semantic layouts, font pair 223/223 pages equal.

These are structural corpus gates and targeted semantic regressions, not a
manual certification of every sentence on every page or proof for every PDF.
Local source PDFs remain ignored and are not part of the repository.
