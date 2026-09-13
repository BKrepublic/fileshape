# Stage 29: browser runtime portability and end-to-end conversion

Status: **accepted on the Stage 29 implementation checkpoint**.

Current Codex/session handoff: [stage29-codex-handoff.md](stage29-codex-handoff.md).

GitHub Actions is disabled by project policy. All verification below is local-only. See [local-verification-policy.md](local-verification-policy.md).

## Implemented

- Environment-neutral `BinaryRuntime` seam for SHA-256 and zlib deflate.
- Node provider preserves accepted CLI semantics.
- Browser provider uses Web Crypto SHA-256 and the pinned local zlib-ng 2.3.3
  WebAssembly artifact.
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

## Resolved blocker: zlib-ng byte parity

The first private-corpus browser run reached successful conversion but failed exact EPUB byte parity on the first PDF (`sha256:82954140592708dd`). Entry-level diagnosis isolated the first difference to `OEBPS/package.opf`, and image-level diagnosis showed the single generated PNG had identical dimensions, color metadata, and inflated PNG scanline bytes on Node and browser. Only the compressed zlib/IDAT bytes differed:

- Node PNG: 151,039 bytes
- browser PNG: 151,370 bytes
- inflated bytes: 1,440,600 on both sides
- inflated SHA-256 prefix: `4c1e9c26235804c0` on both sides
- `inflatedByteIdentical: true`

At that checkpoint, PDF.js decoding, pixels, PNG filtering, document semantics,
and EPUB ZIP serialization were ruled out. The failure was isolated to
deterministic zlib byte output and was later resolved by the accepted provider
below.

The accepted Node baseline environment was then identified exactly:

- Node: `v26.7.0`
- `process.versions.zlib`: `1.3.1.zlib-ng`
- `/usr/lib/libz.so.1` owner: `zlib-ng-compat 2.3.3-2`
- installed compatibility package: `zlib-ng-compat 2.3.3-2`
- `ldd $(command -v node)` resolves `libz.so.1` to `/usr/lib/libz.so.1`

This proves the accepted Node PNG bytes are produced through zlib-ng compatibility mode, not canonical upstream zlib and not Chromium `CompressionStream`.

A pako 3.0.1 experiment was attempted with both Node-compatible and legacy/stock-zlib hash paths. Both failed the accepted Node byte-parity unit tests, including the production PNG identity test. That experiment has been reverted completely. Do not reintroduce pako or weaken byte equality.

The temporary `CompressionStream` baseline was replaced by the reviewed
zlib-ng WASM provider. There is no pako or `CompressionStream` fallback.

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
built from the pinned official zlib-ng source. The required application-facing
raw WASM exports are `memory`, `malloc`, `free`, `fileshape_zlib_bound`, and
`fileshape_zlib_deflate`; the adapter ignores Emscripten bookkeeping exports
that are not callable through this contract. The C ABI is:

```c
uint32_t fileshape_zlib_bound(uint32_t source_length);
int32_t fileshape_zlib_deflate(
    const uint8_t *source,
    uint32_t source_length,
    uint8_t *destination,
    uint32_t destination_capacity,
    uint32_t *destination_length);
```

Pointers and all lengths are WebAssembly `i32` values interpreted as unsigned
32-bit integers. `fileshape_zlib_bound` returns `compressBound(source_length)`
when representable as a non-zero `uint32_t`, otherwise zero. The deflate status
values are fixed as follows:

- `0`: success;
- `1`: invalid pointer or length combination;
- `2`: destination capacity is insufficient;
- `3`: `deflateInit2` failed;
- `4`: `deflate` returned neither `Z_OK` nor `Z_STREAM_END`;
- `5`: `deflateEnd` failed after otherwise successful compression.

The function writes zero to `destination_length` before compression whenever
that pointer is valid and writes the exact byte count only on status zero. If
compression fails, it still calls `deflateEnd` after a successful init and
returns the earlier compression status. The C boundary must:

1. initialize zlib with level `Z_DEFAULT_COMPRESSION`, method `Z_DEFLATED`,
   window bits 15, memory level 8, and `Z_DEFAULT_STRATEGY`;
2. expose an output-bound function and one deflate function over caller-owned
   input/output buffers;
3. drive `deflate(..., Z_FINISH)` with at most 16,384 output bytes per call
   until `Z_STREAM_END`;
4. return the fixed status above for argument, capacity, initialization,
   deflate, or teardown failure;
5. rely only on caller-provided lengths already validated as unsigned 32-bit
   integers, and reject pointer arithmetic or bounds that overflow `uint32_t`;
6. keep allocation ownership explicit so every per-call allocation is freed on
   success and failure.

The JavaScript provider must instantiate the committed same-origin WASM asset
once per dedicated conversion worker, validate the required exports, copy
input into WASM memory, copy the exact returned output into a fresh
`Uint8Array`, and release WASM allocations in `finally`. It must fail closed on
load, export, length, allocation, or zlib errors. It must not fall back to
`CompressionStream`, pako, a CDN, or a Node shim.

The cached promise owns one non-threaded WASM instance. Concurrent callers may
await the same promise. After that await, allocation, the exported deflate call,
output copying, and cleanup form one synchronous run-to-completion section with
no intervening `await`; JavaScript task semantics therefore serialize access to
the shared memory. The C wrapper creates and ends a new stack-local `z_stream`
for every call and retains no compression state. Threads and shared WASM memory
must remain disabled. A later implementation that introduces an asynchronous
step inside that section or shared native state must add explicit serialization
before it can be accepted.

Use these repository paths:

- `vendor/zlib-ng/fileshape-zlib-wrapper.c`: the reviewed ABI wrapper;
- `vendor/zlib-ng/build-wasm.sh`: the developer-only build command;
- `vendor/zlib-ng/LICENSE`: the upstream license;
- `vendor/zlib-ng/README.md`: source, toolchain, flags, and artifact provenance;
- `web/vendor/fileshape-zlib-ng-2.3.3.wasm`: the committed runtime asset.

The build inputs are pinned to zlib-ng 2.3.3 commit
`12731092979c6d07f42da27da673a9f6c7b13586`, the official emsdk 6.0.9 tag at
commit `5eb0bde7585670252e8ba05e9d361627bffd08b5`, and the corresponding
Emscripten 6.0.9 source tag at commit
`4e4223852a0835923411059a3929907d7df1232e`. The build script accepts explicit
zlib-ng and emsdk checkout paths, verifies both Git commits, activates only that
emsdk toolchain, and rejects any `emcc` version other than 6.0.9.

Configure zlib-ng through `emcmake cmake` with these fixed cache values:

```text
ZLIB_COMPAT=ON
BUILD_SHARED_LIBS=OFF
BUILD_TESTING=OFF
WITH_GTEST=OFF
WITH_OPTIM=OFF
WITH_NATIVE_INSTRUCTIONS=OFF
WITH_RUNTIME_CPU_DETECTION=OFF
WITH_NEW_STRATEGIES=ON
WITH_REDUCED_MEM=OFF
CMAKE_BUILD_TYPE=Release
```

Link the wrapper and static compatibility library with these fixed Emscripten
settings: `-O3`, `--no-entry`, `-sSTANDALONE_WASM=1`,
`-sALLOW_MEMORY_GROWTH=1`, `-sFILESYSTEM=0`, `-sMALLOC=emmalloc`,
`-sASSERTIONS=0`, `-sERROR_ON_UNDEFINED_SYMBOLS=1`, and an
`EXPORTED_FUNCTIONS` list containing only `_malloc`, `_free`,
`_fileshape_zlib_bound`, and `_fileshape_zlib_deflate`. Do not enable pthreads,
shared memory, SIMD, native instructions, or runtime CPU dispatch.

The provenance README records the full SHA-256 of the wrapper source and
generated WASM after implementation. `npm test` must recompute both hashes,
reject drift, instantiate the artifact, validate the exact export set needed by
the adapter, and run the byte-parity fixtures. Rebuilding with the pinned inputs
must reproduce the recorded WASM hash; the build command exits non-zero on a
hash mismatch when an accepted hash is already recorded. The build writes only
the committed WASM artifact and must not silently select another source,
toolchain, configuration, or output path. Ordinary `npm ci`, browser builds,
and tests consume the committed asset and must not download or compile native
code.

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

### Implemented resolution

1. The accepted Node provider and all Stage 25–28 semantics remain unchanged.
2. Only the browser deflate provider was replaced with pinned zlib-ng 2.3.3
   WASM using the exact 16 KiB Node v26.7.0 call contract above.
3. The public/local suite now includes the large-fixture parity test.
4. The entire public local gate passed with system Chrome after the runtime and
   PDF.js application-base fixes.
5. `verify:browser-private` then passed all 9 PDFs / 5,141 pages / 6,387
   unresolved annotations / exact EPUB bytes.
6. Expected hashes, image extraction, PNG filtering, parser semantics, ruby
   rules, and EPUB equality were not weakened.

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

## Accepted result

Stage 29 implementation head `2e68168f17f44f4b11396c341028df5217fb79db`
passes the public local gate with system Chrome:

```text
npm test                         PASS (217/217)
npm run verify:runtime-deps      PASS
npm run verify:browser           PASS (2/2)
npm run verify:epubcheck         PASS (5/5)
git diff --check                 PASS
WASM reproducible rebuild        PASS
WASM bytes                       44,801
WASM SHA-256                     90bc26f8c73322492510a9438e04d41c5ab7badcf76d0ae1e70d1aae4d9176f1
```

The private local browser gate on the same implementation passes:

```text
PRIVATE_BROWSER_ACCEPTANCE=PASS
PRIVATE_BROWSER_PDFS=9
PRIVATE_BROWSER_PAGES=5141
PRIVATE_BROWSER_UNRESOLVED=6387
PRIVATE_BROWSER_BYTE_IDENTICAL=yes
elapsed=2.9m
```

Every PDF used the dedicated browser conversion worker, same-origin PDF.js and
WASM resources, and the accepted Node byte API as the equality baseline. The
run recorded per-PDF elapsed time and Linux Chromium RSS in the gitignored local
report. The report and private inputs/outputs were not committed.

The private run also exposed and fixed a worker-relative resource bug: a worker
emitted below `assets/` had resolved PDF.js resources below `assets/pdfjs/`
instead of the application-level `pdfjs/` directory. Resource configuration now
receives the application base explicitly, public tests reject
`/assets/pdfjs/`, and all nine PDFs pass after the fix.

Stage 29 proves browser corpus byte parity for this accepted corpus. It does not
establish a general maximum input size. A supported-size claim still requires a
separate policy based on the recorded timing/RSS evidence and target-device
measurements. Manual Thorium/calibre validation also remains a separate
unperformed reader gate.
