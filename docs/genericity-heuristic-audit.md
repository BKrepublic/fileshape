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
| item role evidence | `text-item-evidence.ts` computes visible/body/annotation/margin observations once for flow, physical layout and ruby consumers | **B**: annotation ratio `0.75` and margin constants remain empirical |
| margin rule duplication | `margin-noise.ts` owns one scale-aware local edge-band measurement; the old divergent 88%/90% consumers are gone | **B/C**: local threshold calibration remains empirical |
| line/column clustering | `layout-clustering.ts` owns ordinary and vertical-glyph clustering; flow and physical reconstruction consume the same geometry-first helpers | **B**: `0.42`, `1.25`, `8` and local overlap tolerances remain empirical |
| vertical reconstruction mode | flow and physical layout share `verticalTextLayoutMode`; single-glyph representation no longer selects different algorithms in different stages | **B**: existing `0.7` single-char and `0.6` vertical-sequence thresholds remain calibration debt |
| vertical glyph ordering | geometry is primary; source item order is used only for local overlap when complete source indices exist | **B**: overlap/noise windows remain empirical |
| spacing/pitch estimation | `spacing-evidence.ts` is the source of truth for normal spacing and paragraph-gap threshold; evidence retains `source` and `sampleCount`; one gap does not masquerade as a distribution | **B/C**: `1.65`, `1.55`, `1.25` and minimum-gap gates remain empirical |
| attached-run orientation | `attached-run-evidence.ts` retains anchor/pending/attachment evidence; it no longer hard-labels a page | **B/C**: geometric windows (`3x`, `1.5x`, `0.75`, `0.5`, `0.75`) originated from a sparse failure class and still need perturbation coverage |
| document orientation | metric-backed labels are stable; unknown runs consume compact channel evidence; attached-run evidence can be placed on a matching side of a real orientation transition; raw weak tendencies still require agreeing stable context | **B**: metric thresholds remain empirical, but the old page-count/run-length semantic rule is gone |
| orientation handoff | `pdf-document-pipeline.ts` passes compact metric + attached-run evidence into document resolution; decision provenance is no longer reconstructed after the fact | no known D blocker in this handoff |
| glyph-live ruby prepass | `pdf-to-epub-core.ts` calls compact `estimateBodyFontSize()` only; full `reconstructPageFlow()` runs once during document build instead of twice per page | **B**: body-font estimator itself remains page-local empirical evidence |
| heading page-leading gate | recurring source-backed non-body style can be structural even when the block is not first on a physical page | **B**: style quantization/dominance calibration remains empirical |
| heading document-length gate | recurrence is independent of total physical page count; the old `>=20 pages` switch is gone | no known D blocker for document length |
| heading page-cadence inference | source-page-number cadence no longer promotes/demotes heading candidates | **B**: dominant-family `3x` support margin remains empirical |
| multiple headings on one source page | heading inference retains every recurring block candidate; XHTML renders block-granular heading anchors; NAV/NCX enumerate all anchors in one resource without splitting or losing the physical source-page marker | no known D blocker in same-page heading representation |
| outline vs inferred headings | source outline navigation and rendered/inferred headings coexist; outline presence no longer suppresses inferred structure | no known D blocker in the coexistence rule |
| logical XHTML grouping | no-heading documents are grouped by logical/serialization constraints rather than one XHTML per physical PDF page; blank/image-only pages stay standalone | **B**: soft/hard estimated XHTML size budgets are serialization heuristics |
| cross-page continuation | continuation is geometry-only via retained edge geometry; Unicode/punctuation sentence heuristics are gone | **B**: edge thresholds (`0.78`, `0.50`, `0.32`) remain empirical |
| mixed orientation XHTML | grouped XHTML uses scoped orientation runs instead of inheriting the first source page's writing mode for all content | no known D blocker in presentation scoping |
| unresolved annotation presentation | default conversion retains unresolved source evidence as hidden provenance; reader-visible Notes are not the default | product policy is separated from association correctness |

## Open genericity debt

| File / function | Decision | Current issue | Class | Next direction |
| --- | --- | --- | --- | --- |
| `margin-recurrence.ts` + pipeline handoff | marginal text removal | document recurrence is implemented on the branch: local candidates are clustered by edge side, normalized edge-band position, normalized inline position, opaque font name and body-relative font size; production flow/layout remove only recurring clusters while profile-free direct consumers retain legacy local behavior; local verification is pending | **B/C, implementation pending verification** | run focused recurrence tests plus full unit/semantic/9-PDF gates; if diagnostics expose isolated old page-number cases, inspect recurrence evidence rather than restoring unconditional local deletion |
| `text-flow.ts::dominantFontSize` | body-font estimate | page-local char-weighted mode bucketed to 0.1pt | **B** | retain compact style evidence/document prior when mixed/cover pages make the page mode weak |
| `semantic-blocks.ts` | wrap/paragraph decisions | edge and gap decisions are still binary empirical thresholds | **B** | preserve the current geometry-only contract while retaining richer boundary evidence for calibration |
| `heading-inference.ts::dominantRecurringClusters` | choose heading family | strongest recurring style must have `>=3x` runner-up page support | **B** | retain support/margin as confidence instead of only a binary dominance result |
| `ruby-association.ts` / `ruby-spans.ts` | ruby geometry | many fixed geometric windows remain | **B** | keep exact association fail-closed; calibrate through affine/scale/jitter metamorphic tests, never by weakening provenance |

## Provenance notes

### Margin calibration and recurrence

The historical `48e0ec0` 88% footer repair was sample-shaped. That literal page-band divergence is gone: margin geometry is centralized and scale-aware. `MarginNoiseEvidence` retains edge side, normalized edge distance/band, body-relative font size and local candidacy. `margin-recurrence.ts` then clusters only local candidates using normalized geometry and opaque PDF font style; visible text is deliberately excluded, so changing page-number text does not break recurrence while words/digits never become semantic features.

The current recurrence gate requires support on at least two text-bearing pages and at least 20% of text-bearing pages. Those are B-class empirical thresholds, not corpus facts. Long documents therefore do not delete a marginal item merely because the same geometry happened twice. Direct page-local APIs keep the historical local rule when no document profile is available; production document assembly supplies one shared profile to both flow and physical layout. Ruby association still does not gain a margin filter.

### Sparse attached-run calibration

The original attached-run hard label was introduced from the final unresolved local verification case. It is now only compact geometry evidence. Page orientation remains metric-backed or document-context-backed; attached geometry cannot silently overwrite a metric-backed label. The constants still need generated perturbation coverage.

### Cross-page continuation

The former language-specific punctuation/indentation inference has been removed. Continuation is now driven by source-backed edge geometry and structural/image boundaries. This closes the critical C/D content-semantic dependency while leaving the numeric geometry thresholds as B-class calibration debt.

### Heading inference

Page-leading eligibility, physical-document-length recurrence thresholds and source-page cadence have all been removed. Current heading inference uses recurring opaque source styles and fails closed when style families compete. Multiple recurring heading blocks on one physical source page are retained independently and carried as block-granular anchors through XHTML, NAV and NCX.

### Ruby prepass flow duplication

The glyph-live inspection callback previously ran the complete page-flow reconstruction only to obtain `bodyFontSize`, then document construction repeated that work. `estimateBodyFontSize()` now exposes the same char-weighted estimate directly, so ruby span extraction keeps the exact same body-size input while orientation/grouping/spacing reconstruction happens only once. Heavy glyph evidence is still released at the same page-safe boundary.

## Current verification checkpoint

At branch checkpoint `befbab4b0d2ec1d785c54ce876259629059cfa72` the local gates reported:

- Targeted margin-evidence/metamorphic/consumer tests: 43/43 PASS.
- Unit suite: 296/296 PASS.
- Semantic verification: PASS.
- Generic PDF quality verification: 9/9 PDFs and 5,141/5,141 pages PASS.
- The earlier orientation checkpoint recorded detected unknown 13 -> resolved unknown 0 with known repaired 0.
- No GitHub Actions or hosted CI is part of this verification policy.

The document-recurrence implementation after this checkpoint intentionally changes production margin deletion and still requires local verification. The nine PDFs remain diagnostics only; passing them is regression evidence, not proof of generality.

## Metamorphic coverage to preserve/extend

1. Uniform coordinate/font scaling.
2. Small font-size perturbation preserving style hierarchy.
3. Font-family substitution preserving style recurrence roles.
4. Margin translation and page-size changes.
5. Equivalent logical content moved across physical page boundaries.
6. Outline add/remove without body-semantic changes.
7. Equivalent single-glyph vs multi-glyph TextItem emission.
8. Small coordinate jitter/skew within extraction noise.
9. Header/footer recurrence at varying normalized positions, including alternating left/right furniture.
10. Mixed-orientation transitions that document context must not steamroll.
11. Multiple logical section boundaries within one physical source page.

## Immediate engineering order

1. Locally verify document margin recurrence: repeated furniture remains suppressed, isolated local candidates remain content, and flow/physical layout agree on the same profile.
2. Run typecheck + focused recurrence/margin/flow/layout tests, then the complete unit and semantic gates.
3. Because production deletion changed, run the 9-PDF quality gate and detailed genericity audit once. Do not tune constants solely to restore the old corpus shape.
4. If clean, move recurrence to closed and proceed to body-font confidence or semantic-boundary evidence; keep threshold calibration separate.
5. Keep ruby exact association fail-closed and unresolved provenance intact throughout.
