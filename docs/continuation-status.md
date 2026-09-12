# FileShape continuation status

Updated 2026-09-12 after the independent Stage 17 → Stage 19 implementation review.

## Current GitHub baseline

Do **not** start the next session from `main`. Stage 18 / Stage 19 and the review handoff live on:

```text
branch: codex-next-20260912
required Stage 19 implementation ancestor: 254b001aa6903ab18056b271d0b31d8c5154d2ca
```

Start from the latest `codex-next-20260912` HEAD and verify that `254b001aa6903ab18056b271d0b31d8c5154d2ca` is an ancestor. Documentation/review commits intentionally move the branch beyond the Stage 19 implementation SHA, so do not reset to that commit.

The 9 private corpus PDFs are not committed; their full-corpus checks remain local-only.

For the next Codex session, start with [codex-handoff-20260912.md](codex-handoff-20260912.md), [Stage 19 review](stage19-review.md), and the [remaining-work runbook](remaining-work/README.md).

## Proven production baseline

The core PDF -> EPUB path has already been proven over the complete private corpus before Stage 19 image packaging:

```text
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
EPUBCheck 5.3.0: 9/9 passed with 0 fatal / 0 error / 0 warning
```

Historical Stage 12a package total was 16,639,748 bytes. Treat this as a historical comparison point, not a value future feature work must preserve byte-for-byte.

Known parser/model regression baseline:

```text
ruby: 33 pages; mapped runs 880/880; exact candidates 373;
      unresolved retained 2; representative exact pairs 11/11
semantic samples: 7/7
Stage 2: 9/9 PDFs; 5141 pages; semantic output 5141/5141;
         font-pair semantic match 223/223
```

## Completed checkpoints after Stage 12

### Stage 13a: outline destination -> source evidence

All 250 outline entries in six PDFs were analyzed without using titles for body matching. Results:

```text
unique-position: 0
ambiguous-position: 0
page-only: 250
unmappable: 0
```

The corpus therefore provides no source-backed body heading/section anchors through outline destinations. Task 1 body heading/section mapping is on hold. Stage 12a page-level outline navigation remains the accepted fallback. Do not add nearest-text, title/body string matching, or outline-depth heading inference to force body anchors.

See [Stage 13a](stage13a-outline-source-evidence.md).

### Stage 14: reading-system CSS/resources

Implemented deterministic packaged CSS, manifest registration, XHTML stylesheet links, reflow-safe horizontal/vertical rules, ruby/note styling, explicit page progression direction, and a synthetic reading-system fixture.

Task 2 is **not fully accepted** until real-reader validation is performed on the selected desktop readers. Standards validation is not a substitute for that manual compatibility check.

See [Stage 14](stage14-reading-system-css.md) and [Task 2](remaining-work/02-reading-systems.md).

### Stage 15: image paint evidence

The complete private corpus contains only four image paint occurrences. All are XObject paints, all are supported by the pinned PDF.js adapter, and none is Form-contained in the private corpus.

See [Stage 15](stage15-image-evidence.md).

### Stage 16: decoded image resources

All four known XObjects decode successfully as 800x600 RGB24. They all produce the same deterministic PNG content resource. Occurrences remain four even though content resource identity deduplicates to one.

Observed aggregate:

```text
IMAGE_PAINTS=4
XOBJECT_PAINTS=4
EXTRACTED_RESOURCES=4
UNSUPPORTED_RESOURCES=0
UNIQUE_CONTENT_RESOURCES=1
TOTAL_DECODED_BYTES=5760000
TOTAL_PNG_BYTES=604156
MAX_PIXELS=480000
PIXEL_KIND_COUNTS={"rgb24":4}
```

See [Stage 16](stage16-image-resources.md).

### Stage 17: content controls, clip evidence, marked-content inventory

Exact ruby now supports conversion-time `rubyMode: "on" | "off"` and CLI `--ruby on|off`. `off` removes only exact ruby annotation markup from the rendered output; it does not mutate source provenance and does not silently discard unresolved ruby candidates.

The final private image-clip scan on all 9 PDFs / 5,141 pages found:

```text
IMAGE_PAINTS=4
CLIP_STATUS_COUNTS={"exact-rect":4}
CLIP_COVERAGE_COUNTS={"contains-image":4}
IMAGE_ISSUES=0
```

For every occurrence, the exact rectangular clip equals/contains the transformed image bounds. No current-corpus occurrence requires pixel cropping. This clears the current corpus for ordinary reflowable EPUB image placement, while generic cropped/complex/unknown clip cases must remain fail-closed or explicitly handled in fixtures.

The full marked-content operator inventory found:

```text
MARKED_OCCURRENCES=0
TAG_COUNTS={}
WRAPPER_TAG_COUNTS={}
POINT_TAG_COUNTS={}
MAX_MARKED_DEPTH=0
MARKED_ISSUES=0
```

Therefore the current private corpus has no PDF marked-content tags requiring a special-effect conversion policy. Keep the generic safe-normalization policy for future inputs, but do not invent special-tag rules for this corpus.

See [Stage 17](stage17-content-controls-image-placement.md).

### Stage 18: production image model boundary

The accepted Stage 15–17 XObject subset now has an opt-in production inspection path and typed `FileShapeDocument` resource/occurrence representation. PNG content bytes deduplicate independently from paint occurrences; occurrence provenance retains page/operator/repeat identity, geometry, Form depth, interpolation and clip evidence. Model validation rejects byte/hash corruption, missing resources, duplicate/out-of-order occurrences and unsupported clip state.

Inline images, masks, cropping, complex/unknown clips, unsupported schemas and failed decoding remain fail-closed. EPUB XHTML/package output is deliberately not enabled at this intermediate checkpoint, so Stage 18 is not yet an image-preserving conversion claim. See [Stage 18](stage18-production-image-model.md).

Local acceptance passed 154 tests, ruby and Stage 2 full-corpus baselines, four real EPUBCheck integration cases, the complete 9-PDF EPUB regression, and the new production image model verifier. The latter transported 4/4 occurrences as four model resources across the source PDFs while confirming one unique PNG content hash.

### Stage 19: production image integration checkpoint

The production converter now enables image inspection, assigns every accepted occurrence a geometry-backed block gap, writes each occurrence into ordered XHTML, and packages deduplicated PNG bytes at deterministic content-hash paths with matching OPF manifest entries. Image-only and blank pages remain distinct. Ambiguous placement, unsupported transforms/clips/schemas, invalid resources and production-limit violations fail before the output path is replaced. Cover selection remains outside this checkpoint.

Local checkpoint verification passed 164 tests, the 9-PDF image-model verifier (4 occurrences / 1 unique content resource), ruby, Stage 2, and 4/4 real EPUBCheck integration cases. The 9-PDF full EPUB regression with generated Stage 19 EPUBs was deliberately left unrun at the requested interruption point. See [Stage 19](stage19-production-image-integration.md).

An independent review of `78f0728c...` → `254b001aa...` found generic production-safety gaps that must be corrected before Stage 19 is accepted. The review is recorded in [Stage 19 review](stage19-review.md). Blocking areas are:

- non-uniform image scaling can pass while XHTML preserves intrinsic rather than transformed aspect ratio;
- external PDF graphics-state opacity/blend is not part of the accepted-image proof;
- overlapping/layered accepted images are not rejected or composited;
- typed model validation does not cross-check transform/bounds/clip geometry;
- per-resource production limits are applied after PNG construction rather than before expensive work;
- the full corpus verifier does not yet aggregate XHTML image occurrences, PNG archive resources, OPF image items, and reference consistency.

Interpolation evidence is transported but not currently rendered; this remains an explicit follow-up decision rather than something to silently ignore.

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
  -> OPF / nav / image resources / container / ZIP package
  -> .epub
```

The user-facing CLI remains:

```text
npm run convert:epub -- input.pdf [output.epub]
```

Relevant current options include explicit unresolved-ruby policy, page-progression direction, and `--ruby on|off`.

## Important invariants

Do not introduce behavior keyed to website, filename, URL, PDF Creator/Producer, generator name, font name, N-code, or particular character appearance. Parser decisions must come from PDF structure, geometry, ordering and provenance.

Do not loosen existing verifiers or change expected values merely to obtain green tests. Preserve original `TextItem.str` and source references as source truth. Never split ligatures or supplementary Unicode by guessed character/glyph widths. Uncertain ruby, unsupported images, and ambiguous effects must remain explicit rather than disappearing.

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

`verify:stage2` includes semantic verification. Install the pinned EPUBCheck distribution with `npm run setup:epubcheck` before standards validation.

## Next work

The [remaining-work runbook](remaining-work/README.md) is the CLI-completion roadmap. Its detailed task documents remain the acceptance contracts, with the later [Stage 19 review](stage19-review.md) superseding the old instruction to run the expensive full regression immediately.

Current priority order:

1. **Fix Stage 19 review blockers**: address R1–R6 with focused fixtures/tests. Preserve fail-closed behavior rather than weakening the accepted subset.
2. **Run Stage 19 private EPUB acceptance after those fixes**: rerun image-model/ruby/Stage 2/public EPUBCheck, then the complete 9-PDF EPUB regression with privacy-safe aggregate checks for 4 XHTML image occurrences backed by 1 unique PNG resource and complete XHTML/OPF/ZIP reference consistency.
3. **Task 2 real-reader acceptance**: Stage 14 implementation exists, but the selected real readers still need explicit compatibility validation. Re-run affected display checks after image integration.
4. **Task 3 explicit cover policy**: only after ordinary image preservation is stable. Cover choice must be explicit or source-backed, never visual guesswork.
5. **Task 4 unresolved ruby refinement**: 6,387 unresolved annotations remain a separate improvement area. The Stage 17 ruby on/off control does not complete this task.
6. **Task 5 CLI final acceptance**: integrate completed/accepted scope, run the full validation matrix, document known limits, and freeze the supported CLI contract.
7. **Browser/Android adapter** follows CLI acceptance and is not part of the CLI completion condition.

Task 1 body heading/section mapping remains on hold until genuinely new PDF-native source evidence appears. Do not block independent Tasks 2/3/4 on an evidence source the current corpus does not contain.
