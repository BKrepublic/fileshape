# Stage 29: browser runtime portability and end-to-end conversion

Status: **implementation complete enough for local acceptance; not yet accepted**.

Current Codex/session handoff: [stage29-codex-handoff.md](stage29-codex-handoff.md).

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

## Confirmed blocker: zlib-ng byte parity

The first private-corpus browser run reaches successful conversion but fails exact EPUB byte parity on the first PDF (`sha256:82954140592708dd`). Entry-level diagnosis isolates the first difference to `OEBPS/package.opf`, and image-level diagnosis shows the single generated PNG has identical dimensions, color metadata, and inflated PNG scanline bytes on Node and browser. Only the compressed zlib/IDAT bytes differ:

- Node PNG: 151,039 bytes
- browser PNG: 151,370 bytes
- inflated bytes: 1,440,600 on both sides
- inflated SHA-256 prefix: `4c1e9c26235804c0` on both sides
- `inflatedByteIdentical: true`

Therefore PDF.js decoding, pixels, PNG filtering, document semantics, and EPUB ZIP serialization are not the cause of this failure. The remaining blocker is deterministic zlib byte output.

The accepted Node baseline environment was then identified exactly:

- Node: `v26.7.0`
- `process.versions.zlib`: `1.3.1.zlib-ng`
- `/usr/lib/libz.so.1` owner: `zlib-ng-compat 2.3.3-2`
- installed compatibility package: `zlib-ng-compat 2.3.3-2`
- `ldd $(command -v node)` resolves `libz.so.1` to `/usr/lib/libz.so.1`

This proves the accepted Node PNG bytes are produced through zlib-ng compatibility mode, not canonical upstream zlib and not Chromium `CompressionStream`.

A pako 3.0.1 experiment was attempted with both Node-compatible and legacy/stock-zlib hash paths. Both failed the accepted Node byte-parity unit tests, including the production PNG identity test. That experiment has been reverted completely. Do not reintroduce pako or weaken byte equality.

The branch is intentionally restored to the last public-browser-passing `CompressionStream` implementation while the private zlib-ng parity blocker remains open. This is a known limitation, not an acceptance claim.

### Required next implementation

1. Keep the accepted Node provider and all Stage 25–28 semantics unchanged.
2. Replace only the browser deflate provider with an implementation that reproduces the accepted zlib-ng compatibility output byte-for-byte. A browser-local zlib-ng/WASM implementation is the leading path because the Node baseline itself is zlib-ng-backed.
3. Before rerunning the private corpus, add a public/local parity test using large PNG-like scanline input that proves the browser provider matches `node:zlib.deflateSync()` on the current accepted environment. Small fixtures are insufficient because both `CompressionStream` and pako matched some trivial inputs while diverging on production-sized image data.
4. Rerun the public browser gate after any production runtime change.
5. Only after public parity passes, rerun `verify:browser-private` and require all 9 PDFs / 5,141 pages / 6,387 unresolved annotations / exact EPUB bytes.
6. Do not alter expected hashes, image extraction, PNG filtering, parser semantics, ruby rules, or EPUB equality to make the gate pass.

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

1. Implement browser zlib-ng-compatible deterministic deflate without changing the accepted Node provider.
2. Run public browser verification on the resulting Stage 29 HEAD with system Chrome.
3. Run the private browser parity harness against the 9 private PDFs and confirm:
   - 9 PDFs;
   - 5,141 pages;
   - 6,387 unresolved annotations preserved;
   - every browser EPUB byte-identical to the Node byte API;
   - no external runtime request;
   - measured timing/RSS recorded for every PDF.
4. Inspect any failure instead of weakening expectations.
5. Manual Thorium/calibre validation remains a separate unperformed reader gate.

Do not claim browser corpus parity, a supported maximum file size, or Stage 29 acceptance until the private local run passes.
