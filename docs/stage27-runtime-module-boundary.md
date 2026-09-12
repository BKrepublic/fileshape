# Stage 27: runtime module boundary and dependency inventory

Status: accepted and merged

## Purpose

Stage 27 is the second bounded Task 6A checkpoint. Stage 26 separated byte-oriented functions from filesystem operations at the call level, but both byte functions still live in modules that directly import Node filesystem/path APIs. This checkpoint creates explicit modules for the byte inspection and conversion paths, keeps Node defaults in adapters, and records the remaining transitive runtime blockers before any browser library or bundler is selected.

This is an architectural move only. It must not change PDF interpretation, document identity, EPUB bytes, CLI behavior, or accepted failure policy.

## Accepted baseline

- Start from `main` at or after Stage 26 merge `fca44cf7e4fee433951801cbb243668af671cd52` and its acceptance record.
- Stage 26's public byte APIs, logical `sourceName` rules, defensive ownership, explicit PDF.js resource configuration, path/byte parity, and Node CLI one-read behavior remain accepted.
- Stages 13 and 15-25 remain closed and unchanged. Manual Thorium/calibre validation remains unperformed.
- Do not add a browser bundler, UI, Android project, new runtime package, or private-corpus artifact in this checkpoint.

## Measured current graph

The Stage 26 byte functions have these direct and transitive environment dependencies:

| Current entry | Direct environment imports | Relevant transitive imports |
| --- | --- | --- |
| `pdf-to-epub.ts::convertPdfBytesToEpub` | `node:crypto`, `node:fs/promises`, `node:path`, `node:url` | `node:crypto` in model/package validation; `node:crypto` and `node:zlib` in PNG resource construction; pinned `pdfjs-dist/legacy/build/pdf.mjs` |
| `pdf-inspector.ts::inspectPdfBytes` | `node:fs/promises`, `node:path`, `node:url`, pinned legacy PDF.js | `node:crypto` and `node:zlib` through production image extraction; pinned legacy PDF.js through glyph/image adapters |

`epubcheck.ts` and `setup-epubcheck.ts` depend on Java/process/filesystem, but neither is reachable from the conversion entry graph. They remain development and CI validation tools.

## Stage 27 contract

### Inspection model and core module

Create `src/pdf-inspection-model.ts` as an environment-neutral type module. Move the Stage 26 inspection result/page/item types, `PdfInspectionOptions`, and `PdfJsResourceConfig` there without changing their fields or meaning.

Create `src/pdf-inspector-core.ts` containing `inspectPdfBytes` and the existing PDF.js page/outline/glyph/image inspection loop.

- It may directly import the pinned `pdfjs-dist/legacy/build/pdf.mjs` and existing FileShape interpretation modules.
- It must not directly import `node:fs`, `node:path`, `node:url`, or any Node process/console API.
- It receives all cMap/font settings through `PdfJsResourceConfig` and preserves the Stage 26 validation and defensive-copy rules.
- It preserves PDF.js-returned inspection values verbatim.

Retain `src/pdf-inspector.ts` as the Node file adapter:

- define and export `nodePdfJsResourceConfig` using the current module-relative `node_modules/pdfjs-dist` paths and the accepted Stage 26 values;
- implement `inspectPdf(inputPath, options)` with one file read and `path.basename(inputPath)`;
- re-export `inspectPdfBytes` and all moved public types so every existing import from `pdf-inspector.ts` remains source compatible.

Only imports that need the new core/model boundary should change. Do not perform broad import cleanup.

### Conversion core module

Create `src/pdf-to-epub-core.ts` containing the Stage 26 byte conversion types, source-name/title validation, content-based document ID, document build, cover resolution, and EPUB serialization.

Export:

```ts
export function convertPdfBytesToEpubWithResources(
  sourceBytes: Uint8Array,
  sourceName: string,
  options: PdfToEpubOptions | undefined,
  resources: PdfJsResourceConfig,
): Promise<PdfBytesToEpubResult>;
```

- This function must satisfy the complete accepted Stage 26 byte conversion contract.
- It must call `inspectPdfBytes` from `pdf-inspector-core.ts` with the supplied resource configuration.
- It must not directly import `node:fs`, `node:path`, `node:url`, `randomUUID`, or use process/console/file output APIs.
- `node:crypto` for synchronous SHA-256 is an explicitly measured remaining direct blocker in this checkpoint and may stay.
- Transitive Node hashing and zlib inside model/package/image modules may stay. Do not replace them until a later reviewed checkpoint selects a browser-capable implementation.

Retain `src/pdf-to-epub.ts` as the Node/default adapter and CLI:

- re-export `PdfToEpubOptions`, `PdfBytesToEpubResult`, and `convertPdfBytesToEpubWithResources` from the core module;
- preserve the Stage 26 `convertPdfBytesToEpub(sourceBytes, sourceName, options?)` signature by delegating to `convertPdfBytesToEpubWithResources` with `nodePdfJsResourceConfig`;
- preserve `convertPdfToEpub`, argument parsing, help, CLI invocation detection, stdout, exit behavior, one input read, and atomic output handling byte-for-byte in behavior;
- keep adapter-only `randomUUID`, filesystem, path, URL, process, and console use here.

### Dependency inventory artifact

Add a Node-only development tool at `src/runtime-dependency-inventory.ts` and commit its deterministic output at `docs/stage27-runtime-dependency-inventory.json`.

The tool must use the installed TypeScript compiler API to inspect static `import` and re-export declarations from the two core entrypoints. It must follow relative runtime imports recursively, ignore erased type-only edges, classify `node:` and external-package imports, and sort every object key/array deterministically. It must reject unresolved relative imports and unsupported dynamic/nonliteral module edges instead of silently omitting them.

The committed JSON schema is:

```ts
type RuntimeDependencyInventory = {
  schemaVersion: 1;
  entrypoints: Array<{
    path: "src/pdf-inspector-core.ts" | "src/pdf-to-epub-core.ts";
    directNodeBuiltins: string[];
    transitiveNodeBuiltins: string[];
    externalPackages: string[];
    reachableLocalModules: string[];
  }>;
  nodeAdapterProviders: [{
    path: "src/pdf-inspector.ts";
    exportName: "nodePdfJsResourceConfig";
    directNodeBuiltins: string[];
    configKeys: [
      "cMapPacked",
      "cMapUrl",
      "disableFontFace",
      "standardFontDataUrl",
      "useSystemFonts",
    ];
  }];
  unreachableValidationTooling: ["src/epubcheck.ts", "src/setup-epubcheck.ts"];
  absentBrowserContracts: [
    "worker-ownership",
    "progress",
    "cancellation",
    "diagnostics",
    "file-size-memory-policy",
    "download-save",
    "resource-cleanup",
  ];
};
```

The generated inventory must distinguish:

1. direct Node imports in the byte core modules;
2. transitive Node imports reachable through model/package/image modules;
3. pinned PDF.js imports and the explicit Node resource provider;
4. Java/EPUBCheck tooling that is not reachable from conversion;
5. browser contracts still absent: worker ownership, progress, cancellation, diagnostics, file-size/memory policy, download/save, and resource cleanup.

Do not describe either core module as browser-ready while any listed blocker remains. The generator must inspect `src/pdf-inspector.ts` and fail unless the named provider is an exported object with every listed config key; its runtime direct Node imports must populate `directNodeBuiltins`. It must also fail unless `src/pdf-to-epub.ts` imports that provider and supplies it to the core conversion delegate. `unreachableValidationTooling` is valid only when neither listed file is reachable from either entrypoint; generation/checking must fail otherwise. `absentBrowserContracts` is the exact design-owned list for this checkpoint and must not be shortened to obtain green output.

Add package scripts:

```text
inspect:runtime-deps  # write the deterministic JSON artifact
verify:runtime-deps   # recompute and fail on any byte-level difference without rewriting
```

## Tests and acceptance

Add `test/stage27-runtime-module-boundary.test.ts` with meaningful boundary checks:

1. Read the three new core/model source files and fail if the inspection model/core directly imports Node built-ins or if the conversion core directly imports forbidden filesystem/path/URL/process/console APIs. The test must explicitly allow and report the accepted `node:crypto` direct blocker rather than hiding it.
2. Convert the public PDF fixture through `convertPdfBytesToEpubWithResources(..., nodePdfJsResourceConfig)` and the Stage 26 `convertPdfBytesToEpub` wrapper with the same explicit title and fixed `modified`; require byte-identical output and identical result metadata other than independent byte storage.
3. Confirm the existing public imports from `pdf-inspector.ts` and `pdf-to-epub.ts` remain usable through TypeScript and the full test suite.
4. Recompute `docs/stage27-runtime-dependency-inventory.json` in memory and require byte-for-byte equality with the committed artifact. Assert that the two validation-tool files are unreachable, the absent-browser-contract list is exact, `pdf-inspector-core.ts` has no direct Node builtin, `pdf-to-epub-core.ts` reports `node:crypto` as its only direct Node builtin, and the exact Node PDF.js provider descriptor and adapter delegation are present.

Required verification:

```text
npm test
npm run verify:runtime-deps
npm run verify:epubcheck
git diff --check
```

Private corpus verification is not required for a module-only move with public byte parity. It remains mandatory before a later browser/Android parity acceptance claim.

## Out of scope and next checkpoint

- Replacing SHA-256 or zlib.
- Changing synchronous model/package/image APIs.
- Selecting dependencies or a bundler.
- Browser worker/progress/cancel/diagnostic implementation.
- Browser or Android UI and file handling.
- Performance or large-file acceptance.
- Manual Thorium/calibre acceptance.

After Stage 27, the next design must use the recorded graph to select and validate browser-capable SHA-256, zlib/PNG, and PDF.js runtime/resource strategies. That decision requires a minimal browser build/fixture measurement; it must not be made by weakening validation or silently moving PDF content to a backend.

## Review and local verification

The final contract passed Sol-Luna specification review after the dependency artifact schema and Node resource-provider checks were made exact:

```text
REVIEW_STATUS: PASS
REVIEWED_SHA256: 3f41e1badec1a65fa4cbfa5f58c54b562c5a76a2e6d60c93cbd99b1eec37c06b
FINDINGS: 0
```

Implementation review found and corrected two inventory gaps: a builtin used both directly and transitively must remain visible in both classes, and unsupported TypeScript `import = require(...)` syntax must fail closed. Sorting now uses explicit code-unit order and repository paths use `/`, avoiding locale/platform drift.

Independent local verification on the final working tree:

```text
npm test: PASS (205/205)
npm run verify:runtime-deps: PASS
npm run verify:epubcheck: PASS (5/5)
git diff --check: PASS
```

The generated inventory reports:

- inspection core: no direct Node builtin; transitive `node:crypto` and `node:zlib`;
- conversion core: direct `node:crypto`; transitive `node:crypto` and `node:zlib`;
- external runtime package: pinned `pdfjs-dist`;
- Node PDF.js provider: `nodePdfJsResourceConfig` in `src/pdf-inspector.ts`;
- `epubcheck.ts` and `setup-epubcheck.ts`: unreachable from both conversion entrypoints;
- all seven browser operation contracts in this design: absent.

The inventory tool uses the TypeScript 7 `typescript/unstable/ast` scanner API because the installed package exposes compiler syntax APIs through that path. Its output is committed and byte-verified, but this API remains a development-tool maintenance risk if the pinned dependency changes.

GitHub acceptance:

```text
IMPLEMENTATION_COMMIT: 2fdd4d062470305978127de0c0d448867f21632c
PR: #20
MERGE_COMMIT: d2329fd35b2b4960d052dbb6d42be3c10e428e40
PR_CI: SUCCESS
MAIN_PUSH_CI: SUCCESS
```
