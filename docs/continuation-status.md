# FileShape continuation status

Updated 2026-09-12 after final Stage 20 explicit-cover acceptance.

## Current GitHub baseline

Stage 19 ordinary image preservation is merged to `main` through PR #11. Stage 20 explicit/source-backed cover selection has completed public CI, private default full-corpus regression, and private explicit-cover smoke acceptance on PR #12.

After PR #12 is merged, new implementation work should start from the latest `main`.

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

Stage 20 default conversion independently reproduced the same aggregate, proving that merely adding explicit-cover support does not alter default output.

The Stage 20 private explicit-cover smoke also passed:

```text
COVER_SMOKE=PASS
PDFS=9
BODY_IMAGE_OCCURRENCES=1
PNG_RESOURCES=1
COVER_MARKERS=1
BODY_OCCURRENCES_PRESERVED=yes
PNG_RESOURCES_UNCHANGED=yes
EPUBCheck 5.3.0: pass (0 errors, 0 warnings)
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

Public unit/typecheck/real EPUBCheck CI is green. The fresh private default 9-PDF full regression reproduced the accepted Stage 19 aggregate, and the private explicit-cover smoke proved exactly one cover marker with unchanged body occurrence and PNG resource counts plus clean EPUBCheck.

**Stage 20 is accepted.** Automatic cover inference remains intentionally absent.

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

Relevant current options include explicit unresolved-ruby policy, page-progression direction, `--ruby on|off`, and `--cover-occurrence PAGE:OPERATOR:OCCURRENCE`.

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

For parser/model/ruby/source-ownership changes, also run:

```text
npm run verify:ruby
npm run verify:stage2
```

## Next work

Current priority order:

1. **Task 4 unresolved-ruby refinement**: 6,387 unresolved annotations remain. Start with a privacy-safe full-corpus classification/inventory checkpoint before changing association rules. Any promoted exact ruby must be source-backed; ambiguous cases remain explicit.
2. **Task 2 real-reader acceptance**: Stage 14/19/20 implementation exists, but selected real readers still need manual compatibility validation for vertical text, ruby, unresolved notes, images and cover metadata. This environment-dependent task does not block independent Task 4 work.
3. **Task 5 CLI final acceptance**: integrate completed/accepted scope, run the full validation matrix, document known limits, and freeze the supported CLI contract.
4. **Browser/Android adapter** follows CLI acceptance and is not part of the CLI completion condition.

Task 1 body heading/section mapping remains on hold until genuinely new PDF-native source evidence appears. Do not block independent Tasks 2/4/5 on an evidence source the current corpus does not contain.
