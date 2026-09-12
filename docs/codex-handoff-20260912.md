# Codex handoff — 2026-09-12

FileShape の次セッションを GitHub だけから再開するための入口です。

## Stage 19 status

Stage 18/19 production image integration と independent-review hardening は完了し、private 9-PDF acceptance も PASS しました。

```text
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Outline entries: 250/250
Image occurrences: 4/4
Unique PNG content resources: 1/1
Interpolated image occurrences: 0
XHTML/OPF/ZIP references: consistent
EPUBCheck 5.3.0: 9/9 passed (0 errors, 0 warnings)
```

Stage 19 is therefore **accepted** for the currently supported ordinary-image subset. Unsupported compositing/layering/crop/interpolation remains fail-closed rather than approximated.

See:

- `docs/stage19-production-image-integration.md`
- `docs/stage19-review.md`
- `docs/stage19-hardening.md`
- `docs/continuation-status.md`
- `docs/remaining-work/README.md`

## Correct starting point

PR #11 integrates Stage 18/19 into `main`. Once PR #11 is merged, **new work starts from the latest `main`**. Do not reset to old Stage 19 implementation commits and do not continue from a stale pre-merge feature branch.

Before editing:

```sh
git fetch origin
git switch main
git pull --ff-only
git rev-parse HEAD
```

If PR #11 is still open, finish/merge it first after its CI is green.

## Next implementation checkpoint

The next Task 3 work is **explicit/source-backed cover policy**.

Required policy:

- no automatic cover inference by page number, image dimensions, position, filename, appearance, OCR/content, Creator/Producer, or font;
- inputs without explicit/source-backed cover evidence remain valid EPUBs with no cover designation;
- initial user-facing selector should identify an exact existing image occurrence using source provenance, not a guessed image;
- missing or ambiguous selector must fail closed before output replacement;
- selecting a cover marks the already packaged image resource as EPUB `cover-image`;
- keep the original body image occurrence; do not delete/reorder it;
- do not synthesize a separate cover XHTML/spine page unless a later requirement proves it necessary, because doing so creates an extra visible occurrence;
- one cover image maximum;
- default behavior remains deterministic and unchanged when no cover is selected.

A practical initial CLI contract is:

```text
--cover-occurrence PAGE:OPERATOR:OCCURRENCE
```

Validate source page > 0, operator/occurrence >= 0, require exactly one matching `DocumentImageOccurrence`, and resolve that occurrence's `resourceId`. OPF should add `properties="cover-image"` only to that image resource item.

Focused tests must cover: no cover by default, valid selection, missing selection, malformed CLI selector, same content resource used by multiple occurrences, and preservation of the selected body occurrence. Run `npm test` and `npm run verify:epubcheck`; package changes then require a fresh private full EPUB acceptance before cover work is accepted.

## Remaining roadmap

1. explicit cover policy;
2. real-reader acceptance for vertical/ruby/image output;
3. unresolved-ruby refinement (6387 current private candidates);
4. CLI final acceptance and supported-contract freeze;
5. browser/Android after CLI completion.

Task 1 body heading/section mapping remains on hold because Stage 13a found no source-backed body anchor. Do not manufacture one by string or visual heuristics.

## Prohibitions

- do not weaken verifiers to obtain PASS;
- do not introduce source/site-specific parser branches;
- do not silently drop unresolved ruby or unsupported image/effect evidence;
- do not commit private PDFs, private images, generated private EPUBs, extracted body text, or local reports.
