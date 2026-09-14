# Genericity heuristic audit

Purpose: FileShape must generalize to unknown PDFs at large scale. The local nine-PDF verification set is diagnostic evidence, not the product domain. Production inference must be justified by source-observable evidence that can occur in arbitrary PDFs; filenames, work/site identity, hand-picked pages, linguistic content and sample IDs are never inference features.

## Classification

- **A — source-derived/general**: directly based on PDF/document evidence and not tied to one known layout.
- **B — empirical threshold**: content-agnostic fixed cutoff/multiplier that still needs calibration or metamorphic coverage.
- **C — sample-shaped calibration**: a general phenomenon whose current constants were introduced from a known failure case.
- **D — architectural generality blocker**: duplicated/collapsed evidence, physical pagination used as semantic structure, or a stage that makes a hard decision before stronger context exists.

## Current invariants

- Allowed evidence: glyph/text geometry, transforms, relative font/style distributions, page dimensions, line/column pitch, whitespace/gap distributions, recurrence, neighbouring/document consistency, resolved PDF outline destinations and exact source provenance.
- Forbidden evidence: filename/work/site/title identity, chapter words, story count, hand-picked pages, sample IDs, or language-specific punctuation/content semantics.
- Uniform scaling, font substitution, margin/page-size changes and equivalent TextItem emission should preserve semantic order and relations whenever source evidence remains equivalent.
- Compact evidence may survive across stages; heavy glyph/operator intermediates must still be released per page.
- Acceptance rules are not relaxed to satisfy the local verification PDFs.

## Closed architectural blockers

| Area | Current state | Remaining risk |
| --- | --- | --- |
| item role evidence | `text-item-evidence.ts` computes visible/body/annotation/margin observations once for flow, physical layout and ruby consumers | **B**: annotation ratio `0.75` and margin-noise constants remain empirical |
| margin noise | `margin-noise.ts` owns one scale-aware edge-band rule; the old divergent 88%/90% consumers are gone | **B**: shortness `<=8`, font `<0.98*body`, 6–12%/4em edge band still need broad calibration; document recurrence is not yet used |
| line/column clustering | `layout-clustering.ts` owns ordinary and vertical-glyph clustering; flow and physical reconstruction consume the same geometry-first helpers | **B**: `0.42`, `1.25`, `8` and local overlap tolerances remain empirical |
| vertical reconstruction mode | flow and physical layout share `verticalTextLayoutMode`; single-glyph representation no longer selects different algorithms in different stages | **B**: existing `0.7` single-char and `0.6` vertical-sequence thresholds remain calibration debt |
| vertical glyph ordering | geometry is primary; source item order is used only for local overlap when complete source indices exist | **B**: overlap/noise windows remain empirical |
| spacing/pitch estimation | `spacing-evidence.ts` is the source of truth for normal spacing and paragraph-gap threshold; evidence retains `source` and `sampleCount`; one gap does not masquerade as a distribution | **B/C**: `1.65`, `1.55`, `1.25` and minimum-gap gates remain empirical |
| attached-run orientation | `attached-run-evidence.ts` retains anchor/pending/attachment evidence; it no longer hard-labels a page | **B/C**: geometric windows (`3x`, `1.5x`, `0.75`, `0.5`, `0.75`) originated from a sparse failure class and still need perturbation coverage |
| document orientation | metric-backed labels are stable; unknown runs consume compact channel evidence; attached-run evidence can be placed on a matching side of a real orientation transition; raw weak tendencies still require agreeing stable context | **B**: metric thresholds remain empirical, but the old page-count/run-length semantic rule is gone |
| orientation handoff | `pdf-document-pipeline.ts` passes compact metric + attached-run evidence into document resolution; decision provenance is no longer reconstructed after the fact | no known D blocker in this handoff |
| heading page-leading gate | recurring source-backed non-body style can be structural even when the block is not first on a physical page | **B**: style quantization/dominance calibration remains empirical |
| heading document-length gate | recurrence is independent of total physical page count; the old `>=20 pages` switch is gone | no known D blocker for document length |
| heading page-cadence inference | source-page-number cadence no longer promotes/demotes heading candidates | **B**: dominant-family `3x` support margin remains empirical |
| outline vs inferred headings | source outline navigation and rendered/inferred headings coexist; outline presence no longer suppresses inferred structure | no known D blocker in the coexistence rule |
| logical XHTML grouping | no-heading documents are grouped by logical/serialization constraints rather than one XHTML per physical PDF page; blank/image-only pages stay standalone | **B**: soft/hard estimated XHTML size budgets are serialization heuristics |
| cross-page continuation | continuation is geometry-only via retained edge geometry; Unicode/punctuation sentence heuristics are gone | **B**: edge thresholds (`0.78`, `0.50`, `0.32`) remain empirical |
| mixed orientation XHTML | grouped XHTML uses scoped orientation runs instead of inheriting the first source page's writing mode for all content | no known D blocker in presentation scoping |
| unresolved annotation presentation | default conversion retains unresolved source evidence as hidden provenance; reader-visible Notes are not the default | product policy is separated from association correctness |

## Open genericity debt

| File / function | Decision | Current issue | Class | Next direction |
| --- | --- | --- | --- | --- |
| `pdf-to-epub-core.ts` + `pdf-document-pipeline.ts` | page flow analysis | inspection callback calls `reconstructPageFlow()` only to obtain body font for ruby, then document build reconstructs the page flow again | **D/B** | expose the compact body-font estimator independently so glyph-live ruby extraction does not execute the full flow pipeline twice; keep heavy glyph release unchanged |
| `heading-inference.ts::uniquePerSourcePage` + `epub-xhtml.ts::logicalGroups` | multiple structural headings | more than one indistinguishable candidate on the same physical source page is omitted because EPUB grouping currently assumes at most one structural boundary per source page | **D** | represent section boundaries at `(sourcePage, semanticBlockIndex)` granularity and allow a source page to be split logically without losing its page anchor |
| `text-flow.ts::dominantFontSize` | body-font estimate | page-local char-weighted mode bucketed to 0.1pt | **B** | retain compact style evidence/document prior when mixed/cover pages make the page mode weak |
| `margin-noise.ts::isShortMarginNoise` | marginal text removal | geometric edge/shortness rule has no document recurrence evidence | **B/C** | treat recurrence as supporting evidence before deleting plausible legitimate marginal text; preserve current suppression regression |
| `semantic-blocks.ts` | wrap/paragraph decisions | edge and gap decisions are still binary empirical thresholds | **B** | preserve the current geometry-only contract while retaining richer boundary evidence for calibration |
| `heading-inference.ts::dominantRecurringClusters` | choose heading family | strongest recurring style must have `>=3x` runner-up page support | **B** | retain support/margin as confidence instead of only a binary dominance result |
| `ruby-association.ts` / `ruby-spans.ts` | ruby geometry | many fixed geometric windows remain | **B** | keep exact association fail-closed; calibrate through affine/scale/jitter metamorphic tests, never by weakening provenance |

## Provenance notes

### Margin calibration

The historical `48e0ec0` 88% footer repair was sample-shaped. That literal page-band divergence is no longer present: margin classification is centralized and scale-aware. The replacement is still empirical, so this item moves from a D/C duplication problem to B/C calibration debt rather than disappearing entirely.

### Sparse attached-run calibration

The original attached-run hard label was introduced from the final unresolved local verification case. It is now only compact geometry evidence. Page orientation remains metric-backed or document-context-backed; attached geometry cannot silently overwrite a metric-backed label. The constants still need generated perturbation coverage.

### Cross-page continuation

The former language-specific punctuation/indentation inference has been removed. Continuation is now driven by source-backed edge geometry and structural/image boundaries. This closes the critical C/D content-semantic dependency while leaving the numeric geometry thresholds as B-class calibration debt.

### Heading inference

Page-leading eligibility, physical-document-length recurrence thresholds and source-page cadence have all been removed. Current heading inference uses recurring opaque source styles and fails closed when style families compete. The remaining pagination leak is narrower: two structural boundaries on the same physical source page cannot yet be represented independently.

## Current verification checkpoint

At branch checkpoint `d480e5d092cc243e8e655734eda77fa8cce3ee27` the local gates reported:

- TypeScript/type-targeted orientation tests: PASS.
- Unit suite: 291/291 PASS.
- Orientation audit: 9 PDFs / 5,141 pages, detected unknown 13 -> resolved unknown 0, known repaired 0.
- Generic PDF quality verification: 9/9 PDFs and 5,141/5,141 pages PASS.
- No GitHub Actions or hosted CI is part of this verification policy.

These PDFs remain diagnostics only. Passing them is necessary regression evidence, not proof of generality.

## Metamorphic coverage to preserve/extend

1. Uniform coordinate/font scaling.
2. Small font-size perturbation preserving style hierarchy.
3. Font-family substitution preserving style recurrence roles.
4. Margin translation and page-size changes.
5. Equivalent logical content moved across physical page boundaries.
6. Outline add/remove without body-semantic changes.
7. Equivalent single-glyph vs multi-glyph TextItem emission.
8. Small coordinate jitter/skew within extraction noise.
9. Header/footer recurrence at varying normalized positions.
10. Mixed-orientation transitions that document context must not steamroll.
11. Multiple logical section boundaries within one physical source page.

## Immediate engineering order

1. Remove the duplicate full page-flow pass used only to obtain body-font size for glyph-live ruby extraction.
2. Add focused regression/metamorphic coverage for that refactor and re-run the existing unit + semantic gates before spending the full 9-PDF verification set.
3. Then address multiple structural headings on one source page by moving logical section boundaries to `(sourcePage, semanticBlockIndex)` granularity.
4. Keep empirical threshold tuning separate from architectural cleanup. Do not tune constants against the nine local PDFs.
5. Keep ruby exact association fail-closed and unresolved provenance intact throughout.
