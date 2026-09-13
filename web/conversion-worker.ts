import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { webBinaryRuntime } from "./zlib-ng-binary-runtime.js";
import {
  BrowserContractError,
  BrowserConversionRequestRegistry,
  validateCancelMessage,
  validateStartMessage,
  type BrowserDiagnosticCode,
  type BrowserFailedEvent,
  type BrowserWorkerEvent,
} from "../src/browser-conversion-contract.js";
import {
  convertPdfBytesToEpubWithResources,
  type PdfConversionProgress,
} from "../src/pdf-to-epub-core.js";
import { browserPdfJsResourceConfig } from "./pdfjs-resource-config.js";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const registry = new BrowserConversionRequestRegistry();

class ConversionCancelledError extends Error {
  constructor() {
    super("conversion cancelled");
    this.name = "ConversionCancelledError";
  }
}

type ActiveRequest = {
  requestId: string;
  cancelled: boolean;
};

let active: ActiveRequest | undefined;
let pdfWorkerPort: Worker | undefined;

function safeRequestId(value: unknown): string {
  if (value && typeof value === "object" && "requestId" in value) {
    const candidate = (value as { requestId?: unknown }).requestId;
    if (typeof candidate === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(candidate)) return candidate;
  }
  return "invalid-request";
}

function post(event: BrowserWorkerEvent, transfer: Transferable[] = []): void {
  scope.postMessage(event, transfer);
}

function fail(requestId: string, code: BrowserDiagnosticCode, message: string): void {
  const event: BrowserFailedEvent = { kind: "failed", requestId, code, message };
  post(event);
}

function outputName(sourceName: string): string {
  const lastDot = sourceName.lastIndexOf(".");
  const stem = lastDot > 0 ? sourceName.slice(0, lastDot) : sourceName;
  return `${stem}.epub`;
}

function throwIfCancelled(request: ActiveRequest): void {
  if (request.cancelled) throw new ConversionCancelledError();
}

function setupPdfWorker(): void {
  const workerLocation = new URL(pdfWorkerUrl, scope.location.href);
  if (workerLocation.origin !== scope.location.origin) {
    throw new Error("PDF.js conversion worker escaped the application origin");
  }
  pdfWorkerPort = new Worker(workerLocation, { type: "module", name: "fileshape-pdfjs-conversion" });
  GlobalWorkerOptions.workerSrc = workerLocation.href;
  GlobalWorkerOptions.workerPort = pdfWorkerPort;
  if (GlobalWorkerOptions.workerPort !== pdfWorkerPort) {
    throw new Error("PDF.js did not retain the conversion worker port");
  }
}

function cleanupPdfWorker(): void {
  if (GlobalWorkerOptions.workerPort === pdfWorkerPort) GlobalWorkerOptions.workerPort = null;
  pdfWorkerPort?.terminate();
  pdfWorkerPort = undefined;
}

function progressEvent(requestId: string, progress: PdfConversionProgress): BrowserWorkerEvent {
  return {
    kind: "progress",
    requestId,
    phase: progress.phase,
    completedUnits: progress.completedUnits,
    ...(progress.totalUnits === undefined ? {} : { totalUnits: progress.totalUnits }),
  };
}

async function handleStart(value: unknown): Promise<void> {
  let start;
  try {
    start = validateStartMessage(value);
  } catch (error) {
    fail(
      safeRequestId(value),
      error instanceof BrowserContractError ? error.code : "invalid-request",
      error instanceof Error ? error.message : "invalid start message",
    );
    return;
  }

  const state = registry.begin(start.requestId);
  if (state !== "accepted") {
    fail(start.requestId, state, state === "worker-busy" ? "conversion worker is busy" : "requestId was already used");
    return;
  }

  const request: ActiveRequest = { requestId: start.requestId, cancelled: false };
  active = request;
  post({ kind: "accepted", requestId: start.requestId });

  try {
    setupPdfWorker();
    const source = new Uint8Array(start.buffer);
    const result = await convertPdfBytesToEpubWithResources(
      source,
      start.sourceName,
      start.options,
      browserPdfJsResourceConfig(),
      webBinaryRuntime,
      {
        throwIfCancelled: () => throwIfCancelled(request),
        onProgress: (progress) => {
          throwIfCancelled(request);
          post(progressEvent(start.requestId, progress));
        },
      },
    );

    // Give a queued cancel message one task turn before publishing success.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    throwIfCancelled(request);
    // Copy into a fresh ordinary ArrayBuffer. TypedArray.buffer is ArrayBufferLike
    // and can be SharedArrayBuffer; the browser contract deliberately transfers
    // only a detachable ArrayBuffer.
    const epub = Uint8Array.from(result.bytes).buffer;
    post({
      kind: "succeeded",
      requestId: start.requestId,
      epub,
      outputName: outputName(start.sourceName),
      byteLength: result.byteLength,
      pageCount: result.pageCount,
      unresolvedAnnotationCount: result.unresolvedAnnotationCount,
    }, [epub]);
  } catch (error) {
    if (error instanceof ConversionCancelledError || request.cancelled) {
      post({ kind: "cancelled", requestId: start.requestId });
    } else {
      const message = error instanceof Error ? error.message : String(error);
      const code: BrowserDiagnosticCode = /Worker|worker|Web Crypto|zlib-ng WASM|PDF\.js resource|origin/.test(message)
        ? "unsupported-runtime"
        : "unexpected-worker-failure";
      fail(start.requestId, code, message);
    }
  } finally {
    cleanupPdfWorker();
    active = undefined;
    registry.terminate(start.requestId);
    scope.close();
  }
}

function handleCancel(value: unknown): void {
  let cancel;
  try {
    cancel = validateCancelMessage(value);
  } catch (error) {
    fail(
      safeRequestId(value),
      error instanceof BrowserContractError ? error.code : "invalid-request",
      error instanceof Error ? error.message : "invalid cancel message",
    );
    return;
  }
  if (!active || active.requestId !== cancel.requestId) {
    fail(cancel.requestId, "invalid-request", "cancel request does not match the active conversion");
    return;
  }
  active.cancelled = true;
}

scope.addEventListener("message", (event: MessageEvent<unknown>) => {
  const value = event.data;
  if (value && typeof value === "object" && "kind" in value && (value as { kind?: unknown }).kind === "cancel") {
    handleCancel(value);
    return;
  }
  void handleStart(value);
});
