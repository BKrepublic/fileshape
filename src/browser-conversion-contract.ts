/**
 * Browser worker protocol shared by the page and a future conversion worker.
 *
 * This module deliberately contains no DOM, Worker, Node, PDF.js, or
 * FileShape implementation imports. The start buffer is transferred with the
 * structured-clone transfer list; after postMessage the page must treat its
 * ArrayBuffer as detached and must not read it again.
 */

export type BrowserRubyMode = "on" | "off";
export type BrowserUnresolvedRubyPolicy = "error" | "preserve-as-page-note";
export type BrowserPageProgressionDirection = "ltr" | "rtl";

export type BrowserCoverOccurrence = {
  sourcePage: number;
  operatorIndex: number;
  occurrenceIndex: number;
};

/** Serializable mirror of the accepted public CLI options. */
export type BrowserConversionOptions = {
  title?: string;
  creator?: string;
  language?: string;
  identifier?: string;
  modified?: string;
  titlePrefix?: string;
  rubyMode?: BrowserRubyMode;
  unresolvedRubyPolicy?: BrowserUnresolvedRubyPolicy;
  pageProgressionDirection?: BrowserPageProgressionDirection;
  coverOccurrence?: BrowserCoverOccurrence;
};

export type BrowserStartMessage = {
  kind: "start";
  requestId: string;
  sourceName: string;
  buffer: ArrayBuffer;
  options: BrowserConversionOptions;
};

export type BrowserCancelMessage = {
  kind: "cancel";
  requestId: string;
};

export type BrowserMainMessage = BrowserStartMessage | BrowserCancelMessage;

export type BrowserProgressPhase =
  | "loading-pdf"
  | "inspecting-pages"
  | "building-document"
  | "serializing-epub";

export type BrowserDiagnosticCode =
  | "unsupported-runtime"
  | "invalid-request"
  | "request-id-reused"
  | "worker-busy"
  | "conversion-unavailable"
  | "unexpected-worker-failure";

export type BrowserAcceptedEvent = {
  kind: "accepted";
  requestId: string;
};

export type BrowserProgressEvent = {
  kind: "progress";
  requestId: string;
  phase: BrowserProgressPhase;
  completedUnits: number;
  totalUnits?: number;
};

export type BrowserSucceededEvent = {
  kind: "succeeded";
  requestId: string;
  epub: ArrayBuffer;
  outputName: string;
  byteLength: number;
  pageCount: number;
  unresolvedAnnotationCount: number;
};

export type BrowserCancelledEvent = {
  kind: "cancelled";
  requestId: string;
};

export type BrowserFailedEvent = {
  kind: "failed";
  requestId: string;
  code: BrowserDiagnosticCode;
  message: string;
};

export type BrowserWorkerEvent =
  | BrowserAcceptedEvent
  | BrowserProgressEvent
  | BrowserSucceededEvent
  | BrowserCancelledEvent
  | BrowserFailedEvent;

export class BrowserContractError extends Error {
  readonly code: "invalid-request" | "request-id-reused" | "worker-busy";

  constructor(message: string, code: BrowserContractError["code"] = "invalid-request") {
    super(message);
    this.name = "BrowserContractError";
    this.code = code;
  }
}

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const optionKeys = new Set([
  "title",
  "creator",
  "language",
  "identifier",
  "modified",
  "titlePrefix",
  "rubyMode",
  "unresolvedRubyPolicy",
  "pageProgressionDirection",
  "coverOccurrence",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new BrowserContractError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function own(recordValue: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(recordValue, key);
}

function requestId(value: unknown): string {
  if (typeof value !== "string" || !requestIdPattern.test(value)) {
    throw new BrowserContractError("requestId is invalid");
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BrowserContractError(`${label} must be a non-empty string`);
  }
  return value;
}

function optionalString(
  source: Record<string, unknown>,
  key: keyof BrowserConversionOptions,
  requiredBySerializer: boolean,
): string | undefined {
  if (!own(source, key)) return undefined;
  const value = source[key];
  return requiredBySerializer
    ? nonEmptyString(value, key)
    : typeof value === "string"
      ? value
      : (() => { throw new BrowserContractError(`${key} must be a string`); })();
}

function validModified(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) {
    throw new BrowserContractError("modified must be an EPUB UTC timestamp");
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new BrowserContractError("modified must be a valid UTC timestamp");
  }
  return value;
}

function safeInteger(value: unknown, label: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new BrowserContractError(`${label} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

function options(value: unknown): BrowserConversionOptions {
  const source = record(value, "options");
  for (const key of Object.keys(source)) {
    if (!optionKeys.has(key)) throw new BrowserContractError(`unknown option: ${key}`);
    if (source[key] === undefined) throw new BrowserContractError(`${key} must not be undefined`);
  }

  const result: BrowserConversionOptions = {};
  const title = optionalString(source, "title", true);
  const creator = optionalString(source, "creator", true);
  const language = optionalString(source, "language", true);
  const identifier = optionalString(source, "identifier", true);
  const titlePrefix = optionalString(source, "titlePrefix", true);
  if (title !== undefined) result.title = title;
  if (creator !== undefined) result.creator = creator;
  if (language !== undefined) result.language = language;
  if (identifier !== undefined) result.identifier = identifier;
  if (titlePrefix !== undefined) result.titlePrefix = titlePrefix;

  if (own(source, "modified")) result.modified = validModified(nonEmptyString(source.modified, "modified"));
  if (own(source, "rubyMode")) {
    if (source.rubyMode !== "on" && source.rubyMode !== "off") throw new BrowserContractError("rubyMode is invalid");
    result.rubyMode = source.rubyMode;
  }
  if (own(source, "unresolvedRubyPolicy")) {
    if (source.unresolvedRubyPolicy !== "error" && source.unresolvedRubyPolicy !== "preserve-as-page-note") {
      throw new BrowserContractError("unresolvedRubyPolicy is invalid");
    }
    result.unresolvedRubyPolicy = source.unresolvedRubyPolicy;
  }
  if (own(source, "pageProgressionDirection")) {
    if (source.pageProgressionDirection !== "ltr" && source.pageProgressionDirection !== "rtl") {
      throw new BrowserContractError("pageProgressionDirection is invalid");
    }
    result.pageProgressionDirection = source.pageProgressionDirection;
  }
  if (own(source, "coverOccurrence")) {
    const cover = record(source.coverOccurrence, "coverOccurrence");
    if (Object.keys(cover).some((key) => !["sourcePage", "operatorIndex", "occurrenceIndex"].includes(key))) {
      throw new BrowserContractError("coverOccurrence contains an unknown key");
    }
    result.coverOccurrence = {
      sourcePage: safeInteger(cover.sourcePage, "sourcePage", 1),
      operatorIndex: safeInteger(cover.operatorIndex, "operatorIndex", 0),
      occurrenceIndex: safeInteger(cover.occurrenceIndex, "occurrenceIndex", 0),
    };
  }
  return result;
}

function sourceName(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 255 || /[\\/\0]/.test(value)) {
    throw new BrowserContractError("sourceName must be 1-255 UTF-16 code units without path separators or NUL");
  }
  return value;
}

export function validateStartMessage(value: unknown): BrowserStartMessage {
  const source = record(value, "start message");
  if (source.kind !== "start") throw new BrowserContractError("message kind must be start");
  if (Object.keys(source).some((key) => !["kind", "requestId", "sourceName", "buffer", "options"].includes(key))) {
    throw new BrowserContractError("start message contains an unknown key");
  }
  if (!(source.buffer instanceof ArrayBuffer) || source.buffer.byteLength === 0) {
    throw new BrowserContractError("start buffer must be a non-empty ArrayBuffer");
  }
  return {
    kind: "start",
    requestId: requestId(source.requestId),
    sourceName: sourceName(source.sourceName),
    buffer: source.buffer,
    options: options(source.options),
  };
}

export function validateCancelMessage(value: unknown): BrowserCancelMessage {
  const source = record(value, "cancel message");
  if (source.kind !== "cancel") throw new BrowserContractError("message kind must be cancel");
  if (Object.keys(source).some((key) => !["kind", "requestId"].includes(key))) {
    throw new BrowserContractError("cancel message contains an unknown key");
  }
  return { kind: "cancel", requestId: requestId(source.requestId) };
}

function progressPhase(value: unknown): BrowserProgressPhase {
  if (value === "loading-pdf" || value === "inspecting-pages" || value === "building-document" || value === "serializing-epub") return value;
  throw new BrowserContractError("progress phase is invalid");
}

export function validateWorkerEvent(value: unknown): BrowserWorkerEvent {
  const source = record(value, "worker event");
  const kind = source.kind;
  const id = requestId(source.requestId);
  if (kind === "accepted" || kind === "cancelled") {
    if (Object.keys(source).length !== 2) throw new BrowserContractError(`${kind} event contains unknown keys`);
    return kind === "accepted" ? { kind, requestId: id } : { kind, requestId: id };
  }
  if (kind === "progress") {
    const completedUnits = safeInteger(source.completedUnits, "completedUnits", 0);
    const totalUnits = source.totalUnits === undefined ? undefined : safeInteger(source.totalUnits, "totalUnits", 0);
    if (totalUnits !== undefined && completedUnits > totalUnits) throw new BrowserContractError("completedUnits exceeds totalUnits");
    if (Object.keys(source).some((key) => !["kind", "requestId", "phase", "completedUnits", "totalUnits"].includes(key))) {
      throw new BrowserContractError("progress event contains unknown keys");
    }
    return {
      kind,
      requestId: id,
      phase: progressPhase(source.phase),
      completedUnits,
      ...(totalUnits === undefined ? {} : { totalUnits }),
    };
  }
  if (kind === "succeeded") {
    if (!(source.epub instanceof ArrayBuffer) || source.epub.byteLength === 0) throw new BrowserContractError("succeeded epub must be a non-empty ArrayBuffer");
    const byteLength = safeInteger(source.byteLength, "byteLength", 1);
    if (byteLength !== source.epub.byteLength) throw new BrowserContractError("succeeded byteLength does not match epub");
    return {
      kind,
      requestId: id,
      epub: source.epub,
      outputName: nonEmptyString(source.outputName, "outputName"),
      byteLength,
      pageCount: safeInteger(source.pageCount, "pageCount", 1),
      unresolvedAnnotationCount: safeInteger(source.unresolvedAnnotationCount, "unresolvedAnnotationCount", 0),
    };
  }
  if (kind === "failed") {
    const codes: BrowserDiagnosticCode[] = ["unsupported-runtime", "invalid-request", "request-id-reused", "worker-busy", "conversion-unavailable", "unexpected-worker-failure"];
    if (!codes.includes(source.code as BrowserDiagnosticCode)) throw new BrowserContractError("diagnostic code is invalid");
    return { kind, requestId: id, code: source.code as BrowserDiagnosticCode, message: nonEmptyString(source.message, "message") };
  }
  throw new BrowserContractError("worker event kind is invalid");
}

export class BrowserConversionEventTracker {
  private accepted = false;
  private terminal = false;
  private cancelling = false;
  private lastCompleted = 0;
  private phase?: BrowserProgressPhase;
  private totalUnits?: number;

  constructor(readonly requestId: string) {
    requestIdValue(requestId);
  }

  requestCancel(): void {
    if (!this.accepted || this.terminal) return;
    this.cancelling = true;
  }

  apply(value: unknown): BrowserWorkerEvent {
    const event = validateWorkerEvent(value);
    if (event.requestId !== this.requestId) throw new BrowserContractError("event requestId does not match tracker");
    if (this.terminal) throw new BrowserContractError("terminal event cannot be followed by another event");
    if (event.kind === "accepted") {
      if (this.accepted) throw new BrowserContractError("accepted must occur exactly once");
      this.accepted = true;
      return event;
    }
    if (!this.accepted) throw new BrowserContractError("event received before accepted");
    if (this.cancelling && event.kind !== "cancelled") throw new BrowserContractError("cancelling request cannot emit progress or success");
    if (event.kind === "progress") {
      if (event.completedUnits < this.lastCompleted) throw new BrowserContractError("progress completedUnits must be monotonic");
      if (this.totalUnits !== undefined && event.totalUnits !== this.totalUnits) throw new BrowserContractError("progress totalUnits changed");
      if (this.totalUnits === undefined && event.totalUnits !== undefined) this.totalUnits = event.totalUnits;
      const phaseOrder: Record<BrowserProgressPhase, number> = {
        "loading-pdf": 0,
        "inspecting-pages": 1,
        "building-document": 2,
        "serializing-epub": 3,
      };
      if (this.phase !== undefined && phaseOrder[event.phase] < phaseOrder[this.phase]) {
        throw new BrowserContractError("progress phase regressed");
      }
      this.phase = event.phase;
      this.lastCompleted = event.completedUnits;
      return event;
    }
    this.terminal = true;
    if (this.cancelling && event.kind !== "cancelled") throw new BrowserContractError("cancelled request must terminate with cancelled");
    return event;
  }
}

function requestIdValue(value: string): void {
  if (!requestIdPattern.test(value)) throw new BrowserContractError("requestId is invalid");
}

export class BrowserConversionRequestRegistry {
  private readonly recorded = new Set<string>();
  private active: string | undefined;
  private terminated = false;

  begin(requestIdValueInput: string): "accepted" | "request-id-reused" | "worker-busy" {
    requestIdValue(requestIdValueInput);
    if (this.recorded.has(requestIdValueInput)) return "request-id-reused";
    if (this.active !== undefined || this.terminated) return "worker-busy";
    this.recorded.add(requestIdValueInput);
    this.active = requestIdValueInput;
    return "accepted";
  }

  terminate(requestIdValueInput: string): void {
    if (this.active !== requestIdValueInput) throw new BrowserContractError("request is not active");
    this.active = undefined;
    this.terminated = true;
  }
}
