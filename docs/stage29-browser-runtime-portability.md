# Stage 29: browser runtime portability and end-to-end conversion

Status: **browser runtime parity implementation specified; not yet accepted**.

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

### Confirmed implementation contract

A native control experiment against the official zlib-ng 2.3.3 source at commit
`12731092979c6d07f42da27da673a9f6c7b13586` established the missing condition:

- `compress2(..., Z_DEFAULT_COMPRESSION)` does **not** match Node on the
  1,440,600-byte PNG scanline fixture even when linked to the same zlib-ng
  version;
- `deflateInit2()` with Node defaults followed by repeated
  `deflate(..., Z_FINISH)` calls using 16 KiB output windows matches Node
  byte-for-byte;
- the matching control covers empty, one-byte, 257-byte, 65,537-byte, and
  1,440,600-byte inputs;
- the large fixture produces 274,150 bytes with SHA-256 prefix
  `358e881dbc7f908e` from Node, the installed compatibility library, and the
  source-built compatibility library.

The 16 KiB window is part of the accepted byte contract. It reproduces Node
v26.7.0's synchronous zlib wrapper call pattern; merely choosing the same zlib
implementation is insufficient.

Implement the browser deflate provider as a small local WebAssembly module
built from the pinned official zlib-ng source. Its C boundary must:

1. initialize zlib with level `Z_DEFAULT_COMPRESSION`, method `Z_DEFLATED`,
   window bits 15, memory level 8, and `Z_DEFAULT_STRATEGY`;
2. expose an output-bound function and one deflate function over caller-owned
   input/output buffers;
3. drive `deflate(..., Z_FINISH)` with at most 16,384 output bytes per call
   until `Z_STREAM_END`;
4. return an explicit non-zero status for initialization, capacity, deflate,
   or teardown failure;
5. reject byte lengths that cannot be represented safely by the exported
   32-bit WebAssembly ABI;
6. keep allocation ownership explicit so every per-call allocation is freed on
   success and failure.

The JavaScript provider must instantiate the committed same-origin WASM asset
once per dedicated conversion worker, validate the required exports, copy
input into WASM memory, copy the exact returned output into a fresh
`Uint8Array`, and release WASM allocations in `finally`. It must fail closed on
load, export, length, allocation, or zlib errors. It must not fall back to
`CompressionStream`, pako, a CDN, or a Node shim.

The repository must contain the wrapper source, the pinned zlib-ng license and
provenance, the generated WASM asset, and a reproducible developer-only build
command pinned to zlib-ng 2.3.3 commit
`12731092979c6d07f42da27da673a9f6c7b13586` and Emscripten 6.0.9. The
developer-only command must verify the zlib-ng checkout commit before building
and write only the committed WASM artifact; it must not silently select another
source or toolchain. Ordinary `npm ci`, browser builds, and tests consume the
committed asset and must not download or compile native code.

Keep the environment-neutral WASM ABI/instance adapter under `src/`, with no
Node import or browser-global dependency. Keep asset URL resolution and fetch
under `web/`, where Vite owns the same-origin `?url` import. Unit tests may read
the committed WASM file with Node and pass its bytes to the same neutral
instance adapter; production code must fetch the Vite-emitted URL and cache one
instantiation promise per worker. This separation keeps Node filesystem access
out of the browser bundle and permits the exact same artifact to be tested in
both environments.

The browser static verifier must confirm that the WASM asset is emitted,
non-empty, same-origin, and that the production bundle contains no
`CompressionStream` fallback or Node import. Runtime readiness must report Web
Crypto SHA-256 plus pinned zlib-ng WASM and must fail before conversion if WASM
loading or its deterministic fixture probe fails. The service worker's existing
same-origin runtime cache must cache the WASM request during the online warm-up
so the accepted offline conversion test continues to pass.

Public tests must compare the browser/WASM provider directly with the unchanged
`node:zlib.deflateSync()` provider for all five control fixtures above. The
1,440,600-byte fixture uses 600 unfiltered RGB rows of 800 pixels, matching the
production PNG raw layout (`600 * (1 + 800 * 3)`). Its full compressed byte
array must match; a decompression-only check, length check, or hash-prefix check
is insufficient. The runtime-neutral PNG test must also retain full PNG byte
identity.

### Required next implementation

1. Keep the accepted Node provider and all Stage 25–28 semantics unchanged.
2. Replace only the browser deflate provider with the pinned zlib-ng 2.3.3 WASM
   implementation and exact 16 KiB Node v26.7.0 call contract above.
3. Add the public/local large-fixture parity test before any private rerun.
4. Rerun the entire public local gate with system Chrome after the runtime
   change.
5. Only after public parity passes, rerun `verify:browser-private` and require
   all 9 PDFs / 5,141 pages / 6,387 unresolved annotations / exact EPUB bytes.
6. Do not alter expected hashes, image extraction, PNG filtering, parser
   semantics, ruby rules, or EPUB equality to make the gate pass.

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
