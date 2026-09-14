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
| margin rule duplication | `margin-noise.ts` owns one scale-aware local edge-band rule; the old divergent 88%/90% consumers are gone | **B/C**: local rule still needs document recurrence before it can safely distinguish repeated furniture from legitimate marginal text |
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
| `margin-noise.ts` + `text-item-evidence.ts` | marginal text removal | local geometric rule now exposes compact evidence (`edgeSide`, normalized edge distance/band, font ratio, shortness and `localCandidate`) while preserving current behavior; document recurrence has not yet been applied | **B/C, evidence stage pending local verification** | verify evidence refactor is behavior-preserving, then compute compact cross-page recurrence from layout/style position without interpreting text words; use recurrence as supporting evidence before changing deletion policy |
| `text-flow.ts::dominantFontSize` | body-font estimate | page-local char-weighted mode bucketed to 0.1pt | **B** | retain compact style evidence/document prior when mixed/cover pages make the page mode weak |
| `semantic-blocks.ts` | wrap/paragraph decisions | edge and gap decisions are still binary empirical thresholds | **B** | preserve the current geometry-only contract while retaining richer boundary evidence for calibration |
| `heading-inference.ts::dominantRecurringClusters` | choose heading family | strongest recurring style must have `>=3x` runner-up page support | **B** | retain support/margin as confidence instead of only a binary dominance result |
| `ruby-association.ts` / `ruby-spans.ts` | ruby geometry | many fixed geometric windows remain | **B** | keep exact association fail-closed; calibrate through affine/scale/jitter metamorphic tests, never by weakening provenance |

## Provenance notes

### Margin calibration

The historical `48e0ec0` 88% footer repair was sample-shaped. That literal page-band divergence is no longer present: margin classification is centralized and scale-aware. The current branch additionally retains the local geometric decision as compact evidence instead of only a boolean. This does not yet change deletion behavior; it creates the evidence channel required to add document recurrence without simultaneously retuning the existing thresholds.

### Sparse attached-run calibration

The original attached-run hard label was introduced from the final unresolved local verification case. It is now only compact geometry evidence. Page orientation remains metric-backed or document-context-backed; attached geometry cannot silently overwrite a metric-backed label. The constants still need generated perturbation coverage.

### Cross-page continuation

The former language-specific punctuation/indentation inference has been removed. Continuation is now driven by source-backed edge geometry and structural/image boundaries. This closes the critical C/D content-semantic dependency while leaving the numeric geometry thresholds as B-class calibration debt.

### Heading inference

Page-leading eligibility, physical-document-length recurrence thresholds and source-page cadence have all been removed. Current heading inference uses recurring opaque source styles and fails closed when style families compete. Multiple recurring heading blocks on one physical source page are now retained independently and carried as block-granular anchors through XHTML, NAV and NCX.

### Ruby prepass flow duplication

The glyph-live inspection callback previously ran the complete page-flow reconstruction only to obtain `bodyFontSize`, then document construction repeated that work. `estimateBodyFontSize()` now exposes the same char-weighted estimate directly, so ruby span extraction keeps the exact same body-size input while orientation/grouping/spacing reconstruction happens only once. Heavy glyph evidence is still released at the same page-safe boundary.

## Current verification checkpoint

At branch checkpoint `2f862c8a47b761d188e06690bb9347eb8b5a293a` the local gates reported:

- Targeted heading/XHTML/NAV/NCX tests: 39/39 PASS.
- Unit suite: 295/295 PASS.
- Semantic verification: PASS.
- Generic PDF quality verification: 9/9 PDFs and 5,141/5,141 pages PASS.
- The earlier orientation checkpoint recorded detected unknown 13 -> resolved unknown 0 with known repaired 0.
- No GitHub Actions or hosted CI is part of this verification policy.

The compact margin-evidence refactor after this checkpoint is intentionally behavior-preserving and still requires local verification before recurrence changes are introduced. The nine PDFs remain diagnostics only; passing them is regression evidence, not proof of generality.

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

1. Locally verify compact margin evidence is scale-invariant and preserves the existing `marginNoise` boolean for all current consumers.
2. Run the cheap unit + semantic gates; because this stage intentionally changes no production decision, run the nine-PDF quality gate once as a regression confirmation, not as a tuning oracle.
3. After that clean checkpoint, add document-level recurrence as a separate compact evidence pass. Do not change edge-band/font/shortness constants in the same commit.
4. Keep recurrence content-agnostic: normalized position/edge side and opaque style evidence are allowed; chapter/header words, filenames and sample identities are not.
5. Keep ruby exact association fail-closed and unresolved provenance intact throughout.
