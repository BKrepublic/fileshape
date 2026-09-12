# Stage 26: byte-oriented conversion boundary

Status: accepted and merged

## Purpose

Stage 26 is the first bounded checkpoint of Task 6A. It separates conversion of an in-memory PDF from Node filesystem and CLI concerns while preserving the accepted Stage 25 converter behavior.

This checkpoint does not claim that the conversion graph is browser-ready. PDF.js resource loading, hashing, PNG deflate, worker execution, progress, cancellation, download/save, and large-file limits remain explicit follow-up work.

## Accepted baseline

- Start from `main` at or after `8af7b728f67237079b357e6695c35efb83a38894`.
- Stage 25 CLI acceptance remains authoritative, including its option surface, default unresolved-ruby policy, strict rejection, fixed-`modified` determinism, source/output path rejection, and temporary-write-then-rename behavior.
- Stages 13 and 15-24 remain accepted. This checkpoint must not change navigation inference, ruby classification, image extraction, cover selection, EPUB serialization, or their limits.
- Thorium and calibre validation remains pending manual work. Automated results must not be described as manual-reader acceptance.

## Measured dependency boundary

The current production path mixes three concerns:

1. `src/pdf-to-epub.ts` reads the source PDF, hashes it, asks `src/pdf-inspector.ts` to read the same file again, serializes the EPUB, and writes it atomically.
2. `src/pdf-inspector.ts` owns both Node path-derived PDF.js asset locations and the inspection loop.
3. The transitive conversion graph still contains Node-specific implementations: SHA-256 in `document-model.ts`, `epub-package.ts`, and image validation; SHA-256 plus zlib deflate in `pdf-image-resource-adapter.ts`; and the pinned legacy PDF.js module in the inspection/image path.

The repository has no browser bundler or browser TypeScript target. EPUBCheck and Java setup are validation tooling and must not enter a future browser runtime graph.

## Stage 26 contract

### Byte inspection seam

Add an exported byte-input inspection function while retaining the existing path API:

```ts
export type PdfInspectionOptions = {
  includeGlyphs?: boolean;
  includeImages?: boolean;
};

export type PdfJsResourceConfig = {
  cMapUrl: string;
  cMapPacked: boolean;
  standardFontDataUrl: string;
  useSystemFonts: boolean;
  disableFontFace: boolean;
};

export function inspectPdfBytes(
  sourceBytes: Uint8Array,
  sourceName: string,
  options: PdfInspectionOptions,
  resources: PdfJsResourceConfig,
): Promise<InspectResult>;
```

Requirements:

- `sourceName` is a single logical filename, matching browser `File.name`: it must be non-empty and contain no `/`, `\`, or NUL. It is diagnostic/display metadata and the default-title source only. It must not affect source interpretation, provenance, document identity, resource identity, or output ordering.
- The function must reject an empty `sourceName` and empty input before invoking PDF.js.
- The function must own a defensive copy passed to PDF.js because PDF.js may detach the supplied buffer. It must not detach or mutate the caller's `Uint8Array`.
- `InspectResult.file` equals `sourceName`; `byteLength` is measured from the caller input before PDF.js loading.
- `PdfJsResourceConfig` makes cMap/font resource resolution and `cMapPacked` explicit. The existing path API supplies the current Node values and behavior, including `cMapPacked: true`.
- The page loop, outline extraction, glyph mapping, image extraction, validation, and fail-closed errors are moved without semantic changes.
- PDF.js-returned inspection fields, including `fontName`, are preserved verbatim. Process-global PDF.js font prefixes may be normalized only inside the parity-test comparator; production inspection data must not be rewritten to make a test equal.
- The existing `inspectPdf(inputPath, options)` remains source compatible and continues to read a file once for callers of that API.

### Byte conversion seam

Add an exported conversion function that performs no filesystem operation:

```ts
export type PdfBytesToEpubResult = {
  sourceName: string;
  bytes: Uint8Array;
  documentId: string;
  pageCount: number;
  unresolvedAnnotationCount: number;
  byteLength: number;
  navigation: EpubNavigationSummary;
  coverImageResourceId?: string;
};

export function convertPdfBytesToEpub(
  sourceBytes: Uint8Array,
  sourceName: string,
  options?: PdfToEpubOptions,
): Promise<PdfBytesToEpubResult>;
```

Requirements:

- It validates `sourceName` and non-empty input before hashing, title derivation, or PDF.js processing.
- It performs source hashing before inspection and computes the same `urn:sha256:` document ID as Stage 25.
- It uses the byte inspection seam with the current Node PDF.js resource configuration for this checkpoint. The Node-specific resource provider must be named and isolated so a later browser adapter can replace it.
- It preserves all existing package defaults and option behavior.
- The default title is derived from the logical filename without platform path rules: remove the suffix beginning at the last `.` only when that dot is after the first character. Thus `book.v2.pdf` becomes `book.v2`, `.book` remains `.book`, and `book.` becomes `book`. An explicitly supplied title always wins.
- Returned `bytes` are the exact bytes used for `byteLength` and must not share mutable storage with caller input.
- The function performs no read, write, rename, unlink, temporary-file, process, or console operation.

### Node CLI adapter

Keep `convertPdfToEpub(inputPath, outputPath, options)` and CLI parsing in `src/pdf-to-epub.ts` as the Node adapter.

- Resolve and reject identical input/output paths before reading the input.
- Read the PDF exactly once, then call `convertPdfBytesToEpub` with `path.basename(absoluteInput)` as `sourceName`. The Node adapter continues to return the absolute path separately as `inputPath`.
- Preserve temporary-file creation, exclusive write, atomic rename, best-effort temporary cleanup, and existing-output preservation on pre-write failure.
- Preserve `PdfToEpubResult`, CLI stdout fields, help text, documented options, exit behavior, and absolute `inputPath`/`outputPath` results.

## Tests

Add public-fixture tests that prove:

1. `inspectPdfBytes` leaves caller bytes unchanged and returns the same structural inspection as `inspectPdf` after normalizing the expected `file` label and PDF.js's process-global `g_d<digits>_` font prefix in the test comparator only.
2. `convertPdfBytesToEpub` with fixed `modified` produces byte-identical EPUB output to `convertPdfToEpub` for the same public PDF and options.
3. Calling byte conversion twice with fixed `modified` is byte deterministic.
4. The byte API preserves default unresolved notes, strict unresolved rejection, explicit cover lookup errors, and document identity.
5. Changing only `sourceName` leaves `documentId` unchanged; with an explicit title and fixed `modified`, it also leaves EPUB bytes unchanged.
6. Returned EPUB bytes have different backing storage from caller input; mutating the returned bytes does not change caller input.
7. For both inspection and conversion byte APIs, empty byte input and an empty, separator-containing, or NUL-containing `sourceName` fail before PDF.js processing.
8. Existing CLI parser, same-path rejection, failed-output preservation, and end-to-end archive tests continue to pass unchanged.

Verification for this checkpoint is `npm test` plus `git diff --check`. Private corpus evidence is not required to establish this architectural seam. A later acceptance checkpoint must rerun the full private corpus before claiming browser/Android conversion parity.

## Out of scope and next decisions

- Replacing Node SHA-256 or zlib implementations.
- Selecting or adding a browser bundler.
- Browser worker integration, progress events, cancellation, object URL lifecycle, and file-size policy.
- Browser UI or Android UI.
- Choosing PWA, WebView, or native Android packaging.
- Manual Thorium or calibre acceptance.

After this checkpoint, Task 6A must inventory the remaining transitive Node imports from the new byte boundary and design injectable or web-standard hashing, compression, and PDF.js runtime/resource adapters. Only then may Task 6B select a browser build path.

## Review and local verification

The final implementation contract passed Sol-Luna specification review:

```text
REVIEW_STATUS: PASS
REVIEWED_SHA256: 79e7609cbe30cadbc7c22cab8472fc1e5ad381dcb8c686d3768ed0256b38c6af
FINDINGS: 0
```

The implementation adds `inspectPdfBytes` and `convertPdfBytesToEpub`, preserves the path APIs, and makes the Node CLI read its source exactly once. Review removed a proposed production normalization of PDF.js-generated font names; those inspection values remain verbatim.

Independent local verification on the final working tree:

```text
npm test: PASS (202/202)
npm run verify:epubcheck: PASS (5/5)
git diff --check: PASS
```

No private PDF, generated private EPUB, or local report is part of this checkpoint. Private corpus parity remains required before a later browser/Android acceptance claim.

GitHub acceptance:

```text
IMPLEMENTATION_COMMIT: c57240591bdefd23970add65c0a3cd695a79d015
PR: #19
MERGE_COMMIT: fca44cf7e4fee433951801cbb243668af671cd52
PR_CI: SUCCESS
MAIN_PUSH_CI: SUCCESS
```
