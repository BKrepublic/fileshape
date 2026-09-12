# FileShape continuation status

Updated 2026-09-12 after Stage 21 private-corpus ruby inventory acceptance.

## Current GitHub baseline

Stage 19 ordinary image preservation and Stage 20 explicit/source-backed cover selection are accepted. Stage 21 Task 4A ruby inventory is also accepted on `stage21-ruby-refinement-inventory`; merge this checkpoint before starting production ruby rule changes.

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

Stage 20 explicit-cover smoke also passed with one cover marker, unchanged body image occurrence, unchanged PNG resource count, and clean EPUBCheck.

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

All 250 outline entries in six PDFs were analyzed without using titles for body matching. Results were `page-only: 250`, with zero source-backed body anchors. Task 1 body heading/section mapping is on hold. Stage 12a page-level outline navigation remains the accepted fallback. Do not add nearest-text, title/body string matching, outline-depth heading inference, filename, font-name, or appearance heuristics to manufacture headings.

### Stage 14: reading-system CSS/resources

Implemented deterministic packaged CSS, manifest registration, XHTML stylesheet links, reflow-safe horizontal/vertical rules, ruby/note styling, explicit page progression direction, and a synthetic reading-system fixture. Task 2 still needs manual real-reader validation.

### Stages 15–20: images and cover

Stages 15–19 established and implemented source-backed image extraction, typed resource/occurrence provenance, geometry-backed placement, XHTML/OPF/ZIP packaging, production limits, package verification, and fail-closed handling of unsupported transforms/effects. The private corpus has four image occurrences that deduplicate to one PNG resource, and the final private regression passes 9/9 with EPUBCheck clean.

Stage 20 adds explicit cover designation via:

```text
--cover-occurrence PAGE:OPERATOR:OCCURRENCE
```

No automatic cover inference is performed. The selected existing image manifest item receives `properties="cover-image"`; its body occurrence remains; shared PNG bytes remain deduplicated. Stage 20 is accepted.

### Stage 21: ruby refinement inventory

Stage 21 performs Task 4A classification only. It does not change `ruby-spans.ts` thresholds or promote any unresolved candidate.

Accepted private inventory:

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
ALTERNATIVE_BUCKET_COUNTS={"0":6197,"1":16900}
PAGE_GLYPH_ISSUE_CANDIDATES=0
SOURCE_INTEGRITY_ISSUES=0
UNKNOWN_REASON_COUNT=0
```

Dominant unresolved feature: 4,960 candidates are `no-base|vertical|rot0|all-exact-with-geometry|alts:0|page-glyph-clean`. This is a diagnosis target, not a license to widen thresholds. The next checkpoint must measure geometric near misses before changing production association rules.

### marked content / 「特殊効果」

The complete private corpus contains zero marked-content occurrences. Do not invent special-tag conversion rules for this corpus. Future unsupported presentation-only wrappers may be safely unwrapped only when child content is preserved; content-bearing/interactive/ambiguous behavior must not be silently deleted.

## Current pipeline

```text
PDF
  -> PDF.js extraction + exact source/glyph provenance
  -> writing-orientation resolution
  -> physical layout
  -> semantic blocks
  -> exact/unresolved ruby association
  -> typed FileShape Document Model + explicit outline navigation + image placement gaps
  -> unresolved-content policy
  -> ordered text/image EPUB XHTML + packaged CSS
  -> OPF / nav / image resources / optional explicit cover marker / container / ZIP package
  -> .epub
```

User-facing CLI:

```text
npm run convert:epub -- input.pdf [output.epub]
```

Relevant options include unresolved-ruby policy, explicit page progression direction, `--ruby on|off`, and `--cover-occurrence PAGE:OPERATOR:OCCURRENCE`.

## Important invariants

- no website, filename, URL, Creator/Producer, generator, font-name, N-code, particular character appearance, or title matching heuristics;
- parser/model decisions come from PDF structure, geometry, ordering and provenance;
- preserve original `TextItem.str` and source ownership;
- never split ligatures or supplementary Unicode by guessed widths;
- unresolved ruby must stay explicit unless a generic source-backed rule proves a unique base;
- do not weaken verifiers or rewrite expectations merely to obtain green results;
- do not commit private PDFs, extracted images, source text excerpts, generated private EPUBs, or local reports.

## Next work

1. **Task 4B geometric near-miss analysis**: measure why unresolved groups fail current cross-distance, inline-overlap, continuity and uniqueness gates. Keep it read-only first. The 5,004 `no-base` group is the primary population; the other reasons are controls, not merged into it.
2. If a generic structural pattern establishes a safe improvement, add positive and adversarial negative fixtures before changing `ruby-spans.ts`, then compare source-stable candidate IDs before/after across the full corpus.
3. **Task 2 real-reader acceptance** remains manual/environment-dependent and does not block independent Task 4 work.
4. **Task 5 CLI final acceptance** follows accepted Task 4 scope and real-reader conclusions.
5. Browser/Android follows CLI acceptance.

Task 1 body heading/section mapping remains on hold until genuinely new PDF-native source evidence appears.
