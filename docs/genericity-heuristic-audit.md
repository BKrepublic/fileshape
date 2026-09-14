# Genericity heuristic audit

Purpose: FileShape must generalize to unknown PDFs at large scale. The nine-book corpus is diagnostic evidence, not the product domain. A rule is acceptable only when it is justified by source-observable evidence that can occur in arbitrary PDFs. Sample-specific identifiers and sample-derived geometry are never production features.

## Classification

- **A — source-derived/general**: directly based on PDF structure or document-internal statistics and not tied to one known layout.
- **B — empirical threshold**: content-agnostic, but a fixed cutoff/multiplier needs calibration and metamorphic testing before it can be trusted at large scale.
- **C — sample-shaped evidence**: code/comments show that a value was chosen to repair one known corpus layout. This must be replaced by a generic estimator or document-level model.
- **D — architectural generality blocker**: not a filename/content special case, but the data flow prevents a generic decision because evidence is discarded or a local decision is frozen too early.

## `src/text-flow.ts`

### A: keep the evidence, not necessarily the cutoffs

- dominant body font is estimated from character-weighted font-size recurrence within the page;
- orientation evidence is geometric: run aspect ratio, transform baseline direction, single-glyph sequence direction;
- vertical/horizontal units are reconstructed from display geometry rather than Unicode semantics;
- line/column pitch uses document/page measurements such as quartiles rather than chapter words or generator fingerprints.

These are the right *kinds* of evidence.

### B: fixed empirical decisions that need calibration

Current constants include:

- margin candidate: short text `<= 8` characters, top `< 0.08`, bottom `> 0.90`, font `< 0.98 * body`;
- similar-font sequence: ratio `>= 0.75`;
- glyph adjacency distance `0.5 .. 2.75 * fontSize`;
- axis dominance `1.5x`;
- elongated anchor `>= 3 * fontSize`, aspect `> 1.5x`;
- attachment cross offset `<= 0.5 * fontSize`, inline gap `<= 0.75 * fontSize`;
- orientation votes `0.6`, single-character threshold `0.7`, baseline dominance `1.5x`;
- clustering tolerance `max(1.5, 0.42 * bodyFontSize)`;
- normal pitch fallback `1.65 * bodyFontSize`;
- paragraph gap `max(1.55 * normalPitch, normalPitch + 1.25 * bodyFontSize)`;
- glyph-column shift `max(8, 1.25 * bodyFontSize)`;
- annotation/body split `< 0.75 * bodyFontSize`.

None of these use filenames or words, but they are still global magic numbers. They must be tested against scale/font/page-size/layout transformations and, where possible, replaced by per-document distributions and confidence margins.

### D: orientation is collapsed too early

`detectOrientation()` returns only `vertical | horizontal | unknown`. It discards the reason and strength of the decision even though multiple evidence channels are already computed. A weak `horizontal` and an overwhelming `horizontal` become indistinguishable downstream.

Required change: return an orientation observation containing at least vertical evidence, horizontal evidence, confidence/margin, evidence sources and a provisional label. The document-level resolver must consume this evidence rather than only the label.

## `src/document-orientation.ts`

### B

- `maxUnknownRun = 8` is a fixed document-scale assumption.

### D: only `unknown` can be corrected

The resolver deliberately preserves every page already labelled vertical/horizontal. Therefore a weak false positive can never be repaired by strong neighbouring/document evidence. This is directly incompatible with robust generalization.

Required change: document-context resolution must be able to revise *weak* known observations while protecting high-confidence local evidence and real orientation transitions. Context should be based on confidence-weighted runs/segments, not filenames or page numbers.

## `src/physical-layout.ts`

### C: explicit sample-derived tuning

`isMarginNoise()` contains an explicit comment naming `N8440FE` and justifies changing the lower-margin cutoff from 90% to 88% from that sample's measured page-number position. The runtime does not branch on the filename, but the threshold itself is visibly corpus-fitted.

This is the clearest current overfitting example.

Required change: detect marginal repeated material using document-internal recurrence/position/style evidence. A footer should be removable because it recurs in a stable margin band with a distinct style/position pattern, not because all PDFs are assumed to put page numbers below 88% of page height.

### B

Other duplicated constants from `text-flow.ts` include `0.75` annotation split, `0.7` single-glyph mode, `0.42` clustering tolerance and `max(8, 1.25 * bodyFontSize)` for glyph columns.

### D: duplicated classification logic

Margin filtering, annotation filtering, and single-glyph/run selection are independently repeated in `text-flow.ts` and `physical-layout.ts`. The two stages can drift, as already happened with bottom-margin cutoffs (`0.90` vs `0.88`).

Required change: compute a compact per-item/page evidence model once and feed the same classification into flow/layout/ruby stages.

## `src/semantic-blocks.ts`

### A

The model uses physical gap and inline-coverage evidence and does not inspect words.

### B

Current fixed wrap/boundary cutoffs:

- normal-gap allowance `1.35x` or `+ max(2, 0.35 * bodyFontSize)`;
- previous end `>= 0.78`;
- previous coverage `>= 0.50`;
- next start `<= 0.32`;
- large gap `> max(1.55x normalGap, normalGap + 1.25 * bodyFontSize)`.

These are plausible generic features, but must become calibrated evidence rather than universal truths. Metamorphic tests must vary page dimensions, margins, font size and line length while preserving the same semantic paragraphs.

## `src/heading-inference.ts`

### A

Good general evidence:

- page-leading block;
- dominant source font/style recurrence;
- distinction from document-global body style;
- cadence measured from source pages;
- fail-closed behaviour when structural evidence competes.

### B

Fixed decisions needing corpus-independent justification:

- recurrence is `3` for documents with `>= 20` pages, otherwise `2`;
- short-gap burst minimum `20%`;
- modal short gap `< 0.75 * median gap`;
- split threshold uses `median / 2`;
- one style family must beat the runner-up by `3x`.

These should eventually be expressed as evidence strength/confidence and verified using synthetic/metamorphic layouts.

## `src/ruby-association.ts` and `src/ruby-spans.ts`

### A

Ruby association is based on measured geometry/glyph provenance and deliberately fails closed on ambiguity. This is substantially more general than word-based ruby guessing.

### B

There are many fixed geometric windows (`0.35`, `0.75`, `0.45`, `1.35`, `0.6`, axis dot products `0.99/0.999`, grouping tolerances, overlap `0.5`, etc.). They are candidates for scale-invariance tests and distribution-based calibration.

Important: do not weaken fail-closed provenance merely to make corpus counts prettier. The reader-facing policy for unresolved annotation is a separate concern from source association.

## `src/pdf-document-pipeline.ts`

### D

The pipeline reconstructs page flow first, then resolves orientation using only the collapsed page label. The raw metrics exist in `PageFlowResult` but `resolveDocumentOrientations()` cannot use their strength. This is the architectural point where confidence-aware orientation needs to be introduced.

## `src/pdf-to-epub-core.ts`

### D: outline and inferred structure are treated as mutually exclusive

When the source PDF has any outline, `structuralHeadings` is forced to an empty array. This avoids inventing duplicate navigation, but it also prevents the source outline destinations from participating in the logical serialization structure.

Source outline targets and rendered heading inference are different concepts. Generic reflow should be able to use a resolved outline destination as strong section-boundary evidence even when there is no source text block that can safely be promoted to `<h1>`.

### D: reader-facing unresolved annotation policy

The default unresolved policy is `preserve-as-page-note`. That preserves information but can inject annotation fragments into reading flow. Association/provenance and presentation policy need to remain separate: unresolved source evidence can be retained without forcing it into visible body text.

## `src/epub-xhtml.ts`

### D: physical page fallback

When no structural headings are provided, `logicalGroups()` falls back to one XHTML resource per source PDF page. This is safe for provenance but makes physical pagination the logical serialization model. A generic reflow converter needs a logical-flow boundary model whose fallback is not automatically “every PDF page is a section.”

Physical page markers/page-list can still preserve provenance independently of XHTML resource boundaries.

## Immediate engineering order

1. **Do not add another corpus-specific production branch.**
2. Add a diagnostic inventory that reports orientation evidence distributions, weak decisions, isolated orientation flips, body-font/annotation distributions and outline availability across every local sample.
3. Introduce an orientation observation/confidence type while preserving the current label as a compatibility result.
4. Replace `resolveDocumentOrientations()` with confidence-aware document segmentation capable of correcting weak local labels.
5. Centralize primary/annotation/margin item classification so `text-flow` and `physical-layout` cannot use contradictory thresholds.
6. Replace the sample-derived fixed footer band with repeated marginal-pattern evidence.
7. Separate source outline section boundaries from rendered heading promotion.
8. Add metamorphic tests: uniform scale, page-size/margin change, font substitution, shifted physical page breaks, outline removal/addition, and equivalent single-glyph vs multi-glyph emission.
9. Preserve the already-good long-sample output as a regression oracle, while requiring the same production rules to operate on every other sample.

The acceptance target is not “9/9 known books pass.” It is “the parser decisions are functions of general PDF/document evidence, and the nine books plus generated transformations fail when that generality is broken.”
