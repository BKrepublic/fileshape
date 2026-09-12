# Stage 28: browser/PWA foundation

Status: accepted and merged in PR #21.

Accepted merge commit:

```text
b5100164d95d623c7c8631e6ff265686f10320a3
```

GitHub Actions PR CI run #143 and the merge commit `main` push CI run #144 both completed successfully.

## Purpose

Stage 28 starts the browser-first path selected after the accepted Stage 27 runtime boundary. It creates a small, installable, offline-capable PWA shell and proves the pinned PDF.js browser build with a real module worker. It also fixes the browser conversion message contract before the remaining shared-core blockers are replaced.

This checkpoint does **not** claim that browser conversion is available. The accepted conversion graph still reaches `node:crypto` and `node:zlib`, and the browser PDF.js CMap/font/WASM resource package has not yet been accepted against the private corpus. The UI exposes that state plainly and keeps its conversion action disabled. No PDF bytes are uploaded or sent to a backend.

## Accepted baseline

- Stage 25 CLI acceptance, Stage 26 byte ownership, and Stage 27 module boundaries remain accepted.
- Stages 13 and 15-24 remain closed. Do not change PDF interpretation, ruby promotion, image/cover policy, EPUB serialization, or CLI behavior.
- Manual Thorium and calibre validation remains pending.
- Browser/PWA is the first delivery target. Android work remains deferred until the browser path has an end-to-end conversion result.

## Evidence and selected approach

- PDF.js documents a modern browser display build and a separate `pdf.worker.mjs`. Its API accepts `Uint8Array` data, may transfer ownership of that data to its worker, exposes `PDFWorker.port`, and provides `destroy()` cleanup. Stage 28 uses those public surfaces and a defensive fixture copy.
- Browser `ArrayBuffer` ownership can be transferred through `postMessage`. The future conversion contract therefore transfers one owned buffer into a dedicated conversion worker rather than cloning large PDFs repeatedly.
- A web app manifest describes the installed app, while a service worker and Cache Storage provide the offline shell. The service worker is optional at runtime: inability to register it is diagnosed without breaking local file selection.
- Vite is used as a development/build dependency for a framework-free TypeScript app. Its production build is a static `dist/browser` directory. Hosting and GitHub Pages deployment remain outside this checkpoint.
- Material Design 3 is a visual and interaction reference, implemented with local CSS design tokens and semantic HTML. No component framework or network font dependency was added.

Primary references:

- <https://m3.material.io/>
- <https://mozilla.github.io/pdf.js/getting_started/>
- <https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html>
- <https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects>
- <https://web.dev/learn/pwa/web-app-manifest>
- <https://web.dev/learn/pwa/service-workers>
- <https://vite.dev/guide/build>

## Scope and repository layout

A framework-free app lives under `web/`, while browser-only code stays out of the accepted Node adapters.

```text
web/
  index.html
  main.ts
  styles.css
  pdfjs-runtime-probe.ts
  public/service-worker.js
  public/app.webmanifest
  public/icons/fileshape-192.png
  public/icons/fileshape-512.png
src/
  browser-conversion-contract.ts
test/
  browser-conversion-contract.test.ts
browser-test/
  stage28-browser-pwa-foundation.spec.ts
playwright.config.ts
vite.config.ts
tsconfig.browser.json
```

The icon PNGs are deterministic repository assets with the declared dimensions. No external font or image request is required.

Scripts:

```text
dev:browser       # Vite development server
build:browser     # browser typecheck followed by Vite production build
preview:browser   # local preview of dist/browser only
verify:browser    # build, deterministic static verifier, and Playwright Chromium test
```

`npm test` continues to run the existing Node typecheck and all unit tests. CI installs the pinned Playwright Chromium binary and runs `npm run verify:browser`, so neither the bundle nor the real-browser path can silently rot.

## Browser conversion contract

`src/browser-conversion-contract.ts` is environment-neutral and does not import DOM, Worker, Node, PDF.js, or FileShape implementation modules. It defines discriminated message types for one request at a time.

The `start.options` object is an explicitly serializable mirror of the accepted public CLI surface. Every field is optional: `title`, `creator`, `language`, `identifier`, `modified`, and `titlePrefix` are strings; `rubyMode` is `"on" | "off"`; `unresolvedRubyPolicy` is `"error" | "preserve-as-page-note"`; `pageProgressionDirection` is `"ltr" | "rtl"`; and `coverOccurrence` contains safe integers `sourcePage >= 1`, `operatorIndex >= 0`, and `occurrenceIndex >= 0`. Unknown keys, invalid enum values, invalid timestamps, empty values where the production serializer rejects them, and unsafe cover integers are rejected. This mirror is tested against the exported `PdfToEpubOptions` assignment shape so drift is a compile failure.

Request IDs match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. A source name uses 1-255 UTF-16 code units and must not contain `/`, `\\`, or NUL; this preserves the accepted core rule while imposing a bounded browser-message label. The start buffer must be a non-empty `ArrayBuffer`.

Messages are:

- main to worker: `start` with `requestId`, `sourceName`, owned `ArrayBuffer`, and the accepted conversion option values; `cancel` with the same `requestId`;
- worker to main: `accepted`; `progress` with a named phase, completed units, and optional total units; `succeeded` with EPUB `ArrayBuffer`, output name, byte length, page count, and unresolved annotation count; `cancelled`; `failed` with a stable diagnostic code and user-safe message;
- phases: `loading-pdf`, `inspecting-pages`, `building-document`, `serializing-epub`;
- diagnostics for this checkpoint: `unsupported-runtime`, `invalid-request`, `request-id-reused`, `worker-busy`, `conversion-unavailable`, and `unexpected-worker-failure`.

One worker instance owns zero or one active request and is single-use after that request terminates. Its exact state transitions are:

1. `start` in idle validates the complete command, transfers ownership of the attached buffer, records the ID permanently, and emits exactly one `accepted` before progress or terminal events.
2. A second `start` while active emits `failed/worker-busy` for the incoming ID and does not alter the active request. Reusing any recorded ID emits `failed/request-id-reused`.
3. A matching `cancel` while active moves the request to cancelling. After that command is processed, no new progress or success event is valid; cleanup ends with exactly one `cancelled` event. A cancel with no matching active request is ignored, so it cannot manufacture a second terminal event.
4. `succeeded`, `cancelled`, and `failed` are terminal. The main-thread owner ignores later events, revokes result URLs if any, and terminates the worker. A new conversion requires a new worker instance.

The contract rejects non-integer, negative, or regressing progress, a changed known total, `completed > total`, events before `accepted`, and terminal events followed by further events. It preserves “total unknown” instead of inventing a percentage. Unit tests cover interleaved request IDs and the cancel/success ordering rule. ArrayBuffer transfer and termination semantics are documented, but Stage 28 does not implement a fake conversion worker or mark cancellation/download as operational.

## Real PDF.js browser probe

`web/pdfjs-runtime-probe.ts` uses `pdfjs-dist/build/pdf.mjs` and imports `pdfjs-dist/build/pdf.worker.mjs?url`, so Vite emits and rewrites the worker asset under the configured application base. `GlobalWorkerOptions.workerSrc` points to that imported URL and the resolved URL is rejected unless it has the current page origin.

The probe:

1. creates a public `PDFWorker`, awaits it, and requires a real `Worker` port rather than accepting PDF.js fake-worker fallback;
2. loads a deterministic embedded one-page PDF fixture from a fresh `Uint8Array`;
3. verifies page count and expected text from the display API;
4. destroys the PDF loading task/document and PDF worker in `finally` paths;
5. returns structured, user-safe diagnostics without exposing stack traces in the page.

The probe proves the modern PDF.js browser/worker bundle only. It does not import `pdf-inspector-core.ts` or `pdf-to-epub-core.ts`, and it is not CLI/browser output parity. CMap, standard-font, WASM, SHA-256, and PNG deflate portability remain explicit blockers for the next checkpoint.

## PWA and local-data behavior

- Vite uses `root: "web"`, `base: "./"`, `publicDir: "public"`, and `build.outDir: "../dist/browser"`. The built HTML, manifest, worker URL, and service-worker registration work when the directory is mounted below an arbitrary origin path.
- `app.webmanifest` contains stable `id: "./"`, `name`, `short_name`, `start_url: "."`, `scope: "."`, `display: "standalone"`, background/theme colors, and 192/512 icons.
- The application base is built as `new URL(import.meta.env.BASE_URL, location.href)`. The service worker is registered under the deployed application root only.
- Cache handling is same-origin GET app resources only. User-selected PDF bytes are not cached, persisted, logged, uploaded, or fetched.
- The production build remains usable at a relative base path. The service worker deletes its own obsolete versioned caches and provides an app-shell navigation fallback after one successful online load.
- The static HTML CSP is `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`.
- No analytics, telemetry, CDN, backend endpoint, or external font/image request was added.

## Mobile-first shell

The first useful viewport is 360 CSS pixels wide. The shell is single-column through 599 px and widens the same flow on desktop. It contains the FileShape app bar/local-processing indicator, PDF selection, selected-file metadata, collapsed advanced settings, runtime/PWA status, and a disabled “EPUBに変換” primary action with a reason.

Controls use semantic labels, 48 px minimum interactive boxes, visible focus, reduced-motion handling, light/dark system schemes, and local CSS design tokens. The UI never says conversion is ready merely because the PDF.js probe passed.

## Verification and acceptance

Accepted automated verification on PR head `dfacd55017011f95a7f3c6edddb541c4b87d8185` and merge commit `b5100164d95d623c7c8631e6ff265686f10320a3`:

```text
npm test                         PASS (212/212)
npm run verify:runtime-deps      PASS
npm run verify:browser           PASS
npm run verify:epubcheck         PASS (5/5)
git diff --check                 PASS
```

`verify:browser` includes the production browser typecheck and Vite build, deterministic static PWA verifier, real PDF.js module worker in pinned Playwright Chromium, one-page text extraction fixture, no console/page errors, service-worker activation, online-then-offline app-shell reload, and network assertions that the selected fixture is not uploaded and no non-local runtime request is made.

GitHub Actions evidence:

```text
PR CI:   run #143  success
main CI: run #144  success
```

Private `local-samples/` are not required for Stage 28 because this checkpoint does not invoke the FileShape conversion core or claim corpus parity.

## Out of scope and next checkpoint

- Browser EPUB conversion, result download, and operational cancellation/progress.
- Replacing the accepted Node SHA-256 or PNG zlib implementation.
- Packaging PDF.js CMaps, standard fonts, ICC, or WASM for corpus conversion.
- Maximum-file-size claims, performance claims, or private-corpus parity.
- Hosting, GitHub Pages publication, install-prompt promotion, Android packaging, TWA, WebView, or store submission.
- Manual Thorium/calibre acceptance.

Stage 29 must use the accepted Stage 28 real-browser evidence to replace or inject SHA-256 and PNG deflate without changing CLI semantics, package the required PDF.js resources, and connect one public-fixture conversion through the dedicated worker contract. Private-corpus verification becomes mandatory before CLI/browser parity or supported input limits are accepted.
