import assert from "node:assert/strict";
import test from "node:test";
import type { PdfToEpubOptions } from "../src/pdf-to-epub-core.js";
import {
  BrowserContractError,
  BrowserConversionEventTracker,
  BrowserConversionRequestRegistry,
  type BrowserConversionOptions,
  validateCancelMessage,
  validateStartMessage,
  validateWorkerEvent,
} from "../src/browser-conversion-contract.js";

const buffer = (): ArrayBuffer => new Uint8Array([37, 80, 68, 70]).buffer;
const start = (requestId = "request-1", options: BrowserConversionOptions = {}) => ({
  kind: "start" as const,
  requestId,
  sourceName: "sample.pdf",
  buffer: buffer(),
  options,
});

test("browser options remain assignable to the accepted CLI option shape", () => {
  const optionsForCore = (options: BrowserConversionOptions): PdfToEpubOptions => options;
  assert.deepEqual(optionsForCore({
    title: "Title",
    creator: "Creator",
    language: "ja",
    identifier: "id",
    modified: "2026-09-12T10:20:30Z",
    titlePrefix: "Prefix",
    rubyMode: "on",
    unresolvedRubyPolicy: "preserve-as-page-note",
    pageProgressionDirection: "rtl",
    coverOccurrence: { sourcePage: 1, operatorIndex: 0, occurrenceIndex: 0 },
  }).title, "Title");
});

test("canonical second-precision modified timestamps survive runtime validation", () => {
  const valid = validateStartMessage(start("modified", { modified: "2026-09-12T10:20:30Z" }));
  assert.equal(valid.options.modified, "2026-09-12T10:20:30Z");
});

test("start validation rejects unsafe labels, unknown options and invalid values", () => {
  assert.equal(validateStartMessage(start()).sourceName, "sample.pdf");
  assert.throws(() => validateStartMessage(start("bad/id")), BrowserContractError);
  assert.throws(() => validateStartMessage(start("request-1", { title: "   " })), BrowserContractError);
  assert.throws(() => validateStartMessage(start("request-1", { modified: "2026-02-31T10:20:30Z" })), BrowserContractError);
  assert.throws(() => validateStartMessage(start("request-1", { rubyMode: "maybe" as "on" })), BrowserContractError);
  assert.throws(() => validateStartMessage({ ...start(), options: { unknown: "value" } }), BrowserContractError);
  assert.throws(() => validateStartMessage({ ...start(), buffer: new ArrayBuffer(0) }), BrowserContractError);
});

test("cover occurrence validation is safe integer and closed shape", () => {
  const valid = validateStartMessage(start("cover", { coverOccurrence: { sourcePage: 1, operatorIndex: 0, occurrenceIndex: 2 } }));
  assert.equal(valid.options.coverOccurrence?.occurrenceIndex, 2);
  assert.throws(() => validateStartMessage(start("cover", { coverOccurrence: { sourcePage: 0, operatorIndex: 0, occurrenceIndex: 0 } })), BrowserContractError);
  assert.throws(() => validateStartMessage(start("cover", { coverOccurrence: { sourcePage: 1, operatorIndex: 0, occurrenceIndex: Number.MAX_SAFE_INTEGER + 1 } })), BrowserContractError);
});

test("tracker requires accepted, preserves unknown totals, and enforces monotonic progress", () => {
  const tracker = new BrowserConversionEventTracker("request-1");
  assert.throws(() => tracker.apply({ kind: "progress", requestId: "request-1", phase: "loading-pdf", completedUnits: 0 }), BrowserContractError);
  tracker.apply({ kind: "accepted", requestId: "request-1" });
  tracker.apply({ kind: "progress", requestId: "request-1", phase: "loading-pdf", completedUnits: 0 });
  tracker.apply({ kind: "progress", requestId: "request-1", phase: "inspecting-pages", completedUnits: 1, totalUnits: 2 });
  assert.throws(() => tracker.apply({ kind: "progress", requestId: "request-1", phase: "inspecting-pages", completedUnits: 0, totalUnits: 2 }), BrowserContractError);
  assert.throws(() => tracker.apply({ kind: "progress", requestId: "request-1", phase: "loading-pdf", completedUnits: 1, totalUnits: 2 }), BrowserContractError);
  assert.throws(() => tracker.apply({ kind: "progress", requestId: "request-1", phase: "building-document", completedUnits: 2, totalUnits: 3 }), BrowserContractError);
});

test("cancel prevents success and allows exactly one cancelled terminal event", () => {
  const tracker = new BrowserConversionEventTracker("cancel-me");
  tracker.apply({ kind: "accepted", requestId: "cancel-me" });
  tracker.requestCancel();
  assert.throws(() => tracker.apply({ kind: "succeeded", requestId: "cancel-me", epub: buffer(), outputName: "out.epub", byteLength: 4, pageCount: 1, unresolvedAnnotationCount: 0 }), BrowserContractError);
  tracker.apply({ kind: "cancelled", requestId: "cancel-me" });
  assert.throws(() => tracker.apply({ kind: "cancelled", requestId: "cancel-me" }), BrowserContractError);
});

test("request IDs isolate interleaved requests and single-use worker lifetime", () => {
  const registry = new BrowserConversionRequestRegistry();
  assert.equal(registry.begin("one"), "accepted");
  assert.equal(registry.begin("two"), "worker-busy");
  registry.terminate("one");
  assert.equal(registry.begin("one"), "request-id-reused");
  assert.equal(registry.begin("two"), "worker-busy");
  assert.throws(() => validateCancelMessage({ kind: "cancel", requestId: "bad/id" }), BrowserContractError);
  assert.throws(() => validateWorkerEvent({ kind: "accepted", requestId: "bad/id" }), BrowserContractError);
});
