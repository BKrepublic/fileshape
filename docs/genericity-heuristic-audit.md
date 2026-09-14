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
| margin document context | `margin-recurrence.ts` clusters local candidates by normalized edge/inline geometry, opaque font and body-relative size; production flow/layout suppress only recurring clusters while isolated local candidates remain content | **B**: recurrence gates (`>=2` pages and `>=20%` of text-bearing pages) and clustering buckets remain empirical |
| body-font evidence | `measureBodyFontEvidence()` retains total/dominant/runner-up char weight, support, dominance margin and bucket count while preserving the historical 0.1pt winner | **B**: 0.1pt quantization and char weighting remain empirical |
| body-font document context | `body-font-context.ts` may assist only weak page-local estimates; strong local majorities are immutable, the prior requires a strict majority across at least two strong pages, the prior size must occur on the weak page, and the change must preserve ruby annotation/body roles | **B**: local-majority and document-majority gates remain empirical; the local nine-PDF verification set exercised zero prior substitutions |
| line/column clustering | `layout-clustering.ts` owns ordinary and vertical-glyph clustering; flow and physical reconstruction consume the same geometry-first helpers | **B**: `0.42`, `1.25`, `8` and local overlap tolerances remain empirical |
| vertical reconstruction mode | flow and physical layout share `verticalTextLayoutMode`; single-glyph representation no longer selects different algorithms in different stages | **B**: existing `0.7` single-char and `0.6` vertical-sequence thresholds remain calibration debt |
| vertical glyph ordering | geometry is primary; source item order is used only for local overlap when complete source indices exist | **B**: overlap/noise windows remain empirical |
| spacing/pitch estimation | `spacing-evidence.ts` is the source of truth for normal spacing and paragraph-gap threshold; evidence retains `source` and `sampleCount`; one gap does not masquerade as a distribution | **B/C**: `1.65`, `1.55`, `1.25` and minimum-gap gates remain empirical |
| attached-run orientation | `attached-run-evidence.ts` retains anchor/pending/attachment evidence; it no longer hard-labels a page | **B/C**: geometric windows (`3x`, `1.5x`, `0.75`, `0.5`, `0.75`) originated from a sparse failure class and still need perturbation coverage |
| document orientation | metric-backed labels are stable; unknown runs consume compact channel evidence; attached-run evidence can be placed on a matching side of a real orientation transition; raw weak tendencies still require agreeing stable context | **B**: metric thresholds remain empirical, but the old page-count/run-length semantic rule is gone |
| orientation handoff | `pdf-document-pipeline.ts` passes compact metric + attached-run evidence into document resolution; decision provenance is no longer reconstructed after the fact | no known D blocker in this handoff |
| glyph-live ruby prepass | `pdf-to-epub-core.ts` calls compact `estimateBodyFontSize()` only; full `reconstructPageFlow()` runs once during document build instead of twice per page | **B**: body-font thresholds remain empirical, but duplicate flow work is closed |
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
| `semantic-blocks.ts` | wrap/paragraph decisions | branch now retains wrap-gap threshold, paragraph-gap threshold, previous coverage, near-normal-gap, continuation-edge, wrap-candidate and large-gap evidence in each decision without changing the decision formula; local verification is pending | **B, evidence implementation pending verification** | verify focused semantic decisions + unit/semantic suites; then use the retained evidence for metamorphic calibration rather than tuning thresholds against the nine PDFs |
| `heading-inference.ts::dominantRecurringClusters` | choose heading family | strongest recurring style must have `>=3x` runner-up page support | **B** | retain support/margin as confidence instead of only a binary dominance result |
| `ruby-association.ts` / `ruby-spans.ts` | ruby geometry | many fixed geometric windows remain | **B** | keep exact association fail-closed; calibrate through affine/scale/jitter metamorphic tests, never by weakening provenance |

## Provenance notes

### Margin calibration and recurrence

The historical `48e0ec0` 88% footer repair was sample-shaped. That literal page-band divergence is gone: margin geometry is centralized and scale-aware. `MarginNoiseEvidence` retains edge side, normalized edge distance/band, body-relative font size and local candidacy. `margin-recurrence.ts` clusters only local candidates using normalized geometry and opaque PDF font style; visible text is deliberately excluded, so changing page-number text does not break recurrence while words/digits never become semantic features.

The recurrence gate currently requires support on at least two text-bearing pages and at least 20% of text-bearing pages. Those are B-class empirical thresholds, not corpus facts. Direct page-local APIs retain the historical local rule when no document profile is available; production document assembly supplies one shared profile to both flow and physical layout. Ruby association still does not gain a margin filter.

### Body-font confidence and document context

The numeric body-font winner remains the historical char-weighted 0.1pt size mode with larger-size tie breaking. `measureBodyFontEvidence()` retains total weight, dominant and runner-up weight, support ratio, dominance margin and bucket count, so a tied 12pt/14pt page can still resolve to 14pt for compatibility while explicitly carrying zero dominance margin.

`body-font-context.ts` adds a deliberately conservative document prior. Only pages with a strict page-local majority vote into the prior, at least two such pages must agree, and the winning size must have a strict majority among eligible pages. Strong local pages are never overwritten. A weak page may adopt the prior only when the prior size is actually present on that page and the substitution leaves every visible TextItem on the same side of the ruby annotation/body cutoff. This preserves the already-computed glyph-live ruby partition without retaining glyphs or rereading the PDF. The nine-PDF verification checkpoint reported `bodyFontPrior=0`, so this safety mechanism did not alter those diagnostics.

### Semantic boundary evidence

Same-page wrap/paragraph reconstruction remains geometry-only. The branch now retains both decision thresholds and intermediate booleans instead of collapsing them to only `join`/`reason`: normal-gap provenance, wrap-gap threshold, paragraph-gap threshold, previous inline coverage, edge continuation result, near-normal-gap result, wrap candidate and large-gap result all survive on `SemanticBoundaryDecision`. Numeric behavior is intentionally unchanged pending local verification and later metamorphic calibration.

### Sparse attached-run calibration

The original attached-run hard label was introduced from the final unresolved local verification case. It is now only compact geometry evidence. Page orientation remains metric-backed or document-context-backed; attached geometry cannot silently overwrite a metric-backed label. The constants still need generated perturbation coverage.

### Cross-page continuation

The former language-specific punctuation/indentation inference has been removed. Continuation is now driven by source-backed edge geometry and structural/image boundaries. This closes the critical C/D content-semantic dependency while leaving the numeric geometry thresholds as B-class calibration debt.

### Heading inference

Page-leading eligibility, physical-document-length recurrence thresholds and source-page cadence have all been removed. Current heading inference uses recurring opaque source styles and fails closed when style families compete. Multiple recurring heading blocks on one physical source page are retained independently and carried as block-granular anchors through XHTML, NAV and NCX.

### Ruby prepass flow duplication

The glyph-live inspection callback previously ran the complete page-flow reconstruction only to obtain `bodyFontSize`, then document construction repeated that work. `estimateBodyFontSize()` now exposes the same char-weighted estimate directly, so ruby span extraction keeps the exact same body-size input while orientation/grouping/spacing reconstruction happens only once. Heavy glyph evidence is still released at the same page-safe boundary.

## Current verification checkpoint

At branch checkpoint `27a30e4e7d1fb60684c25af0c21e84d87e6504ec` the local gates reported:

- Focused body-font/context/core/ruby/runtime tests: PASS.
- Unit suite: 307/307 PASS.
- Semantic verification: PASS.
- Genericity audit: 9 PDFs, 5,141 pages, detected unknown 5 -> resolved 0, known repaired 0, body-font prior substitutions 0.
- Margin diagnostics: 6,272 local candidates, 5,947 recurring suppressions and 325 isolated candidates retained.
- Generic PDF quality verification: 9/9 PDFs and 5,141/5,141 pages PASS.
- No GitHub Actions or hosted CI is part of this verification policy.

The semantic-boundary evidence extension after this checkpoint is intended to be behavior-preserving and still requires local type/focused/unit/semantic verification. The nine PDFs remain diagnostics only; passing them is regression evidence, not proof of generality.

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
12. Weak/tied page-local body-font estimates where a document prior must assist only when source-observed and ruby-role-safe.
13. Same semantic boundary under uniform scale and small spacing perturbations, retaining both threshold margins and decision provenance.

## Immediate engineering order

1. Verify semantic-boundary evidence with typecheck, focused `semantic-blocks`/logical-flow/metamorphic tests and the complete unit + semantic gates.
2. Do not rerun the nine-PDF quality set for this evidence-only change unless output changes or a broader regression appears.
3. If clean, move semantic-boundary evidence to closed and continue with heading-family confidence before touching ruby thresholds.
4. Keep threshold tuning separate from evidence plumbing. Do not tune constants against the nine local PDFs.
5. Keep ruby exact association fail-closed and unresolved provenance intact throughout.
