# Stage 29 Codex handoff

This file records the accepted Stage 29 browser runtime portability checkpoint
and the remaining work after it.

## Repository state

- Repository: `BKrepublic/fileshape`
- Branch: `stage29-browser-runtime-portability`
- PR: #22
- Accepted implementation head:
  `2e68168f17f44f4b11396c341028df5217fb79db`
- Local worktree: `/data/experiment/fileshape`
- GitHub Actions are prohibited. Do not add, restore, run, rerun, or use
  workflow status as acceptance evidence.
- Private corpus files, generated EPUBs, and local reports must never be
  committed or uploaded.

## Accepted baselines

Stages 25–28 remain accepted and were not reopened. Stage 29 preserves the
accepted Node/CLI conversion path and adds a real local-only browser/PWA path
through the same conversion core.

The accepted private corpus baseline remains:

```text
PDFs=9
Pages=5141
Unresolved annotations preserved=6387
Outline entries=250/250
Image occurrences=4/4
Unique PNG content resources=1
Node EPUB bytes=17959256 total
EPUBCheck 5.3.0=9/9, 0 errors, 0 warnings
```

Manual Thorium/calibre validation is still unperformed. EPUBCheck or browser
byte equality must not be described as real-reader acceptance.

## Stage 29 accepted implementation

Browser conversion remains local-only and executes in a dedicated conversion
Worker with a real PDF.js Worker. Input PDF and output EPUB buffers are
transferred rather than uploaded. Progress, cancellation, result download,
cleanup, retry, and the mobile-first PWA UI are connected to the shared core.

The browser runtime uses:

- Web Crypto for SHA-256;
- a committed 44,801-byte zlib-ng 2.3.3 WebAssembly artifact for deterministic
  zlib deflate;
- PDF.js 6.3.289 CMaps, standard fonts, WASM, and ICC resources from the
  application origin;
- system Chrome `/usr/bin/google-chrome-stable` for local Playwright checks.

The accepted Node provider in `src/binary-runtime-node.ts` is unchanged.

Browser PDF.js must retain:

```ts
isOffscreenCanvasSupported: false,
isImageDecoderSupported: false,
```

These options keep image extraction on the decoded-byte path required by the
accepted Node/browser PNG contract.

## Deterministic zlib contract

The accepted Node v26.7.0 environment reports `1.3.1.zlib-ng` and links
`zlib-ng-compat 2.3.3-2`. A native control proved that choosing the same
library is not sufficient: `compress2` diverges for production-sized input.
Exact equality requires Node's synchronous call pattern—zlib defaults plus
repeated `deflate(..., Z_FINISH)` calls with 16 KiB output windows.

The repository therefore includes:

- `vendor/zlib-ng/fileshape-zlib-wrapper.c`;
- `vendor/zlib-ng/build-wasm.sh`;
- `vendor/zlib-ng/LICENSE` and provenance README;
- `web/vendor/fileshape-zlib-ng-2.3.3.wasm`;
- the neutral adapter `src/zlib-wasm-adapter.ts`;
- the same-origin Vite loader `web/zlib-ng-binary-runtime.ts`.

Pinned inputs:

```text
zlib-ng commit=12731092979c6d07f42da27da673a9f6c7b13586
emsdk commit=5eb0bde7585670252e8ba05e9d361627bffd08b5
Emscripten commit=4e4223852a0835923411059a3929907d7df1232e
WASM SHA-256=90bc26f8c73322492510a9438e04d41c5ab7badcf76d0ae1e70d1aae4d9176f1
```

The failed pako 3.0.1 experiment remains reverted. Do not retry its legacy hash
variants or add a `CompressionStream` fallback.

## Resource-base correction

The first four private PDFs passed after the zlib fix, while anonymous PDF
`sha256:b59291fa7de1903e` exposed missing browser text. The conversion Worker had
resolved PDF.js resources relative to its emitted `/assets/` location, producing
invalid `/assets/pdfjs/` URLs.

`browserPdfJsResourceConfig` now receives an explicit application base. The
page probe uses the page base, the conversion Worker uses the parent of its
`assets/` directory, and every resource URL remains origin-checked. Public
tests require application-level `pdfjs/` requests and reject
`/assets/pdfjs/`.

Do not change PDF interpretation or font policy to address resource failures.

## Acceptance evidence

Public local gate on the accepted implementation head:

```text
npm test=PASS (217/217)
npm run verify:runtime-deps=PASS
npm run verify:browser=PASS (2/2)
npm run verify:epubcheck=PASS (5/5)
git diff --check=PASS
pinned WASM rebuild and byte comparison=PASS
```

Private local browser gate:

```text
PRIVATE_BROWSER_ACCEPTANCE=PASS
PRIVATE_BROWSER_PDFS=9
PRIVATE_BROWSER_PAGES=5141
PRIVATE_BROWSER_UNRESOLVED=6387
PRIVATE_BROWSER_BYTE_IDENTICAL=yes
elapsed=2.9m
```

The gitignored report is
`local-reports/stage29-browser-private-1789277083621.json`. This path is local
evidence only and must not be committed.

## Remaining work

1. Merge PR #22 after the documentation/review checkpoint, using local
   verification as evidence. Do not enable GitHub Actions.
2. Keep manual Thorium/calibre reader validation pending until it is actually
   performed.
3. Derive any browser size/support statement from the recorded RSS/elapsed
   evidence and representative target-device runs. Stage 29 does not define a
   universal maximum input size.
4. Begin Android architecture evaluation only from the accepted browser/core
   path. Compare installed PWA, WebView wrapper, and native adapter constraints
   before choosing a framework.
5. Do not reopen Task 4 or weaken ruby, image, navigation, EPUB, or byte-equality
   rules without new generic source-backed evidence.

## Local commands

```sh
env PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome-stable npm run verify:local
env PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome-stable npm run verify:browser-private
```

Playwright-managed Chromium is not required. GitHub Actions and hosted compute
must not be used as a substitute for these local gates.
