# Stage 19 review — Stage 17 → Stage 19

Review date: 2026-09-12

Reviewed range:

```text
base: 78f0728c515324c22c286ed41327426772f17eac
head: 254b001aa6903ab18056b271d0b31d8c5154d2ca
branch: codex-next-20260912
commits: 2
```

The range contains Stage 18 (`f3776ba5c6558794daff98cbb6523351913b0c06`) and Stage 19 (`254b001aa6903ab18056b271d0b31d8c5154d2ca`). The review covered the changed production image inspection/model boundary, placement logic, XHTML/OPF/ZIP serialization, production limits, converter output replacement, tests, and handoff/runbook updates.

The previously reported local verification is consistent with the repository state: Stage 19 records 164 tests, the 9-PDF / 5,141-page image-model verifier with 4 occurrences / 1 unique resource, ruby and Stage 2 regressions, and 4/4 real EPUBCheck integration. The 9-PDF Stage 19 full generated-EPUB regression remains intentionally unrun.

## Findings

### R1 — BLOCKER: non-uniform image scaling can be accepted but is not preserved

`validateImageDisplayTransform()` currently accepts any finite axis-aligned non-mirrored transform with positive X scale and negative Y scale. It does not compare the transformed display aspect ratio with the decoded resource aspect ratio.

The XHTML serializer then emits the decoded resource's intrinsic `width` / `height` and CSS that preserves that intrinsic aspect ratio. Therefore a source PDF that intentionally stretches an image non-uniformly can pass the Stage 19 production boundary but be rendered with a different aspect ratio in EPUB.

The public integration fixture currently demonstrates the hole: its synthetic resource is 4×1 while accepted occurrence bounds can be 10×10.

Required resolution before generic Stage 19 acceptance:

- either fail closed unless the transformed image aspect ratio matches the decoded resource aspect ratio within an explicitly justified tolerance; or
- deterministically reproduce the transformed aspect ratio in EPUB and test it in horizontal/vertical reader fixtures.

For the current private corpus, the four observed 800×600 resources have display bounds at the same 4:3 ratio, so this finding does not contradict the existing four corpus observations.

### R2 — BLOCKER: external PDF graphics-state compositing is not part of the accepted-image contract

`pdf-image-adapter.ts` replays transforms, save/restore, Form nesting, and clipping, but does not replay/validate `setGState` opacity, blend mode, or related compositing state. An XObject painted under non-default alpha/blend state can therefore be accepted as an ordinary production image, while EPUB emits only the decoded PNG as a normal `<img>`.

Required resolution:

- inventory/replay the relevant pinned PDF.js graphics-state evidence and accept only proven default compositing; or
- reproduce a supported subset explicitly; otherwise fail closed.

Add positive/default and negative opacity/blend fixtures. The current private corpus has not yet been proven free of such graphics-state effects by Stage 19 evidence, so the full acceptance run must not be used to silently waive this check.

### R3 — BLOCKER for generic layered images: image/image overlap is not rejected or reproduced

Placement is derived relative to text blocks, but Stage 19 does not test whether two accepted image occurrences overlap each other. Overlapping/layered PDF images are emitted as sequential reflowable `<figure>` elements, which is not equivalent to PDF compositing.

Required resolution:

- detect overlapping accepted image display bounds on the same page and fail closed until a compositing/group representation exists; or
- implement a deterministic compositing model with fixture evidence.

Side-by-side non-overlapping images may remain reflowed in deterministic reading order if that policy is kept explicit. The current private corpus observations contain one accepted image occurrence in each affected source PDF/page, so this is a generic safety gap rather than evidence of a current-corpus failure.

### R4 — MEDIUM: model validation does not cross-check geometry/clip invariants

`validateDocumentModel()` validates transform and bounds independently and validates only the clip status/coverage enum pair. It does not prove that:

- `displayBounds` equals the bounds implied by `displayTransform`;
- `exact-rect` has a finite `clipRect`;
- that `clipRect` actually contains `displayBounds` when `clipCoverage=contains-image`;
- `clipStatus=none` does not carry contradictory clip geometry.

The extraction adapter currently creates consistent evidence, but the typed model's fail-closed invariant is weaker than the Stage 17/19 contract and allows stale/tampered evidence to pass.

Required resolution: add model-level cross-field validation and corruption tests.

### R5 — MEDIUM: production limits are checked after decoded PNG construction

`resolvePdfImageResource()` validates dimensions/data shape and then allocates/copies decoded bytes, builds a PNG scanline buffer, and deflates it. Stage 19 production limits are applied only after that resource has been produced.

The limits therefore bound accepted model/package size but do not fully bound peak work/memory during extraction of hostile or extreme images.

Required resolution: enforce width/height/pixel/decoded-byte limits before PNG construction/copying on the production path, while retaining the final document-wide aggregate checks.

### R6 — ACCEPTANCE BLOCKER: full corpus verifier does not yet validate image package accounting

`verify:epub` currently validates mimetype/basic archive members, page range, navigation, total pages/unresolved annotations, and optional EPUBCheck. It does not count or cross-check:

- XHTML image occurrences;
- unique PNG archive resources;
- OPF image manifest entries;
- XHTML `src` → manifest → ZIP target consistency.

The handoff already anticipated this possibility. Add privacy-safe aggregate image validation before declaring Stage 19 accepted. For the current corpus the expected aggregate is 4 image occurrences backed by 1 unique PNG content resource.

### R7 — FOLLOW-UP / explicit limitation: interpolation evidence is transported but not rendered

`interpolate` is preserved per occurrence, including a test proving that two occurrences of the same content can differ, but XHTML/CSS does not use this evidence. EPUB reader support cannot be assumed to reproduce PDF interpolation exactly.

This does not need to block the current corpus if all accepted occurrences are explicitly shown to use an equivalent/default policy, but the generic converter must either document the limitation, safely map a supported case, or fail closed where the visual difference is material.

## What appears sound

No defect was found in the following Stage 18/19 choices during this review:

- content-hash identity and document-wide PNG byte deduplication while preserving every occurrence;
- source page/operator/occurrence provenance transport;
- fail-closed handling for inline images, cropped/complex clips, unsupported schemas and unsupported transforms already covered by fixtures;
- placement ambiguity rejection relative to text blocks;
- deterministic image archive paths and OPF manifest identity;
- image-only versus blank-page distinction;
- package creation before final output replacement, with temporary-file cleanup on the tested failure paths;
- preserving existing ruby/navigation/content-policy boundaries rather than mixing image heuristics into them.

## Required next order

Do not start with the expensive 9-PDF Stage 19 full regression yet.

1. Fix R1–R4 and add focused fixtures/tests.
2. Move production per-resource guard checks early enough to address R5.
3. Extend `verify:epub` for R6.
4. Decide/document R7; if current-corpus interpolation evidence is needed for acceptance, add a privacy-safe aggregate check.
5. Run `npm test` and `npm run verify:epubcheck`.
6. Because parser/model/inspection boundaries are touched, rerun `npm run verify:image-model`, `npm run verify:ruby`, and `npm run verify:stage2`.
7. Then run a fresh `npm run verify:epub -- --epubcheck --report-dir <NEW_LOCAL_REPORT_DIR>` and require 9/9 EPUB, 5,141/5,141 pages, 6,387 unresolved annotations, 250/250 outline entries, 4 image occurrences, 1 unique PNG resource, complete XHTML/OPF/ZIP reference consistency, and EPUBCheck 9/9 with zero warnings/errors.
8. Only after that mark Stage 19 accepted and proceed to explicit cover policy.

This review does not weaken any existing verifier or replace private-corpus execution with synthetic tests.