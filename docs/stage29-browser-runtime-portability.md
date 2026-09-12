# Stage 29: browser runtime portability and end-to-end conversion

Status: **implementation complete enough for local acceptance; not yet accepted**.

GitHub Actions is disabled by project policy. All verification below is local-only. See [local-verification-policy.md](local-verification-policy.md).

## Implemented

- Environment-neutral `BinaryRuntime` seam for SHA-256 and zlib deflate.
- Node provider preserves accepted CLI semantics.
- Browser provider uses Web Crypto SHA-256 and `CompressionStream("deflate")`.
- PDF.js browser resources are prepared from pinned `pdfjs-dist 6.3.289` and served from the application origin: CMaps, standard fonts, WASM, ICC.
- Dedicated conversion worker reaches the shared PDF inspection/document/EPUB core.
- Input PDF and output EPUB buffers are transferred, not uploaded.
- Progress phases are sourced from real conversion boundaries; cancellation is checked at source-safe boundaries.
- UI supports file selection, conversion, cancellation, result Blob URL, save, cleanup, and retry.
- Browser PDF.js image acceleration is pinned to the decoded-data path (`isOffscreenCanvasSupported: false`, `isImageDecoderSupported: false`) so image resources preserve the accepted Node/browser byte-parity contract instead of becoming browser-only `ImageBitmap` resources.
- Public browser acceptance covers:
  - real PDF.js worker/runtime probe;
  - real text PDF → EPUB conversion;
  - Node/browser byte-identical EPUB with fixed metadata;
  - offline conversion after app resources are cached;
  - production image PDF conversion so browser PNG deflate is exercised;
  - same-origin-only runtime requests.
- Private local acceptance harness covers all 9 corpus PDFs, browser/Node byte parity, 5,141-page and 6,387-unresolved baselines, elapsed time, and Linux Chromium RSS sampling. Reports contain only anonymous PDF hash prefixes and aggregate metrics.

## Local commands

The current development environment uses system Chrome rather than a Playwright-managed download:

```sh
env PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome-stable npm run verify:browser
```

Playwright-managed Chromium is not required for this environment. Browser verification must remain local and must not fall back to GitHub Actions or other hosted compute.

Public verification on the current environment:

```sh
env PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome-stable npm run verify:local
```

Private full regression + browser parity on the current environment:

```sh
env PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome-stable npm run verify:local-private
```

When the non-browser private regressions are already accepted and only the Stage 29 browser gate needs to be rerun, use:

```sh
env PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome-stable npm run verify:browser-private
```

The private browser report is written under `local-reports/`, which is gitignored.

## Acceptance gates still open

1. Run public browser verification on the current Stage 29 HEAD with system Chrome.
2. Run the private browser parity harness against the 9 private PDFs and confirm:
   - 9 PDFs;
   - 5,141 pages;
   - 6,387 unresolved annotations preserved;
   - every browser EPUB byte-identical to the Node byte API;
   - no external runtime request;
   - measured timing/RSS recorded for every PDF.
3. Inspect any failure instead of weakening expectations.
4. Manual Thorium/calibre validation remains a separate unperformed reader gate.

Do not claim browser corpus parity, a supported maximum file size, or Stage 29 acceptance until the private local run passes.
