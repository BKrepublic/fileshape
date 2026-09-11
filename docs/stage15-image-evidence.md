# Stage 15: image paint evidence inventory

This checkpoint implements Task 3A from `docs/remaining-work/03-images-and-cover.md`. It inventories PDF image paint occurrences and placement evidence only. It does **not** yet extract image bytes, insert images into the typed document model, choose covers, or claim image-preserving EPUB conversion.

## Command

```text
npm run inspect:images -- PDF_OR_DIRECTORY --output NEW_FILE [--expect-pdf-count N] [--expect-page-count N]
```

For the private regression corpus, use `--expect-pdf-count 9 --expect-page-count 5141`. Reports are local-only and the output path is created exclusively.

## Evidence contract

`src/pdf-image-adapter.ts` isolates the pinned PDF.js `6.3.289` operator schema. It replays graphics transforms and records each image paint with:

- source page and operator index;
- expanded occurrence index for supported repeat operators;
- operator/kind classification;
- hashed resource reference when present;
- observed dimensions when exposed by the operator;
- current PDF graphics transform and PageViewport-composed display transform;
- Form nesting depth;
- whether clipping has been observed in the active graphics scope;
- explicit supported/unsupported schema status and reason.

The report does not emit PDF filenames, resource IDs or decoded image bytes. It does not equate paint operations, resource references and semantic illustrations.

Group/mask/repeat schemas that are not safely interpreted remain explicit `unsupported-schema` evidence. Clipping is recorded only as a presence signal at this stage; exact clip geometry and compositing fidelity are not claimed.

## Fixture coverage

The real PDF fixture includes reused image XObjects, clipping, an inline image, transform/scale changes, a Form-contained image and page rotation. Unit controls also cover repeat expansion and unsupported group retention.

## Before Task 3B

Run the complete private corpus inventory and review:

1. total paint count equals supported + unsupported count;
2. counts by operator kind and unsupported reason;
3. unique resource-reference hashes separately from paint occurrences;
4. Form-contained and clipped occurrence counts;
5. representative records for every non-zero kind/reason;
6. adapter issues are explained rather than discarded.

Only after the observed schemas are known should byte extraction, image-resource identity, masks/clips, model placement and resource limits be designed. Cover selection remains explicit-only and is not part of this inventory.
