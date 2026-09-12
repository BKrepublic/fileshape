# FileShape continuation status

Updated 2026-09-12 after Stage 19 acceptance and Stage 20 explicit-cover default-corpus regression.

## Current GitHub baseline

Stage 19 ordinary image preservation is merged to `main` through PR #11. Stage 20 is under review on:

```text
branch: stage20-explicit-cover-policy
required Stage 19 merged ancestor: 82e318acf55ae9950f9459720ac3475d1a5f7d6c
```

Start Stage 20 follow-up from the latest `stage20-explicit-cover-policy` HEAD. Do not reset to an older implementation SHA; docs/tests/verifiers intentionally move the branch forward.

The 9 private corpus PDFs are not committed; their full-corpus checks remain local-only.

## Proven production baseline

Stage 19 hardened ordinary image preservation is accepted over the complete private corpus:

```text
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Outline entries: 250/250; outline PDFs: 6/6; unresolved 0
Image occurrences: 4/4
Unique PNG content resources: 1/1
Interpolated image occurrences: 0
XHTML/OPF/ZIP image references: consistent
EPUBCheck 5.3.0: 9/9 passed with 0 errors / 0 warnings
```

Stage 20 default conversion has independently rerun the same corpus and reproduced the same accepted aggregate, including total EPUB bytes 17,959,256. This proves that adding the explicit-cover option does not change default conversion output.

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

Implemented deterministic packaged CSS, manifest registration, XHTML stylesheet links, reflow-safe horizontal/vertical rules, ruby/note styling, explicit page progression direction, and a synthetic reading-system fixture.

Task 2 is not fully accepted until real-reader validation is performed on selected desktop readers. Standards validation is not a substitute for that manual compatibility check.

### Stages 15–19: production images

The private corpus contains four accepted XObject image occurrences across 5,141 pages. All decode as 800x600 RGB24 and deduplicate to one PNG content resource. Stage 17 proved all four clips are exact rectangles containing the transformed image bounds; no current-corpus crop is required. Stage 18 transported resource/occurrence provenance into the typed model. Stage 19 implemented geometry-backed placement, XHTML output, OPF/ZIP packaging, production limits, atomic output replacement, and post-review hardening.

Independent-review findings R1–R7 were addressed with fail-closed boundaries for unsupported non-uniform scaling, compositing, overlap and interpolation, plus model cross-checks, preflight limits and full-package image accounting. Final private Stage 19 acceptance passed 9/9 EPUBs and EPUBCheck clean. Stage 19 is accepted and merged.

### Stage 20: explicit cover policy

Stage 20 adds only explicit/source-backed cover designation. There is no cover inference.

```text
--cover-occurrence PAGE:OPERATOR:OCCURRENCE
```

The selector resolves exact `DocumentImageOccurrence` provenance to an existing image resource. The selected manifest item receives `properties="cover-image"`; the original body occurrence remains in place; no synthetic cover XHTML/spine item is created; shared PNG bytes remain deduplicated. Missing, malformed or ambiguous selectors fail before output replacement.

Public unit/typecheck/real EPUBCheck CI is green. The fresh private **default** 9-PDF full regression also passes with exactly the Stage 19 accepted aggregate. One private explicit-cover smoke remains: `npm run verify:cover`. It must prove one cover marker, unchanged body occurrence count, unchanged PNG resource set/count and EPUBCheck zero errors/warnings. Stage 20 is not accepted until that final smoke passes.

### marked content / 「特殊効果」

The complete private corpus contains zero marked-content occurrences:

```text
MARKED_OCCURRENCES=0
TAG_COUNTS={}
WRAPPER_TAG_COUNTS={}
POINT_TAG_COUNTS={}
MAX_MARKED_DEPTH=0
MARKED_ISSUES=0
```

Do not invent special-tag conversion rules for this corpus. Future unsupported presentation-only wrappers may be safely unwrapped only when child content is preserved; content-bearing/interactive/ambiguous behavior must not be silently deleted.

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

The user-facing CLI remains:

```text
npm run convert:epub -- input.pdf [output.epub]
```

Relevant current options include explicit unresolved-ruby policy, page-progression direction, `--ruby on|off`, and Stage 20 `--cover-occurrence PAGE:OPERATOR:OCCURRENCE`.

## Important invariants

Do not introduce behavior keyed to website, filename, URL, PDF Creator/Producer, generator name, font name, N-code, particular character appearance, or visual guesses about a cover. Parser decisions must come from PDF structure, geometry, ordering and provenance.

Do not loosen existing verifiers or change expected values merely to obtain green tests. Preserve original `TextItem.str` and source references as source truth. Never split ligatures or supplementary Unicode by guessed character/glyph widths. Uncertain ruby, unsupported images, ambiguous effects and cover designation must remain explicit rather than disappearing or being guessed.

Do not commit private PDFs, extracted private images, source text excerpts, generated private EPUBs, or local reports.

## Regression commands

During development:

```text
npm test
```

For XHTML/CSS/package changes:

```text
npm test
npm run verify:epubcheck
npm run verify:epub -- --epubcheck --report-dir <new-local-report-dir>
```

For explicit cover private acceptance:

```text
npm run verify:cover
```

For parser/model/ruby/source-ownership changes, also run:

```text
npm run verify:ruby
npm run verify:stage2
```

## Next work

Current priority order:

1. **Finish Stage 20 acceptance**: run `npm run verify:cover`; if clean, mark Stage 20 accepted and merge PR #12.
2. **Task 2 real-reader acceptance**: Stage 14 implementation exists, but selected real readers still need explicit compatibility validation. Re-run affected display checks after image/cover integration.
3. **Task 4 unresolved ruby refinement**: 6,387 unresolved annotations remain a separate improvement area. Stage 17 ruby on/off control does not complete this task.
4. **Task 5 CLI final acceptance**: integrate completed/accepted scope, run the full validation matrix, document known limits, and freeze the supported CLI contract.
5. **Browser/Android adapter** follows CLI acceptance and is not part of the CLI completion condition.

Task 1 body heading/section mapping remains on hold until genuinely new PDF-native source evidence appears. Do not block independent Tasks 2/4/5 on an evidence source the current corpus does not contain.
