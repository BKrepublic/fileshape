# Stage 29 Codex handoff

This file is the current handoff for continuing Stage 29 browser runtime portability work.

## Repository state

- Repository: `BKrepublic/fileshape`
- Branch: `stage29-browser-runtime-portability`
- PR: #22, still Draft
- Local worktree used by the user: `/data/experiment/fileshape`
- GitHub Actions are prohibited. Do not add, restore, run, rerun, or use Actions/workflow status as acceptance evidence.
- Private corpus files and local reports must never be committed or uploaded.

## Accepted baselines before this blocker

Earlier stages are accepted: Stage 25 CLI, Stage 26 byte API, Stage 27 runtime boundary, Stage 28 browser/PWA foundation.

Accepted private Node corpus baseline:

- 9 PDFs
- 5,141 pages
- 6,387 unresolved annotations
- EPUBCheck 5.3.0: 9/9, 0 errors, 0 warnings
- outline 250/250
- image occurrences 4/4
- unique PNG 1
- total EPUB bytes 17,959,256

Do not change Node semantics or weaken any verifier/expected value to make browser parity pass.

## Stage 29 target

Browser/PWA conversion must remain local-only and execute in the dedicated browser Worker with real PDF.js worker/resources. For the same PDF/options/metadata, browser EPUB bytes must be exactly identical to the accepted Node byte API.

System Chrome is used locally:

```sh
env PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome-stable ...
```

Do not require a Playwright-managed Chromium download.

## Important browser PDF.js fix already accepted

Browser PDF.js must keep these options:

```ts
isOffscreenCanvasSupported: false,
isImageDecoderSupported: false,
```

Without them PDF.js returns bitmap-only image objects in the browser and image extraction fails. Public browser acceptance passed after this fix.

Do not replace this with a canvas/ImageBitmap fallback unless new evidence proves it necessary.

## Private browser failure and diagnosis

The first private PDF is identified only as:

`sha256:82954140592708dd`

Node result for that PDF:

- pages: 1,377
- unresolved annotations: 639
- EPUB bytes: 4,102,626

The first browser parity failure was isolated to `OEBPS/package.opf`, where the image resource content hash differed.

The EPUB uses deterministic stored ZIP entries, so the image was extracted from Node/browser EPUBs and compared safely without exposing private content.

Image diagnostic for the single 800x600 RGB PNG:

- Node PNG bytes: 151,039
- Browser PNG bytes: 151,370
- Node/browser inflated IDAT bytes: 1,440,600
- inflated SHA-256 on both sides: `4c1e9c26235804c0`
- `inflatedByteIdentical: true`

Therefore PDF.js decoded pixels, PNG dimensions, color type, filters, and uncompressed PNG scanline bytes match. The remaining mismatch is only the zlib-compressed IDAT bitstream.

## Root cause now confirmed

The user's accepted Node environment is:

```text
NODE=v26.7.0
NODE_REPORTED_ZLIB=1.3.1.zlib-ng
LIBZ_OWNER=/usr/lib/libz.so.1 is owned by zlib-ng-compat 2.3.3-2
INSTALLED_ZLIB_PACKAGES=zlib-ng-compat 2.3.3-2
NODE_LINKED_LIBZ=libz.so.1 => /usr/lib/libz.so.1
```

So `node:zlib.deflateSync()` in the accepted Node baseline is backed by `zlib-ng-compat`, not classic stock zlib and not simply Node's bundled patched zlib behavior.

This explains why browser `CompressionStream("deflate")` and pako did not reproduce the private Node PNG bytes.

## Failed experiment that must not be repeated

Pako 3.0.1 was tested as a browser replacement.

- `legacyHash: false` did not match accepted Node bytes.
- `legacyHash: true` also did not match accepted Node bytes.
- Unit parity failed in `test/binary-runtime.test.ts` for large/image-like input, and PNG identity failed as a consequence.

The pako experiment has been reverted from the branch. `package.json` and committed `package-lock.json` contain no pako dependency.

Do not retry pako by merely toggling `legacyHash`.

## Current branch implementation after cleanup

The branch has been restored to the last public-browser-compatible browser binary provider:

- Web Crypto for SHA-256
- `CompressionStream("deflate")` for browser deflate

This restoration is intentional as a clean baseline. It is not the final Stage 29 solution because private zlib-ng byte parity still fails.

`CompressionStream` is known to produce semantically correct PNG data but different compressed bytes for the private image above.

## Next engineering task

Implement a browser-side zlib provider that reproduces the accepted Node `zlib-ng-compat` deflate bitstream exactly, while preserving Node output unchanged.

Recommended sequence:

1. Do not touch `src/binary-runtime-node.ts` or accepted Node PNG/EPUB semantics.
2. Investigate a browser-capable zlib-ng implementation, likely WebAssembly compiled from the matching zlib-ng line/version or another implementation proven byte-identical to the user's `node:zlib` output.
3. Before integrating it into PDF conversion, add a focused parity test comparing browser-provider deflate against `nodeBinaryRuntime.deflateZlib()` on:
   - empty bytes;
   - tiny bytes;
   - 257 bytes;
   - 65,537 bytes;
   - a large 800x600 PNG-like filtered byte fixture.
4. Require exact `Uint8Array` equality, not just successful inflate or equal decompressed bytes.
5. Once focused/unit parity passes, run public browser acceptance with system Chrome.
6. Only after public browser passes, run `verify:browser-private` against the 9 local private PDFs.
7. Preserve the private acceptance requirements: 9 PDFs, 5,141 pages, 6,387 unresolved annotations, exact browser/Node EPUB bytes, same-origin-only runtime requests, no console/page errors, timing/RSS recorded.
8. If production source changes, rerun the public browser gate before claiming private acceptance.

There is public precedent for compiling zlib-family code to browser WASM. A zlib-ng WASM path is therefore technically plausible, but its output must be proven against this exact Node environment before adoption. Do not assume version-name compatibility implies byte compatibility.

## Relevant files

- `src/binary-runtime.ts`
- `src/binary-runtime-node.ts`
- `src/binary-runtime-web.ts`
- `src/pdf-image-resource-core.ts`
- `src/pdf-inspector-core.ts`
- `web/pdfjs-resource-config.ts`
- `web/conversion-worker.ts`
- `web/binary-runtime-probe.ts`
- `test/binary-runtime.test.ts`
- `browser-private-test/stage29-private-corpus.spec.ts`
- `src/verify-browser.ts`
- `docs/stage29-browser-runtime-portability.md`
- `docs/local-verification-policy.md`

## Private harness notes

`browser-private-test/stage29-private-corpus.spec.ts` already contains safe stored-ZIP/image diagnostics. It reports hashes, byte lengths, entry paths and first differing offsets without printing private document/image contents.

The harness also avoids re-closing the advanced settings `<details>` element between books.

Do not remove the useful diagnostics until Stage 29 is accepted.

## Final acceptance reminder

Stage 29 is not accepted yet.

The open blocker is specifically: browser zlib output must match the accepted zlib-ng-backed Node output byte-for-byte for production PNGs.

Manual Thorium/calibre validation remains a separate later gate and must not be claimed as completed.
