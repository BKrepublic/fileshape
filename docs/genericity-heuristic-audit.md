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
| glyph-live ruby prepass | `pdf-to-epub-core.ts` now calls compact `estimateBodyFontSize()` only; full `reconstructPageFlow()` runs once during document build instead of twice per page | **B**: body-font estimator itself remains page-local empirical evidence, but the duplicate flow architecture is closed |
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
| `heading-inference.ts` + `epub-xhtml.ts` + NAV/NCX | multiple structural headings | block-granular multi-heading support is implemented on the branch: same-page recurring candidates are retained, XHTML can render multiple heading anchors, and NAV/NCX enumerate them; local verification is still pending | **D, implementation pending verification** | run focused multi-heading + existing heading/XHTML/NAV/NCX tests, then full unit/semantic and the nine-PDF quality gate before moving this row to closed |
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

Page-leading eligibility, physical-document-length recurrence thresholds and source-page cadence have all been removed. Current heading inference uses recurring opaque source styles and fails closed when style families compete. The branch now also retains multiple recurring heading blocks on one physical source page and carries block-granular anchors through XHTML/NAV/NCX; that last architectural cleanup remains open only until local verification completes.

### Ruby prepass flow duplication

The glyph-live inspection callback previously ran the complete page-flow reconstruction only to obtain `bodyFontSize`, then document construction repeated that work. `estimateBodyFontSize()` now exposes the same char-weighted estimate directly, so ruby span extraction keeps the exact same body-size input while orientation/grouping/spacing reconstruction happens only once. Heavy glyph evidence is still released at the same page-safe boundary.

## Current verification checkpoint

At branch checkpoint `651beeab65ed5170a860fced11a803ffe65f5976` the local gates reported:

- Targeted body-font/ruby/core tests: 65/65 PASS.
- Unit suite: 294/294 PASS.
- Semantic verification: PASS.
- Generic PDF quality verification: 9/9 PDFs and 5,141/5,141 pages PASS.
- The immediately preceding orientation checkpoint also recorded detected unknown 13 -> resolved unknown 0 with known repaired 0.
- No GitHub Actions or hosted CI is part of this verification policy.

The multi-heading implementation after this checkpoint has not yet been locally verified. These PDFs remain diagnostics only. Passing them is necessary regression evidence, not proof of generality.

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

1. Locally verify same-page multiple-heading inference, XHTML rendering and NAV/NCX targets without changing physical source-page anchors.
2. Run the complete unit and semantic regression gates; because heading presentation/navigation changed, run the nine-PDF quality verification once after those cheap gates pass.
3. If clean, move the multi-heading row to closed and continue with empirical B/C calibration work rather than inventing another architectural workaround.
4. Keep threshold tuning separate from architectural cleanup. Do not tune constants against the nine local PDFs.
5. Keep ruby exact association fail-closed and unresolved provenance intact throughout.
