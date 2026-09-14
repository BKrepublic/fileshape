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
| margin rule duplication | `margin-noise.ts` owns one scale-aware local edge-band measurement; the old divergent page-band consumers are gone | **B/C**: local threshold calibration remains empirical |
| margin document context | `margin-recurrence.ts` clusters local candidates by normalized edge/inline geometry, opaque font and body-relative size; production flow/layout suppress only recurring clusters while isolated local candidates remain content | **B**: recurrence gates (`>=2` pages and `>=20%` of text-bearing pages) and clustering buckets remain empirical |
| body-font evidence | `measureBodyFontEvidence()` retains total/dominant/runner-up char weight, support, dominance margin and bucket count while preserving the historical 0.1pt winner | **B**: 0.1pt quantization and char weighting remain empirical |
| body-font document context | `body-font-context.ts` may assist only weak page-local estimates; strong local majorities are immutable, the prior requires a strict majority across at least two strong pages, the prior size must occur on the weak page, and the change must preserve ruby annotation/body roles | **B**: local-majority and document-majority gates remain empirical; the local nine-PDF verification set exercised zero prior substitutions |
| line/column clustering | `layout-clustering.ts` owns ordinary and vertical-glyph clustering; flow and physical reconstruction consume the same geometry-first helpers | **B**: clustering tolerances remain empirical |
| vertical reconstruction mode | flow and physical layout share `verticalTextLayoutMode`; single-glyph representation no longer selects different algorithms in different stages | **B**: existing `0.7` single-char and `0.6` vertical-sequence thresholds remain calibration debt |
| vertical glyph ordering | geometry is primary; source item order is used only for local overlap when complete source indices exist | **B**: overlap/noise windows remain empirical |
| spacing/pitch estimation | `spacing-evidence.ts` is the source of truth for normal spacing and paragraph-gap threshold; evidence retains `source` and `sampleCount`; one gap does not masquerade as a distribution | **B/C**: `1.65`, `1.55`, `1.25` and minimum-gap gates remain empirical |
| semantic boundary evidence | `SemanticBoundaryDecision` retains normal-gap provenance, wrap/paragraph thresholds, previous coverage, edge-continuation result, near-normal-gap result, wrap candidate and large-gap result while keeping the existing join formula unchanged | **B**: continuation and spacing thresholds remain empirical, but intermediate evidence is no longer collapsed |
| attached-run orientation | `attached-run-evidence.ts` retains anchor/pending/attachment evidence; it no longer hard-labels a page | **B/C**: geometric windows originated from a sparse failure class and still need perturbation coverage |
| document orientation | metric-backed labels are stable; unknown runs consume compact channel evidence; attached-run evidence can be placed on a matching side of a real orientation transition; raw weak tendencies still require agreeing stable context | **B**: metric thresholds remain empirical, but the old page-count/run-length semantic rule is gone |
| orientation handoff | `pdf-document-pipeline.ts` passes compact metric + attached-run evidence into document resolution; decision provenance is no longer reconstructed after the fact | no known D blocker in this handoff |
| glyph-live ruby prepass | `pdf-to-epub-core.ts` calls compact `estimateBodyFontSize()` only; full `reconstructPageFlow()` runs once during document build instead of twice per page | **B**: body-font thresholds remain empirical, but duplicate flow work is closed |
| heading page-leading gate | recurring source-backed non-body style can be structural even when the block is not first on a physical page | **B**: style quantization remains empirical |
| heading document-length gate | recurrence is independent of total physical page count; the old `>=20 pages` switch is gone | no known D blocker for document length |
| heading page-cadence inference | source-page-number cadence no longer promotes/demotes heading candidates | no known D blocker for pagination cadence |
| heading family confidence | `inferStructuralHeadingEvidence()` retains every recurring family’s page support, support share, selected state, strongest/runner-up support, support margin, dominance ratio and decision; `inferStructuralHeadings()` remains the compatibility wrapper using the unchanged `3x` rule | **B**: the `3x` dominance threshold itself remains empirical |
| multiple headings on one source page | heading inference retains every recurring block candidate; XHTML renders block-granular heading anchors; NAV/NCX enumerate all anchors in one resource without splitting or losing the physical source-page marker | no known D blocker in same-page heading representation |
| outline vs inferred headings | source outline navigation and rendered/inferred headings coexist; outline presence no longer suppresses inferred structure | no known D blocker in the coexistence rule |
| logical XHTML grouping | no-heading documents are grouped by logical/serialization constraints rather than one XHTML per physical PDF page; blank/image-only pages stay standalone | **B**: soft/hard estimated XHTML size budgets are serialization heuristics |
| cross-page continuation | continuation is geometry-only via retained edge geometry; Unicode/punctuation sentence heuristics are gone | **B**: edge thresholds remain empirical |
| mixed orientation XHTML | grouped XHTML uses scoped orientation runs instead of inheriting the first source page's writing mode for all content | no known D blocker in presentation scoping |
| unresolved annotation presentation | default conversion retains unresolved source evidence as hidden provenance; reader-visible Notes are not the default | product policy is separated from association correctness |

## Open genericity debt

| File / function | Decision | Current issue | Class | Next direction |
| --- | --- | --- | --- | --- |
| `ruby-association.ts` / `ruby-spans.ts` | ruby geometry | exact association still uses fixed geometric windows for annotation/body size, side distance, overlap, line grouping, continuity and ambiguity | **B** | keep exact association fail-closed; extend affine/scale/jitter/advance perturbation tests before considering any calibration change |
| `attached-run-evidence.ts` | sparse endpoint attachment | fixed geometric windows remain | **B/C** | add perturbation coverage without allowing attachment evidence to become a local hard label |
| orientation decision thresholds | page orientation metrics | `0.7`, `0.6`, `1.5x`-style gates are empirical | **B** | retain current provenance and add perturbation/boundary tests before calibration |

## Provenance notes

### Margin calibration and recurrence

The historical page-band footer repair was sample-shaped. That literal divergence is gone: margin geometry is centralized and scale-aware. `MarginNoiseEvidence` retains edge side, normalized edge distance/band, body-relative font size and local candidacy. `margin-recurrence.ts` clusters only local candidates using normalized geometry and opaque PDF font style; visible text is deliberately excluded, so changing page-number text does not break recurrence while words/digits never become semantic features.

The recurrence gate currently requires support on at least two text-bearing pages and at least 20% of text-bearing pages. Those remain B-class thresholds. Direct page-local APIs retain the historical local rule when no document profile is available; production document assembly supplies one shared profile to both flow and physical layout. Ruby association still does not gain a margin filter.

### Body-font confidence and document context

The numeric body-font winner remains the historical char-weighted 0.1pt size mode with larger-size tie breaking. `measureBodyFontEvidence()` retains total weight, dominant and runner-up weight, support ratio, dominance margin and bucket count. `body-font-context.ts` adds a deliberately conservative document prior: only weak pages may use it, the prior must be supported by a strict majority of at least two strong pages, the prior size must be present locally, and the substitution must preserve every visible TextItem’s ruby annotation/body role.

The nine-PDF checkpoint reported `bodyFontPrior=0`, so the document prior did not alter those diagnostics.

### Semantic boundary evidence

Same-page wrap/paragraph reconstruction remains geometry-only. `SemanticBoundaryDecision` now retains the threshold values and intermediate booleans that produced the final `join/reason` decision. Local verification at checkpoint `499a4fa91664326f6abeedd4555665d48fdf1c9d` passed typecheck, focused tests, 307/307 unit tests and semantic verification with no formula change.

### Heading family confidence

Page-leading eligibility, physical-document-length gates and page cadence are gone. `inferStructuralHeadingEvidence()` exposes the complete recurring-family competition while leaving the historical behavior intact: a single recurring family is accepted directly; when multiple families recur, the strongest still needs at least `3x` the runner-up independent page support. Tests now distinguish clear dominance from competing families using support/share/margin/ratio evidence rather than a hidden boolean only.

Local verification at checkpoint `4d3c8840f95bafbf2cd9d6bdcfdda4c3ef1ad076` passed typecheck, focused heading/navigation tests, 307/307 unit tests and semantic verification.

### Ruby geometry

Exact ruby remains source-provenance-first and fail-closed. Existing tests already cover four rotations, uniform scale/translation, proportional glyph advances, ligatures, multi-item base/annotation spans, overhang, ambiguity, missing glyphs, duplicate overprints, noncontiguous bases, conflicting annotations and supplementary Unicode. The current branch adds focused perturbation tests for small independent coordinate jitter, small measured advance variation, jitter under scale, and explicit fail-closed behavior outside the accepted cross-axis window. Production thresholds are unchanged pending local verification.

## Current verification checkpoint

At branch checkpoint `4d3c8840f95bafbf2cd9d6bdcfdda4c3ef1ad076` the local gates reported:

- Typecheck: PASS.
- Focused heading/navigation tests: PASS.
- Unit suite: 307/307 PASS.
- Semantic verification: PASS.
- The previous production-changing checkpoint reported 9/9 PDFs and 5,141/5,141 pages PASS, detected unknown 5 -> resolved 0, known repaired 0, body-font prior substitutions 0, 6,272 local margin candidates, 5,947 recurring suppressions and 325 isolated candidates retained.
- No GitHub Actions or hosted CI is part of this verification policy.

The ruby perturbation extension after this checkpoint is test-only and still requires local verification. The nine PDFs remain diagnostics only; passing them is regression evidence, not proof of generality.

## Metamorphic coverage to preserve/extend

1. Uniform coordinate/font scaling.
2. Small font-size perturbation preserving style hierarchy.
3. Font-family substitution preserving style recurrence roles.
4. Margin translation and page-size changes.
5. Equivalent logical content moved across physical page boundaries.
6. Outline add/remove without body-semantic changes.
7. Equivalent single-glyph vs multi-glyph TextItem emission.
8. Small coordinate jitter within extraction noise.
9. Small measured glyph-advance perturbation preserving exact source span.
10. Header/footer recurrence at varying normalized positions, including alternating left/right furniture.
11. Mixed-orientation transitions that document context must not steamroll.
12. Multiple logical section boundaries within one physical source page.
13. Weak/tied page-local body-font estimates where a document prior must assist only when source-observed and ruby-role-safe.
14. Same semantic boundary under uniform scale and small spacing perturbations, retaining threshold margins and decision provenance.
15. Ruby perturbations outside accepted geometry must remain unresolved rather than being rescued by looser provenance rules.

## Immediate engineering order

1. Locally verify the new ruby geometry perturbation tests plus the existing exact ruby suite.
2. Run the complete unit and semantic gates. Because production code is unchanged, do not rerun the nine-PDF quality set unless output changes or a broader regression appears.
3. If clean, keep ruby thresholds unchanged and move to attached-run/orientation perturbation coverage.
4. Keep threshold tuning separate from evidence plumbing. Do not tune constants against the nine local PDFs.
5. Keep ruby exact association fail-closed and unresolved provenance intact throughout.
