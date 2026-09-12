# Stage 28: browser/PWA foundation

Status: proposed for Sol-Luna review

## Purpose

Stage 28 starts the browser-first path selected after the accepted Stage 27 runtime boundary. It creates a small, installable, offline-capable PWA shell and proves the pinned PDF.js browser build with a real module worker. It also fixes the browser conversion message contract before the remaining shared-core blockers are replaced.

This checkpoint does **not** claim that browser conversion is available. The accepted conversion graph still reaches `node:crypto` and `node:zlib`, and the browser PDF.js CMap/font/WASM resource package has not yet been accepted against the private corpus. The UI must expose that state plainly and keep its conversion action disabled. No PDF bytes may be uploaded or sent to a backend.

## Accepted baseline

- Start from `main` at `641284fd21d9f9af3f52c1b99304225b28070d19` or later.
- Stage 25 CLI acceptance, Stage 26 byte ownership, and Stage 27 module boundaries remain accepted.
- Stages 13 and 15-24 remain closed. Do not change PDF interpretation, ruby promotion, image/cover policy, EPUB serialization, or CLI behavior.
- Manual Thorium and calibre validation remains pending.
- Browser/PWA is the first delivery target. Android work remains deferred until the browser path has an end-to-end conversion result.

## Evidence and selected approach

- PDF.js documents a modern browser display build and a separate `pdf.worker.mjs`. Its API accepts `Uint8Array` data, may transfer ownership of that data to its worker, exposes `PDFWorker.port`, and provides `destroy()` cleanup. Stage 28 uses those public surfaces and a defensive fixture copy.
- Browser `ArrayBuffer` ownership can be transferred through `postMessage`. The future conversion contract therefore transfers one owned buffer into a dedicated conversion worker rather than cloning large PDFs repeatedly.
- A web app manifest describes the installed app, while a service worker and Cache Storage provide the offline shell. The service worker is optional at runtime: inability to register it must be diagnosed without breaking local file selection.
- Vite is selected as a development/build dependency for a framework-free TypeScript app. Its production build is a static `dist/browser` directory. Hosting and GitHub Pages deployment remain outside this checkpoint.
- Material Design 3 is a visual and interaction reference, implemented with local CSS design tokens and semantic HTML. Do not add a component framework or network font dependency for this shell.

Primary references:

- <https://m3.material.io/>
- <https://mozilla.github.io/pdf.js/getting_started/>
- <https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html>
- <https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects>
- <https://web.dev/learn/pwa/web-app-manifest>
- <https://web.dev/learn/pwa/service-workers>
- <https://vite.dev/guide/build>

## Scope and repository layout

Add a framework-free app under `web/` and keep browser-only code out of the accepted Node adapters.

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
  stage28-browser-pwa-foundation.test.ts
browser-test/
  stage28-browser-pwa-foundation.spec.ts
playwright.config.ts
vite.config.ts
tsconfig.browser.json
```

The icon PNGs must be deterministic repository assets with the declared dimensions. Keep their source shape simple and legible at small sizes; no external font or image request is allowed.

Add scripts with these responsibilities:

```text
dev:browser       # Vite development server
build:browser     # browser typecheck followed by Vite production build
preview:browser   # local preview of dist/browser only
verify:browser    # build plus deterministic static PWA/bundle verifier
```

`npm test` must continue to run the existing Node typecheck and all unit tests. `verify:browser` must run the static verifier and Playwright Chromium test against the production preview. Add Vite and Playwright as pinned development dependencies. CI must install the pinned Playwright Chromium binary and run `npm run verify:browser` after `npm test`, so neither the bundle nor the real-browser path can silently rot.

## Browser conversion contract

`src/browser-conversion-contract.ts` is environment-neutral and must not import DOM, Worker, Node, PDF.js, or FileShape implementation modules. Define discriminated message types for one request at a time.

The `start.options` object is an explicitly serializable mirror of the accepted public CLI surface. Every field is optional: `title`, `creator`, `language`, `identifier`, `modified`, and `titlePrefix` are strings; `rubyMode` is `"on" | "off"`; `unresolvedRubyPolicy` is `"error" | "preserve-as-page-note"`; `pageProgressionDirection` is `"ltr" | "rtl"`; and `coverOccurrence` contains safe integers `sourcePage >= 1`, `operatorIndex >= 0`, and `occurrenceIndex >= 0`. Unknown keys, invalid enum values, invalid timestamps, empty values where the production serializer rejects them, and unsafe cover integers must be rejected. This mirror is tested against the exported `PdfToEpubOptions` assignment shape so drift is a compile failure.

Request IDs must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. A source name must use 1-255 UTF-16 code units and must not contain `/`, `\\`, or NUL; this preserves the accepted core rule while imposing a bounded browser-message label. The start buffer must be a non-empty `ArrayBuffer`.

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

The contract must reject non-integer, negative, or regressing progress, a changed known total, `completed > total`, events before `accepted`, and terminal events followed by further events. It must preserve “total unknown” instead of inventing a percentage. Unit tests must cover interleaved request IDs and the cancel/success ordering rule. ArrayBuffer transfer and termination semantics must be documented, but Stage 28 must not implement a fake conversion worker or mark cancellation/download as operational.

## Real PDF.js browser probe

`web/pdfjs-runtime-probe.ts` must use `pdfjs-dist/build/pdf.mjs` and import `pdfjs-dist/build/pdf.worker.mjs?url` so Vite emits and rewrites the worker asset under the configured application base. Set `GlobalWorkerOptions.workerSrc` to that imported URL, resolve it against `location.href`, and reject it unless the result has the current page origin. It must:

1. create a public `PDFWorker`, await it, and require a real `Worker` port rather than accepting PDF.js fake-worker fallback;
2. load a deterministic embedded one-page PDF fixture from a fresh `Uint8Array`;
3. verify page count and expected text from the display API;
4. destroy the PDF loading task/document and PDF worker in `finally` paths;
5. return structured, user-safe diagnostics without exposing stack traces in the page.

The probe proves the modern PDF.js browser/worker bundle only. It must not import `pdf-inspector-core.ts` or `pdf-to-epub-core.ts`, and it must not be described as CLI/browser output parity. CMap, standard-font, WASM, SHA-256, and PNG deflate portability remain explicit blockers for the next checkpoint.

## PWA and local-data behavior

- Configure Vite with `root: "web"`, `base: "./"`, `publicDir: "public"`, and `build.outDir: "../dist/browser"`. The built HTML, manifest, worker URL, and service-worker registration must work when the directory is mounted below an arbitrary origin path.
- `app.webmanifest` must contain stable `id: "./"`, `name`, `short_name`, `start_url: "."`, `scope: "."`, `display: "standalone"`, background/theme colors, and 192/512 icons.
- Build the application base as `new URL(import.meta.env.BASE_URL, location.href)`. Register `new URL("service-worker.js", appBase)` with `scope: appBase.pathname` only on secure contexts/localhost and report registration failure non-fatally. “Root” in this checkpoint means the deployed application root, never the whole origin root.
- Cache only same-origin GET app resources. Do not cache, persist, log, upload, or fetch the user-selected PDF.
- The production build must remain usable at a relative base path. The service worker must delete its own obsolete versioned caches and provide an app-shell navigation fallback after one successful online load.
- Add this CSP as an HTML `meta http-equiv="Content-Security-Policy"`: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`. Header-only directives are outside this static checkpoint. Do not add analytics, telemetry, a CDN, a backend endpoint, or external font/image requests.
- Selecting a PDF may read only its name, size, and MIME/type validation. Keep the `File` object in page memory; clear the input and reference on reset.

## Mobile-first Material Design 3 shell

The first useful viewport is 360 CSS pixels wide. Use a single column up to 599 px, add spacing at 600 px, and cap readable content near 760 px. Desktop is the widened form of the same flow.

The shell contains:

1. a compact top app bar with “FileShape” and a local-processing status chip;
2. a short title and explanation;
3. a file selection surface with a native visible file input/label accepting PDF;
4. selected-file name and byte size;
5. a collapsed advanced-settings section showing the already accepted CLI concepts without implying they are active yet;
6. a runtime status surface containing the PDF.js worker probe result, PWA/offline capability, and the exact remaining blockers;
7. a full-width primary “EPUBに変換” action that remains disabled with an adjacent explanation until the real conversion worker is connected.

Use Material 3-like color roles, surface hierarchy, rounded shapes, tonal emphasis, and type scale as CSS custom properties. Keep the screen quiet: no decorative hero, carousel, gradient spectacle, or animated progress. Controls need at least a 48 px interactive box, visible keyboard focus, semantic labels, strong contrast, and `aria-live` status text. Honor `prefers-reduced-motion`; motion is limited to short state transitions that are not required to understand status. Support light and dark system color schemes.

The UI must never say conversion is ready merely because the PDF.js probe passed. Runtime states are `checking`, `supported`, and `unsupported`; conversion availability is separately fixed to `unavailable` in this checkpoint.

## Verification and acceptance

Add meaningful tests and a deterministic verifier for:

1. conversion message validation, monotonic progress, unknown totals, request isolation, terminal-state enforcement, and transfer ownership documentation;
2. production browser typecheck and Vite build;
3. built HTML linking the manifest and local entry assets, valid manifest fields and real 192/512 PNG dimensions, service-worker registration, and relative-base compatibility;
4. no `node:` imports or Node global shims in the emitted JavaScript, no HTTP(S) runtime asset URLs, and no import of the accepted conversion/inspection cores from the browser entry graph;
5. semantic file input, disabled conversion action, live status region, 360 px single-column CSS, 48 px controls, visible focus, reduced-motion rule, and light/dark token sets;
6. the real PDF.js probe result in Playwright Chromium served from the production preview over localhost, including a real worker port, one page, expected fixture text, and no console/page errors;
7. an online load followed by an offline reload of the app shell after service-worker activation;
8. a network record showing no request containing the selected fixture bytes and no non-local runtime requests.

Required automated verification:

```text
npm test
npm run verify:runtime-deps
npm run verify:browser
npm run verify:epubcheck
git diff --check
```

`verify:browser` must fail if Chromium is unavailable or any item 2-8 fails. The same command runs locally and in CI; there is no static-only green acceptance path. The Playwright test itself is the reviewable evidence, while the final local and GitHub Actions results are recorded in this document after implementation. Private `local-samples/` are not required because this checkpoint does not invoke the FileShape conversion core or claim corpus parity.

## Out of scope and next checkpoint

- Browser EPUB conversion, result download, and operational cancellation/progress.
- Replacing the accepted Node SHA-256 or PNG zlib implementation.
- Packaging PDF.js CMaps, standard fonts, ICC, or WASM for corpus conversion.
- Maximum-file-size claims, performance claims, or private-corpus parity.
- Hosting, GitHub Pages publication, install-prompt promotion, Android packaging, TWA, WebView, or store submission.
- Manual Thorium/calibre acceptance.

The next design must use the Stage 28 real-browser evidence to replace or inject SHA-256 and PNG deflate without changing CLI semantics, package the required PDF.js resources, and connect one public-fixture conversion through the dedicated worker contract. Private-corpus verification becomes mandatory before CLI/browser parity or supported input limits are accepted.
