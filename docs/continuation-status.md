# FileShape continuation status

Updated 2026-09-12 after Stage 22 private-corpus ruby near-miss acceptance.

## Current GitHub baseline

Stages 19–20 image preservation / explicit cover are accepted and merged. Stage 21 Task 4A ruby inventory is accepted and merged to `main` through PR #13. Stage 22 Task 4B near-miss geometry evidence is accepted on `stage22-ruby-near-miss-evidence`; merge this evidence checkpoint before any production ruby-rule change.

The 9 private corpus PDFs are not committed; their full-corpus checks remain local-only.

## Proven production baseline

The hardened production PDF -> EPUB path has passed the complete private corpus with images enabled:

```text
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Total EPUB bytes: 17959256
Outline entries: 250/250; outline PDFs: 6/6; unresolved 0
Image occurrences: 4/4
Unique PNG content resources: 1/1
Interpolated image occurrences: 0
XHTML/OPF/ZIP image references: consistent
EPUBCheck 5.3.0: 9/9 passed with 0 errors / 0 warnings
```

Known parser/model regression baseline remains:

```text
ruby: 33 pages; mapped runs 880/880; exact candidates 373;
      unresolved retained 2; representative exact pairs 11/11
semantic samples: 7/7
Stage 2: 9/9 PDFs; 5141 pages; semantic output 5141/5141;
         font-pair semantic match 223/223
```

## Accepted checkpoints after Stage 12

### Stage 13a: outline destination -> source evidence

All 250 outline entries in six PDFs were analyzed without title/body matching. Results were `page-only: 250`, with zero source-backed body anchors. Task 1 body heading/section mapping remains on hold; Stage 12a page-level outline navigation is the accepted fallback.

### Stage 14: reading-system CSS/resources

Deterministic packaged CSS, reflow-safe vertical/horizontal rules, ruby/note styling, explicit page progression and reader fixture are implemented. Task 2 still needs manual real-reader acceptance.

### Stages 15–20: images and cover

Source-backed image extraction, typed resource/occurrence provenance, geometry-backed placement, XHTML/OPF/ZIP packaging, limits, fail-closed unsupported effects, full-package image accounting and explicit cover designation are accepted. No automatic cover inference exists.

### Stage 21: ruby refinement inventory

Stage 21 classifies the complete current ruby-candidate population without changing production thresholds.

```text
PDFS=9
PAGES=5141
RUBY_CANDIDATES=23097
EXACT_CANDIDATES=16710
UNRESOLVED_CANDIDATES=6387
UNRESOLVED_REASON_COUNTS={"no-base":5004,"ambiguous-base":577,"noncontiguous-base":792,"missing-glyph-geometry":14}
ORIENTATION_COUNTS={"vertical":23079,"horizontal":18}
ROTATION_COUNTS={"0":23045,"90":52}
ANNOTATION_EVIDENCE_COUNTS={"all-exact-with-geometry":23083,"has-unmapped-glyph-mapping":14}
SOURCE_INTEGRITY_ISSUES=0
UNKNOWN_REASON_COUNT=0
```

### Stage 22: ruby near-miss geometry evidence

Stage 22 is read-only and measures why unresolved candidates fail coarse production geometry gates.

```text
EXACT_ACTUAL_BASE_ELIGIBILITY={"all-actual-base-eligible":16710}
NO_BASE_TOTAL=5004
NO_BASE_COARSE_ELIGIBLE=1204
NO_BASE_CROSS_DISTANCE_GE_2_BODY_WIDTHS=3662
```

The exact control is clean. Most `no-base` candidates are far outside current geometry and do not justify any blanket threshold widening. A residual 1,204 pass every coarse entry-level gate yet still end as `no-base`, proving that their rejection happens later in glyph-cell selection / annotation coverage / source-contiguity / choice logic.

`ambiguous-base` 577 and `noncontiguous-base` 792 are also coarse-eligible, as expected, and are controls for the next replay diagnostic. `missing-glyph-geometry` remains isolated at 14.

**Decision:** do not change production thresholds from Stage 22 evidence.

### marked content / 「特殊効果」

The complete private corpus contains zero marked-content occurrences. Do not invent special-tag conversion rules for this corpus. Future presentation-only wrappers may be unwrapped only when child content is preserved; content-bearing/interactive/ambiguous behavior must not be silently deleted.

## Current pipeline

```text
PDF
  -> PDF.js extraction + exact source/glyph provenance
  -> writing-orientation resolution
  -> physical layout
  -> semantic blocks
  -> exact/unresolved ruby association
  -> typed FileShape Document Model + outline navigation + image placement
  -> unresolved-content policy
  -> ordered text/image EPUB XHTML + CSS
  -> OPF / nav / image resources / optional explicit cover marker / ZIP
  -> .epub
```

User-facing CLI:

```text
npm run convert:epub -- input.pdf [output.epub]
```

Relevant options include unresolved-ruby policy, page progression, `--ruby on|off`, and `--cover-occurrence PAGE:OPERATOR:OCCURRENCE`.

## Important invariants

- no website, filename, URL, Creator/Producer, generator, font-name, N-code, character appearance, title or language-specific parser heuristics;
- decisions come from PDF structure, geometry, ordering and provenance;
- preserve original `TextItem.str` and source ownership;
- never split ligatures/supplementary Unicode by guessed widths;
- unresolved ruby stays explicit unless a generic source-backed rule proves a unique base;
- do not weaken verifiers or rewrite expectations merely to obtain green results;
- do not commit private PDFs, images, text excerpts, generated private EPUBs or local reports.

## Next work

1. **Task 4B glyph-selection evidence**: replay the production post-gate selection stage read-only. Classify the 1,204 coarse-eligible `no-base` candidates into exact later-failure mechanisms: no glyph selected, boundary/overhang uncertainty, non-contiguity, or competing choices. The diagnostic must reproduce current production reason/status for all 23,097 candidates as a consistency control.
2. Only if that evidence exposes a generic structural defect should production `ruby-spans.ts` change. Add positive + adversarial negative fixtures first, then compare stable candidate IDs before/after over the full private corpus.
3. Task 2 real-reader acceptance remains manual/environment-dependent and does not block independent Task 4 work.
4. Task 5 CLI final acceptance follows accepted Task 4 scope and real-reader conclusions.
5. Browser/Android follows CLI acceptance.

Task 1 body heading/section mapping remains on hold until genuinely new PDF-native source evidence appears.
